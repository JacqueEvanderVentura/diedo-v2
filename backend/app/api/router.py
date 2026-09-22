from fastapi import APIRouter

from app.api.routers import (
    administration,
    agenda,
    auth,
    backoffice,
    catalog,
    chat,
    chat_channel_accounts,
    crm,
    dashboard,
    document_attachments,
    finance,
    health,
    hr,
    incidents,
    inventory,
    lookups,
    master_data,
    meta_webhooks,
    permissions,
    pos,
    public_booking,
    purchasing,
    reports,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(meta_webhooks.router)
api_router.include_router(auth.router)
api_router.include_router(backoffice.router)
api_router.include_router(administration.router)
api_router.include_router(agenda.router)
api_router.include_router(public_booking.router)
api_router.include_router(catalog.router)
api_router.include_router(crm.router)
api_router.include_router(chat.router)
api_router.include_router(chat_channel_accounts.router)
api_router.include_router(chat_channel_accounts.oauth_router)
api_router.include_router(dashboard.router)
api_router.include_router(finance.router)
api_router.include_router(document_attachments.router)
api_router.include_router(master_data.customers_router)
api_router.include_router(master_data.employees_router)
api_router.include_router(hr.router)
api_router.include_router(incidents.router)
api_router.include_router(inventory.router)
api_router.include_router(pos.router)
api_router.include_router(purchasing.router)
api_router.include_router(reports.router)
api_router.include_router(users.router)
api_router.include_router(lookups.router)
api_router.include_router(permissions.roles_router)
api_router.include_router(permissions.permissions_router)
