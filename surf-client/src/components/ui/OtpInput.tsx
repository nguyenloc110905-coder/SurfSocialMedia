import { useRef, KeyboardEvent, ClipboardEvent } from 'react';

interface Props {
  value: string;
  onChange: (v: string) => void;
  length?: number;
  disabled?: boolean;
}

export default function OtpInput({ value, onChange, length = 6, disabled }: Props) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = value.padEnd(length, '').slice(0, length).split('');

  function handleChange(i: number, char: string) {
    const d = char.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = d;
    onChange(next.join('').replace(/\s+$/, ''));
    if (d && i < length - 1) refs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Backspace') {
      if (!digits[i] && i > 0) {
        refs.current[i - 1]?.focus();
      } else {
        const next = [...digits];
        next[i] = '';
        onChange(next.join('').replace(/\s+$/, ''));
      }
    } else if (e.key === 'ArrowLeft' && i > 0) {
      refs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < length - 1) {
      refs.current[i + 1]?.focus();
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    onChange(pasted);
    const focusIdx = Math.min(pasted.length, length - 1);
    refs.current[focusIdx]?.focus();
  }

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digits[i] ?? ''}
          disabled={disabled}
          autoComplete="one-time-code"
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onFocus={(e) => e.target.select()}
          onPaste={handlePaste}
          className="w-11 h-13 text-center text-xl font-bold rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-surf-primary dark:focus:border-surf-secondary disabled:opacity-50 transition-colors"
        />
      ))}
    </div>
  );
}
