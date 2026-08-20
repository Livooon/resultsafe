import { readFile, readdir } from 'node:fs/promises';
import { basename, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseForESLint, traverseNodes } from 'jsonc-eslint-parser';
import type {
  Allocation,
  CanonicalDocument,
  CatalogRecord,
  Corpus,
  Entity,
  EntityType,
  Scenario,
  SchemaDocument,
} from './model.js';

const UUID_URN_PREFIX = 'urn:uuid:';

export interface DocumentBinding {
  readonly key: string;
  readonly type: string;
  readonly schema: string;
}

const documentBindings: Readonly<Record<string, DocumentBinding>> = {
  'AI-ENTRYPOINT.json': { key: 'ai-entrypoint', type: 'entrypoint', schema: 'urn:uuid:01a01b11-f17f-7ed0-be65-212275e8e7cc' },
  'CONTRACT-IR.json': { key: 'contract-ir', type: 'contract_ir', schema: 'urn:uuid:01a01af6-9804-7a85-b3c7-1b041c22ed4c' },
  'CONTRACTS.json': { key: 'contracts', type: 'contract_catalog', schema: 'urn:uuid:01a01af6-9805-79c4-bf93-527cd90ba66d' },
  'CORE-MODULARITY-POLICY.json': { key: 'core-modularity-policy', type: 'policy', schema: 'urn:uuid:01a01d86-7c24-7a3e-8f7c-a367ff5ffdc8' },
  'COMPATIBILITY-MIGRATIONS.json': { key: 'compatibility-migrations', type: 'compatibility_catalog', schema: 'urn:uuid:01a01b58-c2d2-7f3a-80af-8b61fc9dcaf5' },
  'CAUSE-AUDIT.json': { key: 'cause-audit', type: 'architecture_audit', schema: 'urn:uuid:01a01f0a-da04-7b65-91c4-77b96153b6ab' },
  'CAUSE-EXIT-CONFORMANCE-MATRIX.json': { key: 'cause-exit-conformance-matrix', type: 'cause_exit_conformance_matrix', schema: 'urn:uuid:01a01f0b-0000-7000-8000-000000000001' },
  'CAUSE-MODEL.json': { key: 'cause-model', type: 'cause_model', schema: 'urn:uuid:01a01f0a-da05-7919-b410-d32753e67b0c' },
  'CONFORMANCE-MATRIX.json': { key: 'conformance-matrix', type: 'conformance_matrix', schema: 'urn:uuid:01a01d00-0001-7000-8000-000000000001' },
  'DECISIONS.json': { key: 'decisions', type: 'decision_catalog', schema: 'urn:uuid:01a01af6-9805-79c4-bf93-527cd90ba66d' },
  'FAILURE-AUDIT.json': { key: 'failure-audit', type: 'architecture_audit', schema: 'urn:uuid:01a01d13-0738-7609-880a-f556df4124ea' },
  'FAILURE-MODEL.json': { key: 'failure-model', type: 'failure_model', schema: 'urn:uuid:01a01d13-0738-7414-bd8b-f0b3802a56ab' },
  'EFFECT-COMPATIBILITY.json': { key: 'effect-compatibility', type: 'compatibility_catalog', schema: 'urn:uuid:01a01f0a-da07-7b11-8d9f-0e89386c0772' },
  'EXIT-MODEL.json': { key: 'exit-model', type: 'exit_model', schema: 'urn:uuid:01a01f0a-da06-7930-8f32-7c9e231f3087' },
  'DOCUMENT-GRAPH.json': { key: 'document-graph', type: 'graph', schema: 'urn:uuid:01a01af6-9807-7522-b0e8-557d6f1d7bfd' },
  'DOCUMENT-REGISTRY.json': { key: 'document-registry', type: 'registry', schema: 'urn:uuid:01a01af6-9806-7d4a-ae6a-90728c600f68' },
  'FINDINGS.json': { key: 'findings', type: 'finding_catalog', schema: 'urn:uuid:01a01af6-9805-79c4-bf93-527cd90ba66d' },
  'ID-ALLOCATION-REGISTRY.json': { key: 'id-allocation-registry', type: 'registry', schema: 'urn:uuid:01a01b11-f181-7081-aec1-5d267223c734' },
  'IDENTITY-POLICY.json': { key: 'identity-policy', type: 'policy', schema: 'urn:uuid:01a01b11-f180-7185-a968-f99558a3d809' },
  'INTEGRITY-MANIFEST.json': { key: 'integrity-manifest', type: 'integrity_manifest', schema: 'urn:uuid:01a01af6-980c-7504-bfd0-235440c33890' },
  'OPTIONAL-INTEGRATIONS.json': { key: 'optional-integrations', type: 'optional_integration_catalog', schema: 'urn:uuid:01a01f50-0002-7000-8000-000000000002' },
  'PACKAGE-FAMILIES.json': { key: 'package-families', type: 'package_family_catalog', schema: 'urn:uuid:01a01af6-9805-79c4-bf93-527cd90ba66d' },
  'PROJECTION-CATALOG.json': { key: 'projection-catalog', type: 'projection_catalog', schema: 'urn:uuid:01a01af6-9805-79c4-bf93-527cd90ba66d' },
  'PUBLIC-MODULE-REGISTRY.json': { key: 'public-module-registry', type: 'registry', schema: 'urn:uuid:01a01d86-7c26-7583-97d5-55cd12aaf510' },
  'QUALIFICATION-RECEIPT.json': { key: 'qualification-receipt', type: 'qualification_receipt', schema: 'urn:uuid:01a01af6-980b-7cfc-a859-bd374f6798a7' },
  'RELATIONAL-SCHEMA.json': { key: 'relational-schema', type: 'relational_schema', schema: 'urn:uuid:01a01c00-1000-7000-8000-000000000001' },
  'REMEDIATION-PLAN.json': { key: 'remediation-plan', type: 'execution_plan', schema: 'urn:uuid:01a01d86-7c28-7c7a-b957-1e84d391418b' },
  'REQUIREMENTS.json': { key: 'requirements', type: 'requirement_catalog', schema: 'urn:uuid:01a01af6-9805-79c4-bf93-527cd90ba66d' },
  'RISKS.json': { key: 'risks', type: 'risk_catalog', schema: 'urn:uuid:01a01af6-9805-79c4-bf93-527cd90ba66d' },
  'SCENARIO-CATALOG.json': { key: 'scenario-catalog', type: 'scenario_catalog', schema: 'urn:uuid:01a01af6-980a-7f91-a389-50c21e3b041f' },
  'SCHEMA-INDEX.json': { key: 'schema-index', type: 'schema_index', schema: 'urn:uuid:01a01b11-f184-71d9-8caa-3534afa944ba' },
  'SQLITE-PROFILE.json': { key: 'sqlite-profile', type: 'sqlite_profile', schema: 'urn:uuid:01a01c00-1000-7000-8000-000000000002' },
  'SOURCE-EVIDENCE.json': { key: 'source-evidence', type: 'evidence_catalog', schema: 'urn:uuid:01a01b11-f182-7300-b58a-2ed8b611789c' },
  'STANDARDS-CATALOG.json': { key: 'standards-catalog', type: 'standards_catalog', schema: 'urn:uuid:01a01af6-9805-79c4-bf93-527cd90ba66d' },
  'TRACEABILITY-MATRIX.json': { key: 'traceability-matrix', type: 'traceability', schema: 'urn:uuid:01a01af6-9808-7ece-ac83-2f765ba0b9c3' },
  'VALIDATION-PLAN.json': { key: 'validation-plan', type: 'validation_plan', schema: 'urn:uuid:01a01b11-f183-79da-8834-4e2a3809068e' },
  'WAVE-PLAN.json': { key: 'wave-plan', type: 'execution_plan', schema: 'urn:uuid:01a01c4b-0d17-7d5e-ac7b-c0decf1c517a' },
  'WORK.json': { key: 'resultsafe-core-stabilization-work', type: 'work', schema: 'urn:uuid:01a01af6-9803-7bb0-9bbe-c71dfd3912fb' },
};

