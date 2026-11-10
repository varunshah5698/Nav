from fastapi import APIRouter

from . import audit, auth, calls, handoffs, health, policies

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(calls.router)
api_router.include_router(handoffs.router)
api_router.include_router(audit.router)
api_router.include_router(policies.router)
api_router.include_router(health.router)
