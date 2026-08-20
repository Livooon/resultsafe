import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { aggregateBehavioralStatus, languageSurfaceStatus, type BehavioralStatus, type LanguageStatus } from './qualification-status.js';

type Target = 'typescript' | 'python';

interface Binding {
  readonly operation_key: string;
  readonly module_name: string;
  readonly method_name?: string;
}

interface Surface {
  readonly target: Target;
  readonly projectionRef: string;
  readonly projectionRevision: number;
  readonly contractRef: string;
  readonly contractRevision: number;
  readonly bindings: readonly Binding[];
  readonly methodBindings: readonly Binding[];
  readonly issues: readonly string[];
}

interface CommandResult {
  readonly label: string;
  readonly passed: boolean;
  readonly detail?: string;
}

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const stagingRoot = resolve(root, 'platform/staging/resultsafe-core-v001');
const contractPath = resolve(stagingRoot, 'CONTRACT-IR.json');
const projectionPath = resolve(stagingRoot, 'PROJECTION-CATALOG.json');
const qualificationPath = resolve(stagingRoot, 'QUALIFICATION-RECEIPT.json');
const scenarioPath = resolve(stagingRoot, 'SCENARIO-CATALOG.json');
const matrixPath = resolve(stagingRoot, 'CONFORMANCE-MATRIX.json');
const packageRoot = resolve(root, 'packages/core/fp/result');

const records = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];

const compact = (value: string): string => value.replace(/\s+/g, ' ').trim().slice(0, 800);

const uuidV7 = (): string => {
  const bytes = randomBytes(16);
  let timestamp = Date.now();
  for (let index = 5; index >= 0; index--) {
    bytes[index] = timestamp & 0xff;
    timestamp = Math.floor(timestamp / 256);
  }
  bytes[6] = 0x70 | ((bytes[6] as number) & 0x0f);
  bytes[8] = 0x80 | ((bytes[8] as number) & 0x3f);
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
};

const run = (command: string, args: readonly string[], label: string): Promise<CommandResult> =>
  new Promise((completion) => {
    console.log(`+ ${label}`);
    const child = spawn(command, args, {
      cwd: root,
      env: { ...process.env, NO_COLOR: '1' },
      shell: process.platform === 'win32' && command.endsWith('.cmd'),
      stdio: ['ignore', 'inherit', 'pipe'],
      windowsHide: true,
    });
    let stderr = '';
    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.once('error', (error) => completion({ label, passed: false, detail: compact(error.message) }));
    child.once('close', (code) => completion({
      label,
      passed: code === 0,
      ...(code === 0 ? {} : { detail: compact(stderr || `exited with code ${String(code)}`) }),
    }));
  });

const deriveSurface = (
  target: Target,
  expectedCount: number,
  contract: Record<string, unknown>,
  catalog: Record<string, unknown>,
): Surface => {
  const issues: string[] = [];
  const contractPayload = contract['payload'] as Record<string, unknown>;
  const operations = contractPayload['operations'] as Record<string, Record<string, unknown>>;
  const catalogPayload = catalog['payload'] as Record<string, unknown>;
  const projection = records(catalogPayload['items']).find((item) => item['target_key'] === target && item['projection_kind'] === 'LANGUAGE');
  if (!projection) throw new Error(`no ${target} language projection exists`);

  const applicable = Object.entries(operations).filter(([, operation]) =>
    Array.isArray(operation['projection_applicability']) && operation['projection_applicability'].includes(target));
  const rawBindings = records(projection['operation_bindings']);
  const bindings = rawBindings.map((binding): Binding => ({
    operation_key: String(binding['operation_key']),
    module_name: String(binding['module_name']),
    ...(typeof binding['method_name'] === 'string' ? { method_name: binding['method_name'] } : {}),
  }));
  const byOperation = new Map(bindings.map((binding) => [binding.operation_key, binding]));
  if (applicable.length !== expectedCount) issues.push(`Contract IR has ${applicable.length} applicable operations; expected ${expectedCount}`);
  if (bindings.length !== applicable.length || byOperation.size !== applicable.length) issues.push(`projection has ${bindings.length} bindings for ${applicable.length} applicable operations`);
  for (const [key, operation] of applicable) {
    const binding = byOperation.get(key);
    if (!binding) {
      issues.push(`missing operation binding ${key}`);
      continue;
    }
    if (binding.module_name.length === 0) issues.push(`${key} has no module binding`);
    const surface = operation['surface_contract'] as Record<string, unknown>;
    const methodRequired = surface['instance_method'] !== 'FORBIDDEN';
    if (methodRequired !== (binding.method_name !== undefined)) issues.push(`${key} has an incorrect method surface binding`);
  }
  for (const binding of bindings) if (!Object.hasOwn(operations, binding.operation_key) || !applicable.some(([key]) => key === binding.operation_key)) {
    issues.push(`unexpected operation binding ${binding.operation_key}`);
  }
  if (projection['contract_ir_ref'] !== contract['document_ref'] || projection['contract_ir_revision'] !== contract['document_revision']) {
    issues.push('projection is not bound to the current Contract IR reference and revision');
  }
  const methodBindings = bindings.filter((binding) => binding.method_name !== undefined);
  if (methodBindings.length !== 21) issues.push(`projection has ${methodBindings.length} Result method bindings; expected 21`);

  return {
    target,
    projectionRef: String(projection['record_ref']),
    projectionRevision: Number(projection['record_revision']),
    contractRef: String(contract['document_ref']),
    contractRevision: Number(contract['document_revision']),
    bindings,
    methodBindings,
    issues,
  };
};

