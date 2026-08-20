---
id: structured-failure
sidebar_position: 2
title: Structured Failure
sidebar_label: Structured Failure
---

# Optional structured Failure

ResultSafe keeps `Result<T, E>` generic. `Failure` is an optional portable error
payload, not a base class and not a constraint on `E`:

```ts
import { Err, Failure } from '@resultsafe/core-fp-result';

const result = Err(Failure({
  schema_version: '1.0.0',
  code: 'https://errors.example/users/not-found',
  message_key: 'users.not_found',
  details: { user_id: 'public-id' },
}));
```

Existing values such as `Err('not-found')` and `Err(new DomainError())` remain
valid. ResultSafe never converts them to `Failure` implicitly.

## Lightweight core

Structured failure does not relax the core package invariant: core has zero
runtime dependencies, optional integrations stay separate, and public APIs must
be available from the package root and a direct module subpath. Complete
generated subpath exports are still pending, so use the package-root import
shown above unless a particular subpath is present in the installed package's
`exports` map.

## Required fields

- `schema_version`: currently the literal `1.0.0`.
- `code`: an absolute URI owned by the defining domain.

`message`, localization data, JSON details, ordered causes, classification,
metadata, and URI-keyed extensions are optional. A message is presentation,
not identity. HTTP status, RPC status, retry authorization, and exception class
are adapter decisions and are never inferred by the core model.

`Failure.causes` is diagnostic ancestry only. It does not represent, rebuild,
or replace the binary topology of [`Cause`](./03-cause-exit.md).

## Security boundary

Portable facets are public-boundary data. Do not include secrets, credentials,
stack traces, process paths, raw exceptions, or private tenant data. The
TypeScript constructor validates JSON values, rejects cycles and unknown fields,
clones input, freezes the result, and enforces a bounded resource profile.
These controls support portable validation; they are not a security
qualification. Redact at the producing boundary before constructing `Failure`.

## Python

```python
from resultsafe import Err, Failure, to_failure_data

failure = Failure(
    schema_version="1.0.0",
    code="https://errors.example/users/not-found",
    message_key="users.not_found",
)
result = Err(failure)
wire_value = to_failure_data(failure)
```

## Authority and evidence

The machine-readable authority is
`platform/staging/resultsafe-core-v001/FAILURE-MODEL.json`, validated by
`schemas/failure-model.schema.json` and `schemas/failure.schema.json`. The
comparative evidence and weighted decision are in `FAILURE-AUDIT.json`.
Markdown is explanatory and cannot override those staging records.

## Next step

Use [Cause and Exit](./03-cause-exit.md) when a single structured payload is not
enough to retain typed failures, defects, interruptions, or binary composition.
