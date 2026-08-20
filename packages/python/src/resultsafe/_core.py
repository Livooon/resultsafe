from __future__ import annotations

from dataclasses import dataclass, field
from math import isfinite
import re
from typing import Callable, ClassVar, Final, Generic, Literal, Never, TypeAlias, TypeGuard, TypeVar, TypedDict, cast
from urllib.parse import urlsplit

T = TypeVar("T")
E = TypeVar("E")
U = TypeVar("U")
F = TypeVar("F")
A = TypeVar("A")
B = TypeVar("B")
E_co = TypeVar("E_co", covariant=True)
T_co = TypeVar("T_co", covariant=True)

FailureJsonValue: TypeAlias = None | bool | int | float | str | list["FailureJsonValue"] | dict[str, "FailureJsonValue"]

_URI_SCHEME = re.compile(r"[A-Za-z][A-Za-z0-9+.-]*")
_URI_PERCENT_ESCAPE = re.compile(r"%(?![0-9A-Fa-f]{2})")
_URI_NETLOC = re.compile(r"(?:[A-Za-z0-9._~!$&'()*+,;=:@\[\]-]|%[0-9A-Fa-f]{2})*")
_URI_PATH = re.compile(r"(?:[A-Za-z0-9._~!$&'()*+,;=:@/\-]|%[0-9A-Fa-f]{2})*")
_URI_QUERY_OR_FRAGMENT = re.compile(r"(?:[A-Za-z0-9._~!$&'()*+,;=:@/?\-]|%[0-9A-Fa-f]{2})*")


def _is_absolute_uri(value: object) -> bool:
    if type(value) is not str or not value.isascii() or _URI_PERCENT_ESCAPE.search(value):
        return False
    separator = value.find(":")
    if separator < 1 or _URI_SCHEME.fullmatch(value[:separator]) is None:
        return False
    try:
        parsed = urlsplit(value)
        if parsed.scheme != value[:separator].lower():
            return False
        # Accessing these properties makes urllib reject malformed IP literals and ports.
        parsed.hostname
        parsed.port
    except ValueError:
        return False
    return (
        _URI_NETLOC.fullmatch(parsed.netloc) is not None
        and _URI_PATH.fullmatch(parsed.path) is not None
        and _URI_QUERY_OR_FRAGMENT.fullmatch(parsed.query) is not None
        and _URI_QUERY_OR_FRAGMENT.fullmatch(parsed.fragment) is not None
    )


class _MissingDetails:
    __slots__ = ()


_MISSING_DETAILS = _MissingDetails()


class _FrozenJsonList(list[FailureJsonValue]):
    def _immutable(self, *args: object, **kwargs: object) -> Never:
        raise TypeError("Failure JSON snapshots are immutable")

    __setitem__ = _immutable
    __delitem__ = _immutable
    __iadd__ = _immutable
    __imul__ = _immutable
    append = _immutable
    clear = _immutable
    extend = _immutable
    insert = _immutable
    pop = _immutable
    remove = _immutable
    reverse = _immutable
    sort = _immutable

    def __copy__(self) -> _FrozenJsonList:
        return self

    def __deepcopy__(self, memo: dict[int, object]) -> _FrozenJsonList:
        return self

    def __reduce__(self) -> tuple[type[_FrozenJsonList], tuple[list[FailureJsonValue]]]:
        return _FrozenJsonList, (list(self),)


class _FrozenJsonDict(dict[str, FailureJsonValue]):
    def _immutable(self, *args: object, **kwargs: object) -> Never:
        raise TypeError("Failure JSON snapshots are immutable")

    __setitem__ = _immutable
    __delitem__ = _immutable
    __ior__ = _immutable
    clear = _immutable
    pop = _immutable
    popitem = _immutable
    setdefault = _immutable
    update = _immutable

    def __copy__(self) -> _FrozenJsonDict:
        return self

    def __deepcopy__(self, memo: dict[int, object]) -> _FrozenJsonDict:
        return self

    def __reduce__(self) -> tuple[type[_FrozenJsonDict], tuple[dict[str, FailureJsonValue]]]:
        return _FrozenJsonDict, (dict(self),)


