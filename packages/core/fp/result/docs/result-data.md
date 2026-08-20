# ResultData transport schema and migration

`ResultData<T, E>` is the data-only, language-neutral wrapper representation:

```ts
type ResultData<T, E> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: E };
```

The wrapper contains no methods. `Result<T, E>` is the runtime projection with
non-enumerable methods on a shared prototype. Both wrappers are shallow-frozen;
payload serializability, cloneability, and immutability are the caller's
responsibility.

## TypeScript API

- `toResultData(result)` and `result.toResultData()` allocate frozen plain data.
- `fromResultData(data)` always allocates a local frozen methodful wrapper.
- `hydrateResult(value)` reuses a local canonical Result and rewraps ResultData
  or a Result created by another installed package copy.
- Every free Result operation accepts `ResultLike<T, E>`, defined as
  `Result<T, E> | ResultData<T, E>`.
- Every free operation whose return type is Result returns a canonical local
  methodful wrapper. Pass-through identity is retained only for a local Result.

`JSON.stringify`, object spread, `Object.assign`, and `structuredClone` copy
enumerable branch fields, not prototype methods. Their outputs must be treated
as untrusted or data-only values and explicitly typed/validated before calling
`fromResultData` or `hydrateResult`. TypeScript cannot prove that nested
payloads survive JSON or structured clone semantics.

## Equality and copies

ResultSafe defines branch and payload equality semantics, not JavaScript object
reference equality across serialization or package copies. Hydration preserves
payload references when the input boundary does, but produces a new wrapper for
data and foreign-copy wrappers. No `instanceof` cross-copy guarantee is made.

## Migration

Before:

```ts
const copied: Result<number, string> = { ...Ok(1) }; // methods are absent
```

After:

```ts
const data: ResultData<number, string> = { ...Ok(1) };
const runtime: Result<number, string> = hydrateResult(data);
runtime.map((value) => value + 1);
```

`@resultsafe/core-fp-result-shared` is retained as a transport-only declaration
package. Its legacy `Result`, `Ok`, and `Err` names are deprecated aliases for
`ResultData`, `OkData`, and `ErrData`; it does not provide runtime methods.
