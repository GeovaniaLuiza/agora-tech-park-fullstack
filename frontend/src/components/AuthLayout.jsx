export default function AuthLayout({ children, compact = false }) {
  return <main className={`login ${compact ? 'register-layout' : ''}`}>
    <section className="login-hero">
      <div className="brand login-brand"><span className="brand-mark">Á</span><span>Ágora Tech Park<small>Centro de Inovação · Joinville</small></span></div>
      <div className="login-copy"><h1>Governança de indicadores<br />do ecossistema de inovação.</h1><p>Uma plataforma única para coleta, análise e visualização dos indicadores dos residentes.</p></div>
      <small className="copyright">© 2026 Ágora Tech Park</small>
    </section>
    {children}
  </main>;
}
