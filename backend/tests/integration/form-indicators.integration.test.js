import { afterAll, describe, expect, it } from 'vitest';
import { pool, shutdown } from '../../src/db/pool.js';
import { processLinkedAnswers } from '../../src/services/indicatorValueService.js';

describe('formulário alimenta indicadores', () => {
  afterAll(async () => shutdown());

  it('faz upsert idempotente do valor mensal e do consolidado anual', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const center = (await client.query("SELECT id FROM innovation_centers WHERE code='CI_JOINVILLE'")).rows[0];
      const indicator = (await client.query("SELECT id FROM indicator_definitions WHERE code='CAPACITACOES_REALIZADAS'")).rows[0];
      const organization = (await client.query("INSERT INTO organizations(name,status) VALUES('Organização Teste Formulário','ACTIVE') RETURNING id")).rows[0];
      const responseId = (await client.query('SELECT gen_random_uuid() AS id')).rows[0].id;
      const base = { responseId, organizationId: organization.id, centerId: center.id,
        year: 2199, month: 5, userId: null };

      await processLinkedAnswers({ ...base, answers: [{ questionId: responseId, indicator_id: indicator.id, value: '30' }] }, client);
      await processLinkedAnswers({ ...base, answers: [{ questionId: responseId, indicator_id: indicator.id, value: '35' }] }, client);

      const values = await client.query(
        `SELECT month,numeric_value,source_type,source_id FROM indicator_values
         WHERE indicator_id=$1 AND innovation_center_id=$2 AND year=2199
           AND source_type='FORM_RESPONSE' AND deleted_at IS NULL ORDER BY month NULLS LAST`,
        [indicator.id, center.id],
      );
      expect(values.rows).toHaveLength(2);
      expect(Number(values.rows.find((row) => row.month === 5).numeric_value)).toBe(35);
      expect(Number(values.rows.find((row) => row.month === null).numeric_value)).toBe(35);
      expect(values.rows.every((row) => row.source_id === responseId)).toBe(true);
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
  });
});
