import { useRef, useState, type DragEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileUp, PenLine, Sparkles } from 'lucide-react';
import { useCollection, useOrg } from '@/app/org';
import { useT } from '@/i18n';
import { Button, Card, EmptyState, PageHeader, Spinner } from '@/ui';
import type { PurchaseInvoice } from '@/types';
import { apiPost, fileToBase64 } from '@/lib/api';
import { parseCsv, today } from '@/lib/utils';
import { emptyDraft, invoiceToDraft, parseTabular, toDraft } from './logic';
import type { InvoiceDraft, ParsedInvoice } from './types';
import { Review } from './Review';

const MAX_BYTES = 18 * 1024 * 1024;
const AI_MIMES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];

async function readTable(file: File): Promise<string[][]> {
  if (/\.(xlsx|xls|ods)$/i.test(file.name)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: false, defval: '' }).map((r) => r.map((c) => String(c ?? '')));
  }
  return parseCsv(await file.text());
}

export default function NewInvoice() {
  const t = useT();
  const { id } = useParams();
  const { org, sites, wines, activeSiteId } = useOrg();
  const { rows: invoices, loading } = useCollection<PurchaseInvoice>('purchaseInvoices');
  const siteId = activeSiteId !== 'all' && sites.some((s) => s.id === activeSiteId) ? activeSiteId : (sites[0]?.id ?? '');
  const [draft, setDraft] = useState<InvoiceDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const existing = id ? invoices.find((i) => i.id === id) : undefined;
  if (id) {
    if (loading) return <div className="grid min-h-40 place-items-center"><Spinner className="size-7" /></div>;
    if (!existing || existing.status !== 'draft') return <EmptyState title={t('achats.notFound')} action={<Link to="/achats" className="text-sm font-medium text-brand">{t('common.back')}</Link>} />;
  }

  const opts = (fileName?: string) => ({ siteId, today: today(), vatRate: org.defaultVatRate, fileName });

  const handle = async (file: File) => {
    setError('');
    if (file.size > MAX_BYTES) return setError(t('achats.import.tooBig'));
    setBusy(true);
    try {
      let parsed: ParsedInvoice | null;
      if (AI_MIMES.includes(file.type)) {
        const { base64, mimeType } = await fileToBase64(file);
        parsed = await apiPost<ParsedInvoice>('/api/ai/parse-invoice', { base64, mimeType, fileName: file.name });
      } else if (/\.(csv|txt|tsv|xlsx|xls|ods)$/i.test(file.name)) {
        parsed = parseTabular(await readTable(file), file.name);
        if (!parsed) throw new Error(t('achats.import.noColumns'));
      } else throw new Error(t('achats.import.unsupported'));
      if (!parsed.lines.length) throw new Error(t('achats.import.noLines'));
      setDraft(toDraft(parsed, wines, opts(file.name)));
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) void handle(f);
  };

  const active = existing ? invoiceToDraft(existing, wines, siteId, org.defaultVatRate) : draft;
  if (active) {
    return (
      <div>
        <PageHeader title={t(existing ? 'achats.editDraft' : 'achats.review')} subtitle={t('achats.reviewHint')} actions={<Link to="/achats" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />{t('common.back')}</Link>} />
        <Review key={active.id} initial={active} createdAt={existing?.createdAt} />
      </div>
    );
  }

  return (
    <div>
      <PageHeader title={t('achats.new')} subtitle={t('achats.import.subtitle')} actions={<Link to="/achats" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"><ArrowLeft className="size-4" />{t('common.back')}</Link>} />
      <Card
        className={`flex flex-col items-center gap-3 border-2 border-dashed px-6 py-14 text-center transition ${over ? 'border-brand bg-brand-soft' : 'border-border'}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
      >
        {busy ? (
          <>
            <Spinner className="size-8" />
            <p className="font-medium">{t('achats.import.analyzing')}</p>
            <p className="text-sm text-muted">{t('achats.import.analyzingHint')}</p>
          </>
        ) : (
          <>
            <Sparkles className="size-8 text-accent" />
            <p className="font-display text-lg font-semibold">{t('achats.import.drop')}</p>
            <p className="max-w-md text-sm text-muted">{t('achats.import.formats')}</p>
            <input ref={input} type="file" className="sr-only" accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.tsv,.txt,.xlsx,.xls,.ods" onChange={(e) => e.target.files?.[0] && void handle(e.target.files[0])} />
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="primary" icon={<FileUp className="size-4" />} onClick={() => input.current?.click()}>
                {t('achats.import.choose')}
              </Button>
              <Button icon={<PenLine className="size-4" />} onClick={() => setDraft(emptyDraft(siteId, today(), org.defaultVatRate))}>
                {t('achats.import.manual')}
              </Button>
            </div>
          </>
        )}
      </Card>
      {error && (
        <p role="alert" className="mt-4 rounded-lg bg-bad/10 px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
      <p className="mt-4 text-xs text-muted">{t('achats.import.privacy')}</p>
    </div>
  );
}
