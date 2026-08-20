import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { cpus } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import type { Scenario, ScenarioAssertion } from './model.js';
import { aggregateBehavioralStatus, type LanguageStatus } from './qualification-status.js';

interface AssertionResult {
  readonly operator: string;
  readonly passed: boolean;
  readonly detail: string;
}

interface ScenarioResult {
  readonly scenario: Scenario;
  readonly passed: boolean;
  readonly durationMs: number;
  readonly subject: 'PACKED_PACKAGE_RUNTIME' | 'PACKED_PACKAGE_DECLARATIONS';
  readonly assertions: readonly AssertionResult[];
  readonly diagnostics?: readonly string[];
}

const PACKAGE_NAME = '@resultsafe/core-fp-result';
const CHILD_MARKER = '__RESULTSAFE_CONFORMANCE__';
const CHILD_TIMEOUT_MS = 5_000;
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const stagingRoot = resolve(root, 'platform/staging/resultsafe-core-v001');
const catalogPath = resolve(stagingRoot, 'SCENARIO-CATALOG.json');
const qualificationPath = resolve(stagingRoot, 'QUALIFICATION-RECEIPT.json');
const traceabilityPath = resolve(stagingRoot, 'TRACEABILITY-MATRIX.json');
const packageRoot = resolve(root, 'packages/core/fp/result');

const runProcess = async (command: string, args: readonly string[], options: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv }): Promise<{ code: number; stdout: string; stderr: string }> =>
  new Promise((completion, rejection) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? { ...process.env, NO_COLOR: '1' },
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });
    const timer = options.timeoutMs === undefined ? undefined : setTimeout(() => child.kill('SIGKILL'), options.timeoutMs);
    child.once('error', rejection);
    child.once('close', (code) => {
      if (timer) clearTimeout(timer);
      completion({ code: code ?? -1, stdout, stderr });
    });
  });

const assertionSource = (assertion: ScenarioAssertion, index: number): string => {
  const actual = assertion.actual ?? 'undefined';
  const expected = assertion.expected ?? 'undefined';
  let check: string;
  switch (assertion.operator) {
    case 'TRUE': check = `(${actual}) === true`; break;
    case 'FALSE': check = `(${actual}) === false`; break;
    case 'FROZEN': check = `Object.isFrozen(${actual})`; break;
    case 'STRICT_EQUAL': check = `(${actual}) === (${expected})`; break;
    case 'SAME_REFERENCE': check = `(${actual}) === (${expected})`; break;
    case 'INSTANCE_OF': check = `(${actual}) instanceof (${expected})`; break;
    case 'TYPE_EXACT': check = `typeof (${actual}) === (${expected})`; break;
    case 'DEEP_EQUAL': check = `deepEqual(${actual}, ${expected})`; break;
    case 'SEQUENCE_EQUAL': check = `deepEqual(Array.from(${actual}), Array.from(${expected}))`; break;
    case 'THROWS_ON_SET': check = `throws(() => { ${actual}; })`; break;
    default: check = `unsupported(${JSON.stringify(assertion.operator)})`; break;
  }
  return `evaluate(${index}, ${JSON.stringify(assertion.operator)}, () => (${check}));`;
};

