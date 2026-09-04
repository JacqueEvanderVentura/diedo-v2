from app.scripts import predeploy


def test_predeploy_runs_migrations_before_demo_seed(monkeypatch) -> None:
    calls: list[str] = []

    def fake_upgrade(_config, revision: str) -> None:
        assert revision == "head"
        calls.append("migrate")

    def fake_seed() -> None:
        calls.append("seed")

    monkeypatch.setattr(predeploy.command, "upgrade", fake_upgrade)
    monkeypatch.setattr(predeploy, "seed_demo", fake_seed)

    predeploy.main()

    assert calls == ["migrate", "seed"]
