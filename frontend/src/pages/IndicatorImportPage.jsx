import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Download, FileSpreadsheet, RotateCcw, Save, Upload } from 'lucide-react';
import { Link } from 'react-router-dom';
import ExportDialog from '../components/IndicatorExportDialog.jsx';
import { IMPORT_FILE_TOO_LARGE_MESSAGE, MAX_IMPORT_BYTES } from '../config/indicatorImport.js';
import {
  confirmIndicatorImport, downloadOfficialIndicatorWorkbook, getIndicatorImportDraft, getIndicatorImportOptions,
  getInnovationCenters, getOfficialWorkbookStatus, groupImportedEvents, saveIndicatorImportReview, uploadIndicatorImport,
} from '../services/api.js';

const TYPES = {
  EVENTS: { title: 'Importar Indicadores de Eventos', subtitle: 'Importe Eventos.xlsx, revise os registros e selecione quais serão considerados eventos.' },
  RESIDENTS: { title: 'Importar Empresas Residentes', subtitle: 'Importe Clientes.xlsx e revise as empresas e suas ocupações no HUB, MOB e UNI.' },
};
const steps = ['Arquivo', 'Validação', 'Preview', 'Revisão', 'Confirmar', 'Indicadores atualizados', 'Baixar XLSX'];
const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PAGE_SIZE = 20;
const statusLabels = { VALID: 'Válido', WARNING: 'Aviso', REVIEW_REQUIRED: 'Revisão necessária', IGNORED: 'Ignorado', PENDING: 'Pendente de revisão', REVIEW_PENDING: 'Pendente de revisão', VALIDATED: 'Validado', WITH_WARNINGS: 'Com alertas', IMPORTED: 'Importado', PROCESSING: 'Processando', FAILED: 'Erro', EXCLUDED: 'Excluído', ACTIVE: 'Ativa', ENDED: 'Encerrada', FUTURE: 'Futura' };
const modeLabels = { PRESENTIAL: 'Presencial', HYBRID: 'Híbrido', ONLINE: 'Online', NOT_INFORMED: 'Não informado' };
const downloadBlob = ({ blob, filename }) => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); };

function Stepper({ active }) {
  return <ol className="import-stepper">{steps.map((label, index) => <li className={index + 1 < active ? 'done' : index + 1 === active ? 'active' : ''} key={label}><span>{index + 1 < active ? <Check /> : index + 1}</span><small>{label}</small></li>)}</ol>;
}
function SummaryCards({ type, summary = {} }) {
  const entries = type === 'EVENTS'
    ? [['Registros encontrados', summary.records], ['Válidos', summary.valid], ['Com aviso', summary.warnings], ['Revisão necessária', summary.needsReview], ['Ignorados', summary.ignored]]
    : [['Linhas lidas', summary.rowsRead], ['Empresas identificadas', summary.companies], ['CNPJs únicos', summary.uniqueCnpjs], ['Ocupações', summary.occupations], ['Válidos', summary.valid], ['Avisos', summary.warnings], ['Revisão necessária', summary.needsReview], ['Ignorados', summary.ignored]];
  entries.push(['Incluídos', summary.included], ['Inválidos ainda incluídos / pendentes', summary.invalidIncluded]);
  return <section className="import-summary">{entries.map(([label, value]) => <article className="panel" key={label}><small>{label}</small><strong>{value ?? 0}</strong></article>)}</section>;
}
const eventColumns = ['Lista', 'Data', 'Local', 'Temática', 'Modo', 'Tipo de Evento', 'Nº de Participantes', 'Nº de Empresas Participantes'];
const validationOf = (item) => item.ignored || item.reviewStatus === 'EXCLUDED' ? 'IGNORED' : item.validationStatus || (item.reviewStatus === 'WITH_WARNINGS' ? 'WARNING' : item.reviewStatus === 'PENDING' ? 'REVIEW_REQUIRED' : 'VALID');
const residentColumns = ['Legenda', 'Locador', 'Bloco', 'Bloco e Modúlo', 'Área', 'EMPRESA', 'CNPJ', 'Vigência', 'Fim', 'Atividades', 'Nacionalidade'];
const areaLabel = (area) => area === null || area === undefined ? 'Não informado' : Number(area).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' m²';
function readItems(batch, type) {
  if (batch?.importType !== type || !Array.isArray(batch?.draft?.items) || batch.draft.items.some((item) => !item || !Array.isArray(item.sourceRows)
    || (item.issues != null && (!Array.isArray(item.issues) || item.issues.some((issue) => !issue)))
    || (item.rooms != null && !Array.isArray(item.rooms))
    || ['name', 'location', 'startAt'].some((field) => item[field] != null && typeof item[field] !== 'string')
    || (type === 'RESIDENTS' && (!Array.isArray(item.contracts) || item.contracts.some((contract) => !contract))))) {
    throw new Error('O lote de importação possui dados inválidos. Recarregue ou valide o arquivo novamente.');
  }
  return batch.draft.items;
}
function FormatGuide({ type, maxBytes }) {
  if (type === 'RESIDENTS') return <section className="panel import-format"><h3>Formato esperado</h3><p>Aba: Clientes · Cabeçalho: linha 2 · Formato: XLSX · Limite: {Math.round(maxBytes / 1024 / 1024)} MB</p><p>{residentColumns.join(' · ')}</p><p>Empresas com o mesmo CNPJ serão consolidadas. Múltiplas salas/módulos serão preservadas. Disponível e Áreas Comuns não geram residentes.</p></section>;
  return <section className="panel import-format"><h3>Formato esperado</h3><p>Aba: Eventos · Cabeçalho: linha 1 · Formato: XLSX · Limite: {Math.round(maxBytes / 1024 / 1024)} MB</p><div className="import-column-groups"><div><strong>Campos principais</strong><p>{eventColumns.slice(0, 3).join(' · ')}</p></div><div><strong>Campos complementares</strong><p>{eventColumns.slice(3).join(' · ')}</p></div></div><p>Mantenha as oito colunas na ordem indicada. Os campos complementares podem ficar vazios.</p></section>;
}
function ReviewAlerts({ issues = [] }) {
  return issues?.length ? <ul className="import-review-alerts">{issues.map((issue, index) => <li key={index}><AlertTriangle />{issue.message}</li>)}</ul> : null;
}
function MonthlyPreview({ values = [], resident = false }) {
  return <section className="panel monthly-preview"><header><h3>Preview mensal</h3><small>{resident ? 'Empresas ativas no mês, sem duplicar contratos ou salas.' : 'Somente eventos selecionados e válidos.'}</small></header><div>{months.map((month, index) => <span key={month}><small>{month}</small><strong>{values[index] ?? 0}</strong></span>)}</div></section>;
}
function Status({ value }) { return <span className={`import-status ${String(value || '').toLowerCase()}`}>{statusLabels[value] || value}</span>; }

