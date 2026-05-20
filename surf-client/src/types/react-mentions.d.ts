declare module 'react-mentions' {
  import type { ComponentType, CSSProperties, KeyboardEventHandler, ReactNode, Ref } from 'react';

  export interface SuggestionDataItem {
    id: string | number;
    display?: string;
    [key: string]: unknown;
  }

  type MentionDataProvider =
    | SuggestionDataItem[]
    | ((query: string, callback: (data: SuggestionDataItem[]) => void) => void);

  export interface MentionsInputProps {
    value?: string;
    onChange?: (
      event: unknown,
      newValue: string,
      newPlainTextValue: string,
      mentions: SuggestionDataItem[]
    ) => void;
    onKeyDown?: KeyboardEventHandler;
    disabled?: boolean;
    placeholder?: string;
    inputRef?: Ref<HTMLInputElement | HTMLTextAreaElement>;
    allowSuggestionsAboveCursor?: boolean;
    a11ySuggestionsListLabel?: string;
    autoFocus?: boolean;
    classNames?: unknown;
    style?: unknown;
    children?: ReactNode;
  }

  export interface MentionProps {
    trigger: string | RegExp;
    data: MentionDataProvider;
    renderSuggestion?: (
      suggestion: SuggestionDataItem,
      search: string,
      highlightedDisplay: ReactNode,
      index: number,
      focused: boolean
    ) => ReactNode;
    displayTransform?: (id: string, display: string) => string;
    style?: CSSProperties;
    appendSpaceOnAdd?: boolean;
  }

  export const MentionsInput: ComponentType<MentionsInputProps>;
  export const Mention: ComponentType<MentionProps>;
}
