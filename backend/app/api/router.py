from fastapi import APIRouter

from app.api.routers import auth, catalog, health, lookups, permissions, users

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(catalog.router)
api_router.include_router(users.router)
api_router.include_router(lookups.router)
api_router.include_router(permissions.roles_router)
api_router.include_router(permissions.permissions_router)
