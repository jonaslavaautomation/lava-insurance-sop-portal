import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FatalError } from './components/FatalError.tsx';
import { isSupabaseConfigured } from './lib/supabase.ts';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupabaseConfigured ? (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    ) : (
      <FatalError
        title="Configuration missing"
        message="Missing VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY for this deployment."
      />
    )}
  </StrictMode>
);
