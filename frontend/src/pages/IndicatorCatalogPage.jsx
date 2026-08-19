import { useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Search, Trash2, X } from 'lucide-react';
import { createIndicatorDefinition, deleteIndicatorDefinition, getIndicatorDefinitions, updateIndicatorDefinition } from '../services/api.js';

const empty = { code: '', name: '', description: '', category: '', unit: 'UNIDADE', valueType: 'INTEGER', periodicity: 'MONTHLY', aggregationType: 'SUM', annualAggregation: 'SUM', sortOrder: 0, active: true };
const valueTypes = [['INTEGER', 'Número inteiro'], ['DECIMAL', 'Decimal'], ['CURRENCY', 'Moeda'], ['PERCENTAGE', 'Percentual'], ['TEXT', 'Texto']];
const aggregations = [['SUM', 'Soma'], ['AVERAGE', 'Média'], ['COUNT', 'Contagem'], ['LAST_VALUE', 'Último valor'], ['MAX', 'Máximo'], ['MIN', 'Mínimo']];
const annualAggregations = aggregations.filter(([value]) => ['SUM', 'AVERAGE', 'COUNT', 'LAST_VALUE'].includes(value));

export default function IndicatorCatalogPage() {
  const [items, setItems] = useState([]);
  const [search, setSearch] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [sort, setSort] = useState({ key: 'name', direction: 'asc' });
  const [filters, setFilters] = useState({ category: '', type: '', periodicity: '', aggregation: '', status: '' });
  const load = useCallback(() => getIndicatorDefinitions(includeInactive).then(setItems).catch((reason) => setError(reason.message)), [includeInactive]);
  useEffect(() => { void load(); }, [load]);
  const options = useMemo(() => ({
    category: [...new Set(items.map((item) => item.category).filter(Boolean))].sort(),
    type: [...new Set(items.map((item) => item.value_type).filter(Boolean))].sort(),
    periodicity: [...new Set(items.map((item) => item.periodicity).filter(Boolean))].sort(),
    aggregation: [...new Set(items.map((item) => item.annual_aggregation || item.aggregation_type).filter(Boolean))].sort(),
  }), [items]);
  const visible = useMemo(() => {
    const filtered = items.filter((item) => `${item.name} ${item.code} ${item.category}`.toLowerCase().includes(search.toLowerCase())
      && (!filters.category || item.category === filters.category)
      && (!filters.type || item.value_type === filters.type)
      && (!filters.periodicity || item.periodicity === filters.periodicity)
      && (!filters.aggregation || (item.annual_aggregation || item.aggregation_type) === filters.aggregation)
      && (!filters.status || (filters.status === 'active' ? item.active : !item.active)));
    return [...filtered].sort((a, b) => String(a[sort.key] ?? '').localeCompare(String(b[sort.key] ?? ''), 'pt-BR', { numeric: true }) * (sort.direction === 'asc' ? 1 : -1));
  }, [items, search, filters, sort]);
  const toggleSort = (key) => setSort((current) => current.key === key ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { key, direction: 'asc' });
  const sortLabel = (key) => sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : '';
  const filterChange = (name) => (event) => setFilters((current) => ({ ...current, [name]: event.target.value }));
  const open = (item = null) => {
    setEditing(item); setError(''); setMessage('');
    setForm(item ? { code: item.code, name: item.name, description: item.description || '', category: item.category,
      unit: item.unit, valueType: item.value_type, periodicity: item.periodicity,
      aggregationType: item.aggregation_type, annualAggregation: item.annual_aggregation || item.aggregation_type,
      sortOrder: item.sort_order || 0, active: item.active } : { ...empty });
  };
  const change = (name) => (event) => setForm((current) => ({ ...current, [name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value.normalize('NFC') }));
  const save = async (event) => {
    event.preventDefault(); setSaving(true); setError(''); setMessage('');
    try {
      if (editing) await updateIndicatorDefinition(editing.id, form); else await createIndicatorDefinition(form);
      setEditing(null); setForm(empty); setMessage(editing ? 'Indicador atualizado com sucesso.' : 'Indicador cadastrado com sucesso.'); await load();
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  };
  const remove = async (item) => {
    if (!window.confirm(`Excluir o indicador "${item.name}"? Os valores históricos serão preservados.`)) return;
    setError(''); setMessage('');
    try { await deleteIndicatorDefinition(item.id); setMessage('Indicador excluído do catálogo ativo.'); await load(); }
    catch (reason) { setError(reason.message); }
  };
  return <div className="content indicator-catalog-page">
    <div className="toolbar"><label className="field-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome, código ou categoria..." /></label><label className="catalog-toggle"><input type="checkbox" checked={includeInactive} onChange={(event) => setIncludeInactive(event.target.checked)} />Exibir inativos</label><button className="button primary push" onClick={() => open()}><Plus />Novo indicador</button></div>
    <div className="catalog-sort-controls"><span>Ordenar:</span>{[['name','Indicador'],['category','Categoria'],['value_type','Tipo'],['periodicity','Periodicidade'],['annual_aggregation','Agregação anual'],['active','Status']].map(([key,label]) => <button key={key} className="table-sort" onClick={() => toggleSort(key)}>{label}{sortLabel(key)}</button>)}</div>
    {error && <div className="error" role="alert">{error}</div>}{message && <div className="success-message" role="status">{message}</div>}
    <p className="catalog-source-note">Catálogo institucional baseado na planilha Indicadores Rede de Centros de Inovação 2026 — Joinville. Indicadores derivados e registros detalhados são processados pelo sistema.</p><section className="panel catalog-table-wrap"><table><thead><tr><th>Indicador</th><th>Categoria</th><th>Tipo</th><th>Periodicidade</th><th>Agregação anual</th><th>Status</th><th>Ações</th></tr></thead><tbody>{visible.map((item) => <tr key={item.id}><td><strong>{item.name}</strong><small>{item.code} · {item.unit}</small></td><td>{item.category}</td><td>{item.value_type}</td><td>{item.periodicity}</td><td>{item.annual_aggregation || item.aggregation_type}</td><td><span className={item.active ? 'catalog-active' : 'catalog-inactive'}>{item.active ? 'Ativo' : 'Inativo'}</span></td><td><button aria-label={`Editar ${item.name}`} onClick={() => open(item)}><Edit3 /></button>{item.active && <button aria-label={`Excluir ${item.name}`} onClick={() => remove(item)}><Trash2 /></button>}</td></tr>)}</tbody></table>{!visible.length && <div className="empty-state">Nenhum indicador encontrado.</div>}</section>
    {editing !== null || form !== empty ? <div className="management-modal"><form className="panel catalog-form" onSubmit={save}><header><div><span>CATÁLOGO</span><h2>{editing ? 'Editar indicador' : 'Novo indicador'}</h2></div><button type="button" onClick={() => { setEditing(null); setForm(empty); }} aria-label="Fechar"><X /></button></header><label>Código<input required disabled={Boolean(editing)} pattern="[A-Z][A-Z0-9_]{2,99}" title="Use letras maiúsculas, números e underscore; comece por uma letra." value={form.code} onChange={(event) => setForm((current) => ({ ...current, code: event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') }))} placeholder="EXEMPLO_INDICADOR" /></label><label>Nome<input required maxLength="150" pattern="[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ().,%/+&'’ºª°_-]*" value={form.name} onChange={change('name')} /></label><label className="span-2">Descrição<textarea maxLength="1000" value={form.description} onChange={change('description')} /></label><label>Categoria<input required maxLength="100" pattern="[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} ().,%/+&'’ºª°_-]*" value={form.category} onChange={change('category')} /></label><label>Unidade<input required maxLength="50" pattern="[\p{L}\p{M}\p{N}%$€./ºª°_-][\p{L}\p{M}\p{N} %$€./ºª°_-]*" value={form.unit} onChange={change('unit')} /></label><label>Tipo<select value={form.valueType} onChange={change('valueType')}>{valueTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Periodicidade<select value={form.periodicity} onChange={change('periodicity')}><option value="MONTHLY">Mensal</option><option value="ANNUAL">Anual</option><option value="EVENT">Por evento</option></select></label><label>Agregação<select value={form.aggregationType} onChange={change('aggregationType')}>{aggregations.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Agregação anual<select value={form.annualAggregation} onChange={change('annualAggregation')}>{annualAggregations.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label>Ordem<input type="number" min="0" max="100000" step="1" value={form.sortOrder} onChange={change('sortOrder')} /></label>{editing && <label className="catalog-toggle"><input type="checkbox" checked={form.active} onChange={change('active')} />Indicador ativo</label>}<footer><button type="button" className="button secondary" onClick={() => { setEditing(null); setForm(empty); }}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar indicador'}</button></footer></form></div> : null}
  </div>;
}
