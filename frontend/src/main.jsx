import '@fontsource/anton/400.css';
import '@fontsource/rubik/400.css';
import '@fontsource/rubik/500.css';
import '@fontsource/jetbrains-mono/700.css';
import 'leaflet/dist/leaflet.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import { SessionProvider } from './hooks/useSession.jsx';
import { ToastProvider } from './hooks/useToast.jsx';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import './styles/menu.css';
import './styles/quiz.css';
import './styles/screens.css';
import './App.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <ToastProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ToastProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