const reviewDecision = (item, included) => ({
  ...item, included,
  reviewStatus: !included ? 'EXCLUDED' : item.issues?.length && item.validationStatus !== 'WARNING' ? 'PENDING' : item.discontinuous ? 'WITH_WARNINGS' : 'VALIDATED',
  validationStatus: !included ? 'IGNORED' : item.issues?.length && item.validationStatus !== 'WARNING' ? 'REVIEW_REQUIRED' : item.validationStatus === 'WARNING' || item.discontinuous || item.duplicateGroup ? 'WARNING' : 'VALID',
});
function IgnoreRecord({ item, setItems, disabled }) {
  if (item.ignored) return null;
  const excluded = item.reviewStatus === 'EXCLUDED';
  return <button className="button secondary" disabled={disabled} onClick={() => setItems((current) => current.map((record) => record.id === item.id ? reviewDecision(record, excluded) : record))}>{excluded ? 'Restaurar' : 'Ignorar registro'}</button>;
}

function IgnoreIncompleteDialog({ count, onCancel, onIgnore, disabled }) {
  const dialog = useRef(null);
  useEffect(() => {
    const previousFocus = document.activeElement;
    dialog.current.querySelector('button').focus();
    return () => previousFocus?.focus();
  }, []);
  const onKeyDown = (event) => {
    if (event.key === 'Escape') onCancel();
    if (event.key !== 'Tab') return;
    const buttons = [...dialog.current.querySelectorAll('button:not(:disabled)')];
    const target = event.shiftKey ? buttons.at(-1) : buttons[0];
    if (document.activeElement === (event.shiftKey ? buttons[0] : buttons.at(-1))) {
      event.preventDefault();
      target.focus();
    }
  };
  return <div ref={dialog} className="management-modal" role="dialog" aria-modal="true" aria-labelledby="ignore-incomplete-title" aria-describedby="ignore-incomplete-description" onKeyDown={onKeyDown}>
    <section className="panel export-dialog">
      <h2 id="ignore-incomplete-title">Ignorar {count} registros inválidos?</h2>
      <p id="ignore-incomplete-description">Esses registros não serão considerados na atualização dos indicadores. Eles poderão ser restaurados antes da confirmação da importação.</p>
      <footer><button className="button secondary" onClick={onCancel}>Cancelar</button><button className="button danger" disabled={disabled || !count} onClick={onIgnore}>Ignorar registros</button></footer>
    </section>
  </div>;
}

function Pagination({ page, totalItems, onChange }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
  if (totalPages === 1) return null;
  const firstItem = (page - 1) * PAGE_SIZE + 1;
  const lastItem = Math.min(page * PAGE_SIZE, totalItems);
  return <nav className="import-pagination" aria-label="Paginação dos resultados">
    <span>Exibindo {firstItem}–{lastItem} de {totalItems}</span>
    <div><button className="button secondary" disabled={page === 1} onClick={() => onChange(page - 1)}>Anterior</button><strong>Página {page} de {totalPages}</strong><button className="button secondary" disabled={page === totalPages} onClick={() => onChange(page + 1)}>Próxima</button></div>
  </nav>;
}

