export default function AuthLayout({ children, compact = false }) {
  return <main className={`login ${compact ? 'register-layout' : ''}`}>
    <section className="login-hero">
      <div className="brand login-brand"><span className="brand-mark">Á</span><span>Ágora Tech Park<small>Centro de Inovação · Joinville</small></span></div>
      <div className="login-copy"><h1>Governança de indicadores<br />do ecossistema de inovação.</h1><p>Uma plataforma única para coleta, análise e visualização dos indicadores dos residentes.</p><div className="login-benefits" aria-label="Benefícios da plataforma"><div><strong>Dados confiáveis</strong><small>Fonte institucional</small></div><div><strong>Gestão integrada</strong><small>Coletas e respostas</small></div><div><strong>Visão executiva</strong><small>Indicadores e tendências</small></div></div></div>
      <small className="copyright">© 2026 Ágora Tech Park</small>
    </section>
    {children}
  </main>;
}
