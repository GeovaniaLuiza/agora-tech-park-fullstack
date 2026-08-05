import 'dotenv/config';
import { importSource, validateSource } from '../src/services/spreadsheetImportService.js';
import { pool } from '../src/db/pool.js';

const validateOnly = process.argv.includes('--validate');
const reprocess = process.argv.includes('--reprocess');

try {
  const result = validateOnly
    ? await validateSource()
    : await importSource(null, { reprocess });
  console.log(JSON.stringify(result, null, 2));
  if (validateOnly && !result.valid) process.exitCode = 2;
} catch (error) {
  console.error(JSON.stringify({ message: error.message, code: error.code, details: error.details }, null, 2));
  process.exitCode = 1;
} finally {
  await pool.end();
}
