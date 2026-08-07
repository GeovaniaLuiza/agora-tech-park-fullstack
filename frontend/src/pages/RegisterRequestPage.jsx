import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import FormField from '../components/FormField';
import { registerRequest, normalizeApiError } from '../services/api';
import { normalizeCnpj, validateRegistration } from '../utils/authValidation';

export default function RegisterRequestPage() {
  const navigate = useNavigate();
  const firstRef = useRef(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', cnpj: '', companyName: '', acceptedTerms: false });
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState('');
  const [outcome, setOutcome] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [show, setShow] = useState(false);
  const [retryAfter, setRetryAfter] = useState(0);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    if (!retryAfter) return undefined;
    const timer = window.setInterval(() => setRetryAfter((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [retryAfter > 0]);
  const submit = async (event) => {
    event.preventDefault();
    if (retryAfter) return;
    if (isSubmitting) return; // extra guard against double submit
    const next = validateRegistration(form); setErrors(next);
    if (Object.keys(next).length) {
      requestAnimationFrame(() => document.getElementById(Object.keys(next)[0])?.focus());
      return;
    }
    setIsSubmitting(true); setAlert('');
    try {
      await registerRequest({ ...form, email: form.email.trim().toLowerCase(), cnpj: normalizeCnpj(form.cnpj) });
      setOutcome('sent');
    } catch (error) {
      const norm = normalizeApiError(error);
      if (error.code === 'EMAIL_DELIVERY_FAILED' && error.requestCreated === true) {
        setOutcome('delivery-failed');
      } else if (error.code === 'EXISTING_ACCESS_REQUEST') {
        setOutcome('existing');
      } else if (error.code === 'RATE_LIMIT_EXCEEDED' || error.status === 429) {
        const seconds = Math.max(1, Number(error.retryAfterSeconds) || 60);
        setRetryAfter(seconds);
        setAlert(`Muitas tentativas foram realizadas. Aguarde ${seconds} segundos antes de tentar novamente.`);
      } else if (norm.type === 'NETWORK') {
        setAlert(norm.message);
      } else if (norm.type === 'TIMEOUT') {
        setAlert(norm.message);
      } else if (norm.type === 'UNAVAILABLE') {
        setAlert(norm.message);
      } else if (norm.type === 'VALIDATION') {
        // Attempt to map field errors to local errors
        if (norm.fieldErrors && Object.keys(norm.fieldErrors).length) {
          setErrors((current) => ({ ...current, ...norm.fieldErrors }));
          requestAnimationFrame(() => {
            const first = Object.keys(norm.fieldErrors)[0];
            document.getElementById(first)?.focus();
          });
        }
        setAlert(norm.message || 'Verifique os dados informados e tente novamente.');
      } else if (norm.type === 'CONFLICT') {
        setAlert(norm.message || 'Já existe uma solicitação para este e-mail ou CNPJ.');
      } else if (norm.type === 'UNAUTHORIZED') {
        setAlert(norm.message);
      } else if (norm.type === 'FORBIDDEN') {
        setAlert(norm.message);
      } else if (norm.type === 'SERVER') {
        setAlert(norm.message);
      } else {
        setAlert(error.message || 'Ocorreu um erro inesperado ao enviar a solicitação. Tente novamente.');
      }
    }
    finally { setIsSubmitting(false); }
  };
  if (outcome) {
    const content = {
      sent: {
        title: 'Confirme seu e-mail',
        message: 'Solicitação recebida. Enviamos uma mensagem para o seu e-mail. A confirmação encaminhará seu pedido para análise e não libera acesso imediato.',
      },
      'delivery-failed': {
        title: 'Solicitação criada',
        message: 'Sua solicitação foi salva, mas o e-mail não pôde ser enviado. Não faça um novo cadastro: use o reenvio da confirmação.',
      },
      existing: {
        title: 'Solicitação já iniciada',
        message: 'Não criamos uma solicitação duplicada. Se você ainda não confirmou o e-mail, solicite um novo link. Se já confirmou, aguarde a análise ou volte ao login.',
      },
    }[outcome];
    const resend = () => navigate('/reenviar-confirmacao', { state: { email: form.email.trim().toLowerCase() } });
    return <AuthLayout compact><section className="auth-form request-success" aria-live="polite"><CheckCircle2 /><h2>{content.title}</h2><p>{content.message}</p><button className="button primary" onClick={resend}>Reenviar confirmação</button><button className="link-button" onClick={() => navigate('/login')}>Voltar para o login</button></section></AuthLayout>;
  }
  return <AuthLayout compact><form className="auth-form register-form" onSubmit={submit} noValidate>
    <h2>Solicite seu acesso</h2><p>O cadastro depende da validação da equipe do Ágora Tech Park.</p>
    <div className="auth-alert" aria-live="polite">{alert}</div>
    <FormField label="Nome completo" name="name" error={errors.name} required><input ref={firstRef} id="name" autoComplete="name" value={form.name} onChange={(e) => update('name', e.target.value)} aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? 'name-error' : undefined} /></FormField>
    <FormField label="E-mail" name="email" error={errors.email} required><input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} /></FormField>
    <div className="auth-grid"><FormField label="Senha" name="password" error={errors.password} required><div className="password-input"><input id="password" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={(e) => update('password', e.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} /><button type="button" onClick={() => setShow(!show)} aria-label="Exibir ou ocultar senha">{show ? <EyeOff /> : <Eye />}</button></div></FormField><FormField label="Confirmar senha" name="confirmPassword" error={errors.confirmPassword} required><input id="confirmPassword" type={show ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={(e) => update('confirmPassword', e.target.value)} aria-invalid={Boolean(errors.confirmPassword)} aria-describedby={errors.confirmPassword ? 'confirmPassword-error' : undefined} /></FormField></div>
    <p className="password-hint">Mínimo de 8 caracteres, com letra maiúscula, minúscula e número.</p>
    <div className="auth-grid"><FormField label="CNPJ" name="cnpj" error={errors.cnpj} required><input id="cnpj" inputMode="numeric" value={form.cnpj} onChange={(e) => update('cnpj', normalizeCnpj(e.target.value))} aria-invalid={Boolean(errors.cnpj)} aria-describedby={errors.cnpj ? 'cnpj-error' : undefined} /></FormField><FormField label="Empresa ou startup" name="companyName" error={errors.companyName} required><input id="companyName" value={form.companyName} onChange={(e) => update('companyName', e.target.value)} aria-invalid={Boolean(errors.companyName)} aria-describedby={errors.companyName ? 'companyName-error' : undefined} /></FormField></div>
    <label className="terms"><input id="acceptedTerms" type="checkbox" checked={form.acceptedTerms} onChange={(e) => update('acceptedTerms', e.target.checked)} aria-invalid={Boolean(errors.acceptedTerms)} aria-describedby={errors.acceptedTerms ? 'acceptedTerms-error' : undefined} /> Li e aceito os termos de uso e a política de privacidade.</label>{errors.acceptedTerms && <small id="acceptedTerms-error" className="field-error">{errors.acceptedTerms}</small>}
    <button className="button primary auth-submit" disabled={isSubmitting || retryAfter > 0}>{isSubmitting ? 'Enviando...' : retryAfter ? `Tente novamente em ${retryAfter}s` : 'Enviar solicitação'}</button>
    <small>Já possui acesso? <button className="link-button" type="button" onClick={() => navigate('/login')}>Entrar</button></small>
  </form></AuthLayout>;
}
