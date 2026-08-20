import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import ts from 'typescript';
import { idFromRef, loadCorpus, trustedDocumentBindings } from './load.js';
import type { CanonicalDocument, Corpus, EntityType } from './model.js';
import { aggregateBehavioralStatus, languageSurfaceStatus, type BehavioralStatus, type LanguageStatus } from './qualification-status.js';

interface Link {
  readonly source_ref: string;
  readonly relation: string;
  readonly target_ref: string;
}

const fail = (messages: readonly string[]): never => {
  throw new Error(`Contract registry validation failed:\n${messages.map((message) => `- ${message}`).join('\n')}`);
};

const objects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const documentByKey = (corpus: Corpus, key: string): CanonicalDocument | undefined =>
  [...corpus.documents.values()].find((document) => document.document_key === key);

const validateSchemas = (corpus: Corpus, errors: string[], replacingQualificationReceipt = false): void => {
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: true });
  addFormats(ajv);
  for (const schema of corpus.schemas) ajv.addSchema(schema.value);
  for (const document of corpus.documents.values()) {
    if (replacingQualificationReceipt && document.document_key === 'qualification-receipt') continue;
    const documentKey = document.document_key;
    const { source_path: _sourcePath, ...documentData } = document;
    const trustedSchema = trustedDocumentBindings[document.source_path]?.schema;
    let validate;
    try {
      validate = trustedSchema ? ajv.getSchema(trustedSchema) : undefined;
    } catch (error) {
      errors.push(`${documentKey}: trusted schema does not compile: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    if (!validate) {
      errors.push(`${document.source_path}: trusted schema ${String(trustedSchema)} is unavailable`);
    } else if (!validate(documentData)) {
      errors.push(`${documentKey}: ${ajv.errorsText(validate.errors, { separator: '; ' })}`);
    }
  }
};

const validateIdentity = (corpus: Corpus, errors: string[]): void => {
  for (const entity of corpus.entities.values()) {
    if (entity.ref !== `urn:uuid:${entity.id}`) errors.push(`${entity.key}: ${entity.type} ref does not match its ID`);
  }
};

const expectedReferenceTypes: Readonly<Record<string, readonly EntityType[] | 'schema'>> = {
  document_ref: ['document'],
  record_ref: ['requirement', 'decision', 'finding', 'risk', 'contract', 'projection', 'package_family', 'standard', 'migration'],
  integration_ref: ['integration'],
  optional_integration_ref: ['integration'],
  scenario_ref: ['scenario'],
  subject_ref: ['contract', 'document'],
  contract_ir_ref: ['document'],
  matrix_ref: ['document'],
  projection_ref: ['projection'],
  requirement_refs: ['requirement'],
  decision_refs: ['decision'],
  finding_refs: ['finding'],
  evidence_refs: ['evidence'],
  scenario_refs: ['scenario'],
  remediation_task_ref: ['task'],
  contract_refs: ['contract'],
  depends_on_family_refs: ['package_family'],
  work_ref: ['work'],
  evidence_ref: ['evidence'],
  validation_run_ref: ['validation_run'],
  schema_ref: 'schema',
  instance_schema_ref: 'schema',
};

const validateReferences = (corpus: Corpus, errors: string[]): void => {
  const schemas = new Set(corpus.schemas.map((schema) => schema.ref));
  const check = (key: string, ref: string, location: string): void => {
    if (!ref.startsWith('urn:uuid:')) return;
    const expected = expectedReferenceTypes[key];
    if (expected === 'schema') {
      if (!schemas.has(ref)) errors.push(`${location}: unresolved schema reference ${ref}`);
      return;
    }
    const id = idFromRef(ref);
    const target = id ? corpus.entities.get(id) : undefined;
    if (!target) {
      errors.push(`${location}: unresolved materialized entity reference ${ref}`);
    } else if (expected && !expected.includes(target.type)) {
      errors.push(`${location}: ${key} targets ${target.type}, expected ${expected.join(' or ')}`);
    }
  };
  const visit = (value: unknown, location: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${location}[${index}]`));
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      if (key !== 'source_ref' && key !== 'target_ref') {
        if (key.endsWith('_ref') && typeof child === 'string') check(key, child, location);
        if (key.endsWith('_refs')) for (const ref of strings(child)) check(key, ref, location);
      }
      visit(child, `${location}.${key}`);
    }
  };
  for (const document of corpus.documents.values()) visit(document, document.source_path);

  for (const entity of corpus.entities.values()) {
    if (entity.type !== 'step') continue;
    for (const dependency of strings(entity.value['depends_on_step_ids'])) {
      const target = corpus.entities.get(dependency);
      if (!target) errors.push(`${entity.key}: unresolved step dependency ${dependency}`);
      else if (target.type !== 'step') errors.push(`${entity.key}: step dependency targets ${target.type}`);
    }
  }
};

const validateContracts = async (corpus: Corpus, errors: string[]): Promise<void> => {
  const repositoryRoot = resolve(corpus.root, '../../..');
  const contracts = [...corpus.records.values()].filter((record) => record.kind === 'contract');
  if (contracts.length !== 49) errors.push(`expected 49 public contracts, found ${contracts.length}`);
  if (corpus.scenarios.size < contracts.length * 2) errors.push(`expected at least ${contracts.length * 2} scenarios, found ${corpus.scenarios.size}`);
  for (const contract of contracts) {
    if (!contract.scenario_refs || contract.scenario_refs.length < 2) {
      errors.push(`${contract.record_key}: fewer than two scenarios`);
      continue;
    }
    for (const ref of contract.scenario_refs) {
      const scenario = corpus.scenarios.get(idFromRef(ref) ?? '');
      if (!scenario) errors.push(`${contract.record_key}: missing scenario ${ref}`);
      else if (scenario.subject_ref !== contract.record_ref) errors.push(`${scenario.scenario_key}: subject_ref does not point back to contract`);
    }
    if (contract.typescript_source) {
      try {
        await access(resolve(repositoryRoot, contract.typescript_source));
      } catch {
        errors.push(`${contract.record_key}: TypeScript source does not exist: ${contract.typescript_source}`);
      }
    }
  }
};

const validateRegistryAndGraph = (corpus: Corpus, errors: string[]): void => {
  const registry = documentByKey(corpus, 'document-registry');
  const graph = documentByKey(corpus, 'document-graph');
  if (!registry || !graph) {
    errors.push('document registry or graph is absent');
    return;
  }

  const entries = objects(registry.payload['documents']);
  const registered = new Map<string, Record<string, unknown>>();
  for (const entry of entries) {
    const ref = String(entry['document_ref']);
    if (registered.has(ref)) errors.push(`duplicate document registry entry ${ref}`);
    registered.set(ref, entry);
  }
  for (const document of corpus.documents.values()) {
    const entry = registered.get(document.document_ref);
    if (!entry) {
      errors.push(`document missing from registry: ${document.document_ref}`);
      continue;
    }
    const expected: Record<string, unknown> = {
      document_id: document.document_id,
      document_ref: document.document_ref,
      document_key: document.document_key,
      document_type: document.document_type,
      path: document.source_path,
      schema_ref: document.schema_ref,
    };
    for (const [field, value] of Object.entries(expected)) {
      if (entry[field] !== value) errors.push(`${document.document_key}: registry ${field} differs from the document`);
    }
    const extra = Object.keys(entry).filter((field) => !(field in expected));
    if (extra.length > 0) errors.push(`${document.document_key}: registry has unexpected fields ${extra.join(', ')}`);
  }
  for (const ref of registered.keys()) {
    if (![...corpus.documents.values()].some((document) => document.document_ref === ref)) errors.push(`registry contains unknown document: ${ref}`);
  }

  const nodeList = strings(graph.payload['nodes']);
  const nodes = new Set(nodeList);
  if (nodes.size !== nodeList.length) errors.push('document graph contains duplicate nodes');
  const actual = new Set([...corpus.documents.values()].map((document) => document.document_ref));
  for (const ref of actual) if (!nodes.has(ref)) errors.push(`document missing from graph: ${ref}`);
  for (const ref of nodes) if (!actual.has(ref)) errors.push(`graph contains unknown document: ${ref}`);
  const edgeKeys = new Set<string>();
  for (const edge of objects(graph.payload['edges'])) {
    const source = String(edge['source_ref']);
    const target = String(edge['target_ref']);
    const key = `${source}\0${String(edge['relation'])}\0${target}`;
    if (edgeKeys.has(key)) errors.push(`duplicate document graph edge ${source} ${String(edge['relation'])} ${target}`);
    edgeKeys.add(key);
    if (!nodes.has(source)) errors.push(`graph edge source is not a graph node: ${source}`);
    if (!nodes.has(target)) errors.push(`graph edge target is not a graph node: ${target}`);
  }
};

