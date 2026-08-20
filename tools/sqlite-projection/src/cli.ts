import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileAndPublish, qualifyProjection } from './compiler.js';

const defaultCorpus = fileURLToPath(new URL('../../../platform/staging/resultsafe-core-v001/', import.meta.url));
const args = process.argv.slice(2);
const publishIndex = args.indexOf('--publish');
const corpusIndex = args.indexOf('--corpus');
const profileIndexes = args.flatMap((argument, index) => argument === '--profile' ? [index] : []);
const profiles = profileIndexes.map((index) => {
  const value = args[index + 1];
  if (!value) throw new Error('--profile requires a profile key.');
  return value;
});
const options = { profiles };
const corpusArgument = corpusIndex >= 0 ? args[corpusIndex + 1] : undefined;
const corpus = resolve(corpusArgument ?? defaultCorpus);

if (publishIndex >= 0) {
  const target = args[publishIndex + 1];
  if (!target) throw new Error('--publish requires a target path. No database is published by default.');
  const publishTarget: string = target;
  const result = await compileAndPublish(corpus, publishTarget, options);
  console.log(`Published qualified SQLite projection to ${resolve(publishTarget)} (${result.tables} tables, dump ${result.dumpSha256}).`);
} else {
  const temporary = await mkdtemp(resolve(tmpdir(), 'resultsafe-sqlite-'));
  try {
    const result = await qualifyProjection(corpus, temporary, options);
    console.log(`Qualified temporary SQLite projection: ${JSON.stringify(result)}. No database was published.`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