const runtimeModule = (scenario: Scenario): string => {
  if (scenario.execution.kind !== 'RUNTIME') throw new Error(`${scenario.scenario_key}: runtime category has compile execution`);
  const imports = scenario.execution.imports.map((binding) => {
    if (binding.module !== PACKAGE_NAME && binding.module !== `${PACKAGE_NAME}/Ok` && binding.module !== `${PACKAGE_NAME}/Err` && binding.module !== `${PACKAGE_NAME}/conversions`) {
      throw new Error(`${scenario.scenario_key}: untrusted runtime module ${binding.module}`);
    }
    if (!binding.names.every((name) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name))) throw new Error(`${scenario.scenario_key}: invalid import binding`);
    return `import { ${binding.names.join(', ')} } from ${JSON.stringify(binding.module)};`;
  }).join('\n');
  const invocation = scenario.execution.capture === 'AWAIT_RETURN_OR_REJECT'
    ? `await (${scenario.execution.invocation})`
    : `(${scenario.execution.invocation})`;
  const captureFailure = scenario.execution.capture === 'AWAIT_RETURN_OR_REJECT'
    ? "outcome = { kind: 'reject', reason: error };"
    : "outcome = { kind: 'throw', error };";
  return `
import { isDeepStrictEqual } from 'node:util';
${imports}
const results = [];
const deepEqual = (actual, expected) => isDeepStrictEqual(actual, expected);
const throws = (callback) => { try { callback(); return false; } catch { return true; } };
const unsupported = (operator) => { throw new Error('Unsupported assertion operator: ' + operator); };
const evaluate = (index, operator, check) => { try { const passed = check() === true; results[index] = { operator, passed, detail: passed ? 'assertion satisfied' : 'assertion returned false' }; } catch (error) { results[index] = { operator, passed: false, detail: error instanceof Error ? error.message : String(error) }; } };
try {
  ${scenario.execution.fixture_source}
  let outcome;
  try { outcome = { kind: 'return', value: ${invocation} }; } catch (error) { ${captureFailure} }
  ${scenario.assertions.map(assertionSource).join('\n  ')}
  console.log(${JSON.stringify(CHILD_MARKER)} + JSON.stringify(results));
} catch (error) {
  console.log(${JSON.stringify(CHILD_MARKER)} + JSON.stringify({ fatal: error instanceof Error ? error.stack ?? error.message : String(error) }));
}
`;
};

const runRuntime = async (scenario: Scenario, workspace: string): Promise<ScenarioResult> => {
  const started = performance.now();
  const modulePath = join(workspace, 'runtime', `${scenario.code}.mjs`);
  await writeFile(modulePath, runtimeModule(scenario), 'utf8');
  const childEnv = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'TEMP', 'TMP'].flatMap((key) => process.env[key] === undefined ? [] : [[key, process.env[key]]]));
  const permissionFlag = process.allowedNodeEnvironmentFlags.has('--permission') ? '--permission' : '--experimental-permission';
  const child = await runProcess(process.execPath, [permissionFlag, `--allow-fs-read=${workspace}`, modulePath], { cwd: workspace, timeoutMs: CHILD_TIMEOUT_MS, env: { ...childEnv, NO_COLOR: '1' } });
  const markerLine = child.stdout.split(/\r?\n/).reverse().find((line) => line.startsWith(CHILD_MARKER));
  let assertions: AssertionResult[];
  if (!markerLine) {
    const detail = child.code === -1 ? `child exceeded ${CHILD_TIMEOUT_MS}ms` : (child.stderr.trim() || `child exited ${child.code}`);
    assertions = scenario.assertions.map(({ operator }) => ({ operator, passed: false, detail: detail.slice(0, 1000) }));
  } else {
    const output = JSON.parse(markerLine.slice(CHILD_MARKER.length)) as AssertionResult[] | { fatal: string };
    assertions = Array.isArray(output) ? output : scenario.assertions.map(({ operator }) => ({ operator, passed: false, detail: output.fatal.slice(0, 1000) }));
  }
  return {
    scenario,
    passed: assertions.length === scenario.assertions.length && assertions.every(({ passed }) => passed),
    durationMs: Math.max(0, Math.round(performance.now() - started)),
    subject: 'PACKED_PACKAGE_RUNTIME',
    assertions,
  };
};

