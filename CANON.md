# ResultSafe Canon

Concise authority and conformance guide for humans and AI agents. This Markdown
is a reader guide; normative semantics reside in the canonical machine corpus.

## Authority hierarchy

Highest authority wins:

1. An approved immutable contract release: its canonical JSON, entrypoint,
   schemas, and integrity manifest.
2. Until such a release exists, the mutable candidate at
   `platform/staging/resultsafe-core-v001/`, read from `AI-ENTRYPOINT.json` in
   its declared order.
3. Derived projection records, including language and storage projections,
   only within the authority delegated by the canonical Contract IR.
4. Code, tests, generated artifacts, qualification receipts, and Markdown are
   non-authoritative evidence.

There is currently no immutable release directory in this repository. Staging
may change and must not be called an immutable canonical release. Promotion
must produce a fixed release corpus with verified integrity; released files are
never edited in place.

## Semantic identity

`CONTRACT-IR.json` defines language-neutral operations. An operation's semantic
identity is its `operation_key`, not a TypeScript, Python, or other public name.
Cross-language correspondence is established only by mapping each language
spelling to the same `operation_key`. Similar names or behavior are not enough.

`PROJECTION-CATALOG.json` owns projection vocabulary and language spellings.
TypeScript normally uses its declared camelCase spelling and Python its declared
snake_case spelling. Those spellings are derived aliases; they do not rename,
duplicate, or replace the Contract IR operation. Every required spelling and
surface must be explicit and machine-checkable in the catalog before release.

## Required language surfaces

For every applicable non-constructor Result operation, each conforming language
must provide both:

- a module-callable function; and
- an instance method on the applicable Result value.

Both surfaces map to the same `operation_key` and must have equivalent contract
behavior, callback rules, exceptions, identity, and types within the language's
projection. Constructors and operations explicitly inapplicable to a language
are governed by their declared forms and applicability.

No language may omit a required method. Free functions alone are useful
implementation evidence but cannot establish language conformance. A projection
may use a different method spelling when its representation makes the default
spelling impossible. For example, TypeScript maps `success-option` to
`ok(result)` and `result.toOption()` because `result.ok` is the required boolean
discriminator; Python maps the same operation to `ok(result)` and `result.ok()`.
The shared `operation_key`, not spelling, proves correspondence.

## Qualification

`CONFORMANCE-MATRIX.json` is the canonical machine-readable Wave 3 evidence
document. It is generated from the current Contract IR and projection bindings
and contains one cell for each required neutral operation, target language, and
surface. A projection cannot pass with a missing, stale, duplicate, source-import,
or non-passing cell. Each cell records clause keys, normalized expected and actual
outcomes, artifact subject and SHA-256 digest, and exact positive/negative type
dispositions. The adapters execute the installed npm tarball and Python wheel.

The 278 scenarios in `SCENARIO-CATALOG.json` remain valuable TypeScript extension
and package evidence. They are not cross-language proof and are not substitutes
for the 88 neutral matrix cells.

The current staging corpus registers 34 canonical documents and 35 schemas.
Those counts describe mutable staging, not an immutable release. Cause/Exit has
its own static 16-cell TypeScript/Python variant matrix in
`CAUSE-EXIT-CONFORMANCE-MATRIX.json`. That matrix is currently specification
data, not an executable qualification suite, so its presence is not evidence
that the cells passed. It supplements and does not replace the 88-cell neutral
Result matrix.

## Lightweight core and imports

The core package invariant is:

- zero runtime dependencies;
- every public module must be directly importable through a package subpath as
  well as available from the package root; and
- optional integrations must remain separate from core.

The direct-subpath rule is mandatory release policy, but generated exports for
every public module are still pending. Until those exports are generated and
verified against a packed artifact, do not claim that every public module is
already directly importable. Optional codecs, storage, and ecosystem adapters
belong outside core and must not add runtime dependencies to it.

## Optional Cause and Exit

`CAUSE-MODEL.json` and `EXIT-MODEL.json` define separate opt-in models. They do
not change `Result<T, E>`, constrain arbitrary `T` or `E`, or cause Result
operations to construct or unwrap `Cause` implicitly. `Cause<E>` has exactly
six variants: `Empty`, `Fail`, `Die`, `Interrupt`, binary `Sequential`, and
binary `Parallel`. `Exit<T, E>` has exactly `Success` and `Failure`, and
`Exit.Failure(Empty)` is valid.

`EFFECT-COMPATIBILITY.json` governs semantic adapter meanings only. It does not
claim direct Effect API, runtime type, representation, wire-format, branding,
identity, equality, release, or security compatibility. Core has no Effect
runtime dependency, and no Effect adapter is implemented yet. See the [Cause
and Exit guide](docs/docs/guides/03-cause-exit.md) for implementation spellings,
conversion policy, and portable-boundary rules.

Run from the repository root:

```bash
# TypeScript runtime
pnpm run pkg:result:verify

# Python runtime
pnpm run python:qualify

# Canonical contracts and implementation correspondence
pnpm run contracts:verify
pnpm run contracts:conformance
pnpm run contracts:matrix

# Relational and SQLite projections
pnpm run storage:qualify
pnpm run storage:test
```

A passing command supplies evidence only. Conformance additionally requires the
complete applicable operation set, both mandatory language surfaces, catalog
mappings by `operation_key`, and an approved immutable release.
