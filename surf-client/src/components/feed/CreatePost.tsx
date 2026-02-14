import { useState, useRef } from 'react';
import { useAuthStore } from '../../stores/authStore';
import { api } from '../../lib/api';

export default function CreatePost() {
  const { user } = useAuthStore();
  const [content, setContent] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'friends'>('public');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await api.post('/posts', { content: content.trim(), mediaUrls: [] });
      setContent('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      window.location.reload(); // Simple refresh for now
    } catch (error) {
      console.error('Failed to create post:', error);
      alert('Không thể đăng bài. Vui lòng thử lại!');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  return (
    <div className={`bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 mb-6 transition-all duration-300 ${
      isFocused ? 'ring-2 ring-cyan-500/50 shadow-lg shadow-cyan-500/20' : 'shadow-lg'
    }`}>
      <form onSubmit={handleSubmit}>
        <div className="flex gap-3 mb-4">
          <img 
            src={user?.photoURL || 'https://via.placeholder.com/40'} 
            alt={user?.displayName || 'User'} 
            className="w-10 h-10 rounded-full ring-2 ring-slate-700"
          />
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextareaChange}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Bạn đang nghĩ gì?"
            className="flex-1 bg-slate-900/50 text-gray-100 placeholder-gray-500 rounded-xl px-4 py-3 resize-none focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all min-h-[60px] max-h-[300px]"
            rows={1}
          />
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-gray-300 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="text-sm">Ảnh/Video</span>
            </button>

            <select
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value as 'public' | 'friends')}
              className="px-4 py-2 rounded-lg bg-slate-700/50 hover:bg-slate-700 text-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/50 transition-all cursor-pointer"
            >
              <option value="public">🌐 Công khai</option>
              <option value="friends">👥 Bạn bè</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={!content.trim() || isSubmitting}
            className={`px-6 py-2.5 rounded-lg font-medium transition-all ${
              !content.trim() || isSubmitting
                ? 'bg-slate-700 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-white shadow-lg shadow-cyan-500/30 hover:shadow-cyan-500/50'
            }`}
          >
            {isSubmitting ? 'Đang đăng...' : 'Đăng bài'}
          </button>
        </div>
      </form>
    </div>
  );
}
