import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import FormField from '../components/FormField';
import { useAuth } from '../contexts/AuthContext';
import { homeForRole } from '../config/access';
import { validateLogin } from '../utils/authValidation';
import { authRateLimit } from '../utils/authRateLimit';

export default function LoginPage() {
  const { clearSessionError, login, sessionError, sessionRateLimit, restoreSession } = useAuth();
  const navigate = useNavigate();
  const emailRef = useRef(null);
  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [retryAfter, setRetryAfter] = useState(() => sessionRateLimit?.seconds || 0);
  useEffect(() => {
    if (retryAfter <= 0) return undefined;
    const timer = window.setTimeout(() => setRetryAfter((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
    if (loading || retryAfter > 0) return;
    if (sessionRateLimit) {
      setAlert('');
      const user = await restoreSession();
      if (user) navigate(homeForRole(user.role), { replace: true });
      return;
    }
    const nextErrors = validateLogin(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      document.getElementById(Object.keys(nextErrors)[0])?.focus();
      return;
    }
    setLoading(true); setAlert(''); clearSessionError();
    try {
      const user = await login(form.email, form.password, form.remember);
      navigate(homeForRole(user.role), { replace: true });
    } catch (error) {
      if (error.status === 429) {
        const limit = authRateLimit(error);
        setRetryAfter(limit.seconds);
        setAlert(limit.message);
        return;
      }
      const messages = {
        EMAIL_NOT_VERIFIED: 'Confirme seu e-mail antes de continuar.',
        APPROVAL_PENDING: 'Seu e-mail foi confirmado e sua solicitação está aguardando análise.',
        ACCOUNT_UNAVAILABLE: 'Esta conta não está disponível no momento. Verifique se seu acesso está ativo e se sua organização está vinculada. Se precisar, contate o administrador do Ágora Tech Park.',
      };
      setAlert(messages[error.code] || 'E-mail ou senha inválidos.');
    }
    finally { setLoading(false); }
  };
  return <AuthLayout><form className="auth-form" onSubmit={submit} noValidate>
    <h2>Bem-vindo</h2><p>Acesse o painel de indicadores.</p>
    <div className="auth-alert" aria-live="polite">{alert || sessionError}</div>
    <FormField label="E-mail" name="email" error={errors.email} required><input ref={emailRef} id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} /></FormField>
    <FormField label="Senha" name="password" error={errors.password} required><div className="password-input"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(e) => update('password', e.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></FormField>
    <div className="login-options"><label><input type="checkbox" checked={form.remember} onChange={(e) => update('remember', e.target.checked)} /> Lembrar-me</label><button className="link-button" type="button" onClick={() => navigate('/esqueci-a-senha')}>Esqueci a senha</button></div>
    <button type="submit" className="button primary auth-submit" disabled={loading || retryAfter > 0}>{loading ? 'Entrando...' : retryAfter ? `Tente novamente em ${retryAfter}s` : sessionRateLimit ? 'Retomar sessão' : <>Entrar <ArrowRight /></>}</button>
    <small>Não tem acesso? <button className="link-button" type="button" onClick={() => navigate('/solicitar-acesso')}>Solicitar acesso</button></small>
  </form></AuthLayout>;
}

