import { getFirebaseAuth, isFirebaseConfigured } from '@/data/firebase';

/** Appel d'une route IA du serveur ; joint le jeton Firebase s'il existe et l'id d'organisation active. */
export async function apiPost<T>(path: string, body: unknown, orgId?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const activeOrg = orgId ?? (typeof localStorage !== 'undefined' ? localStorage.getItem('lt-active-org') : null);
  if (activeOrg) headers['X-Org-Id'] = activeOrg;
  if (isFirebaseConfigured()) {
    const token = await getFirebaseAuth().currentUser?.getIdToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const r = await fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((j as { error?: string }).error ?? `Erreur ${r.status}`);
  return j as T;
}

/** Lit un fichier en base64 (sans préfixe data:). */
export function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      const s = String(fr.result);
      resolve({ base64: s.slice(s.indexOf(',') + 1), mimeType: file.type || 'application/octet-stream' });
    };
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}
