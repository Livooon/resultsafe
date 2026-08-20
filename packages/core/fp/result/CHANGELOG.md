# Changelog

## 0.3.0

### Minor Changes

- Introduce the breaking 0.3.0 Result runtime: split transport-safe ResultData from methodful Result values; add the complete instance method surface and explicit hydration; preserve failures with ResultExtractionError causes; strengthen refiners and matchers; and document migration for prototypes, serialization, cloning, shared types, Option conversion, and temporary compatibility aliases.

Version `0.3.0` is prepared in the local workspace as an unpublished release candidate.

### Additional release-candidate details

- Add the optional public `Cause<E>` and `Exit<T, E>` APIs, exhaustive matching,
  bounded guards, and explicit lossless or policy-driven Result conversions.
- Add optional structured `Failure`, bounded validation, and `isFailure` while preserving arbitrary generic error payloads.

### Breaking changes

- Split data-only `ResultData<T, E>` and methodful runtime `Result<T, E>`; add `ResultLike`, `fromResultData`, `hydrateResult`, and `toResultData` for explicit transport boundaries.
- Add the canonical frozen Result prototype and full instance method surface while retaining free-function forms.
- Hydrate plain or foreign-copy Result data returned through pass-through and chaining operations; local canonical wrappers preserve identity.
- Throw `ResultExtractionError` with the inactive payload as `cause` from failed extraction methods.
- Correct matcher accumulation, exhaustiveness, and output unions; enforce own-property, strict-field, forbidden-field, and validator-derived refiner behavior.
- Make branch constructors concrete, shallow-freeze wrappers, widen fallback output unions, and make `inspect`/`inspectErr` true aliases of `tap`/`tapErr`.
- Return Option-shaped values from `ok`, `err`, and `toOption`; use the English API spelling `toOption`.

### Migration

- Treat JSON, structured clones, object spreads, and shared-package values as `ResultData`, then call `hydrateResult` before using runtime methods.
- Replace wrapper mutation with construction of a new `Ok` or `Err` value.
- Update matcher and extraction error handling for the corrected unions and `ResultExtractionError` subclass.
- See `platform/staging/resultsafe-core-v001/COMPATIBILITY-MIGRATIONS.json` for canonical compatibility records and temporary aliases.

## [0.2.1]

- No factual release notes are available in this repository.

## [0.2.0]

- Added the AI-oriented JSDoc standard, examples, validation, and documentation integration.

## History correction

- Removed the prior `1.0.0` entry because it named a different package/API and post-dated this package's current `0.2.1` version; it was not factual history for `@resultsafe/core-fp-result`.
