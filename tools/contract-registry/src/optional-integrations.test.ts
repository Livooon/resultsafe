import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCorpus } from './load.js';
import {
  coreQualificationConsistencyErrors,
  effectIntegrationConsistencyErrors,
  isTraceEndpointAllowed,
  optionalQualificationConsistencyErrors,
  remediationQualificationConsistencyErrors,
  sourceHygienePolicyErrors,
} from './validate.js';

const documentByKey = async (key: string) => {
  const corpus = await loadCorpus();
  const document = [...corpus.documents.values()].find((item) => item.document_key === key);
  assert.ok(document);
  return { corpus, document };
};

test('materializes optional integrations and their nested evidence', async () => {
  const { corpus } = await documentByKey('optional-integrations');
  assert.equal(corpus.entities.get('01a01f50-0061-7000-8000-000000000061')?.type, 'integration');
  assert.equal(corpus.entities.get('01a01f50-0074-7000-8000-000000000074')?.type, 'evidence');
});

test('accepts locally qualified Effect authority with canonical atomic evidence', async () => {
  const { document: effect } = await documentByKey('effect-compatibility');
  const { document: integrations } = await documentByKey('optional-integrations');
  const { document: qualification } = await documentByKey('qualification-receipt');
  assert.deepEqual(effectIntegrationConsistencyErrors(effect.payload, integrations.payload, qualification.payload), []);
});

test('accepts core, optional, and remediation local qualification bindings', async () => {
  const { document: core } = await documentByKey('core-modularity-policy');
  const { document: integrations } = await documentByKey('optional-integrations');
  const { document: remediation } = await documentByKey('remediation-plan');
  const { document: qualification } = await documentByKey('qualification-receipt');
  assert.deepEqual(coreQualificationConsistencyErrors(core.payload, qualification.payload), []);
  assert.deepEqual(optionalQualificationConsistencyErrors(integrations.payload, qualification.payload), []);
  assert.deepEqual(remediationQualificationConsistencyErrors(remediation.payload, qualification.payload), []);
});

test('admits optional integration evidence and document-to-adapter projection trace endpoints', () => {
  assert.equal(isTraceEndpointAllowed('EVIDENCES', 'evidence', 'package_family'), true);
  assert.equal(isTraceEndpointAllowed('EVIDENCES', 'evidence', 'projection'), true);
  assert.equal(isTraceEndpointAllowed('EVIDENCES', 'evidence', 'document'), true);
  assert.equal(isTraceEndpointAllowed('IMPLEMENTED_BY', 'document', 'projection'), true);
  assert.equal(isTraceEndpointAllowed('IMPLEMENTED_BY', 'document', 'package_family'), false);
});

test('fails closed on Effect authority, dependency, and atomic evidence drift', async () => {
  const { document: effect } = await documentByKey('effect-compatibility');
  const { document: integrations } = await documentByKey('optional-integrations');
  const { document: qualification } = await documentByKey('qualification-receipt');
  const changedEffect = structuredClone(effect.payload);
  (changedEffect['mapping_authority'] as Record<string, unknown>)['effect_supported_version'] = '3.22.2';
  changedEffect['scenario_refs'] = ['urn:uuid:01a01b34-6760-79e3-a443-737c82580377'];
  const changedIntegrations = structuredClone(integrations.payload);
  changedIntegrations['integration_dependency_from_core'] = 'NONZERO';
  const effectPackage = objects(changedIntegrations['packages'])[1]!;
  effectPackage['qualification_gate'] = 'PASS';
  (effectPackage['atomic_evidence'] as Record<string, unknown>)['evidence_artifact_sha256'] = '0'.repeat(64);

  const errors = effectIntegrationConsistencyErrors(changedEffect, changedIntegrations, qualification.payload);
  assert.ok(errors.some((error) => error.includes('Effect 3.22.1')));
  assert.ok(errors.some((error) => error.includes('zero integration dependency')));
  assert.ok(errors.some((error) => error.includes('core-only scenarios')));
  assert.ok(errors.some((error) => error.includes('canonical local-qualified atomic status')));
  assert.ok(errors.some((error) => error.includes('artifact path or digest')));
});

test('fails closed on parent, child kind, child status, evidence path, and promotion blocker mutations', async () => {
  const { document: core } = await documentByKey('core-modularity-policy');
  const { document: qualification } = await documentByKey('qualification-receipt');
  const fields: [string, unknown][] = [
    ['parent_run_id', '01a01dbf-c7c7-7000-8000-000000000099'],
    ['child_kind', 'effect-adapter'],
    ['child_status', 'FAIL'],
    ['evidence_artifact_path', '.resultsafe-candidates/mutated/CORE-MODULARITY-EVIDENCE.json'],
    ['promotion_blocker', 'NONE'],
  ];
  for (const [field, value] of fields) {
    const changed = structuredClone(core.payload);
    (objects(changed['invariants'])[0]?.['atomic_evidence'] as Record<string, unknown>)[field] = value;
    assert.notDeepEqual(coreQualificationConsistencyErrors(changed, qualification.payload), [], field);
  }
});

test('fails closed on source hygiene gate, generated pattern, and governed root mutations', async () => {
  const { document: core } = await documentByKey('core-modularity-policy');
  const policy = core.payload['source_hygiene'] as Record<string, unknown>;
  const mutations: [string, (value: Record<string, unknown>) => void][] = [
    ['gate', (value) => { value['qualification_gate'] = 'structural'; }],
    ['pattern', (value) => { value['forbidden_colocated_generated_suffixes'] = ['.js', '.d.ts']; }],
    ['root', (value) => { value['governed_roots'] = ['packages/core/fp/result']; }],
  ];
  for (const [name, mutate] of mutations) {
    const changed = structuredClone(policy); mutate(changed);
    assert.notDeepEqual(sourceHygienePolicyErrors(changed), [], name);
  }
});

const objects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
