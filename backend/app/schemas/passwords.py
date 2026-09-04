from typing import Annotated

from pydantic import AfterValidator, Field, SecretStr

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128


def _validate_password_strength(value: SecretStr) -> SecretStr:
    password = value.get_secret_value()
    if not any(character.isupper() for character in password):
        raise ValueError("La contraseña debe incluir al menos una mayúscula.")
    if not any(
        not character.isalnum() and not character.isspace()
        for character in password
    ):
        raise ValueError("La contraseña debe incluir al menos un carácter especial.")
    return value


NewPassword = Annotated[
    SecretStr,
    Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH),
    AfterValidator(_validate_password_strength),
]
