import 'dotenv/config';
import { importSource, validateSource } from '../src/services/spreadsheetImportService.js';
import { pool } from '../src/db/pool.js';

const validateOnly = process.argv.includes('--validate');
const reprocess = process.argv.includes('--reprocess');

try {
  const result = validateOnly
    ? await validateSource()
    : await importSource(null, { reprocess });
  console.log(JSON.stringify({ event: validateOnly ? 'source_validated' : 'source_imported', valid: result.valid === true }));
  if (validateOnly && !result.valid) process.exitCode = 2;
} catch {
  console.error(JSON.stringify({ event: 'source_import_failed' }));
  process.exitCode = 1;
} finally {
  await pool.end();
}
