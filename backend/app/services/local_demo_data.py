"""Compatibility wrapper for the canonical manifest-based demo seeder."""

from sqlalchemy.orm import Session

from app.services.demo_seed import DemoSeedSummary, seed_demo_data


def seed_local_demo_data(session: Session, password_hash: str) -> DemoSeedSummary:
    return seed_demo_data(session, password_hash, enabled=True)
