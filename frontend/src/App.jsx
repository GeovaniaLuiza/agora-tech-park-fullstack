import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Building2, Check, CheckSquare, Download, Edit3, Hash, List, Plus, Search, Trash2, Type, X,
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatCard from './components/StatCard';
import FormCard from './components/FormCard';
import { useForms } from './hooks/useForms';
import {
  addFormQuestion, addQuestionOption, archiveForm, clearAudit,
  createForm, downloadIndicatorReport, duplicateForm, getAudit, getEligibleFormRecipients, getForm,
  getFormQuestions, getFormResponse, getFormIndicatorDefinitions, getIndicatorHistory, getIndicators, getInnovationCenters, getOrganizations, getQuestionOptions,
  getResponseHistory, getFormRespondents, publishForm, saveFormAudience, saveResponseDraft, submitResponse,
  createOrganization, updateOrganization, inactivateOrganization, updateForm, updateFormQuestion,
} from './services/api';
import { useAuth } from './contexts/AuthContext.jsx';
import { ProtectedRoute, PublicOnlyRoute } from './components/RouteGuards';
import LoginPage from './pages/LoginPage';
import RegisterRequestPage from './pages/RegisterRequestPage';
import AdminRequestsPage from './pages/AdminRequestsPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import ResendVerificationPage from './pages/ResendVerificationPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import DashboardPage from './pages/DashboardPage';
import IndicatorCatalogPage from './pages/IndicatorCatalogPage.jsx';
import AdminUsersPage from './pages/AdminUsersPage.jsx';
import IndicatorImportPage from './pages/IndicatorImportPage.jsx';
import { homeForRole } from './config/access';
import { formatIndicatorValue } from './utils/formatters.js';

const pageMeta = {
  '/dashboard': ['Dashboard', 'Visão geral dos indicadores do ecossistema'],
  '/forms': ['Formulários', 'Gerencie coletas de indicadores'],
  '/forms/new': ['Criar formulário', 'Construa o formulário sem escrever código'],
  '/indicators': ['Indicadores', 'Dashboard estratégico do ecossistema'],
  '/indicators/catalog': ['Cadastro de indicadores', 'Administre o catálogo usado pelos formulários e dashboards'],
  '/indicadores/importar-eventos': ['Importar eventos', 'Revise reservas antes de atualizar os indicadores'],
  '/indicadores/importar-residentes': ['Importar empresas residentes', 'Consolide contratos do HUB, MOB e UNI'],
  '/organizations': ['Organizações', 'Empresas e centros cadastrados no Ágora Tech Park'],
  '/admin': ['Aprovações', 'Valide novos usuários e vínculos'],
  '/admin/solicitacoes': ['Solicitações', 'Valide novos usuários, perfis e vínculos'],
  '/admin/usuarios': ['Usuários', 'Gerencie perfis e situação de acesso'],
  '/admin/auditoria': ['Auditoria', 'Histórico de ações críticas'],
  '/perfil': ['Meu perfil', 'Dados da sua conta e vínculos'],
  '/residente': ['Formulários disponíveis', 'Coletas destinadas à sua organização'],
  '/resident/history': ['Histórico de respostas', 'Formulários respondidos pela sua organização'],
  respond: ['Responder formulário', 'Preenchimento pela organização vinculada'],
};

const Button = ({ children, variant = 'primary', className = '', ...props }) => <button className={`button ${variant} ${className}`} {...props}>{children}</button>;
const Progress = ({ value }) => <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
const ErrorMessage = ({ message }) => message ? <div className="error" role="alert">{message}</div> : null;

function Forms({ resident = false }) {
  const { forms, loading, error, reload } = useForms();
  const navigate = useNavigate();
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const visible = forms.filter((form) => form.title.toLowerCase().includes(search.toLowerCase()));
  const perform = async (action) => {
    setActionError('');
    try { await action(); reload?.(); } catch (reason) { setActionError(reason.message); }
  };
  if (loading) return <div className="content">Carregando formulários...</div>;
  return <div className="content">
    <div className="toolbar"><label className="field-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar formulário..." /></label>{!resident && <Button className="push" onClick={() => navigate('/forms/new')}><Plus />Criar novo formulário</Button>}</div>
    <ErrorMessage message={error || actionError} />
    <section className="forms-grid">{visible.map((form) => <FormCard
      key={form.id}
      form={form}
      resident={resident}
      onEdit={() => navigate(`/forms/${form.id}/edit`)}
      onRespond={(id) => navigate(`/resident/forms/${id}/respond`)}
      onDuplicate={() => perform(() => duplicateForm(form.id))}
      onArchive={() => perform(() => archiveForm(form.id))}
    />)}</section>
    {!visible.length && !error && <div className="panel empty-state">Nenhum formulário disponível.</div>}
  </div>;
}

const questionTypes = [[Type, 'Texto', 'TEXT'], [Hash, 'Número', 'NUMBER'], [List, 'Escolha', 'OPTION'], [CheckSquare, 'Decimal', 'DECIMAL']];
const emptyQuestion = (type = 'TEXT') => ({ label: '', type, required: true, options: '', indicatorId: '' });
const indicatorSourceLabels = { FORM_RESPONSE: 'Formulário', SPREADSHEET_IMPORT: 'Planilha', MANUAL_ENTRY: 'Lançamento manual', SYSTEM_CALCULATION: 'Cálculo do sistema' };

