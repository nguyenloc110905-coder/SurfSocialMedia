import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  DisconnectButton,
  LiveKitRoom,
  RoomAudioRenderer,
  TrackToggle,
  VideoTrack,
  isTrackReference,
  useChat,
  useLocalParticipant,
  useParticipants,
  useTracks,
  type TrackReferenceOrPlaceholder,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';
import { api } from '@/lib/api';
import { defaultVideoProfile, fetchLiveKitToken, type CallMode } from '@/lib/livekit-call';
import { getSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/authStore';

type LiveKitConnection = {
  serverUrl: string;
  token: string;
};

type MeetingTab = 'chat' | 'participants';

type MeetingTileItem = {
  id: string;
  source: Track.Source;
  isScreenShare: boolean;
  displayName: string;
  identity: string;
  isLocal: boolean;
  trackRef: TrackReferenceOrPlaceholder;
};

type ParticipantListItem = {
  identity: string;
  name: string;
  isLocal: boolean;
  isSpeaking: boolean;
  isMicrophoneEnabled: boolean;
};

type DirectoryMember = {
  uid: string;
  name: string;
  avatarUrl: string | null;
};

type GroupCallParticipantPayload = {
  callId: string;
  conversationId: string;
  userId: string;
  reason?: string;
};

type DirectCallEndPayload = {
  callId: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  reason?: string;
};

const closeOrRedirect = (navigate: ReturnType<typeof useNavigate>) => {
  if (typeof window === 'undefined') return;

  if (window.opener) {
    window.close();
    return;
  }

  navigate('/feed/waves', { replace: true });
};

const emitGroupCallParticipantEvent = (
  event: 'call:group-participant-join' | 'call:group-participant-leave',
  payload: GroupCallParticipantPayload
) => {
  if (!payload.callId || !payload.conversationId || !payload.userId) return;

  getSocket().emit(event, payload);
};

const initials = (name?: string | null) =>
  name
    ?.trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'S';

const formatClock = (timestamp?: number) => {
  if (!timestamp) return '';
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return '';

  return new Intl.DateTimeFormat('vi-VN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
};

function TileAvatar({ name, className }: { name: string; className: string }) {
  return (
    <div
      className={`flex items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 text-white ${className}`}
    >
      <span className="font-semibold">{initials(name)}</span>
    </div>
  );
}

function MeetingTile({
  tile,
  selected,
  large,
  onSelect,
}: {
  tile: MeetingTileItem;
  selected: boolean;
  large: boolean;
  onSelect: () => void;
}) {
  const publishedTrackRef = isTrackReference(tile.trackRef) ? tile.trackRef : undefined;
  const hasTrack = Boolean(publishedTrackRef);
  const showContain = tile.source === Track.Source.ScreenShare;
  const mirrorLocalCamera = tile.isLocal && tile.source === Track.Source.Camera;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative h-full w-full overflow-hidden rounded-2xl border text-left transition ${
        selected
          ? 'border-cyan-300 shadow-[0_0_0_1px_rgba(103,232,249,0.55)]'
          : 'border-slate-700/80 hover:border-slate-500'
      }`}
    >
      <div className="relative h-full w-full bg-[#0b121a]">
        {hasTrack ? (
          <VideoTrack
            trackRef={publishedTrackRef}
            className={`h-full w-full bg-black ${
              showContain ? 'object-contain' : large ? 'object-cover' : 'object-cover'
            } ${mirrorLocalCamera ? 'scale-x-[-1]' : ''}`}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_40%,rgba(56,189,248,0.22),transparent_55%),#0b121a]">
            <TileAvatar name={tile.displayName} className={large ? 'h-20 w-20 text-2xl' : 'h-12 w-12 text-sm'} />
            <p className="text-xs font-medium text-slate-300">Camera đang tắt</p>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-2 pt-10">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-white">{tile.displayName}</p>
            <p className="text-[11px] text-slate-200/90">
              {tile.isScreenShare ? 'Screen share' : 'Camera'}
            </p>
          </div>
          {tile.isScreenShare && (
            <span className="rounded-full bg-cyan-500/85 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
              Share
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function MeetingWorkspace({
  title,
  onClose,
  conversationId,
}: {
  title: string;
  onClose: () => void;
  conversationId: string;
}) {
  const [workspaceAppearance, setWorkspaceAppearance] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<MeetingTab>('participants');
  const [focusedTileId, setFocusedTileId] = useState<string | null>(null);
  const [participantQuery, setParticipantQuery] = useState('');
  const [chatDraft, setChatDraft] = useState('');
  const [chatError, setChatError] = useState<string | null>(null);
  const [directoryMembers, setDirectoryMembers] = useState<DirectoryMember[]>([]);
  const chatBottomRef = useRef<HTMLDivElement | null>(null);

  const { localParticipant, isMicrophoneEnabled, isCameraEnabled, isScreenShareEnabled } =
    useLocalParticipant();
  const participants = useParticipants();
  const cameraAndScreenTracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const { chatMessages, send, isSending } = useChat();
  const isLightAppearance = workspaceAppearance === 'light';

  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;

    const loadDirectory = async () => {
      const membersResult = await api.get<{ members: DirectoryMember[] }>(
        `/api/conversations/${conversationId}/members`
      );

      if (cancelled) return;
      setDirectoryMembers(membersResult.members ?? []);
    };

    void loadDirectory().catch(() => {
      if (!cancelled) {
        setDirectoryMembers([]);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const knownNamesByIdentity = useMemo(() => {
    const byIdentity = new Map<string, string>();

    directoryMembers.forEach((member) => {
      const normalized = member.name?.trim() || member.uid;
      byIdentity.set(member.uid, normalized);
    });

    return byIdentity;
  }, [directoryMembers]);

  const resolveDisplayName = useCallback(
    (identity: string, liveKitName?: string | null) => {
      const normalizedLiveKitName = liveKitName?.trim();
      if (normalizedLiveKitName) return normalizedLiveKitName;
      return knownNamesByIdentity.get(identity) ?? identity;
    },
    [knownNamesByIdentity]
  );

  const participantItems = useMemo<ParticipantListItem[]>(() => {
    return participants
      .map((participant) => ({
        identity: participant.identity,
        name: resolveDisplayName(participant.identity, participant.name),
        isLocal: participant.identity === localParticipant.identity,
        isSpeaking: participant.isSpeaking,
        isMicrophoneEnabled: participant.isMicrophoneEnabled,
      }))
      .sort((a, b) => {
        if (a.isLocal && !b.isLocal) return -1;
        if (!a.isLocal && b.isLocal) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [participants, localParticipant.identity, resolveDisplayName]);

  const filteredParticipants = useMemo(() => {
    const keyword = participantQuery.trim().toLowerCase();
    if (!keyword) return participantItems;
    return participantItems.filter((participant) =>
      participant.name.toLowerCase().includes(keyword)
    );
  }, [participantItems, participantQuery]);

  const tiles = useMemo<MeetingTileItem[]>(() => {
    const mapped = cameraAndScreenTracks.map((trackRef) => {
      const isScreenShare = trackRef.source === Track.Source.ScreenShare;
      const displayName = resolveDisplayName(trackRef.participant.identity, trackRef.participant.name);

      return {
        id: `${trackRef.participant.identity}:${trackRef.source}`,
        source: trackRef.source,
        isScreenShare,
        displayName,
        identity: trackRef.participant.identity,
        isLocal: trackRef.participant.identity === localParticipant.identity,
        trackRef,
      };
    });

    return mapped.sort((a, b) => {
      if (a.isScreenShare && !b.isScreenShare) return -1;
      if (!a.isScreenShare && b.isScreenShare) return 1;
      if (a.identity === localParticipant.identity && b.identity !== localParticipant.identity)
        return -1;
      if (a.identity !== localParticipant.identity && b.identity === localParticipant.identity)
        return 1;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [cameraAndScreenTracks, localParticipant.identity, resolveDisplayName]);

  const focusedTile = useMemo(
    () => tiles.find((tile) => tile.id === focusedTileId) ?? null,
    [tiles, focusedTileId]
  );

  useEffect(() => {
    setFocusedTileId((current) => {
      if (current && tiles.some((tile) => tile.id === current)) return current;

      const fallbackTile = tiles.find((tile) => tile.isScreenShare) ?? tiles[0];
      return fallbackTile?.id ?? null;
    });
  }, [tiles]);

  useEffect(() => {
    if (activeTab !== 'chat') return;

    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chatMessages.length, activeTab]);

  const participantNamesByIdentity = useMemo(
    () => new Map(participantItems.map((participant) => [participant.identity, participant.name])),
    [participantItems]
  );

  const handleSendChat = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const text = chatDraft.trim();
    if (!text) return;

    setChatError(null);
    try {
      await send(text);
      setChatDraft('');
    } catch (error) {
      setChatError((error as Error).message || 'Không thể gửi tin nhắn.');
    }
  };

  const returnToSurf = () => {
    if (typeof window === 'undefined') return;

    if (window.opener && !window.opener.closed) {
      window.opener.focus();
      return;
    }

    window.open('/feed/waves', '_blank', 'noopener,noreferrer');
  };

  return (
    <>
      <RoomAudioRenderer />
      <div
        className={`h-full w-full p-2 sm:p-4 lg:p-6 ${
          isLightAppearance ? 'bg-[#edf2f8]' : 'bg-[#101824]'
        }`}
      >
        <div
          className={`mx-auto h-full max-w-[1750px] overflow-hidden rounded-[24px] border shadow-[0_24px_64px_-26px_rgba(15,23,42,0.45)] ${
            isLightAppearance ? 'border-slate-300/80 bg-white' : 'border-slate-700/80 bg-[#0d141f]'
          }`}
        >
          <div className="flex h-full flex-col lg:flex-row">
            <div
              className={`flex min-h-[360px] min-w-0 flex-1 flex-col lg:min-h-0 ${
                isLightAppearance ? 'bg-[#172131]' : 'bg-[#0a1018]'
              }`}
            >
              <div
                className={`flex items-center justify-between border-b px-4 py-3 sm:px-5 ${
                  isLightAppearance ? 'border-slate-500/45' : 'border-slate-700/70'
                }`}
              >
                <div className="min-w-0">
                  <p className="truncate text-[11px] font-medium uppercase tracking-[0.08em] text-slate-400">
                    Surf Group Meeting
                  </p>
                  <h1 className="truncate text-sm font-semibold text-slate-100 sm:text-base">{title}</h1>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={returnToSurf}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-600 bg-slate-800/85 px-3 text-xs font-semibold text-slate-100 transition hover:bg-slate-700"
                    aria-label="Về Surf và giữ cuộc gọi"
                    title="Về Surf"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M10.6 5.4 12 6.8 7.8 11H20v2H7.8l4.2 4.2-1.4 1.4L4 12Z" />
                    </svg>
                    Về Surf
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkspaceAppearance('light')}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                      isLightAppearance
                        ? 'border-amber-300 bg-amber-500/20 text-amber-200'
                        : 'border-slate-600 bg-slate-800/85 text-slate-300 hover:bg-slate-700'
                    }`}
                    aria-label="Bật chế độ sáng"
                    title="Chế độ sáng"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M12 4a1 1 0 0 1 1 1v1.1a1 1 0 1 1-2 0V5a1 1 0 0 1 1-1Zm0 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-5a1 1 0 0 1 1 1h1.1a1 1 0 1 1 0 2H20a1 1 0 1 1 0-2h-1a1 1 0 0 1 0-2ZM4 12a1 1 0 0 1 1-1h1.1a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Zm14.95-5.36a1 1 0 0 1 1.41 0l.78.78a1 1 0 1 1-1.42 1.42l-.77-.78a1 1 0 0 1 0-1.42ZM4.86 18.09a1 1 0 0 1 1.41 0l.78.78a1 1 0 0 1-1.42 1.42l-.77-.78a1 1 0 0 1 0-1.42Zm14.28 2.2a1 1 0 0 1-1.41 0l-.78-.78a1 1 0 1 1 1.42-1.42l.77.78a1 1 0 0 1 0 1.42ZM5.64 7.42a1 1 0 0 1-1.41 0l-.78-.78a1 1 0 0 1 1.42-1.42l.77.78a1 1 0 0 1 0 1.42Z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWorkspaceAppearance('dark')}
                    className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border transition ${
                      !isLightAppearance
                        ? 'border-cyan-300 bg-cyan-500/20 text-cyan-200'
                        : 'border-slate-500 bg-slate-800/85 text-slate-200 hover:bg-slate-700'
                    }`}
                    aria-label="Bật chế độ tối"
                    title="Chế độ tối"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="M11.37 3.02a1 1 0 0 1 1.11 1.24A7.5 7.5 0 0 0 19.74 13a1 1 0 0 1 1.24 1.11A9.5 9.5 0 1 1 11.37 3.02Z" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-500 bg-slate-800 px-3 text-slate-100 transition hover:bg-slate-700"
                    aria-label="Đóng cuộc gọi"
                    title="Đóng"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
                      <path d="m13.41 12 4.3-4.29-1.42-1.42L12 10.59l-4.29-4.3-1.42 1.42 4.3 4.29-4.3 4.29 1.42 1.42L12 13.41l4.29 4.3 1.42-1.42Z" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col">
                <div className="relative min-h-0 flex-1 p-3 sm:p-4">
                  {focusedTile ? (
                    <MeetingTile
                      tile={focusedTile}
                      selected
                      large
                      onSelect={() => {
                        return;
                      }}
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center rounded-2xl border border-slate-700/80 bg-[#0b121a]">
                      <div className="text-center">
                        <p className="text-base font-semibold text-slate-200">Đang chờ participant...</p>
                        <p className="mt-2 text-sm text-slate-400">Khi có camera hoặc share màn hình, nội dung sẽ hiện tại đây.</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-700/70 bg-[#0f1620] px-3 pb-2 pt-3 sm:px-4">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {tiles.map((tile) => (
                      <div
                        key={tile.id}
                        className="h-20 w-32 shrink-0 sm:h-24 sm:w-40"
                      >
                        <MeetingTile
                          tile={tile}
                          selected={tile.id === focusedTileId}
                          large={false}
                          onSelect={() => setFocusedTileId(tile.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="border-t border-slate-700/70 bg-[#0c121b] px-4 py-3">
                  <div className="mx-auto flex w-fit items-center gap-2 rounded-full bg-slate-900/90 px-2 py-2 shadow-inner shadow-black/20">
                    <TrackToggle
                      source={Track.Source.Microphone}
                      showIcon={false}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition ${
                        isMicrophoneEnabled
                          ? 'bg-slate-700 text-white hover:bg-slate-600'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title={isMicrophoneEnabled ? 'Tắt mic' : 'Bật mic'}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                        <path d="M12 14a3 3 0 0 0 3-3V7a3 3 0 1 0-6 0v4a3 3 0 0 0 3 3Zm5-3a1 1 0 0 1 2 0 7 7 0 0 1-6 6.92V20h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.08A7 7 0 0 1 5 11a1 1 0 1 1 2 0 5 5 0 0 0 10 0Z" />
                      </svg>
                    </TrackToggle>

                    <TrackToggle
                      source={Track.Source.Camera}
                      showIcon={false}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition ${
                        isCameraEnabled
                          ? 'bg-slate-700 text-white hover:bg-slate-600'
                          : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                      }`}
                      title={isCameraEnabled ? 'Tắt camera' : 'Bật camera'}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                        <path d="M15 8a2 2 0 0 1 2 2v.64l3.2-2.56A1 1 0 0 1 22 8.86v6.28a1 1 0 0 1-1.8.78L17 13.36V14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" />
                      </svg>
                    </TrackToggle>

                    <TrackToggle
                      source={Track.Source.ScreenShare}
                      showIcon={false}
                      className={`inline-flex h-10 w-10 items-center justify-center rounded-full transition ${
                        isScreenShareEnabled
                          ? 'bg-cyan-600 text-white hover:bg-cyan-500'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                      title={isScreenShareEnabled ? 'Dừng share màn hình' : 'Share màn hình'}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                        <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-4l1.2 2H17a1 1 0 1 1 0 2H7a1 1 0 1 1 0-2h1.8L10 15H6a2 2 0 0 1-2-2Zm2 0v8h12V5Z" />
                      </svg>
                    </TrackToggle>

                    <DisconnectButton
                      stopTracks
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-white transition hover:bg-rose-400"
                      title="Rời cuộc gọi"
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
                        <path d="M12 9a9.8 9.8 0 0 0-8.2 4.4 1 1 0 0 0 .17 1.32l1.9 1.58a1 1 0 0 0 1.4-.14l1.4-1.75c2.2-.9 4.4-.9 6.6 0l1.4 1.75a1 1 0 0 0 1.4.14l1.9-1.58a1 1 0 0 0 .17-1.32A9.8 9.8 0 0 0 12 9Z" />
                      </svg>
                    </DisconnectButton>
                  </div>
                </div>
              </div>
            </div>

            <aside className="flex h-[44vh] w-full flex-col border-t border-slate-300 bg-[#f7f8fa] lg:h-full lg:w-[360px] lg:border-l lg:border-t-0">
              <div className="flex items-center border-b border-slate-300 bg-white/95 px-3 py-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('chat')}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activeTab === 'chat'
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Chat
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('participants')}
                  className={`ml-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                    activeTab === 'participants'
                      ? 'bg-slate-100 text-slate-900'
                      : 'text-slate-500 hover:bg-slate-100'
                  }`}
                >
                  Participants
                  <span className="ml-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                    {participantItems.length}
                  </span>
                </button>
              </div>

              {activeTab === 'participants' ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="border-b border-slate-200 px-3 py-3">
                    <div className="flex items-center gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-slate-400" fill="currentColor">
                        <path d="M10 2a8 8 0 1 0 4.9 14.32l4.39 4.39 1.41-1.41-4.39-4.39A8 8 0 0 0 10 2Zm0 2a6 6 0 1 1 0 12 6 6 0 0 1 0-12Z" />
                      </svg>
                      <input
                        value={participantQuery}
                        onChange={(event) => setParticipantQuery(event.target.value)}
                        placeholder="Tìm người trong cuộc gọi"
                        className="w-full bg-transparent text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      On the call
                    </p>
                    {filteredParticipants.length > 0 ? (
                      <div className="space-y-1.5">
                        {filteredParticipants.map((participant) => (
                          <div
                            key={participant.identity}
                            className="flex items-center gap-3 rounded-xl bg-white px-3 py-2 shadow-sm"
                          >
                            <TileAvatar name={participant.name} className="h-9 w-9 text-xs" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">
                                {participant.name}
                                {participant.isLocal ? ' (You)' : ''}
                              </p>
                              <p className="truncate text-[11px] text-slate-500">
                                {participant.isMicrophoneEnabled ? 'Mic on' : 'Mic off'}
                              </p>
                            </div>
                            <span
                              className={`h-2.5 w-2.5 rounded-full ${
                                participant.isSpeaking ? 'bg-cyan-500' : 'bg-slate-300'
                              }`}
                            />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-500">
                        Không tìm thấy người nào khớp từ khóa tìm kiếm.
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3">
                    {chatMessages.length === 0 && (
                      <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-center">
                        <p className="text-sm font-medium text-slate-700">Chưa có tin nhắn</p>
                        <p className="mt-1 text-xs text-slate-500">Hãy gửi tin nhắn đầu tiên trong cuộc gọi.</p>
                      </div>
                    )}
                    {chatMessages.map((entry, index) => {
                      const mine = !entry.from || entry.from.identity === localParticipant.identity;
                      const senderIdentity = entry.from?.identity;
                      const senderName =
                        entry.from?.name?.trim() ||
                        (senderIdentity
                          ? participantNamesByIdentity.get(senderIdentity)
                          : undefined) ||
                        (mine ? 'You' : senderIdentity ?? 'Unknown');

                      return (
                        <div
                          key={`${entry.timestamp}-${index}`}
                          className={`flex ${mine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`max-w-[82%] rounded-2xl px-3 py-2 ${
                              mine
                                ? 'bg-cyan-500 text-white'
                                : 'border border-slate-300 bg-white text-slate-800'
                            }`}
                          >
                            <p className={`text-[11px] font-semibold ${mine ? 'text-cyan-50' : 'text-slate-500'}`}>
                              {senderName}
                            </p>
                            <p className="mt-1 text-sm leading-5">{entry.message}</p>
                            <p className={`mt-1 text-[10px] ${mine ? 'text-cyan-100/90' : 'text-slate-400'}`}>
                              {formatClock(entry.timestamp)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={chatBottomRef} />
                  </div>

                  <form onSubmit={handleSendChat} className="border-t border-slate-200 bg-white px-3 py-3">
                    {chatError && <p className="mb-2 text-xs text-rose-600">{chatError}</p>}
                    <div className="flex items-center gap-2">
                      <input
                        value={chatDraft}
                        onChange={(event) => setChatDraft(event.target.value)}
                        placeholder="Nhập tin nhắn..."
                        className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
                      />
                      <button
                        type="submit"
                        disabled={!chatDraft.trim() || isSending}
                        className="inline-flex h-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Gửi
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}

