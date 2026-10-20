import { useT } from '@/i18n';
import { Select } from '@/ui';
import { yearOptions } from './useCompta';

export default function YearSelect({ value, onChange }: { value: number; onChange: (y: number) => void }) {
  const t = useT();
  return (
    <Select aria-label={t('compta.year')} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-28">
      {yearOptions().map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </Select>
  );
}

export function Disclaimer({ text }: { text: string }) {
  return (
    <p role="note" className="mb-4 rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">
      {text}
    </p>
  );
}
