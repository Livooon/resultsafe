import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const args = process.argv.slice(2);
if (!args.includes('--tarball') || !args.includes('--wheel')) {
  throw new Error('Validated generation requires exact artifacts: --tarball <tgz> --wheel <whl> [--output <json> | --write-canonical].');
}
const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const child = spawn(executable, ['--dir', 'tools/contract-registry', 'exec', 'tsx', 'src/cause-exit-qualification.ts', ...args], { cwd: root, stdio: 'inherit', windowsHide: true, shell: process.platform === 'win32' });
child.once('error', (error) => { throw error; });
child.once('close', (code) => { if (code !== 0) process.exitCode = code ?? 1; });