function Create() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', startDate: '', endDate: '', innovationCenterId: '', indicatorYear: String(new Date().getFullYear()), indicatorMonth: '' });
  const [questions, setQuestions] = useState([emptyQuestion('NUMBER')]);
  const [indicatorDefinitions, setIndicatorDefinitions] = useState([]);
  const [centers, setCenters] = useState([]);
  const [indicatorCategory, setIndicatorCategory] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const [targets, setTargets] = useState([]);
  const [residents, setResidents] = useState([]);
  const [recipientIds, setRecipientIds] = useState([]);
  const recipientSearch = '';
  const [, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    getOrganizations().then(setOrganizations).catch((reason) => setError(reason.message));
    getInnovationCenters().then((items) => { setCenters(items); setForm((current) => ({ ...current, innovationCenterId: current.innovationCenterId || items[0]?.id || '' })); }).catch((reason) => setError(reason.message));
    getFormIndicatorDefinitions().then(setIndicatorDefinitions).catch((reason) => setError(reason.message));
    getEligibleFormRecipients().then(setResidents).catch((reason) => setError(reason.message));
    if (formId) {
      Promise.all([getForm(formId), getFormQuestions(formId), getFormRespondents(formId)]).then(async ([loaded, loadedQuestions, savedRespondents]) => {
        setForm({
          title: loaded.title,
          description: loaded.description || '',
          startDate: loaded.start_date?.slice(0, 10) || '',
          endDate: loaded.end_date?.slice(0, 10) || '',
          innovationCenterId: loaded.innovation_center_id || '',
          indicatorYear: loaded.indicator_year ? String(loaded.indicator_year) : String(new Date().getFullYear()),
          indicatorMonth: loaded.indicator_month ? String(loaded.indicator_month) : '',
        });
        const withOptions = await Promise.all(loadedQuestions.map(async (question) => ({
          ...question, indicatorId: question.indicator_id || '',
          options: question.type === 'OPTION' ? (await getQuestionOptions(formId, question.id)).map((option) => option.value).join(', ') : '',
        })));
        setQuestions(withOptions);
        setRecipientIds(savedRespondents.map((respondent) => respondent.user_id));
        setTargets([...new Set(savedRespondents.map((respondent) => respondent.organization_id))]);
      }).catch((reason) => setError(reason.message));
    }
  }, [formId]);
  const visibleResidents = (targets.length
    ? residents.filter((resident) => resident.organizations.some((organization) => targets.includes(organization.id)))
    : residents).filter((resident) => `${resident.name} ${resident.email}`.toLowerCase().includes(recipientSearch.toLowerCase()));
  const toggleTarget = (organizationId) => {
    const next = targets.includes(organizationId) ? targets.filter((id) => id !== organizationId) : [...targets, organizationId];
    setTargets(next);
    if (next.length) setRecipientIds((selected) => selected.filter((id) => residents.find((resident) => resident.id === id)?.organizations.some((organization) => next.includes(organization.id))));
  };
  const toggleRecipient = (residentId) => setRecipientIds((selected) => selected.includes(residentId) ? selected.filter((id) => id !== residentId) : [...selected, residentId]);
  const updateQuestion = (index, patch) => setQuestions(questions.map((question, current) => current === index ? { ...question, ...patch } : question));
  const save = async (shouldPublish) => {
    const title = form.title.trim();
    const filledQuestions = questions.filter((question) => question.label.trim());
    if (title.length < 3) {
      setError('Informe um título com pelo menos 3 caracteres.');
      return;
    }
    if (questions.some((question) => question.label.trim() && question.label.trim().length < 3)) {
      setError('Toda pergunta preenchida deve ter pelo menos 3 caracteres.');
      return;
    }
    if (shouldPublish && !filledQuestions.length) {
      setError('Inclua ao menos uma pergunta antes de publicar.');
      return;
    }
    if (shouldPublish && (!form.startDate || !form.endDate)) {
      setError('Defina as datas de início e fim antes de publicar.');
      return;
    }
    if (filledQuestions.some((question) => question.type === 'OPTION' && !question.options.split(',').some((value) => value.trim()))) {
      setError('Informe ao menos uma opção para cada pergunta de escolha.');
      return;
    }
    if (shouldPublish && !recipientIds.length) {
      setError('Selecione ao menos um residente ativo para receber o formulário.');
      return;
    }
    if (shouldPublish && filledQuestions.some((question) => question.indicatorId)
        && (!form.innovationCenterId || !form.indicatorYear || !form.indicatorMonth)) {
      setError('Para coletar indicadores, informe o Centro de Inovação, o ano e o mês de referência.');
      return;
    }
    setSaving(true); setError(''); setSuccess('');
    try {
      const hasIndicatorPeriod = Boolean(form.indicatorMonth);
      const payloadForm = { ...form, title,
        innovationCenterId: hasIndicatorPeriod ? form.innovationCenterId : null,
        indicatorYear: hasIndicatorPeriod ? Number(form.indicatorYear) : null,
        indicatorMonth: hasIndicatorPeriod ? Number(form.indicatorMonth) : null };
      const saved = formId ? await updateForm(formId, payloadForm) : await createForm(payloadForm);
      for (const [position, question] of filledQuestions.entries()) {
        const payload = { label: question.label, type: question.type, required: question.required, position, indicatorId: question.indicatorId || null };
        const savedQuestion = question.id
          ? await updateFormQuestion(saved.id, question.id, payload)
          : await addFormQuestion(saved.id, payload);
        if (!question.id && question.type === 'OPTION') {
          for (const option of question.options.split(',').map((value) => value.trim()).filter(Boolean)) {
            await addQuestionOption(saved.id, savedQuestion.id, option);
          }
        }
      }
      await saveFormAudience(saved.id, targets, recipientIds);
      if (shouldPublish) {
        const published = await publishForm(saved.id, targets, recipientIds);
        const summary = published.notificationSummary;
        setSuccess(`Formulário criado com sucesso e publicado. ${recipientIds.length} respondente(s) selecionado(s). ${summary.sent} e-mail(s) enviado(s)${summary.failed ? `; ${summary.failed} envio(s) falharam.` : '.'}`);
        setTimeout(() => navigate('/forms'), 1400);
      } else {
        setSuccess('Rascunho salvo. Nenhum e-mail foi enviado.');
        setTimeout(() => navigate('/forms'), 0);
      }
    } catch (reason) { setError(reason.message === 'Erro interno do servidor' ? 'Não foi possível criar o formulário. Verifique o título, o período e os campos obrigatórios e tente novamente.' : reason.message); } finally { setSaving(false); }
  };
  const categories = [...new Set(indicatorDefinitions.map((item) => item.category))];
  const availableIndicators = indicatorDefinitions.filter((item) => !indicatorCategory || item.category === indicatorCategory);
  const addIndicator = (definition) => {
    if (questions.some((question) => question.indicatorId === definition.id)) return;
    const type = definition.value_type === 'INTEGER' ? 'NUMBER' : definition.value_type === 'TEXT' ? 'TEXT' : 'DECIMAL';
    setQuestions([...questions, { ...emptyQuestion(type), label: definition.name, indicatorId: definition.id }]);
  };
  const toggleIndicator = (definition) => {
    const existing = questions.find((question) => question.indicatorId === definition.id);
    if (existing) {
      setQuestions(questions.filter((question) => question !== existing));
      return;
    }
    addIndicator(definition);
  };
  const selectedIndicatorCount = questions.filter((question) => question.indicatorId).length;
  return <div className="content builder-layout">
    <aside className="panel toolbox form-settings indicator-catalog-panel">
      <h4>INDICADORES DA PLANILHA 2026</h4>
      <p className="indicator-catalog-help">Selecione os indicadores que serão coletados neste formulário. Os valores mensais alimentam os indicadores e o Dashboard.</p>
      <label>Categoria<select value={indicatorCategory} onChange={(event) => setIndicatorCategory(event.target.value)}><option value="">Todas</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <div className="indicator-selection-summary"><strong>{selectedIndicatorCount}</strong><span>indicador(es) selecionado(s)</span></div>
      <div className="indicator-catalog">{availableIndicators.map((definition) => { const selected = questions.some((question) => question.indicatorId === definition.id); return <label className={`indicator-option ${selected ? 'selected' : ''}`} key={definition.id}><input type="checkbox" checked={selected} onChange={() => toggleIndicator(definition)} /><span><strong>{definition.name}</strong><small>{definition.category} · {definition.unit} · {definition.aggregation_type}</small></span></label>; })}</div>
      <hr /><h4>PERÍODO DOS DADOS</h4>
      <label>Centro<select value={form.innovationCenterId} onChange={(event) => setForm({ ...form, innovationCenterId: event.target.value })}><option value="">Selecione</option>{centers.map((center) => <option value={center.id} key={center.id}>{center.name}</option>)}</select></label>
      <div className="date-grid"><label>Ano<input type="number" min="2000" max="2200" step="1" value={form.indicatorYear} onChange={(event) => setForm({ ...form, indicatorYear: event.target.value })} /></label><label>Mês<select value={form.indicatorMonth} onChange={(event) => setForm({ ...form, indicatorMonth: event.target.value })}><option value="">Nenhum</option>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}</option>)}</select></label></div>
      <small>Este período representa os dados coletados e pode ser diferente do prazo de resposta.</small>
    </aside>
    <aside className="panel toolbox form-settings"><h4>TIPOS DE PERGUNTA</h4>{questionTypes.map(([Icon, label, type]) => <button type="button" key={type} onClick={() => setQuestions([...questions, emptyQuestion(type)])}><span><Icon /></span>{label}</button>)}<hr /><h4>CONFIGURAÇÕES</h4><div className="date-grid"><label>Início<input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>Fim<input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label></div><fieldset className="recipient-fieldset"><legend>Organizações destinatárias</legend>{organizations.filter((organization) => organization.status !== 'INACTIVE').map((organization) => <label className="recipient-option" key={organization.id}><input type="checkbox" checked={targets.includes(organization.id)} onChange={() => toggleTarget(organization.id)} /><span><strong>{organization.name}</strong><small>{organization.cnpj || 'Organização ativa'}</small></span></label>)}</fieldset><fieldset className="recipient-fieldset"><legend>Residentes respondentes</legend><p>Somente residentes ativos, com e-mail verificado e vínculo válido podem receber a coleta.</p><div className="recipient-list">{visibleResidents.map((resident) => <label className="recipient-option" key={resident.id}><input type="checkbox" checked={recipientIds.includes(resident.id)} onChange={() => toggleRecipient(resident.id)} /><span><strong>{resident.name}</strong><small>{resident.email}<br />{resident.organizations.map((organization) => organization.name).join(', ')}</small></span></label>)}{!visibleResidents.length && <small className="recipient-empty">Nenhum residente elegível para a organização selecionada.</small>}</div></fieldset><div className={`recipient-summary ${recipientIds.length ? 'ready' : ''}`}><strong>{recipientIds.length}</strong><span>residente(s) selecionado(s)</span></div></aside>
    <main className="panel builder"><ErrorMessage message={error} /><div className="builder-heading"><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Título do formulário" /><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descrição" /></div>{questions.map((question, index) => <article className="question" key={question.id || index}><small>#{index + 1} <span>{question.type}</span></small><input value={question.label} onChange={(event) => updateQuestion(index, { label: event.target.value })} placeholder="Texto da pergunta" /><select value={question.type} onChange={(event) => updateQuestion(index, { type: event.target.value })}>{questionTypes.map(([, label, type]) => <option value={type} key={type}>{label}</option>)}</select>{question.type === 'OPTION' && <input value={question.options} onChange={(event) => updateQuestion(index, { options: event.target.value })} placeholder="Opções separadas por vírgula" />}</article>)}<Button type="button" variant="dashed" onClick={() => setQuestions([...questions, emptyQuestion()])}><Plus />Adicionar pergunta</Button><div className="toolbar"><Button type="button" disabled={saving} onClick={() => save(false)}>{saving ? 'Salvando...' : 'Salvar rascunho'}</Button><Button type="button" disabled={saving} onClick={() => save(true)}>Publicar</Button></div></main>
    <aside className="panel preview"><h4>PRÉ-VISUALIZAÇÃO</h4><div><strong>{form.title || 'Novo formulário'}</strong><small>{questions.length} pergunta(s)</small>{questions.map((question, index) => <label key={question.id || index}>{question.label || 'Pergunta sem título'}<input disabled /></label>)}</div></aside>
  </div>;
}

function Indicators() {
  const { user } = useAuth();
  const [items, setItems] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { getIndicatorHistory().then(setPeriods).catch((reason) => setError(reason.message)); }, []);
  useEffect(() => { getIndicators({ ...(period ? { period } : {}), ...(search ? { name: search } : {}) }).then((rows) => setItems(rows.map((row) => ({ ...row, source: indicatorSourceLabels[row.source] || row.source })))).catch((reason) => setError(reason.message)); }, [period, search]);
  const currentYear = String(new Date().getFullYear());
  const availableYears = [...new Set(periods.map(String))].filter((value) => value !== currentYear);
  const download = async (format) => {
    try {
      const report = await downloadIndicatorReport(format, period ? { period } : {});
      const url = URL.createObjectURL(report.blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = report.filename; anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError(reason.message); }
  };
  const canExport = user.role !== 'RESIDENTE';
  return <div className="content indicators-page"><div className="source-notice"><strong>Fonte consolidada dos Centros de Inovação</strong><span>Respostas de formulários alimentam automaticamente estes indicadores e o dashboard.</span></div><div className="toolbar"><label className="field-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar indicador ou código..." /></label><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="">{currentYear}</option>{availableYears.map((value) => <option key={value}>{value}</option>)}</select>{canExport && <><Button variant="secondary" className="push" onClick={() => download('pdf')}><Download />PDF</Button><Button variant="secondary" onClick={() => download('excel')}><Download />Excel</Button><Button variant="secondary" onClick={() => download('csv')}><Download />CSV</Button></>}</div><ErrorMessage message={error} /><section className="metric-grid">{items.map((item) => <article className="panel metric indicator-card" key={item.id}><div><span>{item.category}</span><code>{item.code}</code></div><h3>{item.name}</h3><h2>{item.json_value ? `${item.json_value.length} organizações` : formatIndicatorValue(item.value ?? item.text_value, item.value_type, item.unit)}</h2><p>{item.description}</p>{Array.isArray(item.json_value) && <div className="indicator-details" aria-label={`Detalhamento de ${item.name}`}>{item.json_value.map((detail) => <div key={detail.organization}><strong>{detail.organization}</strong><span>Desafios: {detail.challenges} · Soluções: {detail.solutions} · Negócios: {detail.deals}</span></div>)}</div>}<footer><em>{item.period}</em><small>{item.source}</small></footer></article>)}</section>{!items.length && !error && <article className="panel empty-state">Nenhum indicador encontrado para os filtros.</article>}</div>;
}

function Residents() {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({ name: '', cnpj: '', status: 'ACTIVE' });
  const [saving, setSaving] = useState(false);
  const load = () => getOrganizations().then(setOrganizations).catch((reason) => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const visible = organizations.filter((organization) => organization.name.toLowerCase().includes(search.toLowerCase()));
  const open = (organization = null) => { setError(''); setMessage(''); setEditing(organization); setFormOpen(true); setForm(organization ? { name: organization.name || '', cnpj: organization.cnpj || '', status: organization.status || 'ACTIVE' } : { name: '', cnpj: '', status: 'ACTIVE' }); };
  const close = () => { setEditing(null); setFormOpen(false); };
  const save = async (event) => { event.preventDefault(); setError(''); setMessage(''); setSaving(true); const wasEditing = Boolean(editing); try { const payload = { ...form, cnpj: form.cnpj.replace(/\D/g, '') || null }; if (wasEditing) await updateOrganization(editing.id, payload); else await createOrganization(payload); close(); setMessage(wasEditing ? 'Organização atualizada com sucesso.' : 'Organização cadastrada com sucesso.'); await load(); } catch (reason) { setError(reason.message); } finally { setSaving(false); } };
  const remove = async (organization) => { if (!window.confirm(`Inativar a organização "${organization.name}"?`)) return; setError(''); setMessage(''); try { await inactivateOrganization(organization.id); setMessage('Organização inativada com sucesso.'); await load(); } catch (reason) { setError(reason.message); } };
  return <div className="content organization-page"><div className="toolbar"><label className="field-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar organização..." /></label>{user.role === 'ADMIN' && <Button className="push" onClick={() => open()}><Plus />Nova organização</Button>}</div><ErrorMessage message={error} />{message && <div className="success-message" role="status">{message}</div>}<section className="forms-grid">{visible.map((org) => <article className="panel resident-card" key={org.id}><span className="company-mark">{org.name?.[0]}</span><div><h3>{org.name}</h3><p>CNPJ: {org.cnpj || 'Não informado'} · {org.status === 'ACTIVE' ? 'Ativa' : 'Inativa'}</p></div>{user.role === 'ADMIN' && <footer><button aria-label={`Editar ${org.name}`} onClick={() => open(org)}><Edit3 /></button>{org.status === 'ACTIVE' && <button aria-label={`Inativar ${org.name}`} onClick={() => remove(org)}><Trash2 /></button>}</footer>}</article>)}</section>{!visible.length && !error && <article className="panel empty-state"><Building2 /><h3>Nenhuma organização encontrada</h3></article>}{formOpen ? <div className="management-modal"><form className="panel management-form organization-form" onSubmit={save}><header><div><span>ORGANIZAÇÕES</span><h2>{editing ? 'Editar organização' : 'Nova organização'}</h2></div><button type="button" onClick={close} aria-label="Fechar"><X /></button></header><label className="span-2">Nome da organização<input required minLength="2" maxLength="150" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label><label>CNPJ<input inputMode="numeric" pattern="[0-9./-]{14,18}" title="Informe um CNPJ válido" value={form.cnpj} onChange={(event) => setForm((current) => ({ ...current, cnpj: event.target.value.replace(/[^0-9.-]/g, '').slice(0, 18) }))} placeholder="00.000.000/0000-00" /></label><label>Status<select value={form.status} onChange={(event) => setForm((current) => ({ ...current, status: event.target.value }))}><option value="ACTIVE">Ativa</option><option value="INACTIVE">Inativa</option></select></label><footer><button type="button" className="button secondary" onClick={close}>Cancelar</button><button type="submit" className="button primary" disabled={saving}>{saving ? 'Salvando...' : 'Salvar organização'}</button></footer></form></div> : null}</div>;
}

function History() {
  const { user } = useAuth();
  const organizationId = user.organizations?.[0]?.id;
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { if (organizationId) getResponseHistory(organizationId).then(setItems).catch((reason) => setError(reason.message)); }, [organizationId]);
  if (!organizationId) return <div className="content"><ErrorMessage message="Sua conta ainda não possui uma organização vinculada." /></div>;
  const statusLabel = { SUBMITTED: 'Revisado', REOPENED: 'Em revisão', DRAFT: 'Pendente' };
  return <div className="content"><ErrorMessage message={error} /><section className="stats history-stats"><StatCard label="Respondidos" value={items.filter((item) => item.status === 'SUBMITTED').length} /><StatCard label="Em revisão" value={items.filter((item) => item.status === 'REOPENED').length} /><StatCard label="Pendentes" value={items.filter((item) => item.status === 'DRAFT').length} /></section><article className="panel history"><h2>Respostas enviadas</h2>{items.map((item) => <div className="history-row" key={item.id}><span className={item.status === 'SUBMITTED' ? 'done-dot' : 'waiting-dot'}><Check /></span><div><strong>{item.title}</strong><small>{item.sent_at ? `Enviado em ${new Date(item.sent_at).toLocaleDateString('pt-BR')}` : 'Ainda não enviado'}</small></div><em className={item.status === 'SUBMITTED' ? 'reviewed' : 'sent'}>{statusLabel[item.status] || item.status}</em></div>)}</article></div>;
}

function Respond() {
  const { user } = useAuth();
  const { formId } = useParams();
  const organizationId = user.organizations?.[0]?.id;
  const [form, setForm] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [options, setOptions] = useState({});
  const [answers, setAnswers] = useState({});
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!organizationId) return;
    Promise.all([getForm(formId), getFormQuestions(formId)]).then(async ([loadedForm, data]) => {
      setForm(loadedForm); setQuestions(data);
      const pairs = await Promise.all(data.filter((question) => question.type === 'OPTION').map(async (question) => [question.id, await getQuestionOptions(formId, question.id)]));
      setOptions(Object.fromEntries(pairs));
      try {
        const existing = await getFormResponse(formId, organizationId);
        setAnswers(Object.fromEntries(existing.answers.map((answer) => [answer.question_id, answer.value])));
        setSent(existing.status === 'SUBMITTED');
      } catch (reason) { if (reason.status !== 404) setError(reason.message); }
    }).catch((reason) => setError(reason.message));
  }, [formId, organizationId]);
  const update = (id, value) => setAnswers((current) => ({ ...current, [id]: value }));
  const payload = () => questions.map((question) => ({ questionId: question.id, value: answers[question.id] || '' }));
  const persist = async (submit) => {
    setSaving(true); setError('');
    try {
      if (submit) {
        await submitResponse(formId, organizationId, payload());
        setSent(true);
      }
      else await saveResponseDraft(formId, organizationId, payload());
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  };
  const answeredCount = Object.values(answers).filter((value) => value !== '' && value !== null && value !== undefined).length;
  if (!organizationId) return <div className="content"><ErrorMessage message="Sua conta ainda não possui uma organização vinculada." /></div>;
  if (!form && !error) return <div className="content">Carregando formulário...</div>;
  return <div className="content respond"><article className="respond-card"><ErrorMessage message={error} />{form && <div className="respond-head"><small>COLETA</small><h2>{form.title}</h2><p>{form.description}</p><p>Prazo: {form.period || 'não informado'}</p><div className="response-progress"><Progress value={questions.length ? (answeredCount / questions.length) * 100 : 0} /><span>{answeredCount} de {questions.length}</span></div></div>}<form onSubmit={(event) => { event.preventDefault(); persist(true); }}>{sent ? <div className="success"><Check /><h3>Resposta enviada com sucesso!</h3><p>Uma nova edição exige reabertura pela equipe responsável.</p></div> : <>{questions.map((question) => <label key={question.id}>{question.label}{question.required && ' *'}{question.type === 'OPTION' ? <div className="choices">{(options[question.id] || []).map((option) => <button type="button" className={answers[question.id] === option.value ? 'selected' : ''} onClick={() => update(question.id, option.value)} key={option.id}>{option.value}</button>)}</div> : <input type={question.type === 'TEXT' ? 'text' : 'number'} step={question.type === 'DECIMAL' ? '.01' : '1'} value={answers[question.id] || ''} onChange={(event) => update(question.id, event.target.value)} />}</label>)}<div className="toolbar"><Button type="button" variant="secondary" disabled={saving} onClick={() => persist(false)}>Salvar rascunho</Button><Button type="submit" disabled={saving}>Enviar respostas</Button></div></>}</form></article></div>;
}