function EventFilters({ filters, setFilters }) {
  const set = (name) => (event) => setFilters((current) => ({ ...current, [name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  return <div className="import-filters">
    <label>Data<input type="date" value={filters.date} onChange={set('date')} /></label>
    <label>Local<input value={filters.location} onChange={set('location')} placeholder="Buscar local" /></label>
    <label>Nome<input value={filters.name} onChange={set('name')} placeholder="Buscar evento" /></label>
    <label>Status<select value={filters.status} onChange={set('status')}><option value="">Todos</option><option value="REVIEW_REQUIRED">Revisão necessária</option><option value="VALID">Válido</option><option value="WARNING">Aviso</option><option value="IGNORED">Ignorado</option></select></label>
    <label>Inclusão<select value={filters.inclusion} onChange={set('inclusion')}><option value="">Todos</option><option value="included">Incluídos</option><option value="excluded">Excluídos</option></select></label>
    <label>Participantes<select value={filters.participants} onChange={set('participants')}><option value="">Todos</option><option value="with">Com participantes</option><option value="without">Sem participantes</option></select></label>
    <label className="import-check"><input type="checkbox" checked={filters.duplicate} onChange={set('duplicate')} />Possível duplicidade</label>
  </div>;
}

function EventTable({ items, setItems, selected, toggleSelected, modes, eventTypes, disabled }) {
  const change = (id, field, value) => setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value, manuallyCorrected: true } : item));
  const decide = (id, included) => setItems((current) => current.map((item) => item.id === id ? reviewDecision(item, included) : item));
  return <div className="panel import-table-wrap"><datalist id="event-types">{eventTypes.map((type) => <option key={type} value={type} />)}</datalist><table className="import-table event-import-table"><thead><tr><th></th><th>Evento</th><th>Data</th><th>Local</th><th>Temática</th><th>Modo</th><th>Tipo</th><th>Participantes</th><th>Empresas</th><th>Considerar?</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr className={item.duplicateGroup ? 'warning-row' : ''} key={item.id}>
    <td><input disabled={disabled} type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} /></td>
    <td><strong>{item.name || 'Não informado'}</strong><input aria-label={`Evento da linha ${item.sourceRows[0]}`} disabled={disabled} value={item.name || ''} onChange={(event) => change(item.id, 'name', event.target.value)} /><ReviewAlerts issues={item.issues} />{item.duplicateGroup && <small><AlertTriangle /> Possível mesmo evento</small>}</td>
    <td>{item.startAt ? new Date(item.startAt).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : item.dateRaw || 'Não informado'}<input aria-label={`Data da linha ${item.sourceRows[0]}`} disabled={disabled} type="date" value={item.startAt?.slice(0, 10) || ''} onChange={(event) => change(item.id, 'startAt', event.target.value)} /></td>
    <td><input disabled={disabled} aria-label={`Local da linha ${item.sourceRows[0]}`} value={item.location || ''} onChange={(event) => change(item.id, 'location', event.target.value)} placeholder="Não informado" /></td>
    <td><input aria-label={`Temática da linha ${item.sourceRows[0]}`} disabled={disabled} value={item.theme || ''} onChange={(event) => change(item.id, 'theme', event.target.value)} placeholder="Não informado" /></td>
    <td><select disabled={disabled} value={item.mode || ''} onChange={(event) => change(item.id, 'mode', event.target.value)}><option value="">Não informado</option>{item.mode && !modes.includes(item.mode) && <option value={item.mode}>{item.mode}</option>}{modes.map((mode) => <option value={mode} key={mode}>{modeLabels[mode]}</option>)}</select></td>
    <td><input aria-label={`Tipo da linha ${item.sourceRows[0]}`} disabled={disabled} value={item.subtype || ''} onChange={(event) => change(item.id, 'subtype', event.target.value)} placeholder="Não informado" list="event-types" /></td>
    <td><input aria-label={`Participantes da linha ${item.sourceRows[0]}`} disabled={disabled} inputMode="numeric" value={item.participants ?? ''} onChange={(event) => change(item.id, 'participants', event.target.value)} placeholder="Não informado" /></td>
    <td><input aria-label={`Empresas da linha ${item.sourceRows[0]}`} disabled={disabled} inputMode="numeric" value={item.participatingCompanies ?? ''} onChange={(event) => change(item.id, 'participatingCompanies', event.target.value)} placeholder="Não informado" /></td>
    <td><div className="decision-buttons"><button disabled={disabled} className={item.included ? 'yes active' : 'yes'} onClick={() => decide(item.id, true)}>Sim</button><button disabled={disabled} className={!item.included && item.reviewStatus === 'EXCLUDED' ? 'no active' : 'no'} onClick={() => decide(item.id, false)}>Não</button></div></td>
    <td><Status value={validationOf(item)} /><IgnoreRecord item={item} setItems={setItems} disabled={disabled} /></td>
  </tr>)}</tbody></table>{!items.length && <div className="empty-state">Nenhum registro corresponde aos filtros.</div>}</div>;
}

