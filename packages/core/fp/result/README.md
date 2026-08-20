# @resultsafe/core-fp-result

<a id="top"></a>

![ResultSafe Logo](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/docs/assets/logo.svg)

## 🤖 AI Context

This package implements the `Result<T, E>` pattern for explicit error handling without `try/catch`.

- **Rust analogue:** `std::result::Result`
- **Scala analogue:** `Either`
- **Core principle:** Error is a value, not an exception.

[![npm version](https://img.shields.io/npm/v/@resultsafe/core-fp-result.svg)](https://www.npmjs.com/package/@resultsafe/core-fp-result)
[![npm downloads](https://img.shields.io/npm/dm/@resultsafe/core-fp-result.svg)](https://www.npmjs.com/package/@resultsafe/core-fp-result)
[![license](https://img.shields.io/npm/l/@resultsafe/core-fp-result.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![docs](https://img.shields.io/badge/docs-api-informational.svg)](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/README.md)
[![build status](https://img.shields.io/badge/build-local%20verified-success.svg)](./package.json)
[![monorepo](https://img.shields.io/badge/monorepo-resultsafe%2Fmonorepo-0A0A0A.svg)](https://github.com/Livooon/resultsafe)

A Rust-inspired Result package for explicit, composable, and type-friendly APIs in TypeScript and JavaScript.

**Language:** English | [Русский](https://github.com/resultsafe/monorepo/blob/main/packages/core/fp/result/README.ru.md)

**Documentation:** [API index](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/README.md) · [Modules](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/modules.md)

---

## Contents

- [Why this package](#why-this-package)
- [Monorepo context](#monorepo-context)
- [Key features](#key-features)
- [Package](#package)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Core API overview](#core-api-overview)
- [Build and distribution formats](#build-and-distribution-formats)
- [Monorepo and package structure](#monorepo-and-package-structure)
- [When to use this project](#when-to-use-this-project)
- [Documentation for developers](#documentation-for-developers)
- [Documentation links](#documentation-links)
- [License](#license)

---

## Why this package

`@resultsafe/core-fp-result` provides explicit success/error flows instead of hidden control paths and exception-first branching.

Its core package, [`@resultsafe/core-fp-result`](https://www.npmjs.com/package/@resultsafe/core-fp-result), provides a Rust-inspired `Result` API for TypeScript and JavaScript with:

- explicit `Ok` / `Err`
- predictable functional composition
- safe branching through guards and matching
- disciplined extraction APIs
- advanced refinement utilities for typed variants and strict matching

The goal is not to imitate Rust mechanically, but to bring the same clarity of intent to Node.js libraries: explicit values, predictable branching, and APIs organized for long-term maintenance.

---

## Monorepo context

`@resultsafe/core-fp-result` is the TypeScript/JavaScript package inside the multilingual `resultsafe/monorepo`.

The monorepo applies one language-neutral Contract IR across language-specific projections. TypeScript/JavaScript is the production package track; a Python runtime is implemented and staged rather than merely planned. Implementation and passing tests are evidence, not conformance: cross-language operations correspond by `operation_key`, and a conforming language must expose every applicable operation through both module-callable and instance-method surfaces. See the root [`CANON.md`](../../../../CANON.md).

---

## Key features

- Rust-inspired `Result` model for TypeScript and JavaScript.
- Explicit constructors via `Ok` and `Err`.
- Composable transformations with APIs such as `map`, `mapErr`, `andThen`, and `orElse`.
- Safe branching through guards like `isOk`, `isErr`, `isOkAnd`, `isErrAnd`, and matching helpers.
- Controlled extraction with `unwrap`, `unwrapOr`, `unwrapErr`, `expect`, and `expectErr`.
- Advanced refinement layer for typed variants, strict matching, and result narrowing.
- Coherent module structure instead of a flat utility dump.
- Optional portable `Failure` payload with stable URI codes; generic `E` remains unrestricted.
- Optional six-variant `Cause<E>` and two-variant `Exit<T, E>` models with explicit Result conversions.
- Type output for TypeScript users for better DX and safer integrations.
- Flexible distribution formats with Types, ESM, CJS, and UMD builds.

### Optional structured Failure

Use `Failure` only when a boundary needs stable machine identity, portable JSON
facets, bounded validation, and explicit causes:

```ts
const result = Err(Failure({
  schema_version: '1.0.0',
  code: 'https://errors.example/not-found',
  message_key: 'errors.not_found',
}));
```

`Result<T, E>` is unchanged: strings, domain objects, and other error payloads
remain valid. No arbitrary `E` is converted implicitly. See
[`docs/result-data.md`](docs/result-data.md) for the transport branch and the
canonical `FAILURE-MODEL.json` for structured payload semantics.

### Optional Cause and Exit

`Cause<E>` retains expected failures, portable defects, portable interruptions,
and binary composition without changing generic `Result<T, E>`. Its exact
variants are `Empty`, `Fail`, `Die`, `Interrupt`, `Sequential`, and `Parallel`.
`Exit<T, E>` has `Success` and `Failure`; `Exit.Failure(Cause.Empty())` is valid.

```ts
import {
  Cause,
  Err,
  Exit,
  Failure,
  exitToResult,
  exitToResultCollapsed,
  resultToExit,
} from '@resultsafe/core-fp-result';

const interrupted = Failure({
  schema_version: '1.0.0',
  code: 'urn:example:interrupted',
});
const cause = Cause.Sequential(
  Cause.Fail('write-failed'),
  Cause.Interrupt(interrupted),
);
const exit = Exit.Failure(cause);

const complete = exitToResult(exit);
const collapsed = exitToResultCollapsed(exit, () => 'operation-failed');
const projected = resultToExit(Err('write-failed'));
```

The TypeScript Cause/Exit constructors shallow-freeze their wrappers and retain
arbitrary payload and child references. `resultToExit` preserves `T`/`E` by
identity; `exitToResult` keeps the complete Cause; `exitToResultCollapsed`
requires an explicit collapse policy. `Failure.causes` is diagnostic ancestry,
not Cause topology.

ResultSafe core has no Effect runtime dependency. Effect interoperability means
explicit semantic adapters only, not direct API, runtime type, representation,
wire-format, identity, release, or security compatibility. See the
[Cause and Exit guide](../../../../docs/docs/guides/03-cause-exit.md).

---

## Package

### `@resultsafe/core-fp-result`

A focused Result library for explicit error handling and FP-style composition.

Every neutral Result operation is available in two equivalent forms:

```ts
map(result, transform);
result.map(transform);
```

The canonical identity is the Contract IR `operation_key`, not either spelling.
The `success-option` operation is exposed as `ok(result)` and
`result.toOption()` because `result.ok` is the required boolean discriminator.
See [`CANON.md`](../../../../CANON.md) for the complete cross-language rule.

It is designed for developers who want:

- clear success/error modeling
- predictable transformations
- explicit branching and extraction
- better readability in error-heavy flows
- a structured Rust-inspired API surface in TypeScript/JavaScript

---

## Installation

### Package

```bash
pnpm add @resultsafe/core-fp-result

# Alternative
npm install @resultsafe/core-fp-result
```

### Monorepo

```bash
pnpm install
```

---

## Quick start

A typical Result flow starts with explicit constructors and then composes through functions rather than implicit exception paths.

```ts
import { Ok, map, unwrapOr } from '@resultsafe/core-fp-result';

const initial = Ok(21);
const doubled = map(initial, (value) => value * 2);
const finalValue = unwrapOr(doubled, 0);

console.log(finalValue); // 42
```

### Basic `Ok` / `Err` example

```ts
import { Ok, Err, match } from '@resultsafe/core-fp-result';

const parsePort = (input: string) => {
  const port = Number(input);
  return Number.isInteger(port) && port > 0 ? Ok(port) : Err('Invalid port');
};

const result = parsePort('3000');
const message = match(
  result,
  (value) => `Port: ${value}`,
  (error) => `Error: ${error}`,
);

console.log(message);
```

---

## API Reference

### Core Functions

| Function    | Signature                     | Description                         | GitHub                                                                                                 | Raw                                                                                                              |
| ----------- | ----------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `Ok`        | `(value: T) => Result<T, E>`  | Success constructor                 | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/constructors/Ok.ts)   | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/constructors/Ok.ts)   |
| `Err`       | `(error: E) => Result<T, E>`  | Error constructor                   | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/constructors/Err.ts)  | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/constructors/Err.ts)  |
| `match`     | `(r, onOk, onErr) => U`       | Branch on result                    | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/match.ts)     | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/match.ts)     |
| `andThen`   | `(r, fn) => Result<U, E>`     | Chain (flatMap)                     | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/andThen.ts)   | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/andThen.ts)   |
| `map`       | `(r, fn) => Result<U, E>`     | Transform success value             | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/map.ts)       | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/map.ts)       |
| `mapErr`    | `(r, fn) => Result<T, U>`     | Transform error value               | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/mapErr.ts)    | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/mapErr.ts)    |
| `orElse`    | `(r, fn) => Result<T, U>`     | Recover from error                  | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/orElse.ts)    | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/orElse.ts)    |
| `unwrap`    | `(r) => T`                    | Extract value or throw              | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/unwrap.ts)    | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrap.ts)    |
| `unwrapOr`  | `(r, fallback: T) => T`       | Extract value or default            | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/unwrapOr.ts)  | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/unwrapOr.ts)  |
| `expect`    | `(r, msg: string) => T`       | Extract value or throw with message | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/expect.ts)    | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/expect.ts)    |
| `isOk`      | `(r) => boolean`              | Check if success                    | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/guards/isOk.ts)       | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isOk.ts)       |
| `isErr`     | `(r) => boolean`              | Check if error                      | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/guards/isErr.ts)      | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/guards/isErr.ts)      |
| `tap`       | `(r, fn) => Result<T, E>`     | Side effect on success              | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/tap.ts)       | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/tap.ts)       |
| `tapErr`    | `(r, fn) => Result<T, E>`     | Side effect on error                | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/tapErr.ts)    | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/tapErr.ts)    |
| `transpose` | `(r) => Option<Result<T, E>>` | Result<Option> to Option<Result>    | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/transpose.ts) | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/transpose.ts) |
| `flatten`   | `(r) => Result<T, E>`         | Flatten nested Result               | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/methods/flatten.ts)   | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/methods/flatten.ts)   |

