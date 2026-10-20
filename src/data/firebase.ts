import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, type Auth } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

type Cfg = typeof firebaseConfig & { firestoreDatabaseId?: string };
const cfg = firebaseConfig as Cfg;

/** Firebase est utilisable dès que la config n'est plus un placeholder (AI Studio la remplace). */
export const isFirebaseConfigured = (): boolean =>
  !!cfg.apiKey && !String(cfg.apiKey).includes('PLACEHOLDER') && !!cfg.projectId && !String(cfg.projectId).includes('PLACEHOLDER');

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let auth: Auth | null = null;

export function getFirebaseApp(): FirebaseApp {
  if (!app) app = getApps().length ? getApp() : initializeApp(cfg);
  return app;
}

export function getFirebaseAuth(): Auth {
  if (!auth) auth = getAuth(getFirebaseApp());
  return auth;
}

export function getFirebaseDb(): Firestore {
  if (!db) {
    const dbId = cfg.firestoreDatabaseId && cfg.firestoreDatabaseId !== '(default)' ? cfg.firestoreDatabaseId : undefined;
    try {
      db = initializeFirestore(
        getFirebaseApp(),
        {
          ignoreUndefinedProperties: true,
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        },
        dbId as string,
      );
    } catch {
      db = getFirestore(getFirebaseApp());
    }
  }
  return db;
}