const schemaBindings: Readonly<Record<string, { key: string; ref: string }>> = {
  'allocation-registry.schema.json': { key: 'allocation-registry', ref: 'urn:uuid:01a01b11-f181-7081-aec1-5d267223c734' },
  'canonical-document.schema.json': { key: 'canonical-document', ref: 'urn:uuid:01a01af6-9801-778a-89d8-17777b859f3b' },
  'cause-audit.schema.json': { key: 'cause-audit', ref: 'urn:uuid:01a01f0a-da04-7b65-91c4-77b96153b6ab' },
  'cause-exit-conformance-matrix.schema.json': { key: 'cause-exit-conformance-matrix', ref: 'urn:uuid:01a01f0b-0000-7000-8000-000000000001' },
  'cause-model.schema.json': { key: 'cause-model', ref: 'urn:uuid:01a01f0a-da05-7919-b410-d32753e67b0c' },
  'cause.schema.json': { key: 'cause', ref: 'urn:uuid:01a01f0a-da08-7b85-87bc-dea758e0db27' },
  'compatibility-migration.schema.json': { key: 'compatibility-migration', ref: 'urn:uuid:01a01b58-c2d2-7f3a-80af-8b61fc9dcaf5' },
  'conformance-matrix.schema.json': { key: 'conformance-matrix', ref: 'urn:uuid:01a01d00-0001-7000-8000-000000000001' },
  'catalog-record.schema.json': { key: 'catalog-record', ref: 'urn:uuid:01a01af6-9802-7bf2-9750-5cce390d59f0' },
  'catalog.schema.json': { key: 'catalog', ref: 'urn:uuid:01a01af6-9805-79c4-bf93-527cd90ba66d' },
  'contract-ir.schema.json': { key: 'contract-ir', ref: 'urn:uuid:01a01af6-9804-7a85-b3c7-1b041c22ed4c' },
  'core-modularity-policy.schema.json': { key: 'core-modularity-policy', ref: 'urn:uuid:01a01d86-7c24-7a3e-8f7c-a367ff5ffdc8' },
  'document-graph.schema.json': { key: 'document-graph', ref: 'urn:uuid:01a01af6-9807-7522-b0e8-557d6f1d7bfd' },
  'document-registry.schema.json': { key: 'document-registry', ref: 'urn:uuid:01a01af6-9806-7d4a-ae6a-90728c600f68' },
  'entrypoint.schema.json': { key: 'entrypoint', ref: 'urn:uuid:01a01b11-f17f-7ed0-be65-212275e8e7cc' },
  'effect-compatibility.schema.json': { key: 'effect-compatibility', ref: 'urn:uuid:01a01f0a-da07-7b11-8d9f-0e89386c0772' },
  'exit-model.schema.json': { key: 'exit-model', ref: 'urn:uuid:01a01f0a-da06-7930-8f32-7c9e231f3087' },
  'exit.schema.json': { key: 'exit', ref: 'urn:uuid:01a01f0a-da09-7590-9665-b8841a81fe96' },
  'failure-audit.schema.json': { key: 'failure-audit', ref: 'urn:uuid:01a01d13-0738-7609-880a-f556df4124ea' },
  'failure-model.schema.json': { key: 'failure-model', ref: 'urn:uuid:01a01d13-0738-7414-bd8b-f0b3802a56ab' },
  'failure.schema.json': { key: 'failure', ref: 'urn:uuid:01a01d13-3258-7290-918b-58b436a80180' },
  'evidence-catalog.schema.json': { key: 'evidence-catalog', ref: 'urn:uuid:01a01b11-f182-7300-b58a-2ed8b611789c' },
  'identity-policy.schema.json': { key: 'identity-policy', ref: 'urn:uuid:01a01b11-f180-7185-a968-f99558a3d809' },
  'integrity-manifest.schema.json': { key: 'integrity-manifest', ref: 'urn:uuid:01a01af6-980c-7504-bfd0-235440c33890' },
  'optional-integrations.schema.json': { key: 'optional-integrations', ref: 'urn:uuid:01a01f50-0002-7000-8000-000000000002' },
  'qualification.schema.json': { key: 'qualification', ref: 'urn:uuid:01a01af6-980b-7cfc-a859-bd374f6798a7' },
  'public-module-registry.schema.json': { key: 'public-module-registry', ref: 'urn:uuid:01a01d86-7c26-7583-97d5-55cd12aaf510' },
  'reference.schema.json': { key: 'reference', ref: 'urn:uuid:01a01af6-9800-71cc-8102-365165200d36' },
  'relational-schema.schema.json': { key: 'relational-schema', ref: 'urn:uuid:01a01c00-1000-7000-8000-000000000001' },
  'remediation-plan.schema.json': { key: 'remediation-plan', ref: 'urn:uuid:01a01d86-7c28-7c7a-b957-1e84d391418b' },
  'scenario-catalog.schema.json': { key: 'scenario-catalog', ref: 'urn:uuid:01a01af6-980a-7f91-a389-50c21e3b041f' },
  'scenario.schema.json': { key: 'scenario', ref: 'urn:uuid:01a01af6-9809-786e-8c44-eb875991e855' },
  'schema-index.schema.json': { key: 'schema-index', ref: 'urn:uuid:01a01b11-f184-71d9-8caa-3534afa944ba' },
  'sqlite-profile.schema.json': { key: 'sqlite-profile', ref: 'urn:uuid:01a01c00-1000-7000-8000-000000000002' },
  'traceability.schema.json': { key: 'traceability', ref: 'urn:uuid:01a01af6-9808-7ece-ac83-2f765ba0b9c3' },
  'uuidv7.schema.json': { key: 'uuidv7', ref: 'urn:uuid:01a01af6-97ff-7818-8133-9dd18b7e2431' },
  'validation-plan.schema.json': { key: 'validation-plan', ref: 'urn:uuid:01a01b11-f183-79da-8834-4e2a3809068e' },
  'wave-plan.schema.json': { key: 'wave-plan', ref: 'urn:uuid:01a01c4b-0d17-7d5e-ac7b-c0decf1c517a' },
  'work.schema.json': { key: 'work', ref: 'urn:uuid:01a01af6-9803-7bb0-9bbe-c71dfd3912fb' },
};