@dataclass(frozen=True, slots=True)
class FailureClassification:
    category: str | None = None
    severity: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] | None = None
    retryability: Literal["UNKNOWN", "NEVER", "CONDITIONAL", "ALWAYS"] | None = None

    def __post_init__(self) -> None:
        if self.category is not None and type(self.category) is not str:
            raise TypeError("Failure classification category must be a string")
        if self.category == "":
            raise ValueError("Failure classification category must not be empty")
        if self.severity is not None and type(self.severity) is not str:
            raise TypeError("Failure classification severity must be a string")
        if self.severity not in (None, "DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"):
            raise ValueError("Failure classification severity is invalid")
        if self.retryability is not None and type(self.retryability) is not str:
            raise TypeError("Failure classification retryability must be a string")
        if self.retryability not in (None, "UNKNOWN", "NEVER", "CONDITIONAL", "ALWAYS"):
            raise ValueError("Failure classification retryability is invalid")
        if self.category is None and self.severity is None and self.retryability is None:
            raise ValueError("Failure classification must not be empty")


@dataclass(frozen=True, slots=True, init=False, repr=False)
class Failure:
    """Optional structured payload for Err[Failure]; Result[T, E] stays generic."""

    schema_version: Literal["1.0.0"]
    code: str
    message: str | None = None
    message_key: str | None = None
    message_args: dict[str, FailureJsonValue] | None = None
    causes: tuple["Failure", ...] = ()
    classification: FailureClassification | None = None
    metadata: dict[str, FailureJsonValue] | None = None
    extensions: dict[str, FailureJsonValue] | None = None
    _details: FailureJsonValue | _MissingDetails = field(default=_MISSING_DETAILS, repr=False)

    def __init__(
        self,
        schema_version: Literal["1.0.0"],
        code: str,
        message: str | None = None,
        message_key: str | None = None,
        message_args: dict[str, FailureJsonValue] | None = None,
        details: FailureJsonValue = cast(FailureJsonValue, _MISSING_DETAILS),
        causes: tuple[Failure, ...] = (),
        classification: FailureClassification | None = None,
        metadata: dict[str, FailureJsonValue] | None = None,
        extensions: dict[str, FailureJsonValue] | None = None,
    ) -> None:
        for name, value in (
            ("schema_version", schema_version), ("code", code), ("message", message),
            ("message_key", message_key), ("message_args", message_args), ("causes", causes),
            ("classification", classification), ("metadata", metadata), ("extensions", extensions),
        ):
            object.__setattr__(self, name, value)
        raw_details: FailureJsonValue | _MissingDetails = cast(FailureJsonValue | _MissingDetails, details)
        object.__setattr__(self, "_details", raw_details)
        snapshots = _validate_failure(self)
        object.__setattr__(self, "message_args", snapshots[0])
        object.__setattr__(self, "_details", snapshots[1])
        object.__setattr__(self, "metadata", snapshots[2])
        object.__setattr__(self, "extensions", snapshots[3])

    @property
    def details(self) -> FailureJsonValue:
        if self._details is _MISSING_DETAILS:
            return None
        return cast(FailureJsonValue, self._details)

    def __repr__(self) -> str:
        members = [f"schema_version={self.schema_version!r}", f"code={self.code!r}"]
        for name in ("message", "message_key", "message_args"):
            if (value := getattr(self, name)) is not None:
                members.append(f"{name}={value!r}")
        if self._details is not _MISSING_DETAILS:
            members.append(f"details={self._details!r}")
        for name in ("causes", "classification", "metadata", "extensions"):
            value = getattr(self, name)
            if value not in (None, ()):
                members.append(f"{name}={value!r}")
        return f"Failure({', '.join(members)})"


def _take_failure_node(state: dict[str, int], message: str) -> None:
    state["nodes"] += 1
    if state["nodes"] > 1024:
        raise ValueError(message)


