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

const MAX_HISTORY = 30;

// UID of the currently logged-in user. null = anonymous / not yet known.
let _currentUid: string | null = null;

function historyKey()   { return `surf_music_history_${_currentUid ?? 'guest'}`; }
function favoritesKey() { return `surf_music_favorites_${_currentUid ?? 'guest'}`; }
function playlistsKey() { return `surf_music_playlists_${_currentUid ?? 'guest'}`; }

type StoreListener = () => void;
type PlayListener = (track: TrackItem) => void;
type PlayPlaylistListener = (tracks: TrackItem[]) => void;

const storeListeners = new Set<StoreListener>();
const playListeners = new Set<PlayListener>();
const playPlaylistListeners = new Set<PlayPlaylistListener>();

function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures so the music sidebar never breaks the app shell.
  }
}

function removeStorage(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage failures so the music sidebar never breaks the app shell.
  }
}

function readJson(key: string): unknown {
  try {
    const raw = readStorage(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

function notifyStore() {
  storeListeners.forEach((fn) => fn());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeTrack(value: unknown): TrackItem | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
    return null;
  }

  return {
    id: value.id,
    title: value.title,
    artist: typeof value.artist === 'string' ? value.artist : '',
    thumbnail:
      typeof value.thumbnail === 'string'
        ? value.thumbnail
        : `https://img.youtube.com/vi/${value.id}/hqdefault.jpg`,
  };
}

function readTrackList(key: string): TrackItem[] {
  const parsed = readJson(key);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeTrack).filter((track): track is TrackItem => track !== null);
}

function normalizePlaylist(value: unknown): Playlist | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') {
    return null;
  }

  return {
    id: value.id,
    name: value.name,
    tracks: Array.isArray(value.tracks)
      ? value.tracks.map(normalizeTrack).filter((track): track is TrackItem => track !== null)
      : [],
  };
}

function readPlaylists(key: string): Playlist[] {
  const parsed = readJson(key);
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizePlaylist).filter((playlist): playlist is Playlist => playlist !== null);
}

// Legacy static keys (used before per-user keys were introduced)
const LEGACY_HISTORY_KEY   = 'surf_music_history';
const LEGACY_FAVORITES_KEY = 'surf_music_favorites';
const LEGACY_PLAYLISTS_KEY = 'surf_music_playlists';

/**
 * One-time migration: if the user-specific key is empty and the old shared
 * key still has data, move that data to the user key and delete the old key
 * so the next different user doesn't inherit it.
 */
function migrateIfNeeded(uid: string) {
  const migrationDone = readStorage(`surf_music_migrated_${uid}`);
  if (migrationDone) return;
  writeStorage(`surf_music_migrated_${uid}`, '1');

  const pairs: [string, string][] = [
    [LEGACY_HISTORY_KEY,   `surf_music_history_${uid}`],
    [LEGACY_FAVORITES_KEY, `surf_music_favorites_${uid}`],
    [LEGACY_PLAYLISTS_KEY, `surf_music_playlists_${uid}`],
  ];
  for (const [legacyKey, newKey] of pairs) {
    const legacyRaw = readStorage(legacyKey);
    if (legacyRaw && !readStorage(newKey)) {
      writeStorage(newKey, legacyRaw);
    }
    removeStorage(legacyKey);
  }
}

export const musicStore = {
  // Call this whenever the auth user changes (login / logout)
  setUserId(uid: string | null) {
    if (uid) migrateIfNeeded(uid);
    _currentUid = uid;
    notifyStore(); // re-render components reading history/favorites/playlists
  },

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
    const safeTracks = Array.isArray(tracks) ? tracks : [];
    if (safeTracks.length > 0) playPlaylistListeners.forEach((fn) => fn(safeTracks));
  },

  // ── History ──────────────────────────────────────────────────────────────
  getHistory(): TrackItem[] { return readTrackList(historyKey()); },

  addToHistory(track: TrackItem) {
    const h = musicStore.getHistory().filter((t) => t.id !== track.id);
    h.unshift(track);
    writeStorage(historyKey(), JSON.stringify(h.slice(0, MAX_HISTORY)));
    notifyStore();
  },

  clearHistory() {
    removeStorage(historyKey());
    notifyStore();
  },

  // ── Favorites ────────────────────────────────────────────────────────────
  getFavorites(): TrackItem[] { return readTrackList(favoritesKey()); },

  isFavorite(id: string): boolean {
    return musicStore.getFavorites().some((t) => t.id === id);
  },

  toggleFavorite(track: TrackItem) {
    const favs = musicStore.getFavorites();
    const idx = favs.findIndex((t) => t.id === track.id);
    if (idx >= 0) favs.splice(idx, 1);
    else favs.unshift(track);
    writeStorage(favoritesKey(), JSON.stringify(favs));
    notifyStore();
  },

  // ── Playlists ────────────────────────────────────────────────────────────
  getPlaylists(): Playlist[] { return readPlaylists(playlistsKey()); },

  createPlaylist(name: string): Playlist {
    const pl: Playlist = { id: `pl_${Date.now()}`, name: name.trim(), tracks: [] };
    writeStorage(playlistsKey(), JSON.stringify([...musicStore.getPlaylists(), pl]));
    notifyStore();
    return pl;
  },

  renamePlaylist(id: string, name: string) {
    const pls = musicStore.getPlaylists().map((p) => (p.id === id ? { ...p, name: name.trim() } : p));
    writeStorage(playlistsKey(), JSON.stringify(pls));
    notifyStore();
  },

  deletePlaylist(id: string) {
    writeStorage(playlistsKey(), JSON.stringify(musicStore.getPlaylists().filter((p) => p.id !== id)));
    notifyStore();
  },

  addToPlaylist(playlistId: string, track: TrackItem) {
    const pls = musicStore.getPlaylists().map((p) => {
      if (p.id !== playlistId || p.tracks.find((t) => t.id === track.id)) return p;
      return { ...p, tracks: [...p.tracks, track] };
    });
    writeStorage(playlistsKey(), JSON.stringify(pls));
    notifyStore();
  },

  removeFromPlaylist(playlistId: string, trackId: string) {
    const pls = musicStore.getPlaylists().map((p) =>
      p.id === playlistId ? { ...p, tracks: p.tracks.filter((t) => t.id !== trackId) } : p,
    );
    writeStorage(playlistsKey(), JSON.stringify(pls));
    notifyStore();
  },
};
