import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { appendFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const limits = Object.freeze({ packedBytes: 8_000_000, unpackedBytes: 12_000_000, files: 500 });
const digestPattern = /^[0-9a-f]{64}$/;
const commitPattern = /^[0-9a-f]{40}$/;
const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{2,160}$/;
const governed = Object.freeze({ repository: 'resultsafe/resultsafe', workflow: '.github/workflows/ci-versioning.yml', ref: 'refs/heads/main', package: '@resultsafe/core-fp-result', version: '0.3.0' });
const exactKeys = (value, keys, location) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) throw new Error(`${location} schema is invalid.`);
};
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digestFile = async (path) => {
  const bytes = await readFile(path);
  return { sha256: sha256(bytes), size: bytes.length };
};

const tarEntries = (tgz) => {
  const tar = gunzipSync(tgz);
  const entries = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const text = (start, length) => header.subarray(start, start + length).toString('utf8').replace(/\0.*$/, '');
    const name = `${text(345, 155)}${text(345, 155) ? '/' : ''}${text(0, 100)}`;
    const size = Number.parseInt(text(124, 12).trim() || '0', 8);
    const type = text(156, 1) || '0';
    if (!Number.isSafeInteger(size) || size < 0 || name.startsWith('/') || name.split('/').includes('..')) throw new Error('Tarball contains an unsafe entry.');
    const contentStart = offset + 512;
    if (contentStart + size > tar.length) throw new Error('Tarball is truncated.');
    if (type === '0') entries.push({ path: name, size, sha256: sha256(tar.subarray(contentStart, contentStart + size)), bytes: tar.subarray(contentStart, contentStart + size) });
    else if (type !== '5') throw new Error(`Tarball contains unsupported entry type ${type}.`);
    offset = contentStart + Math.ceil(size / 512) * 512;
  }
  return entries;
};

export const inspectTarball = async (path) => {
  const bytes = await readFile(path);
  const entries = tarEntries(bytes);
  const unpackedBytes = entries.reduce((total, entry) => total + entry.size, 0);
  if (bytes.length > limits.packedBytes || unpackedBytes > limits.unpackedBytes || entries.length > limits.files) {
    throw new Error(`Artifact budget exceeded: ${bytes.length}/${limits.packedBytes} packed bytes, ${unpackedBytes}/${limits.unpackedBytes} unpacked bytes, ${entries.length}/${limits.files} files.`);
  }
  const packageEntry = entries.find((entry) => entry.path === 'package/package.json');
  if (!packageEntry) throw new Error('Tarball has no package/package.json.');
  const packageJson = JSON.parse(packageEntry.bytes.toString('utf8'));
  if (packageJson.name !== governed.package || packageJson.version !== governed.version || packageJson.engines?.node !== '>=22.13.0') {
    throw new Error('Tarball package identity, version, or Node engine is not governed.');
  }
  return { bytes, entries: entries.map(({ bytes: _bytes, ...entry }) => entry), unpackedBytes, packageJson };
};

const parseArguments = (values) => Object.fromEntries(values.filter((value) => value !== '--').map((value) => {
  const match = /^--([a-z0-9-]+)=(.+)$/.exec(value);
  if (!match) throw new Error(`Invalid argument: ${value}`);
  return [match[1], match[2]];
}));

export const verifyCandidate = async (directory, expected = {}) => {
  const manifestPath = resolve(directory, 'candidate-manifest.json');
  const manifestBytes = await readFile(manifestPath);
  const manifestDigest = sha256(manifestBytes);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (manifest.schemaVersion !== 1 || !idPattern.test(manifest.candidateId) || !commitPattern.test(manifest.source.gitCommit)) throw new Error('Candidate manifest schema is invalid.');
  if (expected['candidate-id'] && manifest.candidateId !== expected['candidate-id']) throw new Error('Candidate ID differs from the requested candidate.');
  if (expected['source-sha'] && manifest.source.gitCommit !== expected['source-sha']) throw new Error('Candidate source SHA differs from the requested governed source.');
  if (expected['manifest-sha256'] && manifestDigest !== expected['manifest-sha256']) throw new Error('Manifest digest differs from the requested digest.');
  const artifacts = ['tarball', 'sbom', 'provenance', 'schema'];
  for (const key of artifacts) {
    const record = manifest.artifacts[key];
    if (!record || basename(record.file) !== record.file || !digestPattern.test(record.sha256)) throw new Error(`Invalid ${key} record.`);
    const actual = await digestFile(resolve(directory, record.file));
    if (actual.sha256 !== record.sha256 || actual.size !== record.size) throw new Error(`${key} bytes differ from the manifest.`);
  }
  if (expected['tarball-sha256'] && manifest.artifacts.tarball.sha256 !== expected['tarball-sha256']) throw new Error('Tarball digest differs from the requested digest.');
  const tarballPath = resolve(directory, manifest.artifacts.tarball.file);
  const inspected = await inspectTarball(tarballPath);
  if (manifest.package?.name !== governed.package || manifest.package?.version !== governed.version || manifest.package.name !== inspected.packageJson.name || manifest.package.version !== inspected.packageJson.version) throw new Error('Candidate package is not the exact governed package and version.');
  if (inspected.entries.length !== manifest.budgets.actualFiles || inspected.unpackedBytes !== manifest.budgets.actualUnpackedBytes || inspected.bytes.length !== manifest.budgets.actualPackedBytes) throw new Error('Tarball content budget evidence differs.');
  if (JSON.stringify(inspected.entries) !== JSON.stringify(manifest.contents)) throw new Error('Tarball content inventory differs.');
  const sbom = JSON.parse(await readFile(resolve(directory, manifest.artifacts.sbom.file), 'utf8'));
  const provenance = JSON.parse(await readFile(resolve(directory, manifest.artifacts.provenance.file), 'utf8'));
  if (sbom.bomFormat !== 'CycloneDX' || sbom.specVersion !== '1.5' || sbom.metadata.component.hashes?.[0]?.content !== manifest.artifacts.tarball.sha256) throw new Error('CycloneDX SBOM does not bind the tarball.');
  if (provenance._type !== 'https://in-toto.io/Statement/v1' || provenance.subject?.[0]?.digest?.sha256 !== manifest.artifacts.tarball.sha256) throw new Error('Provenance does not bind the tarball.');
  console.log(`Candidate verification PASS: ${manifest.candidateId} ${manifest.artifacts.tarball.sha256} (registry not contacted)`);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `tarball=${tarballPath.replaceAll('\\', '/')}\nmanifest_sha256=${manifestDigest}\ntarball_sha256=${manifest.artifacts.tarball.sha256}\n`);
  return { manifest, manifestDigest, tarballPath };
};

