import { ArrowDownRight, ArrowRight, ArrowUpRight, Info } from 'lucide-react';
import { formatDate, formatIndicatorValue, formatPercent } from '../../utils/formatters.js';

export default function KpiCard({ item, icon }) {
  const Direction = item.direction === 'UP' ? ArrowUpRight : item.direction === 'DOWN' ? ArrowDownRight : ArrowRight;
  return <article className="institutional-kpi">
    <div className="kpi-heading"><span className="kpi-icon">{icon}</span><span className="kpi-source">Planilha oficial</span></div>
    <div className="kpi-title"><h3>{item.title}</h3><span className="tooltip" tabIndex="0" aria-label={item.description || item.title}><Info /></span></div>
    <strong>{formatIndicatorValue(item.value, item.valueType, item.unit)}</strong>
    <div className="kpi-meta"><span>{item.period}</span><span>Atualizado em {formatDate(item.updatedAt)}</span></div>
    {item.variationPercent !== null && <div className={`kpi-variation ${item.direction?.toLowerCase()}`}><Direction />{item.variationAbsolute > 0 ? '+' : ''}{formatIndicatorValue(item.variationAbsolute, item.valueType, item.unit)} ({formatPercent(item.variationPercent / 100)})</div>}
  </article>;
}
