from datetime import UTC, datetime, timedelta
from uuid import uuid7

import jwt
import pytest
from app.config import settings
from app.core.security import (
    AccessTokenError,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    hash_password,
    hash_refresh_token,
    normalize_email,
    refresh_token_matches,
    refresh_token_session_id,
    verify_password,
)
from app.schemas.auth import LoginRequest
from app.schemas.permissions import (
    ReplaceRolePermissionsBatchRequest,
    ReplaceRolePermissionsRequest,
)
from app.schemas.users import CreateUserRequest
from fastapi.testclient import TestClient
from pydantic import ValidationError


def test_password_hashing_and_email_normalization() -> None:
    encoded = hash_password("a-long-test-password")

    assert encoded != "a-long-test-password"
    assert verify_password("a-long-test-password", encoded) is True
    assert verify_password("wrong-password", encoded) is False
    assert verify_password("anything", None) is False
    assert normalize_email("  USER@Example.COM ") == "user@example.com"


def test_access_token_round_trip_and_rejects_expired_or_wrong_claims() -> None:
    user_id = uuid7()
    workspace_id = uuid7()
    membership_id = uuid7()
    session_id = uuid7()
    token, expires_in = create_access_token(
        platform_user_id=user_id,
        workspace_id=workspace_id,
        membership_id=membership_id,
        session_id=session_id,
    )

    claims = decode_access_token(token)
    assert claims.sub == user_id
    assert claims.wid == workspace_id
    assert claims.mid == membership_id
    assert claims.sid == session_id
    assert expires_in == settings.access_token_minutes * 60

    expired, _ = create_access_token(
        platform_user_id=user_id,
        workspace_id=workspace_id,
        membership_id=membership_id,
        session_id=session_id,
        now=datetime.now(UTC) - timedelta(hours=2),
    )
    with pytest.raises(AccessTokenError):
        decode_access_token(expired)

    wrong_type = jwt.encode(
        {
            "sub": str(user_id),
            "wid": str(workspace_id),
            "mid": str(membership_id),
            "sid": str(session_id),
            "jti": str(uuid7()),
            "typ": "refresh",
            "iss": settings.jwt_issuer,
            "aud": settings.jwt_audience,
            "iat": datetime.now(UTC),
            "nbf": datetime.now(UTC),
            "exp": datetime.now(UTC) + timedelta(minutes=5),
        },
        settings.jwt_secret_key.get_secret_value(),
        algorithm="HS256",
    )
    with pytest.raises(AccessTokenError):
        decode_access_token(wrong_type)


def test_refresh_tokens_are_opaque_hashed_and_strictly_parsed() -> None:
    session_id = uuid7()
    token = create_refresh_token(session_id)
    hashed = hash_refresh_token(token)

    assert refresh_token_session_id(token) == session_id
    assert len(hashed) == 64
    assert refresh_token_matches(token, hashed) is True
    assert refresh_token_matches(f"{session_id}.{'x' * 48}", hashed) is False
    with pytest.raises(AccessTokenError):
        refresh_token_session_id("invalid")


def test_iam_schemas_normalize_and_reject_ambiguous_collections() -> None:
    role_id = uuid7()
    branch_id = uuid7()
    login = LoginRequest.model_validate(
        {
            "email": "user@example.com",
            "password": "valid-password",
        }
    )
    assert str(login.email) == "user@example.com"
    with pytest.raises(ValidationError):
        LoginRequest.model_validate(
            {
                "email": "user@example.com",
                "password": "valid-password",
                "workspaceSlug": "my-workspace",
            }
        )

    created = CreateUserRequest.model_validate(
        {
            "displayName": "  Pablo   Lara  ",
            "email": "pablo@example.com",
            "password": "long-password-not-secret",
            "roleAssignments": [{"roleId": role_id, "scopeType": "branch", "branchId": branch_id}],
        }
    )
    assert created.display_name == "Pablo Lara"

    with pytest.raises(ValidationError):
        CreateUserRequest.model_validate(
            {
                "displayName": "Pablo Lara",
                "email": "pablo@example.com",
                "password": "long-password-not-secret",
                "roleAssignments": [
                    {"roleId": role_id, "scopeType": "branch", "branchId": branch_id},
                    {"roleId": role_id, "scopeType": "branch", "branchId": branch_id},
                ],
            }
        )
    with pytest.raises(ValidationError):
        CreateUserRequest.model_validate(
            {
                "displayName": "Pablo Lara",
                "email": "pablo@example.com",
                "password": "long-password-not-secret",
                "roleAssignments": [
                    {
                        "roleId": role_id,
                        "scopeType": "workspace",
                        "branchId": branch_id,
                    }
                ],
            }
        )
    with pytest.raises(ValidationError):
        CreateUserRequest.model_validate(
            {
                "displayName": "Pablo Lara",
                "email": "pablo@example.com",
                "password": "long-password-not-secret",
                "roleAssignments": [{"roleId": role_id, "scopeType": "legalEntity"}],
            }
        )
    with pytest.raises(ValidationError):
        ReplaceRolePermissionsRequest(permission_ids=[role_id, role_id], version=1)
    with pytest.raises(ValidationError):
        ReplaceRolePermissionsBatchRequest.model_validate(
            {
                "roles": [
                    {"roleId": role_id, "permissionIds": [], "version": 1},
                    {"roleId": role_id, "permissionIds": [], "version": 1},
                ]
            }
        )


def test_openapi_marks_only_protected_iam_routes_as_bearer(app_client: TestClient) -> None:
    schema = app_client.app.openapi()

    assert schema["components"]["securitySchemes"]["BearerAuth"]["scheme"] == "bearer"
    assert "security" not in schema["paths"]["/api/v1/auth/login"]["post"]
    login_schema = schema["components"]["schemas"]["LoginRequest"]
    assert set(login_schema["properties"]) == {"email", "password"}
    assert schema["paths"]["/api/v1/auth/me"]["get"]["security"] == [{"BearerAuth": []}]
    assert schema["paths"]["/api/v1/users"]["get"]["security"] == [{"BearerAuth": []}]
    assert schema["paths"]["/api/v1/roles/summary"]["get"]["security"] == [{"BearerAuth": []}]
    assert schema["paths"]["/api/v1/lookups/roles"]["get"]["security"] == [{"BearerAuth": []}]
    assert schema["paths"]["/api/v1/lookups/branches"]["get"]["security"] == [{"BearerAuth": []}]

    health = app_client.get("/health")
    assert health.headers["x-content-type-options"] == "nosniff"
    assert health.headers["x-frame-options"] == "DENY"
    assert health.headers["referrer-policy"] == "no-referrer"
