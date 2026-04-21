import { useCallback, useEffect, useState } from 'react';
import { MentionsInput, Mention, SuggestionDataItem } from 'react-mentions';
import { api } from '../../lib/api';

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
      style={{ control: { width: '100%' } }}
    >
      <Mention
        trigger="@"
        data={queryFriends}
        renderSuggestion={renderSuggestion}
        displayTransform={(_id: string, display: string) => `@${display}`}
        style={{ backgroundColor: 'rgba(6,182,212,0.15)', borderRadius: '4px', padding: '0 2px' }}
        appendSpaceOnAdd
      />
    </MentionsInput>
  );
}
