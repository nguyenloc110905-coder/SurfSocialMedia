import { useState, useEffect, useMemo, useRef } from 'react';
import { SETTINGS_DETAIL_SECTIONS, SettingsIcon } from '@/lib/settings-data.tsx';

function normalizeSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '');
}

function matchesQuery(text: string, queryNorm: string): boolean {
  if (!queryNorm) return true;
  return normalizeSearch(text).includes(queryNorm);
}

interface SettingsSearchProps {
  onSelectDetail: (key: string | null) => void;
}

export default function SettingsSearch({ onSelectDetail }: SettingsSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const searchSuggestions = useMemo(() => {
    const q = searchQuery.trim();
    const qNorm = normalizeSearch(q);
    if (!qNorm) return [];

    const out: { type: 'section' | 'item'; sectionTitle: string; label?: string; icon?: string; key?: string }[] = [];
    for (const section of SETTINGS_DETAIL_SECTIONS) {
      const sectionMatch = matchesQuery(section.title, qNorm) || (section.subtitle && matchesQuery(section.subtitle, qNorm));
      if (sectionMatch) {
        out.push({ type: 'section', sectionTitle: section.title });
      }
      for (const item of section.items) {
        if (matchesQuery(item.label, qNorm)) {
          out.push({ type: 'item', sectionTitle: section.title, label: item.label, icon: item.icon, key: item.key });
        }
      }
    }
    return out.slice(0, 25);
  }, [searchQuery]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelectSuggestion = (entry: { type: 'section' | 'item'; sectionTitle: string; label?: string; key?: string }) => {
    if (entry.type === 'item' && entry.key) {
      onSelectDetail(entry.key);
    }
    setSearchQuery('');
    setSearchFocused(false);
  };

  return (
    <div className="relative" ref={searchContainerRef}>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" viewBox="0 0 24 24" fill="currentColor">
        <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
      </svg>
      <input
        type="text"
        placeholder="Tìm kiếm cài đặt"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        onFocus={() => setSearchFocused(true)}
        className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 border-0 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-500 focus:ring-2 focus:ring-surf-primary/40 focus:ring-offset-0 transition-shadow"
      />
      {searchFocused && searchQuery.trim().length > 0 && (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-surf-card shadow-lg scrollbar-hide">
          {searchSuggestions.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">Không tìm thấy cài đặt phù hợp</p>
          ) : (
            <ul className="py-1">
              {searchSuggestions.map((entry, i) => (
                <li key={entry.type === 'section' ? entry.sectionTitle : `${entry.sectionTitle}-${entry.label}-${i}`}>
                  <button
                    type="button"
                    onClick={() => handleSelectSuggestion(entry)}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surf-primary/10 dark:hover:bg-surf-primary/20 transition-colors"
                  >
                    {entry.type === 'item' && entry.icon && (
                      <span className="flex-shrink-0 [&_svg]:w-5 [&_svg]:h-5 [&_svg]:!text-surf-primary dark:[&_svg]:!text-surf-secondary">
                        <SettingsIcon name={entry.icon} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-slate-800 dark:text-slate-100">
                        {entry.type === 'section' ? entry.sectionTitle : entry.label}
                      </span>
                      {entry.type === 'item' && (
                        <span className="block text-xs text-slate-500 dark:text-slate-400">{entry.sectionTitle}</span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
