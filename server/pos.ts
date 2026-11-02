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
 * Point d'entrée réservé aux connecteurs de caisse (POS). Aucun connecteur n'est activé par défaut :
 * la requête est validée puis refusée en 501 pour ne jamais laisser croire à un déstockage.
 * Le rapprochement se fait aujourd'hui par import du rapport de ventes (Stock › Ventes caisse).
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

  return res.status(501).json({
    error: 'Aucun connecteur de caisse n’est activé sur cette instance : aucun stock n’a été modifié. Importez le rapport de ventes depuis Stock › Ventes caisse.',
    received: validItems.length,
  });
});
