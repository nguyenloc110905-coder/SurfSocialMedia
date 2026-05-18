import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import { api } from '../lib/api';
import { usePresenceStore } from '../stores/presenceStore';
import { useAuthStore } from '../stores/authStore';

const HEARTBEAT_INTERVAL = 30_000; // 30 seconds

function fetchFriendPresence(
    setInitial: (friendIds: string[], onlineIds: string[], lastSeen: Record<string, number>) => void
) {
    api
        .get<{ online: string[]; lastSeen: Record<string, number>; friendIds: string[] }>('/api/presence/friends')
        .then((res) => {
            console.log('[presence] initial friends online:', res.online);
            setInitial(res.friendIds, res.online, res.lastSeen);
        })
        .catch((err) => console.error('[presence] fetch failed:', err));
}

export function usePresence() {
    const user = useAuthStore((s) => s.user);
    const { setOnline, setOffline, setInitial } = usePresenceStore();

    useEffect(() => {
        if (!user?.uid) return;

        const socket = getSocket();

        // Fetch initial online friends list + lastSeen for offline friends
        fetchFriendPresence(setInitial);

        // Also re-fetch whenever socket (re)connects so we don't miss stale data
        const handleConnect = () => fetchFriendPresence(setInitial);

        // Listen for live presence updates
        const handleOnline = ({ userId }: { userId: string }) => {
            console.log('[presence] online:', userId);
            setOnline(userId);
        };
        const handleOffline = ({ userId, lastSeen }: { userId: string; lastSeen: number }) => {
            console.log('[presence] offline:', userId, lastSeen);
            setOffline(userId, lastSeen);
        };

        socket.on('connect', handleConnect);
        socket.on('presence:online', handleOnline);
        socket.on('presence:offline', handleOffline);

        // Heartbeat — keeps server-side TTL alive
        const heartbeat = setInterval(() => {
            if (socket.connected) {
                socket.emit('presence:heartbeat', user.uid);
            }
        }, HEARTBEAT_INTERVAL);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('presence:online', handleOnline);
            socket.off('presence:offline', handleOffline);
            clearInterval(heartbeat);
        };
    }, [user?.uid, setOnline, setOffline, setInitial]);
}
