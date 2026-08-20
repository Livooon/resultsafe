---
id: cause-exit
sidebar_position: 3
title: Cause and Exit
sidebar_label: Cause and Exit
description: Model complete failures and completed computations without changing Result
---

# Cause and Exit

`Result<T, E>` remains the generic success/error model. `Cause<E>` and
`Exit<T, E>` are separate, optional models for code that must retain more than a
single error value. Existing values such as `Err('not-found')`, domain objects,
and exception objects remain valid `E` values. No Result operation implicitly
wraps or unwraps a Cause.

`Failure` is also optional. It is the structured portable payload required by
the `Die` and `Interrupt` variants, but it does not constrain `Result<T, E>` or
the arbitrary `E` carried by `Fail`.

## Exact algebra

Cause has exactly six variants:

| Variant | Payload | Meaning |
| --- | --- | --- |
| `Empty` | none | A valid absence of cause |
| `Fail` | one arbitrary `E` | Expected typed failure |
| `Die` | one structured `Failure` | Portable unexpected defect |
| `Interrupt` | one structured `Failure` | Portable interruption context |
| `Sequential` | `left`, `right` Causes | Ordered binary composition |
| `Parallel` | `left`, `right` Causes | Concurrent binary composition with deterministic child order |

`Sequential` and `Parallel` are binary. Grouping and child order are
significant: do not flatten, reorder, deduplicate, or re-associate them.

Exit has exactly two variants: `Success(value: T)` and
`Failure(cause: Cause<E>)`. `Exit.Failure(Empty)` is valid. It must not be
rejected, rewritten as success, or assigned an invented error.

`Failure.causes` and Cause answer different questions. `Failure.causes` is
diagnostic ancestry for structured payloads. It must never encode, reconstruct,
or substitute for Cause topology.

## TypeScript API

The implemented constructors create shallow-frozen wrappers and preserve the
supplied `T`, `E`, `Failure`, and child Cause references. They do not deep-freeze
arbitrary payloads.

```ts
import {
  Cause,
  Err,
  Exit,
  Failure,
  exitToResult,
  exitToResultCollapsed,
  matchExit,
  resultToExit,
} from '@resultsafe/core-fp-result';

const defect = Failure({
  schema_version: '1.0.0',
  code: 'urn:example:defect:decoder',
  message_key: 'decoder.defect',
});

const cause = Cause.Sequential(
  Cause.Fail({ code: 'INVALID_HEADER' }),
  Cause.Die(defect),
);
const exit = Exit.Failure(cause);

const complete = exitToResult(exit); // Err<Cause<{ code: string }>>
const collapsed = exitToResultCollapsed(exit, () => ({ code: 'REQUEST_FAILED' }));
const fromResult = resultToExit(Err({ code: 'INVALID_HEADER' }));
const label = matchExit(exit, {
  Success: () => 'success',
  Failure: (failureCause) => failureCause._tag,
});
```

Standalone constructor names are also exported: `CauseEmpty`, `CauseFail`,
`CauseDie`, `CauseInterrupt`, `CauseSequential`, `CauseParallel`, `ExitSuccess`,
and `ExitFailure`. Use `matchCause` and `matchExit` for exhaustive branching and
`isCause` and `isExit` for bounded structural validation of unknown wrappers.

## Python API

Python exposes frozen, slotted dataclass wrappers. Freezing is shallow, so a
mutable arbitrary payload remains the caller's object and retains its identity.

```python
from resultsafe import (
    Die,
    Err,
    ExitFailure,
    Fail,
    Failure,
    Sequential,
    exit_to_cause_result,
    exit_to_result,
    result_to_exit,
)

defect = Failure(
    schema_version="1.0.0",
    code="urn:example:defect:decoder",
    message_key="decoder.defect",
)
cause = Sequential(Fail({"code": "INVALID_HEADER"}), Die(defect))
exit_value = ExitFailure(cause)

complete = exit_to_cause_result(exit_value)
collapsed = exit_to_result(exit_value, lambda _: {"code": "REQUEST_FAILED"})
from_result = result_to_exit(Err({"code": "INVALID_HEADER"}))
```

The six Python Cause classes are `Empty`, `Fail`, `Die`, `Interrupt`,
`Sequential`, and `Parallel`; the Exit classes are `ExitSuccess` and
`ExitFailure`.

## Explicit conversion policy

Result and Exit conversions are always explicit:

| Direction | TypeScript | Python | Failure behavior |
| --- | --- | --- | --- |
| Result to Exit | `resultToExit` | `result_to_exit` | `Err(E)` becomes `Failure(Fail(E))` |
| Exit to complete Result | `exitToResult` | `exit_to_cause_result` | Keeps the complete `Cause<E>` as the error |
| Exit to collapsed Result | `exitToResultCollapsed` | `exit_to_result` | Requires a caller-supplied collapse function |

The constructors, Result-to-Exit conversion, and complete Exit-to-Result
conversion preserve arbitrary `T` and `E` payloads by identity. A collapsed
conversion preserves the successful `T`; its error is exactly whatever object
the collapse policy returns. That policy is mandatory because reducing
`Cause<E>` can lose `Empty`, defect, interruption, composition, grouping, or
order information. Define the policy at the boundary, name the loss, and test
every Cause variant. Never infer collapse behavior from `Failure.causes`.

## Portable boundaries

Runtime identity and portable representation are distinct. A portable Cause
codec needs an explicit codec for arbitrary `E`; a portable Exit codec needs
explicit codecs for both `T` and `E`. A lossless codec preserves tags, binary
grouping, child order, and codec-preserved values, and rejects unknown tags,
unknown fields, cycles, unsupported Failure versions, and resource-limit
violations.

