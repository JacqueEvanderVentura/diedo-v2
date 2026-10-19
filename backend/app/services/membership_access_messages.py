from __future__ import annotations


def other_company_message(email: str) -> str:
    return f"Este usuario ({email}) ya pertenece a otra empresa."


def user_inactive_message(email: str) -> str:
    return f"Este usuario ({email}) no está activo."
