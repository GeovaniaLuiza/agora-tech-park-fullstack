import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { afterAll, expect, it } from 'vitest';
import { pool, shutdown } from '../../src/db/pool.js';

afterAll(shutdown);

it('backfills only supported authorship, retaining ambiguous history, timestamps, IDs, answers and references', async () => {
  const client = await pool.connect();
  const schema = 'response_identity_' + randomUUID().replaceAll('-', '');
  const a = randomUUID(), b = randomUUID(), org = randomUUID(), otherOrg = randomUUID();
  try {
    await client.query('BEGIN');
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema},public`);
    await client.query(`CREATE TABLE users(id uuid PRIMARY KEY);
      CREATE TABLE forms(id uuid PRIMARY KEY);
      CREATE TABLE organizations(id uuid PRIMARY KEY);
      CREATE TABLE responses(id uuid PRIMARY KEY,form_id uuid REFERENCES forms(id),organization_id uuid REFERENCES organizations(id),
        answered_by uuid NOT NULL REFERENCES users(id),status text,created_at timestamptz DEFAULT '2020-01-01',updated_at timestamptz DEFAULT '2020-01-02',
        CONSTRAINT responses_form_id_organization_id_key UNIQUE(form_id,organization_id));
      CREATE TRIGGER update_responses_updated_at BEFORE UPDATE ON responses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
      CREATE TABLE answers(response_id uuid REFERENCES responses(id) ON DELETE CASCADE,value text);
      CREATE TABLE indicator_records(response_id uuid REFERENCES responses(id) ON DELETE RESTRICT);
      CREATE TABLE form_respondents(form_id uuid,user_id uuid,organization_id uuid);
      CREATE TABLE audit_logs(user_id uuid,entity text,entity_id uuid,action text);`);
    await client.query('INSERT INTO users VALUES($1),($2)', [a, b]);
    await client.query('INSERT INTO organizations VALUES($1),($2)', [org, otherOrg]);
    const cases = [
      { name: 'submitted', actors: [a], selected: [a], status: 'SUBMITTED', owned: true },
      { name: 'draft', actors: [a], selected: [a], status: 'DRAFT', owned: true },
      { name: 'reopened', actors: [a], selected: [a], status: 'REOPENED', owned: true },
      { name: 'legacyWithoutAssignments', actors: [a], selected: [], status: 'SUBMITTED', owned: true },
      { name: 'noAudit', actors: [], selected: [a], status: 'DRAFT', owned: false },
      { name: 'conflictingWriters', actors: [a, b], selected: [a], status: 'SUBMITTED', owned: false },
      { name: 'multipleRecipients', actors: [a], selected: [a, b], status: 'SUBMITTED', owned: false },
      { name: 'mismatchedAssignment', actors: [a], selected: [b], status: 'SUBMITTED', owned: false },
      { name: 'unknownWriter', actors: [a, null], selected: [a], status: 'DRAFT', owned: false },
    ];
    for (const entry of cases) {
      entry.form = randomUUID(); entry.id = randomUUID();
      await client.query('INSERT INTO forms VALUES($1)', [entry.form]);
      await client.query('INSERT INTO responses(id,form_id,organization_id,answered_by,status) VALUES($1,$2,$3,$4,$5)', [entry.id, entry.form, org, a, entry.status]);
      await client.query('INSERT INTO answers VALUES($1,$2)', [entry.id, entry.name]);
      await client.query('INSERT INTO indicator_records VALUES($1)', [entry.id]);
      for (const actor of entry.actors) await client.query("INSERT INTO audit_logs VALUES($1,'response',$2,$3)", [actor, entry.id, entry.status === 'DRAFT' ? 'RESPONSE_DRAFT_SAVED' : 'RESPONSE_SUBMITTED']);
      for (const user of entry.selected) await client.query('INSERT INTO form_respondents VALUES($1,$2,$3)', [entry.form, user, org]);
    }
    const before = (await client.query('SELECT * FROM responses ORDER BY id')).rows;
    await client.query(await readFile(new URL('../../../database/migrations/021_response_respondent_identity.sql', import.meta.url), 'utf8'));
    const after = (await client.query('SELECT * FROM responses ORDER BY id')).rows;
    expect(after.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'respondent_user_id')))).toEqual(before);
    for (const entry of cases) expect(after.find(({ id }) => id === entry.id).respondent_user_id).toBe(entry.owned ? a : null);
    expect((await client.query('SELECT COUNT(*)::int AS total FROM answers')).rows[0].total).toBe(cases.length);
    expect((await client.query('SELECT COUNT(*)::int AS total FROM indicator_records')).rows[0].total).toBe(cases.length);
    const trigger = await client.query("SELECT tgenabled FROM pg_trigger WHERE tgrelid='responses'::regclass AND tgname='update_responses_updated_at'");
    expect(trigger.rows[0].tgenabled).toBe('O');
    const constraints = (await client.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid='responses'::regclass")).rows.map(({ definition }) => definition);
    expect(constraints).toContain('UNIQUE (form_id, organization_id, respondent_user_id)');
    expect(constraints).toContain('FOREIGN KEY (respondent_user_id) REFERENCES users(id) ON DELETE RESTRICT');
    const form = cases[0].form;
    await client.query('INSERT INTO responses(id,form_id,organization_id,answered_by,respondent_user_id) VALUES($1,$2,$3,$4,$4)', [randomUUID(), form, org, b]);
    await client.query('INSERT INTO responses(id,form_id,organization_id,answered_by,respondent_user_id) VALUES($1,$2,$3,$4,$4)', [randomUUID(), form, otherOrg, a]);
    await client.query('SAVEPOINT duplicate_identity');
    await expect(client.query('INSERT INTO responses(id,form_id,organization_id,answered_by,respondent_user_id) VALUES($1,$2,$3,$4,$4)', [randomUUID(), form, org, a])).rejects.toMatchObject({ code: '23505', constraint: 'responses_form_organization_respondent_key' });
    await client.query('ROLLBACK TO SAVEPOINT duplicate_identity');
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});
