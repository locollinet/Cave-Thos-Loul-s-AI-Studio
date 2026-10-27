import { useState } from 'react';
import type { CellarRack } from '@/types';
import { useOrg } from '@/app/org';
import { Button, Field, Input, Modal, NumberInput, Select, useToast } from '@/ui';
import { uid } from '@/lib/utils';

export function RackFormModal({
  rack,
  onClose,
  onSaved,
}: {
  rack?: CellarRack;
  onClose: () => void;
  onSaved?: (r: CellarRack) => void;
}) {
  const { toast } = useToast();
  const { activeSiteId, sites, commit, path } = useOrg();

  const [siteId, setSiteId] = useState(
    rack?.siteId ?? (activeSiteId !== 'all' ? activeSiteId : sites[0]?.id ?? 'main'),
  );
  const [name, setName] = useState(rack?.name ?? 'Nouveau casier');
  const [prefix, setPrefix] = useState(rack?.prefix ?? 'C');
  const [rows, setRows] = useState(rack?.rows ?? 5);
  const [cols, setCols] = useState(rack?.cols ?? 6);
  const [zone, setZone] = useState(rack?.zone ?? 'Cave principale');
  const [temperatureC, setTemperatureC] = useState(rack?.temperatureC ?? 12.5);
  const [humidityPct, setHumidityPct] = useState(rack?.humidityPct ?? 74);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim() || !prefix.trim()) return;
    setBusy(true);

    const saved: CellarRack = {
      id: rack?.id ?? uid(),
      siteId,
      name: name.trim(),
      prefix: prefix.trim().toUpperCase().slice(0, 3),
      rows: Math.max(1, Math.min(20, rows)),
      cols: Math.max(1, Math.min(20, cols)),
      zone: zone.trim() || undefined,
      temperatureC: Number(temperatureC) || undefined,
      humidityPct: Number(humidityPct) || undefined,
      createdAt: rack?.createdAt ?? Date.now(),
    };

    try {
      await commit([
        {
          op: 'set',
          path: path('racks', saved.id),
          data: JSON.parse(JSON.stringify(saved)),
        },
      ]);
      toast('Casier enregistré avec succès');
      onSaved?.(saved);
      onClose();
    } catch {
      toast('Erreur lors de l’enregistrement du casier', 'bad');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={rack ? 'Modifier le casier' : 'Configurer un nouveau casier de cave'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Annuler
          </Button>
          <Button variant="primary" onClick={save} disabled={busy || !name.trim() || !prefix.trim()}>
            {busy ? 'Enregistrement...' : 'Enregistrer le meuble'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Site / Emplacement">
          <Select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Nom du meuble / casier">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Casier A — Bourgogne Rouges"
              />
            </Field>
          </div>
          <div>
            <Field label="Préfixe d'alvéole" hint="Ex: A -> A1, A2...">
              <Input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 3))}
                placeholder="A"
              />
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nombre de rangées (hauteur)" hint="Min 1, Max 20">
            <NumberInput
              value={rows}
              onChange={(v) => setRows(Number(v) || 5)}
              min={1}
              max={20}
            />
          </Field>
          <Field label="Nombre de colonnes (largeur)" hint="Min 1, Max 20">
            <NumberInput
              value={cols}
              onChange={(v) => setCols(Number(v) || 6)}
              min={1}
              max={20}
            />
          </Field>
        </div>

        <Field label="Zone / Pièce" hint="Optionnel (ex: Cave voûtée historique, Armoire salle)">
          <Input
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            placeholder="Ex: Cave voûtée 2e sous-sol"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Température de consigne (°C)">
            <NumberInput
              value={temperatureC}
              onChange={(v) => setTemperatureC(Number(v) || 12)}
              step={0.5}
            />
          </Field>
          <Field label="Hygrométrie (% HR)">
            <NumberInput
              value={humidityPct}
              onChange={(v) => setHumidityPct(Number(v) || 75)}
              min={0}
              max={100}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
