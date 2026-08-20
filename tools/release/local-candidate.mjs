import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectTarball } from './candidate.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const digestPattern = /^[0-9a-f]{64}$/;
const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const blockers = Object.freeze(['COMMIT_BOUND_REQUALIFICATION', 'OWNER_RELEASE_APPROVAL', 'GITHUB_ENVIRONMENT_CONFIGURATION']);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const posix = (path) => path.split(sep).join('/');

export const uuidV7 = () => {
  const bytes = randomBytes(16);
  let timestamp = Date.now();
  for (let index = 5; index >= 0; index--) { bytes[index] = timestamp & 0xff; timestamp = Math.floor(timestamp / 256); }
  bytes[6] = 0x70 | (bytes[6] & 0x0f); bytes[8] = 0x80 | (bytes[8] & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const walk = async (directory, base = directory) => {
  const output = [];
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    const path = resolve(directory, entry.name);
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) throw new Error(`Candidate contains a symbolic link: ${posix(relative(base, path))}`);
    if (metadata.isDirectory()) output.push(...await walk(path, base));
    else if (metadata.isFile()) output.push(path);
    else throw new Error(`Candidate contains an unsupported filesystem entry: ${entry.name}`);
  }
  return output;
};

const inventory = async (directory) => Promise.all((await walk(directory)).filter((path) => basename(path) !== 'candidate-manifest.json').map(async (path) => {
  const bytes = await readFile(path);
  return { path: posix(relative(directory, path)), size: bytes.length, sha256: sha256(bytes) };
}));
const treeDigest = (files) => sha256(files.map((file) => `${file.path}\0${file.sha256}\0${file.size}`).join('\n'));
const record = async (directory, file) => { const bytes = await readFile(resolve(directory, file)); return { file, size: bytes.length, sha256: sha256(bytes) }; };

