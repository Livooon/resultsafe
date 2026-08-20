from dataclasses import FrozenInstanceError

import pytest

from resultsafe import (
    NOTHING,
    Err,
    Ok,
    ResultExtractionError,
    Some,
    and_then,
    err,
    expect,
    expect_err,
    flatten,
    is_err,
    is_err_and,
    is_ok,
    is_ok_and,
    map,
    map_err,
    match,
    ok,
    or_else,
    tap,
    tap_err,
    transpose,
    unwrap,
    unwrap_err,
    unwrap_or,
    unwrap_or_else,
)


CANONICAL_METHODS = {
    "is_err", "is_err_and", "is_ok", "is_ok_and", "and_then", "err", "expect",
    "expect_err", "flatten", "map", "map_err", "match", "ok", "or_else", "tap",
    "tap_err", "transpose", "unwrap", "unwrap_err", "unwrap_or", "unwrap_or_else",
}


def test_result_variants_expose_all_canonical_methods():
    for result in (Ok(1), Err("error")):
        assert {name for name in CANONICAL_METHODS if callable(getattr(result, name, None))} == CANONICAL_METHODS


@pytest.mark.parametrize(
    "operation,result,args",
    [
        (is_err, Ok(1), ()), (is_err, Err("e"), ()),
        (is_err_and, Ok(1), (lambda error: bool(error),)),
        (is_err_and, Err("e"), (lambda error: bool(error),)),
        (is_ok, Ok(1), ()), (is_ok, Err("e"), ()),
        (is_ok_and, Ok(1), (lambda value: value > 0,)),
        (is_ok_and, Err("e"), (lambda value: value > 0,)),
        (and_then, Ok(1), (lambda value: Ok(value + 1),)),
        (and_then, Err("e"), (lambda value: Ok(value + 1),)),
        (err, Ok(1), ()), (err, Err("e"), ()),
        (expect, Ok(1), ("message",)), (expect, Err("e"), ("message",)),
        (expect_err, Ok(1), ("message",)), (expect_err, Err("e"), ("message",)),
        (flatten, Ok(Ok(1)), ()), (flatten, Err("e"), ()),
        (map, Ok(1), (lambda value: value + 1,)),
        (map, Err("e"), (lambda value: value + 1,)),
        (map_err, Ok(1), (lambda error: error.upper(),)),
        (map_err, Err("e"), (lambda error: error.upper(),)),
        (match, Ok(1), (lambda value: value + 1, lambda error: len(error))),
        (match, Err("e"), (lambda value: value + 1, lambda error: len(error))),
        (ok, Ok(1), ()), (ok, Err("e"), ()),
        (or_else, Ok(1), (lambda error: Ok(len(error)),)),
        (or_else, Err("e"), (lambda error: Ok(len(error)),)),
        (tap, Ok(1), (lambda value: None,)), (tap, Err("e"), (lambda value: None,)),
        (tap_err, Ok(1), (lambda error: None,)), (tap_err, Err("e"), (lambda error: None,)),
        (transpose, Ok(Some(1)), ()), (transpose, Err("e"), ()),
        (unwrap, Ok(1), ()), (unwrap, Err("e"), ()),
        (unwrap_err, Ok(1), ()), (unwrap_err, Err("e"), ()),
        (unwrap_or, Ok(1), (2,)), (unwrap_or, Err("e"), (2,)),
        (unwrap_or_else, Ok(1), (lambda error: len(error),)),
        (unwrap_or_else, Err("e"), (lambda error: len(error),)),
    ],
)
def test_method_and_function_surfaces_are_equivalent(operation, result, args):
    outcomes = []
    for invoke in (lambda: operation(result, *args), lambda: getattr(result, operation.__name__)(*args)):
        try:
            outcomes.append(("return", invoke()))
        except ResultExtractionError as exception:
            outcomes.append(("raise", exception))

    assert outcomes[0][0] == outcomes[1][0]
    left, right = outcomes[0][1], outcomes[1][1]
    assert type(left) is type(right)
    if isinstance(left, ResultExtractionError):
        assert str(left) == str(right)
        assert left.payload is right.payload
    else:
        assert left == right
        if left is result:
            assert right is result


