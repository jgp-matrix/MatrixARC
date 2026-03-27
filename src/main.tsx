// ─── App Entry Point ─────────────────────────────────────────────────────────

import { createRoot } from 'react-dom/client';
// Import globals first — this triggers firebase.initializeApp()
import '@/core/globals';
import Root from '@/ui/Root';

createRoot(document.getElementById('root')!).render(<Root />);
