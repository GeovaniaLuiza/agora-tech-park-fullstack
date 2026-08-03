import { useEffect, useRef, useState } from 'react';
import { Mail } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import AuthLayout from '../components/AuthLayout';
import { resendVerification } from '../services/api';

const PUBLIC_FEEDBACK = 'Solicitação processada. Se existir um cadastro pendente para este e-mail, uma nova mensagem de confirmação será enviada. Verifique também a caixa de spam.';
const DELIVERY_ERROR = 'Não foi possível enviar o e-mail de confirmação neste momento. Tente novamente mais tarde.';
const CONNECTION_ERROR = 'Não foi possível acessar o serviço. Verifique sua conexão e tente novamente.';

function readableDuration(totalSeconds) {
  const seconds = Math.max(1, Number(totalSeconds) || 1);
  if (seconds < 60) return `${seconds} segundo${seconds === 1 ? '' : 's'}`;
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes} minuto${minutes === 1 ? '' : 's'}${remainder ? ` e ${remainder} segundo${remainder === 1 ? '' : 's'}` : ''}`;
}

export default function ResendVerificationPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestInFlight = useRef(false);
  const [email, setEmail] = useState(location.state?.email || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedback, setFeedback] = useState({ type: null, message: '' });
  const [retryAfter, setRetryAfter] = useState(0);

  useEffect(() => {
    if (retryAfter <= 0) return undefined;
    const timer = window.setTimeout(
      () => setRetryAfter((current) => Math.max(0, current - 1)),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [retryAfter]);

  const submit = async (event) => {
    event.preventDefault();
    if (requestInFlight.current || retryAfter > 0) return;
    requestInFlight.current = true;
    setIsSubmitting(true);
    setFeedback({ type: null, message: '' });
    try {
      const result = await resendVerification(email.trim().toLowerCase());
      setFeedback({ type: 'info', message: PUBLIC_FEEDBACK });
      const cooldown = Number(result?.retryAfter ?? result?.retryAfterSeconds) || 0;
      if (cooldown > 0) setRetryAfter(cooldown);
    } catch (error) {
      if (error.code === 'EMAIL_DELIVERY_FAILED') {
        setFeedback({ type: 'error', message: DELIVERY_ERROR });
      } else if (error.status === 429) {
        const seconds = Math.max(1, Number(error.retryAfter ?? error.retryAfterSeconds) || 60);
        setRetryAfter(seconds);
        setFeedback({ type: 'warning', message: `Aguarde ${readableDuration(seconds)} antes de solicitar um novo envio.` });
      } else if (error.status === 400 || error.status === 422) {
        setFeedback({ type: 'error', message: error.message || 'Informe um endereço de e-mail válido.' });
      } else if (error.code === 'NETWORK_ERROR' || !error.status) {
        setFeedback({ type: 'error', message: CONNECTION_ERROR });
      } else {
        setFeedback({ type: 'error', message: 'Não foi possível solicitar o reenvio agora. Tente novamente mais tarde.' });
      }
    } finally {
      requestInFlight.current = false;
      setIsSubmitting(false);
    }
  };

  const feedbackRole = feedback.type === 'error' ? 'alert' : 'status';

  return <AuthLayout><section className="auth-form verification-state">
    <Mail />
    <h2>Reenviar confirmação</h2>
    <p>Informe o e-mail utilizado na solicitação de acesso.</p>
    <form className="resend-form" onSubmit={submit}>
      <label htmlFor="resend-email">E-mail da solicitação<input id="resend-email" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <button type="submit" className="button primary" disabled={isSubmitting || retryAfter > 0}>
        {isSubmitting ? 'Solicitando...' : retryAfter ? `Tente novamente em ${retryAfter}s` : 'Enviar novo link'}
      </button>
    </form>
    {feedback.message && <div className={`auth-alert auth-alert--${feedback.type}`} role={feedbackRole} aria-live="polite">{feedback.message}</div>}
    <button type="button" className="link-button" onClick={() => navigate('/login')}>Voltar para o login</button>
  </section></AuthLayout>;
}
