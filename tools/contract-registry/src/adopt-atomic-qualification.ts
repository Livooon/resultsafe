import { readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalize } from 'json-canonicalize';
import {
  canonicalTreeEvidence, sourceSnapshot, validateAtomicQualification, type AtomicQualification,
} from './atomic-qualification.js';

type Json = Record<string, unknown>;

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const staging = resolve(root, 'platform/staging/resultsafe-core-v001');
const candidatesRoot = resolve(root, '.resultsafe-candidates');
const qualificationPath = resolve(staging, 'QUALIFICATION-RECEIPT.json');
const childKinds = ['structural', 'canonical-scenario', 'cross-language-matrix', 'core-modularity', 'cause-exit-exact-artifacts', 'json-codec', 'effect-adapter', 'python-wheel', 'storage', 'integrity'] as const;
const legacyFinalExclusions = ['INTEGRITY-MANIFEST.json'] as const;
const legacySourceMigrationPaths = new Set([
  'tools/contract-registry/package.json',
  'tools/contract-registry/src/adopt-atomic-qualification.test.ts',
  'tools/contract-registry/src/adopt-atomic-qualification.ts',
  'tools/contract-registry/src/atomic-qualification.ts',
  'tools/contract-registry/src/validate.ts',
]);

const records = (value: unknown): Json[] => Array.isArray(value) ? value.filter((item): item is Json => typeof item === 'object' && item !== null) : [];
const object = (value: unknown, name: string): Json => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`${name} must be an object`);
  return value as Json;
};
const sameJson = (left: unknown, right: unknown): boolean => canonicalize(left) === canonicalize(right);
const readJson = async (path: string): Promise<Json> => object(JSON.parse(await readFile(path, 'utf8')) as unknown, path);
const normalized = (path: string): string => relative(root, path).split(sep).join('/');
const requireValue: (condition: unknown, message: string) => asserts condition = (condition, message) => { if (!condition) throw new Error(message); };

export const requirePassingQualification = (qualification: AtomicQualification, validationErrors: readonly string[]): void => {
  requireValue(qualification.run_receipt['status'] === 'PASS', 'Candidate aggregate status must be PASS.');
  const children = records(qualification.run_receipt['children']);
  requireValue(children.length === childKinds.length, `Candidate must contain exactly ${childKinds.length} children.`);
  for (const kind of childKinds) requireValue(children.filter((child) => child['kind'] === kind && child['status'] === 'PASS').length === 1, `Candidate child ${kind} must occur exactly once with PASS.`);
  requireValue(validationErrors.length === 0, `Atomic qualification validation failed: ${validationErrors.join(', ')}`);
};

const verifyCandidatePaths = (candidate: string, qualification: AtomicQualification): void => {
  const expectedPrefix = `${normalized(candidate)}/`;
  const manifest = qualification.run_manifest; const receipt = qualification.run_receipt;
  requireValue(resolve(candidatesRoot, basename(candidate)) === candidate && resolve(candidate, '..') === candidatesRoot, 'Candidate must be one direct child of .resultsafe-candidates.');
  requireValue(basename(candidate) === manifest['parent_run_id'], 'Candidate directory must equal parent_run_id.');
  const paths = [
    ...records(manifest['artifacts']),
    ...records(receipt['children']).map((child) => child['evidence_artifact']).filter((value): value is Json => typeof value === 'object' && value !== null),
    ...records(receipt['logical_dumps']),
    object(receipt['governed_check_evidence'], 'governed_check_evidence'),
  ];
  for (const item of paths) {
    const declared = String(item['path']); const absolute = resolve(root, declared);
    requireValue(declared.startsWith(expectedPrefix) && absolute.startsWith(`${candidate}${sep}`), `Artifact path escapes or differs from candidate: ${declared}`);
  }
};