@pytest.mark.parametrize("wrapper,field", [(Ok([]), "value"), (Err([]), "error"), (Some([]), "value")])
def test_values_are_slotted_shallow_frozen_and_preserve_payload(wrapper, field):
    payload = getattr(wrapper, field)
    assert not hasattr(wrapper, "__dict__")
    with pytest.raises(FrozenInstanceError):
        setattr(wrapper, field, object())
    payload.append(1)
    assert getattr(wrapper, field) == [1]


def test_nothing_is_a_frozen_singleton_without_payload():
    assert repr(NOTHING) == "NOTHING"
    assert type(NOTHING)() is NOTHING
    assert not hasattr(NOTHING, "value")
    assert not hasattr(NOTHING, "__dict__")
    with pytest.raises(AttributeError):
        NOTHING.value = 1


def test_guards_and_predicates_select_exactly_one_branch():
    success, failure = Ok(2), Err("bad")
    calls = []
    assert is_ok(success) and not is_err(success)
    assert is_err(failure) and not is_ok(failure)
    assert is_ok_and(success, lambda value: calls.append(value) is None)
    assert not is_ok_and(failure, lambda value: calls.append(value) is None)
    assert is_err_and(failure, lambda value: calls.append(value) is None)
    assert not is_err_and(success, lambda value: calls.append(value) is None)
    assert calls == [2, "bad"]


def test_map_chain_recover_and_flatten_branch_and_wrapper_identity():
    payload = object()
    success, failure = Ok(payload), Err(payload)
    mapped = map(success, lambda value: value)
    mapped_error = map_err(failure, lambda value: value)
    assert mapped == success and mapped is not success and mapped.value is payload
    assert mapped_error == failure and mapped_error is not failure and mapped_error.error is payload
    assert map(failure, lambda _: None) is failure
    assert map_err(success, lambda _: None) is success
    assert failure.map(lambda _: None) is failure
    assert success.map_err(lambda _: None) is success
    chained = Ok("next")
    recovered = Err("next-error")
    assert and_then(success, lambda _: chained) is chained
    assert and_then(failure, lambda _: chained) is failure
    assert or_else(failure, lambda _: recovered) is recovered
    assert or_else(success, lambda _: recovered) is success
    assert success.and_then(lambda _: chained) is chained
    assert failure.and_then(lambda _: chained) is failure
    assert failure.or_else(lambda _: recovered) is recovered
    assert success.or_else(lambda _: recovered) is success
    nested = Ok(success)
    assert flatten(nested) is success
    assert flatten(failure) is failure
    assert nested.flatten() is success
    assert failure.flatten() is failure


def test_options_construct_new_some_and_reuse_nothing():
    payload = object()
    success, failure = Ok(payload), Err(payload)
    success_option, failure_option = ok(success), err(failure)
    assert isinstance(success_option, Some) and success_option.value is payload
    assert isinstance(failure_option, Some) and failure_option.value is payload
    assert ok(failure) is NOTHING
    assert err(success) is NOTHING
    assert success.ok().value is payload
    assert failure.err().value is payload
    assert failure.ok() is NOTHING
    assert success.err() is NOTHING


def test_match_taps_and_fallback_callbacks_have_exact_counts():
    calls = []
    success, failure = Ok(3), Err(4)
    assert match(success, lambda value: calls.append(("ok", value)) or "yes", lambda _: "no") == "yes"
    assert match(failure, lambda _: "no", lambda error: calls.append(("err", error)) or "yes") == "yes"
    assert tap(success, lambda value: calls.append(("tap", value))) is success
    assert tap(failure, lambda value: calls.append(("wrong", value))) is failure
    assert tap_err(failure, lambda error: calls.append(("tap_err", error))) is failure
    assert tap_err(success, lambda error: calls.append(("wrong", error))) is success
    assert unwrap_or_else(success, lambda error: calls.append(("wrong", error))) == 3
    assert unwrap_or_else(failure, lambda error: calls.append(("fallback", error)) or 5) == 5
    assert calls == [("ok", 3), ("err", 4), ("tap", 3), ("tap_err", 4), ("fallback", 4)]


