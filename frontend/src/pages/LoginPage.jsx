import { useRef, useState } from 'react';
import { ArrowRight, Eye, EyeOff } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import FormField from '../components/FormField';
import { useAuth } from '../contexts/AuthContext';
import { homeForRole } from '../config/access';
import { validateLogin } from '../utils/authValidation';

export default function LoginPage() {
  const { clearSessionError, login, sessionError } = useAuth();
  const navigate = useNavigate();
  const emailRef = useRef(null);
  const [form, setForm] = useState({ email: '', password: '', remember: false });
  const [errors, setErrors] = useState({});
  const [alert, setAlert] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const update = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const submit = async (event) => {
    event.preventDefault();
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
      const messages = {
        EMAIL_NOT_VERIFIED: 'Confirme seu e-mail antes de continuar.',
        APPROVAL_PENDING: 'Seu e-mail foi confirmado e sua solicitação está aguardando análise.',
        ACCOUNT_UNAVAILABLE: 'Esta conta não está disponível para acesso. Entre em contato com o Ágora Tech Park.',
      };
      setAlert(messages[error.code] || 'E-mail ou senha inválidos.');
    }
    finally { setLoading(false); }
  };
  return <AuthLayout><form className="auth-form" onSubmit={submit} noValidate>
    <h2>Bem-vindo de volta</h2><p>Acesse o painel de indicadores.</p>
    <div className="auth-alert" aria-live="polite">{alert || sessionError}</div>
    <FormField label="E-mail" name="email" error={errors.email} required><input ref={emailRef} id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} /></FormField>
    <FormField label="Senha" name="password" error={errors.password} required><div className="password-input"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={form.password} onChange={(e) => update('password', e.target.value)} aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Ocultar senha' : 'Exibir senha'}>{showPassword ? <EyeOff /> : <Eye />}</button></div></FormField>
    <div className="login-options"><label><input type="checkbox" checked={form.remember} onChange={(e) => update('remember', e.target.checked)} /> Lembrar-me</label><button className="link-button" type="button" onClick={() => navigate('/esqueci-a-senha')}>Esqueci a senha</button></div>
    <button className="button primary auth-submit" disabled={loading}>{loading ? 'Entrando...' : <>Entrar <ArrowRight /></>}</button>
    <small>Não tem acesso? <button className="link-button" type="button" onClick={() => navigate('/solicitar-acesso')}>Solicitar acesso</button></small>
  </form></AuthLayout>;
}