const validateSchemaIndex = (corpus: Corpus, errors: string[]): void => {
  const index = documentByKey(corpus, 'schema-index');
  if (!index) {
    errors.push('schema index is absent');
    return;
  }
  const indexed = new Map<string, Record<string, unknown>>();
  for (const entry of objects(index.payload['schemas'])) {
    const ref = String(entry['schema_ref']);
    if (indexed.has(ref)) errors.push(`duplicate schema index entry ${ref}`);
    indexed.set(ref, entry);
  }
  for (const schema of corpus.schemas) {
    const entry = indexed.get(schema.ref);
    if (!entry) errors.push(`schema missing from schema index: ${schema.ref}`);
    else {
      if (entry['schema_key'] !== schema.key) errors.push(`${schema.ref}: schema index key differs from trusted filename binding`);
      if (entry['path'] !== schema.path) errors.push(`${schema.ref}: schema index path differs from actual path`);
      if (entry['schema_ref'] !== schema.ref) errors.push(`${schema.ref}: schema index ref differs from schema $id`);
    }
  }
  for (const ref of indexed.keys()) if (!corpus.schemas.some((schema) => schema.ref === ref)) errors.push(`schema index references missing schema: ${ref}`);
};

const validateRelationalProjection = (corpus: Corpus, errors: string[]): void => {
  const relational = documentByKey(corpus, 'relational-schema');
  const sqlite = documentByKey(corpus, 'sqlite-profile');
  if (!relational || !sqlite) {
    errors.push('relational schema or SQLite profile is absent');
    return;
  }
  if (/\b(sqlite|typescript|python)\b/i.test(JSON.stringify(relational.payload))) {
    errors.push('vendor-neutral relational payload names a database vendor or compiler language');
  }
  const relations = objects(relational.payload['relations']);
  const relationMap = new Map<string, Record<string, unknown>>();
  for (const relation of relations) {
    const name = String(relation['name']);
    if (relationMap.has(name)) errors.push(`duplicate logical relation ${name}`);
    relationMap.set(name, relation);
    const columns = objects(relation['columns']);
    const columnNames = columns.map((column) => String(column['name']));
    if (new Set(columnNames).size !== columnNames.length) errors.push(`${name}: duplicate column`);
    for (const primaryKeyColumn of strings(relation['primary_key'])) {
      if (!columnNames.includes(primaryKeyColumn)) errors.push(`${name}: primary key names missing column ${primaryKeyColumn}`);
    }
    if (relation['ownership'] === 'TENANT_OVERLAY' && name !== 'tenant' && strings(relation['primary_key'])[0] !== 'tenant_id') {
      errors.push(`${name}: tenant overlay primary key is not tenant-qualified`);
    }
  }
  for (const [name, relation] of relationMap) {
    const columnNames = new Set(objects(relation['columns']).map((column) => String(column['name'])));
    for (const foreignKey of objects(relation['foreign_keys'])) {
      const columns = strings(foreignKey['columns']);
      const targetColumns = strings(foreignKey['target_columns']);
      const target = relationMap.get(String(foreignKey['target_relation']));
      if (columns.length !== targetColumns.length) errors.push(`${name}: foreign key arity differs`);
      for (const column of columns) if (!columnNames.has(column)) errors.push(`${name}: foreign key names missing column ${column}`);
      if (!target) errors.push(`${name}: foreign key target relation is absent`);
      else {
        const available = new Set(objects(target['columns']).map((column) => String(column['name'])));
        for (const column of targetColumns) if (!available.has(column)) errors.push(`${name}: target names missing column ${column}`);
      }
    }
  }
  for (const covered of strings(relational.payload['coverage'])) if (!relationMap.has(covered)) errors.push(`coverage names missing relation ${covered}`);
  if (sqlite.payload['relational_schema_ref'] !== relational.document_ref) errors.push('SQLite profile does not reference the relational schema document');
  const ddlTables = strings(sqlite.payload['ddl'])
    .map((ddl) => /^CREATE TABLE ([a-z][a-z0-9_]*) /.exec(ddl)?.[1])
    .filter((name): name is string => Boolean(name));
  if (ddlTables.length !== relationMap.size || ddlTables.some((name) => !relationMap.has(name))) {
    errors.push('SQLite DDL tables do not exactly cover logical relations');
  }
  const relationalProfiles = new Map(objects(relational.payload['optional_profiles']).map((profile) => [String(profile['profile_key']), profile]));
  const sqliteProfiles = new Map(objects(sqlite.payload['optional_profiles']).map((profile) => [String(profile['profile_key']), profile]));
  if (relationalProfiles.size !== sqliteProfiles.size) errors.push('Relational and SQLite optional profile counts differ');
  for (const [profileKey, relationalProfile] of relationalProfiles) {
    const sqliteProfile = sqliteProfiles.get(profileKey);
    if (!sqliteProfile) { errors.push(`SQLite optional profile is absent: ${profileKey}`); continue; }
    if (relationalProfile['layout_version'] !== sqliteProfile['layout_version']) errors.push(`${profileKey}: optional profile layout versions differ`);
    const names = objects(relationalProfile['relations']).map((relation) => String(relation['name']));
    const physical = strings(sqliteProfile['ddl'])
      .map((ddl) => /^CREATE TABLE ([a-z][a-z0-9_]*) /.exec(ddl)?.[1])
      .filter((name): name is string => Boolean(name));
    if (new Set(names).size !== names.length || physical.length !== names.length || physical.some((name) => !names.includes(name))) {
      errors.push(`${profileKey}: optional SQLite DDL does not exactly cover logical profile relations`);
    }
    for (const relation of objects(relationalProfile['relations'])) {
      const columns = objects(relation['columns']).map((column) => String(column['name']));
      for (const key of strings(relation['primary_key'])) if (!columns.includes(key)) errors.push(`${profileKey}.${String(relation['name'])}: primary key names missing column ${key}`);
    }
  }
  for (const profileKey of sqliteProfiles.keys()) if (!relationalProfiles.has(profileKey)) errors.push(`SQLite optional profile has no logical authority: ${profileKey}`);
};

const validateFailureAudit = (corpus: Corpus, errors: string[]): void => {
  const audit = documentByKey(corpus, 'failure-audit');
  const model = documentByKey(corpus, 'failure-model');
  if (!audit || !model) { errors.push('Failure audit or model is absent'); return; }
  const sources = objects(audit.payload['sources']);
  if (sources.length < 15) errors.push(`Failure audit requires at least 15 sources; found ${sources.length}`);
  if (new Set(sources.map((source) => String(source['source_key']))).size !== sources.length) errors.push('Failure audit source keys are not unique');
  if (new Set(sources.map((source) => String(source['official_url']))).size !== sources.length) errors.push('Failure audit official URLs are not unique');
  const criteria = objects(audit.payload['criteria']);
  const weights = new Map(criteria.map((criterion) => [String(criterion['criterion_key']), Number(criterion['weight'])]));
  const weightTotal = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(weightTotal - 100) > 0.000_001) errors.push(`Failure audit criterion weights total ${weightTotal}, expected 100`);
  const options = objects(audit.payload['options']);
  for (const option of options) {
    const scores = option['scores'] as Record<string, unknown>;
    const scoreKeys = Object.keys(scores).sort();
    if (JSON.stringify(scoreKeys) !== JSON.stringify([...weights.keys()].sort())) errors.push(`${String(option['option_key'])}: score keys differ from criteria`);
    const calculated = [...weights].reduce((sum, [key, weight]) => sum + Number(scores[key]) * weight / 100, 0);
    if (Math.abs(Number(option['weighted_total']) - Number(calculated.toFixed(1))) > 0.000_001) {
      errors.push(`${String(option['option_key'])}: weighted total ${String(option['weighted_total'])} differs from calculated ${calculated.toFixed(1)}`);
    }
  }
  const selected = String((audit.payload['conclusion'] as Record<string, unknown>)['selected_option']);
  const winner = [...options].sort((left, right) => Number(right['weighted_total']) - Number(left['weighted_total']))[0];
  if (selected !== winner?.['option_key']) errors.push('Failure audit conclusion does not select the highest weighted option');
  const scenarioRefs = strings(model.payload['scenario_refs']);
  if (scenarioRefs.length < 20) errors.push(`Failure model requires at least 20 scenarios; found ${scenarioRefs.length}`);
};

