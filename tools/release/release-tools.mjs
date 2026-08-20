import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const changesetDirectory = resolve(repositoryRoot, '.changeset');
const policyPath = resolve(dirname(fileURLToPath(import.meta.url)), 'release-policy.json');
const pendingOptionPolicyPath = resolve(dirname(fileURLToPath(import.meta.url)), 'pending-option-transition-policy.json');
const exactKeys = (value, expected, location) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location} must be an object.`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${location} has an invalid schema (expected exactly: ${wanted.join(', ')}).`);
  }
};
const safeRelativePath = (value, location) => {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\\') || value.startsWith('/') || value.split('/').includes('..')) {
    throw new Error(`${location} must be a safe repository-relative POSIX path.`);
  }
};

export const loadPolicy = async (root = repositoryRoot) => {
  const path = root === repositoryRoot ? policyPath : resolve(root, 'tools/release/release-policy.json');
  const policy = JSON.parse(await readFile(path, 'utf8'));
  exactKeys(policy, ['$schema', 'schemaVersion', 'transitionState', 'baseBranch', 'packages', 'calculatedReleaseAllowlist'], 'release policy');
  if (policy.$schema !== './release-policy.schema.json' || policy.schemaVersion !== 1 || !['PENDING', 'APPLIED_LOCAL'].includes(policy.transitionState) || typeof policy.baseBranch !== 'string' || !policy.baseBranch) {
    throw new Error('Release policy header is invalid.');
  }
  exactKeys(policy.packages, ['@resultsafe/core-fp-result'], 'release policy packages');
  for (const [name, entry] of Object.entries(policy.packages)) {
    exactKeys(entry, ['directory', 'currentVersion', 'pendingVersion', 'allowedBumps', 'publicApiPaths'], `policy package ${name}`);
    safeRelativePath(entry.directory, `${name}.directory`);
    if (!/^\d+\.\d+\.\d+$/.test(entry.currentVersion) || !/^\d+\.\d+\.\d+$/.test(entry.pendingVersion)) throw new Error(`${name} has an invalid version.`);
    if (!Array.isArray(entry.allowedBumps) || entry.allowedBumps.length !== 1 || entry.allowedBumps[0] !== 'minor') throw new Error(`${name} must allow exactly the governed minor bump.`);
    if (!Array.isArray(entry.publicApiPaths) || entry.publicApiPaths.length === 0) throw new Error(`${name} must declare public API paths.`);
    entry.publicApiPaths.forEach((item) => safeRelativePath(item, `${name}.publicApiPaths`));
    const packageJsonPath = resolve(root, entry.directory, 'package.json');
    if (!packageJsonPath.startsWith(`${resolve(root)}${sep}`)) throw new Error(`${name} directory escapes the repository.`);
    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    const expectedVersion = policy.transitionState === 'APPLIED_LOCAL' ? entry.pendingVersion : entry.currentVersion;
    if (packageJson.name !== name || packageJson.version !== expectedVersion) throw new Error(`${name} package identity/version does not match release policy transition state.`);
  }
  if (!Array.isArray(policy.calculatedReleaseAllowlist) || policy.calculatedReleaseAllowlist.length === 0) throw new Error('Calculated release allowlist must not be empty.');
  const calculatedNames = new Set();
  for (const entry of policy.calculatedReleaseAllowlist) {
    exactKeys(entry, ['name', 'directory', 'currentVersion', 'pendingVersion', 'bump'], 'calculated release entry');
    safeRelativePath(entry.directory, `${entry.name}.directory`);
    if (calculatedNames.has(entry.name)) throw new Error(`Duplicate calculated release entry: ${entry.name}.`);
    calculatedNames.add(entry.name);
    if (!['patch', 'minor', 'major'].includes(entry.bump) || nextVersion(entry.currentVersion, entry.bump) !== entry.pendingVersion) throw new Error(`Calculated release entry is inconsistent: ${entry.name}.`);
    const packageJson = JSON.parse(await readFile(resolve(root, entry.directory, 'package.json'), 'utf8'));
    const expectedVersion = policy.transitionState === 'APPLIED_LOCAL' ? entry.pendingVersion : entry.currentVersion;
    if (packageJson.name !== entry.name || packageJson.version !== expectedVersion) throw new Error(`Calculated release package identity/version differs: ${entry.name}.`);
  }
  const governed = policy.packages['@resultsafe/core-fp-result'];
  const calculated = policy.calculatedReleaseAllowlist;
  if (calculated.length !== 1 || calculated[0].name !== '@resultsafe/core-fp-result' || calculated[0].directory !== governed.directory || calculated[0].currentVersion !== governed.currentVersion || calculated[0].pendingVersion !== governed.pendingVersion || calculated[0].bump !== governed.allowedBumps[0]) {
    throw new Error('Calculated release allowlist must contain only the exact governed Result transition.');
  }
  await loadPendingOptionTransitionPolicy(root);
  return policy;
};

