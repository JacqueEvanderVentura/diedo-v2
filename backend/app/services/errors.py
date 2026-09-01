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
    pass


class ServiceUnavailableError(ApplicationError):
    pass