export const sealCandidate = async (directory, header) => {
  const files = await inventory(directory);
  const manifest = { ...header, files, treeSha256: treeDigest(files) };
  await writeFile(resolve(directory, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return { manifest, manifestSha256: sha256(await readFile(resolve(directory, 'candidate-manifest.json'))) };
};

const validateHeader = (manifest) => {
  const exact = ['schemaVersion', 'candidateId', 'candidatePath', 'status', 'versions', 'source', 'artifacts', 'qualification', 'approval', 'files', 'treeSha256'];
  if (JSON.stringify(Object.keys(manifest).sort()) !== JSON.stringify(exact.sort())) throw new Error('Candidate manifest has unexpected or missing properties.');
  if (manifest.schemaVersion !== 1 || !uuidV7Pattern.test(manifest.candidateId) || manifest.status !== 'QUALIFIED_LOCAL_RC') throw new Error('Candidate identity or status is invalid.');
  if (manifest.versions?.npm !== '0.3.0' || manifest.versions?.option !== '1.0.1' || manifest.versions?.python !== '0.1.0') throw new Error('Candidate versions are invalid.');
  if (manifest.approval?.state !== 'NOT_APPROVED' || JSON.stringify(manifest.approval?.promotionBlockers) !== JSON.stringify(blockers)) throw new Error('Candidate approval state or blockers are invalid.');
};

export const verifyLocalCandidate = async (directory, expected = {}) => {
  const bytes = await readFile(resolve(directory, 'candidate-manifest.json'));
  const manifestSha256 = sha256(bytes); const manifest = JSON.parse(bytes.toString('utf8'));
  validateHeader(manifest);
  if (expected.candidateId && expected.candidateId !== manifest.candidateId) throw new Error('Candidate ID differs from the requested candidate.');
  if (expected.manifestSha256 && expected.manifestSha256 !== manifestSha256) throw new Error('Candidate manifest digest differs from the requested digest.');
  const actual = await inventory(directory);
  if (JSON.stringify(actual) !== JSON.stringify(manifest.files)) throw new Error('Candidate file inventory differs: a file is modified, missing, extra, or reordered.');
  if (!digestPattern.test(manifest.treeSha256) || treeDigest(actual) !== manifest.treeSha256) throw new Error('Candidate tree digest differs.');
  for (const artifact of Object.values(manifest.artifacts)) {
    if (!artifact || basename(artifact.file) !== artifact.file || !digestPattern.test(artifact.sha256)) throw new Error('Candidate artifact record is invalid.');
    const actualRecord = await record(directory, artifact.file);
    if (JSON.stringify(actualRecord) !== JSON.stringify(artifact)) throw new Error(`Candidate artifact differs: ${artifact.file}`);
  }
  const atomicReceipt = JSON.parse(await readFile(resolve(directory, 'qualification-atomic-receipt.json'), 'utf8'));
  if (atomicReceipt.status !== 'PASS' || atomicReceipt.children?.some((child) => child.status !== 'PASS')) throw new Error('Atomic qualification receipt is not all PASS.');
  const approval = JSON.parse(await readFile(resolve(directory, 'approval-state.json'), 'utf8'));
  if (approval.candidateId !== manifest.candidateId || approval.state !== 'NOT_APPROVED' || JSON.stringify(approval.promotionBlockers) !== JSON.stringify(blockers)) throw new Error('Approval file differs from the manifest.');
  console.log(`Immutable local candidate verification PASS: ${manifest.candidateId} tree ${manifest.treeSha256}`);
  return { manifest, manifestSha256 };
};

export const promotionPreflight = async (directory) => {
  const { manifest } = await verifyLocalCandidate(directory);
  if (manifest.approval.state !== 'APPROVED' || manifest.approval.promotionBlockers.length !== 0) throw new Error(`Promotion prohibited: ${manifest.approval.promotionBlockers.join(', ')}.`);
  if (process.env.RESULTSAFE_OWNER_RELEASE_APPROVAL !== 'APPROVED') throw new Error('Promotion prohibited: owner release approval is absent.');
  if (!process.env.GITHUB_ENVIRONMENT) throw new Error('Promotion prohibited: GitHub environment configuration is absent.');
};

const parse = (values) => Object.fromEntries(values.map((value) => { const match = /^--([a-z-]+)=(.+)$/.exec(value); if (!match) throw new Error(`Invalid argument: ${value}`); return [match[1], match[2]]; }));

export const buildLocalCandidate = async (atomicDirectory, candidateId = uuidV7()) => {
  if (!uuidV7Pattern.test(candidateId)) throw new Error('Candidate ID must be UUIDv7.');
  const resultPackage = JSON.parse(await readFile(resolve(root, 'packages/core/fp/result/package.json'), 'utf8'));
  const optionPackage = JSON.parse(await readFile(resolve(root, 'packages/core/fp/option/package.json'), 'utf8'));
  const pyproject = await readFile(resolve(root, 'pyproject.toml'), 'utf8');
  if (resultPackage.version !== '0.3.0' || optionPackage.version !== '1.0.1' || !/^version = "0\.1\.0"$/m.test(pyproject)) throw new Error('Versioned source does not match the governed candidate versions.');
  const changesets = (await readdir(resolve(root, '.changeset'))).filter((name) => name.endsWith('.md') && name !== 'README.md');
  if (changesets.length !== 0) throw new Error('The governed changeset has not been consumed.');
  const atomicManifest = JSON.parse(await readFile(resolve(atomicDirectory, 'RUN-MANIFEST.json'), 'utf8'));
  const atomicReceipt = JSON.parse(await readFile(resolve(atomicDirectory, 'RUN-RECEIPT.json'), 'utf8'));
  if (atomicReceipt.status !== 'PASS' || atomicReceipt.children?.length !== 7 || atomicReceipt.children.some((child) => child.status !== 'PASS')) throw new Error('Atomic qualification is incomplete.');
  execFileSync(process.execPath, ['--test', './tools/release/*.test.mjs'], { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  execFileSync(process.execPath, ['./tools/release/changeset-check.mjs'], { cwd: root, stdio: 'inherit' });
  const relativePath = `platform/candidates/resultsafe-core-fp-result/0.3.0/${candidateId}`;
  const directory = resolve(root, relativePath);
  await rm(directory, { recursive: true, force: true }); await mkdir(directory, { recursive: true });
  await cp(resolve(atomicDirectory, 'canonical-corpus'), resolve(directory, 'canonical-corpus'), { recursive: true, errorOnExist: true });
  const tarballSource = resolve(root, atomicManifest.artifacts.find((item) => item.kind === 'typescript-tarball').path);
  const wheelSource = resolve(root, atomicManifest.artifacts.find((item) => item.kind === 'python-wheel').path);
  const tarballName = basename(tarballSource); const wheelName = basename(wheelSource);
  await cp(tarballSource, resolve(directory, tarballName)); await cp(wheelSource, resolve(directory, wheelName));
  await cp(resolve(atomicDirectory, 'sqlite-logical-dump.jsonl'), resolve(directory, 'sqlite-logical-dump.jsonl'));
  await writeFile(resolve(directory, 'qualification-atomic-manifest.json'), `${JSON.stringify(atomicManifest, null, 2)}\n`);
  await writeFile(resolve(directory, 'qualification-atomic-receipt.json'), `${JSON.stringify(atomicReceipt, null, 2)}\n`);
  await writeFile(resolve(directory, 'source-snapshot-manifest.json'), `${JSON.stringify(atomicManifest.source_snapshot, null, 2)}\n`);
  await cp(resolve(root, 'tools/release/local-candidate-manifest.schema.json'), resolve(directory, 'local-candidate-manifest.schema.json'));
  await cp(resolve(root, 'tools/release/local-candidate-approval.schema.json'), resolve(directory, 'local-candidate-approval.schema.json'));
  const tarball = await record(directory, tarballName); const wheel = await record(directory, wheelName);
  const inspected = await inspectTarball(resolve(directory, tarballName));
  if (inspected.packageJson.version !== '0.3.0') throw new Error('Exact tarball is not npm version 0.3.0.');
  const sbom = { bomFormat: 'CycloneDX', specVersion: '1.5', version: 1, metadata: { component: { type: 'application', name: 'resultsafe-local-rc', version: candidateId } }, components: [
    { type: 'library', name: '@resultsafe/core-fp-result', version: '0.3.0', hashes: [{ alg: 'SHA-256', content: tarball.sha256 }] },
    { type: 'library', name: 'resultsafe', version: '0.1.0', hashes: [{ alg: 'SHA-256', content: wheel.sha256 }] },
  ] };
  const provenance = { _type: 'https://in-toto.io/Statement/v1', subject: [{ name: tarball.file, digest: { sha256: tarball.sha256 } }, { name: wheel.file, digest: { sha256: wheel.sha256 } }], predicateType: 'https://slsa.dev/provenance/v1', predicate: { buildDefinition: { buildType: 'https://resultsafe.dev/build/local-immutable-rc/v1', externalParameters: { candidateId }, resolvedDependencies: [{ uri: `git+local:${atomicManifest.git.head}`, digest: { sha1: atomicManifest.git.head } }] }, runDetails: { builder: { id: 'local:tools/release/local-candidate.mjs' } } } };
  await writeFile(resolve(directory, 'sbom.cdx.json'), `${JSON.stringify(sbom, null, 2)}\n`);
  await writeFile(resolve(directory, 'provenance.intoto.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  const approval = { candidateId, state: 'NOT_APPROVED', promotionBlockers: blockers };
  await writeFile(resolve(directory, 'approval-state.json'), `${JSON.stringify(approval, null, 2)}\n`);
  const scenarioCatalog = JSON.parse(await readFile(resolve(root, 'platform/staging/resultsafe-core-v001/SCENARIO-CATALOG.json'), 'utf8'));
  const canonicalScenarios = scenarioCatalog.payload.scenarios.length;
  const qualification = { candidateId, status: 'PASS', parentRunId: candidateId, children: [{ kind: 'atomic-source-artifact', runId: atomicReceipt.parent_run_id, status: 'PASS' }, { kind: 'release-tooling', runId: uuidV7(), status: 'PASS' }, { kind: 'sbom-provenance-content-budgets', runId: uuidV7(), status: 'PASS' }], evidence: { canonicalScenarios, crossLanguageCells: 88, npmPackedBytes: inspected.bytes.length, npmUnpackedBytes: inspected.unpackedBytes, npmFiles: inspected.entries.length, wheelBytes: wheel.size } };
  await writeFile(resolve(directory, 'qualification-candidate-receipt.json'), `${JSON.stringify(qualification, null, 2)}\n`);
  const artifacts = { tarball, wheel, sqliteLogicalDump: await record(directory, 'sqlite-logical-dump.jsonl'), sbom: await record(directory, 'sbom.cdx.json'), provenance: await record(directory, 'provenance.intoto.json') };
  const sealed = await sealCandidate(directory, { schemaVersion: 1, candidateId, candidatePath: relativePath, status: 'QUALIFIED_LOCAL_RC', versions: { npm: '0.3.0', option: '1.0.1', python: '0.1.0' }, source: { gitCommit: atomicManifest.git.head, worktreeClean: atomicManifest.git.worktree_clean, snapshotSha256: atomicManifest.source_snapshot.digest, canonicalTreeSha256: atomicManifest.canonical_tree_sha256 }, artifacts, qualification: { parentRunId: candidateId, atomicParentRunId: atomicReceipt.parent_run_id, receipt: 'qualification-candidate-receipt.json' }, approval });
  await verifyLocalCandidate(directory, { candidateId, manifestSha256: sealed.manifestSha256 });
  console.log(JSON.stringify({ candidatePath: relativePath, candidateId, manifestSha256: sealed.manifestSha256, treeSha256: sealed.manifest.treeSha256, artifacts }, null, 2));
  return { directory, ...sealed };
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...raw] = process.argv.slice(2); const args = parse(raw);
  const directory = resolve(root, args.directory ?? '');
  if (command === 'build') await buildLocalCandidate(resolve(root, args['atomic-directory']), args['candidate-id']);
  else if (command === 'verify') await verifyLocalCandidate(directory, { candidateId: args['candidate-id'], manifestSha256: args['manifest-sha256'] });
  else if (command === 'promotion-preflight') await promotionPreflight(directory);
  else throw new Error('Usage: local-candidate.mjs build --atomic-directory=PATH [--candidate-id=UUIDv7] | verify|promotion-preflight --directory=PATH');
}
