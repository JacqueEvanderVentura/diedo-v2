from collections.abc import Generator
from contextlib import contextmanager

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine() -> Engine:
    global _engine, _session_factory
    if _engine is None:
        _engine = create_engine(
            settings.database_url,
            pool_pre_ping=True,
            pool_size=settings.db_pool_size,
            max_overflow=settings.db_max_overflow,
            pool_timeout=settings.db_pool_timeout_seconds,
        )
        _session_factory = sessionmaker(bind=_engine, autoflush=False, expire_on_commit=False)
    return _engine


def get_session_factory() -> sessionmaker[Session]:
    get_engine()
    if _session_factory is None:
        raise RuntimeError("Database session factory was not initialized.")
    return _session_factory


def get_session() -> Generator[Session]:
    """FastAPI dependency that owns one SQLAlchemy session per request."""
    factory = get_session_factory()
    with factory() as session:
        try:
            yield session
        except Exception:
            session.rollback()
            raise


@contextmanager
def session_scope() -> Generator[Session]:
    """Transaction boundary for jobs, scripts, and application services."""
    factory = get_session_factory()
    with factory.begin() as session:
        yield session


def dispose_engine() -> None:
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None