### Cause and Exit API

| API | Purpose |
| --- | --- |
| `Cause.Empty`, `Cause.Fail`, `Cause.Die`, `Cause.Interrupt` | Construct Cause leaves |
| `Cause.Sequential`, `Cause.Parallel` | Construct exact binary composition |
| `Exit.Success`, `Exit.Failure` | Construct an Exit, including failure with Empty Cause |
| `matchCause`, `matchExit` | Exhaustively match the variants |
| `isCause`, `isExit` | Validate unknown wrappers with bounded Cause traversal |
| `resultToExit` | Convert Result explicitly; `Err(E)` becomes `Failure(Fail(E))` |
| `exitToResult` | Convert without loss to `Result<T, Cause<E>>` |
| `exitToResultCollapsed` | Convert with a mandatory caller-supplied collapse policy |

### Advanced: Refiners

| Function             | Description                 | GitHub                                                                                                           | Raw                                                                                                                        |
| -------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `isTypedVariant`     | Type guard for variant      | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/refiners/isTypedVariant.ts)     | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/isTypedVariant.ts)     |
| `matchVariant`       | Match variant with handlers | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/refiners/matchVariant.ts)       | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/matchVariant.ts)       |
| `matchVariantStrict` | Strict variant matching     | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/refiners/matchVariantStrict.ts) | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/matchVariantStrict.ts) |
| `refineResult`       | Sync result refinement      | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/refiners/refineResult.ts)       | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineResult.ts)       |
| `refineAsyncResult`  | Async result refinement     | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/refiners/refineAsyncResult.ts)  | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/refiners/refineAsyncResult.ts)  |

