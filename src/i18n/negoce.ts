// Messages propres aux modules Négoce / Compta / Pilotage (lot 3).
// Préfixes de clés : "negoce.", "compta.", "pilotage."
import { negoceMsgs, type Msgs } from '@/modules/negoce/messages';
import { comptaMsgs } from '@/modules/compta/messages';
import { pilotageMsgs } from '@/modules/pilotage/messages';

const split = (...sources: Msgs[]): { fr: Record<string, string>; en: Record<string, string> } => {
  const fr: Record<string, string> = {};
  const en: Record<string, string> = {};
  for (const src of sources) {
    for (const [k, [f, e]] of Object.entries(src)) {
      fr[k] = f;
      en[k] = e;
    }
  }
  return { fr, en };
};

export const negoce: { fr: Record<string, string>; en: Record<string, string> } = split(negoceMsgs, comptaMsgs, pilotageMsgs);
