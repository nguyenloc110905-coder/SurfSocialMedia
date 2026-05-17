import { create } from 'zustand';
import { api } from '@/lib/api';

export type FriendPerson = {
  id: string;
  name: string;
  avatarUrl: string | null;
  mutualCount?: number;
};

export type FriendRequestItem = {
  id: string;
  uid: string;
  name: string;
  avatarUrl: string | null;
};

type FriendsResponse = { friends?: Array<Partial<FriendPerson> & { displayName?: string; photoURL?: string | null }> };
type IncomingResponse = { requests?: Array<{ id?: string; fromUid?: string; name?: string; avatarUrl?: string | null }> };
type OutgoingResponse = { sent?: Array<{ id?: string; toUid?: string; name?: string; avatarUrl?: string | null }> };
type SuggestionsResponse = { suggestions?: Array<Partial<FriendPerson>> };

type FriendState = {
  friends: FriendPerson[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  suggestions: FriendPerson[];
  loading: boolean;
  requestsLoading: boolean;
  suggestionsLoading: boolean;
  refreshing: boolean;
  actionById: Record<string, boolean>;
  error: string | null;
  fetchFriends: () => Promise<void>;
  fetchRequests: () => Promise<void>;
  fetchSuggestions: () => Promise<void>;
  fetchAll: () => Promise<void>;
  refreshAll: () => Promise<void>;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  cancelRequest: (requestId: string) => Promise<void>;
  sendRequest: (person: FriendPerson) => Promise<void>;
  removeFriend: (friendId: string) => Promise<void>;
  upsertIncomingRequest: (payload: { id?: string; fromUid?: string; name?: string; avatarUrl?: string | null }) => void;
  clear: () => void;
};

function normalizePerson(input: Partial<FriendPerson> & { displayName?: string; photoURL?: string | null }): FriendPerson | null {
  if (!input?.id) return null;
  return {
    id: input.id,
    name: input.name ?? input.displayName ?? 'Người dùng',
    avatarUrl: input.avatarUrl ?? input.photoURL ?? null,
    mutualCount: typeof input.mutualCount === 'number' ? input.mutualCount : 0,
  };
}

function normalizeIncoming(input: { id?: string; fromUid?: string; name?: string; avatarUrl?: string | null }): FriendRequestItem | null {
  if (!input?.id || !input.fromUid) return null;
  return {
    id: input.id,
    uid: input.fromUid,
    name: input.name ?? 'Người dùng',
    avatarUrl: input.avatarUrl ?? null,
  };
}

function normalizeOutgoing(input: { id?: string; toUid?: string; name?: string; avatarUrl?: string | null }): FriendRequestItem | null {
  if (!input?.id || !input.toUid) return null;
  return {
    id: input.id,
    uid: input.toUid,
    name: input.name ?? 'Người dùng',
    avatarUrl: input.avatarUrl ?? null,
  };
}

function setAction(state: FriendState, id: string, value: boolean) {
  return { actionById: { ...state.actionById, [id]: value } };
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  incomingRequests: [],
  outgoingRequests: [],
  suggestions: [],
  loading: false,
  requestsLoading: false,
  suggestionsLoading: false,
  refreshing: false,
  actionById: {},
  error: null,

  fetchFriends: async () => {
    set({ loading: true, error: null });
    try {
      const data = await api.get<FriendsResponse>('/api/friends');
      const friends = (data.friends ?? [])
        .map(normalizePerson)
        .filter((item): item is FriendPerson => Boolean(item));
      set({ friends });
    } catch (e) {
      set({ error: (e as Error).message || 'Không thể tải danh sách bạn bè' });
    } finally {
      set({ loading: false });
    }
  },

  fetchRequests: async () => {
    set({ requestsLoading: true, error: null });
    try {
      const [incoming, outgoing] = await Promise.all([
        api.get<IncomingResponse>('/api/friends/requests'),
        api.get<OutgoingResponse>('/api/friends/sent'),
      ]);
      set({
        incomingRequests: (incoming.requests ?? [])
          .map(normalizeIncoming)
          .filter((item): item is FriendRequestItem => Boolean(item)),
        outgoingRequests: (outgoing.sent ?? [])
          .map(normalizeOutgoing)
          .filter((item): item is FriendRequestItem => Boolean(item)),
      });
    } catch (e) {
      set({ error: (e as Error).message || 'Không thể tải lời mời kết bạn' });
    } finally {
      set({ requestsLoading: false });
    }
  },

  fetchSuggestions: async () => {
    set({ suggestionsLoading: true, error: null });
    try {
      const data = await api.get<SuggestionsResponse>('/api/friends/suggestions');
      const suggestions = (data.suggestions ?? [])
        .map(normalizePerson)
        .filter((item): item is FriendPerson => Boolean(item));
      set({ suggestions });
    } catch (e) {
      set({ error: (e as Error).message || 'Không thể tải gợi ý kết bạn' });
    } finally {
      set({ suggestionsLoading: false });
    }
  },

  fetchAll: async () => {
    await Promise.all([get().fetchFriends(), get().fetchRequests(), get().fetchSuggestions()]);
  },

  refreshAll: async () => {
    set({ refreshing: true });
    try {
      await get().fetchAll();
    } finally {
      set({ refreshing: false });
    }
  },

  acceptRequest: async (requestId) => {
    const request = get().incomingRequests.find((item) => item.id === requestId);
    set((state) => ({
      ...setAction(state, requestId, true),
      incomingRequests: state.incomingRequests.filter((item) => item.id !== requestId),
    }));
    try {
      await api.patch(`/api/friends/requests/${requestId}`, { action: 'accept' });
      await Promise.all([get().fetchFriends(), get().fetchSuggestions()]);
    } catch (e) {
      if (request) set((state) => ({ incomingRequests: [request, ...state.incomingRequests] }));
      set({ error: (e as Error).message || 'Không thể chấp nhận lời mời' });
      throw e;
    } finally {
      set((state) => setAction(state, requestId, false));
    }
  },

  rejectRequest: async (requestId) => {
    const request = get().incomingRequests.find((item) => item.id === requestId);
    set((state) => ({
      ...setAction(state, requestId, true),
      incomingRequests: state.incomingRequests.filter((item) => item.id !== requestId),
    }));
    try {
      await api.patch(`/api/friends/requests/${requestId}`, { action: 'reject' });
    } catch (e) {
      if (request) set((state) => ({ incomingRequests: [request, ...state.incomingRequests] }));
      set({ error: (e as Error).message || 'Không thể từ chối lời mời' });
      throw e;
    } finally {
      set((state) => setAction(state, requestId, false));
    }
  },

  cancelRequest: async (requestId) => {
    const request = get().outgoingRequests.find((item) => item.id === requestId);
    set((state) => ({
      ...setAction(state, requestId, true),
      outgoingRequests: state.outgoingRequests.filter((item) => item.id !== requestId),
    }));
    try {
      await api.delete(`/api/friends/requests/${requestId}`);
      if (request) await get().fetchSuggestions();
    } catch (e) {
      if (request) set((state) => ({ outgoingRequests: [request, ...state.outgoingRequests] }));
      set({ error: (e as Error).message || 'Không thể thu hồi lời mời' });
      throw e;
    } finally {
      set((state) => setAction(state, requestId, false));
    }
  },

  sendRequest: async (person) => {
    set((state) => ({
      ...setAction(state, person.id, true),
      suggestions: state.suggestions.filter((item) => item.id !== person.id),
    }));
    try {
      const res = await api.post<{ id: string }>('/api/friends/requests', { toUid: person.id });
      set((state) => ({
        outgoingRequests: [
          { id: res.id, uid: person.id, name: person.name, avatarUrl: person.avatarUrl },
          ...state.outgoingRequests.filter((item) => item.uid !== person.id),
        ],
      }));
    } catch (e) {
      set((state) => ({ suggestions: [person, ...state.suggestions] }));
      set({ error: (e as Error).message || 'Không thể gửi lời mời' });
      throw e;
    } finally {
      set((state) => setAction(state, person.id, false));
    }
  },

  removeFriend: async (friendId) => {
    const friend = get().friends.find((item) => item.id === friendId);
    set((state) => ({
      ...setAction(state, friendId, true),
      friends: state.friends.filter((item) => item.id !== friendId),
    }));
    try {
      await api.delete(`/api/friends/${friendId}`);
      await get().fetchSuggestions();
    } catch (e) {
      if (friend) set((state) => ({ friends: [friend, ...state.friends] }));
      set({ error: (e as Error).message || 'Không thể hủy kết bạn' });
      throw e;
    } finally {
      set((state) => setAction(state, friendId, false));
    }
  },

  upsertIncomingRequest: (payload) => {
    const request = normalizeIncoming(payload);
    if (!request) return;
    set((state) => ({
      incomingRequests: [
        request,
        ...state.incomingRequests.filter((item) => item.id !== request.id && item.uid !== request.uid),
      ],
    }));
  },

  clear: () =>
    set({
      friends: [],
      incomingRequests: [],
      outgoingRequests: [],
      suggestions: [],
      loading: false,
      requestsLoading: false,
      suggestionsLoading: false,
      refreshing: false,
      actionById: {},
      error: null,
    }),
}));
