import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { forgotPassword } from '../services/api';

export default function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ loading: false, message: '', error: false });
  const submit = async (event) => {
    event.preventDefault();
    setState({ loading: true, message: '', error: false });
    try {
      const response = await forgotPassword(email.trim().toLowerCase());
      setState({ loading: false, message: response.message, error: false });
    } catch (error) {
      setState({ loading: false, message: error.message || 'Não foi possível processar a solicitação.', error: true });
    }
  };
  return <AuthLayout><form className="auth-form" onSubmit={submit}><h2>Redefinir senha</h2><p>Informe seu e-mail para receber as instruções.</p>
    {state.message && <div className="auth-alert" role={state.error ? 'alert' : 'status'}>{state.message}</div>}
    <label htmlFor="forgot-email">E-mail<input id="forgot-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <button className="button primary" disabled={state.loading}>{state.loading ? 'Enviando...' : 'Enviar instruções'}</button>
    <button className="link-button" type="button" onClick={() => navigate('/login')}>Voltar para o login</button>
  </form></AuthLayout>;
}
