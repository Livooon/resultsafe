from hypothesis import given, strategies as st

from resultsafe import Err, Ok, and_then, flatten, is_err, is_ok, map, match, tap, tap_err


results = st.one_of(st.integers().map(Ok), st.text().map(Err))


@given(results)
def test_result_exclusive_branch_law(result):
    assert int(is_ok(result)) + int(is_err(result)) == 1
    assert int(result.is_ok()) + int(result.is_err()) == 1


@given(results)
def test_map_identity_law(result):
    assert map(result, lambda value: value) == result
    assert result.map(lambda value: value) == result


@given(results)
def test_tap_identity_law(result):
    assert tap(result, lambda _: None) is result
    assert tap_err(result, lambda _: None) is result
    assert result.tap(lambda _: None) is result
    assert result.tap_err(lambda _: None) is result


@given(results)
def test_flatten_chain_law(result):
    callback = lambda value: Ok(value + 1)
    assert and_then(result, callback) == flatten(map(result, callback))
    assert result.and_then(callback) == result.map(callback).flatten()


@given(results)
def test_match_single_callback_law(result):
    calls = []
    match(result, lambda value: calls.append(("ok", value)), lambda error: calls.append(("err", error)))
    assert len(calls) == 1
    calls.clear()
    result.match(lambda value: calls.append(("ok", value)), lambda error: calls.append(("err", error)))
    assert len(calls) == 1
