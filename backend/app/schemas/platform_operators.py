from pydantic import BaseModel, EmailStr, Field, field_validator

from app.schemas.passwords import NewPassword


class CreatePlatformOperatorInput(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=2, max_length=160)
    password: NewPassword

    @field_validator("display_name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        name = " ".join(value.split())
        if len(name) < 2:
            raise ValueError("El nombre debe tener al menos dos caracteres.")
        return name
