import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, Printer } from 'lucide-react';
import { useCollection, useOrg } from '@/app/org';
import { useT } from '@/i18n';
import type { Movement } from '@/types';
import { Badge, Button, EmptyState, Segmented, Select, Spinner, Tabs, useToast } from '@/ui';
import { downloadBlob, toCsv } from '@/lib/utils';
import { buildListSections, countWines, listToCsvRows, toPublicDoc } from './build';
import { LANG_NAMES, offeredLanguages, type ContentLang } from './content';
import { localizeDoc } from './translate';
import { computeSuggestions } from './suggestions';
import { SuggestionsPanel } from './SuggestionsPanel';
import { listOp, publishOps, unpublishOps } from './publish';
import type { WineList } from './types';
import { ListView, PRINT_CSS } from './ListView';
import { SettingsPanel } from './SettingsPanel';
import { WinesPanel } from './WinesPanel';
import { PublishPanel } from './PublishPanel';
import { AiPanel } from './AiPanel';
import { DesignPanel } from './DesignPanel';

type PanelTab = 'settings' | 'design' | 'wines' | 'publish' | 'ai';
type SaveState = 'idle' | 'saving' | 'saved';

export default function Editor() {
  const { id } = useParams();
  const t = useT();
  const { rows, loading } = useCollection<WineList>('wineLists');
  const stored = rows.find((l) => l.id === id);
  if (loading) return <div className="grid min-h-[40dvh] place-items-center"><Spinner className="size-7" /></div>;
  if (!stored) {
    return (
      <EmptyState
        title={t('carte.notFound')}
        action={
          <Link to="/carte" className="text-sm font-medium text-brand">
            {t('common.back')}
          </Link>
        }
      />
    );
  }
  return <EditorInner key={stored.id} initial={stored} />;
}

