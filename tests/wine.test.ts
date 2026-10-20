import { describe, expect, it } from 'vitest';
import { canonicalKey, cleanName, findMatches, parseColor, parseFormatCl, similarity } from '@/lib/wine';
import type { Wine } from '@/types';

const mk = (o: Partial<Wine>): Wine => {
  const w = { id: Math.random().toString(), producer: 'Domaine Leflaive', name: 'Puligny-Montrachet', vintage: '2020', color: 'blanc', formatCl: 75, alertThreshold: 0, canonicalKey: '', createdAt: 0, updatedAt: 0, ...o } as Wine;
  w.canonicalKey = canonicalKey(w);
  return w;
};

describe('wine helpers', () => {
  it('détecte le format', () => {
    expect(parseFormatCl('Magnum')).toBe(150);
    expect(parseFormatCl('Bouteille 75cl')).toBe(75);
    expect(parseFormatCl('1,5 L')).toBe(150);
    expect(parseFormatCl('Demi')).toBe(37.5);
    expect(parseFormatCl('Jéroboam')).toBe(300);
    expect(parseFormatCl('')).toBe(75);
  });

  it('détecte la couleur', () => {
    expect(parseColor('Rouge')).toBe('rouge');
    expect(parseColor('Champagne')).toBe('bulles');
    expect(parseColor('Liquoreux')).toBe('doux');
    expect(parseColor('')).toBe('autre');
  });

  it('retire format et ponctuation des libellés', () => {
    expect(cleanName('Pauillac (Mag) 150cl')).toBe('pauillac');
  });

  it('même clé canonique malgré accents, casse et préfixes', () => {
    const a = canonicalKey({ producer: 'Château Rayas', name: 'Châteauneuf-du-Pape', vintage: '2012', color: 'rouge', formatCl: 75 });
    const b = canonicalKey({ producer: 'chateau  RAYAS', name: 'Chateauneuf du Pape', vintage: '2012', color: 'rouge', formatCl: 75 });
    expect(a).toBe(b);
  });

  it('distingue millésime et format', () => {
    const base = { producer: 'X', name: 'Y', color: 'rouge' };
    expect(canonicalKey({ ...base, vintage: '2019', formatCl: 75 })).not.toBe(canonicalKey({ ...base, vintage: '2020', formatCl: 75 }));
    expect(canonicalKey({ ...base, vintage: '2019', formatCl: 75 })).not.toBe(canonicalKey({ ...base, vintage: '2019', formatCl: 150 }));
  });

  it('similarité', () => {
    expect(similarity('Puligny-Montrachet', 'puligny montrachet')).toBe(1);
    expect(similarity('Chambertin', 'Pommard')).toBeLessThan(0.4);
  });

  it('rapproche un libellé de facture du référentiel', () => {
    const wines = [mk({}), mk({ name: 'Meursault', producer: 'Domaine Roulot' })];
    const exact = findMatches({ producer: 'Domaine Leflaive', name: 'Puligny Montrachet', vintage: '2020', color: 'blanc', formatCl: 75 }, wines);
    expect(exact[0].exact).toBe(true);
    const fuzzy = findMatches({ producer: 'D. Leflaive', name: 'Puligny-Montrachet', vintage: '2020', formatCl: 75 }, wines);
    expect(fuzzy[0]?.wine.name).toBe('Puligny-Montrachet');
    expect(findMatches({ producer: 'Domaine Leflaive', name: 'Puligny-Montrachet', vintage: '2019', formatCl: 75 }, wines)).toHaveLength(0);
  });
});
