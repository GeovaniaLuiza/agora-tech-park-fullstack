import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Download, FileSpreadsheet, RotateCcw, Save, Upload, X } from 'lucide-react';
import {
  confirmIndicatorImport, downloadOfficialIndicatorWorkbook, getIndicatorImportDraft, getIndicatorImportOptions,
  getInnovationCenters, getOfficialWorkbookStatus, groupImportedEvents, saveIndicatorImportReview, uploadIndicatorImport,
} from '../services/api.js';

const TYPES = {
  EVENTS: { title: 'Importar Indicadores de Eventos', subtitle: 'Importe a planilha de agendamentos, revise os registros e selecione quais reservas devem ser consideradas eventos.' },
  RESIDENTS: { title: 'Importar Empresas Residentes', subtitle: 'Importe a relação de locatários e identifique automaticamente as empresas residentes no HUB, MOB e UNI.' },
};
const steps = ['Arquivo', 'Validação', 'Preview', 'Revisão', 'Confirmar', 'Indicadores atualizados', 'Baixar XLSX'];
const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const PAGE_SIZE = 20;
const statusLabels = { PENDING: 'Pendente de revisão', REVIEW_PENDING: 'Pendente de revisão', VALIDATED: 'Validado', WITH_WARNINGS: 'Com alertas', IMPORTED: 'Importado', PROCESSING: 'Processando', FAILED: 'Erro', EXCLUDED: 'Excluído', ACTIVE: 'Ativa', ENDED: 'Encerrada', FUTURE: 'Futura' };
const modeLabels = { PRESENTIAL: 'Presencial', HYBRID: 'Híbrido', ONLINE: 'Online', NOT_INFORMED: 'Não informado' };
const downloadBlob = ({ blob, filename }) => { const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = filename; anchor.click(); URL.revokeObjectURL(url); };

function Stepper({ active }) {
  return <ol className="import-stepper">{steps.map((label, index) => <li className={index + 1 < active ? 'done' : index + 1 === active ? 'active' : ''} key={label}><span>{index + 1 < active ? <Check /> : index + 1}</span><small>{label}</small></li>)}</ol>;
}
function SummaryCards({ type, summary = {} }) {
  const entries = type === 'EVENTS'
    ? [['Registros encontrados', summary.records], ['Possíveis eventos', summary.possibleEvents], ['Incluídos', summary.included], ['Excluídos', summary.excluded], ['Possíveis duplicidades', summary.duplicates], ['Sem participantes', summary.missingParticipants]]
    : [['Empresas consolidadas', summary.records], ['Incluídas', summary.included], ['Excluídas', summary.excluded], ['Com alertas', summary.warnings], ['Múltiplos contratos', summary.multipleContracts], ['Períodos descontínuos', summary.discontinuous]];
  return <section className="import-summary">{entries.map(([label, value]) => <article className="panel" key={label}><small>{label}</small><strong>{value ?? 0}</strong></article>)}</section>;
}
function MonthlyPreview({ values = [], resident = false }) {
  return <section className="panel monthly-preview"><header><h3>Preview mensal</h3><small>{resident ? 'Empresas ativas no mês, sem duplicar contratos ou salas.' : 'Somente eventos confirmados.'}</small></header><div>{months.map((month, index) => <span key={month}><small>{month}</small><strong>{values[index] ?? 0}</strong></span>)}</div></section>;
}
function Status({ value }) { return <span className={`import-status ${String(value || '').toLowerCase()}`}>{statusLabels[value] || value}</span>; }

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
    <label>Status<select value={filters.status} onChange={set('status')}><option value="">Todos</option><option value="PENDING">Pendente</option><option value="VALIDATED">Validado</option><option value="EXCLUDED">Excluído</option></select></label>
    <label>Inclusão<select value={filters.inclusion} onChange={set('inclusion')}><option value="">Todos</option><option value="included">Incluídos</option><option value="excluded">Excluídos</option></select></label>
    <label>Participantes<select value={filters.participants} onChange={set('participants')}><option value="">Todos</option><option value="with">Com participantes</option><option value="without">Sem participantes</option></select></label>
    <label className="import-check"><input type="checkbox" checked={filters.duplicate} onChange={set('duplicate')} />Possível duplicidade</label>
  </div>;
}