### Type Aliases

| Type               | Description                   | GitHub                                                                                                               | Raw                                                                                                                            |
| ------------------ | ----------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `Result<T, E>`     | Base success/error type       | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/types/core/Result.ts)               | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/core/Result.ts)               |
| `Option<T>`        | Optional value type           | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/types/core/Option.ts)               | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/core/Option.ts)               |
| `VariantConfig`    | Variant configuration type    | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/types/refiners/VariantConfig.ts)    | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/VariantConfig.ts)    |
| `ValidatorFn<T>`   | Sync validator function type  | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/types/refiners/ValidatorFn.ts)      | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/ValidatorFn.ts)      |
| `AsyncValidatorFn` | Async validator function type | [🔗](https://github.com/Livooon/resultsafe/blob/main/packages/core/fp/result/src/types/refiners/AsyncValidatorFn.ts) | [📄](https://raw.githubusercontent.com/Livooon/resultsafe/main/packages/core/fp/result/src/types/refiners/AsyncValidatorFn.ts) |

> **Full API:** [All modules](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/modules.md) · [Constructors](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/constructors/index.md) · [Guards](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/guards/index.md) · [Methods](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/methods/index.md) · [Refiners](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/refiners/index.md)

---

## Examples

### Example 1: Basic Usage

```typescript
import { Ok, Err, match } from '@resultsafe/core-fp-result';

const result = Ok(42);
match(
  result,
  (value) => console.log(value),
  (error) => console.error(error),
);
```

### Example 2: Error Handling

```typescript
import { Ok, Err } from '@resultsafe/core-fp-result';

const divide = (a: number, b: number) =>
  b === 0 ? Err('Division by zero') : Ok(a / b);

const result = divide(10, 0);
// Err("Division by zero")
```

### Example 3: Chaining Operations

```typescript
import { Ok, andThen, map } from '@resultsafe/core-fp-result';

const result = Ok(5);
const doubled = andThen(result, (x) => Ok(x * 2));
const squared = map(doubled, (x) => x ** 2);
```

---

## Ecosystem

- `@resultsafe/core-fp-option` — Option/Maybe type
- `@resultsafe/core-fp-either` — Either type
- `@resultsafe/core-fp-result` — This package (Result type)

All packages follow the same API design pattern.

---

## Build and distribution formats

- Types: `build:types`
- ESM: `build:esm`
- CJS: `build:cjs`
- UMD: `build:umd`

This package ships typed declarations and multiple runtime module formats for broad compatibility.

---

## Monorepo and package structure

```txt
src/
  constructors/
  guards/
  methods/
  refiners/
    types/
    utils/
  internal/
  index.ts
```

---

## When to use this project

Use this project when you want:

- explicit success/error modeling
- predictable FP-style composition
- visible control flow
- stronger type-guided result handling in TypeScript
- advanced refinement tools for typed variants and strict result matching

---

## Documentation for developers

This package includes comprehensive documentation for developers working with the codebase:

### AI-Optimized JSDoc Standard

The package uses an AI-optimized JSDoc documentation standard designed for:

- **RAG systems** — Retrieval-Augmented Generation, vector search (Google NotebookLM, LangChain)
- **LLM training** — Fine-tuning, code completion, instruction tuning
- **Code Search** — Semantic search (GitHub Copilot, Cursor, Sourcegraph)
- **Auto-complete** — Context-aware suggestions
- **Human developers** — Readability, navigation, learning

**Documentation:** [`__examples__/AI_JSDOC_STANDARD.md`](./__examples__/AI_JSDOC_STANDARD.md)

### CI/CD Integration

Examples are validated through GitHub Actions workflow:

- **AI JSDoc JSON validation** — Validates `@ai` JSON structure in all example files
- **ESLint checks** — Ensures code quality and JSDoc presence
- **Type checking** — Validates TypeScript syntax in examples
- **Automated testing** — Runs example tests on push/PR

**Documentation:** [`__examples__/CI_CD_INTEGRATION.md`](./__examples__/CI_CD_INTEGRATION.md)

### Example structure

Examples are organized into structured directories:

- `00-quick-start/` — Getting started examples
- `01-api-reference/` — API documentation with examples
- `02-patterns/` — Real-world usage patterns

---

## Documentation links

- [API entry (README)](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/README.md)
- [API entry (index)](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/index.md)
- [Modules](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/modules.md)
- [Constructors module](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/constructors/index.md)
- [Guards module](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/guards/index.md)
- [Methods module](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/methods/index.md)
- [Refiners module](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/refiners/index.md)
- [Type aliases module](https://unpkg.com/@resultsafe/core-fp-result@latest/docs/api/type-aliases/index.md)

---

Back to top: [@resultsafe/core-fp-result](#top)

---

## Author

Denis Savasteev

---

## License

[MIT](./LICENSE)
