// ─── Firebase Auth Service ───────────────────────────────────────────────────

import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import { FIREBASE_CONFIG } from '@/core/constants';

let _app: firebase.app.App | null = null;

export function initFirebase(): firebase.app.App {
  if (_app) return _app;
  _app = firebase.initializeApp(FIREBASE_CONFIG);
  return _app;
}

export function getAuth(): firebase.auth.Auth {
  return firebase.auth();
}

export function onAuthStateChanged(callback: (user: firebase.User | null) => void): () => void {
  return firebase.auth().onAuthStateChanged(callback);
}

export async function signInWithGoogle(): Promise<firebase.auth.UserCredential> {
  const provider = new firebase.auth.GoogleAuthProvider();
  return firebase.auth().signInWithPopup(provider);
}

export async function signInWithMicrosoft(): Promise<firebase.auth.UserCredential> {
  const provider = new firebase.auth.OAuthProvider('microsoft.com');
  return firebase.auth().signInWithPopup(provider);
}

export async function signInWithEmail(email: string, password: string): Promise<firebase.auth.UserCredential> {
  return firebase.auth().signInWithEmailAndPassword(email, password);
}

export async function createUserWithEmail(email: string, password: string): Promise<firebase.auth.UserCredential> {
  return firebase.auth().createUserWithEmailAndPassword(email, password);
}

export async function sendPasswordReset(email: string): Promise<void> {
  return firebase.auth().sendPasswordResetEmail(email);
}

export async function signOut(): Promise<void> {
  return firebase.auth().signOut();
}