export const atomicLocalClaimErrors = (
  binding: Record<string, unknown> | undefined,
  qualificationPayload: Record<string, unknown> | undefined,
  expectedKind: string,
  label: string,
): string[] => {
  const errors: string[] = [];
  const atomic = qualificationPayload?.['atomic_qualification'] as Record<string, unknown> | undefined;
  const manifest = atomic?.['run_manifest'] as Record<string, unknown> | undefined;
  const receipt = atomic?.['run_receipt'] as Record<string, unknown> | undefined;
  if (!binding || !manifest || !receipt || receipt['status'] !== 'PASS') return [`${label}: QUALIFIED_LOCAL_SNAPSHOT requires a canonical PASS atomic receipt`];
  const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  const digest = /^[0-9a-f]{64}$/;
  const parent = manifest['parent_run_id'];
  if (!uuidV7.test(String(parent)) || receipt['parent_run_id'] !== parent || qualificationPayload?.['validation_run_id'] !== parent) errors.push(`${label}: current atomic parent run binding differs`);
  const provenanceParent = String(binding['parent_run_id']);
  const provenanceChild = String(binding['child_run_id']);
  const provenancePath = String(binding['evidence_artifact_path']);
  const expectedProvenancePath = `.resultsafe-candidates/${provenanceParent}/${expectedKind.toUpperCase()}-EVIDENCE.json`;
  if (!uuidV7.test(provenanceParent) || !uuidV7.test(provenanceChild)) errors.push(`${label}: historical atomic provenance UUID differs`);
  if (binding['child_kind'] !== expectedKind || binding['child_status'] !== 'PASS') errors.push(`${label}: historical atomic child binding differs`);
  const provenanceDigest = String(binding['evidence_artifact_sha256']);
  if (provenancePath !== expectedProvenancePath || !digest.test(provenanceDigest) || provenanceDigest === '0'.repeat(64)) errors.push(`${label}: historical evidence artifact path or digest differs`);
  const children = objects(receipt['children']).filter((child) => child['kind'] === expectedKind);
  if (children.length !== 1) errors.push(`${label}: exact current atomic child kind ${expectedKind} differs`);
  const child = children[0];
  if (!child || child['status'] !== 'PASS') errors.push(`${label}: exact current atomic child is not PASS`);
  const childRunIds = manifest['child_run_ids'] as Record<string, unknown> | undefined;
  if (!child || childRunIds?.[expectedKind] !== child['run_id']) errors.push(`${label}: current atomic child run binding differs`);
  const artifact = child?.['evidence_artifact'] as Record<string, unknown> | undefined;
  if (!artifact || artifact['kind'] !== expectedKind) errors.push(`${label}: current atomic evidence artifact kind differs`);
  const promotion = receipt['promotion'] as Record<string, unknown> | undefined;
  if (promotion?.['eligible'] !== false || promotion['blocker'] !== 'DIRTY_OR_UNCOMMITTED_SOURCE' || binding['promotion_blocker'] !== 'DIRTY_OR_UNCOMMITTED_SOURCE') errors.push(`${label}: local qualification requires the dirty-source promotion blocker`);
  return errors;
};

export const effectIntegrationConsistencyErrors = (
  effectPayload: Record<string, unknown>,
  integrationsPayload: Record<string, unknown>,
  qualificationPayload?: Record<string, unknown>,
): string[] => {
  const errors: string[] = [];
  const authority = effectPayload['mapping_authority'] as Record<string, unknown> | undefined;
  const integrationRef = authority?.['optional_integration_ref'];
  const matches = objects(integrationsPayload['packages']).filter((item) => item['integration_ref'] === integrationRef);
  if (matches.length !== 1) {
    errors.push(`Effect mapping authority must resolve to exactly one optional integration; found ${matches.length}`);
    return errors;
  }

  const integration = matches[0]!;
  for (const [authorityField, integrationField] of [
    ['package_name', 'package_name'], ['package_path', 'package_path'], ['package_version', 'package_version'],
  ] as const) {
    if (authority?.[authorityField] !== integration[integrationField]) {
      errors.push(`Effect mapping authority ${authorityField} differs from its optional integration`);
    }
  }

  if (authority?.['effect_supported_version'] !== '3.22.1') errors.push('Effect mapping authority must bind exactly to Effect 3.22.1');
  const externalVersions = objects(integration['supported_external_versions']);
  if (externalVersions.length !== 1 || externalVersions[0]?.['package_name'] !== 'effect' || externalVersions[0]?.['version'] !== '3.22.1') {
    errors.push('Effect optional integration must support exactly Effect 3.22.1');
  }
  const peers = objects(integration['peer_dependencies']);
  const effectPeers = peers.filter((peer) => peer['package_name'] === 'effect');
  const corePeers = peers.filter((peer) => peer['package_name'] === integrationsPayload['core_package']);
  if (peers.length !== 2 || effectPeers.length !== 1 || effectPeers[0]?.['version'] !== '3.22.1' || effectPeers[0]?.['policy'] !== 'REQUIRED_PEER_EXACT_SUPPORTED_VERSION') {
    errors.push('Effect optional integration must declare Effect 3.22.1 as its only exact external peer');
  }
  if (corePeers.length !== 1 || corePeers[0]?.['policy'] !== 'REQUIRED_PEER') errors.push('Effect adapter must consume ResultSafe core only as a required peer');
  if (integrationsPayload['core_dependency_from_integrations'] !== 'PEER_ONLY' || integrationsPayload['integration_dependency_from_core'] !== 'ZERO') {
    errors.push('Effect integration must remain peer-only and introduce zero integration dependency into core');
  }

  if (strings(effectPayload['scenario_refs']).length !== 0) errors.push('Effect compatibility must not reuse core-only scenarios as adapter evidence');
  const qualification = effectPayload['qualification'] as Record<string, unknown> | undefined;
  if (qualification?.['status'] !== 'QUALIFIED_LOCAL_SNAPSHOT' || qualification?.['qualification_gate'] !== 'PASS_LOCAL_ATOMIC'
    || qualification?.['release_approval'] !== 'NOT_RELEASE_APPROVED' || strings(qualification?.['executable_evidence_refs']).length !== 2) {
    errors.push('Effect compatibility must be local-qualified for exact Effect 3.22.1 and explicitly not release-approved');
  }
  if (integration['implementation_status'] !== 'QUALIFIED_LOCAL_SNAPSHOT' || integration['qualification_gate'] !== 'PASS_LOCAL_ATOMIC') {
    errors.push('Effect adapter must use the canonical local-qualified atomic status and gate');
  }
  const evidence = objects(integration['evidence']);
  const evidenceByKind = new Map(evidence.map((item) => [String(item['kind']), item]));
  if (evidence.length !== 3 || evidenceByKind.get('PACKAGE_MANIFEST')?.['status'] !== 'QUALIFIED_LOCAL_SNAPSHOT'
    || evidenceByKind.get('EXECUTABLE_TEST_SET')?.['status'] !== 'QUALIFIED_LOCAL_SNAPSHOT'
    || evidenceByKind.get('TYPE_CONTRACT')?.['status'] !== 'QUALIFIED_LOCAL_SNAPSHOT') {
    errors.push('Effect adapter local qualification requires one qualified manifest, runtime test set, and type contract');
  }
  if (qualificationPayload) {
    errors.push(...atomicLocalClaimErrors(qualification?.['atomic_evidence'] as Record<string, unknown> | undefined, qualificationPayload, 'effect-adapter', 'Effect compatibility'));
    errors.push(...atomicLocalClaimErrors(integration['atomic_evidence'] as Record<string, unknown> | undefined, qualificationPayload, 'effect-adapter', 'Effect optional integration'));
  }
  return errors;
};

export const coreQualificationConsistencyErrors = (payload: Record<string, unknown>, qualificationPayload: Record<string, unknown> | undefined): string[] => {
  const errors = sourceHygienePolicyErrors(payload['source_hygiene']);
  for (const invariant of objects(payload['invariants'])) {
    const label = `Core invariant ${String(invariant['invariant_key'])}`;
    if (invariant['current_status'] !== 'QUALIFIED_LOCAL_SNAPSHOT') errors.push(`${label}: status must be QUALIFIED_LOCAL_SNAPSHOT`);
    errors.push(...atomicLocalClaimErrors(invariant['atomic_evidence'] as Record<string, unknown> | undefined, qualificationPayload, 'core-modularity', label));
  }
  return errors;
};

export const sourceHygienePolicyErrors = (value: unknown): string[] => {
  const policy = typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
  const errors: string[] = [];
  const exact = (field: string, expected: unknown): void => {
    if (JSON.stringify(policy[field]) !== JSON.stringify(expected)) errors.push(`Core source hygiene ${field} differs from the canonical policy`);
  };
  exact('governed_roots', ['packages/core/fp/result/src']);
  exact('forbidden_colocated_generated_suffixes', ['.js', '.d.ts', '.d.ts.map']);
  exact('ignored_local_only_paths', ['notes/', 'platform/candidates/', '.resultsafe-candidates/']);
  exact('required_gitignore_rules', [
    { owning_file: 'packages/core/fp/result/.gitignore', rule: 'src/**/*.js' },
    { owning_file: 'packages/core/fp/result/.gitignore', rule: 'src/**/*.d.ts' },
    { owning_file: 'packages/core/fp/result/.gitignore', rule: 'src/**/*.d.ts.map' },
    { owning_file: '.gitignore', rule: 'notes/' },
    { owning_file: '.gitignore', rule: 'platform/candidates/' },
    { owning_file: '.gitignore', rule: '.resultsafe-candidates/' },
  ]);
  exact('source_snapshot_rule', { forbidden_generated_outputs: 'MUST_NOT_CONTAIN', local_only_paths: 'MUST_NOT_CONTAIN' });
  exact('enforcement', 'NORMATIVE_PRE_SOURCE_SNAPSHOT');
  exact('qualification_gate', 'core-modularity');
  exact('evidence_owner', 'core-modularity');
  const expectedFields = ['governed_roots', 'forbidden_colocated_generated_suffixes', 'ignored_local_only_paths', 'required_gitignore_rules', 'source_snapshot_rule', 'enforcement', 'qualification_gate', 'evidence_owner'].sort();
  if (JSON.stringify(Object.keys(policy).sort()) !== JSON.stringify(expectedFields)) errors.push('Core source hygiene fields are not exact');
  return errors;
};

