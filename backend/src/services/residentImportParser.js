import { createHash } from 'node:crypto';
import { IMPORT_YEAR, RESIDENT_BLOCKS, RESIDENT_HEADERS, RESIDENT_SHEET } from '../domain/indicatorImportCatalog.js';
import { cleanText, isoDate, monthBounds, normalizedKey, overlaps, parseDateValue, parseNumberValue, readExpectedSheet, validationSummary } from './indicatorImportUtils.js';

export const documentDigits = (value) => cleanText(value).replace(/\D/g, '');
export function validCnpj(value) {
  const digits = documentDigits(value);
  if (digits.length !== 14 || /^(\d)\1+$/.test(digits)) return false;
  const digit = (length) => {
    let sum = 0, weight = length - 7;
    for (let index = 0; index < length; index += 1) { sum += Number(digits[index]) * weight; weight = weight === 2 ? 9 : weight - 1; }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return digit(12) === Number(digits[12]) && digit(13) === Number(digits[13]);
}
export const formatCnpj = (value) => {
  const digits = documentDigits(value);
  return digits.length === 14 ? digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : cleanText(value) || 'Não informado';
};
const contractType = (legend) => ({ locada: 'Locada', cessao: 'Cessão', comodato: 'Comodato' })[normalizedKey(legend)] || '';
const ignoredLegend = (legend) => ['disponivel', 'areas comuns'].includes(normalizedKey(legend));
const statusFor = (start, end) => start && start > new Date().toISOString().slice(0, 10) ? 'FUTURE' : end && end < new Date().toISOString().slice(0, 10) ? 'ENDED' : 'ACTIVE';
const dateInput = (value) => isoDate(parseDateValue(value)) || cleanText(value);

export function normalizeResident(company) {
  const issues = [];
  const add = (field, row, message) => issues.push({ field, row, message: message + ' na linha ' + row });
  const ignored = Boolean(company.ignored);
  const document = documentDigits(company.document);
  if (!ignored) {
    if (!cleanText(company.name)) add('name', company.sourceRows[0], 'Empresa ausente');
    if (!document) add('document', company.sourceRows[0], 'CNPJ ausente');
    else if (!validCnpj(document)) add('document', company.sourceRows[0], 'CNPJ inválido');
  }
  const contracts = (company.contracts || []).map((contract) => {
    const startInput = contract.startInput ?? contract.startDate ?? '';
    const endInput = contract.endInput ?? contract.endDate ?? '';
    const areaInput = contract.areaInput ?? contract.area ?? '';
    const startDate = isoDate(parseDateValue(startInput)), endDate = isoDate(parseDateValue(endInput));
    const area = parseNumberValue(areaInput);
    const block = cleanText(contract.block).toUpperCase();
    const eligibleBlock = RESIDENT_BLOCKS.includes(block);
    if (!ignored) {
      if (!eligibleBlock) add('block', contract.sourceRow, 'Bloco desconhecido');
      if (cleanText(startInput) && !startDate) add('startInput', contract.sourceRow, 'Data inválida (Vigência)');
      if (cleanText(endInput) && !endDate) add('endInput', contract.sourceRow, 'Data inválida (Fim)');
      if (startDate && endDate && endDate < startDate) add('endInput', contract.sourceRow, 'Fim anterior à Vigência');
      if (area === null) add('areaInput', contract.sourceRow, 'Área inválida');
      if (!contractType(contract.legend ?? contract.type)) add('legend', contract.sourceRow, 'Legenda desconhecida');
    }
    return { ...contract, block, eligibleBlock, startInput, endInput, areaInput, startDate, endDate, area, type: contractType(contract.legend ?? contract.type) };
  });
  const sorted = contracts.filter((contract) => contract.startDate).sort((a, b) => a.startDate.localeCompare(b.startDate));
  let discontinuous = false, coveredUntil;
  for (const contract of sorted) {
    if (coveredUntil && new Date(coveredUntil).getTime() + 86400000 < new Date(contract.startDate).getTime()) discontinuous = true;
    if (coveredUntil === null) break;
    coveredUntil = !contract.endDate ? null : !coveredUntil || contract.endDate > coveredUntil ? contract.endDate : coveredUntil;
  }
  const starts = contracts.map((contract) => contract.startDate).filter(Boolean).sort();
  const ends = contracts.map((contract) => contract.endDate).filter(Boolean).sort();
  const startDate = company.manualPeriodOverride ? company.startDate : starts[0] || null;
  const endDate = company.manualPeriodOverride ? company.endDate : contracts.some((contract) => !contract.endDate) ? null : ends.at(-1) || null;
  const validationStatus = ignored || company.reviewStatus === 'EXCLUDED' ? 'IGNORED' : issues.length ? 'REVIEW_REQUIRED' : discontinuous && !company.manualPeriodOverride ? 'WARNING' : 'VALID';
  return {
    ...company, document, documentFormatted: formatCnpj(company.document), documentMasked: formatCnpj(company.document),
    documentValid: validCnpj(document), documentHash: createHash('sha256').update(document ? 'doc:' + document : 'row:' + company.sourceRows[0]).digest('hex'),
    contracts, issues, validationStatus, discontinuous: discontinuous && !company.manualPeriodOverride,
    included: ignored ? false : Boolean(company.included),
    reviewStatus: validationStatus === 'IGNORED' ? 'EXCLUDED' : validationStatus === 'REVIEW_REQUIRED' ? 'PENDING' : validationStatus === 'WARNING' ? 'WITH_WARNINGS' : 'VALIDATED',
    location: company.manualBlockOverride ? company.location : [...new Set(contracts.map((contract) => contract.block).filter(Boolean))].join(' / '),
    rooms: company.manualRoomsOverride ? company.rooms : [...new Set(contracts.map((contract) => contract.unit).filter(Boolean))],
    contractType: [...new Set(contracts.map((contract) => contract.type).filter(Boolean))].join(' / '),
    totalArea: contracts.reduce((sum, contract) => sum + (contract.area || 0), 0),
    startDate, endDate, status: statusFor(startDate, endDate),
  };
}

export function consolidateResidents(items) {
  const groups = new Map();
  for (const item of items) {
    const key = !item.ignored && item.reviewStatus !== 'EXCLUDED' && item.document ? 'doc:' + documentDigits(item.document) : 'row:' + item.sourceRows[0];
    if (!groups.has(key)) groups.set(key, item);
    else {
      const group = groups.get(key);
      groups.set(key, normalizeResident({ ...group,
        original: group.original ? { ...group.original, contracts: [...group.original.contracts, ...(item.original?.contracts || item.contracts)] } : undefined,
        sourceRows: [...group.sourceRows, ...item.sourceRows], contracts: [...group.contracts, ...item.contracts], included: group.included || item.included, manuallyCorrected: group.manuallyCorrected || item.manuallyCorrected }));
    }
  }
  return [...groups.values()];
}

export async function parseResidentWorkbook(buffer, { year = IMPORT_YEAR } = {}) {
  const loaded = await readExpectedSheet(buffer, { sheetName: RESIDENT_SHEET, headerRow: 2, headers: RESIDENT_HEADERS });
  if (loaded.error) return { errors: [loaded.error], warnings: [], items: [], summary: {} };
  const rows = [];
  loaded.worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= 2 || !row.values.slice(1, 12).some((value) => cleanText(value))) return;
    const values = RESIDENT_HEADERS.map((_, index) => row.getCell(index + 1).value);
    const ignored = ignoredLegend(values[0]);
    rows.push(normalizeResident({
      id: 'resident-' + rowNumber, sourceRows: [rowNumber], name: cleanText(values[5]), document: cleanText(values[6]), documentRaw: cleanText(values[6]),
      ignored, included: !ignored, reviewStatus: ignored ? 'EXCLUDED' : 'PENDING',
      contracts: [{
        sourceRow: rowNumber, legend: cleanText(values[0]), landlord: cleanText(values[1]),
        block: cleanText(values[2]), unit: cleanText(values[3]), areaInput: cleanText(values[4]),
        startInput: dateInput(values[7]), endInput: dateInput(values[8]),
        startRaw: cleanText(values[7]), endRaw: cleanText(values[8]),
        sector: cleanText(values[9]), nationality: cleanText(values[10]),
      }],
      sector: cleanText(values[9]), nationality: cleanText(values[10]), manualBlockOverride: false, manualPeriodOverride: false,
      result: '', programName: '', collaboratorsEntry: null, collaboratorsExit: null,
      intellectualProperty: '', fundsRaised: null, annualRevenue: null, internationalRelationships: '',
    }));
  });
  const items = consolidateResidents(rows);
  const warnings = items.flatMap((item) => item.issues.map((issue) => ({ ...issue, code: 'RESIDENT_REVIEW' })));
  return { errors: [], warnings, items, summary: summarizeResidents(items, year), sheetName: RESIDENT_SHEET, year };
}

export function summarizeResidents(items, year = IMPORT_YEAR) {
  const companies = items.filter((item) => !item.ignored);
  const included = companies.filter((item) => item.included);
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const { start, end } = monthBounds(year, index + 1);
    return included.filter((company) => company.validationStatus !== 'REVIEW_REQUIRED' && (company.manualPeriodOverride
      ? overlaps(company.startDate, company.endDate, start, end)
      : company.contracts.some((contract) => (contract.eligibleBlock || company.manualBlockOverride) && overlaps(contract.startDate, contract.endDate, start, end)))).length;
  });
  return {
    ...validationSummary(items), records: companies.length, rowsRead: items.reduce((sum, item) => sum + (item.sourceRows?.length || 1), 0),
    companies: companies.length, uniqueCnpjs: new Set(companies.map((item) => item.document).filter(Boolean)).size,
    occupations: companies.reduce((sum, item) => sum + item.contracts.length, 0),
    included: included.length, excluded: items.filter((item) => !item.included).reduce((sum, item) => sum + (item.sourceRows?.length || 1), 0),
    multipleContracts: companies.filter((item) => item.contracts.length > 1).length,
    discontinuous: companies.filter((item) => item.discontinuous).length, monthly,
  };
}
