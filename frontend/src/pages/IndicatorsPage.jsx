import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, BarChart3 } from 'lucide-react';
import { getIndicators, getIndicatorHistory, getInnovationCenters, downloadIndicatorReport } from '../services/api';
import { useAuth } from '../contexts/AuthContext.jsx';
import { annualRule, hasValue, indicatorBlocks, months, numericValue, overviewCodes, periodValue } from '../config/officialIndicators.js';
import { formatIndicatorValue } from '../utils/formatters.js';
import MonthlyIndicatorChart from '../components/indicators/MonthlyIndicatorChart.jsx';
import '../styles/indicators.css';

const officialFilters = { sourceType: 'SPREADSHEET_IMPORT', officialDashboard: 'true' };
const displayValue = (item, value) => !hasValue(value) ? 'Sem dados' : typeof value === 'object' ? JSON.stringify(value) : formatIndicatorValue(value, item.value_type, item.unit);

function IndicatorCard({ item, month, year, chart = false }) {
  const value = periodValue(item, month);
  const monthly = month ? item.monthly_values?.find((entry) => Number(entry.month) === Number(month)) : null;
  const updated = month ? monthly?.updated_at : item.updated_at;
  return <article className="panel official-kpi" aria-label={item.name}>
    <div className="official-kpi-heading"><h3>{item.name}</h3><BarChart3 aria-hidden="true" /></div>
    <strong className={`official-kpi-value ${!hasValue(value) ? 'missing' : ''}`}>{displayValue(item, value)}</strong>
    <p>{month ? `${months[Number(month) - 1]} de ${year}` : `${year} · ${annualRule(item)}`}</p>
    {chart && <MonthlyIndicatorChart item={item} month={month} />}
    <footer><span>{item.unit} · Planilha oficial</span><span>{updated ? `Atualizado em ${new Date(updated).toLocaleDateString('pt-BR')}` : 'Sem atualização no período'}</span></footer>
  </article>;
}

function Comparison({ item, previous, month, year }) {
  const current = numericValue(periodValue(item, month));
  const old = previous ? numericValue(periodValue(previous, month)) : null;
  const scale = Math.max(Math.abs(current ?? 0), Math.abs(old ?? 0), 1);
  const change = current !== null && old !== null && old !== 0 ? (current - old) / Math.abs(old) : null;
  return <div className="official-comparison"><h4>{item.name}</h4><div className="official-comparison-values">{[[String(Number(year) - 1), old], [year, current]].map(([label, value]) => <div key={label}><span>{month ? `${months[Number(month) - 1]}/` : ''}{label} · {displayValue(item, value)}</span><div className="official-track">{value !== null && <i style={{ width: `${Math.abs(value) / scale * 100}%` }} />}</div></div>)}</div><small>{change === null ? 'Variação: Sem dados' : `Variação: ${change > 0 ? '+' : ''}${new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(change)}`}</small></div>;
}

