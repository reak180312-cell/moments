import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StoreProvider } from './data/store';
import { ToastProvider } from './components/ui';
import { applyAppearance } from './lib/theme';
import './styles/app.css';
import './styles/colour.css';

applyAppearance();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <ToastProvider>
        <App />
      </ToastProvider>
    </StoreProvider>
  </StrictMode>
);

// The hosted preview is a single page with no offline shell of its own.
if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.VITE_DEMO !== '1') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell is a bonus, not a requirement */
    });
  });
}
