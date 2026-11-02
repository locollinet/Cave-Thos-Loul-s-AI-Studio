import type { NextFunction, Request, Response } from 'express';

/** Politique de contenu de l'application (Firebase Auth/Firestore, Google Fonts, images locales). */
export function contentSecurityPolicy(authDomain?: string): string {
  const auth = authDomain && !authDomain.includes('PLACEHOLDER') ? ` https://${authDomain}` : '';
  return [
    "default-src 'self'",
    "script-src 'self' https://apis.google.com https://www.gstatic.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob:",
    "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com https://*.firebaseapp.com",
    `frame-src 'self' https://*.firebaseapp.com https://*.web.app https://accounts.google.com https://apis.google.com${auth}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-ancestors ${process.env.FRAME_ANCESTORS ?? "'self'"}`,
  ].join('; ');
}

/**
 * En-têtes de sécurité. La CSP n'est posée qu'en production (le serveur Vite de développement injecte des scripts) ;
 * CSP_MODE=report-only la passe en observation, CSP_MODE=off la retire.
 */
export function securityHeaders(production: boolean, authDomain?: string) {
  const csp = contentSecurityPolicy(authDomain);
  const mode = process.env.CSP_MODE ?? 'enforce';
  return (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(), payment=()');
    // Les connexions Google de Firebase Auth passent par une fenêtre surgissante.
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    if (production) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000');
      if (mode === 'report-only') res.setHeader('Content-Security-Policy-Report-Only', csp);
      else if (mode !== 'off') res.setHeader('Content-Security-Policy', csp);
    }
    next();
  };
}
