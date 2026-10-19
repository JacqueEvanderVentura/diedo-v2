from unittest.mock import MagicMock

from app.scripts import predeploy


def test_predeploy_runs_migrations_only(monkeypatch) -> None:
    upgrade = MagicMock()
    config_instance = object()
    config_cls = MagicMock(return_value=config_instance)
    monkeypatch.setattr(predeploy, "command", MagicMock(upgrade=upgrade))
    monkeypatch.setattr(predeploy, "Config", config_cls)

    predeploy.main()

    config_cls.assert_called_once_with("alembic.ini")
    upgrade.assert_called_once_with(config_instance, "head")