export const optionalQualificationConsistencyErrors = (payload: Record<string, unknown>, qualificationPayload: Record<string, unknown> | undefined): string[] => {
  const errors: string[] = [];
  const expectedKinds = new Map([['explicit-json-codecs', 'json-codec'], ['separate-effect-adapter', 'effect-adapter']]);
  for (const integration of objects(payload['packages'])) {
    const label = `Optional integration ${String(integration['integration_key'])}`;
    const expectedKind = expectedKinds.get(String(integration['integration_key']));
    if (!expectedKind) { errors.push(`${label}: has no canonical atomic child kind`); continue; }
    if (integration['implementation_status'] !== 'QUALIFIED_LOCAL_SNAPSHOT' || integration['qualification_gate'] !== 'PASS_LOCAL_ATOMIC'
      || objects(integration['evidence']).some((evidence) => evidence['status'] !== 'QUALIFIED_LOCAL_SNAPSHOT')) errors.push(`${label}: status, evidence, or gate is not locally qualified`);
    errors.push(...atomicLocalClaimErrors(integration['atomic_evidence'] as Record<string, unknown> | undefined, qualificationPayload, expectedKind, label));
  }
  return errors;
};

export const remediationQualificationConsistencyErrors = (payload: Record<string, unknown>, qualificationPayload: Record<string, unknown> | undefined): string[] => {
  const errors: string[] = [];
  const scenarioTasks = new Set(['exact-result-discrimination', 'immutable-none-singleton', 'canonical-shared-declarations', 'concrete-constructor-branches', 'stable-extraction-errors', 'sound-typed-variant-guard', 'required-refiner-payload', 'effective-variant-controls', 'persistent-matcher-handlers', 'strict-matcher-exhaustiveness', 'matcher-output-inference', 'consistent-own-properties', 'validator-output-projection', 'remove-never-sentinel', 'sync-async-refiner-parity']);
  const expectedKinds = new Map<string, string>([
    ...[...scenarioTasks].map((key) => [key, 'canonical-scenario'] as const),
    ['packed-type-contract-tests', 'core-modularity'], ['declare-all-direct-subpaths', 'core-modularity'], ['prove-core-modularity', 'core-modularity'],
    ['separate-optional-integrations', 'core-modularity'], ['qualify-effect-compatibility', 'effect-adapter'], ['qualify-cause-exit-matrix', 'cause-exit-exact-artifacts'],
  ]);
  for (const task of objects(payload['tasks'])) {
    const key = String(task['task_key']); const expectedKind = expectedKinds.get(key); const gates = objects(task['acceptance_gates']);
    if (expectedKind) {
      if (task['status'] !== 'QUALIFIED_LOCAL_SNAPSHOT' || gates.some((gate) => gate['status'] !== 'PASS_LOCAL_ATOMIC')) errors.push(`${key}: covered task and gates must be locally qualified`);
      for (const gate of gates) errors.push(...atomicLocalClaimErrors(gate['atomic_evidence'] as Record<string, unknown> | undefined, qualificationPayload, expectedKind, `${key}:${String(gate['gate_key'])}`));
    }
    if (key === 'clean-release-build' && (task['status'] !== 'BLOCKED' || gates[0]?.['status'] !== 'BLOCKED' || !String(gates[0]?.['blocker']).includes('clean commit-bound rerun'))) errors.push('clean-release-build must retain the dirty-source clean commit-bound blocker');
  }
  return errors;
};

const validateCauseExit = (corpus: Corpus, errors: string[]): void => {
  const audit = documentByKey(corpus, 'cause-audit');
  const cause = documentByKey(corpus, 'cause-model');
  const exit = documentByKey(corpus, 'exit-model');
  const effect = documentByKey(corpus, 'effect-compatibility');
  const matrix = documentByKey(corpus, 'cause-exit-conformance-matrix');
  if (!audit || !cause || !exit || !effect || !matrix) {
    errors.push('Cause/Exit canonical authorities are incomplete');
    return;
  }
  const sources = objects(audit.payload['official_source_practices']);
  if (sources.length < 20) errors.push(`Cause audit requires at least 20 official sources; found ${sources.length}`);
  if (new Set(sources.map((source) => String(source['practice_key']))).size !== sources.length) errors.push('Cause audit source keys are not unique');
  if (new Set(sources.map((source) => String(source['official_url']))).size !== sources.length) errors.push('Cause audit official URLs are not unique');
  const criteria = objects(audit.payload['criteria']);
  const weights = new Map(criteria.map((criterion) => [String(criterion['criterion_key']), Number(criterion['weight'])]));
  const total = [...weights.values()].reduce((sum, weight) => sum + weight, 0);
  if (Math.abs(total - 100) > 0.000_001) errors.push(`Cause audit criterion weights total ${total}, expected 100`);
  const options = objects(audit.payload['options']);
  for (const option of options) {
    const scores = option['scores'] as Record<string, unknown>;
    const calculated = [...weights].reduce((sum, [key, weight]) => sum + Number(scores[key]) * weight / 100, 0);
    if (Math.abs(Number(option['weighted_total']) - Number(calculated.toFixed(2))) > 0.000_001) errors.push(`${String(option['option_key'])}: weighted total differs from calculated score`);
  }
  const selected = String((audit.payload['conclusion'] as Record<string, unknown>)['selected_option']);
  const winner = [...options].sort((left, right) => Number(right['weighted_total']) - Number(left['weighted_total']))[0];
  if (selected !== winner?.['option_key']) errors.push('Cause audit conclusion does not select the highest weighted option');

  const tags = (document: CanonicalDocument): string[] => objects(document.payload['variants']).map((variant) => String(variant['tag']));
  if (JSON.stringify(tags(cause)) !== JSON.stringify(['Empty', 'Fail', 'Die', 'Interrupt', 'Sequential', 'Parallel'])) errors.push('Cause model variants are not exact or ordered canonically');
  if (JSON.stringify(tags(exit)) !== JSON.stringify(['Success', 'Failure'])) errors.push('Exit model variants are not exact or ordered canonically');
  const causeRefs = strings(cause.payload['scenario_refs']);
  const exitRefs = strings(exit.payload['scenario_refs']);
  if (causeRefs.length + exitRefs.length < 40) errors.push(`Cause/Exit models require at least 40 scenarios; found ${causeRefs.length + exitRefs.length}`);
  for (const [model, refs] of [[cause, causeRefs], [exit, exitRefs]] as const) {
    for (const ref of refs) {
      const scenario = corpus.scenarios.get(idFromRef(ref) ?? '');
      if (!scenario) errors.push(`${model.document_key}: missing scenario ${ref}`);
      else if (scenario.subject_ref !== model.document_ref) errors.push(`${scenario.scenario_key}: subject_ref does not point back to ${model.document_key}`);
    }
  }
  const exitInvariants = strings(exit.payload['invariants']).join('\n');
  if (!/Failure\(Empty\).*valid/i.test(exitInvariants)) errors.push('Exit model does not preserve Failure(Empty) as valid');
  if (!/mutually exclusive/i.test(exitInvariants)) errors.push('Exit model does not require mutually exclusive variants');
  const effectCause = objects(effect.payload['cause_mappings']).map((mapping) => String(mapping['resultsafe_tag']));
  const effectExit = objects(effect.payload['exit_mappings']).map((mapping) => String(mapping['resultsafe_tag']));
  if (JSON.stringify(effectCause) !== JSON.stringify(tags(cause)) || JSON.stringify(effectExit) !== JSON.stringify(tags(exit))) errors.push('Effect mappings do not exactly cover Cause and Exit variants');
  const optionalIntegrations = documentByKey(corpus, 'optional-integrations');
  const qualification = documentByKey(corpus, 'qualification-receipt');
  if (!optionalIntegrations) errors.push('Optional integration authority is absent');
  else errors.push(...effectIntegrationConsistencyErrors(effect.payload, optionalIntegrations.payload, qualification?.payload));

  const cells = objects(matrix.payload['cells']);
  const expected = new Set(['typescript', 'python'].flatMap((target) => [...tags(cause), ...tags(exit)].map((tag) => `${target}:${tag}`)));
  const actual = new Set(cells.map((cell) => String(cell['cell_key'])));
  if (cells.length !== expected.size || actual.size !== expected.size || [...expected].some((key) => !actual.has(key))) errors.push('Cause/Exit matrix does not exactly cover TypeScript and Python semantic variants');
  const projections = documentByKey(corpus, 'projection-catalog');
  const projectionByTarget = new Map(objects(projections?.payload['items']).map((item) => [String(item['target_key']), item]));
  for (const cell of cells) {
    const key = String(cell['cell_key']); const target = String(cell['target_key']); const variant = String(cell['variant']);
    const artifact = cell['artifact'] as Record<string, unknown>; const projection = projectionByTarget.get(target);
    if (key !== `${target}:${variant}`) errors.push(`${key}: Cause/Exit cell key does not match target and variant`);
    if (cell['model_key'] !== (variant === 'Success' || variant === 'Failure' ? 'exit' : 'cause')) errors.push(`${key}: model binding differs from variant`);
    if (cell['cause_model_revision'] !== (cause as unknown as Record<string, unknown>)['document_revision'] || cell['exit_model_revision'] !== (exit as unknown as Record<string, unknown>)['document_revision']) errors.push(`${key}: model revision binding is stale`);
    if (cell['projection_catalog_revision'] !== (projections as unknown as Record<string, unknown> | undefined)?.['document_revision'] || cell['projection_revision'] !== projection?.['record_revision']) errors.push(`${key}: projection revision binding is stale`);
    if (artifact?.['kind'] !== (target === 'typescript' ? 'typescript-tarball' : 'python-wheel')) errors.push(`${key}: artifact kind does not match target`);
    for (const ref of strings(cell['scenario_refs'])) if (!corpus.scenarios.has(idFromRef(ref) ?? '')) errors.push(`${key}: unresolved scenario evidence ${ref}`);
    const runtime = cell['runtime_disposition']; const type = cell['type_disposition'];
    const derived = runtime === 'PASS' && (type === 'PASS' || type === 'NOT_APPLICABLE') && JSON.stringify(cell['actual_semantic_outcome']) === JSON.stringify(cell['expected_semantic_outcome']) ? 'PASS' : 'FAIL';
    if (cell['status'] !== derived) errors.push(`${key}: status is not derived from semantic runtime/type evidence`);
  }
  if (matrix.payload['cause_model_revision'] !== (cause as unknown as Record<string, unknown>)['document_revision'] || matrix.payload['exit_model_revision'] !== (exit as unknown as Record<string, unknown>)['document_revision'] || matrix.payload['projection_catalog_revision'] !== (projections as unknown as Record<string, unknown> | undefined)?.['document_revision']) errors.push('Cause/Exit matrix authority revision binding is stale');
  const aggregate = matrix.payload['aggregate'] as Record<string, unknown>; const passed = cells.filter((cell) => cell['status'] === 'PASS').length; const aggregateStatus = passed === cells.length ? 'PASS' : 'FAIL';
  if (aggregate?.['total'] !== cells.length || aggregate?.['passed'] !== passed || aggregate?.['failed'] !== cells.length - passed || aggregate?.['status'] !== aggregateStatus) errors.push('Cause/Exit aggregate is not derived from cell evidence');
};

