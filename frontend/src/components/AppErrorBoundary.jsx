import { Component } from 'react';

export default class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Falha inesperada na interface', error, info);
  }

  render() {
    if (this.state.hasError) {
      return <main className="route-state" role="alert">
        <span className="brand-mark">Á</span>
        <h1>Não foi possível exibir esta página</h1>
        <p>Ocorreu uma falha inesperada. Recarregue a aplicação para tentar novamente.</p>
        <button className="button primary" onClick={() => window.location.reload()}>Recarregar</button>
      </main>;
    }
    return this.props.children;
  }
}