export default function GroupLiveKitCallPage() {
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [connection, setConnection] = useState<LiveKitConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const directEndEmittedRef = useRef(false);

  const callId = (searchParams.get('callId') ?? '').trim();
  const conversationId = (searchParams.get('conversationId') ?? '').trim();
  const isDirectCallMode = searchParams.get('dm') === '1';
  const directPeerId = (searchParams.get('peerId') ?? '').trim();
  const directPeerName = (searchParams.get('peerName') ?? '').trim();
  const roomName =
    (searchParams.get('roomName') ?? '').trim() || (isDirectCallMode ? `dm-${callId}` : '');
  const hostUserId = (searchParams.get('hostUserId') ?? '').trim();
  const mode: CallMode = searchParams.get('mode') === 'audio' ? 'audio' : 'video';
  const titleParam = (searchParams.get('title') ?? '').trim();
  const title = isDirectCallMode
    ? directPeerName || titleParam || 'Surf Call'
    : titleParam || 'Surf Group Call';

  const canRequestToken = useMemo(
    () => Boolean(user?.uid && callId && conversationId && roomName),
    [user?.uid, callId, conversationId, roomName]
  );

  const emitDirectCallEnd = useCallback(
    (reason?: string) => {
      if (!isDirectCallMode || !user?.uid || !callId || !conversationId || !directPeerId) return;
      if (directEndEmittedRef.current) return;

      directEndEmittedRef.current = true;

      const payload: DirectCallEndPayload = {
        callId,
        conversationId,
        fromUserId: user.uid,
        toUserId: directPeerId,
        reason,
      };

      getSocket().emit('call:end', payload);
    },
    [isDirectCallMode, user?.uid, callId, conversationId, directPeerId]
  );

  useEffect(() => {
    directEndEmittedRef.current = false;
  }, [callId]);

  useEffect(() => {
    let cancelled = false;

    const requestToken = async () => {
      if (!canRequestToken || !user?.uid) {
        setError(
          isDirectCallMode
            ? 'Thiếu dữ liệu cuộc gọi 1-1 để kết nối LiveKit.'
            : 'Thiếu dữ liệu cuộc gọi nhóm để kết nối LiveKit.'
        );
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const response = await fetchLiveKitToken({
          callId,
          conversationId,
          peerId: hostUserId || user.uid,
          mode,
          quality: defaultVideoProfile,
        });

        if (cancelled) return;

        if (response.provider !== 'livekit' || !response.serverUrl || !response.token) {
          setError(
            isDirectCallMode
              ? 'Không thể tạo phòng LiveKit cho cuộc gọi 1-1. Vui lòng kiểm tra cấu hình LiveKit trên server.'
              : 'Không thể tạo phòng LiveKit cho cuộc gọi nhóm. Vui lòng kiểm tra cấu hình LiveKit trên server.'
          );
          setConnection(null);
          return;
        }

        setConnection({
          serverUrl: response.serverUrl,
          token: response.token,
        });
      } catch (err) {
        if (cancelled) return;
        setConnection(null);
        setError(
          (err as Error).message ||
            (isDirectCallMode
              ? 'Không thể kết nối LiveKit cho cuộc gọi 1-1.'
              : 'Không thể kết nối LiveKit cho cuộc gọi nhóm.')
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void requestToken();

    return () => {
      cancelled = true;
    };
  }, [
    canRequestToken,
    user?.uid,
    callId,
    conversationId,
    hostUserId,
    mode,
    isDirectCallMode,
  ]);

  useEffect(() => {
    if (isDirectCallMode) return;
    if (!connection || !user?.uid || !callId || !conversationId) return;

    const payload: GroupCallParticipantPayload = {
      callId,
      conversationId,
      userId: user.uid,
    };

    emitGroupCallParticipantEvent('call:group-participant-join', payload);

    return () => {
      emitGroupCallParticipantEvent('call:group-participant-leave', {
        ...payload,
        reason: 'left',
      });
    };
  }, [connection, user?.uid, callId, conversationId, isDirectCallMode]);

  useEffect(() => {
    if (!isDirectCallMode || typeof window === 'undefined') return;

    const handleWindowLeave = () => {
      emitDirectCallEnd('window_closed');
    };

    window.addEventListener('beforeunload', handleWindowLeave);
    window.addEventListener('pagehide', handleWindowLeave);

    return () => {
      window.removeEventListener('beforeunload', handleWindowLeave);
      window.removeEventListener('pagehide', handleWindowLeave);
    };
  }, [isDirectCallMode, emitDirectCallEnd]);

  useEffect(() => {
    if (!isDirectCallMode || !user?.uid || !callId || !conversationId) return;

    const socket = getSocket();

    const onDirectCallEnded = (payload: DirectCallEndPayload) => {
      if (payload.callId !== callId || payload.conversationId !== conversationId) return;
      if (payload.fromUserId === user.uid) return;

      closeOrRedirect(navigate);
    };

    socket.on('call:ended', onDirectCallEnded);

    return () => {
      socket.off('call:ended', onDirectCallEnded);
    };
  }, [isDirectCallMode, user?.uid, callId, conversationId, navigate]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-[#0f1319] text-white">
      {loading && (
        <div className="flex h-full items-center justify-center">
          <div className="flex flex-col items-center gap-3">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-cyan-300/30 border-t-cyan-300" />
            <p className="text-sm text-slate-300">Đang kết nối phòng LiveKit...</p>
          </div>
        </div>
      )}

      {!loading && error && (
        <div className="mx-auto mt-14 w-full max-w-lg rounded-2xl border border-red-500/35 bg-red-500/10 p-6 text-center">
          <h2 className="text-lg font-semibold text-red-200">
            {isDirectCallMode ? 'Không thể vào cuộc gọi 1-1' : 'Không thể vào cuộc gọi nhóm'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-red-100/90">{error}</p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-red-200/40 bg-red-500/20 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-red-100 transition hover:bg-red-500/30"
            >
              Thử lại
            </button>
            <button
              type="button"
              onClick={() => closeOrRedirect(navigate)}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-500 bg-slate-800 px-4 text-xs font-semibold uppercase tracking-[0.08em] text-slate-100 transition hover:bg-slate-700"
            >
              Về Waves
            </button>
          </div>
        </div>
      )}

      {!loading && !error && connection && (
        <LiveKitRoom
          token={connection.token}
          serverUrl={connection.serverUrl}
          connect
          audio
          video={mode === 'video'}
          onDisconnected={() => {
            if (isDirectCallMode) {
              emitDirectCallEnd('window_closed');
            } else if (user?.uid && callId && conversationId) {
              emitGroupCallParticipantEvent('call:group-participant-leave', {
                callId,
                conversationId,
                userId: user.uid,
                reason: 'disconnected',
              });
            }
            closeOrRedirect(navigate);
          }}
          className="h-full"
          data-lk-theme="default"
        >
          <MeetingWorkspace
            title={title}
            onClose={() => {
              if (isDirectCallMode) {
                emitDirectCallEnd('window_closed');
              } else if (user?.uid && callId && conversationId) {
                emitGroupCallParticipantEvent('call:group-participant-leave', {
                  callId,
                  conversationId,
                  userId: user.uid,
                  reason: 'ended',
                });
              }
              closeOrRedirect(navigate);
            }}
            conversationId={conversationId}
          />
        </LiveKitRoom>
      )}
    </div>
  );
}