const validatePublicModuleClosure = (corpus: Corpus, errors: string[]): void => {
  const registry = documentByKey(corpus, 'public-module-registry'); const policy = documentByKey(corpus, 'core-modularity-policy'); const plan = documentByKey(corpus, 'remediation-plan');
  if (!registry || !policy || !plan) { errors.push('Wave 1 modularity authorities are incomplete'); return; }
  const modules = objects(registry.payload['modules']);
  if (registry.payload['module_count'] !== modules.length) errors.push('public module registry module_count differs from modules');
  for (const field of ['direct_subpath', 'source_path']) { const values = modules.map((item) => String(item[field])); if (new Set(values).size !== values.length) errors.push(`public module registry has duplicate ${field}`); }
  const repositoryRoot = resolve(corpus.root, '../../..'); const paths = modules.map((item) => resolve(repositoryRoot, String(item['source_path']))); const rootEntry = resolve(repositoryRoot, String(registry.payload['root_entry']));
  const program = ts.createProgram([rootEntry, ...paths], { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, strict: true, noEmit: true, skipLibCheck: true });
  const checker = program.getTypeChecker(); const rootSource = program.getSourceFile(rootEntry); const rootSymbol = rootSource ? checker.getSymbolAtLocation(rootSource) : undefined; const rootExports = new Set(rootSymbol ? checker.getExportsOfModule(rootSymbol).map((symbol) => symbol.name) : []);
  for (const [index, item] of modules.entries()) {
    const source = program.getSourceFile(paths[index]!); if (!source) { errors.push(`public module source does not exist: ${String(item['source_path'])}`); continue; }
    const symbol = checker.getSymbolAtLocation(source); const exports = new Set(symbol ? checker.getExportsOfModule(symbol).map((entry) => entry.name) : []);
    for (const name of strings(item['source_exports'])) { if (!exports.has(name)) errors.push(`${String(item['direct_subpath'])}: declared source export ${name} is absent`); if (item['root_exported'] === true && !rootExports.has(name)) errors.push(`${String(item['direct_subpath'])}: declared root export ${name} is absent`); }
  }
  const tasks = objects(plan.payload['tasks']); const ids = new Set(tasks.map((task) => String(task['task_id']))); const keys = new Set<string>();
  for (const task of tasks) { const key = String(task['task_key']); if (keys.has(key)) errors.push(`remediation plan duplicate task key ${key}`); keys.add(key); for (const dependency of strings(task['depends_on_task_ids'])) if (!ids.has(dependency)) errors.push(`${key}: missing remediation dependency ${dependency}`); }
};

const validateLocalQualificationClaims = (corpus: Corpus, errors: string[]): void => {
  const qualification = documentByKey(corpus, 'qualification-receipt')?.payload;
  const core = documentByKey(corpus, 'core-modularity-policy');
  const optional = documentByKey(corpus, 'optional-integrations');
  const remediation = documentByKey(corpus, 'remediation-plan');
  if (!core || !optional || !remediation) { errors.push('Local qualification claim authorities are incomplete'); return; }
  errors.push(...coreQualificationConsistencyErrors(core.payload, qualification));
  errors.push(...optionalQualificationConsistencyErrors(optional.payload, qualification));
  errors.push(...remediationQualificationConsistencyErrors(remediation.payload, qualification));
};