function ProfilePage() {
  const { user, logout, updateAvatar } = useAuth();
  const navigate = useNavigate();
  const organizations = user.organizations || [];
  const leave = async () => { await logout(); navigate('/login', { replace: true }); };
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [photoMessage, setPhotoMessage] = useState('');
  const initials = user.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const choosePhoto = (event) => { const file = event.target.files?.[0]; event.target.value = ''; if (!file) return; setPhotoError(''); setPhotoMessage(''); if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setPhotoError('Escolha uma imagem JPG, PNG ou WebP.'); return; } if (file.size > 2 * 1024 * 1024) { setPhotoError('A foto deve ter no máximo 2 MB.'); return; } const reader = new FileReader(); reader.onload = async () => { setUploading(true); try { await updateAvatar(reader.result); setPhotoMessage('Foto de perfil atualizada com sucesso.'); } catch (reason) { setPhotoError(reason.message); } finally { setUploading(false); } }; reader.readAsDataURL(file); };
  const removePhoto = async () => { setUploading(true); setPhotoError(''); setPhotoMessage(''); try { await updateAvatar(null); setPhotoMessage('Foto de perfil removida.'); } catch (reason) { setPhotoError(reason.message); } finally { setUploading(false); } };
  return <div className="content profile-page"><section className="panel profile-card">
    <div className="profile-photo-area"><div className="profile-avatar">{user.avatar_data ? <img src={user.avatar_data} alt={`Foto de perfil de ${user.name}`} /> : initials}</div><label className="button secondary profile-upload">{uploading ? 'Enviando...' : 'Alterar foto'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={choosePhoto} disabled={uploading} /></label>{user.avatar_data && <button type="button" className="link-button" onClick={removePhoto} disabled={uploading}>Remover foto</button>}<small>JPG, PNG ou WebP · máximo 2 MB</small></div>
    <div><h2>{user.name}</h2><p>{user.email}</p>{photoError && <ErrorMessage message={photoError} />}{photoMessage && <div className="success-message" role="status">{photoMessage}</div>}</div>
    <dl><div><dt>Perfil</dt><dd>{user.role}</dd></div><div><dt>Status</dt><dd>{user.status}</dd></div><div><dt>Organizações</dt><dd>{organizations.length ? organizations.map((organization) => organization.name).join(', ') : 'Nenhuma organização vinculada'}</dd></div></dl>
    <Button variant="secondary" onClick={leave}>Sair da conta</Button>
  </section></div>;
}