const probeTypeScriptRuntime = async (surface: Surface): Promise<CommandResult> => {
  const label = 'packed ESM runtime operation-surface probe';
  try {
    const module = await import(`${pathToFileURL(resolve(packageRoot, 'dist/esm/index.js')).href}?qualification=${Date.now()}`) as Record<string, unknown>;
    const missingFunctions = surface.bindings.filter((binding) => typeof module[binding.module_name] !== 'function').map((binding) => binding.module_name);
    const ok = (module['Ok'] as (value: number) => Record<string, unknown>)(1);
    const err = (module['Err'] as (error: string) => Record<string, unknown>)('failure');
    const missingMethods = surface.methodBindings.filter((binding) =>
      typeof ok[binding.method_name as string] !== 'function' || typeof err[binding.method_name as string] !== 'function').map((binding) => binding.method_name as string);
    if (missingFunctions.length > 0 || missingMethods.length > 0) {
      throw new Error(`missing functions [${missingFunctions.join(', ')}], methods [${missingMethods.join(', ')}]`);
    }
    return { label, passed: true };
  } catch (error) {
    return { label, passed: false, detail: compact(error instanceof Error ? error.message : String(error)) };
  }
};

const probeTypeScriptDeclarations = async (surface: Surface): Promise<CommandResult> => {
  const label = 'packed declaration operation-surface probe';
  const sourcePath = resolve(packageRoot, '.resultsafe-language-surface.mts');
  const imports = [...new Set(surface.bindings.map((binding) => binding.module_name))];
  const methods = surface.methodBindings.map((binding) => binding.method_name as string);
  const source = [
    `import { ${imports.join(', ')} } from './dist/types/index.js';`,
    'const success = Ok(1);',
    "const failure = Err('failure');",
    ...imports.map((name) => `void ${name};`),
    ...methods.flatMap((name) => [`void success.${name};`, `void failure.${name};`]),
  ].join('\n');
  try {
    await writeFile(sourcePath, `${source}\n`, 'utf8');
    const program = ts.createProgram([sourcePath], {
      strict: true,
      noEmit: true,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      target: ts.ScriptTarget.ES2022,
      skipLibCheck: false,
    });
    const diagnostics = ts.getPreEmitDiagnostics(program);
    if (diagnostics.length > 0) throw new Error(diagnostics.map((item) => ts.flattenDiagnosticMessageText(item.messageText, ' ')).join('; '));
    return { label, passed: true };
  } catch (error) {
    return { label, passed: false, detail: compact(error instanceof Error ? error.message : String(error)) };
  } finally {
    await rm(sourcePath, { force: true });
  }
};

