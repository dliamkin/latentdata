import '@fontsource-variable/albert-sans';
import '@fontsource-variable/source-code-pro';
import 'primeicons/primeicons.css';
import 'primereact/resources/primereact.min.css';
import './styles/tokens.css';
import './styles/primereact.css';
import './styles/app.css';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import App from './App.tsx';
import { applyTheme, initialMode } from './theme/theme.ts';

const root = document.getElementById('root');
if (root === null) throw new Error('missing #root');

// the theme stylesheet is loaded before the first render so nothing paints unstyled
void applyTheme(initialMode()).then(() => {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
});