function ResidentFilters({ filters, setFilters }) {
  const set = (name) => (event) => setFilters((current) => ({ ...current, [name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  return <div className="import-filters resident-import-filters"><label className="import-check"><input type="checkbox" checked={filters.onlyBlocks} onChange={set('onlyBlocks')} />Somente HUB / MOB / UNI</label><label>Empresa<input value={filters.name} onChange={set('name')} placeholder="Buscar empresa" /></label><label>Status<select value={filters.status} onChange={set('status')}><option value="">Todos</option><option value="ACTIVE">Ativa</option><option value="ENDED">Encerrada</option><option value="FUTURE">Futura</option></select></label><label>Revisão<select value={filters.review} onChange={set('review')}><option value="">Todos</option><option value="VALID">Válido</option><option value="WARNING">Aviso</option><option value="REVIEW_REQUIRED">Revisão necessária</option><option value="IGNORED">Ignorado</option></select></label></div>;
}

function ResidentTable({ items, setItems, selected, toggleSelected, expanded, toggleExpanded, disabled }) {
  const change = (id, field, value) => setItems((current) => current.map((item) => {
    if (item.id !== id) return item;
    const next = { ...item, [field]: value, manuallyCorrected: true };
    if (field === 'location') next.manualBlockOverride = true;
    if (field === 'rooms') next.manualRoomsOverride = true;
    if (field === 'startDate' || field === 'endDate') {
      next.manualPeriodOverride = true;
      const today = new Date().toISOString().slice(0, 10);
      next.status = next.startDate && next.startDate > today ? 'FUTURE' : next.endDate && next.endDate < today ? 'ENDED' : 'ACTIVE';
    }
    return next;
  }));
  const include = (item, checked) => setItems((current) => current.map((currentItem) => currentItem.id === item.id
    ? { ...currentItem, included: checked, manualBlockOverride: checked && !currentItem.contracts.some((contract) => contract.eligibleBlock), reviewStatus: checked ? currentItem.discontinuous ? 'WITH_WARNINGS' : 'VALIDATED' : 'EXCLUDED' }
    : currentItem));
  return <div className="panel import-table-wrap"><table className="import-table resident-import-table"><thead><tr><th></th><th></th><th>Empresa</th><th>CNPJ</th><th>Tipo</th><th>Local</th><th>Sala(s)</th><th>Entrada</th><th>Saída</th><th>Setor</th><th>Status</th><th>Revisão</th></tr></thead><tbody>{items.map((item) => <Fragment key={item.id}><tr className={item.reviewStatus === 'WITH_WARNINGS' ? 'warning-row' : ''}>
    <td><input disabled={disabled} type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} /></td>
    <td><button className="expand-button" onClick={() => toggleExpanded(item.id)} aria-label={`Ver contratos de ${item.name}`}><ChevronDown className={expanded.has(item.id) ? 'open' : ''} /></button></td>
    <td><label className="resident-decision"><input disabled={disabled || item.ignored} type="checkbox" checked={item.included} onChange={(event) => include(item, event.target.checked)} /><strong>{item.name || 'Empresa não informada'}</strong></label><small>{item.contracts.length} ocupações · Área total: {areaLabel(item.totalArea)}</small><ReviewAlerts issues={item.issues} /></td>
    <td>{item.documentFormatted || item.documentMasked || 'Não informado'}</td><td>{item.contractType || 'Não informado'}</td><td>{item.location || 'Não informado'}</td><td>{item.rooms?.join(', ') || 'Não informado'}</td><td>{item.startDate ? new Date(`${item.startDate}T00:00:00`).toLocaleDateString('pt-BR') : 'Não informada'}</td><td>{item.endDate ? new Date(`${item.endDate}T00:00:00`).toLocaleDateString('pt-BR') : 'Não informada'}</td><td>{item.sector || 'Não informado'}</td><td><Status value={item.status} /></td><td><Status value={validationOf(item)} /><IgnoreRecord item={item} setItems={setItems} disabled={disabled} /></td>
  </tr>{expanded.has(item.id) && <tr className="resident-details"><td colSpan="12"><div><section><h4>Ocupações</h4>{item.contracts.map((contract) => <div className="import-occupation" key={contract.sourceRow}><p><strong>Linha {contract.sourceRow}</strong> · {contract.block || 'Bloco não informado'} — {contract.unit || 'Sala não informada'} — {areaLabel(contract.area)}</p>
      {['block', 'unit', 'areaInput', 'startInput', 'endInput'].map((field) => <label key={field}>{({ block: 'Bloco', unit: 'Sala/módulo', areaInput: 'Área', startInput: 'Vigência', endInput: 'Fim' })[field]}<input disabled={disabled || item.ignored} aria-label={`${field} da linha ${contract.sourceRow}`} value={contract[field] ?? ''} placeholder={field.includes('Input') && field !== 'areaInput' ? 'dd/mm/aaaa' : 'Não informado'} onChange={(event) => change(item.id, 'contracts', item.contracts.map((current) => current.sourceRow === contract.sourceRow ? { ...current, [field]: event.target.value } : current))} /></label>)}
    </div>)}</section><section className="resident-manual-fields"><label>Empresa<input disabled={disabled || item.ignored} value={item.name || ''} onChange={(event) => change(item.id, 'name', event.target.value)} /></label><label>CNPJ<input disabled={disabled || item.ignored} value={item.document ?? ''} onChange={(event) => change(item.id, 'document', event.target.value)} /></label><label>Local<input disabled={disabled} value={item.location || ''} onChange={(event) => change(item.id, 'location', event.target.value)} /></label><label>Salas<input disabled={disabled} value={item.rooms?.join(', ') || ''} onChange={(event) => change(item.id, 'rooms', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} /></label><label>Entrada<input disabled={disabled} type="date" value={item.startDate || ''} onChange={(event) => change(item.id, 'startDate', event.target.value)} /></label><label>Saída<input disabled={disabled} type="date" value={item.endDate || ''} onChange={(event) => change(item.id, 'endDate', event.target.value)} /></label><label>Setor<input disabled={disabled} value={item.sector || ''} onChange={(event) => change(item.id, 'sector', event.target.value)} /></label><label>Resultado<input disabled={disabled} value={item.result || ''} onChange={(event) => change(item.id, 'result', event.target.value)} /></label><label>Programa<input disabled={disabled} value={item.programName || ''} onChange={(event) => change(item.id, 'programName', event.target.value)} /></label><label>Colaboradores entrada<input disabled={disabled} type="number" min="0" value={item.collaboratorsEntry ?? ''} onChange={(event) => change(item.id, 'collaboratorsEntry', event.target.value)} /></label><label>Colaboradores saída<input disabled={disabled} type="number" min="0" value={item.collaboratorsExit ?? ''} onChange={(event) => change(item.id, 'collaboratorsExit', event.target.value)} /></label><label>Propriedade intelectual<input disabled={disabled} value={item.intellectualProperty || ''} onChange={(event) => change(item.id, 'intellectualProperty', event.target.value)} /></label><label>Captação de recursos<input disabled={disabled} type="number" min="0" value={item.fundsRaised ?? ''} onChange={(event) => change(item.id, 'fundsRaised', event.target.value)} /></label><label>Faturamento anual<input disabled={disabled} type="number" min="0" value={item.annualRevenue ?? ''} onChange={(event) => change(item.id, 'annualRevenue', event.target.value)} /></label><label>Relacionamentos internacionais<input disabled={disabled} value={item.internationalRelationships || ''} onChange={(event) => change(item.id, 'internationalRelationships', event.target.value)} /></label></section>{item.discontinuous && <p className="warning-message"><AlertTriangle /> Períodos de ocupação descontínuos. Revise antes de confirmar.</p>}</div></td></tr>}</Fragment>)}</tbody></table>{!items.length && <div className="empty-state">Nenhuma empresa corresponde aos filtros.</div>}</div>;
}
export default function IndicatorImportPage({ type }) {
  return <ImportFlow key={type} type={type} />;
}

function ImportFlow({ type }) {
  const config = TYPES[type];
  const realFormatFlow = type === 'EVENTS' || type === 'RESIDENTS';
  const [centers, setCenters] = useState([]), [centerId, setCenterId] = useState('');
  const [options, setOptions] = useState({ eventModes: [], eventTypes: [], maxBytes: MAX_IMPORT_BYTES });
  const [file, setFile] = useState(null), [batch, setBatch] = useState(null), [items, setItems] = useState([]);
  const [processing, setProcessing] = useState(false), [saving, setSaving] = useState(false), [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [dirty, setDirty] = useState(false), [exported, setExported] = useState(false);
  const [selected, setSelected] = useState(new Set()), [expanded, setExpanded] = useState(new Set());
  const [eventFilters, setEventFilters] = useState({ date: '', location: '', name: '', status: '', inclusion: '', participants: '', duplicate: false });
  const [residentFilters, setResidentFilters] = useState({ onlyBlocks: false, name: '', status: '', review: '' });
  const [groupStrategy, setGroupStrategy] = useState('MANUAL'), [groupParticipants, setGroupParticipants] = useState('');
  const [exportDialog, setExportDialog] = useState(null), [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(1);
  const [stage, setStage] = useState(1);
  const [ignoreDialog, setIgnoreDialog] = useState(false);
  const mounted = useRef(false);
  const fileSelected = useRef(false);
  const confirmationActions = useRef(null);

  useEffect(() => {
    if (stage !== 5) return;
    confirmationActions.current?.scrollIntoView?.({ block: 'start' });
    confirmationActions.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
  }, [stage]);

  useEffect(() => {
    let active = true;
    mounted.current = true;
    Promise.all([getInnovationCenters(), getIndicatorImportOptions()]).then(([loadedCenters, loadedOptions]) => {
      if (!active) return;
      if (!Array.isArray(loadedCenters) || loadedCenters.some((center) => !center?.id)
        || !Array.isArray(loadedOptions?.eventModes) || !Array.isArray(loadedOptions?.eventTypes)
        || !(loadedOptions.maxBytes > 0)) throw new Error('Resposta inválida ao carregar centros e opções de importação.');
      setCenters(loadedCenters); setCenterId((current) => current || loadedCenters[0]?.id || ''); setOptions(loadedOptions);
    }).catch((reason) => { if (active) setError(reason.message); });
    return () => { active = false; mounted.current = false; };
  }, []);
  useEffect(() => {
    if (!centerId) return;
    let active = true;
    getIndicatorImportDraft(type, centerId).then((draft) => {
      if (!active || fileSelected.current || !draft) return;
      const restoredItems = readItems(draft, type);
      if (window.confirm('Existe uma importação não finalizada. Deseja continuar de onde parou?')) { setError(''); setBatch(draft); setItems(restoredItems); setStage(4); }
    }).catch((reason) => { if (active && !fileSelected.current) setError(reason.message); });
    return () => { active = false; };
  }, [centerId, type]);
  useEffect(() => { const leave = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, [dirty]);

  const setReviewedItems = (updater) => { setError(''); setStage(4); setItems(updater); setDirty(true); setMessage(''); };
  const updateEventFilters = (updater) => { setEventFilters(updater); setPage(1); };
  const updateResidentFilters = (updater) => { setResidentFilters(updater); setPage(1); };
  const activeStep = realFormatFlow ? (exported ? steps.length + 1 : stage) : (exported ? steps.length + 1 : batch?.status === 'IMPORTED' ? 7 : batch ? (dirty ? 4 : 3) : processing || file ? 2 : 1);
  const editable = batch && batch.status !== 'IMPORTED';
  const busy = processing || saving || confirming;
  // Row selection is temporary; only included decisions are persisted in the draft.
  const undecidedItems = items.filter((item) => !item.included && !item.ignored && item.reviewStatus !== 'EXCLUDED');
  const eligibleItems = undecidedItems.filter((item) => ['VALID', 'WARNING'].includes(validationOf(item)));
  const includeEligible = () => {
    const ids = new Set(eligibleItems.map((item) => item.id));
    setReviewedItems((current) => current.map((item) => ids.has(item.id) ? reviewDecision(item, true) : item));
  };
  const incompleteItems = items.filter((item) => validationOf(item) === 'REVIEW_REQUIRED');
  const blockingItems = incompleteItems.filter((item) => item.included);
  const ignoreCandidates = stage === 5 ? blockingItems : incompleteItems;
  const ignoreRecords = async (ids) => {
    const reviewed = items.map((item) => ids.has(item.id) ? reviewDecision(item, false) : item);
    if (stage === 5) await save(reviewed);
    else setReviewedItems(reviewed);
  };
  const ignoreIncomplete = () => {
    const ids = new Set(ignoreCandidates.map((item) => item.id));
    void ignoreRecords(ids);
    setIgnoreDialog(false);
  };
  const summary = useMemo(() => {
    if (!batch) return {};
    const counts = { valid: items.filter((item) => validationOf(item) === 'VALID').length, warnings: items.filter((item) => validationOf(item) === 'WARNING').length, needsReview: items.filter((item) => validationOf(item) === 'REVIEW_REQUIRED').length, ignored: items.filter((item) => validationOf(item) === 'IGNORED').reduce((sum, item) => sum + item.sourceRows.length, 0), corrected: items.filter((item) => item.manuallyCorrected).length };
    if (type === 'EVENTS') { const included = items.filter((item) => item.included && !item.ignored && item.reviewStatus !== 'EXCLUDED'); return { ...counts, records: items.length, possibleEvents: items.filter((item) => item.possibleEvent).length, included: included.length, reviewed: items.filter((item) => item.included || item.reviewStatus === 'EXCLUDED').length, excluded: items.filter((item) => item.reviewStatus === 'EXCLUDED').length, duplicates: new Set(items.filter((item) => item.duplicateGroup).map((item) => item.duplicateGroup)).size, missingParticipants: items.filter((item) => item.participants === null || item.participants === '').length, monthly: months.map((_, index) => included.filter((item) => item.startAt && validationOf(item) !== 'REVIEW_REQUIRED' && new Date(item.startAt).getUTCFullYear() === (batch.year || 2026) && new Date(item.startAt).getUTCMonth() === index).length) }; }
    const included = items.filter((item) => item.included && !item.ignored && item.reviewStatus !== 'EXCLUDED'); return { ...batch.summary, ...counts, records: items.filter((item) => !item.ignored).length, included: included.length, excluded: counts.ignored, monthly: months.map((_, index) => { const start = new Date(Date.UTC(batch.year || 2026, index, 1)).toISOString().slice(0, 10), end = new Date(Date.UTC(batch.year || 2026, index + 1, 0)).toISOString().slice(0, 10); return included.filter((item) => validationOf(item) !== 'REVIEW_REQUIRED' && (item.manualPeriodOverride ? (!item.startDate || item.startDate <= end) && (!item.endDate || item.endDate >= start) : item.contracts.some((contract) => (contract.eligibleBlock || item.manualBlockOverride) && (!contract.startDate || contract.startDate <= end) && (!contract.endDate || contract.endDate >= start)))).length; }) };
  }, [batch, items, type]);
  const invalidIncluded = items.filter((item) => item.included && validationOf(item) === 'REVIEW_REQUIRED').length;
  const canConfirm = !busy && summary.included > 0 && invalidIncluded === 0;
  const visibleItems = useMemo(() => type === 'EVENTS' ? items.filter((item) => (!eventFilters.date || item.startAt?.slice(0, 10) === eventFilters.date) && (item.location || '').toLowerCase().includes(eventFilters.location.toLowerCase()) && (item.name || '').toLowerCase().includes(eventFilters.name.toLowerCase()) && (!eventFilters.status || validationOf(item) === eventFilters.status) && (!eventFilters.inclusion || (eventFilters.inclusion === 'included' ? item.included : !item.included)) && (!eventFilters.participants || (eventFilters.participants === 'with' ? item.participants !== null && item.participants !== '' : item.participants === null || item.participants === '')) && (!eventFilters.duplicate || item.duplicateGroup)) : items.filter((item) => (!residentFilters.onlyBlocks || item.contracts.some((contract) => contract.eligibleBlock)) && (item.name || '').toLowerCase().includes(residentFilters.name.toLowerCase()) && (!residentFilters.status || item.status === residentFilters.status) && (!residentFilters.review || validationOf(item) === residentFilters.review)), [type, items, eventFilters, residentFilters]);
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => visibleItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [visibleItems, currentPage]);

  const validate = async (reprocess = false) => { setError(''); if (!file) { setError('Selecione uma planilha XLSX.'); return; } if (file.size > MAX_IMPORT_BYTES) { setError(IMPORT_FILE_TOO_LARGE_MESSAGE); return; } setStage(realFormatFlow ? 2 : 4); setProcessing(true); setMessage(''); try { const loaded = await uploadIndicatorImport(type, centerId, file, reprocess); if (!mounted.current) return; const loadedItems = readItems(loaded, type); setError(''); setBatch(loaded); setItems(loadedItems); setDirty(false); setSelected(new Set()); setPage(1); setMessage('Arquivo validado. Revise os registros antes de confirmar.'); } catch (reason) { if (!mounted.current) return; if (reason.code === 'IMPORT_ALREADY_EXISTS' && !reprocess && window.confirm('Este arquivo já foi processado. Deseja reprocessar conscientemente?')) return validate(true); if (mounted.current) setError(reason.code === 'PAYLOAD_TOO_LARGE' ? IMPORT_FILE_TOO_LARGE_MESSAGE : reason.message); } finally { if (mounted.current) setProcessing(false); } };
  const save = async (reviewedItems = items) => { setSaving(true); setError(''); try { const loaded = await saveIndicatorImportReview(batch.id, reviewedItems); if (!mounted.current) return; const loadedItems = readItems(loaded, type); setError(''); setBatch(loaded); setItems(loadedItems); setDirty(false); setMessage('Revisão salva com sucesso.'); return loaded; } catch (reason) { if (mounted.current) setError(reason.message); } finally { if (mounted.current) setSaving(false); } };
  const advanceToConfirmation = async () => {
    if (!canConfirm) return;
    const saved = dirty ? await save() : batch;
    if (!saved || !mounted.current) return;
    const included = readItems(saved, type).filter((item) => item.included && validationOf(item) !== 'IGNORED');
    if (!included.length || included.some((item) => validationOf(item) === 'REVIEW_REQUIRED')) return;
    setError((current) => current === IMPORT_FILE_TOO_LARGE_MESSAGE ? '' : current);
    setStage(5);
  };
  const confirm = async () => { setConfirming(true); setError(''); try { if (dirty) await saveIndicatorImportReview(batch.id, items); if (!mounted.current) return; const loaded = await confirmIndicatorImport(batch.id); if (!mounted.current) return; const loadedItems = readItems(loaded, type); setError(''); setBatch(loaded); setItems(loadedItems); setDirty(false); setStage(6); setMessage('Importação confirmada e indicadores atualizados.'); } catch (reason) { if (mounted.current) {
    setError(reason.message);
    if (reason.code === 'REVIEW_REQUIRED' && Array.isArray(reason.issues)) {
      setItems((current) => current.map((item) => {
        const issues = reason.issues.filter((issue) => issue.itemId === item.id);
        return item.included && issues.length ? { ...item, issues, validationStatus: 'REVIEW_REQUIRED', reviewStatus: 'PENDING' } : item;
      }));
    }
  } } finally { if (mounted.current) setConfirming(false); } };
  const toggleSelected = (id) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const bulk = (restore) => {
    setReviewedItems((current) => current.map((item) => {
      if (!selected.has(item.id) || item.ignored) return item;
      if (type === 'EVENTS') return {
        ...item, included: restore, reviewStatus: restore ? (item.issues?.length ? 'PENDING' : 'VALIDATED') : 'EXCLUDED',
        validationStatus: restore ? (item.issues?.length ? 'REVIEW_REQUIRED' : item.duplicateGroup ? 'WARNING' : 'VALID') : 'IGNORED',
      };
      return { ...item, included: restore && ((item.validationStatus === 'IGNORED' && Boolean(item.issues?.length)) || item.contracts.some((contract) => contract.eligibleBlock)),
        reviewStatus: restore ? (item.discontinuous ? 'WITH_WARNINGS' : 'VALIDATED') : 'EXCLUDED',
        ...(restore && item.validationStatus === 'IGNORED' ? { reviewStatus: item.issues?.length ? 'PENDING' : item.discontinuous ? 'WITH_WARNINGS' : 'VALIDATED', validationStatus: item.issues?.length ? 'REVIEW_REQUIRED' : item.discontinuous ? 'WARNING' : 'VALID' } : {}) };
    }));
    setSelected(new Set());
  };
  const group = async () => { setError(''); try { if (dirty && !await save()) return; const loaded = await groupImportedEvents(batch.id, { itemIds: [...selected], participantStrategy: groupStrategy, participants: groupParticipants }); if (!mounted.current) return; const loadedItems = readItems(loaded, type); setError(''); setBatch(loaded); setItems(loadedItems); setSelected(new Set()); setDirty(false); setMessage('Reservas agrupadas em um único evento.'); } catch (reason) { if (mounted.current) setError(reason.message); } };
  const openExport = async () => { setStage(7); setError(''); try { const status = await getOfficialWorkbookStatus(centerId, batch?.year || 2026); if (!mounted.current) return; setExportDialog({ status, strategy: 'CANCEL' }); } catch (reason) { if (mounted.current) setError(reason.message); } };
  const generate = async () => { setGenerating(true); try { const report = await downloadOfficialIndicatorWorkbook({ centerId, year: batch?.year || 2026, strategy: exportDialog.strategy }); if (!mounted.current) return; downloadBlob(report); setExported(true); setExportDialog(null); setMessage('Planilha oficial gerada sem alterar o template original.'); } catch (reason) { if (mounted.current) setError(reason.message); } finally { if (mounted.current) setGenerating(false); } };
  const toggleExpanded = (id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <div className="content indicator-import-page"><header className="import-heading"><div><span>INDICADORES · IMPORTAÇÃO</span><h2>{config.title}</h2><p>{config.subtitle}</p></div>{batch && <Status value={batch.status} />}</header><Stepper active={activeStep} />
    {error && !exportDialog && !(realFormatFlow && stage === 5 && editable) && <div className="error" role="alert">{error}</div>}{message && <div className="success-message" role="status">{message}</div>}
    {realFormatFlow && stage === 5 && editable && <section ref={confirmationActions} className="panel import-confirm-actions" aria-label="Confirmação final da importação">
      <div><strong>Etapa 5 · Confirmação final</strong><p>{summary.included} {type === 'EVENTS' ? 'eventos incluídos' : 'empresas incluídas'}. Confirmar importação grava os registros e atualiza os indicadores.</p>{error && !exportDialog && <div className="error" role="alert">{error}</div>}</div>
      {blockingItems.length > 0 && <div className="import-confirm-errors">
        {blockingItems.map((item) => <div key={item.id} role="group" aria-label={`Registro da linha ${item.sourceRows[0]}`}>
          <strong>{item.name || 'Não informado'} · Linha(s): {item.sourceRows.join(', ')}</strong>
          <ReviewAlerts issues={item.issues} />
          <button className="button secondary" disabled={busy} onClick={() => ignoreRecords(new Set([item.id]))}>Ignorar registro</button>
        </div>)}
        {blockingItems.length > 1 && <button className="button secondary" disabled={busy} onClick={() => setIgnoreDialog(true)}>Ignorar registros incorretos</button>}
      </div>}
      <button className="button primary" disabled={!canConfirm} onClick={confirm}>{confirming ? 'Confirmando...' : 'Confirmar importação'}</button>
    </section>}
    <FormatGuide type={type} maxBytes={MAX_IMPORT_BYTES} />
    <section className="panel import-upload"><div><FileSpreadsheet /><div><strong>{file?.name || batch?.fileName || 'Nenhum arquivo selecionado'}</strong><small>Somente XLSX · limite de {Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB · os dados não serão importados antes da confirmação</small>{realFormatFlow && (file || batch) && <small>Tamanho: {((file?.size ?? batch?.fileSize ?? 0) / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} KB · Aba detectada: {batch?.sheetName || 'aguardando validação'} · Linhas: {batch?.summary?.rowsRead ?? 'aguardando validação'}</small>}</div></div><label>Centro<select value={centerId} onChange={(event) => { setCenterId(event.target.value); if (realFormatFlow) { setBatch(null); setItems([]); } }} disabled={busy || (realFormatFlow && Boolean(batch))}>{centers.map((center) => <option value={center.id} key={center.id}>{center.name}</option>)}</select></label><label className="button secondary file-button"><Upload />Selecionar arquivo<input disabled={busy} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { fileSelected.current = true; const nextFile = event.target.files?.[0] || null; setFile(nextFile); if (nextFile && nextFile.size <= MAX_IMPORT_BYTES) setError((current) => current === IMPORT_FILE_TOO_LARGE_MESSAGE ? '' : current); if (realFormatFlow) { setBatch(null); setItems([]); setStage(1); setDirty(false); setExported(false); } }} /></label><button className="button primary" disabled={!file || !centerId || busy} onClick={() => validate(false)}>{processing ? 'Processando...' : 'Validar'}</button></section>
    {batch && <>{editable && realFormatFlow && <nav className="import-actions" aria-label="Etapas da importação">{[2, 3, 4, 5].map((step) => <button key={step} disabled={busy || stage === step || (step === 5 && !canConfirm)} aria-current={stage === step ? 'step' : undefined} className={stage === step ? 'button primary' : 'button secondary'} onClick={() => step === 5 ? advanceToConfirmation() : setStage(step)}>{step === 5 ? 'Ir para confirmação' : steps[step - 1]}</button>)}</nav>}<SummaryCards type={type} summary={{ ...summary, invalidIncluded }} />{(!realFormatFlow || (stage >= 3 && stage <= 4)) && <>{type === 'EVENTS' ? <EventFilters filters={eventFilters} setFilters={updateEventFilters} /> : <ResidentFilters filters={residentFilters} setFilters={updateResidentFilters} />}
      {editable && (!realFormatFlow || stage === 4) && <section className="panel import-review-actions" aria-label="Decisões da revisão"><h3>Decisões da revisão</h3><p>Inclua os registros válidos e com avisos. Corrija ou ignore os registros com erros obrigatórios antes de confirmar.</p><div className="import-actions"><button className="button primary" disabled={busy || !eligibleItems.length} onClick={includeEligible}>Incluir elegíveis</button><button className="button secondary" disabled={busy || !incompleteItems.length} onClick={() => setIgnoreDialog(true)}>Ignorar registros incorretos</button></div></section>}
      {editable && (!realFormatFlow || stage === 4) && <div className="import-actions"><span>{selected.size} selecionado(s)</span>{type === 'EVENTS' ? <><select value={groupStrategy} onChange={(event) => setGroupStrategy(event.target.value)}><option value="MANUAL">Participantes: informar manualmente</option><option value="MAX">Participantes: maior valor</option><option value="SUM">Participantes: somar valores</option></select>{groupStrategy === 'MANUAL' && <input type="number" min="0" value={groupParticipants} onChange={(event) => setGroupParticipants(event.target.value)} placeholder="Participantes" />}<button className="button secondary" disabled={selected.size < 2} onClick={group}>Agrupar selecionados</button></> : <button className="button secondary" onClick={() => setMessage('Empresas já consolidadas por CNPJ; todas as ocupações são preservadas. CNPJ ausente ou inválido exige revisão.')}>Consolidar duplicidades</button>}<button className="button secondary" disabled={busy || !selected.size} onClick={() => bulk(true)}>Incluir selecionados</button><button className="button danger" disabled={!selected.size} onClick={() => bulk(false)}>Excluir dos indicadores</button><button aria-label="Restaurar selecionados" className="button secondary" disabled={!selected.size} onClick={() => bulk(true)}><RotateCcw />Restaurar</button></div>}
      <p>{summary.included} incluído(s) nos indicadores · {undecidedItems.length} sem decisão. {summary.ignored} ignorado(s) · {invalidIncluded} inválido(s) ainda incluído(s) / pendente(s). Os checkboxes da primeira coluna selecionam registros para ações em lote. Use Incluir selecionados ou Incluir elegíveis para decidir a importação.</p>
      {type === 'RESIDENTS' && stage === 4 && invalidIncluded > 0 && <p role="status">A confirmação está bloqueada por {invalidIncluded} registros inválidos ainda incluídos. Corrija esses registros ou use Ignorar registros incorretos; os registros válidos permanecerão incluídos. Salvar revisão preserva as decisões atuais.</p>}
      {type === 'EVENTS' ? <EventTable items={paginatedItems} setItems={setReviewedItems} selected={selected} toggleSelected={toggleSelected} modes={options.eventModes} eventTypes={options.eventTypes} disabled={busy || !editable || (realFormatFlow && stage !== 4)} /> : <ResidentTable items={paginatedItems} setItems={setReviewedItems} selected={selected} toggleSelected={toggleSelected} expanded={expanded} toggleExpanded={toggleExpanded} disabled={busy || !editable || (realFormatFlow && stage !== 4)} />}
      <Pagination page={currentPage} totalItems={visibleItems.length} onChange={setPage} />
      <MonthlyPreview values={summary.monthly} resident={type === 'RESIDENTS'} /></>}
      {realFormatFlow && stage === 5 && editable && <section className="panel import-confirm-summary"><h3>Resumo final</h3>{!summary.included && <p>Nenhum registro incluído. Volte à Revisão e use Incluir selecionados ou Incluir elegíveis.</p>}<p>{type === 'RESIDENTS' ? <>{summary.included} empresas serão importadas/atualizadas · {items.filter((item) => item.included && !item.ignored).reduce((sum, item) => sum + item.contracts.length, 0)} ocupações serão vinculadas · {summary.ignored} registros serão ignorados</> : <>{summary.included} registros serão importados · {items.filter((item) => item.ignored || item.reviewStatus === 'EXCLUDED').length} serão ignorados · {summary.reviewed} foram revisados</>}</p><p>{undecidedItems.length} registros sem decisão não serão importados.</p><p>{invalidIncluded} inválido(s) ainda incluído(s) / pendente(s).</p><p>Confira as decisões antes de confirmar. Registros incluídos com problemas devem ser corrigidos.</p></section>}
      {realFormatFlow && batch.status === 'IMPORTED' && <section className="panel import-confirm-summary"><h3>Importação concluída</h3><Link className="button primary" to={`/indicadores/${type === 'EVENTS' ? 'eventos' : 'residentes'}?${new URLSearchParams({ centerId, year: batch.year || 2026 })}`}>Ver indicadores de {type === 'EVENTS' ? 'eventos' : 'residentes'}</Link><p>Registros processados: {batch.summary?.processed ?? summary.included} · Indicadores atualizados · Ignorados: {batch.summary?.excluded ?? summary.ignored} · Corrigidos manualmente: {summary.corrected}</p></section>}
      {realFormatFlow && stage === 5 && items.some((item) => validationOf(item) === 'IGNORED') && <section className="panel" aria-label="Registros ignorados">
        <h3>Registros ignorados</h3>
        {items.filter((item) => validationOf(item) === 'IGNORED').map((item) => <div key={item.id} role="group" aria-label={`Registro da linha ${item.sourceRows[0]}`}>
          <strong>{item.name || 'Não informado'} · Linha(s): {item.sourceRows.join(', ')}</strong><Status value="IGNORED" /><ReviewAlerts issues={item.issues} />
        </div>)}
      </section>}
      <footer className="import-footer">{editable && (!realFormatFlow || stage >= 4) && <><button className="button secondary" disabled={busy} onClick={() => save()}><Save />{saving ? 'Salvando...' : 'Salvar revisão'}</button>{(!realFormatFlow || stage !== 5) && <button className="button primary" disabled={!canConfirm} onClick={realFormatFlow ? advanceToConfirmation : confirm}>{confirming ? 'Confirmando...' : !realFormatFlow ? 'Confirmar importação' : 'Continuar para confirmação'}</button>}</>}<button className="button secondary" disabled={batch.status !== 'IMPORTED'} onClick={openExport}><Download />Gerar Planilha de Indicadores</button></footer>
    </>}{ignoreDialog && <IgnoreIncompleteDialog count={ignoreCandidates.length} onCancel={() => setIgnoreDialog(false)} onIgnore={ignoreIncomplete} disabled={busy} />}<ExportDialog state={exportDialog} setState={setExportDialog} onGenerate={generate} generating={generating} error={error} /></div>;
}