const scenarioStatus = (scenarioCatalog: Record<string, unknown>): BehavioralStatus => {
  const payload = scenarioCatalog['payload'] as Record<string, unknown>;
  const executionState = payload['execution_state'];
  const scenarios = records(payload['scenarios']);
  if (executionState === 'NOT_EXECUTED') return 'NOT_EXECUTED';
  if (executionState === 'PARTIAL') return 'PARTIAL';
  return scenarios.some((scenario) => scenario['status'] === 'FAIL') ? 'FAIL' : 'PASS';
};

const evidence = (surface: Surface, status: LanguageStatus, outcomes: readonly CommandResult[]): string => {
  const failed = [
    ...surface.issues,
    ...outcomes.filter((outcome) => !outcome.passed).map((outcome) => `${outcome.label}: ${outcome.detail ?? 'failed'}`),
  ];
  const commands = outcomes.map((outcome) => `${outcome.label} [${outcome.passed ? 'PASS' : 'FAIL'}]`).join('; ');
  return `${status}: ${surface.bindings.length} operations, ${surface.bindings.length} module function/constructor surfaces, and ${surface.methodBindings.length} Result method surfaces; Contract IR ${surface.contractRef} revision ${surface.contractRevision}; projection ${surface.projectionRef} revision ${surface.projectionRevision}; commands/checks: ${commands}${failed.length > 0 ? `; failures: ${failed.join('; ')}` : ''}`;
};

