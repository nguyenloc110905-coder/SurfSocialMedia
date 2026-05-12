import React from 'react';
import { Link } from 'react-router-dom';

/** Extract hashtags from content: returns unique array without # */
export function extractHashtags(content: string): string[] {
  const regex = /#([a-zA-Z0-9_\u00C0-\u1EF9-]+)/g;
  const matches = content.match(regex);
  if (!matches) return [];
  const unique = new Set(matches.map((m) => m.slice(1).toLowerCase()));
  return Array.from(unique);
}

/** Renders post content with clickable hashtags and mention support */
export function renderPostContent(
  content: string,
  options: { onHashtagClick?: (tag: string) => void; maxLength?: number } = {}
): React.ReactNode {
  const { onHashtagClick, maxLength } = options;
  
  // Truncate if needed
  const text = maxLength && content.length > maxLength 
    ? content.slice(0, maxLength) + '…' 
    : content;

  // Combined regex for mentions and hashtags
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const hashtagRegex = /#([a-zA-Z0-9_\u00C0-\u1EF9-]+)/g;
  
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  
  // Build a list of all matches (both mentions and hashtags)
  type Match = {
    index: number;
    length: number;
    type: 'mention' | 'hashtag';
    display: string;
    value: string;
  };
  
  const matches: Match[] = [];
  
  // Find mentions
  let m: RegExpExecArray | null;
  const mentionRegexCopy = new RegExp(mentionRegex.source, 'g');
  while ((m = mentionRegexCopy.exec(text)) !== null) {
    matches.push({
      index: m.index,
      length: m[0].length,
      type: 'mention',
      display: m[1],
      value: m[2],
    });
  }
  
  // Find hashtags
  let h: RegExpExecArray | null;
  const hashtagRegexCopy = new RegExp(hashtagRegex.source, 'g');
  while ((h = hashtagRegexCopy.exec(text)) !== null) {
    matches.push({
      index: h.index,
      length: h[0].length,
      type: 'hashtag',
      display: h[1],
      value: h[1],
    });
  }
  
  // Sort by index
  matches.sort((a, b) => a.index - b.index);
  
  // Build React nodes
  for (const match of matches) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    
    if (match.type === 'mention') {
      parts.push(
        React.createElement(
          Link,
          {
            key: `mention-${match.value}-${match.index}`,
            to: `/feed/profile/${match.value}`,
            className: 'text-cyan-500 font-medium hover:underline',
          },
          `@${match.display}`
        )
      );
    } else {
      const tag = match.value;
      const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (onHashtagClick) {
          onHashtagClick(tag);
        }
      };
      
      if (onHashtagClick) {
        parts.push(
          React.createElement(
            'button',
            {
              key: `hashtag-${tag}-${match.index}`,
              onClick: handleClick,
              className: 'text-cyan-500 font-medium hover:underline',
            },
            `#${tag}`
          )
        );
      } else {
        parts.push(
          React.createElement(
            Link,
            {
              key: `hashtag-${tag}-${match.index}`,
              to: `/feed/hashtag/${tag}`,
              className: 'text-cyan-500 font-medium hover:underline',
            },
            `#${tag}`
          )
        );
      }
    }
    
    lastIndex = match.index + match.length;
  }
  
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  
  return React.createElement(React.Fragment, null, ...parts);
}
