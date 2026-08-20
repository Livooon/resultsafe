import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { loadCorpus } from '../../contract-registry/src/load.js';
import { APPLICATION_ID, USER_VERSION, compileAndPublish, qualifyProjection, resolveProfileSelection } from '../src/compiler.js';

const corpus = fileURLToPath(new URL('../../../platform/staging/resultsafe-core-v001/', import.meta.url));

test('compiles the full corpus deterministically and enforces the SQLite profile', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'resultsafe-sqlite-test-'));
  try {
    const result = await qualifyProjection(corpus, temporary);
    const canonical = await loadCorpus(corpus);
    assert.equal(result.documents, canonical.documents.size);
    assert.equal(result.schemas, canonical.schemas.length);
    assert.equal(result.scenarios, canonical.scenarios.size);
    assert.equal(result.tables, 16);
    assert.equal(result.metadataRelations, 16);
    assert.ok(result.runtimeConstraints > 0);
    assert.deepEqual(result.constraintTests, [
      'duplicate-primary-key',
      'foreign-key-rejection',
      'strict-type-rejection',
      'reverse-write-rejection',
      'read-only-open-rejection',
    ]);
    assert.match(result.dumpSha256, /^[0-9a-f]{64}$/);

    const database = new DatabaseSync(resolve(temporary, 'projection-a.sqlite'), { readOnly: true });
    try {
      assert.equal((database.prepare('PRAGMA application_id').get() as { application_id: number }).application_id, APPLICATION_ID);
      assert.equal((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, USER_VERSION);
      assert.equal((database.prepare('SELECT count(*) AS count FROM canonical_document').get() as { count: number }).count, result.documents);
      assert.equal((database.prepare('SELECT count(*) AS count FROM entity').get() as { count: number }).count, result.entities);
      assert.equal((database.prepare('SELECT count(*) AS count FROM scenario').get() as { count: number }).count, result.scenarios);
    } finally {
      database.close();
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('structured Failure storage is an explicit deterministic optional profile', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'resultsafe-sqlite-failure-test-'));
  try {
    const result = await qualifyProjection(corpus, temporary, { profiles: ['structured-failure'] });
    assert.equal(result.tables, 18);
    assert.deepEqual(result.constraintTests, [
      'duplicate-primary-key',
      'foreign-key-rejection',
      'strict-type-rejection',
      'failure-version-rejection',
      'failure-code-rejection',
      'failure-json-rejection',
      'failure-cause-foreign-key-rejection',
      'failure-multi-node-cycle-runtime-rejection',
      'reverse-write-rejection',
      'read-only-open-rejection',
    ]);
    const database = new DatabaseSync(resolve(temporary, 'projection-a.sqlite'), { readOnly: true });
    try {
      assert.equal((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 2);
      assert.deepEqual(
        (database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name LIKE 'failure_%' ORDER BY name").all() as { name: string }[]).map(({ name }) => name),
        ['failure_cause', 'failure_record'],
      );
    } finally {
      database.close();
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Cause and Exit storage auto-includes structured Failure and verifies exact topology', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'resultsafe-sqlite-cause-exit-test-'));
  try {
    const result = await qualifyProjection(corpus, temporary, { profiles: ['cause-exit'] });
    assert.equal(result.tables, 22);
    assert.deepEqual(result.constraintTests, [
      'duplicate-primary-key',
      'foreign-key-rejection',
      'strict-type-rejection',
      'failure-version-rejection',
      'failure-code-rejection',
      'failure-json-rejection',
      'failure-cause-foreign-key-rejection',
      'failure-multi-node-cycle-runtime-rejection',
      'cause-node-payload-rejection',
      'cause-edge-position-rejection',
      'exit-branch-payload-rejection',
      'cause-arity-runtime-rejection',
      'cause-cycle-runtime-rejection',
      'cause-edge-depth-31-accepted',
      'cause-edge-depth-32-accepted',
      'cause-edge-depth-33-rejected',
      'cause-node-count-1023-accepted',
      'cause-node-count-1024-accepted',
      'cause-node-count-1025-rejected',
      'operational-fixture-semantic-roundtrip',
      'reverse-write-rejection',
      'read-only-open-rejection',
    ]);
    assert.match(result.dumpSha256, /^[0-9a-f]{64}$/);
    assert.equal(result.metadataRelations, 22);

    const database = new DatabaseSync(resolve(temporary, 'projection-a.sqlite'));
    try {
      assert.equal((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 3);
      assert.deepEqual(
        JSON.parse((database.prepare("SELECT metadata_value FROM projection_metadata WHERE metadata_key = 'optional_profiles'").get() as { metadata_value: string }).metadata_value),
        ['cause-exit', 'structured-failure'],
      );
      assert.deepEqual(
        (database.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND (name LIKE 'cause_%' OR name = 'exit_record' OR name LIKE 'failure_%') ORDER BY name").all() as { name: string }[]).map(({ name }) => name),
        ['cause_edge', 'cause_node', 'cause_record', 'exit_record', 'failure_cause', 'failure_record'],
      );

      database.exec('PRAGMA foreign_keys = ON; BEGIN');
      database.prepare("INSERT INTO cause_record VALUES ('empty-cause', 'root')").run();
      database.prepare("INSERT INTO cause_node (cause_id, node_id, kind) VALUES ('empty-cause', 'root', 'Empty')").run();
      database.prepare("INSERT INTO exit_record (exit_id, kind, cause_id) VALUES ('empty-failure-exit', 'Failure', 'empty-cause')").run();
      database.exec('COMMIT');
      assert.equal((database.prepare("SELECT kind FROM exit_record WHERE exit_id = 'empty-failure-exit'").get() as { kind: string }).kind, 'Failure');
    } finally {
      database.close();
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('rejects unknown optional profiles deterministically', async () => {
  assert.throws(() => resolveProfileSelection({ user_version: 1, optional_profiles: [] }, ['missing-profile']), /Unknown SQLite optional profile/);
});

test('derives optional profile dependencies and versions from machine-readable declarations', () => {
  const payload = {
    user_version: 7,
    optional_profiles: [
      { profile_key: 'dependency', user_version: 11, requires_profiles: [] },
      { profile_key: 'feature', user_version: 19, requires_profiles: ['dependency'] },
    ],
  };
  assert.deepEqual(resolveProfileSelection(payload, ['feature']), { profiles: ['dependency', 'feature'], userVersion: 19 });
});

test('publishes only when explicitly called and leaves no staging database', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'resultsafe-sqlite-publish-test-'));
  try {
    const target = resolve(temporary, 'published.sqlite');
    const result = await compileAndPublish(corpus, target);
    assert.equal(result.tables, 16);
    assert.deepEqual(await readdir(temporary), ['published.sqlite']);
    const database = new DatabaseSync(target, { readOnly: true });
    database.close();
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
