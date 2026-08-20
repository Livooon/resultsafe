import copy
import json
import math
import pickle
from dataclasses import asdict

import pytest

from resultsafe import Err, Failure, FailureClassification, Ok, from_result_data, hydrate_result, to_failure_data, to_result_data


def test_transport_conversion_is_explicit_and_preserves_payload_identity():
    payload = object()
    runtime = Ok(payload)
    data = to_result_data(runtime)

    assert data == {"ok": True, "value": payload}
    assert data is not runtime
    hydrated = from_result_data(data)
    assert isinstance(hydrated, Ok)
    assert hydrated.value is payload
    assert hydrate_result(runtime) is runtime
    assert hydrate_result(data).value is payload


def test_pickle_and_copy_preserve_runtime_type_and_value_semantics():
    for runtime in (Ok([1]), Err({"code": 2})):
        restored = pickle.loads(pickle.dumps(runtime))
        copied = copy.copy(runtime)
        deep_copied = copy.deepcopy(runtime)
        assert type(restored) is type(runtime) and restored == runtime
        assert type(copied) is type(runtime) and copied == runtime
        assert type(deep_copied) is type(runtime) and deep_copied == runtime


def test_asdict_is_dataclass_introspection_not_result_transport():
    assert asdict(Ok(1)) == {"value": 1}
    assert asdict(Err("bad")) == {"error": "bad"}
    assert to_result_data(Ok(1)) == {"ok": True, "value": 1}


def test_runtime_and_transport_support_explicit_pattern_matching():
    runtime = Ok(3)
    data = to_result_data(runtime)

    match runtime:
        case Ok(value):
            assert value == 3
        case _:
            raise AssertionError("runtime Result did not match Ok")

    match data:
        case {"ok": True, "value": value}:
            assert value == 3
        case _:
            raise AssertionError("ResultData did not match success mapping")


def test_structured_failure_is_optional_and_has_explicit_transport_data():
    failure = Failure(
        schema_version="1.0.0",
        code="urn:example:validation:invalid-field",
        message_key="validation.invalid_field",
        causes=(Failure(schema_version="1.0.0", code="urn:example:input:missing"),),
    )

    assert Err(failure).error is failure
    assert to_failure_data(failure) == {
        "schema_version": "1.0.0",
        "code": "urn:example:validation:invalid-field",
        "message_key": "validation.invalid_field",
        "causes": [{"schema_version": "1.0.0", "code": "urn:example:input:missing"}],
    }


def test_structured_failure_rejects_nonportable_data():
    for kwargs in (
        {"schema_version": "2.0.0", "code": "urn:example:error"},
        {"schema_version": "1.0.0", "code": "local-code"},
        {"schema_version": "1.0.0", "code": "urn:example:error", "details": math.inf},
        {"schema_version": "1.0.0", "code": "urn:example:error", "extensions": {"local": True}},
    ):
        try:
            Failure(**kwargs)  # type: ignore[arg-type]
        except (TypeError, ValueError):
            pass
        else:
            raise AssertionError(f"accepted invalid Failure: {kwargs}")


@pytest.mark.parametrize(
    "kwargs,message",
    [
        ({"schema_version": 1, "code": "urn:example:error"}, "schema_version"),
        ({"schema_version": "1.0.0", "code": 1}, "absolute URI"),
        ({"schema_version": "1.0.0", "code": "1bad:value"}, "absolute URI"),
        ({"schema_version": "1.0.0", "code": "http://[broken"}, "absolute URI"),
        ({"schema_version": "1.0.0", "code": "urn:bad:%GG"}, "absolute URI"),
        ({"schema_version": "1.0.0", "code": "urn:example:error", "message": 1}, "message"),
        ({"schema_version": "1.0.0", "code": "urn:example:error", "message_key": 1}, "message_key"),
        ({"schema_version": "1.0.0", "code": "urn:example:error", "message_args": []}, "JSON object"),
        ({"schema_version": "1.0.0", "code": "urn:example:error", "metadata": "bad"}, "JSON object"),
        ({"schema_version": "1.0.0", "code": "urn:example:error", "extensions": []}, "JSON object"),
        ({"schema_version": "1.0.0", "code": "urn:example:error", "classification": {}}, "FailureClassification"),
    ],
)
def test_structured_failure_validates_exact_field_runtime_types(kwargs, message):
    with pytest.raises((TypeError, ValueError), match=message):
        Failure(**kwargs)  # type: ignore[arg-type]