export const trustedDocumentBindings = documentBindings;

const walkJson = async (directory: string): Promise<string[]> => {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return walkJson(path);
    return entry.isFile() && entry.name.endsWith('.json') ? [path] : [];
  }));
  return nested.flat().sort();
};

const assertNoDuplicateKeys = (source: string, path: string): void => {
  const parsed = parseForESLint(source, { filePath: path });
  traverseNodes(parsed.ast, {
    visitorKeys: parsed.visitorKeys,
    enterNode(node) {
      if (node.type !== 'JSONObjectExpression') return;
      const keys = new Set<string>();
      for (const property of node.properties) {
        const key = property.key.type === 'JSONLiteral' ? String(property.key.value) : property.key.name;
        if (keys.has(key)) throw new Error(`${path}: duplicate JSON key ${JSON.stringify(key)}`);
        keys.add(key);
      }
    },
    leaveNode() {},
  });
};

const parseJson = async (path: string): Promise<Record<string, unknown>> => {
  const source = await readFile(path, 'utf8');
  assertNoDuplicateKeys(source, path);
  return JSON.parse(source) as Record<string, unknown>;
};

const objects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];

const requiredString = (value: Record<string, unknown>, field: string, location: string): string => {
  const result = value[field];
  if (typeof result !== 'string' || result.length === 0) throw new Error(`${location}: missing ${field}`);
  return result;
};

