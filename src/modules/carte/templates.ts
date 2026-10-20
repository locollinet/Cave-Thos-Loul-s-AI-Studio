import type { PublicListDoc } from './types';

/** Données minimales pour rendre une carte (aperçu, impression, page publique). */
export type SheetDoc = Pick<PublicListDoc, 'name' | 'orgName' | 'template' | 'sections' | 'theme' | 'logoDataUrl'> &
  Partial<Pick<PublicListDoc, 'language' | 'languages' | 'translations'>>;
