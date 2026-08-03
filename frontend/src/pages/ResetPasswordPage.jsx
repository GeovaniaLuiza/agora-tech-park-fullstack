import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { resetPassword } from '../services/api';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ password: '', confirmPassword: '' });
  const [state, setState] = useState({ loading: false, message: '', error: false });
  const submit = async (event) => {
    event.preventDefault();
    if (!params.get('token')) return setState({ loading: false, message: 'Link de redefinição inválido.', error: true });
    setState({ loading: true, message: '', error: false });
    try {
      const response = await resetPassword(params.get('token'), form.password, form.confirmPassword);
      setState({ loading: false, message: response.message, error: false });
    } catch (error) { setState({ loading: false, message: error.message || 'Não foi possível redefinir a senha.', error: true }); }
  };
  return <AuthLayout><form className="auth-form" onSubmit={submit}><h2>Nova senha</h2><p>Escolha uma senha forte para sua conta.</p>
    {state.message && <div className="auth-alert" role={state.error ? 'alert' : 'status'}>{state.message}</div>}
    <label htmlFor="reset-password">Nova senha<input id="reset-password" type="password" required minLength="8" autoComplete="new-password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} /></label>
    <label htmlFor="reset-confirm">Confirmar senha<input id="reset-confirm" type="password" required minLength="8" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => setForm({ ...form, confirmPassword: event.target.value })} /></label>
    <button className="button primary" disabled={state.loading}>{state.loading ? 'Redefinindo...' : 'Redefinir senha'}</button>
    <button className="link-button" type="button" onClick={() => navigate('/login')}>Voltar para o login</button>
  </form></AuthLayout>;
}
