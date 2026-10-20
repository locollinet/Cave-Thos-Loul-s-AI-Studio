import { useMemo, useRef, useState } from 'react';
import { FileUp } from 'lucide-react';
import * as XLSX from 'xlsx';
import type { Producer, Wine } from '@/types';
import { useOrg } from '@/app/org';
import { useAuth } from '@/app/auth';
import { useI18n } from '@/i18n';
import { Badge, Button, Checkbox, Field, Modal, Select, Table, Td, Th, useToast } from '@/ui';
import { IMPORT_FIELDS, detectMapping, mapRows, type ImportField } from '@/lib/importWines';
import { findMatches } from '@/lib/wine';
import { round2, uid } from '@/lib/utils';
import { buildMovementOps, qtyAt } from '@/data/stock';
import type { Op } from '@/data/store';

export function ImportWinesModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const { toast } = useToast();
  const { user } = useAuth();
  const { orgId, org, wines, producers, sites, stock, commit, path, activeSiteId } = useOrg();
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<unknown[][]>([]);
  const [mapping, setMapping] = useState<Partial<Record<ImportField, number>>>({});
  const [updateExisting, setUpdateExisting] = useState(true);
  const [applyQty, setApplyQty] = useState(true);
  const [siteId, setSiteId] = useState(activeSiteId !== 'all' ? activeSiteId : sites[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const load = async (f: File) => {
    const wb = XLSX.read(await f.arrayBuffer(), { type: 'array' });
    const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
    if (!data.length) return;
    const hs = data[0].map((x) => String(x));
    setHeaders(hs);
    setRows(data.slice(1));
    setMapping(detectMapping(hs));
  };

  const items = useMemo(
    () =>
      mapRows(rows, mapping).map((w) => {
        const m = findMatches(w, wines, 1)[0];
        return { w, match: m && m.exact ? m.wine : undefined };
      }),
    [rows, mapping, wines],
  );
  const created = items.filter((i) => !i.match).length;
  const matched = items.length - created;

  const run = async () => {
    if (!user) return;
    setBusy(true);
    try {
      const ops: Op[] = [];
      const known = new Map(producers.map((p) => [p.name.toLowerCase(), p]));
      const now = Date.now();
      const seen = new Set<string>();
      const moveInputs: Parameters<typeof buildMovementOps>[1] = [];
      for (const { w, match } of items) {
        if (!match && seen.has(w.canonicalKey)) continue;
        seen.add(w.canonicalKey);
        let wine: Wine;
        if (match) {
          wine = match;
          if (updateExisting) {
            const patch: Partial<Wine> = { updatedAt: now };
            if (w.buyPriceHT !== undefined) patch.buyPriceHT = w.buyPriceHT;
            if (w.sellPriceHT !== undefined) patch.sellPriceHT = w.sellPriceHT;
            if (w.region && !match.region) patch.region = w.region;
            if (w.grapes && !match.grapes) patch.grapes = w.grapes;
            wine = { ...match, ...patch };
            ops.push({ op: 'set', path: path('wines', match.id), data: JSON.parse(JSON.stringify(patch)), merge: true });
          }
        } else {
          let p: Producer | undefined = known.get(w.producer.toLowerCase());
          if (!p) {
            p = { id: uid(), name: w.producer, region: w.region, country: w.country, createdAt: now };
            known.set(w.producer.toLowerCase(), p);
            ops.push({ op: 'set', path: path('producers', p.id), data: JSON.parse(JSON.stringify(p)) });
          }
          wine = {
            id: uid(),
            producerId: p.id,
            producer: w.producer,
            name: w.name,
            vintage: w.vintage,
            color: w.color,
            formatCl: w.formatCl,
            region: w.region,
            country: w.country,
            grapes: w.grapes,
            buyPriceHT: w.buyPriceHT,
            sellPriceHT: w.sellPriceHT ?? (w.buyPriceHT ? round2(w.buyPriceHT * (p.coefficient ?? org.defaultCoefficient)) : undefined),
            ean: w.ean,
            alertThreshold: 3,
            canonicalKey: w.canonicalKey,
            createdAt: now,
            updatedAt: now,
          };
          ops.push({ op: 'set', path: path('wines', wine.id), data: JSON.parse(JSON.stringify(wine)) });
        }
        if (applyQty && w.qty !== undefined && siteId) {
          const delta = w.qty - (match ? qtyAt(stock, match.id, siteId) : 0);
          if (delta !== 0) moveInputs.push({ wine, siteId, type: 'adjust', qty: delta, reason: 'inventaire', note: 'Import' });
        }
      }
      ops.push(...buildMovementOps(orgId, moveInputs, { userId: user.uid, userName: user.name }));
      await commit(ops);
      toast(t('import.done', { created, matched }));
      onClose();
    } catch (e) {
      toast((e as Error).message, 'bad');
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={t('import.title')}
      footer={
        <>
          <Button onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" disabled={!items.length || mapping.name === undefined} loading={busy} onClick={run}>
            {t('import.run', { n: items.length })}
          </Button>
        </>
      }
    >
      {!rows.length ? (
        <div
          className="flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed border-border p-12 text-center hover:border-brand/50"
          onClick={() => file.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) load(f);
          }}
        >
          <FileUp className="size-8 text-muted" />
          <div className="font-medium">{t('import.drop')}</div>
          <p className="text-sm text-muted">{t('import.hint')}</p>
          <input ref={file} type="file" accept=".csv,.xlsx,.xls,.tsv,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
        </div>
      ) : (
        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-sm font-semibold">{t('import.mapping')}</h3>
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {IMPORT_FIELDS.map((f) => (
                <Field key={f} label={t(`import.field.${f}`)}>
                  <Select value={mapping[f] ?? ''} onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value === '' ? undefined : Number(e.target.value) }))}>
                    <option value="">—</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h || `#${i + 1}`}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-surface-2 p-3 text-sm">
            <Badge tone="ok">{t('import.new', { n: created })}</Badge>
            <Badge tone="info">{t('import.existing', { n: matched })}</Badge>
            <Checkbox checked={updateExisting} onChange={setUpdateExisting} label={t('import.updateExisting')} />
            <Checkbox checked={applyQty} onChange={setApplyQty} label={t('import.applyQty')} />
            {applyQty && (
              <Select value={siteId} onChange={(e) => setSiteId(e.target.value)} className="w-auto">
                {sites.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <Table>
            <thead>
              <tr>
                <Th />
                <Th>{t('wines.producer')}</Th>
                <Th>{t('wines.cuvee')}</Th>
                <Th>{t('wines.vintage')}</Th>
                <Th right>{t('wines.buyPrice')}</Th>
                <Th right>{t('common.qty')}</Th>
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 50).map(({ w, match }, i) => (
                <tr key={i}>
                  <Td>{match ? <Badge tone="info">{t('import.existingShort')}</Badge> : <Badge tone="ok">{t('import.newShort')}</Badge>}</Td>
                  <Td>{w.producer}</Td>
                  <Td className="max-w-64 truncate">{w.name}</Td>
                  <Td>{w.vintage}</Td>
                  <Td right>{w.buyPriceHT ?? '—'}</Td>
                  <Td right>{w.qty ?? '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {items.length > 50 && <p className="text-xs text-muted">{t('import.more', { n: items.length - 50 })}</p>}
        </div>
      )}
    </Modal>
  );
}
