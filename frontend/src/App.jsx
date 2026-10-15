import { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Building2, Check, CheckSquare, Edit3, Hash, List, Plus, Search, Trash2, Type, X,
} from 'lucide-react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import StatCard from './components/StatCard';
import FormCard from './components/FormCard';
import { useForms } from './hooks/useForms';
import { useInnovationCenterSelection } from './hooks/useInnovationCenterSelection.js';
import {
  addFormQuestion, addQuestionOption, archiveForm, clearAudit,
  createForm, duplicateForm, getAudit, getEligibleFormRecipients, getForm,
  getFormQuestions, getFormResponse, getFormIndicatorDefinitions, getFormOrganizations, getInnovationCenters, getOrganizations, getQuestionOptions,
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
import ImportedIndicatorsPage from './pages/ImportedIndicatorsPage.jsx';
import { homeForRole } from './config/access';
import IndicatorsPage from './pages/IndicatorsPage.jsx';

const pageMeta = {
  '/dashboard': ['Dashboard', 'Visão geral dos indicadores do ecossistema'],
  '/forms': ['Formulários', 'Gerencie coletas de indicadores'],
  '/forms/new': ['Criar formulário', 'Construa o formulário sem escrever código'],
  '/indicators': ['Indicadores', 'Dashboard estratégico do ecossistema'],
  '/indicators/catalog': ['Cadastro de indicadores', 'Administre o catálogo usado pelos formulários e dashboards'],
  '/indicadores/importar-eventos': ['Importar eventos', 'Revise reservas antes de atualizar os indicadores'],
  '/indicadores/importar-residentes': ['Importar empresas residentes', 'Consolide contratos do HUB, MOB e UNI'],
  '/indicadores/eventos': ['Indicadores de Eventos', 'Eventos confirmados por centro e ano'],
  '/indicadores/residentes': ['Indicadores de Residentes', 'Empresas e ocupações confirmadas por centro e ano'],
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
  const location = useLocation();
  const [actionError, setActionError] = useState('');
  const [search, setSearch] = useState('');
  const visible = forms.filter((form) => form.title.toLowerCase().includes(search.toLowerCase()));
  const perform = async (action) => {
    setActionError('');
    try { await action(); reload?.(); } catch (reason) { setActionError(reason.message); }
  };
  if (loading) return <div className="content">Carregando formulários...</div>;
  return <div className="content">
    {location.state?.formMessage && <div className="success-message" role="status">{location.state.formMessage}</div>}
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
const normalizeRecipientSearch = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

function Create() {
  const { formId } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', description: '', startDate: '', endDate: '', innovationCenterId: '', indicatorYear: String(new Date().getFullYear()), indicatorMonth: '' });
  const [questions, setQuestions] = useState([emptyQuestion('NUMBER')]);
  const [indicatorDefinitions, setIndicatorDefinitions] = useState([]);
  const [centers, setCenters] = useState([]);
  const [centerId, setCenterId] = useInnovationCenterSelection(centers, form.innovationCenterId);
  const [indicatorCategory, setIndicatorCategory] = useState('');
  const [organizations, setOrganizations] = useState([]);
  const [targets, setTargets] = useState([]);
  const [residents, setResidents] = useState([]);
  const [loadedRecipientOrganizations, setLoadedRecipientOrganizations] = useState([]);
  const [savedRecipients, setSavedRecipients] = useState([]);
  const [recipientIds, setRecipientIds] = useState([]);
  const [emailInvitations, setEmailInvitations] = useState(false);
  const [formStatus, setFormStatus] = useState(formId ? null : 'DRAFT');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const recipientPickerRef = useRef(null);
  const recipientSearchRef = useRef(null);
  const savedFormId = useRef(null);
  const savingRef = useRef(false);
  const [recipientError, setRecipientError] = useState('');
  const [invalidFields, setInvalidFields] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    getOrganizations().then(setOrganizations).catch((reason) => setError(reason.message));
    getInnovationCenters().then(setCenters).catch((reason) => setError(reason.message));
    getFormIndicatorDefinitions().then(setIndicatorDefinitions).catch((reason) => setError(reason.message));
    if (formId) {
      Promise.all([getForm(formId), getFormQuestions(formId), getFormRespondents(formId), getFormOrganizations(formId)]).then(async ([loaded, loadedQuestions, savedRespondents, savedOrganizations]) => {
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
        setSavedRecipients(savedRespondents.map((respondent) => ({ id: respondent.user_id, name: respondent.name || 'Respondente indisponível', email: respondent.email || '' })));
        setRecipientIds(savedRespondents.map((respondent) => respondent.user_id));
        setTargets(savedOrganizations.map((organization) => organization.id));
        setFormStatus(loaded.status);
      }).catch((reason) => setError(reason.message));
    }
  }, [formId]);
  useEffect(() => {
    let active = true;
    if (!targets.length) {
      return () => { active = false; };
    }
    getEligibleFormRecipients(targets)
      .then((eligible) => {
        if (!active) return;
        setResidents(eligible);
        setLoadedRecipientOrganizations(targets);
        setRecipientIds((current) => {
          const next = current.filter((id) => eligible.some((resident) => resident.id === id));
          if (!next.length && current.length) setEmailInvitations(false);
          return next;
        });
      })
      .catch((reason) => {
        if (!active) return;
        setResidents([]);
        setLoadedRecipientOrganizations(targets);
        setError(reason.message);
      });
    return () => { active = false; };
  }, [targets]);
  useEffect(() => {
    if (!recipientPickerOpen) return undefined;
    const closeOutside = (event) => {
      if (!recipientPickerRef.current?.contains(event.target)) setRecipientPickerOpen(false);
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, [recipientPickerOpen]);
  useEffect(() => {
    if (recipientPickerOpen) recipientSearchRef.current?.focus();
  }, [recipientPickerOpen]);
  const recipientLoading = targets.length > 0
    && (targets.length !== loadedRecipientOrganizations.length || targets.some((id, index) => loadedRecipientOrganizations[index] !== id));
  const eligibleResidents = targets.length && !recipientLoading ? residents : [];
  const search = normalizeRecipientSearch(recipientSearch.trim());
  const visibleResidents = eligibleResidents.filter((resident) => normalizeRecipientSearch(`${resident.name} ${resident.email}`).includes(search));
  const selectedResidents = recipientIds.map((id) => residents.find((resident) => resident.id === id)
    || savedRecipients.find((recipient) => recipient.id === id) || { id, name: 'Respondente indisponível', email: '' });
  const toggleTarget = (organizationId) => {
    const next = targets.includes(organizationId) ? targets.filter((id) => id !== organizationId) : [...targets, organizationId];
    setLoadedRecipientOrganizations([]);
    setTargets(next);
    setRecipientSearch('');
    setRecipientPickerOpen(next.length > 0);
    if (!next.length) setResidents([]);
    selectRecipients(next.length ? recipientIds.filter((id) => residents.find((resident) => resident.id === id)?.organizations.some((organization) => next.includes(organization.id))) : []);
  };
  const canEdit = formStatus === 'DRAFT';
  const canSendEmail = canEdit && recipientIds.length > 0;
  const selectRecipients = (selected) => {
    setRecipientIds(selected);
    setRecipientError('');
    if (!selected.length) setEmailInvitations(false);
  };
  const toggleRecipient = (residentId) => {
    selectRecipients(recipientIds.includes(residentId) ? recipientIds.filter((id) => id !== residentId) : [...recipientIds, residentId]);
  };
  const updateQuestion = (index, patch) => setQuestions(questions.map((question, current) => current === index ? { ...question, ...patch } : question));
  const save = async (shouldPublish) => {
    if (savingRef.current || !canEdit) return;
    setError(''); setRecipientError(''); setInvalidFields([]);
    const invalid = (message, fields) => { setError(message); setInvalidFields(fields); };
    if (shouldPublish && !recipientIds.length) {
      setRecipientError('Selecione ao menos um respondente para enviar o formulário.');
      return;
    }
    if (shouldPublish && !emailInvitations) {
      setRecipientError('Marque o envio de convite por e-mail antes de enviar o formulário.');
      return;
    }
    const title = form.title.trim();
    const filledQuestions = questions.filter((question) => question.label.trim());
    if (title.length < 3) {
      invalid('Informe um título com pelo menos 3 caracteres.', ['title']);
      return;
    }
    if (questions.some((question) => question.label.trim() && question.label.trim().length < 3)) {
      invalid('Toda pergunta preenchida deve ter pelo menos 3 caracteres.', questions.flatMap((question, index) => question.label.trim() && question.label.trim().length < 3 ? [`question-${index}`] : []));
      return;
    }
    if (shouldPublish && !filledQuestions.length) {
      invalid('Inclua ao menos uma pergunta antes de enviar.', questions.map((_, index) => `question-${index}`));
      return;
    }
    if (shouldPublish && (!form.startDate || !form.endDate)) {
      invalid('Defina as datas de início e fim antes de enviar.', [!form.startDate && 'startDate', !form.endDate && 'endDate'].filter(Boolean));
      return;
    }
    if (form.startDate && form.endDate && form.startDate > form.endDate) {
      invalid('A data final deve ser igual ou posterior à data inicial.', ['startDate', 'endDate']);
      return;
    }
    if (filledQuestions.some((question) => question.type === 'OPTION' && !question.options.split(',').some((value) => value.trim()))) {
      invalid('Informe ao menos uma opção para cada pergunta de escolha.', questions.flatMap((question, index) => question.label.trim() && question.type === 'OPTION' && !question.options.split(',').some((value) => value.trim()) ? [`options-${index}`] : []));
      return;
    }
    if ((form.indicatorMonth || (shouldPublish && filledQuestions.some((question) => question.indicatorId)))
        && (!centerId || !form.indicatorYear || !form.indicatorMonth)) {
      invalid('Para coletar indicadores, informe o Centro de Inovação, o ano e o mês de referência.', [!centerId && 'center', !form.indicatorYear && 'year', !form.indicatorMonth && 'month'].filter(Boolean));
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      const hasIndicatorPeriod = Boolean(form.indicatorMonth);
      const payloadForm = { ...form, title,
        innovationCenterId: hasIndicatorPeriod ? centerId : null,
        indicatorYear: hasIndicatorPeriod ? Number(form.indicatorYear) : null,
        indicatorMonth: hasIndicatorPeriod ? Number(form.indicatorMonth) : null };
      const existingId = formId || savedFormId.current;
      const saved = existingId ? await updateForm(existingId, payloadForm) : await createForm(payloadForm);
      savedFormId.current = saved.id;
      for (const [position, question] of filledQuestions.entries()) {
        const payload = { label: question.label, type: question.type, required: question.required, position, indicatorId: question.indicatorId || null };
        const savedQuestion = question.id
          ? await updateFormQuestion(saved.id, question.id, payload)
          : await addFormQuestion(saved.id, payload);
        const trackQuestion = (patch) => setQuestions((current) => current.map((item) => item === question || item.id === savedQuestion.id ? { ...item, id: savedQuestion.id, ...patch } : item));
        if (!question.id) trackQuestion(question.type === 'OPTION' ? { savedOptionCount: 0 } : {});
        if (question.type === 'OPTION' && (!question.id || question.savedOptionCount !== undefined)) {
          const options = question.options.split(',').map((value) => value.trim()).filter(Boolean);
          for (let index = question.savedOptionCount || 0; index < options.length; index += 1) {
            await addQuestionOption(saved.id, savedQuestion.id, options[index]);
            trackQuestion({ savedOptionCount: index + 1 });
          }
        }
      }
      let formMessage = 'Formulário salvo com sucesso.';
      if (shouldPublish) {
        const published = await publishForm(saved.id, targets, recipientIds);
        const summary = published.notificationSummary;
        formMessage = summary.failed
          ? `Formulário salvo. ${summary.sent} convites enviados e ${summary.failed} falharam.`
          : `Formulário salvo e enviado para ${summary.sent} respondente(s).`;
      } else {
        await saveFormAudience(saved.id, targets, recipientIds);
      }
      navigate('/forms', { state: { formMessage } });
    } catch (reason) {
      if (['RESIDENT_RECIPIENT_REQUIRED', 'INELIGIBLE_RESIDENT_RECIPIENT', 'RESPONDENT_ORGANIZATION_REQUIRED'].includes(reason.code)) {
        setRecipientError(reason.message);
      } else {
        setError(reason.message === 'Erro interno do servidor' ? 'Não foi possível concluir a operação. Verifique os dados e tente novamente.' : reason.message);
      }
    } finally { savingRef.current = false; setSaving(false); }
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
    <div className="builder-settings">
      <aside className="panel toolbox form-settings indicator-catalog-panel">
        <h4>INDICADORES DA PLANILHA 2026</h4>
        <p className="indicator-catalog-help">Selecione os indicadores numéricos que serão coletados neste formulário. Somente perguntas vinculadas alimentam os indicadores e o Dashboard, conforme a agregação do catálogo.</p>
        <label>Categoria<select value={indicatorCategory} onChange={(event) => setIndicatorCategory(event.target.value)}><option value="">Todas</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label>
        <div className="indicator-selection-summary"><strong>{selectedIndicatorCount}</strong><span>indicador(es) selecionado(s)</span></div>
        <div className="indicator-catalog">{availableIndicators.map((definition) => {
          const selected = questions.some((question) => question.indicatorId === definition.id);
          return <label className={`indicator-option ${selected ? 'selected' : ''}`} key={definition.id}><input type="checkbox" checked={selected} disabled={saving || !canEdit} onChange={() => toggleIndicator(definition)} /><span><strong>{definition.name}</strong><small>{definition.category} · {definition.unit} · {definition.aggregation_type}</small></span></label>;
        })}</div>
        <hr /><h4>PERÍODO DOS DADOS</h4>
        <label>Centro<select value={centerId} disabled={saving || !canEdit} aria-invalid={invalidFields.includes('center')} onChange={(event) => { setCenterId(event.target.value); setForm({ ...form, innovationCenterId: event.target.value }); }}><option value="">Selecione</option>{centers.map((center) => <option value={center.id} key={center.id}>{center.name}</option>)}</select></label>
        <div className="date-grid"><label>Ano<input type="number" min="2000" max="2200" step="1" disabled={saving || !canEdit} value={form.indicatorYear} aria-invalid={invalidFields.includes('year')} onChange={(event) => setForm({ ...form, indicatorYear: event.target.value })} /></label><label>Mês<select value={form.indicatorMonth} disabled={saving || !canEdit} aria-invalid={invalidFields.includes('month')} onChange={(event) => setForm({ ...form, indicatorMonth: event.target.value })}><option value="">Nenhum</option>{Array.from({ length: 12 }, (_, index) => <option value={index + 1} key={index + 1}>{index + 1}</option>)}</select></label></div>
        <small>Este período representa os dados coletados e pode ser diferente do prazo de resposta.</small>
      </aside>
      <aside className="panel toolbox form-settings">
        <h4>TIPOS DE PERGUNTA</h4>{questionTypes.map(([Icon, label, type]) => <button type="button" key={type} disabled={saving || !canEdit} onClick={() => setQuestions([...questions, emptyQuestion(type)])}><span><Icon /></span>{label}</button>)}
        <hr /><h4>CONFIGURAÇÕES</h4>
        <div className="date-grid"><label>Início<input type="date" disabled={saving || !canEdit} value={form.startDate} aria-invalid={invalidFields.includes('startDate')} onChange={(event) => setForm({ ...form, startDate: event.target.value })} /></label><label>Fim<input type="date" disabled={saving || !canEdit} value={form.endDate} aria-invalid={invalidFields.includes('endDate')} onChange={(event) => setForm({ ...form, endDate: event.target.value })} /></label></div>
        <fieldset className="recipient-fieldset" aria-describedby="recipient-organizations-help"><legend>Organizações destinatárias</legend>
          <p id="recipient-organizations-help" className="recipient-organizations-help">Selecione uma ou mais organizações para definir quais residentes poderão receber o formulário.</p>
          {organizations.filter((organization) => organization.status !== 'INACTIVE').map((organization) => <label className="recipient-option" key={organization.id}><input type="checkbox" disabled={saving || !canEdit} checked={targets.includes(organization.id)} onChange={() => toggleTarget(organization.id)} /><span><strong>{organization.name}</strong><small>{organization.cnpj || 'Organização ativa'}</small></span></label>)}
        </fieldset>
        <fieldset className="recipient-fieldset"><legend>RESPONDENTES</legend>
          <p id="recipient-search-help">Somente residentes ativos, com e-mail válido e vínculo ativo em uma das organizações destinatárias selecionadas podem receber o formulário.</p>
          <label id="recipient-picker-label" htmlFor="recipient-picker-trigger">Selecionar respondentes</label>
          <div className="recipient-picker" ref={recipientPickerRef} onKeyDown={(event) => { if (event.key === 'Escape' && recipientPickerOpen) { setRecipientPickerOpen(false); document.getElementById('recipient-picker-trigger')?.focus(); } }}>
            <button id="recipient-picker-trigger" className="recipient-picker-trigger" type="button" disabled={saving || !canEdit || !targets.length || recipientLoading} aria-haspopup="true" aria-expanded={recipientPickerOpen} aria-controls="recipient-picker-options" aria-labelledby="recipient-picker-label" aria-describedby="recipient-search-help recipient-availability" onClick={() => setRecipientPickerOpen((open) => !open)}>
              <span>{recipientLoading ? 'Carregando respondentes...' : 'Selecione um ou mais respondentes'}</span><span className="recipient-picker-chevron" aria-hidden="true">{recipientPickerOpen ? '▴' : '▾'}</span>
            </button>
            <p id="recipient-availability" className="recipient-availability" role="status">{!targets.length
              ? 'Selecione ao menos uma organização destinatária para visualizar os respondentes vinculados.'
              : recipientLoading ? 'Carregando respondentes elegíveis...'
                : eligibleResidents.length ? `${eligibleResidents.length} respondente(s) disponível(is)`
                  : 'Nenhum respondente com vínculo ativo e e-mail válido foi encontrado para as organizações selecionadas.'}</p>
            {recipientPickerOpen && <div className="recipient-picker-popover">
              <label className="recipient-picker-search-label" htmlFor="recipient-search">Buscar por nome ou e-mail</label>
              <div className="recipient-search-control">
                <Search aria-hidden="true" />
                <input ref={recipientSearchRef} id="recipient-search" type="search" placeholder="Buscar por nome ou e-mail..." value={recipientSearch} disabled={saving || !canEdit} onChange={(event) => setRecipientSearch(event.target.value)} aria-controls="recipient-picker-options" aria-describedby="recipient-search-help recipient-availability" />
                {recipientSearch && <button type="button" disabled={saving || !canEdit} onClick={() => setRecipientSearch('')} aria-label="Limpar busca de respondentes"><X aria-hidden="true" /></button>}
              </div>
              <div id="recipient-picker-options" className="recipient-list" role="group" aria-labelledby="recipient-picker-label" aria-describedby={recipientError ? 'recipient-error' : undefined}>
                {eligibleResidents.length > 0 && !visibleResidents.length ? <small className="recipient-empty">Nenhum respondente encontrado para esta busca.</small>
                        : visibleResidents.map((resident) => <label className="recipient-option" key={resident.id}><input type="checkbox" disabled={saving || !canEdit} checked={recipientIds.includes(resident.id)} onChange={() => toggleRecipient(resident.id)} /><span><strong>{resident.name}</strong><small>{resident.email}<br />{resident.organizations.filter((organization) => targets.includes(organization.id)).map((organization) => organization.name).join(', ')}</small></span></label>)}
              </div>
              {targets.length > 0 && !recipientLoading && eligibleResidents.length > 0 && <p id="recipient-search-summary" className="recipient-search-summary" role="status">{visibleResidents.length} respondente(s) encontrado(s)</p>}
            </div>}
            <p id="form-email-count" className="recipient-selection-count" aria-live="polite">{recipientIds.length} respondente(s) selecionado(s)</p>
            {selectedResidents.length > 0 && <ul className="selected-recipients" aria-label="Respondentes selecionados">{selectedResidents.map((resident) => <li key={resident.id}><span><strong>{resident.name}</strong><small>{resident.email}</small></span><button type="button" disabled={saving || !canEdit} onClick={() => toggleRecipient(resident.id)} aria-label={`Remover respondente ${resident.name}${resident.email ? ` (${resident.email})` : ''}`}><X aria-hidden="true" /></button></li>)}</ul>}
          </div>
          {recipientError && <p id="recipient-error" className="error" role="alert">{recipientError}</p>}
          <small>O formulário pode ser salvo sem selecionar respondentes.</small>
        </fieldset>
        <fieldset className={`form-delivery ${emailInvitations && canSendEmail ? 'enabled' : ''}`}>
          <legend>ENVIO DO FORMULÁRIO</legend>
          <label className="form-delivery-option" htmlFor="send-form-email">
            <input id="send-form-email" type="checkbox" checked={emailInvitations && canSendEmail} disabled={saving || !canSendEmail} onChange={(event) => setEmailInvitations(event.target.checked)} aria-describedby="form-email-help form-email-count form-email-availability" />
            <span>Enviar formulário por e-mail aos respondentes selecionados</span>
          </label>
          <p id="form-email-help">Os respondentes receberão um e-mail com link direto para acessar e responder o formulário.</p>
          <p id="form-email-availability">{!canEdit && formStatus
            ? 'Este formulário não está em rascunho. Convites já enviados não serão reenviados por esta configuração; o reenvio é uma ação separada.'
            : !recipientIds.length ? 'Selecione ao menos um respondente para habilitar o envio por e-mail.'
              : emailInvitations ? 'Envio por e-mail habilitado. Clique em Salvar e enviar para confirmar.' : 'Envio por e-mail desativado. Salvar não envia convites.'}</p>
        </fieldset>
      </aside>
    </div>
    <main className="panel builder">
      <div className="builder-scroll">
        <ErrorMessage message={error} />
        <div className="builder-heading"><input value={form.title} disabled={saving || !canEdit} aria-invalid={invalidFields.includes('title')} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Título do formulário" /><textarea value={form.description} disabled={saving || !canEdit} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Descrição" /></div>
        {questions.map((question, index) => <article className="question" key={question.id || index}>
          <small>#{index + 1} <span>{question.type}</span></small>
          <input value={question.label} disabled={saving || !canEdit} aria-invalid={invalidFields.includes(`question-${index}`)} onChange={(event) => updateQuestion(index, { label: event.target.value })} placeholder="Texto da pergunta" />
          <select value={question.type} disabled={saving || !canEdit} aria-label={`Tipo da pergunta ${index + 1}`} onChange={(event) => updateQuestion(index, { type: event.target.value })}>{questionTypes.map(([, label, type]) => <option value={type} key={type}>{label}</option>)}</select>
          {question.type === 'OPTION' && <input value={question.options} disabled={saving || !canEdit} aria-invalid={invalidFields.includes(`options-${index}`)} onChange={(event) => updateQuestion(index, { options: event.target.value })} placeholder="Opções separadas por vírgula" />}
        </article>)}
        <Button type="button" variant="dashed" disabled={saving || !canEdit} onClick={() => setQuestions([...questions, emptyQuestion()])}><Plus />Adicionar pergunta</Button>
      </div>
      <footer className="toolbar builder-actions" aria-label="Ações do formulário">
        <Button type="button" variant="secondary" disabled={saving} onClick={() => navigate('/forms')}>Cancelar</Button>
        <Button type="button" variant={emailInvitations && canSendEmail ? 'secondary' : 'primary'} disabled={saving || !canEdit} onClick={() => save(false)}>{saving ? 'Salvando...' : formId ? 'Salvar alterações' : 'Salvar formulário'}</Button>
        <Button type="button" variant={emailInvitations && canSendEmail ? 'primary' : 'secondary'} disabled={saving || !canSendEmail || !emailInvitations} onClick={() => save(true)}>Salvar e enviar</Button>
      </footer>
    </main>
    <aside className="panel preview"><h4>PRÉ-VISUALIZAÇÃO</h4><div className="preview-scroll"><strong>{form.title || 'Novo formulário'}</strong><small>{questions.length} pergunta(s)</small>{questions.map((question, index) => <label key={question.id || index}>{question.label || 'Pergunta sem título'}<input disabled aria-label={`Pré-visualização da pergunta ${index + 1}`} /></label>)}</div></aside>
  </div>;
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
function IndicatorsRedirect() { const location = useLocation(); return <Navigate to={`/indicators${location.search}`} state={location.state} replace />; }

export default function App() {
  return <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Routes>
    <Route element={<PublicOnlyRoute />}><Route path="/login" element={<LoginPage />} /><Route path="/solicitar-acesso" element={<RegisterRequestPage />} /><Route path="/request-access" element={<Navigate to="/solicitar-acesso" replace />} /></Route>
    <Route path="/confirmar-email" element={<VerifyEmailPage />} /><Route path="/verify-email" element={<VerifyEmailPage />} /><Route path="/reenviar-confirmacao" element={<ResendVerificationPage />} /><Route path="/esqueci-a-senha" element={<ForgotPasswordPage />} /><Route path="/redefinir-senha" element={<ResetPasswordPage />} />
    <Route element={<ProtectedRoute />}><Route path="/unauthorized" element={<Unauthorized />} /><Route path="/unknown-profile" element={<UnknownProfile />} /><Route path="/" element={<HomeRedirect />} />
      <Route element={<AppShell />}>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE']} />}><Route path="/dashboard" element={<DashboardPage />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR']} />}><Route path="/pesquisa" element={<Navigate to="/forms" replace />} /><Route path="/forms" element={<Forms />} /><Route path="/forms/new" element={<Create />} /><Route path="/forms/:formId/edit" element={<Create />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR', 'RESIDENTE']} />}><Route path="/indicators" element={<IndicatorsPage />} /><Route path="/indicadores" element={<IndicatorsRedirect />} /></Route><Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR', 'GESTOR']} />}><Route path="/organizations" element={<Residents />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR']} />}><Route path="/indicators/catalog" element={<IndicatorCatalogPage />} /></Route>
        <Route element={<ProtectedRoute roles={['ADMIN', 'PESQUISADOR']} />}><Route path="/indicadores/importar-eventos" element={<IndicatorImportPage key="EVENTS" type="EVENTS" />} /><Route path="/indicadores/importar-residentes" element={<IndicatorImportPage key="RESIDENTS" type="RESIDENTS" />} /><Route path="/indicadores/eventos" element={<ImportedIndicatorsPage key="EVENTS" type="EVENTS" />} /><Route path="/indicadores/residentes" element={<ImportedIndicatorsPage key="RESIDENTS" type="RESIDENTS" />} /></Route>
        <Route path="/perfil" element={<ProfilePage />} />
        <Route element={<ProtectedRoute roles={['ADMIN']} />}><Route path="/admin" element={<AdminRequestsPage />} /><Route path="/admin/solicitacoes" element={<AdminRequestsPage />} /><Route path="/admin/usuarios" element={<AdminUsersPage />} /><Route path="/admin/auditoria" element={<Audit />} /><Route path="/admin/requests" element={<Navigate to="/admin/solicitacoes" replace />} /></Route>
        <Route element={<ProtectedRoute roles={['RESIDENTE']} />}><Route path="/residente" element={<Forms resident />} /><Route path="/resident/forms" element={<Forms resident />} /><Route path="/resident/forms/:formId/respond" element={<Respond />} /><Route path="/resident/history" element={<History />} /></Route>
      </Route>
    </Route>
    <Route path="*" element={<NotFound />} />
  </Routes></BrowserRouter>;
}
