import type React from 'react';

/* -- Avatar ---------------------------------------------------------------- */
export function Avatar({ url, name, size = 'md' }: { url?: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const dim = size === 'lg' ? 'w-16 h-16 text-lg' : size === 'sm' ? 'w-9 h-9 text-xs' : 'w-12 h-12 text-sm';
  const initials = (() => {
    const w = (name || 'S').split(' ');
    return w.length >= 2 ? (w[0][0] + w[w.length - 1][0]).toUpperCase() : (name[0] || 'S').toUpperCase();
  })();
  return url ? (
    <img src={url} alt={name} className={`${dim} rounded-2xl object-cover flex-shrink-0 ring-2 ring-white/20`} />
  ) : (
    <span className={`${dim} rounded-2xl flex-shrink-0 flex items-center justify-center font-bold text-white bg-gradient-to-br from-surf-primary to-surf-secondary ring-2 ring-white/20`}>
      {initials}
    </span>
  );
}

/* -- Empty state ----------------------------------------------------------- */
export function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center gap-4">
      <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-surf-primary/15 to-surf-secondary/15 flex items-center justify-center text-surf-primary">
        {icon}
      </div>
      <div>
        <p className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{title}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{desc}</p>
      </div>
    </div>
  );
}

/* -- Spinner --------------------------------------------------------------- */
export function Spinner() {
  return <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin inline-block" />;
}

/* -- Card ------------------------------------------------------------------ */
export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-900/70 border border-gray-200/60 dark:border-gray-700/50 rounded-3xl p-4 flex items-center gap-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 ${className}`}>
      {children}
    </div>
  );
}

/* -- Gradient button ------------------------------------------------------- */
export function GradBtn({
  onClick, disabled, children, variant = 'primary', className = '',
}: {
  onClick?: () => void; disabled?: boolean; children: React.ReactNode;
  variant?: 'primary' | 'ghost' | 'danger'; className?: string;
}) {
  const base = 'inline-flex items-center gap-1.5 px-4 h-9 rounded-2xl text-sm font-semibold transition-all disabled:opacity-50';
  const styles = {
    primary: 'bg-gradient-to-r from-surf-primary to-surf-secondary text-white shadow-sm hover:shadow-surf-primary/30 hover:scale-[1.02] active:scale-[0.98]',
    ghost:   'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700',
    danger:  'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100',
  };
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`${base} ${styles[variant]} ${className}`}>
      {children}
    </button>
  );
}
