import { assertReleaseAllowed } from './release-tools.mjs';

try {
  const packageName = process.argv[2];
  const version = process.argv[3];
  if (!packageName || !version || process.argv.length !== 4) throw new Error('Usage: check-allowlist.mjs <package-name> <version>');
  const pendingVersion = await assertReleaseAllowed(packageName, version);
  console.log(`Release allowlist passed for ${packageName}; pending version is ${pendingVersion}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
