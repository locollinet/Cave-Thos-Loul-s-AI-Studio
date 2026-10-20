import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Check, Copy, Download, Globe, GlobeLock } from 'lucide-react';
import { useT } from '@/i18n';
import { Badge, Button, Card, Input, useToast } from '@/ui';
import { publicUrl } from './publish';
import type { WineList } from './types';

interface Props {
  list: WineList;
  busy: boolean;
  onPublish: () => void;
  onUnpublish: () => void;
}

export function PublishPanel({ list, busy, onPublish, onUnpublish }: Props) {
  const t = useT();
  const { toast } = useToast();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const url = list.published && list.publicId ? publicUrl(list.publicId) : '';

  useEffect(() => {
    if (!url) {
      setQr('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(url, { width: 640, margin: 2, errorCorrectionLevel: 'M' })
      .then((d) => !cancelled && setQr(d))
      .catch(() => !cancelled && setQr(''));
    return () => {
      cancelled = true;
    };
  }, [url]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast(t('common.error'), 'bad');
    }
  };

  const download = () => {
    const a = document.createElement('a');
    a.href = qr;
    a.download = `qr-${list.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase() || 'carte'}.png`;
    a.click();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge tone={list.published ? 'ok' : 'neutral'}>{list.published ? t('carte.pub.online') : t('carte.pub.offline')}</Badge>
        <p className="text-sm text-muted">{t(list.published ? 'carte.pub.onlineHint' : 'carte.pub.offlineHint')}</p>
      </div>
      {list.published ? (
        <Card className="space-y-4 p-4">
          <div className="flex gap-2">
            <Input readOnly value={url} aria-label={t('carte.pub.link')} onFocus={(e) => e.currentTarget.select()} />
            <Button onClick={copy} icon={copied ? <Check className="size-4" /> : <Copy className="size-4" />}>
              {copied ? t('carte.pub.copied') : t('carte.pub.copy')}
            </Button>
          </div>
          {qr && (
            <div className="flex flex-wrap items-center gap-4">
              <img src={qr} alt={t('carte.pub.qrAlt')} className="size-40 rounded-lg border border-border bg-white p-1" />
              <div className="space-y-2">
                <Button icon={<Download className="size-4" />} onClick={download}>
                  {t('carte.pub.downloadQr')}
                </Button>
                <p className="max-w-xs text-xs text-muted">{t('carte.pub.qrHint')}</p>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={busy} onClick={onPublish} icon={<Globe className="size-4" />}>
              {t('carte.pub.update')}
            </Button>
            <a className="inline-flex h-10 items-center rounded-lg border border-border px-4 text-sm font-medium hover:bg-surface-2" href={url} target="_blank" rel="noreferrer">
              {t('carte.pub.open')}
            </a>
            <Button variant="danger" loading={busy} onClick={onUnpublish} icon={<GlobeLock className="size-4" />}>
              {t('carte.pub.unpublish')}
            </Button>
          </div>
        </Card>
      ) : (
        <Button variant="primary" size="lg" loading={busy} onClick={onPublish} icon={<Globe className="size-4" />}>
          {t('carte.pub.publish')}
        </Button>
      )}
      <p className="text-xs text-muted">{t('carte.pub.privacy')}</p>
    </div>
  );
}
