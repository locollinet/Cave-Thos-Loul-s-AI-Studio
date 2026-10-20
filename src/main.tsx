import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { registerServiceWorker } from './lib/pwa';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// En développement, un SW mettrait en cache les modules Vite et casserait le HMR.
if (import.meta.env.PROD) registerServiceWorker();
