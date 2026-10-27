import { useState } from 'react';
import type { BottleConditionCapsule, BottleConditionLabel, BottleConditionLevel, RareBottle, Wine } from '@/types';
import { useOrg } from '@/app/org';
import { Button, Checkbox, Field, Input, Modal, Select, useToast } from '@/ui';
import { uid } from '@/lib/utils';

export function RareBottleModal({
  wine,
  onClose,
  onSaved,
}: {
  wine: Wine;
  onClose: () => void;
  onSaved?: (b: RareBottle) => void;
}) {
  const { toast } = useToast();
  const { sites, activeSiteId, commit, path } = useOrg();

  const [bottleNumber, setBottleNumber] = useState('');
  const [siteId, setSiteId] = useState(
    activeSiteId !== 'all' ? activeSiteId : sites[0]?.id ?? 'main',
  );
  const [bin, setBin] = useState('');
  const [cbo, setCbo] = useState(false);
  const [conditionLevel, setConditionLevel] = useState<BottleConditionLevel>('goulot');
  const [conditionLabel, setConditionLabel] = useState<BottleConditionLabel>('parfaite');
  const [conditionCapsule, setConditionCapsule] = useState<BottleConditionCapsule>('integre');
  const [provenance, setProvenance] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!bottleNumber.trim()) return;
    setBusy(true);

    const bottle: RareBottle = {
      id: uid(),
      wineId: wine.id,
      siteId,
      bottleNumber: bottleNumber.trim(),
      bin: bin.trim() || undefined,
      cbo,
      conditionLevel,
      conditionLabel,
      conditionCapsule,
      provenance: provenance.trim() || undefined,
      notes: notes.trim() || undefined,
      status: 'in_cellar',
      createdAt: Date.now(),
    };

    try {
      await commit([
        {
          op: 'set',
          path: path('bottles', bottle.id),
          data: JSON.parse(JSON.stringify(bottle)),
        },
      ]);
      toast(`Flacon n°${bottle.bottleNumber} enregistré`);
      onSaved?.(bottle);
      onClose();
    } catch {
      toast('Erreur lors de l’enregistrement du flacon', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Enregistrer un flacon d'exception · ${wine.name} (${wine.vintage})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={save}
            disabled={busy || !bottleNumber.trim()}
          >
            {busy ? 'Enregistrement...' : 'Enregistrer le flacon'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Numéro de bouteille unique" hint="Gravé sur l'étiquette ou la collerette">
            <Input
              value={bottleNumber}
              onChange={(e) => setBottleNumber(e.target.value)}
              placeholder="Ex: 04821 ou 04821 / 5000"
            />
          </Field>
          <Field label="Emplacement dans le casier" hint="Ex: A4, B12">
            <Input
              value={bin}
              onChange={(e) => setBin(e.target.value.toUpperCase())}
              placeholder="Ex: A4"
            />
          </Field>
        </div>

        <Field label="Site de stockage">
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="rounded-xl border border-border bg-surface-2/40 p-4 space-y-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted">
            État de conservation du flacon
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Niveau du vin">
              <Select
                value={conditionLevel}
                onChange={(e) => setConditionLevel(e.target.value as BottleConditionLevel)}
              >
                <option value="goulot">Dans le goulot (parfait)</option>
                <option value="bas_goulot">Bas goulot</option>
                <option value="haute_epaule">Haute épaule</option>
                <option value="mi_epaule">Mi-épaule</option>
              </Select>
            </Field>

            <Field label="État étiquette">
              <Select
                value={conditionLabel}
                onChange={(e) => setConditionLabel(e.target.value as BottleConditionLabel)}
              >
                <option value="parfaite">Impeccable</option>
                <option value="griffee">Légèrement griffée</option>
                <option value="tachee">Tachée de cave</option>
                <option value="fanee">Fanée / abîmée</option>
              </Select>
            </Field>

            <Field label="État capsule">
              <Select
                value={conditionCapsule}
                onChange={(e) => setConditionCapsule(e.target.value as BottleConditionCapsule)}
              >
                <option value="integre">Intègre</option>
                <option value="ciree">Cachet de cire intact</option>
                <option value="abimee">Ébréchée / abîmée</option>
              </Select>
            </Field>
          </div>

          <Checkbox
            checked={cbo}
            onChange={setCbo}
            label="En Caisse Bois d'Origine (CBO) scellée / cerclée"
          />
        </div>

        <Field label="Provenance / Traçabilité d'achat" hint="Ex: Allocation directe Domaine 2021, Vente aux enchères Christie's">
          <Input
            value={provenance}
            onChange={(e) => setProvenance(e.target.value)}
            placeholder="Ex: Allocation Domaine en direct"
          />
        </Field>

        <Field label="Remarques spécifiques sur ce flacon">
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ex: Bouteille acquise en primeur, conservée en cave d'origine"
          />
        </Field>
      </div>
    </Modal>
  );
}
