# ResultSafe Documentation Framework

This file defines how humans and AI agents use repository documentation. Read
[`CANON.md`](CANON.md) first for the authority and conformance rules.

## Documentation role

Markdown explains, navigates, and records rationale. It is not behavioral
authority. Generated documentation, READMEs, source code, tests, qualification
receipts, and storage projections are evidence only. They cannot override the
canonical contract corpus or establish conformance by themselves.

Do not infer a contract from an implementation. Do not resolve disagreement by
majority across code, tests, and prose. Follow the authority hierarchy in
`CANON.md` and report the lower-authority conflict.

## Agent read order

1. `CANON.md`
2. `platform/staging/resultsafe-core-v001/AI-ENTRYPOINT.json`
3. The machine documents in that entrypoint's declared `read_order`
4. Relevant implementation, tests, and Markdown as non-authoritative evidence

For an immutable release, use its own entrypoint and integrity manifest instead
of staging. Staging is mutable and must not be represented as a released canon.

## Writing rules

- Use English for new canonical-facing documentation; translations may mirror
  it but must not introduce policy.
- Link to machine records instead of duplicating their detailed semantics.
- Use stable machine keys such as `operation_key`, record key, and UUID when
  correlating material across files or languages.
- Label proposals and observations. Never describe `DRAFT`, `PLANNED`,
  `DEFERRED`, or `NOT_EXECUTED` material as released or conformant.
- Treat implementation names as projection spellings, not semantic identities.
- For structured failures, read `FAILURE-AUDIT.json` before `FAILURE-MODEL.json`; do not confuse the optional `Failure` payload with the existing generic `FailureData<E>` ResultData branch.
- For Cause and Exit, follow the entrypoint order through `FAILURE-AUDIT.json`,
  `FAILURE-MODEL.json`, `CAUSE-MODEL.json`, `EXIT-MODEL.json`, and
  `EFFECT-COMPATIBILITY.json`. Treat `Failure.causes` as diagnostic ancestry,
  never as Cause topology.
- Preserve the exact six binary Cause variants and two Exit variants. Do not
  flatten or reorder `Sequential` or `Parallel`, and do not reject or rewrite
  `Exit.Failure(Empty)`.
- Require explicit Result/Exit conversion. A conversion that reduces a complete
  `Cause<E>` to `E` must receive a caller-selected collapse policy; never infer
  one from `Failure.causes` or an adapter name.
- Describe Effect support as explicit semantic adapters only. Do not claim
  direct Effect API compatibility, runtime identity, or a security
  qualification, and do not introduce an Effect runtime dependency into core.
  No Effect adapter is implemented yet; describe it as planned until executable
  implementation and qualification evidence exist.
- Preserve the lightweight-core invariant: zero runtime dependencies, every
  public module available from both its direct package subpath and the package
  root, and optional integrations kept separate. Direct subpaths are mandatory
  release policy, but complete generated exports are still pending; do not
  describe that surface as complete until packed-artifact checks prove it.
- Describe codecs as optional boundary integrations outside core. Do not imply
  that Cause/Exit codecs ship in core or are currently implemented.
- Use `CONFORMANCE-MATRIX.json`, not the TypeScript scenario count, for
  cross-language claims. Require all 88 cells to match the current Contract IR
  and projection revisions and to identify packed artifact digests.
- Keep exact staging counts current when stated: 278 scenarios, 34 documents,
  35 schemas, 16 Cause/Exit matrix cells, and 88 Result matrix cells.
- The 16-cell Cause/Exit matrix is currently static and non-executable. Its
  presence documents expected coverage but does not prove passing behavior.
- Treat normalized expected/actual differences as cell failures. Do not accept
  generic compiler or mypy failure when an exact diagnostic is declared.
- If prose conflicts with canonical machine records, update the prose or mark
  the machine staging conflict as a blocker. Never conceal the disagreement.

## Required checks

Run the qualification commands listed in `CANON.md`. Passing checks is required
evidence, not authority and not sufficient on its own for a conformance claim.
