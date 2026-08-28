from sqlalchemy.orm import Session

from app.repositories.foundation import FoundationRepository, FoundationSnapshot


def read_foundation_status(session: Session) -> FoundationSnapshot:
    """Return a database-backed snapshot without opening a transaction boundary."""

    return FoundationRepository(session).snapshot()
