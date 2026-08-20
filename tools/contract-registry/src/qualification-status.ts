export type BehavioralStatus = 'NOT_EXECUTED' | 'PASS' | 'FAIL' | 'PARTIAL';
export type LanguageStatus = 'NOT_EXECUTED' | 'PASS' | 'FAIL';

export const aggregateBehavioralStatus = (
  scenarioStatus: BehavioralStatus,
  languageStatuses: readonly LanguageStatus[],
): BehavioralStatus => {
  if (scenarioStatus === 'FAIL' || languageStatuses.includes('FAIL')) return 'FAIL';
  if (scenarioStatus === 'PASS' && languageStatuses.length === 2 && languageStatuses.every((status) => status === 'PASS')) return 'PASS';
  if (scenarioStatus === 'NOT_EXECUTED' && languageStatuses.every((status) => status === 'NOT_EXECUTED')) return 'NOT_EXECUTED';
  return 'PARTIAL';
};

export const languageSurfaceStatus = (statuses: readonly LanguageStatus[]): LanguageStatus =>
  statuses.includes('FAIL') ? 'FAIL' : statuses.length === 2 && statuses.every((status) => status === 'PASS') ? 'PASS' : 'NOT_EXECUTED';