const verifyLegacySourceDrift = async (manifest: Json): Promise<void> => {
  const declared = records(object(manifest['source_snapshot'], 'source_snapshot')['inventory']);
  const actual = (await sourceSnapshot()).inventory;
  const declaredByPath = new Map(declared.map((item) => [String(item['path']), item]));
  const actualByPath = new Map(actual.map((item) => [item.path, item]));
  const differences = new Set<string>();
  for (const path of new Set([...declaredByPath.keys(), ...actualByPath.keys()])) if (!sameJson(declaredByPath.get(path), actualByPath.get(path))) differences.add(path);
  requireValue(differences.size > 0 && [...differences].every((path) => legacySourceMigrationPaths.has(path)), `Legacy bootstrap source drift is not confined to the validator/adoption migration: ${[...differences].join(', ')}`);
  requireValue((await readFile(resolve(root, 'tools/contract-registry/src/atomic-qualification.ts'), 'utf8')).includes("['INTEGRITY-MANIFEST.json', 'QUALIFICATION-RECEIPT.json']"), 'Current atomic validator does not contain the final self-exclusion fix.');
  requireValue((await readFile(resolve(root, 'tools/contract-registry/src/validate.ts'), 'utf8')).includes("['INTEGRITY-MANIFEST.json', 'QUALIFICATION-RECEIPT.json']"), 'Current canonical validator does not contain the final self-exclusion fix.');
};

const validateLegacyBootstrap = async (qualification: AtomicQualification, canonical: Json, errors: readonly string[]): Promise<void> => {
  const canonicalPayload = object(canonical['payload'], 'canonical payload');
  requireValue(canonicalPayload['validation_run_id'] !== qualification.run_manifest['parent_run_id'], 'Legacy bootstrap candidate has already been adopted.');
  const existingAtomic = object(canonicalPayload['atomic_qualification'], 'canonical atomic_qualification');
  const existingReceipt = object(existingAtomic['run_receipt'], 'canonical run_receipt');
  const existingFinal = existingReceipt['final_canonical_tree'];
  const candidateFinal = object(qualification.run_receipt['final_canonical_tree'], 'candidate final_canonical_tree');
  requireValue(existingFinal === undefined || existingFinal === null || sameJson(object(existingFinal, 'canonical final_canonical_tree')['exclusions'], legacyFinalExclusions), 'Legacy bootstrap is allowed only while the canonical receipt still has a legacy or absent final exclusion schema.');
  requireValue(sameJson(candidateFinal['exclusions'], legacyFinalExclusions), 'Legacy bootstrap candidate must use exactly the legacy final exclusion schema.');
  const allowed = new Set(['final canonical tree scope', 'final canonical tree bytes or inventory', 'source snapshot bytes or inventory']);
  requireValue(errors.includes('final canonical tree scope') && errors.includes('final canonical tree bytes or inventory') && errors.every((error) => allowed.has(error)), `Legacy bootstrap encountered non-legacy validation errors: ${errors.join(', ')}`);
  requireValue(sameJson(await canonicalTreeEvidence(staging, legacyFinalExclusions), candidateFinal), 'Legacy final canonical tree bytes or inventory do not recompute exactly.');
  if (errors.includes('source snapshot bytes or inventory')) await verifyLegacySourceDrift(qualification.run_manifest);
};

const childEvidence = (children: Json[], kind: string): string => String(children.find((child) => child['kind'] === kind)?.['evidence'] ?? '');
const check = (check_key: string, status: string, evidence: string): Json => ({ check_key, status, evidence });

export const preserveDeferredQualification = (existingPayload: Json, nextPayload: Json): void => {
  requireValue(existingPayload['security_status'] === 'DEFERRED' && existingPayload['long_running_status'] === 'DEFERRED', 'Canonical security and long-running statuses must already be DEFERRED.');
  nextPayload['security_status'] = 'DEFERRED'; nextPayload['long_running_status'] = 'DEFERRED';
};

