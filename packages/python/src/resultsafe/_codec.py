from __future__ import annotations

from typing import Literal, Protocol, TypeVar, cast

from ._core import (
    Cause,
    Die,
    Empty,
    Exit,
    ExitFailure,
    ExitSuccess,
    Fail,
    Failure,
    FailureClassification,
    Interrupt,
    Parallel,
    Sequential,
    _validate_failure,
    to_failure_data,
)

T = TypeVar("T")
E = TypeVar("E")

MAX_DEPTH = 32
MAX_NODES = 1024


class PayloadCodec(Protocol[T]):
    """Explicit application-owned conversion for an arbitrary payload."""

    def encode(self, value: T) -> object: ...

    def decode(self, value: object) -> T: ...


class _State:
    __slots__ = ("ancestors", "nodes")

    def __init__(self) -> None:
        self.ancestors: set[int] = set()
        self.nodes = 0

    def enter(self, value: object, depth: int) -> None:
        if depth > MAX_DEPTH:
            raise ValueError(f"Codec graph exceeds max_depth {MAX_DEPTH}")
        identity = id(value)
        if identity in self.ancestors:
            raise ValueError("Codec graph must not contain cycles")
        self.nodes += 1
        if self.nodes > MAX_NODES:
            raise ValueError(f"Codec graph exceeds max_nodes {MAX_NODES}")
        self.ancestors.add(identity)

    def leave(self, value: object) -> None:
        self.ancestors.remove(id(value))


_CAUSE_FIELDS = {
    "Empty": frozenset(("tag",)),
    "Fail": frozenset(("tag", "error")),
    "Die": frozenset(("tag", "failure")),
    "Interrupt": frozenset(("tag", "failure")),
    "Sequential": frozenset(("tag", "left", "right")),
    "Parallel": frozenset(("tag", "left", "right")),
}
_FAILURE_FIELDS = frozenset((
    "schema_version", "code", "message", "message_key", "message_args", "details",
    "causes", "classification", "metadata", "extensions",
))


def _exact_dict(value: object, fields: frozenset[str], label: str) -> dict[str, object]:
    if type(value) is not dict:
        raise TypeError(f"{label} must be an object")
    data = cast(dict[object, object], value)
    if set(data) != fields or any(type(key) is not str for key in data):
        raise ValueError(f"{label} contains unknown or missing fields")
    return cast(dict[str, object], data)


def encode_failure(value: Failure) -> dict[str, object]:
    if type(value) is not Failure:
        raise TypeError("value must be a Failure")
    # Revalidate because frozen Python objects can still be forged with object.__setattr__.
    _validate_failure(value)
    return to_failure_data(value)


def _decode_failure_at(value: object, depth: int, state: _State) -> Failure:
    if type(value) is not dict:
        raise TypeError("Failure JSON must be an object")
    state.enter(value, depth)
    try:
        data = cast(dict[object, object], value)
        if any(type(key) is not str or key not in _FAILURE_FIELDS for key in data):
            raise ValueError("Failure JSON contains an unknown field")
        if "schema_version" not in data or "code" not in data:
            raise ValueError("Failure JSON is missing a required field")
        kwargs: dict[str, object] = {
            "schema_version": data["schema_version"],
            "code": data["code"],
        }
        for name in ("message", "message_key", "message_args", "details", "metadata", "extensions"):
            if name in data:
                kwargs[name] = data[name]
        if "classification" in data:
            raw = data["classification"]
            if type(raw) is not dict:
                raise TypeError("Failure classification must be an object")
            classification = cast(dict[object, object], raw)
            allowed = frozenset(("category", "severity", "retryability"))
            if not classification or any(type(key) is not str or key not in allowed for key in classification):
                raise ValueError("Failure classification contains unknown fields")
            kwargs["classification"] = FailureClassification(
                category=cast(str | None, classification.get("category")),
                severity=cast(Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] | None, classification.get("severity")),
                retryability=cast(Literal["UNKNOWN", "NEVER", "CONDITIONAL", "ALWAYS"] | None, classification.get("retryability")),
            )
        if "causes" in data:
            raw_causes = data["causes"]
            if type(raw_causes) is not list:
                raise TypeError("Failure causes must be an array")
            if len(raw_causes) > 64:
                raise ValueError("Failure causes must contain at most 64 entries")
            kwargs["causes"] = tuple(_decode_failure_at(item, depth + 1, state) for item in raw_causes)
        return Failure(**kwargs)  # type: ignore[arg-type]
    finally:
        state.leave(value)