const validateOperationSurfaces = (corpus: Corpus, errors: string[]): void => {
  const contractIr = documentByKey(corpus, 'contract-ir');
  if (!contractIr) {
    errors.push('Contract IR is absent');
    return;
  }
  const operations = contractIr.payload['operations'] as Record<string, Record<string, unknown>>;
  const entries = Object.entries(operations ?? {});
  const constructors = new Set(['construct-success', 'construct-failure']);
  const neutral = entries.filter(([, operation]) => operation['classification'] === 'NEUTRAL_PRIMITIVE');
  if (neutral.length !== 23) errors.push(`expected 23 neutral operations, found ${neutral.length}`);
  if (neutral.filter(([key]) => !constructors.has(key)).length !== 21) errors.push('expected 21 neutral non-constructor operations');

  for (const [mapKey, operation] of entries) {
    if (operation['operation_key'] !== mapKey) errors.push(`${mapKey}: operation map key differs from operation_key`);
    const surface = operation['surface_contract'] as Record<string, unknown> | undefined;
    if (surface?.['module_callable'] !== 'REQUIRED') errors.push(`${mapKey}: module callable is not required`);
    const method = surface?.['instance_method'];
    const requiresMethod = operation['classification'] === 'NEUTRAL_PRIMITIVE' && !constructors.has(mapKey);
    if (requiresMethod) {
      if (typeof method !== 'object' || method === null || (method as Record<string, unknown>)['requirement'] !== 'REQUIRED') {
        errors.push(`${mapKey}: Result instance method is not required`);
        continue;
      }
      const receiver = String((method as Record<string, unknown>)['receiver_input']);
      const input = objects(operation['inputs']).find((candidate) => candidate['input_key'] === receiver);
      if (!input) errors.push(`${mapKey}: method receiver input ${receiver} does not exist`);
      else if (!/^(?:Result|NestedResult|ResultOption)</.test(String(input['type']))) errors.push(`${mapKey}: method receiver is not Result-typed`);
    } else if (method !== 'FORBIDDEN') {
      errors.push(`${mapKey}: constructors and TypeScript extensions must forbid Result instance methods`);
    }
  }

  const projectionRecords = [...corpus.records.values()].filter((record) =>
    record.record_key === 'typescript-result-projection' || record.record_key === 'python-result-projection');
  const projectionByTarget = new Map<string, Record<string, unknown>>();
  for (const projection of projectionRecords) {
    const value = projection as unknown as Record<string, unknown>;
    const language = String(value['target_key']);
    projectionByTarget.set(language, value);
    if (value['contract_ir_ref'] !== contractIr.document_ref || value['contract_ir_revision'] !== (contractIr as unknown as Record<string, unknown>)['document_revision']) {
      errors.push(`${projection.record_key}: Contract IR reference or revision is stale`);
    }
    const bindings = objects(value['operation_bindings']);
    const byOperation = new Map<string, Record<string, unknown>>();
    const names = new Set<string>();
    for (const binding of bindings) {
      const key = String(binding['operation_key']);
      const moduleName = String(binding['module_name']);
      if (byOperation.has(key)) errors.push(`${projection.record_key}: duplicate operation binding ${key}`);
      byOperation.set(key, binding);
      if (names.has(moduleName)) errors.push(`${projection.record_key}: duplicate module binding ${moduleName}`);
      names.add(moduleName);
    }
    const expected = entries.filter(([, operation]) => strings(operation['projection_applicability']).includes(language));
    if (bindings.length !== expected.length) errors.push(`${projection.record_key}: operation binding count does not exactly cover applicable operations`);
    for (const [key, operation] of expected) {
      const binding = byOperation.get(key);
      if (!binding) {
        errors.push(`${projection.record_key}: missing operation binding ${key}`);
        continue;
      }
      const method = (operation['surface_contract'] as Record<string, unknown>)['instance_method'];
      if (method === 'FORBIDDEN' && 'method_name' in binding) errors.push(`${projection.record_key}: ${key} forbids a method binding`);
      if (method !== 'FORBIDDEN' && typeof binding['method_name'] !== 'string') errors.push(`${projection.record_key}: ${key} requires a method binding`);
      if (!constructors.has(key)) {
        const spelling = language === 'typescript' ? /^[a-z][A-Za-z0-9]*$/ : /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
        if (!spelling.test(String(binding['module_name']))) errors.push(`${projection.record_key}: ${key} module spelling violates ${language} convention`);
        if (binding['method_name'] !== undefined && !spelling.test(String(binding['method_name']))) errors.push(`${projection.record_key}: ${key} method spelling violates ${language} convention`);
      }
    }
    for (const key of byOperation.keys()) if (!expected.some(([expectedKey]) => expectedKey === key)) errors.push(`${projection.record_key}: inapplicable operation binding ${key}`);
    if (language === 'python') {
      for (const [key, operation] of entries) {
        if (operation['classification'] === 'TYPESCRIPT_EXTENSION' && byOperation.has(key)) errors.push(`${projection.record_key}: TypeScript extension ${key} is forbidden`);
      }
    }
    const supportBindings = objects(value['support_bindings']);
    const supportKeys = new Set<string>();
    for (const support of supportBindings) {
      const key = String(support['operation_key']);
      const name = String(support['module_name']);
      const supportKey = `${key}\0${name}\0${String(support['binding'])}`;
      if (supportKeys.has(supportKey)) errors.push(`${projection.record_key}: duplicate support binding ${name}`);
      supportKeys.add(supportKey);
      if (!byOperation.has(key)) errors.push(`${projection.record_key}: support binding targets unmapped operation ${key}`);
      if (names.has(name)) errors.push(`${projection.record_key}: duplicate support/module binding ${name}`);
      names.add(name);
    }
    const requiredSupport = language === 'typescript' ? new Set([
      'tap-success\0inspect\0ALIAS',
      'tap-failure\0inspectErr\0ALIAS',
      'refine-sync-kernel\0refineResult\0CURRIED',
      'refine-async-kernel\0refineAsyncResult\0CURRIED',
    ]) : new Set<string>();
    for (const key of requiredSupport) if (!supportKeys.has(key)) errors.push(`${projection.record_key}: missing required support binding ${key.replaceAll('\0', ' ')}`);
    for (const key of supportKeys) if (!requiredSupport.has(key)) errors.push(`${projection.record_key}: unexpected support binding ${key.replaceAll('\0', ' ')}`);
  }

  const qualification = documentByKey(corpus, 'qualification-receipt');
  const results = objects(qualification?.payload['language_projection_results']);
  const resultTargets = new Set<string>();
  if (results.length !== 2) errors.push('qualification must contain exactly two language projection results');
  for (const result of results) {
    const target = String(result['target_key']);
    if (resultTargets.has(target)) errors.push(`qualification has duplicate language projection result ${target}`);
    resultTargets.add(target);
    const projection = projectionByTarget.get(target);
    if (!projection) {
      errors.push(`qualification language projection result has no projection ${target}`);
      continue;
    }
    if (result['projection_ref'] !== projection['record_ref'] || result['projection_revision'] !== projection['record_revision']) {
      errors.push(`${target}: qualification projection evidence is not revision-bound to the current projection`);
    }
    if (result['contract_ir_ref'] !== contractIr.document_ref || result['contract_ir_revision'] !== (contractIr as unknown as Record<string, unknown>)['document_revision']) {
      errors.push(`${target}: qualification projection evidence is not revision-bound to the current Contract IR`);
    }
  }
  const entrypoint = documentByKey(corpus, 'ai-entrypoint');
  const projectionCatalog = documentByKey(corpus, 'projection-catalog');
  if (entrypoint?.payload['semantic_authority_ref'] !== contractIr.document_ref) errors.push('AI entrypoint semantic authority is not Contract IR');
  if (entrypoint?.payload['spelling_authority_ref'] !== projectionCatalog?.document_ref) errors.push('AI entrypoint spelling authority is not the projection catalog');
};

const relationTypes: Readonly<Record<string, readonly (readonly [EntityType, EntityType])[]>> = {
  EVIDENCES: [['evidence', 'finding'], ['evidence', 'package_family'], ['evidence', 'projection'], ['evidence', 'document']],
  IDENTIFIES: [['evidence', 'finding']],
  ADDRESSED_BY: [['finding', 'decision']],
  MITIGATES: [['decision', 'risk']],
  MIGRATES: [['migration', 'contract']],
  RESPONDS_TO: [['migration', 'finding']],
  VERIFIED_BY: [['contract', 'scenario'], ['document', 'scenario']],
  HAS_SCENARIO: [['contract', 'scenario'], ['document', 'scenario']],
  SPECIFIED_BY: [['scenario', 'contract'], ['scenario', 'document']],
  PROJECTED_AS: [['contract', 'projection'], ['requirement', 'projection'], ['document', 'projection']],
  IMPLEMENTED_BY: [['projection', 'package_family'], ['document', 'requirement'], ['document', 'projection']],
  PLANNED_FOR: [['projection', 'package_family'], ['requirement', 'task'], ['document', 'task']],
  GOVERNS: [
    ['decision', 'requirement'], ['requirement', 'contract'], ['requirement', 'projection'],
    ['requirement', 'package_family'], ['requirement', 'document'], ['document', 'document'],
  ],
};

export const isTraceEndpointAllowed = (relation: string, sourceType: EntityType, targetType: EntityType): boolean =>
  relationTypes[relation]?.some(([allowedSource, allowedTarget]) => sourceType === allowedSource && targetType === allowedTarget) ?? false;

const validateTraceability = (corpus: Corpus, errors: string[]): void => {
  const traceability = documentByKey(corpus, 'traceability-matrix');
  if (!traceability) {
    errors.push('traceability matrix is absent');
    return;
  }
  const links = objects(traceability.payload['links']) as unknown as Link[];
  const linkKeys = new Set<string>();
  const verificationEvidenceAvailable = [...corpus.scenarios.values()].every((scenario) => scenario.status === 'PASS');
  for (const link of links) {
    const key = `${link.source_ref}\0${link.relation}\0${link.target_ref}`;
    if (linkKeys.has(key)) errors.push(`duplicate trace link ${link.source_ref} ${link.relation} ${link.target_ref}`);
    linkKeys.add(key);
    const source = corpus.entities.get(idFromRef(link.source_ref) ?? '');
    const target = corpus.entities.get(idFromRef(link.target_ref) ?? '');
    if (!source) errors.push(`trace link has unresolved source ${link.source_ref}`);
    if (!target) errors.push(`trace link has unresolved target ${link.target_ref}`);
    const allowed = relationTypes[link.relation];
    if (!allowed) errors.push(`trace link has unsupported relation ${link.relation}`);
    else if (source && target && !isTraceEndpointAllowed(link.relation, source.type, target.type)) {
      errors.push(`${link.relation} has invalid endpoint types ${source.type} -> ${target.type}`);
    }
    if (!verificationEvidenceAvailable && link.relation === 'VERIFIED_BY') {
      errors.push(`VERIFIED_BY cannot claim verification while behavioral status is not PASS: ${link.target_ref}`);
    }
    if (link.relation === 'VERIFIED_BY' && target?.type === 'scenario') {
      const scenario = corpus.scenarios.get(target.id);
      if (scenario?.status !== 'PASS') errors.push(`VERIFIED_BY targets a scenario without PASS evidence: ${link.target_ref}`);
    }
  }

  const has = (source: string, relation: string, target?: string): boolean =>
    links.some((link) => link.source_ref === source && link.relation === relation && (!target || link.target_ref === target));
  const hasIncoming = (target: string, relation: string): boolean => links.some((link) => link.target_ref === target && link.relation === relation);
  for (const record of corpus.records.values()) {
    if (record.kind === 'finding') {
      if (!hasIncoming(record.record_ref, 'EVIDENCES')) errors.push(`${record.record_key}: no evidence trace`);
      if (!has(record.record_ref, 'ADDRESSED_BY')) errors.push(`${record.record_key}: no remediation decision trace`);
    }
    if (record.kind === 'risk' && !hasIncoming(record.record_ref, 'MITIGATES')) errors.push(`${record.record_key}: no mitigating decision trace`);
    if (record.kind === 'contract') {
      if (!hasIncoming(record.record_ref, 'GOVERNS')) errors.push(`${record.record_key}: no governing requirement trace`);
      for (const scenarioRef of record.scenario_refs ?? []) {
        if (!has(record.record_ref, 'HAS_SCENARIO', scenarioRef) && !has(record.record_ref, 'VERIFIED_BY', scenarioRef)) {
          errors.push(`${record.record_key}: missing scenario trace to ${scenarioRef}`);
        }
        if (!has(scenarioRef, 'SPECIFIED_BY', record.record_ref)) errors.push(`${record.record_key}: missing reciprocal SPECIFIED_BY trace from ${scenarioRef}`);
      }
      if (verificationEvidenceAvailable && !has(record.record_ref, 'VERIFIED_BY')) errors.push(`${record.record_key}: no verification scenario trace`);
      if (!has(record.record_ref, 'PROJECTED_AS')) errors.push(`${record.record_key}: no language projection trace`);
    }
    if (record.kind === 'projection' && !has(record.record_ref, 'IMPLEMENTED_BY') && !has(record.record_ref, 'PLANNED_FOR') && !hasIncoming(record.record_ref, 'PROJECTED_AS')) {
      errors.push(`${record.record_key}: no implementation or planned package family trace`);
    }
  }
};

