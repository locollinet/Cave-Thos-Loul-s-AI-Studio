import { useNavigate } from 'react-router-dom';
import { useOrg } from '@/app/org';
import { useT } from '@/i18n';
import { useToast } from '@/ui';
import { today } from '@/lib/utils';
import { wineLabel } from '@/lib/wine';
import { creditNoteFromInvoice, prefixFor, quoteToInvoice, stockShortages } from './calc';
import { buildValidationOps, convertQuoteOps, docPath, nextSeq, saveDocumentOps } from './ops';
import type { SaleDocument } from './types';
import { useSales } from './useSales';

export function useDocActions() {
  const { org, orgId, wines, stock, member, store, commit } = useOrg();
  const { docs, payments } = useSales();
  const { toast, confirm } = useToast();
  const t = useT();
  const navigate = useNavigate();
  const actor = { userId: member?.uid ?? '', userName: member?.name ?? '' };

  const fail = (e: unknown) => toast(e instanceof Error ? e.message : t('common.error'), 'bad');

  const validate = async (doc: SaleDocument): Promise<boolean> => {
    if (!doc.partnerId || !doc.lines.length) {
      toast(t('negoce.err.incomplete'), 'bad');
      return false;
    }
    const shortages = stockShortages(doc.type === 'invoice' ? doc.lines : [], stock, doc.siteId);
    const names = shortages.map((s) => {
      const w = wines.find((x) => x.id === s.wineId);
      return `${w ? wineLabel(w) : s.wineId} (${s.available}/${s.requested})`;
    });
    const ok = await confirm({
      title: t(doc.type === 'invoice' ? 'negoce.validate.invoiceTitle' : 'negoce.validate.creditTitle'),
      message: t('negoce.validate.msg') + (names.length ? `\n${t('negoce.validate.shortage')} ${names.join(', ')}` : ''),
      confirmLabel: t('negoce.validate'),
    });
    if (!ok) return false;
    try {
      const prefix = prefixFor(doc.type, org);
      const key = `${prefix}-${doc.date.slice(0, 4)}`;
      const seq = await store.getNextSequence(orgId, key);
      const related = doc.relatedDocumentId ? docs.find((d) => d.id === doc.relatedDocumentId) : undefined;
      const { doc: validated, ops } = buildValidationOps({ orgId, doc, prefix, seq, wines, actor, related, docs, payments, skipCounterOp: true });
      await commit(ops);
      toast(t('negoce.validated', { number: validated.number }));
      navigate(`/negoce/view/${validated.id}`);
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  };

  const convertToInvoice = async (quote: SaleDocument) => {
    try {
      const inv = quoteToInvoice(quote, { date: today(), userId: actor.userId });
      await commit(convertQuoteOps(orgId, quote, inv));
      toast(t('negoce.converted'));
      navigate(`/negoce/edit/${inv.id}`);
    } catch (e) {
      fail(e);
    }
  };

  const createCreditNote = async (inv: SaleDocument) => {
    try {
      const cn = creditNoteFromInvoice(inv, { date: today(), userId: actor.userId });
      await commit(saveDocumentOps(orgId, cn));
      navigate(`/negoce/edit/${cn.id}`);
    } catch (e) {
      fail(e);
    }
  };

  const setStatus = async (doc: SaleDocument, status: SaleDocument['status']) => {
    try {
      await commit([{ op: 'set', path: docPath(orgId, doc.id), data: { status }, merge: true }]);
    } catch (e) {
      fail(e);
    }
  };

  const remove = async (doc: SaleDocument) => {
    if (doc.status !== 'draft' && !(doc.type === 'quote' && doc.status !== 'accepted')) return;
    if (!(await confirm({ title: t('common.confirmDelete'), danger: true, confirmLabel: t('common.delete') }))) return;
    try {
      await commit([{ op: 'delete', path: docPath(orgId, doc.id) }]);
    } catch (e) {
      fail(e);
    }
  };

  return { validate, convertToInvoice, createCreditNote, setStatus, remove };
}

export const isLocked = (d: SaleDocument): boolean => (d.type === 'quote' ? d.status === 'accepted' : d.status !== 'draft');
