from fastapi import APIRouter

from app.api.routers import (
    administration,
    auth,
    catalog,
    health,
    lookups,
    master_data,
    permissions,
    users,
)

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(administration.router)
api_router.include_router(catalog.router)
api_router.include_router(master_data.customers_router)
api_router.include_router(master_data.employees_router)
api_router.include_router(users.router)
api_router.include_router(lookups.router)
api_router.include_router(permissions.roles_router)
api_router.include_router(permissions.permissions_router)
