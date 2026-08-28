from app.lambda_handler import handler


def test_lambda_handler_is_callable() -> None:
    assert callable(handler)