const validateConformanceMatrix = (corpus: Corpus, errors: string[]): void => {
  const matrix = documentByKey(corpus, 'conformance-matrix');
  const contract = documentByKey(corpus, 'contract-ir');
  const catalog = documentByKey(corpus, 'projection-catalog');
  if (!matrix || !contract || !catalog) {
    errors.push('cross-language conformance matrix authorities are incomplete');
    return;
  }
  const payload = matrix.payload;
  if (payload['contract_ir_ref'] !== contract.document_ref || payload['contract_ir_revision'] !== (contract as unknown as Record<string, unknown>)['document_revision']) errors.push('conformance matrix Contract IR revision binding is stale');
  if (payload['projection_catalog_ref'] !== catalog.document_ref || payload['projection_catalog_revision'] !== (catalog as unknown as Record<string, unknown>)['document_revision']) errors.push('conformance matrix projection catalog revision binding is stale');
  const operations = contract.payload['operations'] as Record<string, Record<string, unknown>>;
  const laws = objects(contract.payload['laws']);
  const projections = new Map(objects(catalog.payload['items']).filter((item) => item['target_key'] === 'typescript' || item['target_key'] === 'python').map((item) => [String(item['target_key']), item]));
  const expected = new Map<string, { operation: Record<string, unknown>; binding: Record<string, unknown>; revision: unknown; laws: string[] }>();
  for (const target of ['typescript', 'python']) {
    const projection = projections.get(target);
    if (!projection) continue;
    const bindings = new Map(objects(projection['operation_bindings']).map((binding) => [String(binding['operation_key']), binding]));
    for (const [operationKey, operation] of Object.entries(operations)) {
      if (operation['classification'] !== 'NEUTRAL_PRIMITIVE' || !strings(operation['projection_applicability']).includes(target)) continue;
      const binding = bindings.get(operationKey);
      if (!binding) continue;
      const lawKeys = laws.filter((law) => strings(law['applies_to']).includes(operationKey)).map((law) => String(law['law_key']));
      expected.set(`${target}:${operationKey}:module`, { operation, binding, revision: projection['record_revision'], laws: lawKeys });
      if ((operation['surface_contract'] as Record<string, unknown>)['instance_method'] !== 'FORBIDDEN') expected.set(`${target}:${operationKey}:instance_method`, { operation, binding, revision: projection['record_revision'], laws: lawKeys });
    }
  }
  const cells = objects(payload['cells']);
  if (expected.size !== 88 || cells.length !== 88) errors.push(`conformance matrix requires exactly 88 cells; expected ${expected.size}, found ${cells.length}`);
  const seen = new Set<string>();
  for (const cell of cells) {
    const key = String(cell['cell_key']);
    if (seen.has(key)) errors.push(`conformance matrix duplicate cell ${key}`);
    seen.add(key);
    const source = expected.get(key);
    if (!source) { errors.push(`conformance matrix unexpected cell ${key}`); continue; }
    if (cell['operation_key'] !== source.binding['operation_key'] || JSON.stringify(cell['binding']) !== JSON.stringify(source.binding)) errors.push(`${key}: binding differs from projection`);
    if (cell['contract_ir_revision'] !== (contract as unknown as Record<string, unknown>)['document_revision'] || cell['projection_revision'] !== source.revision) errors.push(`${key}: revision binding is stale`);
    const clauses = [
      ...objects(source.operation['branches']).map((_, index) => `branch:${index}`),
      ...objects(source.operation['callbacks']).map((callback) => `callback:${String(callback['callback_key'])}`),
      ...objects(source.operation['exception_outcomes']).map((exception) => `exception:${String(exception['source']).toLowerCase()}:${String(exception['outcome']).toLowerCase()}`),
      `identity:${String(source.operation['result_identity']).toLowerCase()}`,
      ...source.laws.map((law) => `law:${law}`), 'types:positive', 'types:negative',
    ];
    if (JSON.stringify(cell['clause_keys']) !== JSON.stringify(clauses)) errors.push(`${key}: clause coverage differs from Contract IR`);
    if (JSON.stringify(cell['law_keys']) !== JSON.stringify(source.laws)) errors.push(`${key}: law coverage differs from Contract IR`);
    const expectedClauses = {
      branches: source.operation['branches'], callbacks: source.operation['callbacks'], exception_outcomes: source.operation['exception_outcomes'],
      result_identity: source.operation['result_identity'], laws: laws.filter((law) => source.laws.includes(String(law['law_key']))),
    };
    if (JSON.stringify(cell['clauses']) !== JSON.stringify(expectedClauses)) errors.push(`${key}: materialized clauses differ from Contract IR`);
    if (cell['status'] !== 'PASS' || JSON.stringify(cell['actual_outcome']) !== JSON.stringify(cell['expected_outcome'])) errors.push(`${key}: has no exact PASS outcome evidence`);
  }
  for (const key of expected.keys()) if (!seen.has(key)) errors.push(`conformance matrix missing cell ${key}`);
  if (payload['status'] !== 'PASS') errors.push('conformance matrix aggregate status is not PASS');
};

