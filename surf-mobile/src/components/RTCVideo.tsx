import React from 'react';
import { RTCView } from 'react-native-webrtc';

type Props = {
  streamURL: string;
  style?: object;
  objectFit?: 'cover' | 'contain';
  zOrder?: number;
  mirror?: boolean;
};

export default function RTCVideo(props: Props) {
  return <RTCView {...props} />;
}
