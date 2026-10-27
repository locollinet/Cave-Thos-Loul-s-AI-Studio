import { useMemo, useState } from 'react';
import { Check, CreditCard, DollarSign, Minus, Plus, Printer, Search, Wine as WineIcon, Zap } from 'lucide-react';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { useI18n } from '@/i18n';
import { Badge, Button, Card, Field, Input, Modal, Select, useToast } from '@/ui';
import { eur, round2, today, uid } from '@/lib/utils';
import { norm, wineLabel } from '@/lib/wine';
import { buildMovementOps } from '@/data/stock';
import { computeTotals, formatNumber } from './calc';
import { nextSeq } from './ops';
import type { Payment, PaymentMethod, SaleDocument } from './types';
import type { Wine } from '@/types';

export interface QuickSaleModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (doc: SaleDocument) => void;
}

export function QuickSaleModal({ open, onClose, onSuccess }: QuickSaleModalProps) {
  const { t, intl } = useI18n();
  const { toast } = useToast();
  const { org, wines, stock, activeSiteId, sites, commit, member, store } = useOrg();
  const { user } = useAuth();

  const [search, setSearch] = useState('');
  const [selectedWine, setSelectedWine] = useState<Wine | null>(null);
  const [qty, setQty] = useState(1);
  const [customPriceTTC, setCustomPriceTTC] = useState<string>('');
  const [method, setMethod] = useState<PaymentMethod>('carte');
  const [partnerName, setPartnerName] = useState('Client comptoir');
  const [busy, setBusy] = useState(false);
  const [completedSale, setCompletedSale] = useState<{ doc: SaleDocument; payment: Payment } | null>(null);

  const siteId = activeSiteId !== 'all' ? activeSiteId : sites[0]?.id || 'cave-principale';
  const siteName = sites.find((s) => s.id === siteId)?.name || 'Cave principale';

  // Calcul du stock disponible par vin sur le site
  const stockMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of stock) {
      if (s.siteId === siteId) {
        map.set(s.wineId, (map.get(s.wineId) ?? 0) + s.qty);
      }
    }
    return map;
  }, [stock, siteId]);

  // Vins filtrés
  const filteredWines = useMemo(() => {
    const q = norm(search);
    return wines
      .filter((w) => !w.isArchived)
      .filter((w) => !q || norm(`${w.producer} ${w.name} ${w.vintage} ${w.region ?? ''}`).includes(q))
      .slice(0, 15);
  }, [wines, search]);

  const defaultVatRate = org.defaultVatRate || 20;

  // Calcul du prix par défaut
  const unitPriceHT = useMemo(() => {
    if (!selectedWine) return 0;
    if (customPriceTTC) {
      const p = parseFloat(customPriceTTC.replace(',', '.'));
      if (!isNaN(p) && p > 0) return round2(p / (1 + defaultVatRate / 100));
    }
    return selectedWine.sellPriceHT || round2((selectedWine.buyPriceHT || 10) * (org.defaultCoefficient || 1.6));
  }, [selectedWine, customPriceTTC, defaultVatRate, org.defaultCoefficient]);

  const unitPriceTTC = round2(unitPriceHT * (1 + defaultVatRate / 100));
  const totalTTC = round2(unitPriceTTC * qty);
  const availableQty = selectedWine ? stockMap.get(selectedWine.id) ?? 0 : 0;

  const handleSelectWine = (w: Wine) => {
    setSelectedWine(w);
    setSearch('');
    const baseHT = w.sellPriceHT || round2((w.buyPriceHT || 10) * (org.defaultCoefficient || 1.6));
    setCustomPriceTTC((baseHT * (1 + defaultVatRate / 100)).toFixed(2));
  };

  const handleCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWine || qty <= 0) return;
    if (qty > availableQty) {
      toast(`Stock insuffisant sur ${siteName} (${availableQty} disponibles)`, 'bad');
      return;
    }

    setBusy(true);
    try {
      const now = Date.now();
      const dateStr = today();
      const docId = uid();
      const paymentId = uid();
      const prefix = org.invoicePrefix || 'FAC';
      const year = dateStr.slice(0, 4);
      const key = `${prefix}-${year}`;
      const seq = await nextSeq(store.getDoc, org.id, key);
      const docNumber = formatNumber(prefix, year, seq);

      const totals = computeTotals(
        [{ id: '1', qty, unitPriceHT, discountPct: 0, vatRate: defaultVatRate, description: wineLabel(selectedWine) }],
        0,
        defaultVatRate,
        0,
      );

      const saleDoc: SaleDocument = {
        id: docId,
        type: 'invoice',
        number: docNumber,
        status: 'paid',
        date: dateStr,
        dueDate: dateStr,
        partnerId: 'comptoir',
        partnerName: partnerName.trim() || 'Client comptoir',
        partnerType: 'particulier',
        siteId,
        lines: [
          {
            id: uid(),
            wineId: selectedWine.id,
            description: wineLabel(selectedWine),
            qty,
            unitPriceHT,
            discountPct: 0,
            vatRate: defaultVatRate,
          },
        ],
        shippingHT: 0,
        shippingVatRate: defaultVatRate,
        discountPct: 0,
        totalHT: totals.totalHT,
        totalVAT: totals.totalVAT,
        totalTTC: totals.totalTTC,
        notes: 'Vente directe au comptoir — Paiement immédiat',
        paymentTermsDays: 0,
        createdAt: now,
        createdBy: user?.name || member?.name || 'Comptoir',
      };

      const payment: Payment = {
        id: paymentId,
        documentId: docId,
        date: dateStr,
        amount: totals.totalTTC,
        method,
        reference: `Comptoir / ${method.toUpperCase()}`,
      };

      const actor = {
        userId: user?.uid || member?.uid || 'comptoir',
        userName: user?.name || member?.name || 'Comptoir',
      };

      // Mouvement de sortie de stock atomique
      const moveOps = buildMovementOps(
        org.id,
        [
          {
            wine: selectedWine,
            siteId,
            type: 'out',
            qty,
            reason: 'vente',
            note: `Vente comptoir ${docNumber}`,
            date: dateStr,
          },
        ],
        actor,
        now,
      );

      const ops = [
        { op: 'set' as const, path: `orgs/${org.id}/documents/${docId}`, data: saleDoc as never },
        { op: 'set' as const, path: `orgs/${org.id}/payments/${paymentId}`, data: payment as never },
        { op: 'inc' as const, path: `orgs/${org.id}/counters/${key}`, field: 'value', by: 1, data: { id: key } },
        ...moveOps,
      ];

      await commit(ops);
      setCompletedSale({ doc: saleDoc, payment });
      toast(`Vente comptoir enregistrée : ${eur(totals.totalTTC, org.currency, intl)} encaissés !`, 'ok');
      onSuccess?.(saleDoc);
    } catch (err) {
      toast((err as Error).message, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = () => {
    setSelectedWine(null);
    setQty(1);
    setCustomPriceTTC('');
    setCompletedSale(null);
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        handleReset();
        onClose();
      }}
      title={
        <span className="flex items-center gap-2">
          <Zap className="size-5 text-accent" />
          <span>Vente comptoir / Encaissement rapide</span>
        </span>
      }
      size="md"
    >
      {completedSale ? (
        /* Ticket de caisse imprimable */
        <div className="space-y-4 py-2">
          <div className="rounded-xl border border-ok/30 bg-ok/10 p-4 text-center">
            <div className="mx-auto grid size-10 place-items-center rounded-full bg-ok text-white mb-2">
              <Check className="size-6" />
            </div>
            <h3 className="font-display text-lg font-semibold text-ink">Vente encaissée avec succès !</h3>
            <p className="text-xs text-muted">
              Facture n° <strong className="text-ink">{completedSale.doc.number}</strong> · Stock mis à jour sur {siteName}
            </p>
          </div>

          {/* Ticket de caisse format épuré */}
          <div className="rounded-xl border border-border bg-surface p-5 font-mono text-xs shadow-xs space-y-2">
            <div className="text-center border-b border-dashed border-border pb-3">
              <div className="font-bold text-sm font-sans">{org.name}</div>
              <div className="text-muted">{org.legal.address || org.legal.city || 'Cave & Dégustation'}</div>
              <div className="text-muted text-[10px]">SIRET : {org.legal.siret || 'FR48920192801'}</div>
              <div className="mt-1 text-[11px] font-sans font-semibold">TICKET DE VENTE / REÇU COMPTOIR</div>
              <div className="text-muted text-[10px]">{today()} · N° {completedSale.doc.number}</div>
            </div>

            <div className="py-2 border-b border-dashed border-border space-y-1">
              {completedSale.doc.lines.map((l) => (
                <div key={l.id} className="flex justify-between">
                  <span className="truncate max-w-[70%]">{l.qty}x {l.description}</span>
                  <span className="tabular font-semibold">
                    {eur(round2(l.unitPriceHT * (1 + l.vatRate / 100) * l.qty), org.currency, intl)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1 pt-1 text-right">
              <div className="flex justify-between text-muted text-[11px]">
                <span>Total HT</span>
                <span>{eur(completedSale.doc.totalHT, org.currency, intl)}</span>
              </div>
              <div className="flex justify-between text-muted text-[11px]">
                <span>TVA ({defaultVatRate}%)</span>
                <span>{eur(completedSale.doc.totalVAT, org.currency, intl)}</span>
              </div>
              <div className="flex justify-between text-base font-bold font-sans border-t border-border pt-1">
                <span>TOTAL TTC</span>
                <span>{eur(completedSale.doc.totalTTC, org.currency, intl)}</span>
              </div>
              <div className="flex justify-between text-muted text-[11px] pt-1">
                <span>Règlement ({completedSale.payment.method.toUpperCase()})</span>
                <span>{eur(completedSale.payment.amount, org.currency, intl)}</span>
              </div>
            </div>

            <div className="text-center pt-3 border-t border-dashed border-border text-[10px] text-muted font-sans">
              Merci de votre visite et bonne dégustation !
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" icon={<Printer className="size-4" />} onClick={() => window.print()}>
              Imprimer le ticket
            </Button>
            <Button variant="primary" onClick={handleReset}>
              Nouvelle vente
            </Button>
          </div>
        </div>
      ) : (
        /* Formulaire d'encaissement direct */
        <form onSubmit={handleCheckout} className="space-y-4">
          {!selectedWine ? (
            <div className="space-y-3">
              <Field label="Rechercher une bouteille dans la cave">
                <div className="relative">
                  <Search className="absolute left-3 top-3 size-4 text-muted" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tapez un domaine, une cuvée ou un millésime..."
                    className="pl-9"
                    autoFocus
                  />
                </div>
              </Field>

              <div className="max-h-60 overflow-y-auto divide-y divide-border rounded-xl border border-border bg-surface">
                {filteredWines.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted">Aucun vin trouvé pour cette recherche.</p>
                ) : (
                  filteredWines.map((w) => {
                    const st = stockMap.get(w.id) ?? 0;
                    const priceTTC = round2(
                      (w.sellPriceHT || round2((w.buyPriceHT || 10) * (org.defaultCoefficient || 1.6))) *
                        (1 + defaultVatRate / 100),
                    );
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => handleSelectWine(w)}
                        className="flex w-full items-center justify-between p-3 text-left transition hover:bg-surface-2"
                      >
                        <div className="min-w-0 flex-1 pr-3">
                          <div className="truncate text-xs font-semibold uppercase text-brand">{w.producer}</div>
                          <div className="truncate text-sm font-medium">
                            {w.name} {w.vintage}
                          </div>
                          <div className="text-[11px] text-muted">{w.region || 'France'}</div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="font-bold text-sm">{eur(priceTTC, org.currency, intl)}</div>
                          <div className="text-[10px] text-muted">
                            Stock : <span className={st > 0 ? 'font-semibold text-ok' : 'text-bad'}>{st} btl</span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="flex items-center justify-between p-3.5 bg-brand-soft/30 border-brand/30">
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] uppercase tracking-wider text-muted">{selectedWine.producer}</div>
                  <div className="font-display text-base font-semibold text-ink truncate">
                    {selectedWine.name} <span className="text-muted">{selectedWine.vintage}</span>
                  </div>
                  <div className="text-xs text-muted">
                    Disponible : <strong className="text-ink">{availableQty} btl</strong> sur {siteName}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setSelectedWine(null)}>
                  Changer
                </Button>
              </Card>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Quantité (bouteilles)">
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                    >
                      <Minus className="size-3.5" />
                    </Button>
                    <Input
                      type="number"
                      min="1"
                      max={availableQty}
                      value={qty}
                      onChange={(e) => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                      className="text-center font-bold"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => setQty((q) => Math.min(availableQty, q + 1))}
                    >
                      <Plus className="size-3.5" />
                    </Button>
                  </div>
                </Field>

                <Field label="Prix unitaire TTC (€)">
                  <Input
                    value={customPriceTTC}
                    onChange={(e) => setCustomPriceTTC(e.target.value)}
                    placeholder="25.00"
                    required
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Mode d’encaissement">
                  <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                    <option value="carte">💳 Carte bancaire</option>
                    <option value="especes">💵 Espèces</option>
                    <option value="cheque">📝 Chèque</option>
                    <option value="virement">🏦 Virement direct</option>
                  </Select>
                </Field>
                <Field label="Nom du client (optionnel)">
                  <Input
                    value={partnerName}
                    onChange={(e) => setPartnerName(e.target.value)}
                    placeholder="Client comptoir"
                  />
                </Field>
              </div>

              {/* Récapitulatif total à encaisser */}
              <div className="rounded-xl bg-surface-2 p-4 text-center">
                <div className="text-xs text-muted">TOTAL À ENCAISSER (TTC)</div>
                <div className="font-display text-3xl font-bold text-brand mt-1">
                  {eur(totalTTC, org.currency, intl)}
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Dont {eur(round2(totalTTC - totalTTC / (1 + defaultVatRate / 100)), org.currency, intl)} de TVA ({defaultVatRate}%)
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" onClick={onClose}>
                  Annuler
                </Button>
                <Button type="submit" variant="primary" loading={busy} icon={<Zap className="size-4" />}>
                  Encaisser {eur(totalTTC, org.currency, intl)}
                </Button>
              </div>
            </div>
          )}
        </form>
      )}
    </Modal>
  );
}
