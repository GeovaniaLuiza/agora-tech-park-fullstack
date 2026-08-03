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
  createForm, downloadIndicatorReport, duplicateForm, getAudit, getDashboard, getForm,
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
import { homeForRole } from './config/access';

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
  '/pesquisa': ['Área de pesquisa', 'Gerencie coletas de indicadores'],
  '/residente': ['Formulários disponíveis', 'Coletas destinadas à sua organização'],
  '/resident/history': ['Histórico de respostas', 'Formulários respondidos pela sua organização'],
  respond: ['Responder formulário', 'Preenchimento pela organização vinculada'],
};

const Button = ({ children, variant = 'primary', className = '', ...props }) => <button className={`button ${variant} ${className}`} {...props}>{children}</button>;
const Progress = ({ value }) => <div className="progress"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>;
const ErrorMessage = ({ message }) => message ? <div className="error" role="alert">{message}</div> : null;

function Dashboard() {
  const [data, setData] = useState(null);
  const [indicators, setIndicators] = useState([]);
  const [error, setError] = useState('');
  useEffect(() => {
    Promise.all([getDashboard(), getIndicators()])
      .then(([dashboard, rows]) => { setData(dashboard); setIndicators(rows.slice(0, 6)); })
      .catch((reason) => setError(reason.message));
  }, []);
  if (!data && !error) return <div className="content">Carregando painel...</div>;
  return <div className="content">
    <ErrorMessage message={error} />
    {data && <section className="stats">
      <StatCard label="Residentes ativos" value={data.active_organizations} icon={<Users />} />
      <StatCard label="Formulários ativos" value={data.active_forms} icon={<FileText />} tone="green" />
      <StatCard label="Taxa de resposta" value={`${data.response_rate}%`} icon={<TrendingUp />} tone="sand" />
      <StatCard label="Indicadores" value={data.indicators} icon={<BarChart3 />} />
    </section>}
    <section className="forms-grid">
      {indicators.map((item) => <article className="panel metric" key={item.id}><span>{item.name}</span><h2>{Number(item.value).toLocaleString('pt-BR')}</h2><p>{item.period}</p></article>)}
      {!indicators.length && !error && <article className="panel empty-state"><BarChart3 /><h3>Nenhum indicador calculado</h3><p>Os dados aparecerão após uma coleta ser processada.</p></article>}
    </section>
  </div>;
}

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
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    getOrganizations().then(setOrganizations).catch((reason) => setError(reason.message));
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
  const updateQuestion = (index, patch) => setQuestions(questions.map((question, current) => current === index ? { ...question, ...patch } : question));
  const save = async (shouldPublish) => {
    setSaving(true); setError('');
    try {
      const saved = formId ? await updateForm(formId, form) : await createForm(form);
      for (const [position, question] of questions.entries()) {
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
      if (shouldPublish) await publishForm(saved.id, targets);
      navigate('/forms');
    } catch (reason) { setError(reason.message); } finally { setSaving(false); }
  };
  return <div className="content builder-layout">
    <aside className="panel toolbox"><h4>TIPOS DE PERGUNTA</h4>{questionTypes.map(([Icon, label, type]) => <button key={type} onClick={() => setQuestions([...questions, emptyQuestion(type)])}><span><Icon /></span>{label}</button>)}<hr /><h4>CONFIGURAÇÕES</h4><label>Início</label><input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /><label>Fim</label><input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /><label>Destinatários (vazio = todos)</label><select multiple value={targets} onChange={(event) => setTargets([...event.target.selectedOptions].map((option) => option.value))}>{organizations.filter((organization) => organization.status !== 'INACTIVE').map((organization) => <option value={organization.id} key={organization.id}>{organization.name}</option>)}</select></aside>
    <main className="panel builder"><ErrorMessage message={error} /><div className="builder-heading"><input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Título do formulário" /><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descrição" /></div>{questions.map((question, index) => <article className="question" key={question.id || index}><small>#{index + 1} <span>{question.type}</span></small><input value={question.label} onChange={(event) => updateQuestion(index, { label: event.target.value })} placeholder="Texto da pergunta" /><select value={question.type} onChange={(event) => updateQuestion(index, { type: event.target.value })}>{questionTypes.map(([, label, type]) => <option value={type} key={type}>{label}</option>)}</select>{question.type === 'OPTION' && <input value={question.options} onChange={(event) => updateQuestion(index, { options: event.target.value })} placeholder="Opções separadas por vírgula" />}</article>)}<Button variant="dashed" onClick={() => setQuestions([...questions, emptyQuestion()])}><Plus />Adicionar pergunta</Button><div className="toolbar"><Button disabled={saving} onClick={() => save(false)}>Salvar rascunho</Button><Button disabled={saving} onClick={() => save(true)}>Publicar</Button></div></main>
    <aside className="panel preview"><h4>PRÉ-VISUALIZAÇÃO</h4><div><strong>{form.title || 'Novo formulário'}</strong><small>{questions.length} pergunta(s)</small>{questions.map((question, index) => <label key={question.id || index}>{question.label || 'Pergunta sem título'}<input disabled /></label>)}</div></aside>
  </div>;
}

function Indicators() {
  const [items, setItems] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [period, setPeriod] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { getIndicatorHistory().then(setPeriods).catch((reason) => setError(reason.message)); }, []);
  useEffect(() => { getIndicators(period ? { period } : {}).then(setItems).catch((reason) => setError(reason.message)); }, [period]);
  const download = async (format) => {
    try {
      const report = await downloadIndicatorReport(format, period ? { period } : {});
      const url = URL.createObjectURL(report.blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = report.filename; anchor.click();
      URL.revokeObjectURL(url);
    } catch (reason) { setError(reason.message); }
  };
  return <div className="content"><div className="toolbar"><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="">Todos os períodos</option>{periods.map((value) => <option key={value}>{value}</option>)}</select><Button variant="secondary" className="push" onClick={() => download('pdf')}><Download />PDF</Button><Button variant="secondary" onClick={() => download('excel')}><Download />Excel</Button></div><ErrorMessage message={error} /><section className="metric-grid">{items.map((item) => <article className="panel metric" key={item.id}><span>{item.name}</span><h2>{Number(item.value).toLocaleString('pt-BR')}</h2><em>{item.period}</em></article>)}</section>{!items.length && !error && <article className="panel empty-state">Nenhum indicador encontrado.</article>}</div>;
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
  return <div className="content"><ErrorMessage message={error} /><section className="stats history-stats"><StatCard label="Enviados" value={items.filter((item) => item.status === 'SUBMITTED').length} /><StatCard label="Reabertos" value={items.filter((item) => item.status === 'REOPENED').length} /><StatCard label="Rascunhos" value={items.filter((item) => item.status === 'DRAFT').length} /></section><article className="panel history"><h2>Respostas da organização</h2>{items.map((item) => <div className="history-row" key={item.id}><span className={item.status === 'SUBMITTED' ? 'done-dot' : 'waiting-dot'}><Check /></span><div><strong>{item.title}</strong><small>{item.sent_at ? `Enviado em ${new Date(item.sent_at).toLocaleDateString('pt-BR')}` : 'Ainda não enviado'}</small></div><em>{item.status}</em></div>)}</article></div>;
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
  if (!organizationId) return <div className="content"><ErrorMessage message="Sua conta ainda não possui uma organização vinculada." /></div>;
  if (!form && !error) return <div className="content">Carregando formulário...</div>;
  return <div className="content respond"><article className="respond-card"><ErrorMessage message={error} />{form && <div className="respond-head"><small>COLETA</small><h2>{form.title}</h2><p>{form.description}</p><p>Prazo: {form.period || 'não informado'}</p><Progress value={questions.length ? (Object.values(answers).filter(Boolean).length / questions.length) * 100 : 0} /></div>}<form onSubmit={(event) => { event.preventDefault(); persist(true); }}>{sent ? <div className="success"><Check /><h3>Resposta enviada com sucesso!</h3><p>Uma nova edição exige reabertura pela equipe responsável.</p></div> : <>{questions.map((question) => <label key={question.id}>{question.label}{question.required && ' *'}{question.type === 'OPTION' ? <div className="choices">{(options[question.id] || []).map((option) => <button type="button" className={answers[question.id] === option.value ? 'selected' : ''} onClick={() => update(question.id, option.value)} key={option.id}>{option.value}</button>)}</div> : <input type={question.type === 'TEXT' ? 'text' : 'number'} step={question.type === 'DECIMAL' ? '.01' : '1'} value={answers[question.id] || ''} onChange={(event) => update(question.id, event.target.value)} />}</label>)}<div className="toolbar"><Button type="button" variant="secondary" disabled={saving} onClick={() => persist(false)}>Salvar rascunho</Button><Button type="submit" disabled={saving}>Enviar respostas</Button></div></>}</form></article></div>;
}

function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const load = () => getUsers().then(setUsers).catch((reason) => setError(reason.message));
  useEffect(load, []);
  const change = async (operation) => { try { await operation(); load(); } catch (reason) { setError(reason.message); } };
  return <div className="content"><ErrorMessage message={error} /><section className="panel history">{users.map((item) => <div className="history-row" key={item.id}><div><strong>{item.name}</strong><small>{item.email}</small></div><select value={item.role || ''} onChange={(event) => change(() => changeUserRole(item.id, event.target.value))}><option value="" disabled>Sem perfil</option>{['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE'].map((role) => <option key={role}>{role}</option>)}</select>{item.status === 'ACTIVE' ? <Button variant="secondary" onClick={() => change(() => changeUserStatus(item.id, 'INACTIVE'))}>Inativar</Button> : item.status === 'INACTIVE' && <Button onClick={() => change(() => changeUserStatus(item.id, 'ACTIVE'))}>Ativar</Button>}</div>)}</section></div>;
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
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR']} />}><Route path="/dashboard" element={<Dashboard />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR']} />}><Route path="/pesquisa" element={<Forms />} /><Route path="/forms" element={<Forms />} /><Route path="/forms/new" element={<Create />} /><Route path="/forms/:formId/edit" element={<Create />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR']} />}><Route path="/indicators" element={<Indicators />} /><Route path="/organizations" element={<Residents />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN']} />}><Route path="/admin" element={<AdminRequestsPage />} /><Route path="/admin/solicitacoes" element={<AdminRequestsPage />} /><Route path="/admin/usuarios" element={<AdminUsers />} /><Route path="/admin/auditoria" element={<Audit />} /><Route path="/admin/requests" element={<Navigate to="/admin/solicitacoes" replace />} /></Route>
        <Route element={<ProtectedRoute roles={['RESIDENTE']} />}><Route path="/residente" element={<Forms resident />} /><Route path="/resident/forms" element={<Forms resident />} /><Route path="/resident/forms/:formId/respond" element={<Respond />} /><Route path="/resident/history" element={<History />} /></Route>
      </Route>
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter>;
}
