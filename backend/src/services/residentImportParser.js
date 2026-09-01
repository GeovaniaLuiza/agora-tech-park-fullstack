import { createHash } from 'node:crypto';
import { IMPORT_YEAR, RESIDENT_BLOCKS, RESIDENT_SHEET } from '../domain/indicatorImportCatalog.js';
import { cleanText, isoDate, monthBounds, normalizedKey, overlaps, parseDateValue, readExpectedSheet } from './indicatorImportUtils.js';

const HEADERS = ['Legenda', 'Bloco', ['Bloco e Módulo', 'Bloco e Modúlo'], 'Cliente', 'Área', 'CNPJ', 'Vigência', 'Fim', 'Locador', 'Atividades', 'Nacionalidade', 'Nome', 'Telefone', 'E-mail'];

const digits = (value) => cleanText(value).replace(/\D/g, '');
const repeated = (value) => /^(\d)\1+$/.test(value);
const validCpf = (value) => {
  if (value.length !== 11 || repeated(value)) return false;
  const check = (length) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(value[index]) * (length + 1 - index);
    const result = (sum * 10) % 11;
    return (result === 10 ? 0 : result) === Number(value[length]);
  };
  return check(9) && check(10);
};
const validCnpj = (value) => {
  if (value.length !== 14 || repeated(value)) return false;
  const digit = (length) => {
    let sum = 0, weight = length - 7;
    for (let index = 0; index < length; index += 1) { sum += Number(value[index]) * weight; weight = weight === 2 ? 9 : weight - 1; }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return digit(12) === Number(value[12]) && digit(13) === Number(value[13]);
};
const validDocument = (value) => validCpf(value) || validCnpj(value);
const maskDocument = (value) => value.length === 14
  ? `${value.slice(0, 2)}.***.***/${value.slice(8, 12)}-${value.slice(12)}`
  : value.length === 11 ? `***.${value.slice(3, 6)}.${value.slice(6, 9)}-**` : 'Não informado';
const contractType = (legend) => {
  const key = normalizedKey(legend);
  if (key.includes('comodato')) return 'Comodato';
  if (key.includes('cessao')) return 'Cessão';
  if (key.includes('loca')) return 'Locada';
  return '';
};
const statusFor = (startDate, endDate, today = new Date().toISOString().slice(0, 10)) =>
  startDate && startDate > today ? 'FUTURE' : endDate && endDate < today ? 'ENDED' : 'ACTIVE';

function hasDiscontinuousPeriods(contracts) {
  const periods = contracts.filter((item) => item.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate));
  let coveredUntil = null;
  for (const period of periods) {
    if (coveredUntil === null && periods.indexOf(period) > 0) return false;
    if (coveredUntil && new Date(`${coveredUntil}T00:00:00Z`).getTime() + 86400000 < new Date(`${period.startDate}T00:00:00Z`).getTime()) return true;
    if (!period.endDate) coveredUntil = null;
    else if (coveredUntil !== null || periods.indexOf(period) === 0) coveredUntil = !coveredUntil || period.endDate > coveredUntil ? period.endDate : coveredUntil;
  }
  return false;
}

