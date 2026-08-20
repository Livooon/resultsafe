from __future__ import annotations

import importlib
import json
import sys
from typing import Any

sys.path.insert(0, sys.argv[1])
api = importlib.import_module("resultsafe")
with open(sys.argv[2], encoding="utf-8") as cells_file:
    cells: list[dict[str, Any]] = json.load(cells_file)


def invoke(binding: dict[str, str], surface: str, receiver: Any, args: list[Any]) -> Any:
    if surface == "MODULE":
        return getattr(api, binding["module_name"])(receiver, *args)
    return getattr(receiver, binding["method_name"])(*args)


def normalize(value: Any) -> Any:
    if isinstance(value, api.Ok):
        return ["SUCCESS", value.value]
    if isinstance(value, api.Err):
        return ["FAILURE", value.error]
    if isinstance(value, api.Some):
        return ["SOME", normalize(value.value)]
    if value is api.NOTHING:
        return ["NONE"]
    return value


def exercise(cell: dict[str, Any]) -> dict[str, Any]:
    key = cell["operation_key"]
    binding = cell["binding"]
    surface = cell["surface"]
    payload = {"marker": key}
    error = {"marker": f"{key}-error"}
    ok = api.Ok(payload)
    err = api.Err(error)
    calls: list[Any] = []

    def callback(value: Any) -> Any:
        calls.append(value)
        return value

    boom = RuntimeError(f"matrix-{key}")

    def throwing(_: Any) -> Any:
        raise boom

    branch = identity = exception = True
    if key == "construct-success":
        first, second = api.Ok(payload), api.Ok(payload)
        identity = first is not second and first.value is payload
    elif key == "construct-failure":
        first, second = api.Err(error), api.Err(error)
        identity = first is not second and first.error is error
    elif key == "is-failure":
        branch = invoke(binding, surface, err, []) is True and invoke(binding, surface, ok, []) is False
    elif key == "is-success":
        branch = invoke(binding, surface, ok, []) is True and invoke(binding, surface, err, []) is False
    elif key in ("is-failure-and", "is-success-and"):
        eligible, skipped = (err, ok) if key == "is-failure-and" else (ok, err)
        expected = error if key == "is-failure-and" else payload
        def predicate(value: Any) -> bool:
            calls.append(value)
            return True
        branch = invoke(binding, surface, eligible, [predicate]) is True and invoke(binding, surface, skipped, [callback]) is False
        identity = calls == [expected]
        try:
            invoke(binding, surface, eligible, [throwing]); exception = False
        except BaseException as caught:
            exception = caught is boom
    elif key == "chain-success":
        produced = api.Ok(payload)
        branch = invoke(binding, surface, ok, [lambda value: calls.append(value) or produced]) is produced and invoke(binding, surface, err, [callback]) is err
        identity = calls == [payload]
    elif key == "failure-option":
        output = invoke(binding, surface, err, [])
        branch = normalize(output) == ["SOME", error] and normalize(invoke(binding, surface, ok, [])) == ["NONE"]
        identity = output.value is error
    elif key == "success-option":
        output = invoke(binding, surface, ok, [])
        branch = normalize(output) == ["SOME", payload] and normalize(invoke(binding, surface, err, [])) == ["NONE"]
        identity = output.value is payload
    elif key in ("expect-success", "expect-failure"):
        good, bad, expected = (ok, err, payload) if key == "expect-success" else (err, ok, error)
        branch = invoke(binding, surface, good, ["unused"]) is expected
        try:
            invoke(binding, surface, bad, ["matrix"]); exception = False
        except BaseException as caught:
            opposite = error if key == "expect-success" else payload
            exception = isinstance(caught, api.ResultExtractionError) and caught.payload is opposite and str(caught) == "matrix"
    elif key == "flatten-result":
        inner = api.Ok(payload)
        branch = invoke(binding, surface, api.Ok(inner), []) is inner and invoke(binding, surface, err, []) is err
    elif key in ("map-success", "map-failure"):
        eligible, skipped = (ok, err) if key == "map-success" else (err, ok)
        expected_arg, produced = (payload, error) if key == "map-success" else (error, payload)
        result = invoke(binding, surface, eligible, [lambda value: calls.append(value) or produced])
        branch = (result.value is produced if key == "map-success" else result.error is produced) and invoke(binding, surface, skipped, [callback]) is skipped
        identity = calls == [expected_arg] and result is not eligible
    elif key == "match-result":
        branch = invoke(binding, surface, ok, [lambda value: calls.append(["ok", value]) or "ok", lambda value: calls.append(["err", value]) or "err"]) == "ok"
        branch = branch and invoke(binding, surface, err, [lambda value: calls.append(["ok", value]) or "ok", lambda value: calls.append(["err", value]) or "err"]) == "err"
        identity = calls == [["ok", payload], ["err", error]]
    elif key == "recover-failure":
        produced = api.Ok(payload)
        branch = invoke(binding, surface, err, [lambda value: calls.append(value) or produced]) is produced and invoke(binding, surface, ok, [callback]) is ok
        identity = calls == [error]
    elif key in ("tap-success", "tap-failure"):
        eligible, skipped = (ok, err) if key == "tap-success" else (err, ok)
        expected = payload if key == "tap-success" else error
        branch = invoke(binding, surface, eligible, [callback]) is eligible and invoke(binding, surface, skipped, [callback]) is skipped
        identity = calls == [expected]
    elif key == "transpose-result-option":
        output = invoke(binding, surface, api.Ok(api.Some(payload)), [])
        branch = normalize(output) == ["SOME", ["SUCCESS", payload]]
        branch = branch and normalize(invoke(binding, surface, api.Ok(api.NOTHING), [])) == ["NONE"]
        branch = branch and normalize(invoke(binding, surface, err, [])) == ["SOME", ["FAILURE", error]]
        identity = output.value.value is payload
    elif key in ("unwrap-success", "unwrap-failure"):
        good, bad, expected = (ok, err, payload) if key == "unwrap-success" else (err, ok, error)
        branch = invoke(binding, surface, good, []) is expected
        try:
            invoke(binding, surface, bad, []); exception = False
        except BaseException as caught:
            opposite = error if key == "unwrap-success" else payload
            exception = isinstance(caught, api.ResultExtractionError) and caught.payload is opposite
    elif key == "unwrap-or":
        branch = invoke(binding, surface, ok, [error]) is payload and invoke(binding, surface, err, [payload]) is payload
    elif key == "unwrap-or-else":
        branch = invoke(binding, surface, ok, [callback]) is payload and invoke(binding, surface, err, [lambda value: calls.append(value) or payload]) is payload
        identity = calls == [error]
    else:
        raise AssertionError(f"unsupported neutral operation {key}")

    callback_operations = {"is-failure-and", "is-success-and", "chain-success", "map-success", "map-failure", "match-result", "recover-failure", "tap-success", "tap-failure", "unwrap-or-else"}
    if key in callback_operations and exception:
        eligible = ok if key not in {"is-failure-and", "map-failure", "recover-failure", "tap-failure", "unwrap-or-else"} else err
        args = [throwing, callback] if key == "match-result" else [throwing]
        try:
            invoke(binding, surface, eligible, args); exception = False
        except BaseException as caught:
            exception = caught is boom
    if not branch or not identity or not exception:
        raise AssertionError(f"{cell['cell_key']}: branch={branch} identity={identity} exception={exception}")

    def law_status(law: str) -> bool:
        if law == "result-exclusive-branch":
            return isinstance(api.Ok(payload), api.Ok) and isinstance(api.Err(error), api.Err)
        if law == "map-identity":
            return normalize(api.map(ok, lambda value: value)) == normalize(ok) and normalize(api.map(err, lambda value: value)) == normalize(err)
        if law == "tap-identity":
            return api.tap(ok, lambda _: None) is ok and api.tap_err(err, lambda _: None) is err
        if law == "flatten-chain":
            next_result = lambda value: api.Ok(value)
            return normalize(api.and_then(ok, next_result)) == normalize(api.flatten(api.map(ok, next_result)))
        if law == "match-single-callback":
            law_calls: list[Any] = []
            api.match(ok, lambda value: law_calls.append(value), lambda value: law_calls.append(value))
            return law_calls == [payload]
        raise AssertionError(f"unsupported law {law}")

    law_results = [{"law_key": law, "status": "PASS" if law_status(law) else "FAIL"} for law in cell["law_keys"]]
    if any(item["status"] != "PASS" for item in law_results):
        raise AssertionError(f"{cell['cell_key']}: law failure")
    return {"cell_key": cell["cell_key"], "outcome": {
        "branch_outcomes": "PASS", "callback_contract": "PASS", "exception_contract": "PASS",
        "wrapper_payload_identity": "PASS", "laws": law_results,
        "positive_types": "NOT_ASSESSED_OPERATION_SPECIFIC", "negative_types": "NOT_ASSESSED_OPERATION_SPECIFIC",
    }}


print(json.dumps([exercise(cell) for cell in cells], separators=(",", ":")))