function EventTable({ items, setItems, selected, toggleSelected, modes, eventTypes, disabled }) {
  const change = (id, field, value) => setItems((current) => current.map((item) => item.id === id ? { ...item, [field]: value } : item));
  const decide = (id, included) => setItems((current) => current.map((item) => item.id === id ? { ...item, included, reviewStatus: included ? 'VALIDATED' : 'EXCLUDED' } : item));
  return <div className="panel import-table-wrap"><table className="import-table event-import-table"><thead><tr><th></th><th>Evento</th><th>Data / horário</th><th>Local</th><th>Participantes</th><th>Temática</th><th>Modo</th><th>Tipo</th><th>Empresas</th><th>Considerar?</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr className={item.duplicateGroup ? 'warning-row' : ''} key={item.id}>
    <td><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} /></td>
    <td><strong>{item.name}</strong>{item.duplicateGroup && <small><AlertTriangle /> Possível mesmo evento</small>}</td>
    <td>{new Date(item.startAt).toLocaleDateString('pt-BR')}<small>{new Date(item.startAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} – {item.endAt ? new Date(item.endAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'não informado'}</small></td>
    <td>{item.location}</td>
    <td><input disabled={disabled} type="number" min="0" value={item.participants ?? ''} onChange={(event) => change(item.id, 'participants', event.target.value)} placeholder="Não informado" /></td>
    <td><input disabled={disabled} value={item.theme || ''} onChange={(event) => change(item.id, 'theme', event.target.value)} placeholder="Pendente" /></td>
    <td><select disabled={disabled} value={item.mode || ''} onChange={(event) => change(item.id, 'mode', event.target.value)}><option value="">Sugestão: Presencial</option>{modes.map((mode) => <option value={mode} key={mode}>{modeLabels[mode]}</option>)}</select></td>
    <td><select disabled={disabled} value={item.subtype || ''} onChange={(event) => change(item.id, 'subtype', event.target.value)}><option value="">Não informado</option>{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></td>
    <td><input disabled={disabled} type="number" min="0" value={item.participatingCompanies ?? ''} onChange={(event) => change(item.id, 'participatingCompanies', event.target.value)} placeholder="Não informado" /></td>
    <td><div className="decision-buttons"><button disabled={disabled} className={item.included ? 'yes active' : 'yes'} onClick={() => decide(item.id, true)}>Sim</button><button disabled={disabled} className={!item.included && item.reviewStatus === 'EXCLUDED' ? 'no active' : 'no'} onClick={() => decide(item.id, false)}>Não</button></div></td>
    <td><Status value={item.reviewStatus} /></td>
  </tr>)}</tbody></table>{!items.length && <div className="empty-state">Nenhum registro corresponde aos filtros.</div>}</div>;
}