export const validateQualificationRun = (run, requestedRunId) => {
  const runId = String(run?.id ?? '');
  if (runId !== String(requestedRunId) || run.repository?.full_name !== governed.repository || run.path !== governed.workflow || !['push', 'workflow_dispatch'].includes(run.event) || run.head_branch !== 'main' || run.status !== 'completed' || run.conclusion !== 'success' || !commitPattern.test(run.head_sha ?? '')) {
    throw new Error('Qualification run is not an authorized successful governed run.');
  }
  if (!Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1) throw new Error('Qualification run attempt is invalid.');
  return { repository: governed.repository, workflow: governed.workflow, event: run.event, ref: governed.ref, runId, runAttempt: String(run.run_attempt), runSha: run.head_sha, conclusion: run.conclusion };
};

export const verifyQualificationEvidence = async (directory, expected) => {
  const record = JSON.parse(await readFile(resolve(directory, 'qualification-run.json'), 'utf8'));
  exactKeys(record, ['schemaVersion', 'repository', 'workflow', 'event', 'ref', 'runId', 'runAttempt', 'runSha', 'conclusion', 'candidateId'], 'Qualification record');
  if (record.schemaVersion !== 1 || record.repository !== governed.repository || record.workflow !== governed.workflow || !['push', 'workflow_dispatch'].includes(record.event) || record.ref !== governed.ref || !/^[1-9][0-9]*$/.test(record.runId) || !/^[1-9][0-9]*$/.test(record.runAttempt) || !commitPattern.test(record.runSha) || record.conclusion !== 'success' || !idPattern.test(record.candidateId)) throw new Error('Qualification record is not governed.');
  for (const [key, value] of Object.entries(expected)) if (value && String(record[key]) !== String(value)) throw new Error(`Qualification record ${key} differs from the authorized run.`);
  return record;
};

