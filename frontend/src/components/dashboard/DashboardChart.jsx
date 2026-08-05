import { formatCurrency, formatNumber } from '../../utils/formatters.js';

const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const colors = ['#234fbd', '#19a86b', '#dc7a22', '#7c3aed'];

const valueLabel = (value, unit) => unit === 'BRL' ? formatCurrency(value) : formatNumber(value);

export default function DashboardChart({ title, subtitle, series = [], type = 'line', height = 230 }) {
  const all = series.flatMap((item) => item.points.map((point) => Number(point.value)));
  if (!all.length) return <div className="chart-empty">Sem dados para o gráfico.</div>;
  const minValue = Math.min(0, ...all);
  const maxValue = Math.max(1, ...all);
  const range = maxValue - minValue || 1;
  const left = 44; const top = 18; const width = 520; const plotHeight = 164;
  const x = (month) => left + ((month - 1) / 11) * width;
  const y = (value) => top + ((maxValue - value) / range) * plotHeight;
  const zeroY = y(0);
  const barWidth = Math.min(18, 36 / Math.max(series.length, 1));
  const summary = series.map((item) => `${item.name}: ${item.points.map((point) => `${monthLabels[point.month - 1]} ${valueLabel(point.value, item.unit)}`).join(', ')}`).join('. ');
  return <article className="panel dashboard-chart-card">
    <header><div><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</div><div className="chart-legend">{series.map((item, index) => <span key={item.code}><i style={{ background: colors[index % colors.length] }} />{item.name}</span>)}</div></header>
    <div className="dashboard-chart" style={{ minHeight: height }}>
      <svg viewBox="0 0 600 230" role="img" aria-label={`${title}. ${summary}`}>
        {[0, .25, .5, .75, 1].map((ratio) => { const value = minValue + range * ratio; return <g key={ratio}><line x1={left} x2={left + width} y1={y(value)} y2={y(value)} stroke="#e5eaf1" /><text x={left - 7} y={y(value) + 4} textAnchor="end">{formatNumber(value, { notation: Math.abs(value) >= 1000000 ? 'compact' : 'standard', maximumFractionDigits: 1 })}</text></g>; })}
        <line x1={left} x2={left + width} y1={zeroY} y2={zeroY} stroke={minValue < 0 ? '#8b96a8' : '#dfe6ee'} />
        {type === 'line' ? series.map((item, index) => {
          const points = item.points.map((point) => `${x(point.month)},${y(point.value)}`).join(' ');
          return <g key={item.code}><polyline points={points} fill="none" stroke={colors[index % colors.length]} strokeWidth="3" />{item.points.map((point) => <circle key={point.month} cx={x(point.month)} cy={y(point.value)} r="4" fill={colors[index % colors.length]}><title>{monthLabels[point.month - 1]}: {valueLabel(point.value, item.unit)}</title></circle>)}</g>;
        }) : series.map((item, seriesIndex) => <g key={item.code}>{item.points.map((point) => {
          const offset = (seriesIndex - (series.length - 1) / 2) * barWidth;
          const pointY = y(point.value); const barY = Math.min(pointY, zeroY); const barHeight = Math.max(1, Math.abs(zeroY - pointY));
          return <rect key={point.month} x={x(point.month) + offset - barWidth / 2} y={barY} width={barWidth - 2} height={barHeight} rx="2" fill={colors[seriesIndex % colors.length]}><title>{monthLabels[point.month - 1]}: {valueLabel(point.value, item.unit)}</title></rect>;
        })}</g>)}
        {monthLabels.map((label, index) => <text key={label} x={x(index + 1)} y="218" textAnchor="middle">{label}</text>)}
      </svg>
    </div>
    <details className="chart-accessible-summary"><summary>Ver resumo dos dados</summary><p>{summary}</p></details>
  </article>;
}
