from fastapi import APIRouter

from app.api.routers import (
    administration,
    agenda,
    auth,
    catalog,
    dashboard,
    health,
    hr,
    incidents,
    inventory,
    lookups,
    master_data,
    permissions,
    pos,
    purchasing,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(administration.router)
api_router.include_router(agenda.router)
api_router.include_router(catalog.router)
api_router.include_router(dashboard.router)
api_router.include_router(master_data.customers_router)
api_router.include_router(master_data.employees_router)
api_router.include_router(hr.router)
api_router.include_router(incidents.router)
api_router.include_router(inventory.router)
api_router.include_router(pos.router)
api_router.include_router(purchasing.router)
api_router.include_router(users.router)
api_router.include_router(lookups.router)
api_router.include_router(permissions.roles_router)
api_router.include_router(permissions.permissions_router)
