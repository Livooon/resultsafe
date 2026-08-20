import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { canonicalize } from 'json-canonicalize';

interface FileDigest {
  readonly path: string;
  readonly sha256_digest: string;
  readonly size: number;
}

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

const walkJson = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return walkJson(path);
      return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
    }),
  );
  return paths.flat().sort();
};

const calculate = async (root: string): Promise<{ files: FileDigest[]; treeDigest: string }> => {
  const manifestPath = resolve(root, 'INTEGRITY-MANIFEST.json');
  const receiptPath = resolve(root, 'QUALIFICATION-RECEIPT.json');
  const paths = (await walkJson(root)).filter((path) => ![manifestPath, receiptPath].includes(resolve(path)));
  const files = await Promise.all(
    paths.map(async (path): Promise<FileDigest> => {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as unknown;
      const canonical = canonicalize(parsed);
      return {
        path: relative(root, path).split(sep).join('/'),
        sha256_digest: sha256(canonical),
        size: Buffer.byteLength(canonical, 'utf8'),
      };
    }),
  );
  const logicalTree = files
    .map((file) => `${file.path}\0${file.sha256_digest}\0${file.size}`)
    .join('\n');
  return { files, treeDigest: sha256(logicalTree) };
};

const defaultRoot = fileURLToPath(
  new URL('../../../platform/staging/resultsafe-core-v001/', import.meta.url),
);

export const writeIntegrityManifest = async (rootInput?: string): Promise<void> => {
  const root = resolve(rootInput ?? defaultRoot);
  const { files, treeDigest } = await calculate(root);
  const document = {
    document_id: '01a01af6-3bc1-7677-83fa-bbe04fe99a37',
    document_ref: 'urn:uuid:01a01af6-3bc1-7677-83fa-bbe04fe99a37',
    document_key: 'integrity-manifest',
    document_type: 'integrity_manifest',
    document_revision: 0,
    schema_ref: 'urn:uuid:01a01af6-980c-7504-bfd0-235440c33890',
    title: 'ResultSafe staging integrity manifest',
    summary:
      'RFC 8785 canonicalized SHA-256 inventory and deterministic logical tree digest for stable staging inputs, excluding the manifest and governed receipt outputs.',
    lifecycle: 'DRAFT',
    created_at: '2026-08-19T00:00:00Z',
    updated_at: '2026-08-19T00:00:00Z',
    payload: {
      digest_algorithm: 'SHA-256',
      canonicalization: 'RFC-8785-JCS',
      scope: 'Every JSON file below the staging root except INTEGRITY-MANIFEST.json and QUALIFICATION-RECEIPT.json',
      files,
      tree_digest: treeDigest,
    },
  };
  await writeFile(
    resolve(root, 'INTEGRITY-MANIFEST.json'),
    `${JSON.stringify(document, null, 2)}\n`,
    'utf8',
  );
};

export const checkIntegrityManifest = async (rootInput?: string): Promise<void> => {
  const root = resolve(rootInput ?? defaultRoot);
  const current = JSON.parse(
    await readFile(resolve(root, 'INTEGRITY-MANIFEST.json'), 'utf8'),
  ) as { payload: { files: FileDigest[]; tree_digest: string } };
  const expected = await calculate(root);
  if (canonicalize(current.payload.files) !== canonicalize(expected.files)) {
    throw new Error('Integrity manifest file inventory or digest differs from the staging corpus.');
  }
  if (current.payload.tree_digest !== expected.treeDigest) {
    throw new Error('Integrity manifest tree digest differs from the staging corpus.');
  }
  console.log(`Verified ${expected.files.length} canonical file digests and tree ${expected.treeDigest}.`);
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const root = args.find((argument) => argument !== '--check' && argument !== '--');
  if (check) await checkIntegrityManifest(root);
  else {
    await writeIntegrityManifest(root);
    console.log('Wrote canonical integrity manifest.');
  }
}
