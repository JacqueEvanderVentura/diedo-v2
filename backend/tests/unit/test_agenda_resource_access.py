from unittest.mock import MagicMock
from uuid import uuid7

from app.services.agenda import AgendaService


def _acl_row(resource_id, user_id, access):
    row = MagicMock()
    row.resource_id = resource_id
    row.platform_user_id = user_id
    row.access = access
    return row


def test_resource_access_defaults_to_edit_without_acl_rows() -> None:
    assert (
        AgendaService._resource_access(
            resource_id=uuid7(),
            platform_user_id=uuid7(),
            acl_by_resource={},
        )
        == "edit"
    )


def test_resource_access_honors_acl_entry() -> None:
    resource_id = uuid7()
    user_id = uuid7()
    assert (
        AgendaService._resource_access(
            resource_id=resource_id,
            platform_user_id=user_id,
            acl_by_resource={resource_id: {user_id: "view"}},
        )
        == "view"
    )


def test_user_with_one_grant_loses_ungranted_cabins() -> None:
    granted = uuid7()
    open_cabin = uuid7()
    user_id = uuid7()
    acl = {granted: {user_id: "use"}}
    assert (
        AgendaService._resource_access(
            resource_id=granted, platform_user_id=user_id, acl_by_resource=acl
        )
        == "use"
    )
    assert (
        AgendaService._resource_access(
            resource_id=open_cabin, platform_user_id=user_id, acl_by_resource=acl
        )
        is None
    )


def test_user_without_grants_keeps_full_access_when_others_are_restricted() -> None:
    restricted = uuid7()
    assert (
        AgendaService._resource_access(
            resource_id=restricted,
            platform_user_id=uuid7(),
            acl_by_resource={restricted: {uuid7(): "edit"}},
        )
        == "edit"
    )


def test_filter_listed_resources_hides_ungranted_cabins() -> None:
    service = AgendaService(MagicMock())
    granted = MagicMock()
    granted.id = uuid7()
    hidden = MagicMock()
    hidden.id = uuid7()
    user_id = uuid7()
    repository = MagicMock()
    repository.acl_rows_for_branch.return_value = (_acl_row(granted.id, user_id, "view"),)
    service._repository = repository
    listed = service._filter_listed_resources(
        workspace_id=uuid7(),
        branch_id=uuid7(),
        platform_user_id=user_id,
        resources=(granted, hidden),
    )
    assert [(item.resource.id, item.access) for item in listed] == [(granted.id, "view")]


def test_resource_visible_allows_cabinless_appointments() -> None:
    service = AgendaService(MagicMock())
    repository = MagicMock()
    service._repository = repository
    assert service._resource_visible(
        workspace_id=uuid7(),
        branch_id=uuid7(),
        resource_id=None,
        platform_user_id=uuid7(),
    )
    repository.acl_rows_for_branch.assert_not_called()


def test_visible_resource_ids_loads_acl_once_per_branch() -> None:
    service = AgendaService(MagicMock())
    branch_id = uuid7()
    user_id = uuid7()
    first = MagicMock()
    first.id = uuid7()
    first.branch_id = branch_id
    second = MagicMock()
    second.id = uuid7()
    second.branch_id = branch_id
    repository = MagicMock()
    repository.list_resources_in_branches.return_value = (first, second)
    repository.acl_rows_for_branch.return_value = (_acl_row(second.id, user_id, "edit"),)
    service._repository = repository
    visible = service._visible_resource_ids(
        workspace_id=uuid7(),
        branch_id=branch_id,
        allowed_branch_ids=None,
        platform_user_id=user_id,
    )
    assert visible == frozenset({second.id})
    repository.acl_rows_for_branch.assert_called_once()


def test_bookable_listed_resources_requires_use_or_edit() -> None:
    service = AgendaService(MagicMock())
    user_id = uuid7()
    usable = MagicMock()
    usable.id = uuid7()
    usable.sort_order = 0
    usable.name = "A"
    view_only = MagicMock()
    view_only.id = uuid7()
    repository = MagicMock()
    repository.list_resources.return_value = (usable, view_only)
    repository.acl_rows_for_branch.return_value = (
        _acl_row(usable.id, user_id, "use"),
        _acl_row(view_only.id, user_id, "view"),
    )
    service._repository = repository
    bookable = service._bookable_listed_resources(
        workspace_id=uuid7(),
        branch_id=uuid7(),
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