export const loadPendingOptionTransitionPolicy = async (root = repositoryRoot) => {
  const path = root === repositoryRoot ? pendingOptionPolicyPath : resolve(root, 'tools/release/pending-option-transition-policy.json');
  const policy = JSON.parse(await readFile(path, 'utf8'));
  exactKeys(policy, ['$schema', 'schemaVersion', 'transitionState', 'package'], 'pending Option transition policy');
  if (policy.$schema !== './pending-option-transition-policy.schema.json' || policy.schemaVersion !== 1 || policy.transitionState !== 'PENDING_SEPARATE_RELEASE') throw new Error('Pending Option transition policy header is invalid.');
  exactKeys(policy.package, ['name', 'directory', 'currentVersion', 'pendingVersion', 'bump'], 'pending Option transition');
  const entry = policy.package;
  if (entry.name !== '@resultsafe/core-fp-option' || entry.directory !== 'packages/core/fp/option' || entry.currentVersion !== '1.0.0' || entry.pendingVersion !== '1.0.1' || entry.bump !== 'patch') throw new Error('Pending Option transition is invalid.');
  return policy;
};

export const parseChangeset = (text, filename = '<changeset>') => {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/.exec(text);
  if (!match) throw new Error(`${filename} has invalid Changesets frontmatter.`);
  const releases = match[1].split(/\r?\n/).filter(Boolean).map((line) => {
    const item = /^"([^"]+)": (patch|minor|major)$/.exec(line);
    if (!item) throw new Error(`${filename} has invalid release metadata.`);
    return { name: item[1], type: item[2] };
  });
  if (releases.length === 0 || !match[2].trim()) throw new Error(`${filename} must contain a release and summary.`);
  return { releases, summary: match[2].trim() };
};

export const readPendingChangesets = async (root = repositoryRoot) => {
  const directory = resolve(root, '.changeset');
  const names = (await readdir(directory)).filter((name) => name.endsWith('.md') && name !== 'README.md').sort();
  return Promise.all(names.map(async (name) => ({ name, ...parseChangeset(await readFile(resolve(directory, name), 'utf8'), name) })));
};

const nextVersion = (version, bump) => {
  const [major, minor, patch] = version.split('.').map(Number);
  if (bump === 'major') return `${major + 1}.0.0`;
  if (bump === 'minor') return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
};

export const validatePendingChangesets = async (root = repositoryRoot, { requirePending = true } = {}) => {
  const policy = await loadPolicy(root);
  const changesets = await readPendingChangesets(root);
  if (policy.transitionState === 'APPLIED_LOCAL') {
    if (changesets.length !== 0) throw new Error('Applied local transition must have no unconsumed changesets.');
    return { policy, changesets, releases: new Map(policy.calculatedReleaseAllowlist.map((entry) => [entry.name, entry.bump])) };
  }
  if (requirePending && changesets.length === 0) throw new Error('No pending changeset exists.');
  const seen = new Map();
  for (const changeset of changesets) for (const release of changeset.releases) {
    const entry = policy.packages[release.name];
    if (!entry) throw new Error(`${changeset.name} targets package not present in the release allowlist: ${release.name}.`);
    if (!entry.allowedBumps.includes(release.type)) throw new Error(`${changeset.name} uses unauthorized ${release.type} bump for ${release.name}.`);
    if (seen.has(release.name)) throw new Error(`Multiple pending changesets target ${release.name}; combine them for an unambiguous release decision.`);
    if (nextVersion(entry.currentVersion, release.type) !== entry.pendingVersion) throw new Error(`${release.name} does not calculate to governed pending version ${entry.pendingVersion}.`);
    seen.set(release.name, release.type);
  }
  return { policy, changesets, releases: seen };
};

export const createChangeset = async ({ packageName, bump, summary, id }, root = repositoryRoot) => {
  const policy = await loadPolicy(root);
  if (policy.transitionState !== 'PENDING') throw new Error('The governed transition is already applied locally.');
  const entry = policy.packages[packageName];
  if (!entry) throw new Error(`Package is not in the release allowlist: ${packageName}.`);
  const releaseType = bump ?? entry.allowedBumps[0];
  if (!entry.allowedBumps.includes(releaseType)) throw new Error(`Bump is not allowed for ${packageName}: ${releaseType}.`);
  if (typeof summary !== 'string' || summary.trim().length < 10 || /[\r\n]/.test(summary)) throw new Error('A single-line --summary of at least 10 characters is required.');
  const safeId = id ?? `release-${randomBytes(6).toString('hex')}`;
  if (!/^[a-z0-9][a-z0-9-]{2,63}$/.test(safeId)) throw new Error('Changeset --id must be a safe lowercase slug.');
  const directory = resolve(root, '.changeset');
  if (await realpath(directory) !== directory) throw new Error('Changeset directory must not be a symlink or path alias.');
  const path = resolve(directory, `${safeId}.md`);
  if (dirname(path) !== directory) throw new Error('Changeset path escapes .changeset.');
  await writeFile(path, `---\n"${packageName}": ${releaseType}\n---\n\n${summary.trim()}\n`, { encoding: 'utf8', flag: 'wx' });
  return path;
};

