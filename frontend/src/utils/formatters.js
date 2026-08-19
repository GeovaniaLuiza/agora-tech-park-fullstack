export const formatNumber = (value, options = {}) => new Intl.NumberFormat('pt-BR', options).format(Number(value || 0));

export const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', minimumFractionDigits: 2,
}).format(Number(value || 0));

export const formatPercent = (value) => new Intl.NumberFormat('pt-BR', {
  style: 'percent', maximumFractionDigits: 1,
}).format(Number(value || 0));

export const formatDate = (value) => value
  ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo' }).format(new Date(value))
  : 'Não informado';

export const formatPeriod = ({ year, month } = {}) => month
  ? `${String(month).padStart(2, '0')}/${year}`
  : String(year || 'Todos os períodos');

export function formatIndicatorValue(value, valueType, unit) {
  if (value === null || value === undefined) return '—';
  if (valueType === 'CURRENCY' || unit === 'BRL') return formatCurrency(value);
  if (valueType === 'PERCENT' || valueType === 'PERCENTAGE' || unit === 'PERCENT') return formatPercent(value);
  if (typeof value === 'number' || !Number.isNaN(Number(value))) return formatNumber(value);
  return String(value);
}

export function parseIndicatorLabel(value = '') {
  const normalized = String(value).trim();
  const match = normalized.match(/^(.+?)([A-Z][A-Z0-9_]+)$/u);
  return match ? { category: match[1].trim(), code: match[2] } : { category: normalized, code: '' };
}

export function formatIndicatorCode(code = '') {
  return String(code)
    .replace(/_/g, ' ')
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|\s)\p{L}/gu, (character) => character.toLocaleUpperCase('pt-BR'));
}

export function formatIndicatorSource(source = '', year = '') {
  const raw = String(source).trim();
  const legacy = raw.match(/^(\d{4})([A-Z][A-Z0-9_]+)$/u);
  const resolvedYear = year || legacy?.[1] || '';
  const resolvedSource = legacy?.[2] || raw;
  const label = formatIndicatorCode(resolvedSource);
  return [label, resolvedYear].filter(Boolean).join(' · ');
}
