from app.services.membership_access_messages import other_company_message, user_inactive_message


def test_other_company_message_includes_email() -> None:
    assert other_company_message("user@example.com") == (
        "Este usuario (user@example.com) ya pertenece a otra empresa."
    )


def test_user_inactive_message_includes_email() -> None:
    assert user_inactive_message("user@example.com") == (
        "Este usuario (user@example.com) no está activo."
    )
