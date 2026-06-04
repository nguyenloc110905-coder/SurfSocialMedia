import { useCallback, useEffect, useState } from 'react';

type UseWebRTCParams = {
  mode: 'audio' | 'video';
  onReady?: () => void;
  onModeChange?: (mode: 'audio' | 'video') => void;
};

export function useWebRTC({ mode, onReady, onModeChange }: UseWebRTCParams) {
  const [callMode, setCallMode] = useState<'audio' | 'video'>(mode);
  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(mode === 'audio');

  useEffect(() => {
    onReady?.();
  }, [onReady]);

  const toggleMic = useCallback(() => {
    setIsMicMuted((value) => !value);
  }, []);

  const toggleCamera = useCallback(() => {
    if (callMode !== 'video') return;
    setIsCameraOff((value) => !value);
  }, [callMode]);

  const upgradeToVideo = useCallback(() => {
    setCallMode('video');
    setIsCameraOff(false);
    onModeChange?.('video');
  }, [onModeChange]);

  return {
    localStream: null,
    remoteStream: null,
    hasRemoteVideo: false,
    callMode,
    isMicMuted,
    isCameraOff,
    isFrontCamera: true,
    connectionState: 'web-unavailable',
    toggleMic,
    toggleCamera,
    switchCamera: () => {},
    endCall: () => {},
    createAndSendOffer: () => {},
    upgradeToVideo,
  };
}
