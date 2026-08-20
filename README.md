# ERP Backend

Repositorio del backend para el nuevo ERP, siguiendo el lineamiento arquitectonico de
`scala-payments-master`.

- `backend/`: API Python 3.14 (FastAPI + Mangum), PostgreSQL, SQLAlchemy y Alembic.
- `docs/backend/`: contrato tecnico compartido para API, base de datos y calidad.
- `.cursor/rules/`: reglas de trabajo equivalentes a las del proyecto de referencia.
- `.github/workflows/`: CI de backend con workflow reutilizable.

La infraestructura de hosting y la base de datos administrada se definiran en una fase posterior.
Para desarrollo local se incluye PostgreSQL mediante Docker Compose.

Consulta [`backend/README.md`](backend/README.md) para instalar y ejecutar la API.
