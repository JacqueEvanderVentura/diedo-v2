class ApplicationError(Exception):
    """Expected application failure translated at the HTTP boundary."""

    def __init__(self, message: str, parameter: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.parameter = parameter


class AuthenticationError(ApplicationError):
    pass


class AuthorizationError(ApplicationError):
    pass


class ResourceNotFoundError(ApplicationError):
    pass


class ConflictError(ApplicationError):
    pass


class InvalidOperationError(ApplicationError):
    def __init__(
        self,
        message: str,
        parameter: str | None = None,
        *,
        graph_status: int | None = None,
        graph_code: int | str | None = None,
        graph_type: str | None = None,
        graph_message: str | None = None,
        public_code: str | None = None,
    ) -> None:
        super().__init__(message, parameter)
        self.graph_status = graph_status
        self.graph_code = graph_code
        self.graph_type = graph_type
        self.graph_message = graph_message
        self.public_code = public_code


class RateLimitExceededError(ApplicationError):
    pass


class ServiceUnavailableError(ApplicationError):
    pass
