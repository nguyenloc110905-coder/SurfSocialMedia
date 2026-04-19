import { useCallback, useEffect, useRef, useState } from 'react';
import { musicStore, type TrackItem } from '../../lib/musicStore';
import { optimizeImageUrl } from '../../lib/image-cdn';

// ── Types ──────────────────────────────────────────────────────────────────
declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

interface YTPlayer {
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(videoId: string): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  getDuration(): number;
  getCurrentTime(): number;
  getPlayerState(): number;
  setVolume(vol: number): void;
  mute(): void;
  unMute(): void;
  destroy(): void;
}

type VideoItem = TrackItem;

// ── Helpers ────────────────────────────────────────────────────────────────
function formatTime(sec: number) {
  const s = Math.floor(sec);
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

function decodeHtml(html: string) {
  const txt = document.createElement('textarea');
  txt.innerHTML = html;
  return txt.value;
}

// ── Component ──────────────────────────────────────────────────────────────
export default function SurfMusicPlayer() {
  const playerRef = useRef<YTPlayer | null>(null);
  const playerContainerRef = useRef<HTMLDivElement>(null);
  const progressIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentRef = useRef<VideoItem | null>(null);
  const playVideoRef = useRef<((v: VideoItem) => void) | null>(null);

  const [queue, setQueue] = useState<VideoItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VideoItem[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [ytReady, setYtReady] = useState(false);
  const [playerReady, setPlayerReady] = useState(false);
  const [apiKeyMissing, setApiKeyMissing] = useState(false);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [, rerenderStore] = useState(0);
  const [addToPlaylistFor, setAddToPlaylistFor] = useState<string | null>(null);

  const current = queue[currentIndex] ?? null;
  currentRef.current = current;

  // ── Load YouTube IFrame API ──────────────────────────────────────────────
  useEffect(() => {
    if (window.YT?.Player) {
      setYtReady(true);
      return;
    }
    window.onYouTubeIframeAPIReady = () => setYtReady(true);
    if (!document.getElementById('yt-iframe-api')) {
      const script = document.createElement('script');
      script.id = 'yt-iframe-api';
      script.src = 'https://www.youtube.com/iframe_api';
      script.onerror = () => setApiKeyMissing(true); // YouTube blocked / DNS failure
      document.head.appendChild(script);
    }
  }, []);

  // ── Create / destroy YT.Player ───────────────────────────────────────────
  useEffect(() => {
    if (!ytReady || !playerContainerRef.current) return;
    setPlayerReady(false);
    if (playerRef.current) {
      playerRef.current.destroy();
      playerRef.current = null;
    }
    new window.YT.Player(playerContainerRef.current, {
      height: '0',
      width: '0',
      playerVars: { autoplay: 0, controls: 0, rel: 0, modestbranding: 1 },
      events: {
        onReady: (e: { target: YTPlayer }) => {
          playerRef.current = e.target;
          setPlayerReady(true);
        },
        onStateChange: (e: { data: number }) => {
          // 1 = playing, 2 = paused, 0 = ended
          if (e.data === 1) {
            setIsPlaying(true);
            setDuration(playerRef.current?.getDuration() ?? 0);
            if (currentRef.current) musicStore.addToHistory(currentRef.current);
          } else if (e.data === 2) {
            setIsPlaying(false);
          } else if (e.data === 0) {
            // Ended → play next
            handleNext();
          }
        },
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytReady]);

  // ── Progress polling ─────────────────────────────────────────────────────
  useEffect(() => {
    if (isPlaying) {
      progressIntervalRef.current = setInterval(() => {
        const t = playerRef.current?.getCurrentTime() ?? 0;
        setCurrentTime(t);
      }, 500);
    } else {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    }
    return () => {
      if (progressIntervalRef.current) clearInterval(progressIntervalRef.current);
    };
  }, [isPlaying]);

  // ── Load video when track changes ────────────────────────────────────────
  useEffect(() => {
    if (!current || !playerRef.current || !playerReady) return;
    playerRef.current.loadVideoById(current.id);
    setCurrentTime(0);
    setDuration(0);
    setIsPlaying(true);
  }, [currentIndex, current?.id, playerReady]);

  // ── Controls ─────────────────────────────────────────────────────────────
  const togglePlay = () => {
    if (!playerRef.current || !current) return;
    if (isPlaying) playerRef.current.pauseVideo();
    else playerRef.current.playVideo();
  };

  const handleNext = useCallback(() => {
    if (queue.length === 0) return;
    if (isShuffle) {
      let next = Math.floor(Math.random() * queue.length);
      if (queue.length > 1) while (next === currentIndex) next = Math.floor(Math.random() * queue.length);
      setCurrentIndex(next);
    } else {
      setCurrentIndex((i) => (i + 1) % queue.length);
    }
  }, [queue.length, isShuffle, currentIndex]);

  const handlePrev = () => {
    if (queue.length === 0) return;
    setCurrentIndex((i) => (i - 1 + queue.length) % queue.length);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const t = Number(e.target.value);
    playerRef.current?.seekTo(t, true);
    setCurrentTime(t);
  };

  const seek10 = (delta: number) => {
    const t = Math.max(0, (playerRef.current?.getCurrentTime() ?? 0) + delta);
    playerRef.current?.seekTo(t, true);
    setCurrentTime(t);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value);
    setVolume(v);
    if (v === 0) {
      playerRef.current?.mute();
      setIsMuted(true);
    } else {
      playerRef.current?.unMute();
      setIsMuted(false);
      playerRef.current?.setVolume(v);
    }
  };

  const toggleMute = () => {
    if (isMuted) {
      playerRef.current?.unMute();
      playerRef.current?.setVolume(volume || 80);
      setIsMuted(false);
    } else {
      playerRef.current?.mute();
      setIsMuted(true);
    }
  };

  // ── Search (direct YouTube Data API from browser) ────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string;
        if (!apiKey) { setApiKeyMissing(true); return; }
        const url = new URL('https://www.googleapis.com/youtube/v3/search');
        url.searchParams.set('part', 'snippet');
        url.searchParams.set('type', 'video');
        url.searchParams.set('videoCategoryId', '10');
        url.searchParams.set('q', searchQuery.trim());
        url.searchParams.set('maxResults', '8');
        url.searchParams.set('key', apiKey);
        const res = await fetch(url.toString());
        if (!res.ok) { setSearchResults([]); return; }
        const data = await res.json() as {
          items?: Array<{
            id: { videoId: string };
            snippet: { title: string; channelTitle: string; thumbnails: { high?: { url: string }; default?: { url: string } } };
          }>;
        };
        const videos: VideoItem[] = (data.items ?? []).map((item) => ({
          id: item.id.videoId,
          title: item.snippet.title,
          artist: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails.high?.url ?? item.snippet.thumbnails.default?.url ?? `https://img.youtube.com/vi/${item.id.videoId}/hqdefault.jpg`,
        }));
        setSearchResults(videos);
        setApiKeyMissing(false);
      } catch {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const playVideo = (video: VideoItem) => {
    const idx = queue.findIndex((v) => v.id === video.id);
    if (idx >= 0) {
      setCurrentIndex(idx);
    } else {
      const next = [...queue, video];
      setQueue(next);
      setCurrentIndex(next.length - 1);
    }
    setSearchQuery('');
    setAddToPlaylistFor(null);
  };
  playVideoRef.current = playVideo;

  // ── musicStore integrations ──────────────────────────────────────────────
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => musicStore.subscribe(() => rerenderStore((t) => t + 1)), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => musicStore.onPlayRequest((track) => { playVideoRef.current?.(track); }), []);
  // Play entire playlist: replace queue and start from first track
  useEffect(() => musicStore.onPlayPlaylistRequest((tracks) => {
    setQueue(tracks);
    setCurrentIndex(0);
    setSearchQuery('');
    setAddToPlaylistFor(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);
  // Close playlist dropdown on outside click
  useEffect(() => {
    if (!addToPlaylistFor) return;
    const handler = () => setAddToPlaylistFor(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [addToPlaylistFor]);

  const addToQueue = (video: VideoItem) => {
    if (!queue.find((v) => v.id === video.id)) {
      setQueue((q) => [...q, video]);
    }
  };

  const progress = duration > 0 ? currentTime / duration : 0;

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-0 min-w-0">
      {/* Hidden YT player mount point */}
      <div ref={playerContainerRef} className="absolute w-0 h-0 overflow-hidden pointer-events-none" />

      {/* ── Album art + disc ── */}
      <div
        className="relative w-full overflow-hidden rounded-xl"
        style={{ height: '116px' }}
      >
        {/* Blurred background */}
        {current ? (
          <div
            className="absolute inset-0 bg-cover bg-center scale-110"
            style={{
              backgroundImage: `url(${optimizeImageUrl(current.thumbnail)})`,
              filter: 'blur(16px) brightness(0.55)',
            }}
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900" />
        )}

        {/* Spinning disc */}
        <div className="relative flex items-center justify-center w-full h-full">
          <div
            className="rounded-full overflow-hidden border-4 border-white/20 shadow-2xl"
            style={{
              width: '88px',
              height: '88px',
              animation: isPlaying ? 'spin-disc 8s linear infinite' : undefined,
              animationPlayState: isPlaying ? 'running' : 'paused',
            }}
          >
            {current ? (
              <img
                src={optimizeImageUrl(current.thumbnail)}
                alt=""
                className="w-full h-full object-cover"
                draggable={false}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-cyan-600 to-blue-700 flex items-center justify-center">
                <svg className="w-8 h-8 text-white/60" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 3v10.55A4 4 0 1014 17V7h4V3h-6z" />
                </svg>
              </div>
            )}
            {/* Center hole */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-[20%] aspect-square rounded-full bg-gray-900/80 border-2 border-white/30" />
            </div>
          </div>
        </div>

        {/* Search toggle button removed — search bar always shown below */}
      </div>

      {/* ── Track info ── */}
      <div className="mt-1.5 px-1 min-w-0">
        {current ? (
          <div className="flex items-center gap-1 min-w-0">
            <div className="flex-1 min-w-0 text-center">
              <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                {decodeHtml(current.title)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {decodeHtml(current.artist)}
              </p>
            </div>
            <button
              onClick={() => musicStore.toggleFavorite(current)}
              className="flex-shrink-0 p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={musicStore.isFavorite(current.id) ? 'Bỏ yêu thích' : 'Yêu thích'}
            >
              <svg
                className={`w-4 h-4 transition-colors ${musicStore.isFavorite(current.id) ? 'text-red-500' : 'text-gray-400'}`}
                fill={musicStore.isFavorite(current.id) ? 'currentColor' : 'none'}
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            </button>
          </div>
        ) : (
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            {apiKeyMissing ? 'Chưa cấu hình YouTube API key' : 'Tìm bài hát để phát nhạc'}
          </p>
        )}
      </div>

      {/* ── Progress bar ── */}
      <div className="mt-1 px-1">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.5}
          value={currentTime}
          onChange={handleSeek}
          disabled={!current}
          className="w-full h-1 accent-cyan-500 cursor-pointer disabled:opacity-30"
          style={{ '--progress': `${progress * 100}%` } as React.CSSProperties}
        />
        <div className="flex justify-between text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* ── Controls ── */}
      <div className="flex items-center justify-between px-1 mt-0.5">
        {/* Shuffle */}
        <button
          onClick={() => setIsShuffle((s) => !s)}
          className={`p-1 rounded-full transition-colors ${isShuffle ? 'text-cyan-500' : 'text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300'}`}
          title="Ngẫu nhiên"
        >
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z" />
          </svg>
        </button>

        {/* -10s */}
        <button
          onClick={() => seek10(-10)}
          disabled={!current}
          className="p-1 rounded-full text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition-colors"
          title="Tua lại 10s"
        >
          <span className="text-[11px] font-bold leading-none select-none">-10</span>
        </button>

        {/* Prev */}
        <button
          onClick={handlePrev}
          disabled={queue.length === 0}
          className="p-1 rounded-full text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          disabled={!current}
          className="w-9 h-9 rounded-full bg-cyan-500 hover:bg-cyan-400 disabled:opacity-30 flex items-center justify-center text-white shadow transition-colors"
        >
          {isPlaying ? (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* Next */}
        <button
          onClick={handleNext}
          disabled={queue.length === 0}
          className="p-1 rounded-full text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zm2-8.14L11.03 12 8 14.14V9.86zM16 6h2v12h-2z" />
          </svg>
        </button>

        {/* +10s */}
        <button
          onClick={() => seek10(10)}
          disabled={!current}
          className="p-1 rounded-full text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white disabled:opacity-30 transition-colors"
          title="Tua tới 10s"
        >
          <span className="text-[11px] font-bold leading-none select-none">+10</span>
        </button>

        {/* Mute toggle */}
        <button
          onClick={toggleMute}
          className="p-1 rounded-full text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          title={isMuted ? 'Bật tiếng' : 'Tắt tiếng'}
        >
          {isMuted || volume === 0 ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73 4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
            </svg>
          )}
        </button>
      </div>

      {/* ── Volume slider ── */}
      <div className="flex items-center gap-1.5 px-1 mt-0.5">
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={isMuted ? 0 : volume}
          onChange={handleVolumeChange}
          className="flex-1 h-1 accent-cyan-500 cursor-pointer"
          title={`Âm lượng ${isMuted ? 0 : volume}%`}
        />
        <span className="text-[10px] text-gray-400 dark:text-gray-500 w-7 text-right tabular-nums">
          {isMuted ? 0 : volume}%
        </span>
      </div>

      {/* ── Search bar (always visible) ── */}
      <div className="mt-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm bài hát, nghệ sĩ..."
            className="w-full text-xs bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg pl-8 pr-8 py-2 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
          {isSearching ? (
            <span className="absolute right-2 top-1/2 -translate-y-1/2">
              <svg className="w-3.5 h-3.5 animate-spin text-gray-400" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </span>
          ) : searchQuery ? (
            <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </div>

        {apiKeyMissing && (
          <p className="text-[10px] text-amber-500 mt-1 px-1">Chưa cấu hình YOUTUBE_API_KEY trên server.</p>
        )}

        {searchResults.length > 0 && (
          <ul className="mt-1.5 space-y-1 max-h-44 overflow-y-auto scrollbar-hide">
            {searchResults.map((v) => (
              <li key={v.id} className="flex flex-col rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700/80 group">
                <div className="flex items-center gap-2 p-1.5 cursor-pointer" onClick={() => playVideo(v)}>
                  <img src={optimizeImageUrl(v.thumbnail)} alt="" className="w-9 h-9 rounded object-cover flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-gray-900 dark:text-white truncate leading-tight">{decodeHtml(v.title)}</p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">{decodeHtml(v.artist)}</p>
                  </div>
                  {/* Heart */}
                  <button
                    onClick={(e) => { e.stopPropagation(); musicStore.toggleFavorite(v); }}
                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity"
                    title={musicStore.isFavorite(v.id) ? 'Bỏ yêu thích' : 'Yêu thích'}
                  >
                    <svg
                      className={`w-3.5 h-3.5 ${musicStore.isFavorite(v.id) ? 'text-red-500' : 'text-gray-400'}`}
                      fill={musicStore.isFavorite(v.id) ? 'currentColor' : 'none'}
                      stroke="currentColor"
                      strokeWidth={2}
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                    </svg>
                  </button>
                  {/* Add to playlist toggle */}
                  <button
                    onClick={(e) => { e.stopPropagation(); setAddToPlaylistFor(addToPlaylistFor === v.id ? null : v.id); }}
                    className={`flex-shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded transition-opacity ${addToPlaylistFor === v.id ? 'text-cyan-500' : 'text-gray-400 hover:text-cyan-500'}`}
                    title="Thêm vào playlist"
                  >
                    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M14 10H3v2h11v-2zm0-4H3v2h11V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM3 16h7v-2H3v2z" />
                    </svg>
                  </button>
                </div>
                {/* Inline playlist picker — avoids overflow clipping */}
                {addToPlaylistFor === v.id && (
                  <div className="px-2 pb-1.5" onClick={(e) => e.stopPropagation()}>
                    {musicStore.getPlaylists().length === 0 ? (
                      <p className="text-xs text-gray-500 dark:text-gray-400 px-1 py-0.5">Chưa có playlist</p>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {musicStore.getPlaylists().map((pl) => (
                          <button
                            key={pl.id}
                            onClick={() => { musicStore.addToPlaylist(pl.id, v); setAddToPlaylistFor(null); }}
                            className="px-2 py-0.5 text-[11px] bg-gray-200 dark:bg-gray-600 hover:bg-cyan-500 hover:text-white rounded-full text-gray-700 dark:text-gray-300 transition-colors truncate max-w-[120px]"
                          >
                            {pl.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Queue list ── */}
      {searchResults.length === 0 && queue.length > 1 && (
        <div className="mt-2">
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 dark:text-gray-500 mb-1">Hàng chờ</p>
          <ul className="space-y-0.5 max-h-28 overflow-y-auto scrollbar-hide">
            {queue.map((v, idx) => (
              <li
                key={v.id}
                onClick={() => setCurrentIndex(idx)}
                className={`flex items-center gap-2 px-1.5 py-1 rounded-lg cursor-pointer transition-colors ${idx === currentIndex ? 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400' : 'hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-300'}`}
              >
                {idx === currentIndex && isPlaying ? (
                  <span className="flex-shrink-0 flex gap-0.5 items-end h-3">
                    <span className="w-0.5 bg-cyan-500 animate-[equalizer_0.6s_ease_infinite]" style={{ height: '100%' }} />
                    <span className="w-0.5 bg-cyan-500 animate-[equalizer_0.6s_ease_0.2s_infinite]" style={{ height: '70%' }} />
                    <span className="w-0.5 bg-cyan-500 animate-[equalizer_0.6s_ease_0.4s_infinite]" style={{ height: '50%' }} />
                  </span>
                ) : (
                  <span className="flex-shrink-0 text-[10px] w-3 text-center text-gray-400">{idx + 1}</span>
                )}
                <img src={optimizeImageUrl(v.thumbnail)} alt="" className="w-7 h-7 rounded object-cover flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-medium truncate leading-tight">{decodeHtml(v.title)}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
