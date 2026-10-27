import { describe, expect, it } from 'vitest';
import express from 'express';
import { posRouter } from '../server/pos';

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

  it('successfully processes valid POS sales depletion items', async () => {
    const payload = {
      orgId: 'org_test',
      ticketId: 'TCK-9921',
      table: 'Table 14',
      items: [
        { posCode: 'PLU-104', qty: 2 },
        { wineId: 'wine_xyz', qty: 1 },
      ],
    };

    const res = await new Promise<{ status: number; body: { ok?: boolean; processedCount?: number } }>((resolve) => {
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

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.processedCount).toBe(2);
  });
});
