import { Badge } from '@/ui';
import { useT } from '@/i18n';
import type { DocStatus } from './types';

const TONE: Record<DocStatus, 'neutral' | 'info' | 'ok' | 'brand' | 'bad'> = {
  draft: 'neutral',
  sent: 'info',
  accepted: 'ok',
  validated: 'brand',
  paid: 'ok',
  cancelled: 'bad',
};

export default function StatusBadge({ status, overdue }: { status: DocStatus; overdue?: boolean }) {
  const t = useT();
  return <Badge tone={overdue ? 'bad' : TONE[status]}>{overdue ? t('negoce.status.overdue') : t(`negoce.status.${status}`)}</Badge>;
}