def _snapshot_failure_json(value: object, depth: int, ancestors: set[int], state: dict[str, int]) -> FailureJsonValue:
    if depth > 32:
        raise ValueError("Failure data exceeds max_depth 32")
    if value is None or type(value) in (str, bool, int):
        return cast(FailureJsonValue, value)
    if type(value) is float:
        if not isfinite(value):
            raise ValueError("Failure JSON numbers must be finite")
        return value
    if type(value) not in (list, dict, _FrozenJsonList, _FrozenJsonDict):
        raise TypeError("Failure data must contain only JSON values")
    identity = id(value)
    if identity in ancestors:
        raise ValueError("Failure data must not contain cycles")
    _take_failure_node(state, "Failure graph exceeds max_nodes 1024")
    ancestors.add(identity)
    try:
        if type(value) in (list, _FrozenJsonList):
            return _FrozenJsonList(_snapshot_failure_json(member, depth + 1, ancestors, state) for member in cast(list[object], value))
        output: dict[str, FailureJsonValue] = {}
        for key, member in cast(dict[object, object], value).items():
            if type(key) is not str:
                raise TypeError("Failure JSON object keys must be strings")
            output[key] = _snapshot_failure_json(member, depth + 1, ancestors, state)
        return _FrozenJsonDict(output)
    finally:
        ancestors.remove(identity)


def _validate_failure_node(
    value: Failure, depth: int, ancestors: set[int], state: dict[str, int],
) -> tuple[dict[str, FailureJsonValue] | None, FailureJsonValue | _MissingDetails, dict[str, FailureJsonValue] | None, dict[str, FailureJsonValue] | None]:
    if depth > 32:
        raise ValueError("Failure cause graph exceeds max_depth 32")
    identity = id(value)
    if identity in ancestors:
        raise ValueError("Failure cause graph must not contain cycles")
    _take_failure_node(state, "Failure graph exceeds max_nodes 1024")
    if type(value.schema_version) is not str or value.schema_version != "1.0.0":
        raise ValueError("Failure schema_version must be 1.0.0")
    if not _is_absolute_uri(value.code):
        raise ValueError("Failure code must be an absolute URI")
    if value.message is not None and type(value.message) is not str:
        raise TypeError("Failure message must be a string")
    if value.message_key is not None and type(value.message_key) is not str:
        raise TypeError("Failure message_key must be a string")
    if value.message_key == "":
        raise ValueError("Failure message_key must not be empty")
    if type(value.causes) is not tuple or any(type(cause) is not Failure for cause in value.causes):
        raise TypeError("Failure causes must be a tuple of Failure values")
    if len(value.causes) > 64:
        raise ValueError("Failure causes must contain at most 64 entries")
    if value.classification is not None and type(value.classification) is not FailureClassification:
        raise TypeError("Failure classification must be a FailureClassification")

    ancestors.add(identity)
    try:
        snapshots: list[FailureJsonValue | _MissingDetails | None] = []
        for name, item in (
            ("message_args", value.message_args), ("details", value._details),
            ("metadata", value.metadata), ("extensions", value.extensions),
        ):
            if item is _MISSING_DETAILS:
                snapshots.append(item)
                continue
            if name != "details" and item is not None and type(item) not in (dict, _FrozenJsonDict):
                raise TypeError(f"Failure {name} must be a JSON object")
            if name == "extensions" and item is not None:
                extension_data = cast(dict[object, object], item)
                if any(not _is_absolute_uri(key) for key in extension_data):
                    raise ValueError("Failure extension keys must be absolute URIs")
            snapshots.append(None if item is None else _snapshot_failure_json(item, depth + 1, ancestors, state))
        if value.classification is not None:
            _take_failure_node(state, "Failure graph exceeds max_nodes 1024")
        for cause in value.causes:
            _validate_failure_node(cause, depth + 1, ancestors, state)
        return cast(tuple[dict[str, FailureJsonValue] | None, FailureJsonValue | _MissingDetails, dict[str, FailureJsonValue] | None, dict[str, FailureJsonValue] | None], tuple(snapshots))
    finally:
        ancestors.remove(identity)


def _validate_failure(value: Failure) -> tuple[dict[str, FailureJsonValue] | None, FailureJsonValue | _MissingDetails, dict[str, FailureJsonValue] | None, dict[str, FailureJsonValue] | None]:
    return _validate_failure_node(value, 0, set(), {"nodes": 0})


