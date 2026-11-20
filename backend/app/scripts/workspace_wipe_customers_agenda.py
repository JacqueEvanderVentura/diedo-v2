"""Delete customers and appointments for Franchesko (whole workspace or one Charm branch)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from uuid import UUID

from app.db.session import session_scope
from app.scripts.cheko.branches import resolve_charm_branch_map
from app.scripts.cheko.context import FOLDER_TO_CHEKO_BRANCH, load_cheko_context
from app.scripts.cheko.selective_wipe import (
    selective_wipe_customers_and_agenda,
    selective_wipe_customers_and_agenda_for_branch,
)

DEFAULT_WORKSPACE_ID = UUID("01a117e6-944e-75f4-a6dc-68907a10fa8c")
DEFAULT_SLUG = "franchesko-columna"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--workspace-id", type=UUID, default=DEFAULT_WORKSPACE_ID)
    parser.add_argument("--confirmation-slug", default=DEFAULT_SLUG)
    parser.add_argument(
        "--cheko-folder",
        choices=sorted(FOLDER_TO_CHEKO_BRANCH),
        help="Borrar solo esta sucursal Charm (charm-dn, charm-sde, charm-stgo).",
    )
    parser.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1] / ".local" / "wipe-customers-agenda.json",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Resolver sucursal y mostrar plan sin borrar.",
    )
    args = parser.parse_args()

    report: dict[str, int | str]

    with session_scope() as session:
        if args.cheko_folder:
            ctx = load_cheko_context()
            branch_map = resolve_charm_branch_map(session, args.workspace_id, ctx)
            cheko_id = FOLDER_TO_CHEKO_BRANCH[args.cheko_folder]
            branch_id = branch_map[cheko_id]
            if args.dry_run:
                payload = {
                    "mode": "branch",
                    "cheko_folder": args.cheko_folder,
                    "cheko_branch_id": cheko_id,
                    "diedo_branch_id": str(branch_id),
                    "workspace_id": str(args.workspace_id),
                    "confirmation_slug": args.confirmation_slug,
                }
                print(json.dumps(payload, indent=2))
                return
            wipe_counts = selective_wipe_customers_and_agenda_for_branch(
                session,
                args.workspace_id,
                branch_id,
                confirmation_slug=args.confirmation_slug,
            )
            report = {
                **wipe_counts,
                "cheko_folder": args.cheko_folder,
                "diedo_branch_id": str(branch_id),
            }
        else:
            if args.dry_run:
                payload = {"mode": "workspace", "workspace_id": str(args.workspace_id)}
                print(json.dumps(payload, indent=2))
                return
            report = dict(
                selective_wipe_customers_and_agenda(
                    session,
                    args.workspace_id,
                    confirmation_slug=args.confirmation_slug,
                )
            )

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, indent=2), encoding="utf-8")
    print(json.dumps(report, indent=2))
    print(f"Reporte: {args.out}")


if __name__ == "__main__":
    main()
    sys.exit(0)
