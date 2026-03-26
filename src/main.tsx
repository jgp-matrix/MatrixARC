// ─── App Entry Point ─────────────────────────────────────────────────────────

import { createRoot } from 'react-dom/client';
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import 'firebase/compat/functions';
import { FIREBASE_CONFIG } from '@/core/constants';
import Root from '@/ui/Root';

// Initialize Firebase before rendering
firebase.initializeApp(FIREBASE_CONFIG);

createRoot(document.getElementById('root')!).render(<Root />);