def _failure_json_data(value: FailureJsonValue) -> FailureJsonValue:
    if isinstance(value, list):
        return [_failure_json_data(item) for item in value]
    if isinstance(value, dict):
        return {key: _failure_json_data(item) for key, item in value.items()}
    return value


def to_failure_data(value: Failure) -> dict[str, object]:
    """Project Failure to a JSON-compatible mapping while preserving omission."""
    output: dict[str, object] = {"schema_version": value.schema_version, "code": value.code}
    for field_name in ("message", "message_key", "message_args", "details", "classification", "metadata", "extensions"):
        if field_name == "details" and value._details is _MISSING_DETAILS:
            continue
        item = getattr(value, field_name)
        if item is not None:
            if isinstance(item, FailureClassification):
                item = {key: member for key in ("category", "severity", "retryability") if (member := getattr(item, key)) is not None}
            elif isinstance(item, (list, dict)):
                item = _failure_json_data(cast(FailureJsonValue, item))
            output[field_name] = item
        elif field_name == "details":
            output[field_name] = None
    if value.causes:
        output["causes"] = [to_failure_data(cause) for cause in value.causes]
    return output


_CAUSE_VARIANT_TOKEN = object()


class Cause(Generic[E_co]):
    __slots__ = ()

    def __new__(cls, *args: object, **kwargs: object) -> Cause[object]:
        if cls is Cause or cls not in _CAUSE_VARIANT_TYPES:
            raise TypeError("Cause cannot be instantiated except through its six canonical variants")
        return cast(Cause[object], object.__new__(cls))

    def __init_subclass__(cls, *, _token: object | None = None) -> None:
        if _token is not _CAUSE_VARIANT_TOKEN or Cause not in cls.__bases__:
            raise TypeError("Cause is a closed union and cannot be subclassed")
        super().__init_subclass__()


@dataclass(frozen=True)
class Empty(Cause[Never], _token=_CAUSE_VARIANT_TOKEN):
    __slots__ = ()
    pass


@dataclass(frozen=True)
class Fail(Cause[E], Generic[E], _token=_CAUSE_VARIANT_TOKEN):
    __slots__ = ("error",)
    error: E


@dataclass(frozen=True)
class Die(Cause[Never], _token=_CAUSE_VARIANT_TOKEN):
    __slots__ = ("failure",)
    failure: Failure

    def __post_init__(self) -> None:
        if type(self.failure) is not Failure:
            raise TypeError("Die failure must be a Failure")


@dataclass(frozen=True)
class Interrupt(Cause[Never], _token=_CAUSE_VARIANT_TOKEN):
    __slots__ = ("failure",)
    failure: Failure

    def __post_init__(self) -> None:
        if type(self.failure) is not Failure:
            raise TypeError("Interrupt failure must be a Failure")


@dataclass(frozen=True)
class Sequential(Cause[E], Generic[E], _token=_CAUSE_VARIANT_TOKEN):
    __slots__ = ("left", "right")
    left: Cause[E]
    right: Cause[E]

    def __post_init__(self) -> None:
        _validate_cause(self)


@dataclass(frozen=True)
class Parallel(Cause[E], Generic[E], _token=_CAUSE_VARIANT_TOKEN):
    __slots__ = ("left", "right")
    left: Cause[E]
    right: Cause[E]

    def __post_init__(self) -> None:
        _validate_cause(self)


_CAUSE_VARIANT_TYPES: tuple[type[object], ...] = (Empty, Fail, Die, Interrupt, Sequential, Parallel)