function EditorInner({ initial }: { initial: WineList }) {
  const t = useT();
  const { toast } = useToast();
  const { org, orgId, sites, wines, stock, commit } = useOrg();
  const [draft, setDraft] = useState<WineList>(initial);
  const [panel, setPanel] = useState<PanelTab>('settings');
  const [winesView, setWinesView] = useState<'all' | 'suggest'>('all');
  const [view, setView] = useState<'settings' | 'preview'>('preview');
  const [save, setSave] = useState<SaveState>('idle');
  const [busy, setBusy] = useState(false);
  const [previewLang, setPreviewLang] = useState<ContentLang>(initial.language);
  const { rows: movements } = useCollection<Movement>('movements', { orderBy: ['createdAt', 'desc'], limit: 3000 });

  const sections = useMemo(() => buildListSections(draft, wines, stock, org), [draft, wines, stock, org]);
  const doc = useMemo(() => toPublicDoc(draft, sections, org, draft.updatedAt), [draft, sections, org]);
  const count = countWines(sections);
  const previewLangs = offeredLanguages(draft.languages);
  const shownLang = previewLangs.includes(previewLang) ? previewLang : draft.language;
  const previewDoc = useMemo(() => localizeDoc(doc, shownLang), [doc, shownLang]);
  const suggestions = useMemo(
    () => computeSuggestions({ list: draft, wines, stock, movements, sections, vatRate: org.defaultVatRate }),
    [draft, wines, stock, movements, sections, org.defaultVatRate],
  );

  const saved = useRef(JSON.stringify(initial));
  const latest = useRef({ draft, sections, org });
  latest.current = { draft, sections, org };

  const persist = useCallback(
    async (d: WineList) => {
      const { sections: s, org: o } = latest.current;
      const now = Date.now();
      await commit(d.published ? publishOps(orgId, o, d, s, now).ops : [listOp(orgId, { ...d, updatedAt: now })]);
    },
    [commit, orgId],
  );

  useEffect(() => {
    const json = JSON.stringify(draft);
    if (json === saved.current) return;
    setSave('saving');
    const timer = setTimeout(() => {
      persist(draft)
        .then(() => {
          saved.current = json;
          setSave('saved');
        })
        .catch((e: Error) => {
          setSave('idle');
          toast(e.message, 'bad');
        });
    }, 700);
    return () => clearTimeout(timer);
  }, [draft, persist, toast]);

  useEffect(
    () => () => {
      const d = latest.current.draft;
      if (JSON.stringify(d) !== saved.current) void persist(d);
    },
    [persist],
  );

  const patch = (p: Partial<WineList>) => setDraft((d) => ({ ...d, ...p }));

  const publish = async () => {
    setBusy(true);
    try {
      const res = publishOps(orgId, org, draft, sections);
      await commit(res.ops);
      saved.current = JSON.stringify(res.list);
      setDraft(res.list);
      toast(t('carte.pub.done'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const unpublish = async () => {
    setBusy(true);
    try {
      await commit(unpublishOps(orgId, draft));
      const next = { ...draft, published: false };
      saved.current = JSON.stringify(next);
      setDraft(next);
      toast(t('carte.pub.removed'));
    } catch (e) {
      toast(e instanceof Error ? e.message : t('common.error'), 'bad');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => downloadBlob(`${draft.name || 'carte'}.csv`, toCsv(listToCsvRows(sections)), 'text/csv;charset=utf-8');

  return (
    <div>
      <style>{PRINT_CSS}</style>
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Link to="/carte" aria-label={t('common.back')} className="rounded-lg p-2 text-muted hover:bg-surface-2">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="truncate font-display text-xl font-semibold md:text-2xl">{draft.name || t('carte.untitled')}</h1>
          {draft.published && <Badge tone="ok">{t('carte.pub.online')}</Badge>}
          <span className="text-xs text-muted" aria-live="polite">
            {save === 'saving' ? t('carte.saving') : save === 'saved' ? t('common.saved') : ''}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<FileSpreadsheet className="size-4" />} onClick={exportCsv} disabled={!count}>
            CSV
          </Button>
          <Button size="sm" icon={<Printer className="size-4" />} onClick={() => window.print()} disabled={!count}>
            {t('carte.printPdf')}
          </Button>
        </div>
      </div>

      <div className="no-print mb-3 lg:hidden">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: 'preview', label: t('carte.view.preview') },
            { value: 'settings', label: t('carte.view.settings') },
          ]}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <div className={`no-print ${view === 'settings' ? '' : 'hidden'} lg:block`}>
          <Tabs
            value={panel}
            onChange={setPanel}
            tabs={[
              { value: 'settings', label: t('carte.tab.settings') },
              { value: 'design', label: t('carte.tab.design') },
              { value: 'wines', label: t('carte.tab.wines'), count: count },
              { value: 'publish', label: t('carte.tab.publish') },
              { value: 'ai', label: t('carte.tab.ai') },
            ]}
          />
          {panel === 'settings' && <SettingsPanel list={draft} sites={sites} sections={sections} doc={doc} onChange={patch} />}
          {panel === 'design' && <DesignPanel list={draft} onChange={patch} />}
          {panel === 'wines' && (
            <div className="space-y-4">
              <Segmented
                value={winesView}
                onChange={setWinesView}
                options={[
                  { value: 'all', label: t('carte.wines.all') },
                  {
                    value: 'suggest',
                    label: (
                      <span className="inline-flex items-center gap-1.5">
                        {t('carte.tab.suggest')}
                        {suggestions.length > 0 && <span className="rounded-full bg-brand px-1.5 text-[11px] leading-[18px] text-brand-fg">{suggestions.length}</span>}
                      </span>
                    ),
                  },
                ]}
              />
              {winesView === 'all' ? (
                <WinesPanel list={draft} wines={wines} stock={stock} sections={sections} vatRate={org.defaultVatRate} onChange={patch} />
              ) : (
                <SuggestionsPanel list={draft} suggestions={suggestions} onChange={patch} />
              )}
            </div>
          )}
          {panel === 'publish' && <PublishPanel list={draft} busy={busy} onPublish={publish} onUnpublish={unpublish} />}
          {panel === 'ai' && <AiPanel sections={sections} language={draft.language} />}
        </div>
        <div className={`${view === 'preview' ? '' : 'hidden'} lg:block`}>
          {count === 0 ? (
            <EmptyState title={t('carte.preview.empty')} hint={t('carte.preview.emptyHint')} />
          ) : (
            <>
              <div className="no-print mb-3 flex items-center justify-end gap-2">
                <label htmlFor="carte-preview-lang" className="text-xs text-muted">
                  {t('carte.lang.preview')}
                </label>
                <Select id="carte-preview-lang" className="!h-8 w-auto text-xs" value={shownLang} onChange={(e) => setPreviewLang(e.target.value as ContentLang)}>
                  {previewLangs.map((l) => (
                    <option key={l} value={l}>
                      {LANG_NAMES[l]}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="print-area overflow-hidden rounded-xl border border-border shadow-sm">
                <ListView doc={previewDoc} lang={shownLang} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