const buildChecks = (governed: Json, children: Json[], scenarios: Json, matrixEvidence: Json, storage: Json, core: Json, effect: Json, causeExit: Json, wheel: Json, integrity: Json): Json[] => {
  const checks = new Map<string, Json>();
  for (const proposed of records(object(governed['details'], 'governed details')['proposed_checks'])) checks.set(String(proposed['check_key']), proposed);
  const counts = scenarios;
  const matrixCounts = object(matrixEvidence['counts'], 'matrix counts');
  const storageProfiles = records(storage['profiles']);
  const coreRuntime = object(core['runtime'], 'core runtime');
  const add = (key: string, evidence: string, status = 'PASS'): void => { checks.set(key, check(key, status, evidence)); };
  for (const kind of childKinds) add(kind, childEvidence(children, kind));
  add('graph-validation', childEvidence(children, 'structural'));
  add('document-registry-and-graph-closure', childEvidence(children, 'structural'));
  add('behavioral-conformance', `${String(counts['total'])}/${String(counts['passed'])} exact-artifact canonical scenarios PASS: RUNTIME ${String(counts['RUNTIME'])}, ASYNC ${String(counts['ASYNC'])}, COMPILE ${String(counts['COMPILE'])}, PACKAGE ${String(counts['PACKAGE'])}.`);
  add('runtime-conformance', `${Number(counts['RUNTIME']) + Number(counts['ASYNC'])} RUNTIME/ASYNC scenarios PASS (${String(counts['RUNTIME'])} RUNTIME and ${String(counts['ASYNC'])} ASYNC).`);
  add('compile-time-conformance', `${String(counts['COMPILE'])}/${String(counts['COMPILE'])} COMPILE scenarios PASS.`);
  add('packed-package-consumer-matrix', `${String(counts['PACKAGE'])}/${String(counts['PACKAGE'])} PACKAGE scenarios PASS against the exact core tarball.`);
  add('cross-language-conformance-matrix', `${String(matrixCounts['passed'])}/${String(matrixCounts['cells'])} exact core/wheel runtime cells PASS; operation-specific positive_types and negative_types are NOT_ASSESSED_OPERATION_SPECIFIC.`);
  add('language-operation-surface-conformance', `${String(matrixCounts['passed'])}/${String(matrixCounts['cells'])} current-matrix runtime cells PASS against exact artifacts; operation-specific per-cell type status is NOT_ASSESSED_OPERATION_SPECIFIC.`);
  add('typescript-source-and-export-inventory', `Packed core exposes ${String(core['packed_export_keys'])} export keys, ${String(coreRuntime['runtime_subpaths'])} runtime subpaths, and ${String(core['type_subpaths'])} type subpaths with root parity.`);
  add('public-module-registry-conformance', `Exact packed core matched ${String(core['registry_modules'])} public module registry entries.`);
  add('packed-core-modularity', `Exact packed core has ${String(core['runtime_dependencies'])} runtime dependencies, ${String(core['internal_exports'])} internal exports, and ${String(core['observable_side_effects'])} observable import side effects.`);
  add('effect-compatibility-executable-evidence', `Effect ${String(effect['effect_version'])}: ${String(effect['cause_variants'])} Cause variants in ${String(effect['cause_directions'])} directions and ${String(effect['exit_cases'])} Exit cases passed; core Effect dependencies ${String(effect['core_effect_dependencies'])}.`);
  add('cause-exit-matrix-executable-evidence', childEvidence(children, 'cause-exit-exact-artifacts'));
  add('python-runtime-and-laws', childEvidence(children, 'python-wheel'));
  add('python-strict-typing', `Strict Python typing passed for exact wheel sha256:${String(wheel['wheel_sha256'])}; no operation-specific per-matrix-cell type claim is made.`);
  add('python-wheel-consumer', childEvidence(children, 'python-wheel'));
  add('relational-and-sqlite-logical-equivalence', `${storageProfiles.map((profile) => `${String(profile['kind'])}: ${String(profile['tables'])} STRICT tables, sha256:${String(profile['dump_sha256'])}`).join('; ')}; cause-exit dependency resolution passed.`);
  add('integrity-manifest', `Canonical input tree sha256:${String(integrity['canonical_input_tree_sha256'])} and the governed integrity manifest passed during the atomic run.`);
  add('security-hardening', 'Deferred by mandatory owner standing decision; this FAST_OFFLINE adoption does not assess security.', 'DEFERRED');
  add('long-running-reliability', 'Deferred by mandatory owner standing decision; this FAST_OFFLINE adoption does not run long-running reliability tests.', 'DEFERRED');
  add('long-running-tests', 'Deferred by mandatory owner standing decision; this FAST_OFFLINE adoption does not run long-running tests.', 'DEFERRED');
  return [...checks.values()];
};

export interface AdoptionOptions { legacyFinalSelfExclusion?: boolean; write?: boolean }

