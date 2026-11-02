import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile,
} from 'firebase/auth';
import type { UserProfile } from '@/types';
import { getFirebaseAuth, isFirebaseConfigured } from '@/data/firebase';

interface AuthCtx {
  user: UserProfile | null;
  loading: boolean;
  firebaseReady: boolean;
  demo: boolean;
  signInGoogle: () => Promise<void>;
  signInEmail: (email: string, password: string) => Promise<void>;
  signUpEmail: (email: string, password: string, name: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  sendEmailVerificationNotice: () => Promise<void>;
  /** Recharge le compte (ex. après confirmation de l'email) ; renvoie vrai si l'email est confirmé. */
  refreshUser: () => Promise<boolean>;
  signInDemo: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);
const DEMO_KEY = 'lt-demo-user';

const demoUser: UserProfile = {
  uid: 'demo-user',
  email: 'demo@louls-thos.app',
  name: 'Démo',
  demo: true,
  emailVerified: true,
  isPlatformAdmin: true,
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const firebaseReady = isFirebaseConfigured();
  const [user, setUser] = useState<UserProfile | null>(() => (localStorage.getItem(DEMO_KEY) ? demoUser : null));
  const [loading, setLoading] = useState(firebaseReady && !localStorage.getItem(DEMO_KEY));

  useEffect(() => {
    if (!firebaseReady) return;
    return onAuthStateChanged(getFirebaseAuth(), async (u) => {
      if (localStorage.getItem(DEMO_KEY)) {
        setLoading(false);
        return;
      }
      if (!u) {
        setUser(null);
        setLoading(false);
        return;
      }
      try {
        const tokenRes = await u.getIdTokenResult();
        const isPlatformAdmin = !!tokenRes.claims.platformAdmin;
        setUser({
          uid: u.uid,
          email: u.email ?? '',
          name: u.displayName ?? u.email?.split('@')[0] ?? 'Utilisateur',
          photoURL: u.photoURL ?? undefined,
          emailVerified: u.emailVerified,
          isPlatformAdmin,
        });
      } catch {
        setUser({
          uid: u.uid,
          email: u.email ?? '',
          name: u.displayName ?? u.email?.split('@')[0] ?? 'Utilisateur',
          photoURL: u.photoURL ?? undefined,
          emailVerified: u.emailVerified,
        });
      }
      setLoading(false);
    });
  }, [firebaseReady]);

  const signInGoogle = useCallback(async () => {
    await signInWithPopup(getFirebaseAuth(), new GoogleAuthProvider());
  }, []);
  const signInEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  }, []);
  const signUpEmail = useCallback(async (email: string, password: string, name: string) => {
    const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password);
    await updateProfile(cred.user, { displayName: name });
    try {
      await sendEmailVerification(cred.user);
    } catch (e) {
      console.warn('Envoi vérification email:', e);
    }
    setUser({ uid: cred.user.uid, email, name, emailVerified: false });
  }, []);
  const resetPassword = useCallback(async (email: string) => {
    await sendPasswordResetEmail(getFirebaseAuth(), email);
  }, []);
  const sendEmailVerificationNotice = useCallback(async () => {
    const current = getFirebaseAuth().currentUser;
    if (current) await sendEmailVerification(current);
  }, []);
  const refreshUser = useCallback(async () => {
    const current = firebaseReady ? getFirebaseAuth().currentUser : null;
    if (!current) return !!user?.emailVerified;
    await current.reload();
    // Nouveau jeton : les règles Firestore lisent email_verified dans le jeton, pas dans le profil.
    await current.getIdToken(true);
    setUser((u) => (u ? { ...u, emailVerified: current.emailVerified } : u));
    return current.emailVerified;
  }, [firebaseReady, user?.emailVerified]);
  const signInDemo = useCallback(() => {
    localStorage.setItem(DEMO_KEY, '1');
    setUser(demoUser);
  }, []);
  const signOut = useCallback(async () => {
    localStorage.removeItem(DEMO_KEY);
    localStorage.removeItem('lt-active-org');
    if (firebaseReady) await fbSignOut(getFirebaseAuth()).catch(() => undefined);
    setUser(null);
  }, [firebaseReady]);

  const value = useMemo(
    () => ({
      user,
      loading,
      firebaseReady,
      demo: !!user?.demo,
      signInGoogle,
      signInEmail,
      signUpEmail,
      resetPassword,
      sendEmailVerificationNotice,
      refreshUser,
      signInDemo,
      signOut,
    }),
    [user, loading, firebaseReady, signInGoogle, signInEmail, signUpEmail, resetPassword, sendEmailVerificationNotice, refreshUser, signInDemo, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth hors AuthProvider');
  return c;
}