function ResidentFilters({ filters, setFilters }) {
  const set = (name) => (event) => setFilters((current) => ({ ...current, [name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }));
  return <div className="import-filters resident-import-filters"><label className="import-check"><input type="checkbox" checked={filters.onlyBlocks} onChange={set('onlyBlocks')} />Somente HUB / MOB / UNI</label><label>Empresa<input value={filters.name} onChange={set('name')} placeholder="Buscar empresa" /></label><label>Status<select value={filters.status} onChange={set('status')}><option value="">Todos</option><option value="ACTIVE">Ativa</option><option value="ENDED">Encerrada</option><option value="FUTURE">Futura</option></select></label><label>Revisão<select value={filters.review} onChange={set('review')}><option value="">Todos</option><option value="VALIDATED">Validado</option><option value="WITH_WARNINGS">Com alertas</option></select></label></div>;
}

function ResidentTable({ items, setItems, selected, toggleSelected, expanded, toggleExpanded, disabled }) {
  const change = (id, field, value) => setItems((current) => current.map((item) => {
    if (item.id !== id) return item;
    const next = { ...item, [field]: value };
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
  return <div className="panel import-table-wrap"><table className="import-table resident-import-table"><thead><tr><th></th><th></th><th>Empresa</th><th>Documento</th><th>Tipo</th><th>Local</th><th>Sala(s)</th><th>Entrada</th><th>Saída</th><th>Setor</th><th>Status</th><th>Revisão</th></tr></thead><tbody>{items.map((item) => <Fragment key={item.id}><tr className={item.reviewStatus === 'WITH_WARNINGS' ? 'warning-row' : ''}>
    <td><input type="checkbox" checked={selected.has(item.id)} onChange={() => toggleSelected(item.id)} /></td>
    <td><button className="expand-button" onClick={() => toggleExpanded(item.id)} aria-label={`Ver contratos de ${item.name}`}><ChevronDown className={expanded.has(item.id) ? 'open' : ''} /></button></td>
    <td><label className="resident-decision"><input disabled={disabled} type="checkbox" checked={item.included} onChange={(event) => include(item, event.target.checked)} /><strong>{item.name}</strong></label></td>
    <td>{item.documentMasked}</td><td>{item.contractType || 'Não informado'}</td><td>{item.location || 'Não informado'}</td><td>{item.rooms?.join(', ') || 'Não informado'}</td><td>{item.startDate ? new Date(`${item.startDate}T00:00:00`).toLocaleDateString('pt-BR') : 'Não informada'}</td><td>{item.endDate ? new Date(`${item.endDate}T00:00:00`).toLocaleDateString('pt-BR') : 'Não informada'}</td><td>{item.sector || 'Não informado'}</td><td><Status value={item.status} /></td><td><Status value={item.reviewStatus} /></td>
  </tr>{expanded.has(item.id) && <tr className="resident-details"><td colSpan="12"><div><section><h4>Contratos originais</h4>{item.contracts.map((contract) => <p key={contract.sourceRow}><strong>Linha {contract.sourceRow}</strong> · {contract.block} · {contract.unit || 'Sala não informada'} · {contract.startDate || '?'} a {contract.endDate || 'vigente'}</p>)}</section><section className="resident-manual-fields"><label>Local<input disabled={disabled} value={item.location || ''} onChange={(event) => change(item.id, 'location', event.target.value)} /></label><label>Salas<input disabled={disabled} value={item.rooms?.join(', ') || ''} onChange={(event) => change(item.id, 'rooms', event.target.value.split(',').map((value) => value.trim()).filter(Boolean))} /></label><label>Entrada<input disabled={disabled} type="date" value={item.startDate || ''} onChange={(event) => change(item.id, 'startDate', event.target.value)} /></label><label>Saída<input disabled={disabled} type="date" value={item.endDate || ''} onChange={(event) => change(item.id, 'endDate', event.target.value)} /></label><label>Setor<input disabled={disabled} value={item.sector || ''} onChange={(event) => change(item.id, 'sector', event.target.value)} /></label><label>Resultado<input disabled={disabled} value={item.result || ''} onChange={(event) => change(item.id, 'result', event.target.value)} /></label><label>Programa<input disabled={disabled} value={item.programName || ''} onChange={(event) => change(item.id, 'programName', event.target.value)} /></label><label>Colaboradores entrada<input disabled={disabled} type="number" min="0" value={item.collaboratorsEntry ?? ''} onChange={(event) => change(item.id, 'collaboratorsEntry', event.target.value)} /></label><label>Colaboradores saída<input disabled={disabled} type="number" min="0" value={item.collaboratorsExit ?? ''} onChange={(event) => change(item.id, 'collaboratorsExit', event.target.value)} /></label><label>Propriedade intelectual<input disabled={disabled} value={item.intellectualProperty || ''} onChange={(event) => change(item.id, 'intellectualProperty', event.target.value)} /></label><label>Captação de recursos<input disabled={disabled} type="number" min="0" value={item.fundsRaised ?? ''} onChange={(event) => change(item.id, 'fundsRaised', event.target.value)} /></label><label>Faturamento anual<input disabled={disabled} type="number" min="0" value={item.annualRevenue ?? ''} onChange={(event) => change(item.id, 'annualRevenue', event.target.value)} /></label><label>Relacionamentos internacionais<input disabled={disabled} value={item.internationalRelationships || ''} onChange={(event) => change(item.id, 'internationalRelationships', event.target.value)} /></label></section>{item.discontinuous && <p className="warning-message"><AlertTriangle /> Períodos de ocupação descontínuos. Revise antes de confirmar.</p>}</div></td></tr>}</Fragment>)}</tbody></table>{!items.length && <div className="empty-state">Nenhuma empresa corresponde aos filtros.</div>}</div>;
}

function ExportDialog({ state, setState, onGenerate, generating, error }) {
  if (!state) return null;
  return <div className="management-modal"><section className="panel export-dialog"><header><div><span>PLANILHA OFICIAL</span><h2>Gerar Planilha de Indicadores</h2></div><button onClick={() => setState(null)} aria-label="Fechar"><X /></button></header>{error && <div className="error" role="alert">{error}</div>}{state.status.requiresStrategy && <div className="warning-message"><AlertTriangle /> Já existem dados em pelo menos uma das seções do template.</div>}<label><input type="radio" name="strategy" value="MERGE" checked={state.strategy === 'MERGE'} onChange={(event) => setState({ ...state, strategy: event.target.value })} />Mesclar com os dados existentes</label><label><input type="radio" name="strategy" value="REPLACE" checked={state.strategy === 'REPLACE'} onChange={(event) => setState({ ...state, strategy: event.target.value })} />Substituir os blocos autorizados</label><label><input type="radio" name="strategy" value="CANCEL" checked={state.strategy === 'CANCEL'} onChange={(event) => setState({ ...state, strategy: event.target.value })} />Cancelar</label><div className="warning-message"><AlertTriangle /> Fórmula anual de Empresas Residentes requer validação e será preservada.</div><footer><button className="button secondary" onClick={() => setState(null)}>Cancelar</button><button className="button primary" disabled={generating || state.strategy === 'CANCEL'} onClick={onGenerate}>{generating ? 'Gerando...' : 'Gerar arquivo'}</button></footer></section></div>;
}

export default function IndicatorImportPage({ type }) {
  const config = TYPES[type];
  const [centers, setCenters] = useState([]), [centerId, setCenterId] = useState('');
  const [options, setOptions] = useState({ eventModes: [], eventTypes: [], maxBytes: 10485760 });
  const [file, setFile] = useState(null), [batch, setBatch] = useState(null), [items, setItems] = useState([]);
  const [processing, setProcessing] = useState(false), [saving, setSaving] = useState(false), [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [dirty, setDirty] = useState(false), [exported, setExported] = useState(false);
  const [selected, setSelected] = useState(new Set()), [expanded, setExpanded] = useState(new Set());
  const [eventFilters, setEventFilters] = useState({ date: '', location: '', name: '', status: '', inclusion: '', participants: '', duplicate: false });
  const [residentFilters, setResidentFilters] = useState({ onlyBlocks: true, name: '', status: '', review: '' });
  const [groupStrategy, setGroupStrategy] = useState('MANUAL'), [groupParticipants, setGroupParticipants] = useState('');
  const [exportDialog, setExportDialog] = useState(null), [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(1);
  const draftChecked = useRef('');

  useEffect(() => { Promise.all([getInnovationCenters(), getIndicatorImportOptions()]).then(([loadedCenters, loadedOptions]) => { setCenters(loadedCenters); setCenterId((current) => current || loadedCenters[0]?.id || ''); setOptions(loadedOptions); }).catch((reason) => setError(reason.message)); }, []);
  useEffect(() => { if (!centerId || draftChecked.current === `${type}:${centerId}`) return; draftChecked.current = `${type}:${centerId}`; getIndicatorImportDraft(type, centerId).then((draft) => { if (draft && window.confirm('Existe uma importação não finalizada. Deseja continuar de onde parou?')) { setBatch(draft); setItems(draft.draft.items || []); } }).catch((reason) => setError(reason.message)); }, [centerId, type]);
  useEffect(() => { const leave = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, [dirty]);

  const setReviewedItems = (updater) => { setItems(updater); setDirty(true); setMessage(''); };
  const updateEventFilters = (updater) => { setEventFilters(updater); setPage(1); };
  const updateResidentFilters = (updater) => { setResidentFilters(updater); setPage(1); };
  const activeStep = exported ? steps.length + 1 : batch?.status === 'IMPORTED' ? 7 : batch ? (dirty ? 4 : 3) : processing || file ? 2 : 1;
  const editable = batch && batch.status !== 'IMPORTED';
  const summary = useMemo(() => {
    if (!batch) return {};
    if (type === 'EVENTS') { const included = items.filter((item) => item.included); return { records: items.length, possibleEvents: items.filter((item) => item.possibleEvent).length, included: included.length, excluded: items.filter((item) => item.reviewStatus === 'EXCLUDED').length, duplicates: new Set(items.filter((item) => item.duplicateGroup).map((item) => item.duplicateGroup)).size, missingParticipants: items.filter((item) => item.participants === null || item.participants === '').length, monthly: months.map((_, index) => included.filter((item) => new Date(item.startAt).getUTCMonth() === index).length) }; }
    const included = items.filter((item) => item.included); return { ...batch.summary, records: items.length, included: included.length, excluded: items.length - included.length, warnings: items.filter((item) => item.reviewStatus === 'WITH_WARNINGS').length, monthly: months.map((_, index) => { const start = new Date(Date.UTC(2026, index, 1)).toISOString().slice(0, 10), end = new Date(Date.UTC(2026, index + 1, 0)).toISOString().slice(0, 10); return included.filter((item) => item.manualPeriodOverride ? (!item.startDate || item.startDate <= end) && (!item.endDate || item.endDate >= start) : item.contracts.some((contract) => (contract.eligibleBlock || item.manualBlockOverride) && (!contract.startDate || contract.startDate <= end) && (!contract.endDate || contract.endDate >= start))).length; }) };
  }, [batch, items, type]);
  const visibleItems = useMemo(() => type === 'EVENTS' ? items.filter((item) => (!eventFilters.date || item.startAt.slice(0, 10) === eventFilters.date) && item.location.toLowerCase().includes(eventFilters.location.toLowerCase()) && item.name.toLowerCase().includes(eventFilters.name.toLowerCase()) && (!eventFilters.status || item.reviewStatus === eventFilters.status) && (!eventFilters.inclusion || (eventFilters.inclusion === 'included' ? item.included : !item.included)) && (!eventFilters.participants || (eventFilters.participants === 'with' ? item.participants !== null && item.participants !== '' : item.participants === null || item.participants === '')) && (!eventFilters.duplicate || item.duplicateGroup)) : items.filter((item) => (!residentFilters.onlyBlocks || item.contracts.some((contract) => contract.eligibleBlock)) && item.name.toLowerCase().includes(residentFilters.name.toLowerCase()) && (!residentFilters.status || item.status === residentFilters.status) && (!residentFilters.review || item.reviewStatus === residentFilters.review)), [type, items, eventFilters, residentFilters]);
  const totalPages = Math.max(1, Math.ceil(visibleItems.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedItems = useMemo(() => visibleItems.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), [visibleItems, currentPage]);

  const validate = async (reprocess = false) => { if (!file) { setError('Selecione uma planilha XLSX.'); return; } setProcessing(true); setError(''); setMessage(''); try { const loaded = await uploadIndicatorImport(type, centerId, file, reprocess); setBatch(loaded); setItems(loaded.draft.items || []); setDirty(false); setSelected(new Set()); setPage(1); setMessage('Arquivo validado. Revise os registros antes de confirmar.'); } catch (reason) { if (reason.code === 'IMPORT_ALREADY_EXISTS' && !reprocess && window.confirm('Este arquivo já foi processado. Deseja reprocessar conscientemente?')) return validate(true); setError(reason.message); } finally { setProcessing(false); } };
  const save = async () => { setSaving(true); setError(''); try { const loaded = await saveIndicatorImportReview(batch.id, items); setBatch(loaded); setItems(loaded.draft.items || []); setDirty(false); setMessage('Revisão salva com sucesso.'); } catch (reason) { setError(reason.message); } finally { setSaving(false); } };
  const confirm = async () => { setConfirming(true); setError(''); try { if (dirty) await saveIndicatorImportReview(batch.id, items); const loaded = await confirmIndicatorImport(batch.id); setBatch(loaded); setItems(loaded.draft.items || items); setDirty(false); setMessage('Importação confirmada e indicadores atualizados.'); } catch (reason) { setError(reason.message); } finally { setConfirming(false); } };
  const toggleSelected = (id) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const bulk = (restore) => { setReviewedItems((current) => current.map((item) => selected.has(item.id) ? { ...item, included: restore ? (type === 'RESIDENTS' ? item.contracts.some((contract) => contract.eligibleBlock) : false) : false, reviewStatus: restore ? (item.discontinuous ? 'WITH_WARNINGS' : type === 'EVENTS' ? 'PENDING' : 'VALIDATED') : 'EXCLUDED' } : item)); setSelected(new Set()); };
  const group = async () => { setError(''); try { const loaded = await groupImportedEvents(batch.id, { itemIds: [...selected], participantStrategy: groupStrategy, participants: groupParticipants }); setBatch(loaded); setItems(loaded.draft.items || []); setSelected(new Set()); setDirty(false); setMessage('Reservas agrupadas em um único evento.'); } catch (reason) { setError(reason.message); } };
  const openExport = async () => { setError(''); try { const status = await getOfficialWorkbookStatus(centerId, 2026); setExportDialog({ status, strategy: 'CANCEL' }); } catch (reason) { setError(reason.message); } };
  const generate = async () => { setGenerating(true); try { const report = await downloadOfficialIndicatorWorkbook({ centerId, year: 2026, strategy: exportDialog.strategy }); downloadBlob(report); setExported(true); setExportDialog(null); setMessage('Planilha oficial gerada sem alterar o template original.'); } catch (reason) { setError(reason.message); } finally { setGenerating(false); } };
  const toggleExpanded = (id) => setExpanded((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });

  return <div className="content indicator-import-page"><header className="import-heading"><div><span>INDICADORES · IMPORTAÇÃO</span><h2>{config.title}</h2><p>{config.subtitle}</p></div>{batch && <Status value={batch.status} />}</header><Stepper active={activeStep} />
    {error && !exportDialog && <div className="error" role="alert">{error}</div>}{message && <div className="success-message" role="status">{message}</div>}
    <section className="panel import-upload"><div><FileSpreadsheet /><div><strong>{file?.name || 'Nenhum arquivo selecionado'}</strong><small>Somente XLSX · limite de {Math.round(options.maxBytes / 1024 / 1024)} MB · os dados não serão importados antes da confirmação</small></div></div><label>Centro<select value={centerId} onChange={(event) => { setCenterId(event.target.value); setBatch(null); setItems([]); }} disabled={Boolean(batch)}>{centers.map((center) => <option value={center.id} key={center.id}>{center.name}</option>)}</select></label><label className="button secondary file-button"><Upload />Selecionar arquivo<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => setFile(event.target.files?.[0] || null)} /></label><button className="button primary" disabled={!file || !centerId || processing} onClick={() => validate(false)}>{processing ? 'Processando...' : 'Validar'}</button></section>
    {batch && <><SummaryCards type={type} summary={summary} />{type === 'EVENTS' ? <EventFilters filters={eventFilters} setFilters={updateEventFilters} /> : <ResidentFilters filters={residentFilters} setFilters={updateResidentFilters} />}
      {editable && <div className="import-actions"><span>{selected.size} selecionado(s)</span>{type === 'EVENTS' ? <><select value={groupStrategy} onChange={(event) => setGroupStrategy(event.target.value)}><option value="MANUAL">Participantes: informar manualmente</option><option value="MAX">Participantes: maior valor</option><option value="SUM">Participantes: somar valores</option></select>{groupStrategy === 'MANUAL' && <input type="number" min="0" value={groupParticipants} onChange={(event) => setGroupParticipants(event.target.value)} placeholder="Participantes" />}<button className="button secondary" disabled={selected.size < 2} onClick={group}>Agrupar selecionados</button></> : <button className="button secondary" onClick={() => setMessage('Empresas já consolidadas por CNPJ/CPF; ausências ou documentos inválidos usam nome e ficam sinalizados para revisão.')}>Consolidar duplicidades</button>}<button className="button danger" disabled={!selected.size} onClick={() => bulk(false)}>Excluir dos indicadores</button><button className="button secondary" disabled={!selected.size} onClick={() => bulk(true)}><RotateCcw />Restaurar</button></div>}
      {type === 'EVENTS' ? <EventTable items={paginatedItems} setItems={setReviewedItems} selected={selected} toggleSelected={toggleSelected} modes={options.eventModes} eventTypes={options.eventTypes} disabled={!editable} /> : <ResidentTable items={paginatedItems} setItems={setReviewedItems} selected={selected} toggleSelected={toggleSelected} expanded={expanded} toggleExpanded={toggleExpanded} disabled={!editable} />}
      <Pagination page={currentPage} totalItems={visibleItems.length} onChange={setPage} />
      <MonthlyPreview values={summary.monthly} resident={type === 'RESIDENTS'} />
      <footer className="import-footer">{editable && <><button className="button secondary" disabled={saving} onClick={save}><Save />{saving ? 'Salvando...' : 'Salvar revisão'}</button><button className="button primary" disabled={confirming || !summary.included} onClick={confirm}>{confirming ? 'Confirmando...' : 'Confirmar importação'}</button></>}<button className="button secondary" disabled={batch.status !== 'IMPORTED'} onClick={openExport}><Download />Gerar Planilha de Indicadores</button></footer>
    </>}<ExportDialog state={exportDialog} setState={setExportDialog} onGenerate={generate} generating={generating} error={error} /></div>;
}
