import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import AppErrorBoundary from './components/AppErrorBoundary.jsx';
import { AuthProvider } from './contexts/AuthContext.jsx';
import './styles/global.css';
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <AuthProvider><App /></AuthProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