export const adoptAtomicQualification = async (candidateArgument: string, options: AdoptionOptions = {}): Promise<Json> => {
  const candidate = resolve(root, candidateArgument);
  const [manifest, receipt, canonical, projectionCatalog, matrix, contractIr, validationPlan, scenarioCatalog] = await Promise.all([
    readJson(resolve(candidate, 'RUN-MANIFEST.json')), readJson(resolve(candidate, 'RUN-RECEIPT.json')), readJson(qualificationPath),
    readJson(resolve(staging, 'PROJECTION-CATALOG.json')), readJson(resolve(staging, 'CONFORMANCE-MATRIX.json')), readJson(resolve(staging, 'CONTRACT-IR.json')),
    readJson(resolve(staging, 'VALIDATION-PLAN.json')), readJson(resolve(staging, 'SCENARIO-CATALOG.json')),
  ]);
  const qualification: AtomicQualification = { schema_version: '1.0.0', run_manifest: manifest, run_receipt: receipt };
  verifyCandidatePaths(candidate, qualification);
  const validationErrors = await validateAtomicQualification(qualification, { root, canonicalRoot: staging, governedReceiptPath: qualificationPath });
  if (options.legacyFinalSelfExclusion) await validateLegacyBootstrap(qualification, canonical, validationErrors);
  else requirePassingQualification(qualification, validationErrors);
  requirePassingQualification(qualification, []);

  const children = records(receipt['children']);
  const evidence = new Map<string, Json>();
  for (const child of children) {
    const reference = object(child['evidence_artifact'], `${String(child['kind'])} evidence reference`);
    const artifact = await readJson(resolve(root, String(reference['path'])));
    requireValue(artifact['kind'] === child['kind'] && artifact['status'] === 'PASS' && sameJson(artifact['artifact_sha256'], reference['artifact_sha256']), `${String(child['kind'])} evidence content binding failed.`);
    evidence.set(String(child['kind']), object(artifact['details'], `${String(child['kind'])} evidence details`));
  }
  const governedReference = object(receipt['governed_check_evidence'], 'governed check reference');
  const governed = await readJson(resolve(root, String(governedReference['path'])));
  requireValue(governed['kind'] === 'governed-checks' && governed['status'] === 'PASS', 'Governed check evidence must be PASS.');

  const scenarioDetails = evidence.get('canonical-scenario')!;
  const scenarios = records(object(scenarioCatalog['payload'], 'scenario catalog payload')['scenarios']);
  const categoryCounts = Object.fromEntries(['RUNTIME', 'ASYNC', 'COMPILE', 'PACKAGE'].map((category) => [category, scenarios.filter((scenario) => scenario['category'] === category).length]));
  requireValue(scenarioDetails['total'] === 278 && scenarioDetails['passed'] === 278 && scenarioDetails['failed'] === 0 && Object.values(categoryCounts).reduce((sum, count) => sum + count, 0) === 278, 'Canonical scenario evidence or current category counts differ from 278/278.');
  const scenarioSummary = { total: 278, passed: 278, failed: 0, ...categoryCounts };
  const matrixDetails = evidence.get('cross-language-matrix')!;
  const matrixCounts = object(matrixDetails['counts'], 'matrix evidence counts');
  requireValue(matrixCounts['cells'] === 88 && matrixCounts['passed'] === 88 && matrixCounts['failed'] === 0, 'Cross-language matrix evidence must be exactly 88/88 PASS.');

  const projections = records(object(projectionCatalog['payload'], 'projection catalog payload')['items']).filter((item) => item['projection_kind'] === 'LANGUAGE');
  const artifactByKind = new Map(records(manifest['artifacts']).map((artifact) => [String(artifact['kind']), artifact]));
  const coreDigest = String(artifactByKind.get('core-tarball')?.['sha256']); const wheelDigest = String(artifactByKind.get('python-wheel')?.['sha256']);
  const languageResults = ['typescript', 'python'].map((target) => {
    const projection = projections.find((item) => item['target_key'] === target); requireValue(projection, `Current ${target} projection is missing.`);
    const digest = target === 'typescript' ? coreDigest : wheelDigest; const artifact = target === 'typescript' ? 'core tarball' : 'Python wheel';
    return { target_key: target, projection_ref: projection['record_ref'], projection_revision: projection['record_revision'], contract_ir_ref: projection['contract_ir_ref'], contract_ir_revision: projection['contract_ir_revision'], matrix_ref: matrix['document_ref'], matrix_revision: matrix['document_revision'], status: 'PASS', evidence: `PASS: 44/44 runtime operation-surface cells against exact ${artifact} sha256:${digest}; positive_types and negative_types are NOT_ASSESSED_OPERATION_SPECIFIC per cell.` };
  });
  requireValue(matrixDetails['matrix_document_ref'] === matrix['document_ref'] && matrixDetails['matrix_document_revision'] === matrix['document_revision'], 'Candidate matrix evidence is not bound to the current matrix revision.');
  requireValue(projectionCatalog['document_revision'] === object(matrix['payload'], 'matrix payload')['projection_catalog_revision'] && contractIr['document_revision'] === object(matrix['payload'], 'matrix payload')['contract_ir_revision'], 'Current matrix is not bound to current projection catalog and Contract IR revisions.');

  const existingPayload = object(canonical['payload'], 'canonical payload');
  const nextPayload: Json = {
    validation_run_id: manifest['parent_run_id'], validation_run_ref: `urn:uuid:${String(manifest['parent_run_id'])}`,
    qualification_mode: 'FAST_OFFLINE', currency_status: 'CURRENT',
    requalification_reason: `Current for local source snapshot sha256:${String(object(manifest['source_snapshot'], 'source snapshot')['digest'])} and parent atomic run ${String(manifest['parent_run_id'])}; promotion is explicitly blocked by the dirty/uncommitted worktree and requires a clean commit-bound rerun.`,
    structural_status: 'PASS', behavioral_status: 'PASS', language_projection_results: languageResults,
    checks: buildChecks(governed, children, scenarioSummary, matrixDetails, evidence.get('storage')!, evidence.get('core-modularity')!, evidence.get('effect-adapter')!, evidence.get('cause-exit-exact-artifacts')!, evidence.get('python-wheel')!, evidence.get('integrity')!),
    atomic_qualification: qualification,
  };
  preserveDeferredQualification(existingPayload, nextPayload);
  requireValue(object(receipt['promotion'], 'promotion')['eligible'] === false && object(receipt['promotion'], 'promotion')['blocker'] === 'DIRTY_OR_UNCOMMITTED_SOURCE' && object(manifest['git'], 'git')['worktree_clean'] === false, 'Adoption requires the explicit dirty-worktree promotion blocker.');
  const requiredGates = records(object(validationPlan['payload'], 'validation plan payload')['gates']).filter((gate) => gate['required'] === true).map((gate) => String(gate['gate_key']));
  const checks = new Map(records(nextPayload['checks']).map((item) => [String(item['check_key']), item['status']]));
  for (const gate of requiredGates) requireValue(checks.get(gate) === 'PASS', `Required validation-plan gate ${gate} lacks PASS evidence.`);
  requireValue(!checks.has('immutable-local-release-candidate'), 'Adoption must not claim an immutable local release candidate.');

  const adopted: Json = { ...canonical, document_revision: Number(canonical['document_revision']) + 1, updated_at: receipt['finished_at'], summary: 'FAST_OFFLINE atomic qualification adopted for the current dirty local snapshot: 278/278 canonical scenarios and 88/88 exact-artifact matrix cells PASS; operation-specific matrix type status, security, long-running reliability, promotion, and release approval are not claimed.', payload: nextPayload };
  if (options.write !== false) await writeFile(qualificationPath, `${JSON.stringify(adopted, null, 2)}\n`, 'utf8');
  return adopted;
};

const usage = 'Usage: pnpm run qualify:atomic:adopt -- <candidate-directory> [--legacy-final-self-exclusion]';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter((arg) => arg !== '--'); const legacy = args.includes('--legacy-final-self-exclusion'); const candidate = args.find((arg) => !arg.startsWith('--'));
  if (!candidate || args.some((arg) => arg.startsWith('--') && arg !== '--legacy-final-self-exclusion')) throw new Error(usage);
  const adopted = await adoptAtomicQualification(candidate, { legacyFinalSelfExclusion: legacy });
  console.log(`Adopted parent ${String(object(adopted['payload'], 'payload')['validation_run_id'])} as qualification receipt revision ${String(adopted['document_revision'])}.`);
}
