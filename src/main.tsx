import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { StoreProvider } from './data/store';
import { ToastProvider } from './components/ui';
import { applyAppearance } from './lib/theme';
import './styles/app.css';
import './styles/colour.css';
import './styles/refine.css';
import './styles/ui.css';

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
    // Relative: the app is served from a sub-folder, so an absolute path
    // would look at the domain root and be refused its scope.
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {
      /* offline shell is a bonus, not a requirement */
    });
  });
}
