import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { canonicalize } from 'json-canonicalize';
import { idFromRef } from '../../contract-registry/src/load.js';
import type { CanonicalDocument, Corpus, Entity } from '../../contract-registry/src/model.js';
import { validateCorpus } from '../../contract-registry/src/validate.js';

export const APPLICATION_ID = 1_381_192_787;
export const USER_VERSION = 1;

export interface SqliteProjectionOptions {
  readonly profiles?: readonly string[];
  readonly replacingQualificationReceipt?: boolean;
}

interface SqliteProfile {
  readonly application_id: number;
  readonly user_version: number;
  readonly ddl: readonly string[];
  readonly profiles: readonly string[];
}

interface ProfileDescriptor {
  readonly profile_key: string;
  readonly user_version: number;
  readonly requires_profiles: readonly string[];
}

const profileDescriptors = (payload: Record<string, unknown>): ProfileDescriptor[] => objects(payload['optional_profiles']).map((profile) => ({
  profile_key: String(profile['profile_key']),
  user_version: Number(profile['user_version']),
  requires_profiles: Array.isArray(profile['requires_profiles']) ? profile['requires_profiles'].map(String) : [],
}));

export const resolveProfileSelection = (payload: Record<string, unknown>, requested: readonly string[]): { profiles: string[]; userVersion: number } => {
  const available = new Map(profileDescriptors(payload).map((profile) => [profile.profile_key, profile]));
  for (const key of requested) if (!available.has(key)) throw new Error(`Unknown SQLite optional profile: ${key}.`);
  const profiles = new Set(requested);
  const visiting = new Set<string>();
  const include = (key: string): void => {
    if (visiting.has(key)) throw new Error(`Cyclic SQLite optional profile dependency at ${key}.`);
    const profile = available.get(key);
    if (!profile) throw new Error(`Missing SQLite optional profile dependency: ${key}.`);
    visiting.add(key);
    for (const dependency of profile.requires_profiles) {
      profiles.add(dependency);
      include(dependency);
    }
    visiting.delete(key);
  };
  [...profiles].forEach(include);
  const selected = [...profiles].map((key) => available.get(key) as ProfileDescriptor);
  return { profiles: [...profiles].sort(), userVersion: selected.length === 0 ? Number(payload['user_version']) : Math.max(...selected.map(({ user_version: version }) => version)) };
};

export interface QualificationResult {
  readonly documents: number;
  readonly schemas: number;
  readonly entities: number;
  readonly scenarios: number;
  readonly tables: number;
  readonly sqliteVersion: string;
  readonly dumpSha256: string;
  readonly constraintTests: readonly string[];
  readonly metadataRelations: number;
  readonly runtimeConstraints: number;
}

const objects = (value: unknown): Record<string, unknown>[] =>
  Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];

const documentByKey = (corpus: Corpus, key: string): CanonicalDocument => {
  const document = [...corpus.documents.values()].find((item) => item.document_key === key);
  if (!document) throw new Error(`Missing canonical document ${key}.`);
  return document;
};

const requiredId = (ref: string, context: string): string => {
  const id = idFromRef(ref);
  if (!id) throw new Error(`${context} is not a UUID URN: ${ref}`);
  return id;
};

const profileFrom = (corpus: Corpus, options: SqliteProjectionOptions = {}): SqliteProfile => {
  const payload = documentByKey(corpus, 'sqlite-profile').payload;
  const requested = options.profiles ?? [];
  if (new Set(requested).size !== requested.length) throw new Error('SQLite optional profiles must not contain duplicates.');
  const available = new Map(objects(payload['optional_profiles']).map((profile) => [String(profile['profile_key']), profile]));
  for (const key of requested) if (!available.has(key)) throw new Error(`Unknown SQLite optional profile: ${key}.`);
  const selection = resolveProfileSelection(payload, requested);
  const selected = selection.profiles.map((key) => available.get(key) as Record<string, unknown>);
  const profile = {
    application_id: Number(payload['application_id']),
    user_version: selection.userVersion,
    ddl: [
      ...(Array.isArray(payload['ddl']) ? payload['ddl'].map(String) : []),
      ...selected.flatMap((item) => Array.isArray(item['ddl']) ? item['ddl'].map(String) : []),
    ],
    profiles: selection.profiles,
  };
  if (profile.application_id !== APPLICATION_ID || (selected.length === 0 && profile.user_version !== USER_VERSION) || profile.ddl.length === 0) {
    throw new Error('SQLite profile metadata does not match compiler constants.');
  }
  return profile;
};

const transaction = (database: DatabaseSync, action: () => void): void => {
  database.exec('BEGIN IMMEDIATE');
  try {
    action();
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
};

const addEntityReferences = (database: DatabaseSync, corpus: Corpus, entity: Entity): void => {
  const insert = database.prepare('INSERT OR IGNORE INTO entity_reference VALUES (?, ?, ?)');
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (typeof value !== 'object' || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      const values = key.endsWith('_ref') && typeof child === 'string'
        ? [child]
        : key.endsWith('_refs') && Array.isArray(child)
          ? child.filter((item): item is string => typeof item === 'string')
          : [];
      values.forEach((ref, index) => {
        const targetId = idFromRef(ref);
        if (targetId && corpus.entities.has(targetId)) insert.run(entity.id, `${path}.${key}${values.length > 1 ? `[${index}]` : ''}`, targetId);
      });
      visit(child, `${path}.${key}`);
    }
  };
  visit(entity.value, '$');
};

