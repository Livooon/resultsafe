import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

type Target = 'typescript' | 'python';
type Surface = 'MODULE' | 'INSTANCE_METHOD';
type Json = Record<string, unknown>;

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const staging = resolve(root, 'platform/staging/resultsafe-core-v001');
const matrixPath = resolve(staging, 'CONFORMANCE-MATRIX.json');
const adapters = resolve(root, 'tools/contract-registry/src/adapters');

const records = (value: unknown): Json[] => Array.isArray(value) ? value.filter((item): item is Json => typeof item === 'object' && item !== null) : [];
const sha256 = async (path: string): Promise<string> => createHash('sha256').update(await readFile(path)).digest('hex');
const run = (command: string, args: readonly string[], cwd = root, env: NodeJS.ProcessEnv = process.env): Promise<{ stdout: string; stderr: string }> =>
  new Promise((done, reject) => {
    console.log(`+ ${command} ${args.join(' ')}`);
    const child = spawn(command, args, { cwd, env: { ...env, NO_COLOR: '1' }, shell: process.platform === 'win32' && command.endsWith('.cmd'), windowsHide: true });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => { stdout += chunk; });
    child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => code === 0 ? done({ stdout, stderr }) : reject(new Error(`${command} failed (${String(code)}): ${(stderr || stdout).trim()}`)));
  });