const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const tryCommit = (root, ref) => {
  if (!ref || /^0+$/.test(ref) || (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,255}$/.test(ref) && ref !== 'HEAD^')) return undefined;
  try { return git(root, ['rev-parse', '--verify', `${ref}^{commit}`]); } catch { return undefined; }
};
const gitPaths = (root, args) => {
  const output = execFileSync('git', [...args, '-z'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  return output.toString('utf8').split('\0').filter(Boolean).map((path) => path.split(sep).join('/'));
};
export const changedPathsAgainstBase = (root = repositoryRoot, explicitBase) => {
  const policyBase = JSON.parse(readFileSync(resolve(root, 'tools/release/release-policy.json'), 'utf8')).baseBranch;
  if (explicitBase && !tryCommit(root, explicitBase)) throw new Error(`Explicit Git base is invalid or unavailable: ${explicitBase}.`);
  const requested = [explicitBase, process.env.CHANGESET_BASE_REF, process.env.GITHUB_BASE_REF && `origin/${process.env.GITHUB_BASE_REF}`, process.env.GITHUB_BASE_REF].filter(Boolean);
  let baseCommit = requested.map((ref) => tryCommit(root, ref)).find(Boolean);
  if (!baseCommit) {
    const head = git(root, ['rev-parse', 'HEAD']);
    baseCommit = [`origin/${policyBase}`, policyBase].map((ref) => tryCommit(root, ref)).find((commit) => commit && commit !== head) ?? tryCommit(root, 'HEAD^');
  }
  if (!baseCommit) throw new Error('Unable to resolve a Git base commit; set CHANGESET_BASE_REF and fetch that commit.');
  const mergeBase = git(root, ['merge-base', baseCommit, 'HEAD']);
  if (!mergeBase) throw new Error('Unable to calculate a merge base.');
  const paths = [...gitPaths(root, ['diff', '--name-only', `${mergeBase}...HEAD`]), ...gitPaths(root, ['diff', '--name-only', 'HEAD']), ...gitPaths(root, ['ls-files', '--others', '--exclude-standard'])];
  return { baseCommit: mergeBase, paths: [...new Set(paths)].sort() };
};

export const requireChangesetsForApiChanges = async (root = repositoryRoot, explicitBase) => {
  const { policy, changesets } = await validatePendingChangesets(root, { requirePending: false });
  const diff = changedPathsAgainstBase(root, explicitBase);
  const covered = new Set([
    ...changesets.flatMap((item) => item.releases.map((release) => release.name)),
    ...(policy.transitionState === 'APPLIED_LOCAL' ? Object.keys(policy.packages) : []),
  ]);
  const missing = [];
  for (const [name, entry] of Object.entries(policy.packages)) {
    if (diff.paths.some((path) => entry.publicApiPaths.some((prefix) => path === prefix || path.startsWith(prefix))) && !covered.has(name)) missing.push(name);
  }
  if (missing.length) throw new Error(`Public API changes require a pending changeset for: ${missing.join(', ')}.`);
  return diff;
};

export const assertReleaseAllowed = async (requestedPackage, requestedVersion, root = repositoryRoot) => {
  const { policy, releases } = await validatePendingChangesets(root);
  if (!policy.packages[requestedPackage]) throw new Error(`Package is not in the release allowlist: ${requestedPackage}.`);
  if (requestedVersion !== policy.packages[requestedPackage].pendingVersion) throw new Error(`Version is not the exact governed release for ${requestedPackage}: ${requestedVersion}.`);
  if (!releases.has(requestedPackage)) throw new Error(`No governed pending release exists for ${requestedPackage}.`);
  if (releases.size !== 1) throw new Error('Release guard refuses multiple direct release records.');
  if (policy.transitionState === 'APPLIED_LOCAL') return policy.packages[requestedPackage].pendingVersion;
  const temporaryDirectory = mkdtempSync(resolve(tmpdir(), 'resultsafe-changeset-status-'));
  const output = resolve(temporaryDirectory, 'status.json');
  let calculated;
  try {
    const pnpm = process.platform === 'win32' ? 'pnpm.exe' : 'pnpm';
    execFileSync(pnpm, ['exec', 'changeset', 'status', '--output', output], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
    calculated = JSON.parse(readFileSync(output, 'utf8')).releases;
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  const expected = policy.calculatedReleaseAllowlist;
  if (!Array.isArray(calculated) || calculated.length !== expected.length) throw new Error('Calculated Changesets release set differs from the release allowlist.');
  for (const allowed of expected) {
    const actual = calculated.find((release) => release.name === allowed.name);
    if (!actual || actual.type !== allowed.bump || actual.oldVersion !== allowed.currentVersion || actual.newVersion !== allowed.pendingVersion) {
      throw new Error(`Calculated release is not allowlisted exactly: ${allowed.name}.`);
    }
  }
  return policy.packages[requestedPackage].pendingVersion;
};