export const buildDatabase = (corpus: Corpus, databasePath: string, options: SqliteProjectionOptions = {}): void => {
  const profile = profileFrom(corpus, options);
  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA foreign_keys = ON');
    requireSQLiteVersion(database);
    database.exec(`PRAGMA application_id = ${profile.application_id}`);
    database.exec(`PRAGMA user_version = ${profile.user_version}`);
    profile.ddl.forEach((statement) => database.exec(statement));
    transaction(database, () => {
      const corpusDigest = createHash('sha256')
        .update(canonicalize({
          documents: [...corpus.documents.values()].map(({ source_path: _path, ...value }) => value),
          schemas: corpus.schemas.map((schema) => schema.value),
        }))
        .digest('hex');
      const metadata = database.prepare('INSERT INTO projection_metadata VALUES (?, ?)');
      metadata.run('authority', 'canonical-json');
      metadata.run('compiler', '@resultsafe/sqlite-projection-tool@0.1.0');
      metadata.run('corpus_sha256', corpusDigest);
      metadata.run('identity_allocation', 'prohibited');
      metadata.run('profile_version', String(profile.user_version));
      metadata.run('optional_profiles', JSON.stringify(profile.profiles));
      metadata.run('reverse_projection', 'prohibited');

      const schemaInsert = database.prepare('INSERT INTO schema_document VALUES (?, ?, ?, ?)');
      corpus.schemas.forEach((schema) => schemaInsert.run(schema.ref, schema.key, schema.path, canonicalize(schema.value)));

      const documentInsert = database.prepare('INSERT INTO canonical_document VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const document of corpus.documents.values()) {
        const { source_path: sourcePath, ...value } = document;
        const revision = Number((value as unknown as Record<string, unknown>)['document_revision']);
        documentInsert.run(document.document_id, document.document_ref, document.document_key, document.document_type,
          document.schema_ref, sourcePath, revision, canonicalize(value));
      }

      const sourceDocumentIds = new Map([...corpus.documents.values()].map((document) => [document.source_path, document.document_id]));
      const entityInsert = database.prepare('INSERT INTO entity VALUES (?, ?, ?, ?, ?, ?, ?)');
      for (const entity of corpus.entities.values()) {
        const sourceDocumentId = sourceDocumentIds.get(entity.source_path);
        if (!sourceDocumentId) throw new Error(`No owning document for ${entity.key}.`);
        entityInsert.run(entity.id, entity.ref, entity.key, entity.type, sourceDocumentId, entity.code ?? null, canonicalize(entity.value));
      }

      const recordInsert = database.prepare('INSERT INTO catalog_record VALUES (?, ?, ?, ?)');
      for (const record of corpus.records.values()) {
        recordInsert.run(record.record_id, record.kind, String((record as unknown as Record<string, unknown>)['status']),
          Number((record as unknown as Record<string, unknown>)['record_revision']));
      }
      for (const entity of corpus.entities.values()) addEntityReferences(database, corpus, entity);

      const graphInsert = database.prepare('INSERT INTO document_graph_edge VALUES (?, ?, ?)');
      for (const edge of objects(documentByKey(corpus, 'document-graph').payload['edges'])) {
        graphInsert.run(requiredId(String(edge['source_ref']), 'graph source'), String(edge['relation']), requiredId(String(edge['target_ref']), 'graph target'));
      }
      const traceInsert = database.prepare('INSERT INTO trace_link VALUES (?, ?, ?)');
      for (const link of objects(documentByKey(corpus, 'traceability-matrix').payload['links'])) {
        traceInsert.run(requiredId(String(link['source_ref']), 'trace source'), String(link['relation']), requiredId(String(link['target_ref']), 'trace target'));
      }

      const scenarioInsert = database.prepare('INSERT INTO scenario VALUES (?, ?, ?, ?, ?, ?)');
      const requirementInsert = database.prepare('INSERT INTO scenario_requirement VALUES (?, ?)');
      const assertionInsert = database.prepare('INSERT INTO scenario_assertion VALUES (?, ?, ?, ?, ?)');
      for (const scenario of corpus.scenarios.values()) {
        scenarioInsert.run(scenario.scenario_id, scenario.code, scenario.status, scenario.category,
          requiredId(scenario.subject_ref, 'scenario subject'), scenario.execution.kind);
        scenario.requirement_refs.forEach((ref) => requirementInsert.run(scenario.scenario_id, requiredId(ref, 'scenario requirement')));
        scenario.assertions.forEach((assertion, index) => assertionInsert.run(
          scenario.scenario_id, index, assertion.operator, assertion.actual ?? null, assertion.expected ?? null,
        ));
      }
      const allocationInsert = database.prepare('INSERT INTO allocation VALUES (?, ?)');
      corpus.allocations.forEach((allocation) => allocationInsert.run(allocation.key, allocation.entityId));

      const work = [...corpus.entities.values()].find((entity) => entity.type === 'work');
      if (!work) throw new Error('Materialized work entity is absent.');
      const stepInsert = database.prepare('INSERT INTO work_step VALUES (?, ?, ?, ?)');
      for (const step of objects(work.value['steps'])) {
        stepInsert.run(String(step['step_id']), work.id, Number(step['position']), String(step['state']));
      }
    });
  } finally {
    database.close();
  }
};

const scalar = (database: DatabaseSync, sql: string): string | number => {
  const row = database.prepare(sql).get() as Record<string, string | number> | undefined;
  if (!row) throw new Error(`Query returned no row: ${sql}`);
  const value = Object.values(row)[0];
  if (value === undefined) throw new Error(`Query returned no value: ${sql}`);
  return value;
};

interface RelationalColumn {
  readonly name: string;
  readonly type: 'STRING' | 'INTEGER' | 'BOOLEAN' | 'JSON';
  readonly nullable: boolean;
}

