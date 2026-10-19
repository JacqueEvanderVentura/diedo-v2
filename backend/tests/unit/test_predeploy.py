from app.scripts import predeploy


def test_predeploy_runs_migrations_only(monkeypatch) -> None:
    calls: list[str] = []

    def fake_upgrade(_config, revision: str) -> None:
        assert revision == "head"
        calls.append("migrate")

    monkeypatch.setattr(predeploy.command, "upgrade", fake_upgrade)
    monkeypatch.setattr(predeploy, "Config", lambda _path: object())

    predeploy.main()

    assert calls == ["migrate"]
    assert not hasattr(predeploy, "seed_demo")
