import { useState } from 'react';
import type { WineAllocation } from '@/types';
import { useOrg } from '@/app/org';
import { Button, Field, Input, Modal, NumberInput, Select, Textarea, useToast } from '@/ui';
import { uid } from '@/lib/utils';

export function AllocationModal({
  allocation,
  onClose,
  onSaved,
}: {
  allocation?: WineAllocation;
  onClose: () => void;
  onSaved?: (a: WineAllocation) => void;
}) {
  const { toast } = useToast();
  const { producers, commit, path } = useOrg();

  const [producerName, setProducerName] = useState(allocation?.producerName ?? '');
  const [cuveeName, setCuveeName] = useState(allocation?.cuveeName ?? '');
  const [vintage, setVintage] = useState(
    allocation?.vintage ?? String(new Date().getFullYear() - 2),
  );
  const [formatCl, setFormatCl] = useState(allocation?.formatCl ?? 75);
  const [campaignYear, setCampaignYear] = useState(
    allocation?.campaignYear ?? new Date().getFullYear(),
  );
  const [quotaBottles, setQuotaBottles] = useState(allocation?.quotaBottles ?? 12);
  const [orderedBottles, setOrderedBottles] = useState(allocation?.orderedBottles ?? 12);
  const [receivedBottles, setReceivedBottles] = useState(allocation?.receivedBottles ?? 0);
  const [unitPriceHT, setUnitPriceHT] = useState(allocation?.unitPriceHT ?? 0);
  const [status, setStatus] = useState<WineAllocation['status']>(
    allocation?.status ?? 'confirmed',
  );
  const [deadlineDate, setDeadlineDate] = useState(allocation?.deadlineDate ?? '');
  const [notes, setNotes] = useState(allocation?.notes ?? '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!producerName.trim() || !cuveeName.trim()) return;
    setBusy(true);

    const producer = producers.find(
      (p) => p.name.toLowerCase() === producerName.trim().toLowerCase(),
    );

    const saved: WineAllocation = {
      id: allocation?.id ?? uid(),
      producerId: producer?.id,
      producerName: producerName.trim(),
      cuveeName: cuveeName.trim(),
      vintage: vintage.trim(),
      formatCl: Number(formatCl) || 75,
      campaignYear: Number(campaignYear) || new Date().getFullYear(),
      quotaBottles: Math.max(0, Number(quotaBottles) || 0),
      orderedBottles: Math.max(0, Number(orderedBottles) || 0),
      receivedBottles: Math.max(0, Number(receivedBottles) || 0),
      unitPriceHT: unitPriceHT ? Number(unitPriceHT) : undefined,
      status,
      deadlineDate: deadlineDate.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: allocation?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await commit([
        {
          op: 'set',
          path: path('allocations', saved.id),
          data: JSON.parse(JSON.stringify(saved)),
        },
      ]);
      toast('Allocation enregistrée avec succès');
      onSaved?.(saved);
      onClose();
    } catch {
      toast('Erreur lors de l’enregistrement de l’allocation', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={allocation ? 'Modifier l’allocation' : 'Enregistrer une allocation vigneron / primeur'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={save}
            disabled={busy || !producerName.trim() || !cuveeName.trim()}
          >
            {busy ? 'Enregistrement...' : 'Enregistrer le contrat d’allocation'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Domaine / Producteur">
            <Input
              value={producerName}
              onChange={(e) => setProducerName(e.target.value)}
              placeholder="Ex: Domaine de la Romanée-Conti"
            />
          </Field>
          <Field label="Cuvée / Appellation">
            <Input
              value={cuveeName}
              onChange={(e) => setCuveeName(e.target.value)}
              placeholder="Ex: Romanée-Conti Grand Cru"
            />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Millésime">
            <Input
              value={vintage}
              onChange={(e) => setVintage(e.target.value)}
              placeholder="Ex: 2021"
            />
          </Field>
          <Field label="Format">
            <Select value={String(formatCl)} onChange={(e) => setFormatCl(Number(e.target.value))}>
              <option value="75">75 cl (Bouteille)</option>
              <option value="150">150 cl (Magnum)</option>
              <option value="37.5">37.5 cl (Demi)</option>
              <option value="300">300 cl (Jéroboam)</option>
            </Select>
          </Field>
          <Field label="Campagne (Année)">
            <NumberInput
              value={campaignYear}
              onChange={(v) => setCampaignYear(Number(v) || new Date().getFullYear())}
            />
          </Field>
        </div>

        <div className="rounded-xl border border-border bg-surface-2/40 p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">
            Quotas et volumes d'allocation (Bouteilles)
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Quota accordé">
              <NumberInput
                value={quotaBottles}
                onChange={(v) => setQuotaBottles(Number(v) || 0)}
                min={0}
              />
            </Field>
            <Field label="Commandé / Réservé">
              <NumberInput
                value={orderedBottles}
                onChange={(v) => setOrderedBottles(Number(v) || 0)}
                min={0}
              />
            </Field>
            <Field label="Déjà livré en cave">
              <NumberInput
                value={receivedBottles}
                onChange={(v) => setReceivedBottles(Number(v) || 0)}
                min={0}
              />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Prix unitaire HT domaine">
            <NumberInput
              value={unitPriceHT}
              onChange={(v) => setUnitPriceHT(Number(v) || 0)}
              step={0.5}
              min={0}
            />
          </Field>
          <Field label="Statut de l'allocation">
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as WineAllocation['status'])}
            >
              <option value="pending">En attente de confirmation</option>
              <option value="confirmed">Confirmée / Réservée</option>
              <option value="delivered">Entièrement livrée</option>
              <option value="cancelled">Annulée / Perdue</option>
            </Select>
          </Field>
          <Field label="Date limite de confirmation">
            <Input
              type="date"
              value={deadlineDate}
              onChange={(e) => setDeadlineDate(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Conditions & notes de contrat">
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Allocation historique DRC, confirmation obligatoire par courrier avant le 15 mars."
          />
        </Field>
      </div>
    </Modal>
  );
}
