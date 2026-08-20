from typing import Literal, assert_type

from resultsafe import Cause, Die, Empty, Err, Exit, ExitFailure, ExitSuccess, Fail, Failure, Interrupt, NOTHING, Ok, Option, Parallel, PayloadCodec, Result, Sequential, Some, decode_cause, decode_exit, encode_cause, encode_exit, exit_to_cause_result, exit_to_result, map, result_to_exit, transpose, unwrap_or_else
from resultsafe._core import _Nothing

result: Result[int, str] = Ok(1)
structured_failure: Result[int, Failure] = Err(Failure(schema_version="1.0.0", code="urn:example:error"))
option: Option[int] = Some(1)
empty: Option[int] = NOTHING
nested: Result[Option[int], str] = Ok(option)
cause: Cause[str] = Sequential(Fail("first"), Parallel(Empty(), Fail("second")))
defect: Cause[str] = Die(Failure(schema_version="1.0.0", code="urn:example:defect"))
interruption: Cause[str] = Interrupt(Failure(schema_version="1.0.0", code="urn:example:interrupt"))
covariant_cause: Cause[object] = Fail("error")
covariant_exit_success: Exit[object, str] = ExitSuccess(1)
covariant_exit_failure: Exit[int, object] = ExitFailure(Fail("error"))
exit_value: Exit[int, str] = ExitFailure(cause)
successful_exit: Exit[int, str] = ExitSuccess(1)


class IntCodec(PayloadCodec[int]):
    def encode(self, value: int) -> object:
        return value

    def decode(self, value: object) -> int:
        assert type(value) is int
        return value


class StrCodec(PayloadCodec[str]):
    def encode(self, value: str) -> object:
        return value

    def decode(self, value: object) -> str:
        assert type(value) is str
        return value


int_codec = IntCodec()
str_codec = StrCodec()
assert_type(encode_cause(cause, str_codec), dict[str, object])
assert_type(decode_cause({"tag": "Empty"}, str_codec), Cause[str])
assert_type(encode_exit(successful_exit, int_codec, str_codec), dict[str, object])
assert_type(decode_exit({"tag": "Success", "value": 1}, int_codec, str_codec), Exit[int, str])


def convert_exit(value: Exit[int, str]) -> None:
    assert_type(exit_to_cause_result(value), Result[int, Cause[str]])
    assert_type(exit_to_result(value, repr), Result[int, str])

assert_type(map(result, lambda value: str(value)), Result[str, str])
assert_type(unwrap_or_else(result, len), int)
assert_type(transpose(nested), Option[Result[int, str]])
assert_type(empty, Option[int])
assert_type(result_to_exit(result), Exit[int, str])
assert_type(defect, Cause[str])
assert_type(interruption, Cause[str])
assert_type(successful_exit, Exit[int, str])

success: Ok[int] = Ok(1)
failure: Err[str] = Err("error")


def positive(value: int) -> bool:
    return value > 0


def nonempty(error: str) -> bool:
    return bool(error)


def next_result(value: int) -> Result[str, str]:
    return Ok(str(value))


def recover(error: str) -> Result[int, float]:
    return Err(float(len(error)))


assert_type(success.is_err(), Literal[False])
assert_type(failure.is_err(), Literal[True])
assert_type(success.is_ok(), Literal[True])
assert_type(failure.is_ok(), Literal[False])
assert_type(success.is_ok_and(positive), bool)
assert_type(failure.is_err_and(nonempty), bool)
assert_type(success.and_then(next_result), Result[str, str])
assert_type(failure.and_then(next_result), Err[str])
assert_type(success.err(), _Nothing)
assert_type(failure.err(), Some[str])
assert_type(success.expect("message"), int)
assert_type(failure.expect_err("message"), str)
nested_success: Ok[Result[int, str]] = Ok(Ok(1))
assert_type(nested_success.flatten(), Result[int, str])
assert_type(failure.flatten(), Err[str])
assert_type(success.map(str), Ok[str])
assert_type(failure.map(str), Err[str])
assert_type(success.map_err(len), Ok[int])
assert_type(failure.map_err(len), Err[int])
assert_type(success.match(str, len), str)
assert_type(failure.match(str, len), int)
assert_type(success.ok(), Some[int])
assert_type(failure.ok(), _Nothing)
assert_type(success.or_else(recover), Ok[int])
assert_type(failure.or_else(recover), Result[int, float])
assert_type(success.tap(print), Ok[int])
assert_type(failure.tap_err(print), Err[str])
optional_success: Ok[Option[int]] = Ok(option)
assert_type(optional_success.transpose(), Option[Ok[int]])
assert_type(failure.transpose(), Some[Err[str]])
assert_type(success.unwrap(), int)
assert_type(failure.unwrap_err(), str)
assert_type(success.unwrap_or("fallback"), int)
assert_type(failure.unwrap_or(2), int)
assert_type(success.unwrap_or_else(len), int)
assert_type(failure.unwrap_or_else(len), int)
assert_type(result.map(str), Result[str, str])
