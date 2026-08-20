import { createChangeset } from './release-tools.mjs';

const args = process.argv.slice(2);
const allowed = new Set(['--package', '--bump', '--summary', '--id']);
if (args.length % 2 !== 0 || args.some((argument, index) => index % 2 === 0 ? !allowed.has(argument) : argument.startsWith('--')) || new Set(args.filter((_, index) => index % 2 === 0)).size !== args.length / 2) {
  console.error('Usage: create-changeset.mjs --package <name> [--bump minor] --summary <text> [--id slug]');
  process.exit(1);
}
const value = (name) => { const index = args.indexOf(name); return index < 0 ? undefined : args[index + 1]; };
try {
  const path = await createChangeset({ packageName: value('--package'), bump: value('--bump'), summary: value('--summary'), id: value('--id') });
  console.log(`Created ${path}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
