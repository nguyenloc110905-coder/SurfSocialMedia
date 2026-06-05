import { useState, useRef, useEffect, type FormEvent } from 'react';
import { api } from '../../lib/api';

interface Message {
  role: 'user' | 'model';
  text: string;
}

export default function AIChatPanel({ onClose }: { onClose: () => void }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 50);

    api.get<{ messages: Message[] }>('/api/ai-chat/history')
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        } else {
          setMessages([{ role: 'model', text: 'Chào bạn! Mình là trợ lý AI Surf. Mình có thể giúp gì cho bạn hôm nay?' }]);
        }
      })
      .catch((err) => {
        console.error('Failed to load AI history:', err);
        setMessages([{ role: 'model', text: 'Chào bạn! Mình là trợ lý AI Surf. Mình có thể giúp gì cho bạn hôm nay?' }]);
      });
  }, []);

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft.trim() || loading) return;

    const text = draft.trim();
    setDraft('');
    setMessages((prev) => [...prev, { role: 'user', text }]);
    setLoading(true);

    try {
      const { text: responseText } = await api.post<{ text: string }>('/api/ai-chat', {
        message: text,
        history: messages,
      });

      setMessages((prev) => [...prev, { role: 'model', text: responseText }]);
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages((prev) => [
        ...prev,
        { role: 'model', text: 'Xin lỗi, đã xảy ra lỗi. Vui lòng thử lại sau.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-[360px] bg-white/95 dark:bg-slate-800/95 backdrop-blur-md rounded-2xl border border-gray-200/60 dark:border-slate-700/60 shadow-xl shadow-black/10 flex flex-col h-[calc(100vh-84px)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-slate-700/50 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center shadow-sm">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white leading-none">Surf AI</h3>
            <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Trợ lý thông minh</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-white/50 dark:hover:bg-slate-700/50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide bg-gray-50/50 dark:bg-slate-900/20">
        {messages.map((msg, idx) => {
          const isUser = msg.role === 'user';
          return (
            <div key={idx} className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-relaxed shadow-sm ${
                  isUser
                    ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white rounded-br-sm'
                    : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-200 border border-gray-100 dark:border-slate-600 rounded-bl-sm'
                }`}
              >
                <div className="whitespace-pre-wrap word-break-words">{msg.text}</div>
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-white dark:bg-slate-700 border border-gray-100 dark:border-slate-600 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                <span className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 bg-white dark:bg-slate-800 border-t border-gray-100 dark:border-slate-700/50 flex-shrink-0">
        <form onSubmit={handleSend} className="relative flex items-center">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Hỏi Surf AI..."
            className="w-full bg-gray-100 dark:bg-slate-700/50 text-sm text-gray-900 dark:text-white rounded-full pl-4 pr-10 py-2.5 focus:outline-none focus:ring-2 focus:ring-purple-500/50 placeholder-gray-400 border border-transparent dark:border-slate-600/50 transition-all"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={!draft.trim() || loading}
            className="absolute right-1.5 p-1.5 text-purple-500 hover:text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-full transition-colors disabled:opacity-40"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
          </button>
        </form>
      </div>
    </div>
  );
}
