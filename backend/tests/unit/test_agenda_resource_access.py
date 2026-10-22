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
        == "edit"
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


def test_filter_listed_resources_hides_restricted_cabins() -> None:
    service = AgendaService(MagicMock())
    resource = MagicMock()
    resource.id = uuid7()
    branch_id = uuid7()
    workspace_id = uuid7()
    user_id = uuid7()
    repository = MagicMock()
    repository.resource_ids_with_acl_rows.return_value = frozenset({resource.id})
    repository.acl_rows_for_branch.return_value = ()
    service._repository = repository
    listed = service._filter_listed_resources(
        workspace_id=workspace_id,
        branch_id=branch_id,
        platform_user_id=user_id,
        resources=(resource,),
    )
    assert listed == ()


def test_bookable_listed_resources_requires_use_or_edit() -> None:
    service = AgendaService(MagicMock())
    branch_id = uuid7()
    workspace_id = uuid7()
    user_id = uuid7()
    usable = MagicMock()
    usable.id = uuid7()
    usable.sort_order = 0
    usable.name = "A"
    view_only = MagicMock()
    view_only.id = uuid7()
    repository = MagicMock()
    repository.list_resources.return_value = (usable, view_only)
    repository.resource_ids_with_acl_rows.return_value = frozenset({usable.id, view_only.id})
    repository.acl_rows_for_branch.return_value = ()
    service._repository = repository

    def access_side_effect(**kwargs):
        if kwargs["resource_id"] == usable.id:
            return "use"
        if kwargs["resource_id"] == view_only.id:
            return "view"
        return None

    service._resource_access = MagicMock(side_effect=access_side_effect)
    bookable = service._bookable_listed_resources(
        workspace_id=workspace_id,
        branch_id=branch_id,
        platform_user_id=user_id,
    )
    assert len(bookable) == 1
    assert bookable[0].resource.id == usable.id


def test_branch_opening_schedule_returns_none_when_empty() -> None:
    service = AgendaService(MagicMock())
    repository = MagicMock()
    repository.list_opening_hours.return_value = ()
    service._repository = repository
    assert service.branch_opening_schedule(uuid7(), uuid7()) is None