const compileScenarios = (scenarios: readonly Scenario[], workspace: string): ScenarioResult[] => {
  const started = performance.now();
  for (const scenario of scenarios) if (scenario.execution.kind !== 'COMPILE') throw new Error(`${scenario.scenario_key}: compile category has runtime execution`);
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: false,
  };
  const normalizePath = (path: string): string => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  const sourceFiles = scenarios.map((scenario) => resolve(join(workspace, 'compile', `${scenario.code}.mts`)));
  const sourcePaths = new Map(sourceFiles.map((path, index) => [normalizePath(path), scenarios[index] as Scenario]));
  const program = ts.createProgram(sourceFiles, options);
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const shared = diagnostics.filter((diagnostic) => !diagnostic.file || !sourcePaths.has(normalizePath(diagnostic.file.fileName)));
  const durationMs = Math.max(0, Math.round(performance.now() - started));
  return scenarios.map((scenario): ScenarioResult => {
    const sourcePath = normalizePath(join(workspace, 'compile', `${scenario.code}.mts`));
    const own = diagnostics.filter((diagnostic) => diagnostic.file && normalizePath(diagnostic.file.fileName) === sourcePath);
    const relevant = [...shared, ...own];
    const compiles = relevant.length === 0;
    const formatted = relevant.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    const assertions = scenario.assertions.map(({ operator }): AssertionResult => {
      const supported = operator === 'COMPILES' || operator === 'DOES_NOT_COMPILE';
      const expectedDiagnostics = scenario.execution_evidence?.diagnostics;
      const exactNegative = operator !== 'DOES_NOT_COMPILE' || (expectedDiagnostics !== undefined && JSON.stringify(formatted) === JSON.stringify(expectedDiagnostics));
      const passed = supported && (operator === 'COMPILES' ? compiles : !compiles && exactNegative);
      return { operator, passed, detail: !supported ? 'operator is not valid for compile execution' : compiles ? 'TypeScript emitted no diagnostics' : exactNegative ? `TypeScript emitted the exact ${relevant.length} expected diagnostic(s)` : `TypeScript diagnostics differ from the exact expected set` };
    });
    return {
      scenario,
      passed: assertions.every(({ passed }) => passed),
      durationMs,
      subject: 'PACKED_PACKAGE_DECLARATIONS',
      assertions,
      ...(formatted.length > 0 ? { diagnostics: formatted.slice(0, 20) } : {}),
    };
  });
};

const mapConcurrent = async <T, R>(values: readonly T[], concurrency: number, map: (value: T) => Promise<R>): Promise<R[]> => {
  const output = new Array<R>(values.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (next < values.length) {
      const index = next++;
      output[index] = await map(values[index] as T);
    }
  }));
  return output;
};

