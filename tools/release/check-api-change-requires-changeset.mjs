import { requireChangesetsForApiChanges } from './release-tools.mjs';

const index = process.argv.indexOf('--base');
if (!([2, 4].includes(process.argv.length)) || (process.argv.length === 4 && (index !== 2 || !process.argv[3]))) {
  console.error('Usage: check-api-change-requires-changeset.mjs [--base <git-ref>]');
  process.exit(1);
}
try {
  const result = await requireChangesetsForApiChanges(undefined, index < 0 ? undefined : process.argv[index + 1]);
  console.log(`API changeset policy passed against ${result.baseCommit} (${result.paths.length} changed path(s)).`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