export async function parseResidentWorkbook(buffer, { year = IMPORT_YEAR } = {}) {
  const loaded = await readExpectedSheet(buffer, { sheetName: RESIDENT_SHEET, headerRow: 3, headers: HEADERS });
  if (loaded.error) return { errors: [loaded.error], warnings: [], items: [], summary: {} };
  const { worksheet } = loaded;
  const groups = new Map();
  const warnings = [];
  let ignoredObservationRows = 0;
  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 3) return;
    const block = cleanText(row.getCell(2).value).toUpperCase();
    
    // Regra 22: Considerar apenas empresas HUB, MOB, UNI
    if (!RESIDENT_BLOCKS.includes(block)) {
        if (row.values.slice(1).some((value) => cleanText(value))) ignoredObservationRows += 1;                
        return;
    }

    const name = cleanText(row.getCell(4).value);
    const startRaw = row.getCell(7).value;
    const endRaw = row.getCell(8).value;
    if (!name || !block || (!startRaw && !endRaw)) { if (row.values.slice(1).some((value) => cleanText(value))) ignoredObservationRows += 1; return; }
    const start = parseDateValue(startRaw), end = parseDateValue(endRaw);
    if ((startRaw && !start) || (endRaw && !end)) warnings.push({ code: 'INVALID_CONTRACT_DATE', row: rowNumber, message: 'Contrato com data inválida.' });
    
    // Regra 23: Usar CNPJ/CPF normalizado
    const document = digits(row.getCell(6).value);
    const documentIsValid = validDocument(document);
    const identity = documentIsValid ? `doc:${document}` : `name:${normalizedKey(name)}`;
    const identityHash = createHash('sha256').update(identity).digest('hex');
    
    const contract = {
      sourceRow: rowNumber, block, unit: cleanText(row.getCell(3).value),
      startDate: isoDate(start), endDate: isoDate(end), type: contractType(row.getCell(1).value),
      sector: cleanText(row.getCell(10).value), eligibleBlock: true,
    };
    
    if (!groups.has(identityHash)) groups.set(identityHash, { name, documentHash: identityHash, documentMasked: maskDocument(document), documentValid: documentIsValid, contracts: [], sourceRows: [] });
    const company = groups.get(identityHash);
    company.contracts.push(contract);
    company.sourceRows.push(rowNumber);
  });

  const items = [...groups.values()].map((company) => {
    const relevant = company.contracts; 
    const starts = relevant.map((item) => item.startDate).filter(Boolean).sort();
    const ends = relevant.map((item) => item.endDate).filter(Boolean).sort();
    const openEnded = relevant.some((item) => !item.endDate);
    
    const rooms = [...new Set(relevant.map((item) => item.unit).filter(Boolean))];
    const locations = [...new Set(relevant.map((item) => item.block).filter(Boolean))];
    
    const discontinuous = hasDiscontinuousPeriods(relevant);
    const needsReview = !company.documentValid || discontinuous;
    if (discontinuous) warnings.push({ code: 'DISCONTINUOUS_OCCUPANCY', rows: company.sourceRows, message: 'Empresa com períodos de ocupação descontínuos.' });
    if (!company.documentValid) warnings.push({ code: 'IDENTITY_REVIEW', rows: company.sourceRows, message: 'Documento ausente ou inválido; empresa consolidada pelo nome.' });
    
    const startDate = starts[0] || null;
    const endDate = openEnded ? null : ends.at(-1) || null;
    
    return {
      id: `resident-${company.documentHash.slice(0, 16)}`, sourceRows: company.sourceRows,
      name: company.name, documentHash: company.documentHash, documentMasked: company.documentMasked,
      contracts: company.contracts, included: true, manualBlockOverride: false, manualPeriodOverride: false,
      reviewStatus: needsReview ? 'WITH_WARNINGS' : 'VALIDATED',
      location: locations.join(' / '), rooms,
      contractType: [...new Set(relevant.map((contract) => contract.type).filter(Boolean))].join(' / '),
      startDate, endDate,
      sector: [...new Set(relevant.map(c => c.sector).filter(Boolean))].join(' / '), 
      status: statusFor(startDate, endDate), discontinuous,
      result: '', programName: '', collaboratorsEntry: null, collaboratorsExit: null,
      intellectualProperty: '', fundsRaised: null, annualRevenue: null, internationalRelationships: '',
    };
  });
  const summary = summarizeResidents(items, year);
  summary.ignoredObservationRows = ignoredObservationRows;
  return { errors: [], warnings, items, summary, sheetName: RESIDENT_SHEET, year };
}

export function summarizeResidents(items, year = IMPORT_YEAR) {
  const included = items.filter((item) => item.included);
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const { start, end } = monthBounds(year, index + 1);
    return included.filter((company) => company.manualPeriodOverride
      ? overlaps(company.startDate, company.endDate, start, end)
      : company.contracts.some((contract) => (contract.eligibleBlock || company.manualBlockOverride) && overlaps(contract.startDate, contract.endDate, start, end))).length;
  });
  return {
    records: items.length, included: included.length, excluded: items.length - included.length,
    warnings: items.filter((item) => item.reviewStatus === 'WITH_WARNINGS').length,
    multipleContracts: items.filter((item) => item.contracts.length > 1).length,
    discontinuous: items.filter((item) => item.discontinuous).length, monthly,
  };
}
