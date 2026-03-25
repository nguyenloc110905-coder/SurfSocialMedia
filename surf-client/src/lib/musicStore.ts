export interface TrackItem {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
}

export interface Playlist {
  id: string;
  name: string;
  tracks: TrackItem[];
}

const HISTORY_KEY = 'surf_music_history';
const FAVORITES_KEY = 'surf_music_favorites';
const PLAYLISTS_KEY = 'surf_music_playlists';
const MAX_HISTORY = 30;

type StoreListener = () => void;
type PlayListener = (track: TrackItem) => void;
type PlayPlaylistListener = (tracks: TrackItem[]) => void;

const storeListeners = new Set<StoreListener>();
const playListeners = new Set<PlayListener>();
const playPlaylistListeners = new Set<PlayPlaylistListener>();

function read<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
}

function notifyStore() {
  storeListeners.forEach((fn) => fn());
}

export const musicStore = {
  subscribe(fn: StoreListener) {
    storeListeners.add(fn);
    return () => { storeListeners.delete(fn); };
  },

  onPlayRequest(fn: PlayListener) {
    playListeners.add(fn);
    return () => { playListeners.delete(fn); };
  },

  requestPlay(track: TrackItem) {
    playListeners.forEach((fn) => fn(track));
  },

  onPlayPlaylistRequest(fn: PlayPlaylistListener) {
    playPlaylistListeners.add(fn);
    return () => { playPlaylistListeners.delete(fn); };
  },

  requestPlayPlaylist(tracks: TrackItem[]) {
    if (tracks.length > 0) playPlaylistListeners.forEach((fn) => fn(tracks));
  },

  // ── History ──────────────────────────────────────────────────────────────
  getHistory(): TrackItem[] { return read(HISTORY_KEY, []); },

  addToHistory(track: TrackItem) {
    const h = musicStore.getHistory().filter((t) => t.id !== track.id);
    h.unshift(track);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, MAX_HISTORY)));
    notifyStore();
  },

  clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    notifyStore();
  },

  // ── Favorites ────────────────────────────────────────────────────────────
  getFavorites(): TrackItem[] { return read(FAVORITES_KEY, []); },

  isFavorite(id: string): boolean {
    return musicStore.getFavorites().some((t) => t.id === id);
  },

  toggleFavorite(track: TrackItem) {
    const favs = musicStore.getFavorites();
    const idx = favs.findIndex((t) => t.id === track.id);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.unshift(track);
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs));
    notifyStore();
  },

  // ── Playlists ────────────────────────────────────────────────────────────
  getPlaylists(): Playlist[] { return read(PLAYLISTS_KEY, []); },

  createPlaylist(name: string): Playlist {
    const pl: Playlist = { id: `pl_${Date.now()}`, name: name.trim(), tracks: [] };
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify([...musicStore.getPlaylists(), pl]));
    notifyStore();
    return pl;
  },

  renamePlaylist(id: string, name: string) {
    const pls = musicStore.getPlaylists().map((p) => (p.id === id ? { ...p, name: name.trim() } : p));
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(pls));
    notifyStore();
  },

  deletePlaylist(id: string) {
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(musicStore.getPlaylists().filter((p) => p.id !== id)));
    notifyStore();
  },

  addToPlaylist(playlistId: string, track: TrackItem) {
    const pls = musicStore.getPlaylists().map((p) => {
      if (p.id !== playlistId || p.tracks.find((t) => t.id === track.id)) return p;
      return { ...p, tracks: [...p.tracks, track] };
    });
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(pls));
    notifyStore();
  },

  removeFromPlaylist(playlistId: string, trackId: string) {
    const pls = musicStore.getPlaylists().map((p) =>
      p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p,
    );
    localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(pls));
    notifyStore();
  },
};
