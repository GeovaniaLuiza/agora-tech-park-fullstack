import { months, numericValue } from '../../config/officialIndicators.js';
import { formatIndicatorValue } from '../../utils/formatters.js';

export default function MonthlyIndicatorChart({ item, month = '' }) {
  const values = months.map((_, index) => numericValue(item.monthly_values?.find((entry) => Number(entry.month) === index + 1)?.value));
  const known = values.filter((value) => value !== null);
  const min = Math.min(0, ...known);
  const max = Math.max(0, ...known);
  const scale = max - min || 1;
  const point = (value, index) => ({ x: 30 + index * 46, y: 145 - (value - min) / scale * 125 });
  // Each missing month breaks the line. No interpolation or fabricated zero.
  const path = values.map((value, index) => {
    if (value === null) return '';
    const { x, y } = point(value, index);
    return `${index > 0 && values[index - 1] !== null ? 'L' : 'M'}${x},${y}`;
  }).join(' ');
  return <div className="official-monthly-chart">
    {known.length ? <svg viewBox="0 0 566 175" role="img" aria-label={`Série mensal de ${item.name}`}>
      {[20, 82, 145].map((y) => <line key={y} x1="25" x2="541" y1={y} y2={y} stroke="var(--line)" />)}
      <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2.5" />
      {values.map((value, index) => value === null ? null : <circle key={index} {...{ cx: point(value, index).x, cy: point(value, index).y }} r={Number(month) === index + 1 ? 5 : 3} fill="var(--primary)"><title>{months[index]}: {formatIndicatorValue(value, item.value_type, item.unit)}</title></circle>)}
      {months.map((label, index) => <text key={label} x={point(0, index).x} y="169" textAnchor="middle" fill="var(--muted)" fontSize="10">{label}</text>)}
    </svg> : <svg viewBox="0 0 566 175" role="img" aria-label={`Sem dados mensais de ${item.name}`}>
      <text x="283" y="82" textAnchor="middle" fill="var(--muted)" fontSize="13">Sem dados</text>
      {months.map((label, index) => <text key={label} x={point(0, index).x} y="169" textAnchor="middle" fill="var(--muted)" fontSize="10">{label}</text>)}
    </svg>}
    <details><summary>Valores mensais · Jan–Dez</summary><dl>{months.map((label, index) => <div key={label}><dt>{label}</dt><dd>{values[index] === null ? 'Sem dados' : formatIndicatorValue(values[index], item.value_type, item.unit)}</dd></div>)}</dl></details>
  </div>;
}