def _validate_cause(value: Cause[object]) -> None:
    stack: list[tuple[Cause[object], int, bool]] = [(value, 0, False)]
    ancestors: set[int] = set()
    nodes = 0
    while stack:
        cause, depth, leaving = stack.pop()
        identity = id(cause)
        if leaving:
            ancestors.remove(identity)
            continue
        if depth > 32:
            raise ValueError("Cause graph exceeds max_depth 32")
        if identity in ancestors:
            raise ValueError("Cause graph must not contain cycles")
        nodes += 1
        if nodes > 1024:
            raise ValueError("Cause graph exceeds max_nodes 1024")
        if type(cause) in (Empty, Fail):
            continue
        if type(cause) in (Die, Interrupt):
            terminal = cast(Die | Interrupt, cause)
            if type(terminal.failure) is not Failure:
                raise TypeError(f"{type(cause).__name__} failure must be a Failure")
            continue
        if type(cause) not in (Sequential, Parallel):
            raise TypeError("Cause graph must contain only Cause variants")
        composite = cast(Sequential[object] | Parallel[object], cause)
        if type(composite.left) not in _CAUSE_VARIANT_TYPES or type(composite.right) not in _CAUSE_VARIANT_TYPES:
            raise TypeError("Cause branches must be Cause values")
        ancestors.add(identity)
        stack.append((cause, depth, True))
        stack.append((composite.right, depth + 1, False))
        stack.append((composite.left, depth + 1, False))


@dataclass(frozen=True, slots=True)
class ExitSuccess(Generic[T]):
    value: T


@dataclass(frozen=True, slots=True)
class ExitFailure(Generic[E]):
    cause: Cause[E]

    def __post_init__(self) -> None:
        if type(self.cause) not in _CAUSE_VARIANT_TYPES:
            raise TypeError("ExitFailure cause must be a Cause")
        _validate_cause(self.cause)


Exit: TypeAlias = ExitSuccess[T] | ExitFailure[E]


@dataclass(frozen=True, slots=True)
class Ok(Generic[T]):
    value: T

    def is_err(self) -> Literal[False]:
        return cast(Literal[False], is_err(self))

    def is_err_and(self, predicate: Callable[[E], bool]) -> Literal[False]:
        return cast(Literal[False], is_err_and(self, predicate))

    def is_ok(self) -> Literal[True]:
        return cast(Literal[True], is_ok(self))

    def is_ok_and(self, predicate: Callable[[T], bool]) -> bool:
        return is_ok_and(self, predicate)

    def and_then(self, next: Callable[[T], Result[U, E]]) -> Result[U, E]:
        return and_then(self, next)

    def err(self) -> _Nothing:
        return cast(_Nothing, err(self))

    def expect(self, message: str) -> T:
        return expect(self, message)

    def expect_err(self, message: str) -> Never:
        expect_err(self, message)
        raise AssertionError("unreachable")

    def flatten(self: Ok[Result[U, E]]) -> Result[U, E]:
        return flatten(self)

    def map(self, mapper: Callable[[T], U]) -> Ok[U]:
        return cast(Ok[U], map(self, mapper))

    def map_err(self, mapper: Callable[[E], F]) -> Ok[T]:
        return cast(Ok[T], map_err(self, mapper))

    def match(self, success: Callable[[T], A], failure: Callable[[E], B]) -> A:
        return cast(A, match(self, success, failure))

    def ok(self) -> Some[T]:
        return cast(Some[T], ok(self))

    def or_else(self, recover: Callable[[E], Result[T, F]]) -> Ok[T]:
        return cast(Ok[T], or_else(self, recover))

    def tap(self, effect: Callable[[T], object]) -> Ok[T]:
        return cast(Ok[T], tap(self, effect))

    def tap_err(self, effect: Callable[[E], object]) -> Ok[T]:
        return cast(Ok[T], tap_err(self, effect))

    def transpose(self: Ok[Option[U]]) -> Option[Ok[U]]:
        return cast(Option[Ok[U]], transpose(self))

    def unwrap(self) -> T:
        return unwrap(self)

    def unwrap_err(self) -> Never:
        unwrap_err(self)
        raise AssertionError("unreachable")

    def unwrap_or(self, fallback: U) -> T:
        return cast(T, unwrap_or(self, fallback))

    def unwrap_or_else(self, fallback: Callable[[E], U]) -> T:
        return cast(T, unwrap_or_else(self, fallback))