These codecs are boundary requirements, not implemented core features. Codecs
are optional integrations and must live outside the zero-runtime-dependency core
package.

The governed default Cause/Exit limits are depth 32 and 1024 nodes. Treat these
as minimum portable-boundary controls, not as a security qualification. Apply
deployment-specific byte, string, collection, and decoding limits before or
alongside model validation.

Defects and interruptions require explicit mapping:

- Convert a caught defect to a redacted structured `Failure`; never place the
  runtime exception, stack, process path, or private state in `Die`.
- Convert cancellation or interruption context to a redacted structured
  `Failure`; never expose fiber, thread, process, credential, tenant, or secret
  identity in `Interrupt`.
- Use stable public codes and allowlisted details. Redact before construction,
  logging, transport, persistence, or conversion.
- Reject semantic loss rather than inventing a success, defect, interruption,
  or typed error.

## Effect integration boundary

ResultSafe core has no Effect runtime dependency. The compatibility catalog
describes explicit semantic adapter meanings only. It does not claim direct
Effect API compatibility or shared runtime types, constructors, representations,
wire formats, branding, identity, equality, hashing, releases, or security
properties.

No Effect adapter is implemented yet. The following requirements constrain a
future optional integration; they are not instructions for an API that ships
today.

An adapter must explicitly map defects and interruption context to portable
`Failure`, preserve binary Cause topology where representable, and report or
reject loss. If a target cannot represent `Exit.Failure(Empty)`, conversion must
fail explicitly rather than inventing another value.

## Optional storage

Storage is opt-in and derived. The `cause-exit` relational/SQLite profile stores
binary Cause nodes and Exit records only when selected. It requires the
`structured-failure` profile because `Die` and `Interrupt` reference structured
Failure records. Profile dependency resolution must auto-include transitive
requirements or reject the missing dependency. Storage never constrains generic
Result errors and never becomes reverse authority for canonical JSON.

## Practical uses

### Services and APIs

1. Retain validation failures followed by cleanup failures with `Sequential`.
2. Aggregate independent downstream failures with `Parallel`.
3. Preserve a domain error as `Fail(E)` without forcing a wire schema on `E`.
4. Return an `Exit` from a request supervisor that must distinguish completion from failure.
5. Keep `Exit.Failure(Empty)` when an upstream system reports failure without a cause.
6. Collapse a complete Cause to an HTTP error only at the HTTP adapter.

### Jobs and concurrency

7. Record a task cancellation as `Interrupt` with redacted portable context.
8. Record an unexpected worker defect as `Die` without serializing the exception.
9. Preserve left-to-right retry and rollback failures with `Sequential`.
10. Preserve deterministic child positions for two concurrently failed branches.
11. Return successful job output in `Exit.Success` without changing payload identity.
12. Keep a full Cause for diagnostics while exposing a collapsed scheduler error.

### Libraries and boundaries

13. Add optional rich failure reporting without changing a public `Result<T, E>` API.
14. Convert `Err(E)` to `Exit.Failure(Fail(E))` at an explicit integration point.
15. Convert Exit back to `Result<T, Cause<E>>` without discarding information.
16. Require callers to provide collapse policy when an API accepts only one error type.
17. Validate unknown Cause wrappers with bounded traversal before using them.
18. Plan an Effect adapter without adding Effect as a core runtime dependency.

### Transport, audit, and storage

19. Encode custom `E` with a domain-owned codec rather than generic serialization.
20. Encode `T` with a separate codec from `E` for Exit transport.
21. Reject flattened or reordered Cause trees during lossless round trips.
22. Persist Cause/Exit only through the selected `cause-exit` storage profile.
23. Auto-include or reject the required `structured-failure` storage profile.
24. Redact secrets and bound resources before telemetry, audit, or persistence.

## Machine-readable authority

Markdown is explanatory. For the mutable staging corpus, use this read order:

1. `CANON.md`
2. `platform/staging/resultsafe-core-v001/AI-ENTRYPOINT.json`
3. Resolve that entrypoint's UUID `read_order` through
   `platform/staging/resultsafe-core-v001/DOCUMENT-REGISTRY.json` and read every
   listed document in the declared order.

Within that declared order, the focused records are:

1. `platform/staging/resultsafe-core-v001/FAILURE-AUDIT.json`
2. `platform/staging/resultsafe-core-v001/FAILURE-MODEL.json`
3. `platform/staging/resultsafe-core-v001/CAUSE-MODEL.json`
4. `platform/staging/resultsafe-core-v001/EXIT-MODEL.json`
5. `platform/staging/resultsafe-core-v001/EFFECT-COMPATIBILITY.json`
6. `platform/staging/resultsafe-core-v001/CAUSE-EXIT-CONFORMANCE-MATRIX.json`
7. `platform/staging/resultsafe-core-v001/RELATIONAL-SCHEMA.json` and
   `platform/staging/resultsafe-core-v001/SQLITE-PROFILE.json` when storage is in scope

The current staging corpus has 278 scenarios, 34 documents, 35 schemas, 16
Cause/Exit matrix cells, and 88 neutral Result matrix cells. These exact counts
describe mutable staging evidence, not an immutable release or security
qualification.

The 16 Cause/Exit cells are currently a static, non-executable matrix. They
record required coverage but do not demonstrate passing TypeScript or Python
executions.

## Packaging status

Core must keep zero runtime dependencies. Every public module is required to be
importable through both a direct package subpath and the package root, while
codecs, Effect support, storage, and other optional integrations remain separate.
Complete generated subpath exports are still pending, so this direct-import
policy must not yet be reported as fully implemented.
