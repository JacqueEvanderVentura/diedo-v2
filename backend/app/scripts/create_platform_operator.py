"""Create a named Backoffice operator without installing demo data."""

import argparse
import getpass
import sys
import warnings
from collections.abc import Sequence

from pydantic import SecretStr, ValidationError
from sqlalchemy.engine import make_url
from sqlalchemy.exc import SQLAlchemyError

from app.config import settings
from app.db.session import session_scope
from app.schemas.platform_operators import CreatePlatformOperatorInput
from app.services.errors import ConflictError
from app.services.platform_operators import create_platform_operator


def main(argv: Sequence[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Crear un operador del Backoffice.")
    parser.add_argument("--email", required=True, help="Correo personal del operador.")
    parser.add_argument("--name", required=True, help="Nombre del operador.")
    parser.add_argument(
        "--password-stdin",
        action="store_true",
        help="Leer una contraseña desde stdin para automatización.",
    )
    args = parser.parse_args(argv)
    target = make_url(settings.database_url)
    print(f"Entorno: {settings.app_env} | Servidor: {target.host} | Base: {target.database}")
    try:
        if args.password_stdin:
            password = sys.stdin.readline().rstrip("\r\n")
        else:
            with warnings.catch_warnings():
                # Fail closed when the terminal cannot hide the entered password.
                warnings.simplefilter("error", getpass.GetPassWarning)
                password = getpass.getpass("Contraseña del operador: ")
                confirmation = getpass.getpass("Repite la contraseña: ")
            if password != confirmation:
                print(
                    "Las contraseñas no coinciden. No se modificó ninguna cuenta.", file=sys.stderr
                )
                return 1
        data = CreatePlatformOperatorInput(
            email=args.email, display_name=args.name, password=SecretStr(password)
        )
        with session_scope() as session:
            result = create_platform_operator(session, data)
    except ValidationError as exc:
        for error in exc.errors(include_input=False, include_url=False):
            print(f"Datos inválidos: {error['msg']}", file=sys.stderr)
        return 1
    except ConflictError as exc:
        print(str(exc), file=sys.stderr)
        return 1
    except EOFError, KeyboardInterrupt, getpass.GetPassWarning:
        print(
            "No se recibió una contraseña oculta. Usa una terminal o --password-stdin.",
            file=sys.stderr,
        )
        return 1
    except SQLAlchemyError:
        # Database exceptions can contain parameters, including the password hash.
        print(
            "No se pudo crear el operador. Revisa conexión, migraciones y correo duplicado.",
            file=sys.stderr,
        )
        return 1
    if result.created:
        print(f"Operador creado: {result.email}. Ya puede iniciar sesión en el login habitual.")
    else:
        print(f"El operador {result.email} ya existe. Se conservaron su contraseña y sus datos.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