@dataclass(frozen=True, slots=True)
class Err(Generic[E]):
    error: E

    def is_err(self) -> Literal[True]:
        return cast(Literal[True], is_err(self))

    def is_err_and(self, predicate: Callable[[E], bool]) -> bool:
        return is_err_and(self, predicate)

    def is_ok(self) -> Literal[False]:
        return cast(Literal[False], is_ok(self))

    def is_ok_and(self, predicate: Callable[[T], bool]) -> Literal[False]:
        return cast(Literal[False], is_ok_and(self, predicate))

    def and_then(self, next: Callable[[T], Result[U, E]]) -> Err[E]:
        return cast(Err[E], and_then(self, next))

    def err(self) -> Some[E]:
        return cast(Some[E], err(self))

    def expect(self, message: str) -> Never:
        expect(self, message)
        raise AssertionError("unreachable")

    def expect_err(self, message: str) -> E:
        return expect_err(self, message)

    def flatten(self) -> Err[E]:
        return cast(Err[E], flatten(self))

    def map(self, mapper: Callable[[T], U]) -> Err[E]:
        return cast(Err[E], map(self, mapper))

    def map_err(self, mapper: Callable[[E], F]) -> Err[F]:
        return cast(Err[F], map_err(self, mapper))

    def match(self, success: Callable[[T], A], failure: Callable[[E], B]) -> B:
        return cast(B, match(self, success, failure))

    def ok(self) -> _Nothing:
        return cast(_Nothing, ok(self))

    def or_else(self, recover: Callable[[E], Result[T, F]]) -> Result[T, F]:
        return or_else(self, recover)

    def tap(self, effect: Callable[[T], object]) -> Err[E]:
        return cast(Err[E], tap(self, effect))

    def tap_err(self, effect: Callable[[E], object]) -> Err[E]:
        return cast(Err[E], tap_err(self, effect))

    def transpose(self) -> Some[Err[E]]:
        return cast(Some[Err[E]], transpose(self))

    def unwrap(self) -> Never:
        unwrap(self)
        raise AssertionError("unreachable")

    def unwrap_err(self) -> E:
        return unwrap_err(self)

    def unwrap_or(self, fallback: U) -> U:
        return unwrap_or(self, fallback)

    def unwrap_or_else(self, fallback: Callable[[E], U]) -> U:
        return unwrap_or_else(self, fallback)


@dataclass(frozen=True, slots=True)
class Some(Generic[T]):
    value: T


class _Nothing:
    __slots__ = ()
    _instance: ClassVar[_Nothing | None] = None

    def __new__(cls) -> _Nothing:
        if cls._instance is None:
            cls._instance = object.__new__(cls)
        return cls._instance

    def __repr__(self) -> str:
        return "NOTHING"


NOTHING: Final = _Nothing()

Result: TypeAlias = Ok[T] | Err[E]
Option: TypeAlias = Some[T] | _Nothing


class OkData(TypedDict, Generic[T]):
    ok: Literal[True]
    value: T


class ErrData(TypedDict, Generic[E]):
    ok: Literal[False]
    error: E


ResultData: TypeAlias = OkData[T] | ErrData[E]
ResultLike: TypeAlias = Result[T, E] | ResultData[T, E]


class ResultExtractionError(Exception):
    """An invalid Result extraction, retaining the opposite payload by identity."""

    def __init__(self, message: str, payload: object) -> None:
        super().__init__(message)
        self.payload = payload


def to_result_data(result: ResultLike[T, E]) -> ResultData[T, E]:
    """Project a runtime Result or ResultData to newly allocated branch data."""
    if isinstance(result, Ok):
        return OkData(ok=True, value=result.value)
    if isinstance(result, Err):
        return ErrData(ok=False, error=result.error)
    if result["ok"]:
        return OkData(ok=True, value=result["value"])
    return ErrData(ok=False, error=result["error"])


def from_result_data(data: ResultData[T, E]) -> Result[T, E]:
    """Create a frozen methodful Result from data-only transport input."""
    if data["ok"]:
        return Ok(data["value"])
    return Err(data["error"])


def hydrate_result(result: ResultLike[T, E]) -> Result[T, E]:
    """Reuse a runtime Result or hydrate a transport dictionary."""
    if isinstance(result, (Ok, Err)):
        return result
    return from_result_data(result)