const auditActionLabels = { USER_DELETED: 'Usuário excluído', USER_CREATED: 'Usuário criado', USER_INACTIVATED: 'Usuário inativado', USER_ACTIVATED: 'Usuário ativado', USER_LOGIN: 'login', REPORT_EXPORTED: 'exportou o relatório de indicadores', INDICATOR_REPORT_EXPORTED: 'exportou o relatório de indicadores', INDICATORS_EXPORTED: 'exportou o relatório de indicadores', SPREADSHEET_EXPORTED: 'exportou o relatório de indicadores', INDICATOR_DEFINITION_CREATED: 'definição de indicador criada', INDICATOR_DEFINITION_UPDATED: 'definição de indicador atualizada', INDICATOR_DEFINITION_DEACTIVATED: 'definição de indicador desativada', ROLE_CHANGED: 'Perfil alterado', USER_INVITATION_SENT: 'Convite enviado', FORM_RESPONSE_SUBMITTED: 'Resposta de formulário enviada', INDICATOR_VALUE_CREATED: 'Indicador criado', INDICATOR_VALUE_UPDATED: 'Indicador atualizado', INDICATOR_RECALCULATED: 'Indicador recalculado' };
const auditActionLabel = (action) => auditActionLabels[action] || String(action || '').replaceAll('_', ' ').toLowerCase().replace(/(^|\s)\S/gu, (letter) => letter.toUpperCase());
const auditDateParts = (value) => { const date = new Date(value); return { date: new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(date), time: new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(date) }; };
const auditEntityLabel = (entity) => ({ user: 'usuário', project: 'projeto', form: 'formulário', response: 'resposta', indicator_value: 'valor de indicador', indicator_definition: 'definição de indicador' }[entity] || String(entity || 'recurso').replaceAll('_', ' '));
const formActionVerbs = { FORM_CREATED: 'criou o formulário', 'FORM CREATED': 'criou o formulário', FORM_UPDATED: 'atualizou o formulário', 'FORM UPDATED': 'atualizou o formulário', FORM_DUPLICATED: 'duplicou o formulário', 'FORM DUPLICATED': 'duplicou o formulário', FORM_DELETED: 'excluiu o formulário', 'FORM DELETED': 'excluiu o formulário', FORM_ARCHIVED: 'excluiu o formulário', FORM_PUBLISHED: 'publicou o formulário', 'FORM PUBLISHED': 'publicou o formulário', FORM_UNPUBLISHED: 'despublicou o formulário', 'FORM UNPUBLISHED': 'despublicou o formulário', FORM_VIEWED: 'visualizou o formulário', 'FORM VIEWED': 'visualizou o formulário', FORM_EXPORTED: 'exportou os dados do formulário', 'FORM EXPORTED': 'exportou os dados do formulário', FORM_EMAIL_SENT: 'enviou o convite por e-mail do formulário', 'FORM EMAIL SENT': 'enviou o convite por e-mail do formulário', FORM_EMAIL_FAILED: 'não conseguiu enviar o convite por e-mail do formulário', FORM_RESPONDENT_ASSIGNED: 'atribuiu respondentes ao formulário', 'FORM RESPONDENT ASSIGNED': 'atribuiu respondentes ao formulário', FORM_QUESTION_CREATED: 'adicionou uma pergunta ao formulário', 'FORM QUESTION CREATED': 'adicionou uma pergunta ao formulário', FORM_QUESTION_UPDATED: 'atualizou uma pergunta do formulário', FORM_QUESTION_REMOVED: 'removeu uma pergunta do formulário', FORM_OPTION_CREATED: 'adicionou uma opção ao formulário', INDICATOR_DEFINITION_CREATED: 'criou o indicador', INDICATOR_DEFINITION_UPDATED: 'atualizou o indicador', INDICATOR_DEFINITION_DEACTIVATED: 'desativou o indicador', USER_INACTIVATED: 'inativou o usuário', USER_ACTIVATED: 'ativou o usuário', ROLE_CHANGED: 'alterou o perfil do usuário' };
const auditMessage = (item) => { const parts = auditDateParts(item.created_at); const actor = item.user_email || item.user_name || 'Sistema'; const status = String(item.details?.result || 'Sucesso').replace(/^\p{L}/u, (letter) => letter.toUpperCase()); const formVerb = formActionVerbs[String(item.action || '').toUpperCase()]; if (formVerb) return `${actor} ${formVerb}${item.entity_name ? ` "${item.entity_name}"` : ''}${item.entity_id ? ` (ID: ${item.entity_id})` : ''} em ${parts.date} às ${parts.time}. Status: ${status}.`; if (item.action === 'USER_LOGIN') return `${actor} realizou login no sistema em ${parts.date} às ${parts.time}. Usuário ID: ${item.entity_id || 'não informado'}. Status: ${status}.`; if (item.action === 'USER_CREATED') return `${actor} criou o usuário e enviou o convite de acesso em ${parts.date} às ${parts.time}. Status: ${status}.`; if (item.action === 'USER_DELETED') return `${actor} excluiu o usuário${item.entity_id ? ` (ID: ${item.entity_id})` : ''} em ${parts.date} às ${parts.time}. Status: ${status}.`; if (['REPORT_EXPORTED', 'INDICATOR_REPORT_EXPORTED', 'INDICATORS_EXPORTED', 'SPREADSHEET_EXPORTED'].includes(item.action)) return `${actor} exportou o relatório de indicadores em ${parts.date} às ${parts.time}. Status: ${status}.`; return `${actor} realizou ${auditActionLabel(item.action)} em ${auditEntityLabel(item.entity)}${item.entity_id ? ` (ID: ${item.entity_id})` : ''}, em ${parts.date} às ${parts.time}. Status: ${status}.`; };

