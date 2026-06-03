import { create } from 'zustand';

type CallMode = 'audio' | 'video';
type CallState = 'idle' | 'ringing' | 'connected' | 'ended';

interface PeerInfo {
  uid: string;
  name: string;
  avatarUrl: string | null;
}

interface CallStoreState {
  // Call session info
  callId: string | null;
  conversationId: string | null;
  mode: CallMode;
  callState: CallState;
  isHost: boolean;
  peer: PeerInfo | null;
  
  // Actions
  setIncomingCall: (payload: { callId: string, conversationId: string, peer: PeerInfo, mode: CallMode }) => void;
  setOutgoingCall: (payload: { callId: string, conversationId: string, peer: PeerInfo, mode: CallMode }) => void;
  setCallState: (state: CallState) => void;
  endCall: () => void;
  resetCall: () => void;
}

export const useCallStore = create<CallStoreState>((set) => ({
  callId: null,
  conversationId: null,
  mode: 'audio',
  callState: 'idle',
  isHost: false,
  peer: null,

  setIncomingCall: ({ callId, conversationId, peer, mode }) =>
    set({
      callId,
      conversationId,
      peer,
      mode,
      isHost: false,
      callState: 'ringing',
    }),

  setOutgoingCall: ({ callId, conversationId, peer, mode }) =>
    set({
      callId,
      conversationId,
      peer,
      mode,
      isHost: true,
      callState: 'ringing',
    }),

  setCallState: (state) => set({ callState: state }),

  endCall: () => set({ callState: 'ended' }),

  resetCall: () =>
    set({
      callId: null,
      conversationId: null,
      mode: 'audio',
      callState: 'idle',
      isHost: false,
      peer: null,
    }),
}));