def test_structured_failure_validates_json_keys_numbers_and_object_bags():
    with pytest.raises(TypeError, match="keys must be strings"):
        Failure(schema_version="1.0.0", code="urn:example:error", details={1: "bad"})  # type: ignore[dict-item]
    with pytest.raises(TypeError, match="keys must be strings"):
        Failure(schema_version="1.0.0", code="urn:example:error", metadata={1: "bad"})  # type: ignore[dict-item]
    for number in (math.inf, -math.inf, math.nan):
        with pytest.raises(ValueError, match="finite"):
            Failure(schema_version="1.0.0", code="urn:example:error", details={"number": number})


def test_failure_classification_is_exact_nonempty_and_typed():
    with pytest.raises(ValueError, match="must not be empty"):
        FailureClassification()
    with pytest.raises(TypeError, match="category must be a string"):
        FailureClassification(category=1)  # type: ignore[arg-type]
    with pytest.raises(ValueError, match="severity is invalid"):
        FailureClassification(severity="NOTICE")  # type: ignore[arg-type]
    classification = FailureClassification(category="domain", severity="ERROR", retryability="NEVER")
    failure = Failure(schema_version="1.0.0", code="urn:example:error", classification=classification)
    assert to_failure_data(failure)["classification"] == {
        "category": "domain", "severity": "ERROR", "retryability": "NEVER",
    }


def test_failure_snapshots_input_and_transport_output_nested_data():
    nested = {"items": [{"value": 1}]}
    failure = Failure(
        schema_version="1.0.0",
        code="https://example.test/errors/invalid?version=1#public",
        message_args=nested,
        details=nested,
        metadata=nested,
        extensions={"urn:example:extension": nested},
    )
    nested["items"][0]["value"] = math.inf  # type: ignore[index]
    with pytest.raises(TypeError, match="snapshots are immutable"):
        failure.details["items"][0]["value"] = 2  # type: ignore[index]
    first = to_failure_data(failure)
    first["details"]["items"][0]["value"] = 2  # type: ignore[index]
    second = to_failure_data(failure)
    assert second["details"] == {"items": [{"value": 1}]}
    assert json.dumps(second, allow_nan=False)


def test_failure_preserves_omitted_details_separately_from_explicit_null():
    omitted = Failure(schema_version="1.0.0", code="urn:example:omitted")
    explicit = Failure(schema_version="1.0.0", code="urn:example:explicit", details=None)
    assert omitted.details is None and explicit.details is None
    assert "details" not in to_failure_data(omitted)
    assert to_failure_data(explicit)["details"] is None
    assert "details=" not in repr(omitted)
    assert "details=None" in repr(explicit)


def test_failure_uses_one_occurrence_counted_budget_and_allows_shared_acyclic_data():
    shared: dict[str, object] = {"leaf": []}
    accepted = Failure(schema_version="1.0.0", code="urn:example:shared", details=[shared, shared])
    assert to_failure_data(accepted)["details"] == [{"leaf": []}, {"leaf": []}]

    child_details = [{} for _ in range(600)]
    child = Failure(
        schema_version="1.0.0", code="urn:example:child", message_args={"safe": True}, details=child_details,
    )
    with pytest.raises(ValueError, match="max_nodes 1024"):
        Failure(
            schema_version="1.0.0",
            code="urn:example:root",
            details=[{} for _ in range(422)],
            causes=(child,),
        )
