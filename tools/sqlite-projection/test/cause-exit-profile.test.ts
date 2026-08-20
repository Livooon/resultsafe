import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { APPLICATION_ID, assertCauseResourceLimits, resolveProfileSelection, verifyDatabase } from '../src/compiler.js';

const profilePath = fileURLToPath(new URL('../../../platform/staging/resultsafe-core-v001/SQLITE-PROFILE.json', import.meta.url));
const relationalPath = fileURLToPath(new URL('../../../platform/staging/resultsafe-core-v001/RELATIONAL-SCHEMA.json', import.meta.url));

test('declared cause-exit DDL and runtime qualification constraints are enforceable', async () => {
  const temporary = await mkdtemp(resolve(tmpdir(), 'resultsafe-cause-exit-profile-'));
  const databasePath = resolve(temporary, 'profile.sqlite');
  try {
    const profile = JSON.parse(await readFile(profilePath, 'utf8')) as Record<string, unknown>;
    const relational = JSON.parse(await readFile(relationalPath, 'utf8')) as Record<string, unknown>;
    const payload = profile['payload'] as Record<string, unknown>;
    const optionalProfiles = payload['optional_profiles'] as Record<string, unknown>[];
    const selection = resolveProfileSelection(payload, ['cause-exit']);
    const database = new DatabaseSync(databasePath);
    try {
      database.exec('PRAGMA foreign_keys = ON');
      database.exec(`PRAGMA application_id = ${APPLICATION_ID}`);
      database.exec(`PRAGMA user_version = ${selection.userVersion}`);
      for (const statement of payload['ddl'] as string[]) database.exec(statement);
      for (const key of selection.profiles) {
        const selected = optionalProfiles.find((item) => item['profile_key'] === key);
        assert.ok(selected);
        for (const statement of selected['ddl'] as string[]) database.exec(statement);
      }
      const schemaInsert = database.prepare('INSERT INTO schema_document VALUES (?, ?, ?, ?)');
      schemaInsert.run(String(profile['schema_ref']), 'sqlite-profile-test-schema', 'fixture/sqlite-profile.schema.json', '{}');
      schemaInsert.run(String(relational['schema_ref']), 'relational-schema-test-schema', 'fixture/relational-schema.schema.json', '{}');
      const documentInsert = database.prepare('INSERT INTO canonical_document VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
      for (const document of [profile, relational]) documentInsert.run(String(document['document_id']), String(document['document_ref']), String(document['document_key']), String(document['document_type']), String(document['schema_ref']), `fixture/${String(document['document_key'])}.json`, Number(document['document_revision']), JSON.stringify(document));
      database.prepare('INSERT INTO projection_metadata VALUES (?, ?)').run('authority', 'canonical-json');
      database.prepare('INSERT INTO projection_metadata VALUES (?, ?)').run('optional_profiles', JSON.stringify(selection.profiles));
    } finally {
      database.close();
    }

    const result = verifyDatabase(databasePath, { profiles: ['cause-exit'] });
    assert.equal(result.tables, 22);
    assert.equal(result.metadataRelations, 22);
    assert.ok(result.constraintTests.includes('operational-fixture-semantic-roundtrip'));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('Cause resource limits use root edge depth zero at exact non-pathological boundaries', () => {
  assert.doesNotThrow(() => assertCauseResourceLimits(1023, 31));
  assert.doesNotThrow(() => assertCauseResourceLimits(1024, 32));
  assert.throws(() => assertCauseResourceLimits(1024, 33), /edge depth 32/);
  assert.throws(() => assertCauseResourceLimits(1025, 32), /1024 nodes/);
});
