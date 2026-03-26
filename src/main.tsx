// ─── App Entry Point ─────────────────────────────────────────────────────────

import { createRoot } from 'react-dom/client';
import { initFirebase } from '@/services/firebase/auth';
import { AppProvider } from '@/state/AppContext';
import { BCProvider } from '@/state/BCContext';

// Initialize Firebase before rendering
initFirebase();

// App shell — will be expanded as components are migrated from the monolith
function App() {
  return (
    <AppProvider>
      <BCProvider>
        <div style={{ padding: 40, color: '#e8e8f0', fontFamily: "'Inter', sans-serif" }}>
          <h1>MatrixARC — Modular Build</h1>
          <p style={{ color: '#c0c4cc', marginTop: 12 }}>
            Vite + TypeScript build system active. Module extraction in progress.
          </p>
          <p style={{ color: '#c0c4cc', marginTop: 8 }}>
            The production app continues to run from <code>public/index.html</code>.
            This entry point will replace it once all components are migrated.
          </p>
        </div>
      </BCProvider>
    </AppProvider>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