const recordQualification = async (directory) => {
  const record = { schemaVersion: 1, repository: process.env.GITHUB_REPOSITORY, workflow: process.env.GITHUB_WORKFLOW_REF?.split('@')[0].replace(`${process.env.GITHUB_REPOSITORY}/`, ''), event: process.env.GITHUB_EVENT_NAME, ref: process.env.GITHUB_REF, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, runSha: process.env.RESULTSAFE_SOURCE_SHA || process.env.GITHUB_SHA, conclusion: 'success', candidateId: process.env.CANDIDATE_ID };
  await writeFile(resolve(directory, 'qualification-run.json'), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  await writeFile(resolve(directory, 'qualification-run.schema.json'), await readFile(resolve(root, 'tools/release/qualification-run.schema.json')), { flag: 'wx' });
  await verifyQualificationEvidence(directory, record);
};

const verifyRemoteQualificationRun = async (runId) => {
  if (!/^[1-9][0-9]*$/.test(runId ?? '') || !process.env.GITHUB_TOKEN) throw new Error('A numeric qualification run ID and GITHUB_TOKEN are required.');
  const response = await fetch(`https://api.github.com/repos/${governed.repository}/actions/runs/${runId}`, { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
  if (!response.ok) throw new Error(`Unable to validate qualification run: GitHub returned ${response.status}.`);
  const record = validateQualificationRun(await response.json(), runId);
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `source_sha=${record.runSha}\nrun_event=${record.event}\nrun_attempt=${record.runAttempt}\n`);
  return record;
};

export const buildCandidate = async (directory, candidateId) => {
  if (!idPattern.test(candidateId)) throw new Error('CANDIDATE_ID must be a safe identifier.');
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  const pnpm = process.platform === 'win32' ? 'pnpm.exe' : 'pnpm';
  execFileSync(pnpm, ['pack', '--pack-destination', directory, '--silent'], { cwd: resolve(root, 'packages/core/fp/result/dist'), stdio: 'inherit' });
  const names = await readdir(directory);
  const tarballs = names.filter((name) => name.endsWith('.tgz'));
  if (tarballs.length !== 1) throw new Error(`Expected one tarball, found ${tarballs.length}.`);
  const tarballPath = resolve(directory, tarballs[0]);
  const inspected = await inspectTarball(tarballPath);
  const tarball = { file: tarballs[0], sha256: sha256(inspected.bytes), size: inspected.bytes.length };
  const sourceSha = process.env.RESULTSAFE_SOURCE_SHA || process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (!commitPattern.test(sourceSha)) throw new Error('Source commit SHA is invalid.');
  const serial = `${tarball.sha256.slice(0, 8)}-${tarball.sha256.slice(8, 12)}-5${tarball.sha256.slice(13, 16)}-a${tarball.sha256.slice(17, 20)}-${tarball.sha256.slice(20, 32)}`;
  const sbom = {
    bomFormat: 'CycloneDX', specVersion: '1.5', serialNumber: `urn:uuid:${serial}`, version: 1,
    metadata: { component: { type: 'library', name: inspected.packageJson.name, version: inspected.packageJson.version, hashes: [{ alg: 'SHA-256', content: tarball.sha256 }] } },
    components: [],
  };
  const provenance = {
    _type: 'https://in-toto.io/Statement/v1', subject: [{ name: tarball.file, digest: { sha256: tarball.sha256 } }],
    predicateType: 'https://slsa.dev/provenance/v1', predicate: { buildDefinition: { buildType: 'https://resultsafe.dev/build/npm-tarball/v1', externalParameters: { candidateId }, resolvedDependencies: [{ uri: 'git+https://github.com/resultsafe/resultsafe', digest: { sha1: sourceSha } }] }, runDetails: { builder: { id: 'https://github.com/resultsafe/resultsafe/.github/workflows/ci-versioning.yml' } } },
  };
  await writeFile(resolve(directory, 'sbom.cdx.json'), `${JSON.stringify(sbom, null, 2)}\n`);
  await writeFile(resolve(directory, 'provenance.intoto.json'), `${JSON.stringify(provenance, null, 2)}\n`);
  await writeFile(resolve(directory, 'candidate-manifest.schema.json'), await readFile(resolve(root, 'tools/release/candidate-manifest.schema.json')));
  const manifest = {
    $schema: './candidate-manifest.schema.json', schemaVersion: 1, candidateId,
    package: { name: inspected.packageJson.name, version: inspected.packageJson.version }, source: { gitCommit: sourceSha },
    artifacts: { tarball, sbom: { file: 'sbom.cdx.json', ...await digestFile(resolve(directory, 'sbom.cdx.json')) }, provenance: { file: 'provenance.intoto.json', ...await digestFile(resolve(directory, 'provenance.intoto.json')) }, schema: { file: 'candidate-manifest.schema.json', ...await digestFile(resolve(directory, 'candidate-manifest.schema.json')) } },
    budgets: { maxPackedBytes: limits.packedBytes, maxUnpackedBytes: limits.unpackedBytes, maxFiles: limits.files, actualPackedBytes: inspected.bytes.length, actualUnpackedBytes: inspected.unpackedBytes, actualFiles: inspected.entries.length },
    contents: inspected.entries,
  };
  await writeFile(resolve(directory, 'candidate-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const verified = await verifyCandidate(directory);
  console.log(JSON.stringify({ candidateId, manifestSha256: verified.manifestDigest, tarballSha256: tarball.sha256 }));
};

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...raw] = process.argv.slice(2);
  const args = parseArguments(raw);
  const directory = resolve(args.directory || process.env.CANDIDATE_DIRECTORY || '.resultsafe-candidates/release');
  if (command === 'build') await buildCandidate(directory, args['candidate-id'] || process.env.CANDIDATE_ID || `local-${Date.now()}`);
  else if (command === 'verify') await verifyCandidate(directory, args);
  else if (command === 'record-qualification') await recordQualification(directory);
  else if (command === 'verify-qualification') await verifyQualificationEvidence(directory, { repository: governed.repository, workflow: governed.workflow, event: args.event, ref: governed.ref, runId: args['run-id'], runAttempt: args['run-attempt'], runSha: args['source-sha'], candidateId: args['candidate-id'], conclusion: 'success' });
  else if (command === 'verify-run') await verifyRemoteQualificationRun(args['run-id']);
  else throw new Error('Usage: candidate.mjs build|verify|record-qualification|verify-qualification|verify-run [--directory=PATH] [--candidate-id=ID] [--source-sha=SHA] [--run-id=ID]');
}