export const loadCorpus = async (inputRoot?: string): Promise<Corpus> => {
  const defaultRoot = fileURLToPath(new URL('../../../platform/staging/resultsafe-core-v001/', import.meta.url));
  const root = resolve(inputRoot ?? defaultRoot);
  const documents = new Map<string, CanonicalDocument>();
  const records = new Map<string, CatalogRecord>();
  const scenarios = new Map<string, Scenario>();
  const entities = new Map<string, Entity>();
  const entityKeys = new Map<string, Entity>();
  const codes = new Map<string, Entity>();
  const schemas: SchemaDocument[] = [];

  const addEntity = (entity: Entity): void => {
    const duplicateId = entities.get(entity.id);
    if (duplicateId) throw new Error(`${entity.source_path}: duplicate global ID ${entity.id} (${duplicateId.type} and ${entity.type})`);
    const duplicateKey = entityKeys.get(entity.key);
    if (duplicateKey) throw new Error(`${entity.source_path}: duplicate global key ${entity.key} (${duplicateKey.type} and ${entity.type})`);
    if (entity.code) {
      const duplicateCode = codes.get(entity.code);
      if (duplicateCode) throw new Error(`${entity.source_path}: duplicate global code ${entity.code}`);
      codes.set(entity.code, entity);
    }
    entities.set(entity.id, entity);
    entityKeys.set(entity.key, entity);
  };

  for (const path of await walkJson(root)) {
    const value = await parseJson(path);
    const sourcePath = relative(root, path).split(sep).join('/');
    if (sourcePath.startsWith('schemas/')) {
      const binding = schemaBindings[basename(path)];
      if (!binding) throw new Error(`${sourcePath}: untrusted schema filename`);
      if (value['$id'] !== binding.ref) throw new Error(`${sourcePath}: $id does not match trusted schema binding ${binding.ref}`);
      schemas.push({ key: binding.key, ref: binding.ref, path: sourcePath, value });
      continue;
    }

    const binding = documentBindings[sourcePath];
    if (!binding) throw new Error(`${sourcePath}: untrusted canonical document filename`);
    if (value['document_key'] !== binding.key || value['document_type'] !== binding.type || value['schema_ref'] !== binding.schema) {
      throw new Error(`${sourcePath}: document key/type/schema do not match trusted filename binding`);
    }
    if (typeof value['document_id'] !== 'string') throw new Error(`${sourcePath}: missing document_id`);
    const document = { ...value, source_path: sourcePath } as unknown as CanonicalDocument;
    documents.set(document.document_id, document);
    addEntity({ id: document.document_id, ref: document.document_ref, key: document.document_key, type: 'document', value, source_path: sourcePath });

    for (const item of objects(document.payload['items'])) {
      const record = item as unknown as CatalogRecord;
      records.set(record.record_id, record);
      addEntity({
        id: record.record_id,
        ref: record.record_ref,
        key: record.record_key,
        type: record.kind,
        ...(record.code ? { code: record.code } : {}),
        value: item,
        source_path: sourcePath,
      });
    }
    for (const item of objects(document.payload['records'])) {
      const record = item as unknown as CatalogRecord;
      records.set(record.record_id, record);
      addEntity({
        id: record.record_id,
        ref: record.record_ref,
        key: record.record_key,
        type: record.kind,
        ...(record.code ? { code: record.code } : {}),
        value: item,
        source_path: sourcePath,
      });
    }
    for (const item of objects(document.payload['scenarios'])) {
      const scenario = item as unknown as Scenario;
      scenarios.set(scenario.scenario_id, scenario);
      addEntity({ id: scenario.scenario_id, ref: scenario.scenario_ref, key: scenario.scenario_key, type: 'scenario', value: item, source_path: sourcePath });
    }
    for (const item of objects(document.payload['evidence'])) {
      addEntity({ id: String(item['evidence_id']), ref: String(item['evidence_ref']), key: String(item['evidence_key']), type: 'evidence', value: item, source_path: sourcePath });
    }
    for (const integration of objects(document.payload['packages'])) {
      const integrationKey = requiredString(integration, 'integration_key', sourcePath);
      addEntity({
        id: requiredString(integration, 'integration_id', `${sourcePath}:${integrationKey}`),
        ref: requiredString(integration, 'integration_ref', `${sourcePath}:${integrationKey}`),
        key: integrationKey,
        type: 'integration',
        value: integration,
        source_path: sourcePath,
      });
      for (const evidence of objects(integration['evidence'])) {
        const evidenceKey = requiredString(evidence, 'evidence_key', `${sourcePath}:${integrationKey}`);
        addEntity({
          id: requiredString(evidence, 'evidence_id', `${sourcePath}:${evidenceKey}`),
          ref: requiredString(evidence, 'evidence_ref', `${sourcePath}:${evidenceKey}`),
          key: evidenceKey,
          type: 'evidence',
          value: evidence,
          source_path: sourcePath,
        });
      }
    }
    for (const item of objects(document.payload['tasks'])) {
      addEntity({ id: String(item['task_id']), ref: `${UUID_URN_PREFIX}${String(item['task_id'])}`, key: `task/${String(item['task_key'])}`, type: 'task', value: item, source_path: sourcePath });
    }
    if (typeof document.payload['work_id'] === 'string') {
      addEntity({ id: document.payload['work_id'], ref: String(document.payload['work_ref']), key: String(document.payload['work_key']), type: 'work', value: document.payload, source_path: sourcePath });
      for (const step of objects(document.payload['steps'])) {
        addEntity({ id: String(step['step_id']), ref: `${UUID_URN_PREFIX}${String(step['step_id'])}`, key: String(step['step_key']), type: 'step', value: step, source_path: sourcePath });
      }
    }
    if (typeof document.payload['validation_run_id'] === 'string') {
      addEntity({ id: document.payload['validation_run_id'], ref: String(document.payload['validation_run_ref']), key: `validation-run/${document.payload['validation_run_id']}`, type: 'validation_run', value: document.payload, source_path: sourcePath });
    }
  }

  if (schemas.length !== Object.keys(schemaBindings).length) throw new Error(`trusted schema set is incomplete: expected ${Object.keys(schemaBindings).length}, found ${schemas.length}`);
  if (documents.size !== Object.keys(documentBindings).length) throw new Error(`trusted document set is incomplete: expected ${Object.keys(documentBindings).length}, found ${documents.size}`);

  const allocationDocument = [...documents.values()].find((item) => item.document_key === 'id-allocation-registry');
  const allocations: Allocation[] = objects(allocationDocument?.payload['allocations']).map((item) => ({
    key: String(item['allocation_key']),
    entityId: String(item['entity_id']),
  }));
  const allocationKeys = new Set<string>();
  const allocationIds = new Set<string>();
  for (const allocation of allocations) {
    if (allocationKeys.has(allocation.key)) throw new Error(`duplicate allocation key ${allocation.key}`);
    if (allocationIds.has(allocation.entityId)) throw new Error(`duplicate allocated entity ID ${allocation.entityId}`);
    allocationKeys.add(allocation.key);
    allocationIds.add(allocation.entityId);
  }

  return { root, documents, schemas, records, scenarios, entities, allocations };
};

export const idFromRef = (ref: string): string | undefined =>
  ref.startsWith(UUID_URN_PREFIX) ? ref.slice(UUID_URN_PREFIX.length) : undefined;