const typeScriptDiagnostics = (packageRoot: string, workspace: string): Json[] => {
  const positive = resolve(workspace, 'positive.mts');
  const negative = resolve(workspace, 'negative.mts');
  const packageImport = resolve(packageRoot, 'types/index.js').replaceAll('\\', '/');
  const sources = new Map<string, string>([
    [positive, `import { Ok, map } from ${JSON.stringify(packageImport)}; const value: number = map(Ok(1), n => n + 1).unwrap(); void value;\n`],
    [negative, `import { Ok } from ${JSON.stringify(packageImport)}; Ok(1).__matrix_missing__();\n`],
  ]);
  const host = ts.createCompilerHost({});
  for (const [path, source] of sources) host.writeFile(path, source, false);
  // createProgram reads from disk; callers materialize these two fixed fixtures first.
  const program = ts.createProgram([...sources.keys()], {
    strict: true, noEmit: true, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022, skipLibCheck: false,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  const normalizePath = (path: string): string => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  const positiveDiagnostics = diagnostics.filter((item) => item.file && normalizePath(item.file.fileName) === normalizePath(positive));
  const negativeDiagnostics = diagnostics.filter((item) => item.file && normalizePath(item.file.fileName) === normalizePath(negative));
  const expectedCode = 2339;
  const expectedMessage = "Property '__matrix_missing__' does not exist on type 'Ok<number>'.";
  if (positiveDiagnostics.length !== 0 || negativeDiagnostics.length !== 1 || negativeDiagnostics[0]?.code !== expectedCode || ts.flattenDiagnosticMessageText(negativeDiagnostics[0].messageText, '\n') !== expectedMessage) {
    throw new Error(`TypeScript exact diagnostics mismatch: ${diagnostics.map((item) => `${item.code}:${ts.flattenDiagnosticMessageText(item.messageText, ' ')}`).join('; ')}`);
  }
  return [
    { fixture: 'positive.mts', expectation: 'NO_DIAGNOSTICS', actual: [], status: 'PASS' },
    { fixture: 'negative.mts', expectation: { code: expectedCode, message: expectedMessage }, actual: { code: expectedCode, message: expectedMessage }, status: 'PASS' },
  ];
};

const main = async (): Promise<void> => {
  const readJson = async (name: string): Promise<Json> => JSON.parse(await readFile(resolve(staging, name), 'utf8')) as Json;
  const [contract, catalog, existing] = await Promise.all([
    readJson('CONTRACT-IR.json'), readJson('PROJECTION-CATALOG.json'), readJson('CONFORMANCE-MATRIX.json'),
  ]);
  const contractPayload = contract['payload'] as Json;
  const operations = contractPayload['operations'] as Record<string, Json>;
  const laws = records(contractPayload['laws']);
  const projections = new Map<Target, Json>();
  for (const item of records((catalog['payload'] as Json)['items'])) if (item['target_key'] === 'typescript' || item['target_key'] === 'python') projections.set(item['target_key'], item);

  const cells: Json[] = [];
  for (const target of ['typescript', 'python'] as const) {
    const projection = projections.get(target);
    if (!projection) throw new Error(`missing ${target} projection`);
    if (projection['contract_ir_ref'] !== contract['document_ref'] || projection['contract_ir_revision'] !== contract['document_revision']) throw new Error(`${target} projection revision drift`);
    const bindings = new Map(records(projection['operation_bindings']).map((binding) => [String(binding['operation_key']), binding]));
    const applicable = Object.entries(operations).filter(([, operation]) => operation['classification'] === 'NEUTRAL_PRIMITIVE' && (operation['projection_applicability'] as unknown[]).includes(target));
    if (applicable.length !== 23 || bindings.size < applicable.length) throw new Error(`${target} does not exactly bind 23 neutral operations`);
    for (const [operationKey, operation] of applicable) {
      const binding = bindings.get(operationKey);
      if (!binding) throw new Error(`${target} missing binding ${operationKey}`);
      const surfaces: Surface[] = ['MODULE'];
      const surfaceContract = operation['surface_contract'] as Json;
      if (surfaceContract['instance_method'] !== 'FORBIDDEN') surfaces.push('INSTANCE_METHOD');
      const lawKeys = laws.filter((law) => (law['applies_to'] as unknown[]).includes(operationKey)).map((law) => String(law['law_key']));
      const clauseKeys = [
        ...records(operation['branches']).map((_, index) => `branch:${index}`),
        ...records(operation['callbacks']).map((callback) => `callback:${String(callback['callback_key'])}`),
        ...records(operation['exception_outcomes']).map((exception) => `exception:${String(exception['source']).toLowerCase()}:${String(exception['outcome']).toLowerCase()}`),
        `identity:${String(operation['result_identity']).toLowerCase()}`,
        ...lawKeys.map((key) => `law:${key}`), 'types:positive', 'types:negative',
      ];
      for (const surface of surfaces) {
        if (surface === 'INSTANCE_METHOD' && typeof binding['method_name'] !== 'string') throw new Error(`${target} ${operationKey} method binding missing`);
        const expected = {
          branch_outcomes: 'PASS', callback_contract: 'PASS', exception_contract: 'PASS', wrapper_payload_identity: 'PASS',
          laws: lawKeys.map((law_key) => ({ law_key, status: 'PASS' })),
          positive_types: 'NOT_ASSESSED_OPERATION_SPECIFIC', negative_types: 'NOT_ASSESSED_OPERATION_SPECIFIC',
        };
        cells.push({
          cell_key: `${target}:${operationKey}:${surface.toLowerCase()}`, target_language: target, surface, operation_key: operationKey,
          binding, contract_ir_revision: contract['document_revision'], projection_revision: projection['record_revision'], clause_keys: clauseKeys,
          law_keys: lawKeys, expected_outcome: expected,
          clauses: {
            branches: operation['branches'], callbacks: operation['callbacks'], exception_outcomes: operation['exception_outcomes'],
            result_identity: operation['result_identity'], laws: laws.filter((law) => lawKeys.includes(String(law['law_key']))),
          },
        });
      }
    }
  }
  if (cells.length !== 88 || new Set(cells.map((cell) => cell['cell_key'])).size !== 88) throw new Error(`expected 88 unique matrix cells, found ${cells.length}`);

  const workspace = await mkdtemp(resolve(tmpdir(), 'resultsafe-matrix-'));
  try {
    const npmDir = resolve(workspace, 'npm');
    const wheelDir = resolve(workspace, 'wheel');
    await Promise.all([mkdir(npmDir), mkdir(wheelDir)]);
    const suppliedTarball = process.env['RESULTSAFE_QUALIFIED_TARBALL'];
    const reproducibleEnv = { ...process.env, SOURCE_DATE_EPOCH: String(Math.floor(Date.parse(String(existing['created_at'])) / 1000)) };
    if (!suppliedTarball) await run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['pack', resolve(root, 'packages/core/fp/result/dist'), '--pack-destination', npmDir], root, reproducibleEnv);
    const tarball = suppliedTarball ? resolve(suppliedTarball) : resolve(npmDir, (await readdir(npmDir)).find((name) => name.endsWith('.tgz')) ?? '');
    await writeFile(resolve(workspace, 'package.json'), '{"private":true,"type":"module"}\n', 'utf8');
    await run(process.platform === 'win32' ? 'pnpm.exe' : 'pnpm', ['add', '--ignore-scripts', tarball], workspace);
    await run(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'build', '--wheel', '--outdir', wheelDir], root, reproducibleEnv);
    const wheel = resolve(wheelDir, (await readdir(wheelDir)).find((name) => name.endsWith('.whl')) ?? '');
    const pythonTarget = resolve(workspace, 'python-target');
    await run(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'pip', 'install', '--no-deps', '--target', pythonTarget, wheel]);
    const installedNpm = resolve(workspace, 'node_modules/@resultsafe/core-fp-result');

    const positivePath = resolve(workspace, 'positive.mts');
    const negativePath = resolve(workspace, 'negative.mts');
    const packageImport = resolve(installedNpm, 'types/index.js').replaceAll('\\', '/');
    await Promise.all([
      writeFile(positivePath, `import { Ok, map } from ${JSON.stringify(packageImport)}; const value: number = map(Ok(1), n => n + 1).unwrap(); void value;\n`, 'utf8'),
      writeFile(negativePath, `import { Ok } from ${JSON.stringify(packageImport)}; Ok(1).__matrix_missing__();\n`, 'utf8'),
    ]);
    const tsTypes = typeScriptDiagnostics(installedNpm, workspace);

    const pyPositive = resolve(workspace, 'positive.py');
    const pyNegative = resolve(workspace, 'negative.py');
    await Promise.all([
      writeFile(pyPositive, 'from resultsafe import Ok\nvalue: int = Ok(1).unwrap()\n', 'utf8'),
      writeFile(pyNegative, 'from resultsafe import Ok\nOk(1).missing()\n', 'utf8'),
    ]);
    await run(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'mypy', '--strict', '--no-pretty', '--show-column-numbers', pyPositive], workspace, { ...process.env, MYPYPATH: pythonTarget });
    const negativeMypy = await new Promise<{ stdout: string; stderr: string; code: number | null }>((done, reject) => {
      const child = spawn(process.platform === 'win32' ? 'python.exe' : 'python3', ['-m', 'mypy', '--strict', '--no-pretty', '--show-column-numbers', pyNegative], { cwd: workspace, env: { ...process.env, MYPYPATH: pythonTarget, NO_COLOR: '1' }, shell: false });
      let stdout = ''; let stderr = ''; child.stdout.on('data', (chunk: Buffer) => { stdout += chunk; }); child.stderr.on('data', (chunk: Buffer) => { stderr += chunk; });
      child.once('error', reject); child.once('close', (code) => done({ stdout, stderr, code }));
    });
    const expectedMypy = 'negative.py:2:1: error: "Ok[int]" has no attribute "missing"  [attr-defined]';
    const actualMypy = negativeMypy.stdout.replaceAll('\\', '/').split(/\r?\n/).find((line) => line.includes(': error:'))?.replace(/^.*\/negative\.py/, 'negative.py');
    if (negativeMypy.code === 0 || actualMypy !== expectedMypy) throw new Error(`mypy exact diagnostic mismatch: ${negativeMypy.stdout || negativeMypy.stderr}`);

    const byTarget = new Map<Target, Json[]>([['typescript', []], ['python', []]]);
    for (const cell of cells) byTarget.get(cell['target_language'] as Target)?.push(cell);
    const tsCellsPath = resolve(workspace, 'typescript-cells.json');
    const pyCellsPath = resolve(workspace, 'python-cells.json');
    await Promise.all([
      writeFile(tsCellsPath, JSON.stringify(byTarget.get('typescript')), 'utf8'),
      writeFile(pyCellsPath, JSON.stringify(byTarget.get('python')), 'utf8'),
    ]);
    const tsRun = await run(process.execPath, [resolve(adapters, 'typescript.mjs'), installedNpm, tsCellsPath], workspace);
    const pyRun = await run(process.platform === 'win32' ? 'python.exe' : 'python3', [resolve(adapters, 'python.py'), pythonTarget, pyCellsPath], workspace);
    const actuals = new Map([...JSON.parse(tsRun.stdout.trim()) as Json[], ...JSON.parse(pyRun.stdout.trim()) as Json[]].map((item) => [String(item['cell_key']), item['outcome']]));
    const artifacts = [
      { target_language: 'typescript', artifact_subject: `npm:${basename(tarball)}`, artifact_digest: `sha256:${await sha256(tarball)}` },
      { target_language: 'python', artifact_subject: `wheel:${basename(wheel)}`, artifact_digest: `sha256:${await sha256(wheel)}` },
    ];
    for (const cell of cells) {
      const actual = actuals.get(String(cell['cell_key']));
      if (!actual || JSON.stringify(actual) !== JSON.stringify(cell['expected_outcome'])) throw new Error(`${String(cell['cell_key'])}: normalized outcome mismatch`);
      const artifact = artifacts.find((item) => item.target_language === cell['target_language']) as Json;
      Object.assign(cell, artifact, { actual_outcome: actual, status: 'PASS' });
    }
    const payload = {
      matrix_version: '1.0.0', generation_rule: 'EXACT_NEUTRAL_IR_OPERATION_X_REQUIRED_LANGUAGE_SURFACE',
      contract_ir_ref: contract['document_ref'], contract_ir_revision: contract['document_revision'], ir_version: contractPayload['ir_version'],
      projection_catalog_ref: catalog['document_ref'], projection_catalog_revision: catalog['document_revision'], vector_revision: 1,
      status: 'PASS', counts: { operations: 23, language_operation_pairs: 46, cells: 88, passed: 88, failed: 0 }, artifacts,
      type_diagnostics: {
        scope: 'PACKAGE_LEVEL_SMOKE_ONLY_NOT_PER_CELL',
        typescript: tsTypes,
        python: [
          { fixture: 'positive.py', expectation: 'NO_DIAGNOSTICS', actual: [], status: 'PASS' },
          { fixture: 'negative.py', expectation: expectedMypy, actual: actualMypy, status: 'PASS' },
        ],
      },
      cells,
    };
    const document = { ...existing, summary: 'Complete packed-artifact runtime conformance evidence for all 88 neutral TypeScript and Python operation-surface cells; operation-specific type evidence is not assessed.', payload };
    await writeFile(matrixPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
    console.log('Cross-language runtime matrix PASS: 23 operations, 46 language-operation pairs, 88/88 required surface cells; operation-specific type evidence NOT_ASSESSED.');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
};

export const compareMatrixCell = (expected: unknown, actual: unknown): boolean => JSON.stringify(expected) === JSON.stringify(actual);

export const matrixCellFailures = (cell: Json, actualBinding: Json, actualOutcome: Json): string[] => {
  const failures: string[] = [];
  if (JSON.stringify(cell['binding']) !== JSON.stringify(actualBinding)) failures.push('binding');
  const expected = cell['expected_outcome'] as Json;
  if (expected['branch_outcomes'] !== actualOutcome['branch_outcomes']) failures.push('branches');
  if (expected['callback_contract'] !== actualOutcome['callback_contract']) failures.push('callbacks');
  if (expected['exception_contract'] !== actualOutcome['exception_contract']) failures.push('exceptions');
  if (expected['wrapper_payload_identity'] !== actualOutcome['wrapper_payload_identity']) failures.push('identity');
  if (JSON.stringify(expected['laws']) !== JSON.stringify(actualOutcome['laws'])) failures.push('laws');
  if (expected['positive_types'] !== actualOutcome['positive_types'] || expected['negative_types'] !== actualOutcome['negative_types']) failures.push('types');
  return failures;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
