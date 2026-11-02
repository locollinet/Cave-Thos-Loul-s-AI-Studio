import { describe, expect, it } from 'vitest';
import express from 'express';
import { posRouter } from '../server/pos';
import { matchPosWine, parsePosReport } from '../src/lib/posReport';
import type { Wine } from '../src/types';

const wine = (id: string, producer: string, name: string, vintage: string, posCode?: string): Wine => ({
  id, producer, name, vintage, posCode, color: 'blanc', formatCl: 75, alertThreshold: 0, canonicalKey: id, createdAt: 0, updatedAt: 0,
});

describe('rapport de ventes de caisse', () => {
  it('lit les colonnes par leur en-tête, guillemets et séparateurs compris', () => {
    const csv = 'Code PLU;Désignation;Qté vendus\nPLU-104;"Chablis 1er Cru ""Montée de Tonnerre"" 2020";2\nPLU-9;Café;0\n;Meursault 2019;1,0';
    expect(parsePosReport(csv)).toEqual([
      { id: 'line_0', rawLabel: 'Chablis 1er Cru "Montée de Tonnerre" 2020', qty: 2, posCode: 'PLU-104' },
      { id: 'line_2', rawLabel: 'Meursault 2019', qty: 1, posCode: undefined },
    ]);
  });

  it('lit un fichier sans en-tête (article, quantité, code)', () => {
    expect(parsePosReport('Gevrey-Chambertin 2018,2,PLU-402')).toEqual([{ id: 'line_0', rawLabel: 'Gevrey-Chambertin 2018', qty: 2, posCode: 'PLU-402' }]);
  });

  it('rapproche par code caisse, puis par mots communs, jamais sur un seul mot', () => {
    const wines = [wine('a', 'Domaine Fèvre', 'Chablis 1er Cru Montée de Tonnerre', '2020'), wine('b', 'Comtes Lafon', 'Meursault', '2019', 'PLU-208')];
    expect(matchPosWine(wines, 'Article inconnu', 'PLU-208')).toBe('b');
    expect(matchPosWine(wines, 'Chablis Montée de Tonnerre 2020')).toBe('a');
    expect(matchPosWine(wines, 'Chablis')).toBeUndefined();
  });
});

describe('POS Universal Deplete Route', () => {
  const app = express();
  app.use(express.json());
  app.use('/api/pos', posRouter);

  it('rejects empty or invalid items list', async () => {
    const res = await new Promise<{ status: number; body: { error?: string } }>((resolve) => {
      const req = {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [] }),
      };
      const server = app.listen(0, async () => {
        const address = server.address() as { port: number };
        const response = await fetch(`http://127.0.0.1:${address.port}/api/pos/deplete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: [] }),
        });
        const body = await response.json();
        server.close(() => resolve({ status: response.status, body }));
      });
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  it('never pretends to deplete stock when no connector is enabled', async () => {
    const payload = {
      orgId: 'org_test',
      ticketId: 'TCK-9921',
      table: 'Table 14',
      items: [
        { posCode: 'PLU-104', qty: 2 },
        { wineId: 'wine_xyz', qty: 1 },
      ],
    };

    const res = await new Promise<{ status: number; body: { ok?: boolean; received?: number; error?: string } }>((resolve) => {
      const server = app.listen(0, async () => {
        const address = server.address() as { port: number };
        const response = await fetch(`http://127.0.0.1:${address.port}/api/pos/deplete`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const body = await response.json();
        server.close(() => resolve({ status: response.status, body }));
      });
    });

    expect(res.status).toBe(501);
    expect(res.body.ok).toBeUndefined();
    expect(res.body.received).toBe(2);
    expect(res.body.error).toMatch(/aucun stock/);
  });
});