function Audit() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const load = () => getAudit().then(setItems).catch((reason) => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const clear = async () => { if (!window.confirm('Limpar definitivamente todos os logs de auditoria? Esta ação não pode ser desfeita.')) return; try { await clearAudit(); setItems([]); } catch (reason) { setError(reason.message); } };
  return <div className="content"><div className="toolbar"><h2>Auditoria</h2><button className="button danger push" onClick={clear}>Limpar logs</button></div><ErrorMessage message={error} /><article className="panel history">{items.filter((item) => item.action !== 'USER_INVITATION_SENT').map((item) => <div className="history-row" key={item.id}><div><strong>{auditMessage(item)}</strong></div></div>)}{!items.length && <div className="empty-state">Nenhum log de auditoria.</div>}</article></div>;
}

function AppShell() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const meta = pageMeta[pathname] || (pathname.includes('/respond') ? pageMeta.respond : pathname.includes('/forms/') ? pageMeta['/forms/new'] : ['Ágora Tech Park', 'Plataforma de indicadores']);
  return <div className="app"><Sidebar open={open} setOpen={setOpen} /><div className="main"><Header title={meta[0]} subtitle={meta[1]} setOpen={setOpen} /><Outlet /></div>{open && <button className="overlay" onClick={() => setOpen(false)} />}</div>;
}