const validateStatuses = (corpus: Corpus, failedChecks: ReadonlySet<string>, errors: string[], enforceQualificationGates: boolean, replacingQualificationReceipt = false): void => {
  const scenarioDocument = documentByKey(corpus, 'scenario-catalog');
  const executionState = scenarioDocument?.payload['execution_state'];
  if (executionState === 'NOT_EXECUTED') {
    for (const scenario of corpus.scenarios.values()) if (scenario.status !== 'NOT_EXECUTED') errors.push(`${scenario.scenario_key}: has result while execution_state is NOT_EXECUTED`);
  } else if (executionState === 'EXECUTED') {
    for (const scenario of corpus.scenarios.values()) if (scenario.status !== 'PASS' && scenario.status !== 'FAIL') errors.push(`${scenario.scenario_key}: has no result while execution_state is EXECUTED`);
  } else if (executionState === 'PARTIAL' && ![...corpus.scenarios.values()].some((scenario) => scenario.status === 'NOT_EXECUTED')) {
    errors.push('scenario execution_state is PARTIAL but every scenario has a result');
  }
  if (replacingQualificationReceipt) return;
  const qualification = documentByKey(corpus, 'qualification-receipt');
  if (!qualification) return;
  const payload = qualification.payload;
  const atomic = payload['atomic_qualification'] as Record<string, unknown> | undefined;
  if (atomic) {
    const manifest = atomic['run_manifest'] as Record<string, unknown>;
    const receipt = atomic['run_receipt'] as Record<string, unknown>;
    const parent = manifest['parent_run_id'];
    const source = manifest['source_snapshot'] as Record<string, unknown>;
    if (receipt['parent_run_id'] !== parent) errors.push('atomic qualification parent run binding differs');
    if (receipt['qualified_source_snapshot_sha256'] !== source['digest']) errors.push('atomic qualification source snapshot digest differs');
    const artifacts = objects(manifest['artifacts']);
    const artifactKinds = ['core-tarball', 'python-wheel', 'codec-tarball', 'effect-adapter-tarball'];
    if (artifacts.length !== artifactKinds.length || artifactKinds.some((kind) => artifacts.filter((artifact) => artifact['kind'] === kind).length !== 1)) errors.push('atomic qualification artifact kind closure differs');
    const qualifiedArtifacts = objects(receipt['qualified_artifacts']);
    const publication = manifest['publication_inputs'] as Record<string, unknown>;
    for (const artifact of artifacts) {
      const kind = String(artifact['kind']);
      if (qualifiedArtifacts.find((item) => item['kind'] === kind)?.['sha256'] !== artifact['sha256'] || publication[`${kind}_sha256`] !== artifact['sha256']) errors.push(`atomic qualification ${kind} digest differs`);
    }
    const childIds = manifest['child_run_ids'] as Record<string, unknown>;
    const children = objects(receipt['children']);
    if (new Set(children.map((child) => child['run_id'])).size !== children.length) errors.push('atomic qualification child run IDs are not unique');
    for (const child of children) {
      if (child['parent_run_id'] !== parent || childIds[String(child['kind'])] !== child['run_id']) errors.push(`atomic qualification ${String(child['kind'])} child run binding differs`);
      const evidence = child['evidence_artifact'] as Record<string, unknown> | undefined;
      if (child['status'] === 'PASS' && evidence?.['kind'] !== child['kind']) errors.push(`atomic qualification ${String(child['kind'])} evidence kind differs`);
      if (evidence) for (const artifact of artifacts) if ((evidence['artifact_sha256'] as Record<string, unknown> | undefined)?.[String(artifact['kind'])] !== artifact['sha256']) errors.push(`atomic qualification ${String(child['kind'])} evidence artifact binding differs`);
    }
    const expectedChildren = 10;
    if (receipt['status'] === 'PASS' && (children.length !== expectedChildren || children.some((child) => child['status'] !== 'PASS'))) errors.push(`atomic qualification PASS requires ${expectedChildren} passing child runs`);
    const requirement = manifest['governed_requirement'] as Record<string, unknown>;
    if (requirement?.['required_status'] === 'PASS' && receipt['status'] !== 'PASS') errors.push('atomic qualification governed receipt requires PASS');
    const inputTree = manifest['canonical_input_tree'] as Record<string, unknown>;
    const finalTree = receipt['final_canonical_tree'] as Record<string, unknown>;
    if (!inputTree) {
      if (enforceQualificationGates) errors.push('atomic qualification uses legacy unsound canonical tree evidence and must be requalified');
      if (receipt['canonical_tree_sha256'] !== manifest['canonical_tree_sha256']) errors.push('legacy atomic qualification canonical tree digest differs');
    } else {
      if (JSON.stringify(inputTree['exclusions']) !== JSON.stringify(['INTEGRITY-MANIFEST.json', 'QUALIFICATION-RECEIPT.json', 'WAVE-PLAN.json'])) errors.push('atomic qualification canonical input exclusions differ');
      if (JSON.stringify(finalTree?.['exclusions']) !== JSON.stringify(['INTEGRITY-MANIFEST.json', 'QUALIFICATION-RECEIPT.json'])) errors.push('atomic qualification final canonical tree exclusions differ');
      const matrixInputs = manifest['matrix_inputs'] as Record<string, unknown>;
      for (const artifact of artifacts) {
        const kind = String(artifact['kind']);
        if (matrixInputs?.[`${kind}_sha256`] !== artifact['sha256']) errors.push(`atomic qualification ${kind} matrix input digest differs`);
      }
      const dumps = objects(receipt['logical_dumps']);
      const dumpKinds = ['storage-base-dump', 'storage-structured-failure-dump', 'storage-cause-exit-dump'];
      if (dumps.length !== dumpKinds.length || dumpKinds.some((kind) => dumps.filter((dump) => dump['kind'] === kind).length !== 1)) errors.push('atomic qualification logical dump closure differs');
    }
    const git = manifest['git'] as Record<string, unknown>; const promotion = receipt['promotion'] as Record<string, unknown>;
    if (promotion['eligible'] !== (git['worktree_clean'] === true)) errors.push('atomic qualification promotion eligibility differs from worktree cleanliness');
  }
  const scenarioBehavioral = executionState === 'NOT_EXECUTED' ? 'NOT_EXECUTED' : executionState === 'PARTIAL' ? 'PARTIAL' :
    [...corpus.scenarios.values()].some((scenario) => scenario.status === 'FAIL') ? 'FAIL' : 'PASS';
  const languageResults = objects(payload['language_projection_results']);
  const languageStatuses = languageResults.map((result) => String(result['status']) as LanguageStatus);
  const expectedBehavioral = aggregateBehavioralStatus(scenarioBehavioral as BehavioralStatus, languageStatuses);
  if (payload['behavioral_status'] !== expectedBehavioral) errors.push('qualification behavioral_status differs from scenario results');
  if (payload['security_status'] !== 'DEFERRED') errors.push('security_status must remain DEFERRED without an explicit owner command');
  if (payload['long_running_status'] !== 'DEFERRED') errors.push('long_running_status must remain DEFERRED without an explicit owner command');
  const checks = new Map(objects(payload['checks']).map((check) => [String(check['check_key']), String(check['status'])]));
  if (checks.size !== objects(payload['checks']).length) errors.push('qualification receipt has duplicate check keys');
  const expected = new Map<string, unknown>([
    ['behavioral-conformance', scenarioBehavioral],
    ['language-operation-surface-conformance', languageSurfaceStatus(languageStatuses)],
    ['cross-language-conformance-matrix', languageSurfaceStatus(languageStatuses)],
    ['security-hardening', payload['security_status']],
    ['long-running-tests', payload['long_running_status']],
  ]);
  for (const [key, status] of expected) if (checks.get(key) !== status) errors.push(`${key} check status differs from qualification status`);
  const matrix = documentByKey(corpus, 'conformance-matrix');
  for (const result of languageResults) if (result['status'] === 'PASS' && (
    result['matrix_ref'] !== matrix?.document_ref || result['matrix_revision'] !== (matrix as unknown as Record<string, unknown> | undefined)?.['document_revision'] || matrix?.payload['status'] !== 'PASS'
  )) errors.push(`${String(result['target_key'])}: projection cannot PASS without current complete matrix evidence`);
  if (enforceQualificationGates && payload['structural_status'] === 'PASS' && payload['behavioral_status'] === 'PASS') {
    const plan = documentByKey(corpus, 'validation-plan');
    for (const gate of objects(plan?.payload['gates'])) {
      if (gate['required'] === true && checks.get(String(gate['gate_key'])) !== 'PASS') {
        errors.push(`${String(gate['gate_key'])} required gate has no PASS evidence`);
      }
    }
  }
  const storageImplemented = [...corpus.records.values()].filter((record) =>
    record.kind === 'projection' && (record.record_key === 'relational-contract-projection' || record.record_key === 'sqlite-relational-profile'))
    .every((record) => (record as unknown as Record<string, unknown>)['status'] === 'IMPLEMENTED');
  if (storageImplemented && checks.get('relational-and-sqlite-logical-equivalence') !== 'PASS') {
    errors.push('implemented storage projections require a passing relational-and-sqlite-logical-equivalence check');
  }
  for (const key of failedChecks) {
    if (checks.get(key) === 'PASS') errors.push(`${key} claims PASS despite current validation failures`);
  }
  if (failedChecks.size > 0 && payload['structural_status'] === 'PASS') {
    errors.push('structural_status claims PASS despite current fast validation failures');
  }
};

export const validateCorpus = async (root?: string, options: { enforceQualificationGates?: boolean; replacingQualificationReceipt?: boolean } = {}): Promise<Corpus> => {
  const corpus = await loadCorpus(root);
  const errors: string[] = [];
  const failedChecks = new Set<string>();
  let checkpoint = errors.length;
  validateSchemas(corpus, errors, options.replacingQualificationReceipt);
  if (errors.length > checkpoint) failedChecks.add('schema-validation');
  checkpoint = errors.length;
  validateIdentity(corpus, errors);
  validateReferences(corpus, errors);
  await validateContracts(corpus, errors);
    validateSchemaIndex(corpus, errors);
  validateOperationSurfaces(corpus, errors);
  validateConformanceMatrix(corpus, errors);
  validateFailureAudit(corpus, errors);
  validateCauseExit(corpus, errors);
  validatePublicModuleClosure(corpus, errors);
  validateLocalQualificationClaims(corpus, errors);
  validateRelationalProjection(corpus, errors);
  if (errors.length > checkpoint) failedChecks.add('semantic-validation');
  checkpoint = errors.length;
  validateRegistryAndGraph(corpus, errors);
  if (errors.length > checkpoint) failedChecks.add('graph-validation');
  checkpoint = errors.length;
  validateTraceability(corpus, errors);
  if (errors.length > checkpoint) failedChecks.add('traceability-validation');
  validateStatuses(corpus, failedChecks, errors, options.enforceQualificationGates ?? true, options.replacingQualificationReceipt);
  if (errors.length > 0) fail([...new Set(errors)]);
  return corpus;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const corpus = await validateCorpus(process.argv[2]);
  console.log(`Validated ${corpus.documents.size} documents, ${corpus.entities.size} materialized entities, and ${corpus.schemas.length} schemas.`);
}
