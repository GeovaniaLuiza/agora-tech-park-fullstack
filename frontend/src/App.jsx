import { useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  BarChart3, Building2, Check, CheckSquare, Download, Eye, FileText, Filter,
  Hash, List, Plus, Search, TrendingUp, Type, Users,
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatCard from './components/StatCard';
import FormCard from './components/FormCard';
import { useForms } from './hooks/useForms';
import {
  addFormQuestion, addQuestionOption, archiveForm, changeUserRole, changeUserStatus,
  createForm, downloadIndicatorReport, duplicateForm, getAudit, getDashboard, getEligibleFormRecipients, getForm,
  getFormQuestions, getFormResponse, getIndicatorHistory, getIndicators, getOrganizations, getQuestionOptions,
  getResponseHistory, getUsers, publishForm, saveResponseDraft, submitResponse,
  updateForm, updateFormQuestion,
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
import { homeForRole } from './config/access';
import { formatIndicatorValue } from './utils/formatters.js';

const pageMeta = {
  '/dashboard': ['Dashboard', 'Visão geral dos indicadores do ecossistema'],
  '/forms': ['Formulários', 'Gerencie coletas de indicadores'],
  '/forms/new': ['Criar formulário', 'Construa o formulário sem escrever código'],
  '/indicators': ['Indicadores', 'Dashboard estratégico do ecossistema'],
  '/organizations': ['Residentes', 'Empresas cadastradas no Ágora Tech Park'],
  '/admin': ['Aprovações', 'Valide novos usuários e vínculos'],
  '/admin/solicitacoes': ['Solicitações', 'Valide novos usuários, perfis e vínculos'],
  '/admin/usuarios': ['Usuários', 'Gerencie perfis e situação de acesso'],
  '/admin/auditoria': ['Auditoria', 'Histórico de ações críticas'],
  '/perfil': ['Meu perfil', 'Dados da sua conta e vínculos'],
  '/pesquisa': ['Área de pesquisa', 'Gerencie coletas de indicadores'],
  '/residente': ['Formulários disponíveis', 'Coletas destinadas à sua organização'],
  '/resident/history': ['Histórico de respostas', 'Formulários respondidos pela sua organização'],
  respond: ['Responder formulário', 'Preenchimento pela organização vinculada'],
};

const Button = ({ children, variant = 'primary', className = '', ...props }) => <button className={`button ${variant} ${className}`} {...props}>{children}</button>;
const Progress = ({ value }) => <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
const ErrorMessage = ({ message }) => message ? <div className="error" role="alert">{message}</div> : null;

function Forms({ resident = false }) {
  const { forms, loading, error, reload } = useForms();
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const navigate = useNavigate();
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
const emptyQuestion = (type = 'TEXT') => ({ label: '', type, required: true, options: '' });

function Create() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', startDate: '', endDate: '' });
  const [questions, setQuestions] = useState([emptyQuestion('NUMBER')]);
  const [organizations, setOrganizations] = useState([]);
  const [targets, setTargets] = useState([]);
  const [residents, setResidents] = useState([]);
  const [recipientIds, setRecipientIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    getOrganizations().then(setOrganizations).catch((reason) => setError(reason.message));
    getEligibleFormRecipients().then(setResidents).catch((reason) => setError(reason.message));
    if (formId) {
      Promise.all([getForm(formId), getFormQuestions(formId)]).then(async ([loaded, loadedQuestions]) => {
        setForm({
          title: loaded.title,
          description: loaded.description || '',
          startDate: loaded.start_date?.slice(0, 10) || '',
          endDate: loaded.end_date?.slice(0, 10) || '',
        });
        const withOptions = await Promise.all(loadedQuestions.map(async (question) => ({
          ...question,
          options: question.type === 'OPTION' ? (await getQuestionOptions(formId, question.id)).map((option) => option.value).join(', ') : '',
        })));
        setQuestions(withOptions);
      }).catch((reason) => setError(reason.message));
    }
  }, [formId]);
  const visibleResidents = targets.length
    ? residents.filter((resident) => resident.organizations.some((organization) => targets.includes(organization.id)))
    : residents;
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
    setSaving(true); setError('');
    try {
      const payloadForm = { ...form, title };
      const saved = formId ? await updateForm(formId, payloadForm) : await createForm(payloadForm);
      for (const [position, question] of filledQuestions.entries()) {
        const payload = { label: question.label, type: question.type, required: question.required, position };
        const savedQuestion = question.id
          ? await updateFormQuestion(saved.id, question.id, payload)
          : await addFormQuestion(saved.id, payload);
        if (!question.id && question.type === 'OPTION') {
          for (const option of question.options.split(',').map((value) => value.trim()).filter(Boolean)) {
            await addQuestionOption(saved.id, savedQuestion.id, option);
          }
        }
      }
      if (shouldPublish) await publishForm(saved.id, targets, recipientIds);
      navigate('/forms');
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  };
  return <div className="content builder-layout">
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
  useEffect(() => { getIndicators({ ...(period ? { period } : {}), ...(search ? { name: search } : {}) }).then(setItems).catch((reason) => setError(reason.message)); }, [period, search]);
  const download = async (format) => {
    try {
      const report = await downloadIndicatorReport(format, period ? { period } : {});
      const url = URL.createObjectURL(report.blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = report.filename; anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError(reason.message); }
  };
  const canExport = user.role !== 'RESIDENTE';
  return <div className="content indicators-page"><div className="source-notice"><strong>Fonte: Planilha oficial · CI JOINVILLE</strong><span>Histórico institucional importado e persistido no PostgreSQL.</span></div><div className="toolbar"><label className="field-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar indicador ou código..." /></label><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="">2025</option>{periods.map((value) => <option key={value}>{value}</option>)}</select>{canExport && <><Button variant="secondary" className="push" onClick={() => download('pdf')}><Download />PDF</Button><Button variant="secondary" onClick={() => download('excel')}><Download />Excel</Button><Button variant="secondary" onClick={() => download('csv')}><Download />CSV</Button></>}</div><ErrorMessage message={error} /><section className="metric-grid">{items.map((item) => <article className="panel metric indicator-card" key={item.id}><div><span>{item.category}</span><code>{item.code}</code></div><h3>{item.name}</h3><h2>{item.json_value ? `${item.json_value.length} organizações` : formatIndicatorValue(item.value ?? item.text_value, item.value_type, item.unit)}</h2><p>{item.description}</p>{Array.isArray(item.json_value) && <div className="indicator-details" aria-label={`Detalhamento de ${item.name}`}>{item.json_value.map((detail) => <div key={detail.organization}><strong>{detail.organization}</strong><span>Desafios: {detail.challenges} · Soluções: {detail.solutions} · Negócios: {detail.deals}</span></div>)}</div>}<footer><em>{item.period}</em><small>{item.source}</small></footer></article>)}</section>{!items.length && !error && <article className="panel empty-state">Nenhum indicador da planilha encontrado para os filtros.</article>}</div>;
}

function Residents() {
  const [organizations, setOrganizations] = useState([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { getOrganizations().then(setOrganizations).catch((reason) => setError(reason.message)); }, []);
  const visible = organizations.filter((organization) => organization.name.toLowerCase().includes(search.toLowerCase()));
  return <div className="content"><div className="toolbar"><label className="field-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar organização..." /></label></div><ErrorMessage message={error} /><section className="forms-grid">{visible.map((org) => <article className="panel resident-card" key={org.id}><span className="company-mark">{org.name?.[0]}</span><div><h3>{org.name}</h3><p>CNPJ: {org.cnpj || 'Não informado'} · {org.status}</p></div></article>)}</section>{!visible.length && !error && <article className="panel empty-state"><Building2 /><h3>Nenhuma organização encontrada</h3></article>}</div>;
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
      if (submit) { await submitResponse(formId, organizationId, payload()); setSent(true); }
      else await saveResponseDraft(formId, organizationId, payload());
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  };
  const answeredCount = Object.values(answers).filter((value) => value !== '' && value !== null && value !== undefined).length;
  if (!organizationId) return <div className="content"><ErrorMessage message="Sua conta ainda não possui uma organização vinculada." /></div>;
  if (!form && !error) return <div className="content">Carregando formulário...</div>;
  return <div className="content respond"><article className="respond-card"><ErrorMessage message={error} />{form && <div className="respond-head"><small>COLETA</small><h2>{form.title}</h2><p>{form.description}</p><p>Prazo: {form.period || 'não informado'}</p><div className="response-progress"><Progress value={questions.length ? (answeredCount / questions.length) * 100 : 0} /><span>{answeredCount} de {questions.length}</span></div></div>}<form onSubmit={(event) => { event.preventDefault(); persist(true); }}>{sent ? <div className="success"><Check /><h3>Resposta enviada com sucesso!</h3><p>Uma nova edição exige reabertura pela equipe responsável.</p></div> : <>{questions.map((question) => <label key={question.id}>{question.label}{question.required && ' *'}{question.type === 'OPTION' ? <div className="choices">{(options[question.id] || []).map((option) => <button type="button" className={answers[question.id] === option.value ? 'selected' : ''} onClick={() => update(question.id, option.value)} key={option.id}>{option.value}</button>)}</div> : <input type={question.type === 'TEXT' ? 'text' : 'number'} step={question.type === 'DECIMAL' ? '.01' : '1'} value={answers[question.id] || ''} onChange={(event) => update(question.id, event.target.value)} />}</label>)}<div className="toolbar"><Button type="button" variant="secondary" disabled={saving} onClick={() => persist(false)}>Salvar rascunho</Button><Button type="submit" disabled={saving}>Enviar respostas</Button></div></>}</form></article></div>;
}

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [processingId, setProcessingId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const load = () => getUsers().then(setUsers).catch((reason) => setError(reason.message)).finally(() => setLoading(false));
  useEffect(() => { void load(); }, []);
  const change = async (id, operation) => {
    setProcessingId(id); setError(''); setMessage('');
    try { await operation(); await load(); setMessage('Usuário atualizado com sucesso.'); }
    catch (reason) { setError(reason.message); }
    finally { setProcessingId(''); }
  };
  const visible = users.filter((item) => `${item.name} ${item.email}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="content"><div className="toolbar"><label className="field-search"><Search /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar usuário..." /></label></div><ErrorMessage message={error} />{message && <div className="success-message" role="status">{message}</div>}{loading ? <div className="panel">Carregando usuários...</div> : <section className="panel history">{visible.map((item) => <div className="history-row" key={item.id}><div><strong>{item.name}</strong><small>{item.email} · {item.status}</small></div><select aria-label={`Perfil de ${item.name}`} disabled={processingId === item.id} value={item.role || ''} onChange={(event) => change(item.id, () => changeUserRole(item.id, event.target.value))}><option value="" disabled>Sem perfil</option>{['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE'].map((role) => <option key={role}>{role}</option>)}</select>{item.status === 'ACTIVE' ? <Button disabled={processingId === item.id} variant="secondary" onClick={() => change(item.id, () => changeUserStatus(item.id, 'INACTIVE'))}>Inativar</Button> : item.status === 'INACTIVE' && <Button disabled={processingId === item.id} onClick={() => change(item.id, () => changeUserStatus(item.id, 'ACTIVE'))}>Ativar</Button>}</div>)}{!visible.length && <div className="empty-state">Nenhum usuário encontrado.</div>}</section>}</div>;
}

function ProfilePage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const organizations = user.organizations || [];
  const leave = async () => { await logout(); navigate('/login', { replace: true }); };
  return <div className="content profile-page"><section className="panel profile-card">
    <div className="profile-avatar">{user.name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>
    <div><h2>{user.name}</h2><p>{user.email}</p></div>
    <dl><div><dt>Perfil</dt><dd>{user.role}</dd></div><div><dt>Status</dt><dd>{user.status}</dd></div><div><dt>Organizações</dt><dd>{organizations.length ? organizations.map((organization) => organization.name).join(', ') : 'Nenhuma organização vinculada'}</dd></div></dl>
    <Button variant="secondary" onClick={leave}>Sair da conta</Button>
  </section></div>;
}

function Audit() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => { getAudit().then(setItems).catch((reason) => setError(reason.message)); }, []);
  return <div className="content"><ErrorMessage message={error} /><article className="panel history">{items.map((item) => <div className="history-row" key={item.id}><div><strong>{item.action}</strong><small>{item.entity} · {item.user_name || 'Sistema'}</small></div><time>{new Date(item.created_at).toLocaleString('pt-BR')}</time></div>)}</article></div>;
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
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR']} />}><Route path="/dashboard" element={<DashboardPage />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR']} />}><Route path="/pesquisa" element={<Forms />} /><Route path="/forms" element={<Forms />} /><Route path="/forms/new" element={<Create />} /><Route path="/forms/:formId/edit" element={<Create />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE']} />}><Route path="/indicators" element={<Indicators />} /></Route><Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR']} />}><Route path="/organizations" element={<Residents />} /></Route>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route element={<ProtectedRoute roles={['ADMIN']} />}><Route path="/admin" element={<AdminRequestsPage />} /><Route path="/admin/solicitacoes" element={<AdminRequestsPage />} /><Route path="/admin/usuarios" element={<AdminUsers />} /><Route path="/admin/auditoria" element={<Audit />} /><Route path="/admin/requests" element={<Navigate to="/admin/solicitacoes" replace />} /></Route>
        <Route element={<ProtectedRoute roles={['RESIDENTE']} />}><Route path="/residente" element={<Forms resident />} /><Route path="/resident/forms" element={<Forms resident />} /><Route path="/resident/forms/:formId/respond" element={<Respond />} /><Route path="/resident/history" element={<History />} /></Route>
      </Route>
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter>;
}
