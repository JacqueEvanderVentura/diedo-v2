import json
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from types import SimpleNamespace
from uuid import uuid7

import pytest
from app.repositories.modules import ModuleAccessRecord
from app.scripts import seed_demo, seed_local_demo
from app.services.demo_manifest import load_demo_bundle
from app.services.demo_seed import DemoSeedSummary
from app.services.modules import ModuleAccessService


def _write_manifest(directory: Path, files: list[dict]) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    (directory / "manifest.json").write_text(
        json.dumps(
            {
                "seedVersion": "test-v1",
                "schemaVersion": "test",
                "workspaceSlug": "test",
                "modules": [],
                "files": files,
            }
        ),
        encoding="utf-8",
    )


def test_demo_manifest_requires_phase0_files(tmp_path: Path) -> None:
    _write_manifest(tmp_path, [])

    with pytest.raises(ValueError, match="missing required Phase 0 files"):
        load_demo_bundle(tmp_path)


def test_demo_manifest_rejects_checksum_mismatch(tmp_path: Path) -> None:
    files = []
    for name in (
        "foundation.json",
        "iam.json",
        "configuration.json",
        "catalog.json",
        "inventory.json",
        "purchasing.json",
        "customers.json",
        "employees.json",
    ):
        (tmp_path / name).write_text("{}", encoding="utf-8")
        files.append({"name": name, "sha256": "0" * 64, "count": 0})
    _write_manifest(tmp_path, files)

    with pytest.raises(ValueError, match="Checksum mismatch"):
        load_demo_bundle(tmp_path)


def test_module_access_removes_modules_with_unmet_dependencies() -> None:
    now = datetime.now(UTC)
    repository = type(
        "RepositoryStub",
        (),
        {
            "list_access_records": lambda _self, _workspace_id: [
                ModuleAccessRecord("foundation", "available", (), "enabled", now, None),
                ModuleAccessRecord("sales", "available", ("catalog",), "enabled", now, None),
            ],
            "module_code_for_permission": lambda _self, code: (
                "foundation" if code == "workspace.read" else None
            ),
        },
    )()
    service = object.__new__(ModuleAccessService)
    service._repository = repository

    assert service.enabled_modules(uuid7(), now=now) == frozenset({"foundation"})
    assert service.module_for_permission("workspace.read") == "foundation"
    assert service.module_for_permission("unknown") is None


@contextmanager
def _fake_session_scope():
    yield object()


def _demo_summary() -> DemoSeedSummary:
    return DemoSeedSummary(False, "test-v1", None, 0, 0, 0)


def test_seed_demo_cli_supports_explicitly_disabled_seed(monkeypatch, capsys) -> None:
    received: list[object] = []
    monkeypatch.setattr(
        seed_demo,
        "settings",
        SimpleNamespace(
            app_env="test",
            demo_seed_enabled=False,
            local_bootstrap_admin_password=None,
        ),
    )
    monkeypatch.setattr(seed_demo, "session_scope", _fake_session_scope)
    monkeypatch.setattr(
        seed_demo,
        "seed_demo_data",
        lambda _session, password_hash: received.append(password_hash) or _demo_summary(),
    )

    seed_demo.main()

    assert received == [None]
    assert json.loads(capsys.readouterr().out)["seed_version"] == "test-v1"


def test_seed_demo_cli_rejects_enabled_seed_without_password(monkeypatch) -> None:
    monkeypatch.setattr(
        seed_demo,
        "settings",
        SimpleNamespace(
            app_env="development",
            demo_seed_enabled=True,
            local_bootstrap_admin_password=None,
        ),
    )

    with pytest.raises(RuntimeError, match="LOCAL_BOOTSTRAP_ADMIN_PASSWORD"):
        seed_demo.main()


def test_seed_local_demo_cli_hashes_password_and_forces_seed(monkeypatch, capsys) -> None:
    secret = SimpleNamespace(get_secret_value=lambda: "secret")
    received: list[tuple[object, bool]] = []
    monkeypatch.setattr(
        seed_local_demo,
        "settings",
        SimpleNamespace(app_env="development", local_bootstrap_admin_password=secret),
    )
    monkeypatch.setattr(seed_local_demo, "hash_password", lambda password: f"hashed:{password}")
    monkeypatch.setattr(seed_local_demo, "session_scope", _fake_session_scope)
    monkeypatch.setattr(
        seed_local_demo,
        "seed_demo_data",
        lambda _session, password_hash, *, enabled: (
            received.append((password_hash, enabled)) or _demo_summary()
        ),
    )

    seed_local_demo.main()

    assert received == [("hashed:secret", True)]
    assert json.loads(capsys.readouterr().out)["enabled"] is False


@pytest.mark.parametrize("module", [seed_demo, seed_local_demo])
def test_demo_seed_clis_reject_production_environment(monkeypatch, module) -> None:
    monkeypatch.setattr(
        module,
        "settings",
        SimpleNamespace(app_env="production", local_bootstrap_admin_password=None),
    )

    with pytest.raises(RuntimeError, match="disabled outside development and test"):
        module.main()