def result_to_exit(result: Result[T, E]) -> Exit[T, E]:
    if isinstance(result, Ok):
        return ExitSuccess(result.value)
    return ExitFailure(Fail(result.error))


def exit_to_cause_result(exit: Exit[T, E]) -> Result[T, Cause[E]]:
    if isinstance(exit, ExitSuccess):
        return Ok(exit.value)
    _validate_cause(exit.cause)
    return Err(exit.cause)


def exit_to_result(exit: Exit[T, E], collapse: Callable[[Cause[E]], F]) -> Result[T, F]:
    if isinstance(exit, ExitSuccess):
        return Ok(exit.value)
    _validate_cause(exit.cause)
    return Err(collapse(exit.cause))


def is_err(result: Result[T, E]) -> TypeGuard[Err[E]]:
    return isinstance(result, Err)


def is_ok(result: Result[T, E]) -> TypeGuard[Ok[T]]:
    return isinstance(result, Ok)


def is_err_and(result: Result[T, E], predicate: Callable[[E], bool]) -> bool:
    return isinstance(result, Err) and predicate(result.error)


def is_ok_and(result: Result[T, E], predicate: Callable[[T], bool]) -> bool:
    return isinstance(result, Ok) and predicate(result.value)


def and_then(result: Result[T, E], next: Callable[[T], Result[U, E]]) -> Result[U, E]:
    if isinstance(result, Ok):
        return next(result.value)
    return result


def err(result: Result[T, E]) -> Option[E]:
    if isinstance(result, Err):
        return Some(result.error)
    return NOTHING


def ok(result: Result[T, E]) -> Option[T]:
    if isinstance(result, Ok):
        return Some(result.value)
    return NOTHING


def expect(result: Result[T, E], message: str) -> T:
    if isinstance(result, Ok):
        return result.value
    raise ResultExtractionError(message, result.error)


def expect_err(result: Result[T, E], message: str) -> E:
    if isinstance(result, Err):
        return result.error
    raise ResultExtractionError(message, result.value)


def flatten(result: Result[Result[T, E], E]) -> Result[T, E]:
    if isinstance(result, Ok):
        return result.value
    return result


def map(result: Result[T, E], mapper: Callable[[T], U]) -> Result[U, E]:
    if isinstance(result, Ok):
        return Ok(mapper(result.value))
    return result


def map_err(result: Result[T, E], mapper: Callable[[E], F]) -> Result[T, F]:
    if isinstance(result, Err):
        return Err(mapper(result.error))
    return result


def match(
    result: Result[T, E],
    success: Callable[[T], A],
    failure: Callable[[E], B],
) -> A | B:
    if isinstance(result, Ok):
        return success(result.value)
    return failure(result.error)


def or_else(result: Result[T, E], recover: Callable[[E], Result[T, F]]) -> Result[T, F]:
    if isinstance(result, Err):
        return recover(result.error)
    return result


def tap(result: Result[T, E], effect: Callable[[T], object]) -> Result[T, E]:
    if isinstance(result, Ok):
        effect(result.value)
    return result


def tap_err(result: Result[T, E], effect: Callable[[E], object]) -> Result[T, E]:
    if isinstance(result, Err):
        effect(result.error)
    return result


def transpose(result: Result[Option[T], E]) -> Option[Result[T, E]]:
    if isinstance(result, Err):
        return Some(Err(result.error))
    if isinstance(result.value, Some):
        return Some(Ok(result.value.value))
    return NOTHING


def unwrap(result: Result[T, E]) -> T:
    if isinstance(result, Ok):
        return result.value
    raise ResultExtractionError("Called unwrap on an Err value", result.error)


def unwrap_err(result: Result[T, E]) -> E:
    if isinstance(result, Err):
        return result.error
    raise ResultExtractionError("Called unwrap_err on an Ok value", result.value)


def unwrap_or(result: Result[T, E], fallback: U) -> T | U:
    if isinstance(result, Ok):
        return result.value
    return fallback


def unwrap_or_else(result: Result[T, E], fallback: Callable[[E], U]) -> T | U:
    if isinstance(result, Ok):
        return result.value
    return fallback(result.error)
