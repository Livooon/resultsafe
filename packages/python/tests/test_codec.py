from __future__ import annotations

import json
from pathlib import Path
from typing import Generic, TypeVar

import pytest

from resultsafe import (
    Cause,
    Empty,
    ExitFailure,
    Fail,
    Failure,
    Parallel,
    PayloadCodec,
    Sequential,
    decode_cause,
    decode_exit,
    decode_failure,
    encode_cause,
    encode_exit,
    encode_failure,
)

T = TypeVar("T")


class IdentityCodec(Generic[T], PayloadCodec[T]):
    def encode(self, value: T) -> object:
        return value

    def decode(self, value: object) -> T:
        return value  # type: ignore[return-value]


CODEC: IdentityCodec[object] = IdentityCodec()
VECTOR_PATH = Path(__file__).parents[2] / "adapter/core/fp/codec/json/vectors/codec.json"
VECTORS = json.loads(VECTOR_PATH.read_text(encoding="utf-8"))


@pytest.mark.parametrize("vector", VECTORS["valid"], ids=lambda value: value["name"])
def test_shared_golden_vectors(vector: dict[str, object]) -> None:
    wire = vector["wire"]
    if vector["kind"] == "cause":
        encoded = encode_cause(decode_cause(wire, CODEC), CODEC)
    else:
        encoded = encode_exit(decode_exit(wire, CODEC, CODEC), CODEC, CODEC)
    assert encoded == wire
    assert '"_tag"' not in json.dumps(encoded)


@pytest.mark.parametrize("vector", VECTORS["malformed"], ids=lambda value: value["name"])
def test_shared_malformed_vectors(vector: dict[str, object]) -> None:
    with pytest.raises((TypeError, ValueError)):
        if vector["kind"] == "cause":
            decode_cause(vector["wire"], CODEC)
        else:
            decode_exit(vector["wire"], CODEC, CODEC)


def test_grouping_order_and_immutable_core_values() -> None:
    decoded = decode_cause({
        "tag": "Sequential",
        "left": {"tag": "Fail", "error": "a"},
        "right": {"tag": "Parallel", "left": {"tag": "Empty"}, "right": {"tag": "Fail", "error": "b"}},
    }, CODEC)
    assert decoded == Sequential(Fail("a"), Parallel(Empty(), Fail("b")))
    with pytest.raises((AttributeError, TypeError)):
        decoded.left = Empty()  # type: ignore[union-attr,misc]


def test_failure_codec_preserves_omission() -> None:
    failure = Failure(schema_version="1.0.0", code="urn:example:omitted")
    wire = encode_failure(failure)
    assert wire == {"schema_version": "1.0.0", "code": "urn:example:omitted"}
    assert encode_failure(decode_failure(wire)) == wire


def test_shared_nodes_encode_by_occurrence_and_cycles_are_rejected() -> None:
    shared: Cause[object] = Fail("error")
    wire = encode_cause(Parallel(shared, shared), CODEC)
    assert wire["left"] == wire["right"]
    assert wire["left"] is not wire["right"]

    cyclic = object.__new__(Sequential)
    object.__setattr__(cyclic, "left", Empty())
    object.__setattr__(cyclic, "right", cyclic)
    with pytest.raises(ValueError, match="cycles"):
        encode_cause(cyclic, CODEC)

    cyclic_wire: dict[str, object] = {"tag": "Sequential", "left": {"tag": "Empty"}}
    cyclic_wire["right"] = cyclic_wire
    with pytest.raises(ValueError, match="cycles"):
        decode_cause(cyclic_wire, CODEC)


def test_depth_and_node_limits_use_document_root_zero() -> None:
    deep: object = {"tag": "Empty"}
    for _ in range(33):
        deep = {"tag": "Sequential", "left": {"tag": "Empty"}, "right": deep}
    with pytest.raises(ValueError, match="max_depth 32"):
        decode_cause(deep, CODEC)

    broad: Cause[object] = Fail("error")
    for _ in range(10):
        parent = object.__new__(Parallel)
        object.__setattr__(parent, "left", broad)
        object.__setattr__(parent, "right", broad)
        broad = parent
    with pytest.raises(ValueError, match="max_nodes 1024"):
        encode_cause(broad, CODEC)
    assert encode_exit(ExitFailure(Empty()), CODEC, CODEC) == {"tag": "Failure", "cause": {"tag": "Empty"}}
