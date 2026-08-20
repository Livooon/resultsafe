import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const cjsDir = resolve(__dirname, '../../dist/cjs');
const cjsPackageJsonPath = resolve(cjsDir, 'package.json');

await mkdir(cjsDir, { recursive: true });
await writeFile(
  cjsPackageJsonPath,
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
  'utf8',
);
