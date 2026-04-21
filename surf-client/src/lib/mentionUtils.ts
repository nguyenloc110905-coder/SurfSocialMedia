import React from 'react';

/** Converts react-mentions markup "@[Name](uid)" → plain "@Name" */
export function markupToPlain(markup: string): string {
  return markup.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
}

/** Extracts [{uid, displayName}] from react-mentions markup (deduped by uid) */
export function extractMentions(markup: string): { uid: string; displayName: string }[] {
  const regex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const seen = new Set<string>();
  const out: { uid: string; displayName: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(markup)) !== null) {
    if (!seen.has(m[2])) {
      seen.add(m[2]);
      out.push({ displayName: m[1], uid: m[2] });
    }
  }
  return out;
}

/** Renders comment content: parses "@[Name](uid)" → cyan highlighted spans */
export function renderCommentContent(content: string): React.ReactNode {
  const regex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  if (!regex.test(content)) return content;
  regex.lastIndex = 0;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    parts.push(
      React.createElement(
        'span',
        { key: `${match[2]}-${match.index}`, className: 'text-cyan-500 font-medium' },
        `@${match[1]}`
      )
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) parts.push(content.slice(lastIndex));
  return React.createElement(React.Fragment, null, ...parts);
}
