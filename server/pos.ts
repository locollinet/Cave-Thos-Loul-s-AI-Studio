import { Router, type Request, type Response } from 'express';

export const posRouter = Router();

interface PosDepleteItem {
  posCode?: string;
  wineId?: string;
  qty: number;
}

interface PosDepleteBody {
  orgId?: string;
  siteId?: string;
  ticketId?: string;
  table?: string;
  items?: PosDepleteItem[];
}

/**
 * Route Webhook universelle pour les caisses enregistreuses (POS) :
 * Déclenchée lors de la clôture d'une table ou d'un encaissement.
 */
posRouter.post('/deplete', (req: Request, res: Response) => {
  const body = req.body as PosDepleteBody;
  const items = body.items;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: 'Requête invalide : la liste des articles à déstocker (items) est requise.',
    });
  }

  const validItems = items.filter((it) => typeof it.qty === 'number' && it.qty > 0 && (it.posCode || it.wineId));

  if (validItems.length === 0) {
    return res.status(400).json({
      error: 'Aucun article valide trouvé (qty > 0 et posCode ou wineId requis).',
    });
  }

  // Journalise l'événement de déstockage POS
  console.log(
    `[POS:deplete] org=${body.orgId ?? 'default'} ticket=${body.ticketId ?? 'N/A'} table=${body.table ?? 'N/A'} articles=${validItems.length}`,
  );

  return res.json({
    ok: true,
    processedCount: validItems.length,
    ticketId: body.ticketId ?? null,
    table: body.table ?? null,
    receivedAt: Date.now(),
    message: `${validItems.length} article(s) reçus pour déstockage automatique.`,
  });
});
