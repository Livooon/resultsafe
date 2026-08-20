import { validatePendingChangesets } from './release-tools.mjs';

try {
  const { policy, releases } = await validatePendingChangesets();
  console.log(`Validated ${releases.size} governed ${policy.transitionState === 'APPLIED_LOCAL' ? 'applied local transition package(s)' : 'pending release(s)'}.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
