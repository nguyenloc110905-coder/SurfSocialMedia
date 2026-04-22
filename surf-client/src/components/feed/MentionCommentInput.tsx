import { useCallback, useEffect, useMemo, useState } from 'react';
import { MentionsInput, Mention, SuggestionDataItem } from 'react-mentions';
import { api } from '../../lib/api';
import { useThemeStore } from '../../stores/themeStore';

interface Friend extends SuggestionDataItem {
  id: string;
  display: string;
  photoURL?: string | null;
}

interface MentionCommentInputProps {
  value: string;
  onChange: (value: string) => void;
  onClearError?: () => void;
  onSubmit: () => void;
  disabled?: boolean;
  placeholder?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
  size?: 'sm' | 'md';
  autoFocus?: boolean;
  onKeyDown?: (e: React.KeyboardEvent) => void;
}

export default function MentionCommentInput({
  value,
  onChange,
  onClearError,
  onSubmit,
  disabled,
  placeholder = 'Viết bình luận của bạn...',
  inputRef,
  size = 'md',
  autoFocus,
  onKeyDown,
}: MentionCommentInputProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const theme = useThemeStore((s) => s.theme);
  const isDark = useMemo(() => {
    if (theme === 'dark') return true;
    if (theme === 'system' && typeof window !== 'undefined')
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    return false;
  }, [theme]);

  useEffect(() => {
    api
      .get<{ friends: { id: string; name: string; avatarUrl?: string }[] }>('/api/friends')
      .then((res) => {
        setFriends(
          (res.friends ?? []).map((f) => ({
            id: f.id,
            display: f.name,
            photoURL: f.avatarUrl ?? null,
          }))
        );
      })
      .catch(() => {});
  }, []);

  const queryFriends = useCallback(
    (query: string, callback: (data: SuggestionDataItem[]) => void) => {
      const filtered = friends
        .filter((f) => f.display.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 8);
      callback(filtered);
    },
    [friends]
  );

  const handleChange = (_: unknown, newValue: string) => {
    onChange(newValue);
    onClearError?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    onKeyDown?.(e);
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  const renderSuggestion = (entry: SuggestionDataItem) => {
    const f = entry as Friend;
    return (
      <div className="flex items-center gap-2 px-3 py-2 cursor-pointer">
        {f.photoURL ? (
          <img
            src={f.photoURL}
            alt={f.display}
            className="w-7 h-7 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-7 h-7 rounded-full flex-shrink-0 bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center">
            <span className="text-xs font-bold text-white">
              {(f.display || 'S').charAt(0).toUpperCase()}
            </span>
          </div>
        )}
        <span className="text-sm truncate">{f.display}</span>
      </div>
    );
  };

  const isSm = size === 'sm';

  return (
    <MentionsInput
      value={value}
      onChange={handleChange}
      onKeyDown={handleKeyDown}
      disabled={disabled}
      placeholder={placeholder}
      inputRef={inputRef as unknown as React.RefObject<HTMLInputElement>}
      allowSuggestionsAboveCursor
      a11ySuggestionsListLabel="Gợi ý bạn bè"
      autoFocus={autoFocus}
      classNames={{
        control: 'mc-control',
        highlighter: isSm ? 'mc-highlighter mc-highlighter--sm' : 'mc-highlighter',
        input: isSm ? 'mc-input mc-input--sm' : 'mc-input',
        suggestions: {
          list: 'mc-suggestions-list',
          item: 'mc-suggestions-item',
        },
      }}
      style={{
        control: { width: '100%' },
        suggestions: {
          list: {
            backgroundColor: isDark ? '#1e293b' : '#ffffff',
            border: isDark ? '1px solid #334155' : '1px solid #e5e7eb',
            borderRadius: '12px',
            boxShadow: isDark ? '0 4px 20px rgba(0,0,0,0.35)' : '0 4px 20px rgba(0,0,0,0.12)',
            overflow: 'hidden',
            maxHeight: '200px',
            minWidth: '200px',
            zIndex: 100,
          },
          item: {
            color: isDark ? '#f1f5f9' : '#1f2937',
          },
        },
      }}
    >
      <Mention
        trigger="@"
        data={queryFriends}
        renderSuggestion={renderSuggestion}
        displayTransform={(_id: string, display: string) => `@${display}`}
        style={{ backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: '4px', padding: '0 2px' }}
        appendSpaceOnAdd
      />
    </MentionsInput>
  );
}
