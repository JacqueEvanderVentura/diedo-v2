import io
import os
import secrets
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid7

import pytest
from app.config import settings
from app.core.security import hash_password, verify_password
from app.db.models import AuditEntry, PlatformUser, WorkspaceMembership
from app.db.session import session_scope
from app.schemas.platform_operators import CreatePlatformOperatorInput
from app.scripts import create_platform_operator as cli
from app.services.errors import ConflictError
from app.services.platform_operators import create_platform_operator
from pydantic import SecretStr
from sqlalchemy import func, select


def operator_input():
    return CreatePlatformOperatorInput(
        email=f"operator-{uuid7().hex}@example.com",
        display_name="Production Operator",
        password=SecretStr("Operator!" + secrets.token_hex(20)),
    )


@pytest.mark.integration
def test_operator_can_login_and_use_backoffice_without_demo_roles(client):
    data = operator_input()
    with session_scope() as session:
        created = create_platform_operator(session, data)
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": str(data.email),
            "password": data.password.get_secret_value(),
        },
    )
    assert login.status_code == 200, login.text
    headers = {"Authorization": f"Bearer {login.json()['accessToken']}"}
    me = client.get("/api/v1/auth/me", headers=headers)
    assert me.status_code == 200, me.text
    assert me.json()["isPlatformOperator"] is True
    assert me.json()["workspaceId"] == str(created.workspace_id)
    assert client.get("/api/v1/backoffice/overview", headers=headers).status_code == 200
    history = client.get(
        "/api/v1/backoffice/audit",
        headers=headers,
        params={
            "action": "platform_operator.create",
            "targetId": str(created.user_id),
        },
    )
    assert history.status_code == 200
    assert history.json()["totalItems"] == 1
    assert history.json()["items"][0]["actorType"] == "administrative_cli"
    assert client.get("/api/v1/customers", headers=headers).status_code == 403
    assert client.post("/api/v1/auth/refresh").status_code == 200
    with session_scope() as session:
        membership = session.scalar(
            select(WorkspaceMembership).where(
                WorkspaceMembership.platform_user_id == created.user_id,
            )
        )
        assert membership.is_default and membership.status == "active"
        audit = session.scalar(
            select(AuditEntry).where(
                AuditEntry.action == "platform_operator.create",
                AuditEntry.target_id == created.user_id,
            )
        )
        assert audit.actor_platform_user_id is None
        assert audit.details["actorType"] == "administrative_cli"
        assert data.password.get_secret_value() not in str(audit.details)


@pytest.mark.integration
def test_retry_and_concurrent_creation_preserve_credentials():
    data = operator_input()

    def create():
        with session_scope() as session:
            return create_platform_operator(session, data)

    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: create(), range(2)))
    assert sorted(result.created for result in results) == [False, True]
    assert results[0].user_id == results[1].user_id
    changed = data.model_copy(update={"password": SecretStr("Changed!" + secrets.token_hex(20))})
    with session_scope() as session:
        assert create_platform_operator(session, changed).created is False
        user = session.get(PlatformUser, results[0].user_id)
        assert verify_password(data.password.get_secret_value(), user.password_hash)
        assert not verify_password(changed.password.get_secret_value(), user.password_hash)
        count = session.scalar(
            select(func.count())
            .select_from(AuditEntry)
            .where(
                AuditEntry.action == "platform_operator.create",
                AuditEntry.target_id == user.id,
            )
        )
        assert count == 1


@pytest.mark.integration
def test_customer_cannot_be_promoted_and_disabled_operator_cannot_be_reactivated():
    data = operator_input()
    with session_scope() as session:
        user = PlatformUser(
            external_subject=f"test:{uuid7()}",
            email=str(data.email),
            normalized_email=str(data.email),
            display_name="Customer",
            password_hash=hash_password(data.password.get_secret_value()),
            status="active",
            is_platform_operator=False,
        )
        session.add(user)
        session.flush()
        user_id = user.id
    with pytest.raises(ConflictError, match="cliente"):
        with session_scope() as session:
            create_platform_operator(session, data)
    with session_scope() as session:
        assert session.get(PlatformUser, user_id).is_platform_operator is False
        operator = create_platform_operator(session, operator_input())
    with session_scope() as session:
        user = session.get(PlatformUser, operator.user_id)
        user.status = "disabled"
    with pytest.raises(ConflictError, match="recuperación"):
        with session_scope() as session:
            create_platform_operator(session, data.model_copy(update={"email": operator.email}))


@pytest.mark.integration
def test_cli_works_in_production_mode_against_configured_test_database():
    data = operator_input()
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "app.scripts.create_platform_operator",
            "--email",
            str(data.email),
            "--name",
            data.display_name,
            "--password-stdin",
        ],
        input=data.password.get_secret_value() + "\n",
        text=True,
        capture_output=True,
        timeout=30,
        env={
            **os.environ,
            "APP_ENV": "production",
            "DATABASE_URL": settings.database_url,
            "JWT_SECRET_KEY": secrets.token_urlsafe(48),
        },
    )
    assert result.returncode == 0, result.stderr
    assert "Operador creado" in result.stdout
    assert "production" in result.stdout
    assert data.password.get_secret_value() not in result.stdout + result.stderr


def test_cli_password_confirmation_and_validation_do_not_write(monkeypatch, capsys):
    def forbidden():
        raise AssertionError("Invalid input must not open a database transaction")

    monkeypatch.setattr(cli, "session_scope", forbidden)
    values = iter(["Mismatch!" + secrets.token_hex(8), "Different!" + secrets.token_hex(8)])
    monkeypatch.setattr(cli.getpass, "getpass", lambda _: next(values))
    assert cli.main(["--email", "operator@example.com", "--name", "Operator"]) == 1
    assert "no coinciden" in capsys.readouterr().err
    invalid = secrets.token_hex(6)
    monkeypatch.setattr(cli.sys, "stdin", io.StringIO(invalid + "\n"))
    assert (
        cli.main(["--email", "operator@example.com", "--name", "Operator", "--password-stdin"]) == 1
    )
    captured = capsys.readouterr()
    assert "Datos inválidos" in captured.err
    assert invalid not in captured.err + captured.out
