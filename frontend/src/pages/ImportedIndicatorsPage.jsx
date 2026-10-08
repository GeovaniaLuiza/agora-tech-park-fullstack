import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { getConfirmedImportIndicators, getInnovationCenters } from '../services/api.js';
import OfficialWorkbookDownload from '../components/OfficialWorkbookDownload.jsx';

const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const modes = { PRESENTIAL: 'Presencial', ONLINE: 'Online', HYBRID: 'Híbrido' };
const informed = (value) => value === null || value === undefined || value === '' ? 'Não informado' : value;
const date = (value) => value ? new Date(value).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : 'Não informado';

export default function ImportedIndicatorsPage({ type }) {
  const resident = type === 'RESIDENTS';
  const slug = resident ? 'residentes' : 'eventos';
  const [params, setParams] = useSearchParams();
  const [centers, setCenters] = useState([]);
  const [response, setResponse] = useState(null);
  const [centersError, setCentersError] = useState('');
  const centerId = params.get('centerId') || centers[0]?.id || '';
  const year = params.get('year') || String(new Date().getFullYear());
  const month = params.get('month') || '';
  const requestKey = `${type}:${centerId}:${year}:${month}`;
  const current = response?.key === requestKey ? response : null;
  const data = current?.data;
  const error = centersError || current?.error;
  const loading = Boolean(centerId && !current);
  const change = (key, value) => { const next = new URLSearchParams(params); next.set('centerId', centerId); next.set('year', year); if (value) next.set(key, value); else next.delete(key); setParams(next); };
  useEffect(() => {
    let active = true;
    getInnovationCenters().then((items) => {
      if (!active) return;
      if (!Array.isArray(items) || items.some((center) => !center?.id)) throw new Error('Resposta inválida ao carregar centros.');
      setCenters(items);
    }).catch((reason) => { if (active) setCentersError(reason.message); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!centerId) return;
    let active = true;
    getConfirmedImportIndicators(type, { centerId, year, ...(month ? { month } : {}) }).then((result) => { if (active) setResponse({ key: requestKey, data: result }); })
      .catch((reason) => { if (active) setResponse({ key: requestKey, error: reason.message }); });
    return () => { active = false; };
  }, [type, centerId, year, month, requestKey]);
  const headers = resident ? ['Empresa', 'CNPJ', 'Vigência', 'Fim', 'Bloco', 'Bloco e Módulo', 'Área', 'Atividades', 'Nacionalidade']
    : ['Evento', 'Data', 'Local', 'Temática', 'Modo', 'Nº de Participantes', 'Tipo', 'Nº de Empresas Participantes'];
  const rows = (data?.records || []).flatMap((record) => resident
    ? (record.extra?.contracts?.length ? record.extra.contracts : [{}]).map((contract, index) => ({ id: `${record.id}:${index}`, cells: [record.name, record.extra?.documentFormatted || record.extra?.document, date(contract.startDate), date(contract.endDate), contract.block, contract.unit, contract.area == null ? null : `${Number(contract.area).toLocaleString('pt-BR')} m²`, contract.sector, contract.nationality] }))
    : [{ id: record.id, cells: [record.name, date(record.event_at), record.location, record.theme, modes[record.mode] || record.mode, record.participants, record.subtype, record.participating_companies] }]);
  return <div className="content indicator-import-page"><header className="import-heading"><div><h2>Indicadores de {resident ? 'Residentes' : 'Eventos'}</h2><p>Registros confirmados e considerados nos indicadores.</p></div><Link className="button secondary" to={`/indicadores/importar-${slug}`}>Importar {slug}</Link></header>
    <div className="import-filters"><label>Centro<select value={centerId} onChange={(event) => change('centerId', event.target.value)}>{centers.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}</select></label><label>Ano<input type="number" min="2000" max="2200" value={year} onChange={(event) => change('year', event.target.value)} /></label><label>Mês<select value={month} onChange={(event) => change('month', event.target.value)}><option value="">Todos</option>{months.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label></div>
    {error && <div className="error" role="alert">{error}</div>}{loading && <p role="status">Carregando indicadores...</p>}
    {data && <><OfficialWorkbookDownload key={requestKey} centerId={centerId} year={year} /><section className="panel import-table-wrap"><h3>Nº de {resident ? 'Empresas Residentes' : 'Eventos Realizados'}</h3><table className="import-table" aria-label="Indicador mensal"><thead><tr>{[...months, 'Total'].map((name) => <th key={name}>{name}</th>)}</tr></thead><tbody><tr>{[...data.monthly, data.total].map((value, index) => <td key={index}>{value}</td>)}</tr></tbody></table>{resident && <p>Total anual: {data.annualAggregation === 'LAST_VALUE' ? 'posição de dezembro' : data.annualAggregation === 'AVERAGE' ? 'média mensal' : 'soma dos valores mensais'}, conforme configuração do indicador.</p>}</section>
      <section className="panel import-table-wrap"><h3>{resident ? 'Residentes e ocupações' : 'Eventos considerados'}</h3><table className="import-table" aria-label="Registros confirmados"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id}>{row.cells.map((cell, index) => <td key={index}>{informed(cell)}</td>)}</tr>)}</tbody></table>{!rows.length && <p className="empty-state">Nenhum registro confirmado para o período.</p>}</section></>}
  </div>;
}