export default function IndicatorsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [metadata, setMetadata] = useState(null);
  const [response, setResponse] = useState(null);
  const [exportError, setExportError] = useState('');
  const [exporting, setExporting] = useState(false);
  const centers = metadata?.centers || [];
  const centerId = params.get('centerId') || centers[0]?.id || '';
  const year = params.get('year') || String(new Date().getFullYear());
  const month = params.get('month') || '';
  const category = params.get('category') || '';
  const requestKey = `${centerId}:${year}`;
  const current = response?.key === requestKey ? response : null;
  const change = (key, value) => { const next = new URLSearchParams(params); next.set('centerId', centerId); next.set('year', year); if (value) next.set(key, value); else next.delete(key); setParams(next); };

  useEffect(() => {
    let active = true;
    Promise.all([getInnovationCenters(), getIndicatorHistory()]).then(([items, years]) => {
      if (!Array.isArray(items) || !Array.isArray(years)) throw new Error('Resposta inválida ao carregar filtros.');
      if (active) setMetadata({ centers: items, years });
    }).catch((reason) => { if (active) setMetadata({ error: reason.message }); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!centerId) return;
    let active = true;
    // Load the full year once so period filters retain the Jan–Dec series.
    Promise.allSettled([getIndicators({ centerId, year, ...officialFilters }), getIndicators({ centerId, year: String(Number(year) - 1), ...officialFilters })]).then(([now, before]) => {
      if (!active) return;
      if (now.status === 'rejected') throw now.reason;
      else if (!Array.isArray(now.value)) setResponse({ key: requestKey, error: 'Resposta inválida ao carregar indicadores.' });
      else setResponse({ key: requestKey, items: now.value, previous: before.status === 'fulfilled' && Array.isArray(before.value) ? before.value : [], comparisonError: before.status === 'rejected' ? 'Comparativo indisponível: não foi possível consultar o ano anterior.' : '' });
    }).catch((reason) => {
      if (active) setResponse({ key: requestKey, error: reason?.message || 'Não foi possível carregar indicadores.' });
    });
    return () => { active = false; };
  }, [centerId, year, requestKey]);

  const groups = indicatorBlocks.map((block) => ({ ...block, items: (current?.items || []).filter((item) => block.codes.includes(item.code)) })).filter((block) => block.items.length && (!category || category === block.name));
  const items = groups.flatMap((group) => group.items);
  const availableCategories = indicatorBlocks.filter((block) => (current?.items || []).some((item) => block.codes.includes(item.code)));
  const featured = overviewCodes.map((code) => items.find((item) => item.code === code)).filter(Boolean);
  const highlights = ['FATURAMENTO_EMPRESAS', 'COLABORADORES_EMPRESAS'].map((code) => items.find((item) => item.code === code)).filter(Boolean);
  const years = [...new Set([year, '2026', ...(metadata?.years || []).map(String)])].sort((a, b) => Number(b) - Number(a));
  const error = metadata?.error || current?.error || exportError;
  const loading = !metadata || Boolean(centerId && !current);

  const download = async (format) => {
    setExporting(true); setExportError('');
    try {
      const filters = { centerId, year, period: month ? `${year}-${String(month).padStart(2, '0')}` : year, ...officialFilters, codes: items.map((item) => item.code).join(',') };
      if (format === 'pdf') filters.categoryLabel = category || 'Todas';
      const report = await downloadIndicatorReport(format, filters);
      const url = URL.createObjectURL(report.blob);
      try { const anchor = document.createElement('a'); anchor.href = url; anchor.download = report.filename; anchor.click(); }
      finally { URL.revokeObjectURL(url); }
    } catch (reason) { setExportError(reason.message); }
    finally { setExporting(false); }
  };

  return <div className="content official-indicators-page">
    <div className="official-filters"><label>Centro<select value={centerId} onChange={(event) => change('centerId', event.target.value)}>{centers.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}</select></label><label>Ano<select value={year} onChange={(event) => change('year', event.target.value)}>{years.map((value) => <option key={value}>{value}</option>)}</select></label><label>Período<select value={month} onChange={(event) => change('month', event.target.value)}><option value="">Consolidado anual</option>{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label><label>Categoria<select value={category} onChange={(event) => change('category', event.target.value)}><option value="">Todas</option>{availableCategories.map((block) => <option key={block.name}>{block.name}</option>)}</select></label>
      {user?.role !== 'RESIDENTE' && <div className="official-exports">{['pdf', 'excel', 'csv'].map((format) => <button key={format} className="button secondary" disabled={loading || !items.length || exporting} onClick={() => download(format)}><Download />{format === 'excel' ? 'Excel' : format.toUpperCase()}</button>)}</div>}
    </div>
    <p className="official-source">Indicadores oficiais · Valores importados da planilha oficial · Campos não preenchidos aparecem como “Sem dados”.</p>
    {error && <div className="error" role="alert">{error}</div>}{loading && <p role="status">Carregando indicadores...</p>}
    {current?.items && <><section aria-label="Visão geral"><h2>Visão geral</h2><div className="official-kpi-grid">{featured.map((item) => <IndicatorCard key={item.code} item={item} month={month} year={year} />)}</div><div className="official-highlight-grid">{highlights.map((item) => <IndicatorCard key={item.code} item={item} month={month} year={year} chart />)}</div>
      <div className="official-summary-grid"><article className="panel official-distribution"><h3>Distribuição por categoria</h3><p>Quantidade de indicadores com dados no período</p>{groups.map((group) => { const count = group.items.filter((item) => hasValue(periodValue(item, month))).length; return <div key={group.name}><div><span>{group.name}</span><strong>{count} de {group.items.length}</strong></div><div className="official-track"><i style={{ width: `${count / group.items.length * 100}%` }} /></div></div>; })}</article>
      <article className="panel"><h3>Comparativo com o ano anterior</h3><p>Mesmo período · {Number(year) - 1} e {year}</p>{current.comparisonError && <p role="status">{current.comparisonError}</p>}{items.filter((item) => !['TEXT', 'BOOLEAN'].includes(item.value_type)).slice(0, 4).map((item) => <Comparison key={item.code} item={item} previous={current.previous.find((row) => row.code === item.code)} month={month} year={year} />)}{!items.length && <p>Sem dados</p>}</article></div>
    </section>{groups.map((group) => <section key={group.name} aria-label={group.name}><div className="official-section-heading"><h2>{group.name}</h2><span>{group.items.length} indicadores</span></div><div className="official-block-grid">{group.items.map((item) => <IndicatorCard key={item.code} item={item} month={month} year={year} chart={(item.periodicity === 'MONTHLY' || Boolean(item.monthly_values?.length)) && !['TEXT', 'BOOLEAN'].includes(item.value_type)} />)}</div></section>)}</>}
    {!loading && !error && !items.length && <article className="panel empty-state">Nenhum indicador oficial encontrado para os filtros.</article>}
  </div>;
}
