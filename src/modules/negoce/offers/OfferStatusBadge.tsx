import { Badge } from '@/ui';
import { useT } from '@/i18n';
import type { OfferStatus } from './types';

const TONE: Record<OfferStatus, 'neutral' | 'info' | 'ok' | 'bad' | 'warn'> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'ok',
  declined: 'bad',
  expired: 'warn',
};

export default function OfferStatusBadge({ status }: { status: OfferStatus }) {
  const t = useT();
  return <Badge tone={TONE[status]}>{t(`offer.status.${status}`)}</Badge>;
}