const writeEvidence = async (catalog: Record<string, unknown>, qualification: Record<string, unknown>, traceability: Record<string, unknown>, results: readonly ScenarioResult[], runId: string, executedAt: string, writeQualification: boolean): Promise<void> => {
  const payload = catalog['payload'] as Record<string, unknown>;
  const scenarios = payload['scenarios'] as Record<string, unknown>[];
  const byId = new Map(results.map((result) => [result.scenario.scenario_id, result]));
  for (const scenario of scenarios) {
    const result = byId.get(String(scenario['scenario_id']));
    if (!result) continue;
    scenario['status'] = result.passed ? 'PASS' : 'FAIL';
    scenario['execution_evidence'] = {
      run_id: runId,
      executed_at: executedAt,
      duration_ms: result.durationMs,
      subject: result.subject,
      assertions: result.assertions,
      ...(result.diagnostics ? { diagnostics: result.diagnostics } : {}),
    };
  }
  payload['execution_state'] = 'EXECUTED';
  catalog['document_revision'] = Number(catalog['document_revision']) + 1;
  catalog['updated_at'] = executedAt;

  const qualificationPayload = qualification['payload'] as Record<string, unknown>;
  const passed = results.every((result) => result.passed);
  const languageStatuses = (qualificationPayload['language_projection_results'] as Record<string, unknown>[])
    .map((result) => String(result['status']) as LanguageStatus);
  qualificationPayload['behavioral_status'] = aggregateBehavioralStatus(passed ? 'PASS' : 'FAIL', languageStatuses);
  const checks = qualificationPayload['checks'] as Record<string, unknown>[];
  const upsertCheck = (key: string, status: 'PASS' | 'FAIL', evidence: string): void => {
    const existing = checks.find((check) => check['check_key'] === key);
    if (existing) {
      existing['status'] = status;
      existing['evidence'] = evidence;
    } else {
      checks.push({ check_key: key, status, evidence });
    }
  };
  const behavioral = checks.find((check) => check['check_key'] === 'behavioral-conformance');
  if (!behavioral) throw new Error('qualification receipt has no behavioral-conformance check');
  behavioral['status'] = passed ? 'PASS' : 'FAIL';
  behavioral['evidence'] = `${results.length} scenarios executed against packed package artifacts in run ${runId}; ${results.filter((result) => !result.passed).length} failed`;
  const setGate = (key: string, categories: readonly Scenario['category'][]): void => {
    const selected = results.filter(({ scenario }) => categories.includes(scenario.category));
    const gatePassed = selected.length > 0 && selected.every(({ passed: itemPassed }) => itemPassed);
    upsertCheck(key, gatePassed ? 'PASS' : 'FAIL', `${selected.length} ${categories.join('/')} scenarios executed in run ${runId}; ${selected.filter(({ passed: itemPassed }) => !itemPassed).length} failed`);
  };
  setGate('runtime-conformance', ['RUNTIME', 'ASYNC']);
  setGate('compile-time-conformance', ['COMPILE']);
  setGate('packed-package-consumer-matrix', ['PACKAGE']);
  qualification['document_revision'] = Number(qualification['document_revision']) + 1;
  qualification['updated_at'] = executedAt;

  const passedScenarioRefs = new Set(results.filter(({ passed }) => passed).map(({ scenario }) => scenario.scenario_ref));
  const traceabilityPayload = traceability['payload'] as Record<string, unknown>;
  const links = traceabilityPayload['links'] as Record<string, unknown>[];
  for (const link of links) {
    if (link['relation'] === 'HAS_SCENARIO' && passedScenarioRefs.has(String(link['target_ref']))) {
      link['relation'] = 'VERIFIED_BY';
    }
  }
  traceability['document_revision'] = Number(traceability['document_revision']) + 1;
  traceability['updated_at'] = executedAt;

  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
  if (writeQualification) await writeFile(qualificationPath, `${JSON.stringify(qualification, null, 2)}\n`, 'utf8');
  await writeFile(traceabilityPath, `${JSON.stringify(traceability, null, 2)}\n`, 'utf8');
};