interface RelationalForeignKey {
  readonly columns: readonly string[];
  readonly target_relation: string;
  readonly target_columns: readonly string[];
  readonly on_delete: 'RESTRICT' | 'CASCADE';
}

interface RelationalRelation {
  readonly name: string;
  readonly columns: readonly RelationalColumn[];
  readonly primary_key: readonly string[];
  readonly foreign_keys: readonly RelationalForeignKey[];
  readonly checks: readonly string[];
}

export interface MetadataVerification {
  readonly relations: number;
  readonly runtimeConstraints: number;
}

const canonicalPayload = (database: DatabaseSync, documentKey: string): Record<string, unknown> => {
  const row = database.prepare('SELECT canonical_json FROM canonical_document WHERE document_key = ?').get(documentKey) as { canonical_json: string } | undefined;
  if (!row) throw new Error(`Projection is missing canonical document ${documentKey}.`);
  const document = JSON.parse(row.canonical_json) as Record<string, unknown>;
  const payload = document['payload'];
  if (typeof payload !== 'object' || payload === null) throw new Error(`Canonical document ${documentKey} has no object payload.`);
  return payload as Record<string, unknown>;
};

const relationsFor = (payload: Record<string, unknown>, selectedProfiles: readonly string[]): RelationalRelation[] => {
  const relations = [...objects(payload['relations'])];
  const profiles = new Map(objects(payload['optional_profiles']).map((profile) => [String(profile['profile_key']), profile]));
  for (const key of selectedProfiles) {
    const profile = profiles.get(key);
    if (!profile) throw new Error(`Relational schema is missing selected profile ${key}.`);
    relations.push(...objects(profile['relations']));
  }
  return relations as unknown as RelationalRelation[];
};

const sqliteTypeFor = (type: RelationalColumn['type']): string => type === 'INTEGER' || type === 'BOOLEAN' ? 'INTEGER' : 'TEXT';

export const verifyRelationalMetadata = (database: DatabaseSync, relationalPayload: Record<string, unknown>, selectedProfiles: readonly string[]): MetadataVerification => {
  const relations = relationsFor(relationalPayload, selectedProfiles);
  const expectedNames = relations.map(({ name }) => name).sort();
  const physicalNames = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(({ name }) => name);
  if (JSON.stringify(physicalNames) !== JSON.stringify(expectedNames)) throw new Error('Relational and SQLite table coverage differs.');

  let runtimeConstraints = 0;
  for (const relation of relations) {
    if (!/^[a-z_]+$/.test(relation.name)) throw new Error(`Unsafe relation name ${relation.name}.`);
    const columns = database.prepare(`PRAGMA table_xinfo("${relation.name}")`).all() as { name: string; type: string; notnull: number; pk: number; hidden: number }[];
    const visible = columns.filter(({ hidden }) => hidden === 0);
    if (visible.length !== relation.columns.length) throw new Error(`Column coverage differs for ${relation.name}.`);
    relation.columns.forEach((expected, index) => {
      const actual = visible[index];
      if (!actual || actual.name !== expected.name || actual.type.toUpperCase() !== sqliteTypeFor(expected.type) || Boolean(actual.notnull) !== !expected.nullable) {
        throw new Error(`Column metadata differs for ${relation.name}.${expected.name}.`);
      }
    });
    const primaryKey = visible.filter(({ pk }) => pk > 0).sort((left, right) => left.pk - right.pk).map(({ name }) => name);
    if (JSON.stringify(primaryKey) !== JSON.stringify(relation.primary_key)) throw new Error(`Primary key metadata differs for ${relation.name}.`);

    const foreignKeyRows = database.prepare(`PRAGMA foreign_key_list("${relation.name}")`).all() as { id: number; seq: number; table: string; from: string; to: string; on_delete: string }[];
    const grouped = new Map<number, typeof foreignKeyRows>();
    for (const row of foreignKeyRows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row]);
    const actualForeignKeys = [...grouped.values()].map((rows) => {
      const ordered = [...rows].sort((left, right) => left.seq - right.seq);
      return {
        columns: ordered.map((row) => row.from),
        target_relation: ordered[0]?.table,
        target_columns: ordered.map((row) => row.to),
        on_delete: ordered[0]?.on_delete === 'NO ACTION' ? 'RESTRICT' : ordered[0]?.on_delete,
      };
    });
    const normalize = (value: unknown): string => canonicalize(value);
    if (actualForeignKeys.map(normalize).sort().join('\n') !== relation.foreign_keys.map(normalize).sort().join('\n')) {
      throw new Error(`Foreign key metadata differs for ${relation.name}.`);
    }
    // Logical checks are prose requirements. Their enforcement is qualified behaviorally, not inferred from DDL text.
    runtimeConstraints += relation.checks.length;
  }
  for (const key of selectedProfiles) {
    const profile = objects(relationalPayload['optional_profiles']).find((item) => item['profile_key'] === key);
    runtimeConstraints += Array.isArray(profile?.['runtime_constraints']) ? profile['runtime_constraints'].length : 0;
  }
  return { relations: relations.length, runtimeConstraints };
};

const requireSQLiteVersion = (database: DatabaseSync): string => {
  const sqliteVersion = String(scalar(database, 'SELECT sqlite_version()'));
  const parts = sqliteVersion.split('.').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isInteger(part)) || (parts[0] as number) * 1_000_000 + (parts[1] as number) * 1_000 + (parts[2] as number) < 3_045_000) {
    throw new Error(`SQLite >=3.45.0 is required; found ${sqliteVersion}.`);
  }
  return sqliteVersion;
};

