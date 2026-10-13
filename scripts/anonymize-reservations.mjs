// Run from the repository root. Never prints source cell contents.
import ExcelJS from '../backend/node_modules/exceljs/excel.js';
import { writeFile } from 'node:fs/promises';

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.readFile(process.argv[2]);
const sheet = workbook.worksheets[0];
const aliases = new Map();
const anonymize = (cell, field) => {
  const value = cell.text.trim();
  if (!value) return '';
  const key = `${field}:${value}`;
  if (!aliases.has(key)) aliases.set(key, `${field} ${aliases.size + 1}`);
  return aliases.get(key);
};
const rows = [];
sheet.eachRow((row, index) => {
  if (index === 1) return;
  rows.push(Array.from({ length: 13 }, (_, column) => {
    const cell = row.getCell(column + 1);
    if (column === 0) return anonymize(cell, 'Reserva');
    if (column === 1 || column === 2) return cell.value instanceof Date ? cell.value.toISOString() : cell.text;
    if (column === 3 || column === 12) return cell.text;
    return anonymize(cell, ['ID', 'Inicio', 'Fim', 'Horario', 'Sala', 'Tipo', 'Responsavel', 'Cliente', 'Empresa', 'Site', 'Predio', 'Andar'][column]);
  }));
});
await writeFile('backend/tests/fixtures/reservation-homologation-rows.json', JSON.stringify(rows, null, 2) + '\n');
console.log(`Fixture anonimizada: ${rows.length} linhas.`);