export const qualifyLanguages = async (): Promise<readonly LanguageStatus[]> => {
  const readJson = async (path: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  const [contract, catalog, qualification, scenarios, matrix] = await Promise.all([
    readJson(contractPath),
    readJson(projectionPath),
    readJson(qualificationPath),
    readJson(scenarioPath),
    readJson(matrixPath),
  ]);
  const surfaces = [deriveSurface('typescript', 30, contract, catalog), deriveSurface('python', 23, contract, catalog)];
  const scenarioCount = records((scenarios['payload'] as Record<string, unknown>)['scenarios']).length;

  const typescriptOutcomes: CommandResult[] = [];
  for (const [args, label] of [
    [['-C', 'packages/core/fp/result', 'run', 'test'], 'pnpm -C packages/core/fp/result run test'],
    [['-C', 'packages/core/fp/result', 'run', 'typecheck:contracts'], 'pnpm -C packages/core/fp/result run typecheck:contracts'],
    [['-C', 'packages/core/fp/result', 'run', 'verify:release'], 'pnpm -C packages/core/fp/result run verify:release'],
  ] as const) typescriptOutcomes.push(await run(process.platform === 'win32' ? 'pnpm.exe' : 'pnpm', args, label));
  const typescriptSurface = surfaces[0] as Surface;
  typescriptOutcomes.push(await probeTypeScriptRuntime(typescriptSurface));
  typescriptOutcomes.push(await probeTypeScriptDeclarations(typescriptSurface));

  const pythonSurface = surfaces[1] as Surface;
  const pythonOutcomes = [await run(process.platform === 'win32' ? 'python.exe' : 'python3', ['tools/qualify_python.py'], 'python tools/qualify_python.py (pytest runtime + strict mypy + isolated wheel)')];
  const outcomes = [typescriptOutcomes, pythonOutcomes];
  const matrixPayload = matrix['payload'] as Record<string, unknown>;
  const matrixCells = records(matrixPayload['cells']);
  const matrixCurrent = matrixPayload['status'] === 'PASS' && matrixPayload['contract_ir_ref'] === contract['document_ref'] &&
    matrixPayload['contract_ir_revision'] === contract['document_revision'] && matrixPayload['projection_catalog_ref'] === catalog['document_ref'] &&
    matrixPayload['projection_catalog_revision'] === catalog['document_revision'];
  const statuses = surfaces.map((surface, index): LanguageStatus =>
    surface.issues.length === 0 && matrixCurrent && matrixCells.filter((cell) => cell['target_language'] === surface.target && cell['status'] === 'PASS').length === 44 &&
    (outcomes[index] as readonly CommandResult[]).every((outcome) => outcome.passed) ? 'PASS' : 'FAIL');

  const payload = qualification['payload'] as Record<string, unknown>;
  payload['language_projection_results'] = surfaces.map((surface, index) => ({
    target_key: surface.target,
    projection_ref: surface.projectionRef,
    projection_revision: surface.projectionRevision,
    contract_ir_ref: surface.contractRef,
      contract_ir_revision: surface.contractRevision,
      matrix_ref: matrix['document_ref'],
      matrix_revision: matrix['document_revision'],
    status: statuses[index],
    evidence: evidence(surface, statuses[index] as LanguageStatus, outcomes[index] as readonly CommandResult[]),
  }));
  payload['behavioral_status'] = aggregateBehavioralStatus(scenarioStatus(scenarios), statuses);
  const checks = records(payload['checks']);
  const languageCheck = checks.find((check) => check['check_key'] === 'language-operation-surface-conformance');
  if (!languageCheck) throw new Error('qualification receipt has no language-operation-surface-conformance check');
  languageCheck['status'] = languageSurfaceStatus(statuses);
  languageCheck['evidence'] = `TypeScript ${typescriptSurface.bindings.length} operations/${typescriptSurface.methodBindings.length} methods at projection revision ${typescriptSurface.projectionRevision}; Python ${pythonSurface.bindings.length} operations/${pythonSurface.methodBindings.length} methods at projection revision ${pythonSurface.projectionRevision}; Contract IR revision ${typescriptSurface.contractRevision}; commands and outcomes: ${outcomes.flat().map((outcome) => `${outcome.label} [${outcome.passed ? 'PASS' : 'FAIL'}]`).join('; ')}`;
  const matrixCheck = checks.find((check) => check['check_key'] === 'cross-language-conformance-matrix');
  if (!matrixCheck) throw new Error('qualification receipt has no cross-language-conformance-matrix check');
  matrixCheck['status'] = languageSurfaceStatus(statuses);
  matrixCheck['evidence'] = `${matrixCells.filter((cell) => cell['status'] === 'PASS').length}/88 packed-artifact runtime matrix cells PASS at matrix revision ${String(matrix['document_revision'])}; operation-specific per-cell type evidence NOT_ASSESSED`;
  const updateCheck = (key: string, status: LanguageStatus, detail: string): void => {
    const check = checks.find((item) => item['check_key'] === key);
    if (!check) throw new Error(`qualification receipt has no ${key} check`);
    check['status'] = status;
    check['evidence'] = detail;
  };
  const pythonStatus = statuses[1] as LanguageStatus;
  updateCheck('python-runtime-and-laws', pythonStatus, `${pythonStatus}: pytest verified module/method equivalence, branch behavior, callback counts, laws, wrapper and payload identity, exception identity, transpose, immutability, and exact exports for Python projection revision ${pythonSurface.projectionRevision}`);
  updateCheck('python-strict-typing', pythonStatus, `${pythonStatus}: strict mypy accepted the package and positive fixtures and rejected every negative fixture for both module and method surfaces`);
  updateCheck('python-wheel-consumer', pythonStatus, `${pythonStatus}: isolated wheel build/install verified ${pythonSurface.bindings.length} module surfaces, ${pythonSurface.methodBindings.length} Result methods, exact root exports, zero runtime dependencies, and py.typed`);
  const runId = uuidV7();
  payload['validation_run_id'] = runId;
  payload['validation_run_ref'] = `urn:uuid:${runId}`;
  const updatedAt = new Date().toISOString();
  qualification['document_revision'] = Number(qualification['document_revision']) + 1;
  qualification['updated_at'] = updatedAt;
  qualification['summary'] = `Fast language qualification recorded TypeScript ${statuses[0]} and Python ${statuses[1]} with the 88-cell runtime matrix and package-level type checks; operation-specific per-cell type evidence is not assessed; the ${scenarioCount} canonical TypeScript scenarios remain separate evidence; security and long-running classes remain deferred.`;
  await writeFile(qualificationPath, `${JSON.stringify(qualification, null, 2)}\n`, 'utf8');
  return statuses;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const statuses = await qualifyLanguages();
  console.log(`Language qualification: TypeScript ${statuses[0]}, Python ${statuses[1]}.`);
  if (statuses.some((status) => status !== 'PASS')) process.exitCode = 1;
}
