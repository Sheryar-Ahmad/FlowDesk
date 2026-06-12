from fastapi import APIRouter
from app.api.v1.auth.router import router as auth_router
from app.api.v1.snippets.router import router as snippets_router
from app.api.v1.notes.router import router as notes_router
from app.api.v1.tasks.router import router as tasks_router
from app.api.v1.ai.router import router as ai_router
from app.api.v1.timer.router import router as timer_router

api_router = APIRouter()

api_router.include_router(auth_router, prefix='/v1/auth', tags=['Authentication'])
api_router.include_router(snippets_router, prefix='/v1/snippets', tags=['Snippets'])
api_router.include_router(notes_router, prefix='/v1/notes', tags=['Notes'])
api_router.include_router(tasks_router, prefix='/v1/tasks', tags=['Tasks'])
api_router.include_router(ai_router, prefix='/v1/ai', tags=['AI Assistant'])
api_router.include_router(timer_router, prefix='/v1/timer', tags=['Focus Timer'])