function Unauthorized() { const { user } = useAuth(); const navigate = useNavigate(); return <div className="auth-loading"><h2>Acesso não autorizado</h2><p>Seu perfil não possui permissão para acessar esta página.</p><Button onClick={() => navigate(homeForRole(user.role))}>Voltar ao seu painel</Button></div>; }
function UnknownProfile() { const { logout } = useAuth(); const navigate = useNavigate(); return <main className="route-state" role="alert"><h1>Perfil não reconhecido</h1><p>Sua conta está autenticada, mas não possui um perfil válido.</p><Button onClick={() => { logout(); navigate('/login', { replace: true }); }}>Voltar ao login</Button></main>; }
function NotFound() { const { user } = useAuth(); const navigate = useNavigate(); return <main className="route-state"><h1>Página não encontrada</h1><p>O endereço informado não existe ou foi removido.</p><Button onClick={() => navigate(user ? homeForRole(user.role) : '/login', { replace: true })}>{user ? 'Voltar ao meu painel' : 'Ir para o login'}</Button></main>; }
function HomeRedirect() { const { user } = useAuth(); return <Navigate to={user ? homeForRole(user.role) : '/login'} replace />; }

export default function App() {
  return <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route element={<PublicOnlyRoute />}><Route path="/login" element={<LoginPage />} /><Route path="/solicitar-acesso" element={<RegisterRequestPage />} /><Route path="/request-access" element={<Navigate to="/solicitar-acesso" replace />} /></Route>
    <Route path="/confirmar-email" element={<VerifyEmailPage />} /><Route path="/verify-email" element={<VerifyEmailPage />} /><Route path="/reenviar-confirmacao" element={<ResendVerificationPage />} /><Route path="/esqueci-a-senha" element={<ForgotPasswordPage />} /><Route path="/redefinir-senha" element={<ResetPasswordPage />} />
    <Route element={<ProtectedRoute />}><Route path="/unauthorized" element={<Unauthorized />} /><Route path="/unknown-profile" element={<UnknownProfile />} /><Route path="/" element={<HomeRedirect />} />
      <Route element={<AppShell />}>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE']} />}><Route path="/dashboard" element={<DashboardPage />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR']} />}><Route path="/pesquisa" element={<Navigate to="/forms" replace />} /><Route path="/forms" element={<Forms />} /><Route path="/forms/new" element={<Create />} /><Route path="/forms/:formId/edit" element={<Create />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE']} />}><Route path="/indicators" element={<Indicators />} /></Route><Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR']} />}><Route path="/organizations" element={<Residents />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR']} />}><Route path="/indicators/catalog" element={<IndicatorCatalogPage />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR']} />}><Route path="/indicadores/importar-eventos" element={<IndicatorImportPage type="EVENTS" />} /><Route path="/indicadores/importar-residentes" element={<IndicatorImportPage type="RESIDENTS" />} /></Route>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route element={<ProtectedRoute roles={['ADMIN']} />}><Route path="/admin" element={<AdminRequestsPage />} /><Route path="/admin/solicitacoes" element={<AdminRequestsPage />} /><Route path="/admin/usuarios" element={<AdminUsersPage />} /><Route path="/admin/auditoria" element={<Audit />} /><Route path="/admin/requests" element={<Navigate to="/admin/solicitacoes" replace />} /></Route>
        <Route element={<ProtectedRoute roles={['RESIDENTE']} />}><Route path="/residente" element={<Forms resident />} /><Route path="/resident/forms" element={<Forms resident />} /><Route path="/resident/forms/:formId/respond" element={<Respond />} /><Route path="/resident/history" element={<History />} /></Route>
      </Route>
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter>;
}
