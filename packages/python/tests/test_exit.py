from dataclasses import FrozenInstanceError
from inspect import Parameter, signature

import pytest

from resultsafe import (
    Cause,
    Die,
    Empty,
    Err,
    ExitFailure,
    ExitSuccess,
    Fail,
    Failure,
    Interrupt,
    Ok,
    Parallel,
    Sequential,
    exit_to_cause_result,
    exit_to_result,
    result_to_exit,
)


def structured_failure(code: str = "urn:example:failure") -> Failure:
    return Failure(schema_version="1.0.0", code=code)


def test_cause_and_exit_variants_are_frozen_slotted_values():
    failure = structured_failure()
    values = (
        Empty(),
        Fail(object()),
        Die(failure),
        Interrupt(failure),
        Parallel(Empty(), Fail("error")),
        Sequential(Fail("left"), Fail("right")),
        ExitSuccess(object()),
        ExitFailure(Empty()),
    )
    for value in values:
        assert not hasattr(value, "__dict__")
        with pytest.raises((FrozenInstanceError, TypeError)):
            setattr(value, "extra", None)


def test_result_exit_conversions_preserve_payload_and_cause_identity():
    value, error = object(), object()
    success = result_to_exit(Ok(value))
    failure = result_to_exit(Err(error))
    assert isinstance(success, ExitSuccess) and success.value is value
    assert isinstance(failure, ExitFailure)
    assert isinstance(failure.cause, Fail) and failure.cause.error is error

    cause: Cause[object] = Parallel(Empty(), failure.cause)
    cause_result = exit_to_cause_result(ExitFailure(cause))
    assert isinstance(cause_result, Err) and cause_result.error is cause
    restored = exit_to_cause_result(success)
    assert isinstance(restored, Ok) and restored.value is value


def test_exit_to_result_requires_and_calls_collapse_only_for_failure():
    cause: Cause[str] = Sequential(Empty(), Fail("error"))
    calls: list[Cause[str]] = []
    collapsed = object()

    result = exit_to_result(ExitFailure(cause), lambda value: calls.append(value) or collapsed)
    assert isinstance(result, Err) and result.error is collapsed
    assert calls == [cause]
    assert exit_to_result(ExitSuccess(1), lambda value: calls.append(value)) == Ok(1)
    assert calls == [cause]
    assert signature(exit_to_result).parameters["collapse"].default is Parameter.empty


def test_empty_is_a_valid_failure_cause():
    exit = ExitFailure(Empty())
    assert exit_to_cause_result(exit) == Err(Empty())


def test_cause_validation_rejects_bad_payloads_depth_nodes_and_cycles():
    with pytest.raises(TypeError, match="Die failure"):
        Die("not a Failure")  # type: ignore[arg-type]
    with pytest.raises(TypeError, match="Cause branches"):
        Sequential(Empty(), "not a Cause")  # type: ignore[arg-type]

    deep: Cause[str] = Fail("error")
    for _ in range(32):
        deep = Sequential(Empty(), deep)
    with pytest.raises(ValueError, match="max_depth 32"):
        Sequential(Empty(), deep)

    broad: Cause[str] = Fail("error")
    for _ in range(9):
        broad = Parallel(broad, broad)
    with pytest.raises(ValueError, match="max_nodes 1024"):
        Parallel(broad, Fail("overflow"))

    cyclic = object.__new__(Sequential)
    object.__setattr__(cyclic, "left", Empty())
    object.__setattr__(cyclic, "right", cyclic)
    with pytest.raises(ValueError, match="cycles"):
        ExitFailure(cyclic)


def test_conversion_revalidates_externally_modified_causes():
    cause = Sequential(Empty(), Fail("error"))
    exit = ExitFailure(cause)
    object.__setattr__(cause, "right", cause)
    with pytest.raises(ValueError, match="cycles"):
        exit_to_cause_result(exit)


def test_cause_is_closed_and_rejects_direct_or_forged_values():
    with pytest.raises(TypeError, match="six canonical variants"):
        Cause()  # type: ignore[abstract]

    with pytest.raises(TypeError, match="closed union"):
        class NonCanonical(Cause[str]):
            pass

    forged = object.__new__(Cause)
    with pytest.raises(TypeError, match="ExitFailure cause"):
        ExitFailure(forged)