def decode_failure(value: object) -> Failure:
    return _decode_failure_at(value, 0, _State())


def _encode_cause_at(value: Cause[E], codec: PayloadCodec[E], depth: int, state: _State) -> dict[str, object]:
    state.enter(value, depth)
    try:
        if type(value) is Empty:
            return {"tag": "Empty"}
        if type(value) is Fail:
            return {"tag": "Fail", "error": codec.encode(value.error)}
        if type(value) is Die:
            return {"tag": "Die", "failure": encode_failure(value.failure)}
        if type(value) is Interrupt:
            return {"tag": "Interrupt", "failure": encode_failure(value.failure)}
        if type(value) is Sequential:
            return {"tag": "Sequential", "left": _encode_cause_at(value.left, codec, depth + 1, state), "right": _encode_cause_at(value.right, codec, depth + 1, state)}
        if type(value) is Parallel:
            return {"tag": "Parallel", "left": _encode_cause_at(value.left, codec, depth + 1, state), "right": _encode_cause_at(value.right, codec, depth + 1, state)}
        raise TypeError("Cause has an unknown variant")
    finally:
        state.leave(value)


def _decode_cause_at(value: object, codec: PayloadCodec[E], depth: int, state: _State) -> Cause[E]:
    if type(value) is not dict:
        raise TypeError("Cause JSON must be an object")
    state.enter(value, depth)
    try:
        raw = cast(dict[object, object], value)
        tag = raw.get("tag")
        if type(tag) is not str or tag not in _CAUSE_FIELDS:
            raise ValueError("Cause JSON has an unknown or missing tag")
        data = _exact_dict(value, _CAUSE_FIELDS[tag], "Cause JSON")
        if tag == "Empty":
            return Empty()
        if tag == "Fail":
            return Fail(codec.decode(data["error"]))
        if tag == "Die":
            return Die(_decode_failure_at(data["failure"], depth + 1, state))
        if tag == "Interrupt":
            return Interrupt(_decode_failure_at(data["failure"], depth + 1, state))
        if tag == "Sequential":
            return Sequential(_decode_cause_at(data["left"], codec, depth + 1, state), _decode_cause_at(data["right"], codec, depth + 1, state))
        return Parallel(_decode_cause_at(data["left"], codec, depth + 1, state), _decode_cause_at(data["right"], codec, depth + 1, state))
    finally:
        state.leave(value)


def encode_cause(value: Cause[E], error_codec: PayloadCodec[E]) -> dict[str, object]:
    return _encode_cause_at(value, error_codec, 0, _State())


def decode_cause(value: object, error_codec: PayloadCodec[E]) -> Cause[E]:
    return _decode_cause_at(value, error_codec, 0, _State())


def encode_exit(value: Exit[T, E], value_codec: PayloadCodec[T], error_codec: PayloadCodec[E]) -> dict[str, object]:
    if type(value) is ExitSuccess:
        return {"tag": "Success", "value": value_codec.encode(value.value)}
    if type(value) is ExitFailure:
        state = _State()
        state.enter(value, 0)
        return {"tag": "Failure", "cause": _encode_cause_at(value.cause, error_codec, 1, state)}
    raise TypeError("Exit has an unknown variant")


def decode_exit(value: object, value_codec: PayloadCodec[T], error_codec: PayloadCodec[E]) -> Exit[T, E]:
    if type(value) is not dict:
        raise TypeError("Exit JSON must be an object")
    data = cast(dict[object, object], value)
    tag = data.get("tag")
    if tag == "Success":
        exact = _exact_dict(value, frozenset(("tag", "value")), "Exit JSON")
        return ExitSuccess(value_codec.decode(exact["value"]))
    if tag == "Failure":
        exact = _exact_dict(value, frozenset(("tag", "cause")), "Exit JSON")
        state = _State()
        state.enter(value, 0)
        return ExitFailure(_decode_cause_at(exact["cause"], error_codec, 1, state))
    raise ValueError("Exit JSON has an unknown or missing tag")
