from unittest.mock import MagicMock
from uuid import uuid7

from app.services.agenda import AgendaService


def test_resource_access_defaults_to_use_without_acl_rows() -> None:
    service = AgendaService(MagicMock())
    resource_id = uuid7()
    assert (
        service._resource_access(
            workspace_id=uuid7(),
            branch_id=uuid7(),
            resource_id=resource_id,
            platform_user_id=uuid7(),
            resources_with_acl=frozenset(),
            acl_by_resource={},
        )
        == "use"
    )


def test_resource_access_honors_acl_entry() -> None:
    service = AgendaService(MagicMock())
    resource_id = uuid7()
    user_id = uuid7()
    assert (
        service._resource_access(
            workspace_id=uuid7(),
            branch_id=uuid7(),
            resource_id=resource_id,
            platform_user_id=user_id,
            resources_with_acl=frozenset({resource_id}),
            acl_by_resource={resource_id: {user_id: "view"}},
        )
        == "view"
    )


def test_filter_listed_resources_bypass_grants_use() -> None:
    service = AgendaService(MagicMock())
    resource = MagicMock()
    resource.id = uuid7()
    listed = service._filter_listed_resources(
        workspace_id=uuid7(),
        branch_id=uuid7(),
        platform_user_id=uuid7(),
        resources=(resource,),
        bypass_resource_acl=True,
    )
    assert len(listed) == 1
    assert listed[0].access == "use"


def test_branch_opening_schedule_returns_none_when_empty() -> None:
    service = AgendaService(MagicMock())
    repository = MagicMock()
    repository.list_opening_hours.return_value = ()
    service._repository = repository
    assert service.branch_opening_schedule(uuid7(), uuid7()) is None