def test_transpose_has_all_three_exact_branches():
    payload, error = object(), object()
    present = transpose(Ok(Some(payload)))
    failed = transpose(Err(error))
    assert isinstance(present, Some) and isinstance(present.value, Ok)
    assert present.value.value is payload
    assert isinstance(failed, Some) and isinstance(failed.value, Err)
    assert failed.value.error is error
    assert transpose(Ok(NOTHING)) is NOTHING
    method_present = Ok(Some(payload)).transpose()
    method_failed = Err(error).transpose()
    assert isinstance(method_present, Some) and method_present.value.value is payload
    assert method_failed.value.error is error
    assert Ok(NOTHING).transpose() is NOTHING


@pytest.mark.parametrize(
    "operation,result,message,payload",
    [
        (expect, Err("payload"), "custom", "payload"),
        (expect_err, Ok("payload"), "custom", "payload"),
        (unwrap, Err("payload"), "Called unwrap on an Err value", "payload"),
        (unwrap_err, Ok("payload"), "Called unwrap_err on an Ok value", "payload"),
    ],
)
def test_extraction_error_message_and_payload_identity(operation, result, message, payload):
    with pytest.raises(ResultExtractionError) as caught:
        if operation in (expect, expect_err):
            operation(result, message)
        else:
            operation(result)
    assert str(caught.value) == message
    assert caught.value.payload is payload


def test_successful_extraction_and_eager_fallback_preserve_identity():
    value, error, fallback = object(), object(), object()
    assert expect(Ok(value), "unused") is value
    assert unwrap(Ok(value)) is value
    assert expect_err(Err(error), "unused") is error
    assert unwrap_err(Err(error)) is error
    assert unwrap_or(Ok(value), fallback) is value
    assert unwrap_or(Err(error), fallback) is fallback


@pytest.mark.parametrize(
    "invoke",
    [
        lambda callback: is_ok_and(Ok(1), callback),
        lambda callback: is_err_and(Err(1), callback),
        lambda callback: map(Ok(1), callback),
        lambda callback: map_err(Err(1), callback),
        lambda callback: and_then(Ok(1), callback),
        lambda callback: or_else(Err(1), callback),
        lambda callback: tap(Ok(1), callback),
        lambda callback: tap_err(Err(1), callback),
        lambda callback: unwrap_or_else(Err(1), callback),
        lambda callback: Ok(1).is_ok_and(callback),
        lambda callback: Err(1).is_err_and(callback),
        lambda callback: Ok(1).map(callback),
        lambda callback: Err(1).map_err(callback),
        lambda callback: Ok(1).and_then(callback),
        lambda callback: Err(1).or_else(callback),
        lambda callback: Ok(1).tap(callback),
        lambda callback: Err(1).tap_err(callback),
        lambda callback: Err(1).unwrap_or_else(callback),
    ],
)
def test_callback_exception_identity_is_preserved(invoke):
    failure = RuntimeError("callback")

    def callback(_):
        raise failure

    with pytest.raises(RuntimeError) as caught:
        invoke(callback)
    assert caught.value is failure


@pytest.mark.parametrize(
    "invoke",
    [
        lambda callback: match(Ok(1), callback, lambda _: None),
        lambda callback: match(Err(1), lambda _: None, callback),
        lambda callback: Ok(1).match(callback, lambda _: None),
        lambda callback: Err(1).match(lambda _: None, callback),
    ],
)
def test_match_exception_identity_is_preserved(invoke):
    failure = RuntimeError("match callback")

    def callback(_):
        raise failure

    with pytest.raises(RuntimeError) as caught:
        invoke(callback)
    assert caught.value is failure
