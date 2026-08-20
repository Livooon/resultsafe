# resultsafe

`resultsafe` is the derived Python runtime projection of the canonical
ResultSafe neutral Result and Option contracts. It provides frozen, slotted
generic values and has no runtime dependencies.

`Ok` and `Err` expose the 21 canonical non-constructor operations as typed
snake_case instance methods. The same snake_case operations remain available
as root-level free functions for compatibility and module-oriented use. The
method and function surfaces delegate to the same semantics: inactive branches
do not call callbacks, pass-through branches retain wrapper identity, and
constructed values retain payload identity.

```python
from resultsafe import Ok, map

method_result = Ok(2).map(lambda value: value * 3)
function_result = map(Ok(2), lambda value: value * 3)
assert method_result == function_result == Ok(6)
```

The canonical method names are `is_err`, `is_err_and`, `is_ok`, `is_ok_and`,
`and_then`, `err`, `expect`, `expect_err`, `flatten`, `map`, `map_err`, `match`,
`ok`, `or_else`, `tap`, `tap_err`, `transpose`, `unwrap`, `unwrap_err`,
`unwrap_or`, and `unwrap_or_else`. Type information is shipped in `py.typed`.
# ResultData transport

Runtime `Ok` and `Err` values are frozen slotted dataclasses. Use
`to_result_data`, `from_result_data`, or `hydrate_result` for the explicit
`{"ok": true, "value": ...}` / `{"ok": false, "error": ...}` transport
representation. `dataclasses.asdict()` is dataclass introspection and omits the
Result discriminator, so it is not the ResultData transport format.

# Optional structured Failure

`Failure` is an optional payload for `Err[Failure]`; it does not constrain the
generic `Result[T, E]` error type. It requires `schema_version="1.0.0"` and an
absolute-URI `code`. Use `to_failure_data()` for an omission-preserving portable
mapping. Messages, details, causes, classification, metadata, and extensions
must be treated as public-boundary data and must not contain secrets or stack
traces.

# Optional Cause and Exit

`Cause[E]` and `Exit[T, E]` are separate opt-in models; `Result[T, E]` remains
generic. Cause has exactly `Empty`, `Fail`, `Die`, `Interrupt`, `Sequential`,
and `Parallel`. `Sequential` and `Parallel` are binary and preserve grouping and
child order. Exit has exactly `ExitSuccess` and `ExitFailure`, and
`ExitFailure(Empty())` is valid.

```python
from resultsafe import (
    Empty,
    Err,
    ExitFailure,
    Fail,
    Failure,
    Interrupt,
    Sequential,
    exit_to_cause_result,
    exit_to_result,
    result_to_exit,
)

interruption = Failure(
    schema_version="1.0.0",
    code="urn:example:interrupted",
)
cause = Sequential(Fail("write-failed"), Interrupt(interruption))
exit_value = ExitFailure(cause)

complete = exit_to_cause_result(exit_value)
collapsed = exit_to_result(exit_value, lambda _: "operation-failed")
projected = result_to_exit(Err("write-failed"))
empty_failure = ExitFailure(Empty())
```

The frozen, slotted dataclass wrappers are shallow: arbitrary `T` and `E`
objects retain identity and are not recursively frozen. `result_to_exit`
preserves payload identity, `exit_to_cause_result` keeps the complete Cause, and
`exit_to_result` requires an explicit collapse function. `Failure.causes` is
diagnostic ancestry only and never substitutes for Cause topology.

Portable defect and interruption adapters must construct redacted `Failure`
values instead of carrying exception, stack, fiber, thread, or process objects.
Cause validation is bounded to depth 32 and 1024 nodes. These are portable
resource controls, not a security qualification. The core runtime has no Effect
dependency and does not claim direct Effect API compatibility.