export const logicalDump = (databasePath: string): string => {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const tables = (database.prepare("SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[])
      .map((row) => row.name);
    const lines: string[] = [];
    for (const table of tables) {
      if (!/^[a-z_]+$/.test(table)) throw new Error(`Unsafe table name ${table}.`);
      const columns = (database.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name);
      const order = columns.map((column) => `"${column}"`).join(', ');
      const rows = database.prepare(`SELECT * FROM "${table}" ORDER BY ${order}`).all() as Record<string, unknown>[];
      lines.push(canonicalize({ table, columns, rows }));
    }
    return `${lines.join('\n')}\n`;
  } finally {
    database.close();
  }
};

const expectFailure = (label: string, action: () => void): string => {
  try {
    action();
  } catch {
    return label;
  }
  throw new Error(`${label} unexpectedly succeeded.`);
};

interface CauseNodeRow {
  cause_id: string;
  node_id: string;
  kind: string;
  error_codec: string | null;
  error_schema_ref: string | null;
  error_json: string | null;
  failure_id: string | null;
}

export const assertCauseResourceLimits = (nodeCount: number, edgeDepth: number, causeId = 'fixture'): void => {
  if (nodeCount > 1024) throw new Error(`Cause ${causeId} exceeds 1024 nodes.`);
  if (edgeDepth > 32) throw new Error(`Cause ${causeId} exceeds edge depth 32.`);
};

export const verifyCauseExitStorage = (database: DatabaseSync): void => {
  const causes = database.prepare('SELECT cause_id, root_node_id FROM cause_record ORDER BY cause_id').all() as { cause_id: string; root_node_id: string }[];
  const nodes = database.prepare('SELECT * FROM cause_node ORDER BY cause_id, node_id').all() as unknown as CauseNodeRow[];
  const edges = database.prepare('SELECT cause_id, parent_node_id, position, child_node_id FROM cause_edge ORDER BY cause_id, parent_node_id, position').all() as { cause_id: string; parent_node_id: string; position: string; child_node_id: string }[];
  const validCauseIds = new Set(causes.map(({ cause_id: causeId }) => causeId));

  for (const cause of causes) {
    const ownedNodes = nodes.filter((node) => node.cause_id === cause.cause_id);
    assertCauseResourceLimits(ownedNodes.length, 0, cause.cause_id);
    const byId = new Map(ownedNodes.map((node) => [node.node_id, node]));
    if (!byId.has(cause.root_node_id)) throw new Error(`Cause ${cause.cause_id} has no owned root node.`);
    const ownedEdges = edges.filter((edge) => edge.cause_id === cause.cause_id);
    if (ownedEdges.some((edge) => edge.child_node_id === cause.root_node_id)) throw new Error(`Cause ${cause.cause_id} root has an incoming edge.`);
    const children = new Map<string, Map<string, string>>();
    for (const edge of ownedEdges) {
      const positioned = children.get(edge.parent_node_id) ?? new Map<string, string>();
      positioned.set(edge.position, edge.child_node_id);
      children.set(edge.parent_node_id, positioned);
    }
    const visited = new Set<string>();
    const active = new Set<string>();
    const visit = (nodeId: string, depth: number): void => {
      assertCauseResourceLimits(ownedNodes.length, depth, cause.cause_id);
      if (active.has(nodeId)) throw new Error(`Cause ${cause.cause_id} contains a cycle.`);
      if (visited.has(nodeId)) throw new Error(`Cause ${cause.cause_id} contains a multiply referenced node.`);
      const node = byId.get(nodeId);
      if (!node) throw new Error(`Cause ${cause.cause_id} references missing node ${nodeId}.`);
      const positioned = children.get(nodeId) ?? new Map<string, string>();
      const composite = node.kind === 'Sequential' || node.kind === 'Parallel';
      if (composite && (positioned.size !== 2 || !positioned.has('LEFT') || !positioned.has('RIGHT'))) {
        throw new Error(`Cause ${cause.cause_id} node ${nodeId} has malformed binary arity.`);
      }
      if (!composite && positioned.size !== 0) throw new Error(`Cause ${cause.cause_id} leaf ${nodeId} has children.`);
      const failPayload = node.error_codec !== null && node.error_schema_ref !== null && node.error_json !== null && node.failure_id === null;
      const failurePayload = node.failure_id !== null && node.error_codec === null && node.error_schema_ref === null && node.error_json === null;
      const emptyPayload = node.failure_id === null && node.error_codec === null && node.error_schema_ref === null && node.error_json === null;
      if ((node.kind === 'Fail' && !failPayload) || (['Die', 'Interrupt'].includes(node.kind) && !failurePayload) || (!['Fail', 'Die', 'Interrupt'].includes(node.kind) && !emptyPayload)) {
        throw new Error(`Cause ${cause.cause_id} node ${nodeId} has invalid kind payload.`);
      }
      active.add(nodeId);
      if (composite) {
        visit(positioned.get('LEFT') as string, depth + 1);
        visit(positioned.get('RIGHT') as string, depth + 1);
      }
      active.delete(nodeId);
      visited.add(nodeId);
    };
    visit(cause.root_node_id, 0);
    if (visited.size !== ownedNodes.length) throw new Error(`Cause ${cause.cause_id} contains unreachable nodes.`);
  }

  const exits = database.prepare('SELECT * FROM exit_record ORDER BY exit_id').all() as unknown as { exit_id: string; kind: string; cause_id: string | null; value_codec: string | null; value_schema_ref: string | null; value_json: string | null }[];
  for (const exit of exits) {
    const success = exit.kind === 'Success' && exit.cause_id === null && exit.value_codec !== null && exit.value_schema_ref !== null && exit.value_json !== null;
    const failure = exit.kind === 'Failure' && exit.cause_id !== null && validCauseIds.has(exit.cause_id) && exit.value_codec === null && exit.value_schema_ref === null && exit.value_json === null;
    if (!success && !failure) throw new Error(`Exit ${exit.exit_id} has invalid branch payload.`);
  }
};

const verifyFailureCauseCycles = (database: DatabaseSync): void => {
  const edges = database.prepare('SELECT failure_id, cause_failure_id FROM failure_cause ORDER BY failure_id, cause_position').all() as { failure_id: string; cause_failure_id: string }[];
  const children = new Map<string, string[]>();
  for (const edge of edges) children.set(edge.failure_id, [...(children.get(edge.failure_id) ?? []), edge.cause_failure_id]);
  const complete = new Set<string>();
  const active = new Set<string>();
  const visit = (failureId: string): void => {
    if (active.has(failureId)) throw new Error(`Structured Failure cause cycle at ${failureId}.`);
    if (complete.has(failureId)) return;
    active.add(failureId);
    for (const child of children.get(failureId) ?? []) visit(child);
    active.delete(failureId);
    complete.add(failureId);
  };
  for (const failureId of children.keys()) visit(failureId);
};

interface FixtureCodec {
  readonly codec_identifier: string;
  readonly codec_version: number;
  readonly json_schema_ref: string;
  readonly scope: string;
}

const fixtureCodecFrom = (sqlitePayload: Record<string, unknown>): FixtureCodec => {
  const fixture = sqlitePayload['qualification_fixture'];
  if (typeof fixture !== 'object' || fixture === null) throw new Error('SQLite profile has no qualification fixture codec.');
  const codec = fixture as Record<string, unknown>;
  const result = {
    codec_identifier: String(codec['codec_identifier']),
    codec_version: Number(codec['codec_version']),
    json_schema_ref: String(codec['json_schema_ref']),
    scope: String(codec['scope']),
  };
  if (!result.codec_identifier || result.codec_version !== 1 || !result.json_schema_ref || result.scope !== 'TEST_FIXTURE_ONLY') {
    throw new Error('SQLite qualification fixture codec metadata is invalid.');
  }
  return result;
};

const fixtureCodecId = (fixture: FixtureCodec): string => `${fixture.codec_identifier}@${fixture.codec_version}`;

const populateOperationalFixture = (database: DatabaseSync, fixture: FixtureCodec): void => {
  const failureInsert = database.prepare('INSERT INTO failure_record VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  failureInsert.run('fixture-failure-root', '1.0.0', 'urn:resultsafe:fixture:root', 'root', 'fixture.root', canonicalize({ count: 2 }), canonicalize({ operation: 'qualification' }), canonicalize({ severity: 'ERROR' }), canonicalize({ trace: 'fixture' }), canonicalize({ fixture: true }));
  failureInsert.run('fixture-failure-a', '1.0.0', 'urn:resultsafe:fixture:a', 'cause a', null, null, null, null, null, null);
  failureInsert.run('fixture-failure-b', '1.0.0', 'urn:resultsafe:fixture:b', 'cause b', null, null, null, null, null, null);
  database.prepare('INSERT INTO failure_cause VALUES (?, ?, ?)').run('fixture-failure-root', 0, 'fixture-failure-a');
  database.prepare('INSERT INTO failure_cause VALUES (?, ?, ?)').run('fixture-failure-root', 1, 'fixture-failure-b');

  const causeInsert = database.prepare('INSERT INTO cause_record VALUES (?, ?)');
  const nodeInsert = database.prepare('INSERT INTO cause_node VALUES (?, ?, ?, ?, ?, ?, ?)');
  const edgeInsert = database.prepare('INSERT INTO cause_edge VALUES (?, ?, ?, ?)');
  causeInsert.run('fixture-cause-all', 'parallel');
  nodeInsert.run('fixture-cause-all', 'parallel', 'Parallel', null, null, null, null);
  nodeInsert.run('fixture-cause-all', 'sequential-left', 'Sequential', null, null, null, null);
  nodeInsert.run('fixture-cause-all', 'fail', 'Fail', fixtureCodecId(fixture), fixture.json_schema_ref, canonicalize({ error: 'typed fixture' }), null);
  nodeInsert.run('fixture-cause-all', 'die', 'Die', null, null, null, 'fixture-failure-a');
  nodeInsert.run('fixture-cause-all', 'sequential-right', 'Sequential', null, null, null, null);
  nodeInsert.run('fixture-cause-all', 'interrupt', 'Interrupt', null, null, null, 'fixture-failure-b');
  nodeInsert.run('fixture-cause-all', 'empty', 'Empty', null, null, null, null);
  for (const edge of [
    ['parallel', 'LEFT', 'sequential-left'], ['parallel', 'RIGHT', 'sequential-right'],
    ['sequential-left', 'LEFT', 'fail'], ['sequential-left', 'RIGHT', 'die'],
    ['sequential-right', 'LEFT', 'interrupt'], ['sequential-right', 'RIGHT', 'empty'],
  ] as const) edgeInsert.run('fixture-cause-all', ...edge);
  causeInsert.run('fixture-cause-empty', 'empty');
  nodeInsert.run('fixture-cause-empty', 'empty', 'Empty', null, null, null, null);

  const exitInsert = database.prepare('INSERT INTO exit_record VALUES (?, ?, ?, ?, ?, ?)');
  exitInsert.run('fixture-exit-success', 'Success', null, fixtureCodecId(fixture), fixture.json_schema_ref, canonicalize({ value: 42 }));
  exitInsert.run('fixture-exit-failure', 'Failure', 'fixture-cause-all', null, null, null);
  exitInsert.run('fixture-exit-failure-empty', 'Failure', 'fixture-cause-empty', null, null, null);
};

const verifyOperationalFixtureReadback = (database: DatabaseSync, fixture: FixtureCodec): void => {
  verifyFailureCauseCycles(database);
  verifyCauseExitStorage(database);
  const failure = database.prepare("SELECT * FROM failure_record WHERE failure_id = 'fixture-failure-root'").get() as Record<string, string | null>;
  assertEqual(canonicalize({
    schema_version: failure['schema_version'], code: failure['code'], message: failure['message'], message_key: failure['message_key'],
    message_args: JSON.parse(failure['message_args_json'] as string), details: JSON.parse(failure['details_json'] as string),
    classification: JSON.parse(failure['classification_json'] as string), metadata: JSON.parse(failure['metadata_json'] as string), extensions: JSON.parse(failure['extensions_json'] as string),
    causes: database.prepare("SELECT child.failure_id, child.code, child.message FROM failure_cause edge JOIN failure_record child ON child.failure_id = edge.cause_failure_id WHERE edge.failure_id = 'fixture-failure-root' ORDER BY edge.cause_position").all(),
  }), canonicalize({ schema_version: '1.0.0', code: 'urn:resultsafe:fixture:root', message: 'root', message_key: 'fixture.root', message_args: { count: 2 }, details: { operation: 'qualification' }, classification: { severity: 'ERROR' }, metadata: { trace: 'fixture' }, extensions: { fixture: true }, causes: [{ failure_id: 'fixture-failure-a', code: 'urn:resultsafe:fixture:a', message: 'cause a' }, { failure_id: 'fixture-failure-b', code: 'urn:resultsafe:fixture:b', message: 'cause b' }] }), 'Failure fixture semantic readback differs.');

  const nodes = database.prepare("SELECT node_id, kind, error_codec, error_schema_ref, error_json, failure_id FROM cause_node WHERE cause_id = 'fixture-cause-all' ORDER BY node_id").all() as { node_id: string; kind: string; error_codec: string | null; error_schema_ref: string | null; error_json: string | null; failure_id: string | null }[];
  assertEqual(nodes.map(({ kind }) => kind).sort().join(','), ['Die', 'Empty', 'Fail', 'Interrupt', 'Parallel', 'Sequential', 'Sequential'].sort().join(','), 'Cause variant fixture coverage differs.');
  const fail = nodes.find(({ kind }) => kind === 'Fail');
  if (!fail || fail.error_codec !== fixtureCodecId(fixture) || fail.error_schema_ref !== fixture.json_schema_ref || canonicalize(JSON.parse(fail.error_json as string)) !== canonicalize({ error: 'typed fixture' })) throw new Error('Fail fixture codec readback differs.');
  const edges = database.prepare("SELECT parent_node_id, position, child_node_id FROM cause_edge WHERE cause_id = 'fixture-cause-all' ORDER BY parent_node_id, position").all();
  assertEqual(canonicalize(edges), canonicalize([
    { parent_node_id: 'parallel', position: 'LEFT', child_node_id: 'sequential-left' }, { parent_node_id: 'parallel', position: 'RIGHT', child_node_id: 'sequential-right' },
    { parent_node_id: 'sequential-left', position: 'LEFT', child_node_id: 'fail' }, { parent_node_id: 'sequential-left', position: 'RIGHT', child_node_id: 'die' },
    { parent_node_id: 'sequential-right', position: 'LEFT', child_node_id: 'interrupt' }, { parent_node_id: 'sequential-right', position: 'RIGHT', child_node_id: 'empty' },
  ].sort((left, right) => left.parent_node_id.localeCompare(right.parent_node_id) || left.position.localeCompare(right.position))), 'Nested Cause topology readback differs.');
  const exits = database.prepare("SELECT exit_id, kind, cause_id, value_codec, value_schema_ref, value_json FROM exit_record WHERE exit_id LIKE 'fixture-exit-%' ORDER BY exit_id").all() as Record<string, unknown>[];
  assertEqual(canonicalize(exits), canonicalize([
    { exit_id: 'fixture-exit-failure', kind: 'Failure', cause_id: 'fixture-cause-all', value_codec: null, value_schema_ref: null, value_json: null },
    { exit_id: 'fixture-exit-failure-empty', kind: 'Failure', cause_id: 'fixture-cause-empty', value_codec: null, value_schema_ref: null, value_json: null },
    { exit_id: 'fixture-exit-success', kind: 'Success', cause_id: null, value_codec: fixtureCodecId(fixture), value_schema_ref: fixture.json_schema_ref, value_json: canonicalize({ value: 42 }) },
  ]), 'Exit fixture semantic readback differs.');
};

const assertEqual = (actual: string, expected: string, message: string): void => {
  if (actual !== expected) throw new Error(message);
};

export const verifyDatabase = (databasePath: string, options: SqliteProjectionOptions = {}): { sqliteVersion: string; tables: number; constraintTests: string[]; metadataRelations: number; runtimeConstraints: number } => {
  const database = new DatabaseSync(databasePath);
  const constraintTests: string[] = [];
  try {
    database.exec('PRAGMA foreign_keys = ON');
    const sqlitePayload = canonicalPayload(database, 'sqlite-profile');
    const selection = resolveProfileSelection(sqlitePayload, options.profiles ?? []);
    const selectedProfiles = selection.profiles;
    const sqliteVersion = requireSQLiteVersion(database);
    if (scalar(database, 'PRAGMA integrity_check') !== 'ok') throw new Error('SQLite integrity_check did not return ok.');
    const foreignKeyRows = database.prepare('PRAGMA foreign_key_check').all();
    if (foreignKeyRows.length !== 0) throw new Error(`SQLite foreign_key_check returned ${foreignKeyRows.length} row(s).`);
    if (Number(scalar(database, 'PRAGMA application_id')) !== APPLICATION_ID) throw new Error('Unexpected SQLite application_id.');
    if (Number(scalar(database, 'PRAGMA user_version')) !== selection.userVersion) throw new Error('Unexpected SQLite user_version.');
    const storedProfiles = JSON.parse(String(scalar(database, "SELECT metadata_value FROM projection_metadata WHERE metadata_key = 'optional_profiles'"))) as unknown;
    if (!Array.isArray(storedProfiles) || JSON.stringify(storedProfiles) !== JSON.stringify(selectedProfiles)) throw new Error('Unexpected resolved SQLite optional profiles.');
    const nonStrict = database.prepare("SELECT name FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%' AND strict <> 1").all();
    if (nonStrict.length !== 0) throw new Error('A projection table is not STRICT.');
    const metadata = verifyRelationalMetadata(database, canonicalPayload(database, 'relational-schema'), selectedProfiles);

    constraintTests.push(expectFailure('duplicate-primary-key', () => {
      database.prepare("INSERT INTO projection_metadata VALUES ('authority', 'duplicate')").run();
    }));
    constraintTests.push(expectFailure('foreign-key-rejection', () => {
      database.prepare("INSERT INTO catalog_record VALUES ('01999999-9999-7999-8999-999999999999', 'risk', 'DRAFT', 0)").run();
    }));
    constraintTests.push(expectFailure('strict-type-rejection', () => {
      database.exec("INSERT INTO projection_metadata VALUES ('strict-test', x'00')");
    }));
    if (selectedProfiles.includes('structured-failure')) {
      verifyFailureCauseCycles(database);
      database.exec('SAVEPOINT failure_profile_constraints');
      try {
        const insert = database.prepare('INSERT INTO failure_record (failure_id, schema_version, code) VALUES (?, ?, ?)');
        insert.run('failure-a', '1.0.0', 'urn:example:a');
        insert.run('failure-b', '1.0.0', 'urn:example:b');
        constraintTests.push(expectFailure('failure-version-rejection', () => insert.run('failure-version', '2.0.0', 'urn:example:version')));
        constraintTests.push(expectFailure('failure-code-rejection', () => insert.run('failure-code', '1.0.0', 'not-qualified')));
        constraintTests.push(expectFailure('failure-json-rejection', () => {
          database.prepare("INSERT INTO failure_record (failure_id, schema_version, code, details_json) VALUES ('failure-json', '1.0.0', 'urn:example:json', '{')").run();
        }));
        constraintTests.push(expectFailure('failure-cause-foreign-key-rejection', () => {
          database.prepare("INSERT INTO failure_cause VALUES ('failure-a', 0, 'failure-missing')").run();
        }));
        database.prepare("INSERT INTO failure_cause VALUES ('failure-a', 0, 'failure-b')").run();
        database.prepare("INSERT INTO failure_cause VALUES ('failure-b', 0, 'failure-a')").run();
        constraintTests.push(expectFailure('failure-multi-node-cycle-runtime-rejection', () => verifyFailureCauseCycles(database)));
        database.prepare('DELETE FROM failure_cause').run();
      } finally {
        database.exec('ROLLBACK TO failure_profile_constraints');
        database.exec('RELEASE failure_profile_constraints');
      }
    }
    if (selectedProfiles.includes('cause-exit')) {
      verifyCauseExitStorage(database);
      database.exec('SAVEPOINT cause_exit_constraints');
      try {
        const failureInsert = database.prepare('INSERT INTO failure_record (failure_id, schema_version, code) VALUES (?, ?, ?)');
        failureInsert.run('cause-exit-failure', '1.0.0', 'urn:example:cause-exit');
        constraintTests.push(expectFailure('cause-node-payload-rejection', () => {
          database.prepare("INSERT INTO cause_node (cause_id, node_id, kind, failure_id) VALUES ('missing-cause', 'bad', 'Empty', 'cause-exit-failure')").run();
        }));
        constraintTests.push(expectFailure('cause-edge-position-rejection', () => {
          database.prepare("INSERT INTO cause_edge VALUES ('missing-cause', 'parent', 'MIDDLE', 'child')").run();
        }));
        constraintTests.push(expectFailure('exit-branch-payload-rejection', () => {
          database.prepare("INSERT INTO exit_record (exit_id, kind, value_codec, value_schema_ref, value_json) VALUES ('bad-exit', 'Failure', 'json', 'urn:example:value', '{}')").run();
        }));

        const causeInsert = database.prepare('INSERT INTO cause_record VALUES (?, ?)');
        const nodeInsert = database.prepare('INSERT INTO cause_node (cause_id, node_id, kind) VALUES (?, ?, ?)');
        const edgeInsert = database.prepare('INSERT INTO cause_edge VALUES (?, ?, ?, ?)');
        causeInsert.run('malformed', 'root');
        nodeInsert.run('malformed', 'root', 'Sequential');
        nodeInsert.run('malformed', 'left', 'Empty');
        edgeInsert.run('malformed', 'root', 'LEFT', 'left');
        constraintTests.push(expectFailure('cause-arity-runtime-rejection', () => verifyCauseExitStorage(database)));
        database.exec("DELETE FROM cause_record WHERE cause_id = 'malformed'");

        causeInsert.run('cyclic', 'a');
        for (const [nodeId, kind] of [['a', 'Parallel'], ['b', 'Parallel'], ['c', 'Empty'], ['d', 'Empty']] as const) nodeInsert.run('cyclic', nodeId, kind);
        edgeInsert.run('cyclic', 'a', 'LEFT', 'b');
        edgeInsert.run('cyclic', 'a', 'RIGHT', 'c');
        edgeInsert.run('cyclic', 'b', 'LEFT', 'a');
        edgeInsert.run('cyclic', 'b', 'RIGHT', 'd');
        constraintTests.push(expectFailure('cause-cycle-runtime-rejection', () => verifyCauseExitStorage(database)));
        database.exec("DELETE FROM cause_record WHERE cause_id = 'cyclic'");

        const insertDepthFixture = (edgeDepth: number): string => {
          const causeId = `depth-${edgeDepth}`;
          causeInsert.run(causeId, 'n0');
          for (let depth = 0; depth <= edgeDepth; depth += 1) {
            nodeInsert.run(causeId, `n${depth}`, depth === edgeDepth ? 'Empty' : 'Sequential');
            if (depth < edgeDepth) nodeInsert.run(causeId, `r${depth}`, 'Empty');
          }
          for (let depth = 0; depth < edgeDepth; depth += 1) {
            edgeInsert.run(causeId, `n${depth}`, 'LEFT', `n${depth + 1}`);
            edgeInsert.run(causeId, `n${depth}`, 'RIGHT', `r${depth}`);
          }
          return causeId;
        };
        let depthCause = insertDepthFixture(31);
        verifyCauseExitStorage(database);
        constraintTests.push('cause-edge-depth-31-accepted');
        database.prepare('DELETE FROM cause_record WHERE cause_id = ?').run(depthCause);
        depthCause = insertDepthFixture(32);
        verifyCauseExitStorage(database);
        constraintTests.push('cause-edge-depth-32-accepted');
        database.prepare('DELETE FROM cause_record WHERE cause_id = ?').run(depthCause);
        depthCause = insertDepthFixture(33);
        constraintTests.push(expectFailure('cause-edge-depth-33-rejected', () => verifyCauseExitStorage(database)));
        database.prepare('DELETE FROM cause_record WHERE cause_id = ?').run(depthCause);
        assertCauseResourceLimits(1023, 0);
        constraintTests.push('cause-node-count-1023-accepted');
        assertCauseResourceLimits(1024, 0);
        constraintTests.push('cause-node-count-1024-accepted');
        constraintTests.push(expectFailure('cause-node-count-1025-rejected', () => assertCauseResourceLimits(1025, 0)));

        populateOperationalFixture(database, fixtureCodecFrom(sqlitePayload));
        verifyOperationalFixtureReadback(database, fixtureCodecFrom(sqlitePayload));
        constraintTests.push('operational-fixture-semantic-roundtrip');
      } finally {
        database.exec('ROLLBACK TO cause_exit_constraints');
        database.exec('RELEASE cause_exit_constraints');
      }
    }
    database.exec('PRAGMA query_only = ON');
    constraintTests.push(expectFailure('reverse-write-rejection', () => {
      database.prepare("INSERT INTO projection_metadata VALUES ('reverse', 'prohibited')").run();
    }));
    database.exec('PRAGMA query_only = OFF');
    return {
      sqliteVersion,
      tables: Number(scalar(database, "SELECT count(*) FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%'")),
      constraintTests,
      metadataRelations: metadata.relations,
      runtimeConstraints: metadata.runtimeConstraints,
    };
  } finally {
    database.close();
  }
};

const verifyReadOnlyOpen = (databasePath: string): string => {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    return expectFailure('read-only-open-rejection', () => {
      database.prepare("INSERT INTO projection_metadata VALUES ('write', 'rejected')").run();
    });
  } finally {
    database.close();
  }
};

export const qualifyProjection = async (corpusRoot: string, temporaryRoot: string, options: SqliteProjectionOptions = {}): Promise<QualificationResult> => {
  const corpus = await validateCorpus(corpusRoot, {
    enforceQualificationGates: false,
    ...(options.replacingQualificationReceipt === true ? { replacingQualificationReceipt: true } : {}),
  });
  await mkdir(temporaryRoot, { recursive: true });
  const first = resolve(temporaryRoot, 'projection-a.sqlite');
  const second = resolve(temporaryRoot, 'projection-b.sqlite');
  await rm(first, { force: true });
  await rm(second, { force: true });
  buildDatabase(corpus, first, options);
  buildDatabase(corpus, second, options);
  const verification = verifyDatabase(first, options);
  const firstDump = logicalDump(first);
  const secondDump = logicalDump(second);
  if (firstDump !== secondDump) throw new Error('Two clean compilations produced different ordered logical dumps.');
  const constraintTests = [...verification.constraintTests, verifyReadOnlyOpen(first)];
  return {
    documents: corpus.documents.size,
    schemas: corpus.schemas.length,
    entities: corpus.entities.size,
    scenarios: corpus.scenarios.size,
    tables: verification.tables,
    sqliteVersion: verification.sqliteVersion,
    dumpSha256: createHash('sha256').update(firstDump).digest('hex'),
    constraintTests,
    metadataRelations: verification.metadataRelations,
    runtimeConstraints: verification.runtimeConstraints,
  };
};

export const compileAndPublish = async (corpusRoot: string, targetPath: string, options: SqliteProjectionOptions = {}): Promise<QualificationResult> => {
  const target = resolve(targetPath);
  const parent = dirname(target);
  await mkdir(parent, { recursive: true });
  const qualificationDirectory = resolve(parent, `.${basename(target)}.qualification-${randomUUID()}`);
  const stage = resolve(parent, `.${basename(target)}.stage-${randomUUID()}`);
  try {
    const result = await qualifyProjection(corpusRoot, qualificationDirectory, options);
    await copyFile(resolve(qualificationDirectory, 'projection-a.sqlite'), stage);
    verifyDatabase(stage, options);
    await rename(stage, target);
    return result;
  } finally {
    await rm(stage, { force: true });
    await rm(qualificationDirectory, { recursive: true, force: true });
  }
};