export const runConformance = async (options: { tarball?: string; runId?: string; writeEvidence?: boolean; writeQualification?: boolean } = {}): Promise<readonly ScenarioResult[]> => {
  const catalog = JSON.parse(await readFile(catalogPath, 'utf8')) as Record<string, unknown>;
  const qualification = JSON.parse(await readFile(qualificationPath, 'utf8')) as Record<string, unknown>;
  const traceability = JSON.parse(await readFile(traceabilityPath, 'utf8')) as Record<string, unknown>;
  const scenarios = ((catalog['payload'] as Record<string, unknown>)['scenarios'] as Scenario[]);
  if (scenarios.length === 0) throw new Error('scenario catalog is empty');
  if (!scenarios.every((scenario) => /^RS-SCN-[0-9]{3}$/.test(scenario.code))) throw new Error('scenario catalog contains an unsafe code binding');

  if (!options.tarball) {
    const buildCommand = process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : 'pnpm';
    const buildArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'pnpm run build:release'] : ['run', 'build:release'];
    await runProcess(buildCommand, buildArgs, { cwd: packageRoot }).then((result) => {
      if (result.code !== 0) throw new Error(`package build failed:\n${result.stderr || result.stdout}`);
    });
  }
  const workspace = await mkdtemp(resolve(root, '.resultsafe-conformance-'));
  try {
    const installedPackage = join(workspace, 'node_modules', '@resultsafe', 'core-fp-result');
    await mkdir(installedPackage, { recursive: true });
    await mkdir(join(workspace, 'runtime'), { recursive: true });
    await mkdir(join(workspace, 'compile'), { recursive: true });
    let tarballPath = options.tarball;
    if (!tarballPath) {
      const npmCommand = process.platform === 'win32' ? (process.env['ComSpec'] ?? 'cmd.exe') : 'npm';
      const packArgs = process.platform === 'win32'
        ? ['/d', '/c', 'npm', 'pack', '--json', '--pack-destination', workspace, './dist']
        : ['pack', '--json', '--pack-destination', workspace, './dist'];
      const packed = await runProcess(npmCommand, packArgs, { cwd: packageRoot });
      if (packed.code !== 0) throw new Error(`package packing failed:\n${packed.stderr || packed.stdout}`);
      const packOutput = JSON.parse(packed.stdout) as { filename: string }[];
      const tarball = packOutput[0]?.filename;
      if (!tarball) throw new Error('npm pack did not report a tarball');
      tarballPath = join(workspace, tarball);
    }
    const extracted = await runProcess('tar', ['-xf', resolve(tarballPath), '--strip-components=1', '-C', installedPackage], { cwd: workspace });
    if (extracted.code !== 0) throw new Error(`package extraction failed:\n${extracted.stderr || extracted.stdout}`);
    await writeFile(join(workspace, 'package.json'), '{"private":true,"type":"module"}\n', 'utf8');
    for (const scenario of scenarios) if (scenario.execution.kind === 'COMPILE') {
      await writeFile(join(workspace, 'compile', `${scenario.code}.mts`), scenario.execution.source, 'utf8');
    }
    const compile = compileScenarios(scenarios.filter((scenario) => scenario.execution.kind === 'COMPILE'), workspace);
    const runtimeScenarios = scenarios.filter((scenario) => scenario.execution.kind === 'RUNTIME');
    const runtime = await mapConcurrent(runtimeScenarios, Math.min(8, Math.max(2, cpus().length)), (scenario) => runRuntime(scenario, workspace));
    const order = new Map(scenarios.map((scenario, index) => [scenario.scenario_id, index]));
    const results = [...compile, ...runtime].sort((left, right) => (order.get(left.scenario.scenario_id) ?? 0) - (order.get(right.scenario.scenario_id) ?? 0));
    if (results.length !== scenarios.length) throw new Error(`executed ${results.length} of ${scenarios.length} scenarios`);
    if (options.writeEvidence !== false) {
      await writeEvidence(catalog, qualification, traceability, results, options.runId ?? randomUUID(), new Date().toISOString(), options.writeQualification ?? true);
    }
    return results;
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const suppliedTarball = process.env['RESULTSAFE_QUALIFIED_TARBALL'];
  const writeQualification = process.env['RESULTSAFE_SKIP_QUALIFICATION'] !== '1';
  const writeSuppliedEvidence = process.env['RESULTSAFE_WRITE_EVIDENCE'] === '1';
  const results = await runConformance(suppliedTarball
    ? { tarball: suppliedTarball, writeEvidence: writeSuppliedEvidence, writeQualification }
    : { writeQualification });
  const failures = results.filter((result) => !result.passed);
  console.log(`Executed ${results.length} scenarios: ${results.length - failures.length} passed, ${failures.length} failed.`);
  for (const failure of failures) {
    const assertions = failure.assertions.filter((item) => !item.passed).map((item) => `${item.operator}: ${item.detail}`).join('; ');
    const diagnostics = failure.diagnostics?.length ? `; diagnostics: ${failure.diagnostics.join(' | ')}` : '';
    console.error(`${failure.scenario.code} ${failure.scenario.scenario_key}: ${assertions}${diagnostics}`);
  }
  if (failures.length > 0) process.exitCode = 1;
}
