export type MomentReactionEntry = {
  uid: string;
  name: string;
  photoURL: string | null;
  emoji: string;
  ts: number;
};

export type MomentItem = {
  id: string;
  userId: string;
  userDisplayName: string;
  userPhotoURL: string | null;
  mediaUrl: string;
  thumbnailUrl?: string | null;
  posterUrl?: string | null;
  mediaType: 'image' | 'video';
  caption?: string | null;
  filter?: string | null;
  textOverlay?: string | null;
  textColor?: string | null;
  textFont?: string | null;
  textSize?: number | null;
  textX?: number | null;
  textY?: number | null;
  textStyle?: 'box' | 'plain' | null;
  textRotation?: number | null;
  musicUrl?: string | null;
  musicTitle?: string | null;
  musicArtist?: string | null;
  audioMode?: 'original' | 'music' | 'both';
  privacy?: string | null;
  reactions?: Record<string, number>;
  reactionsList?: MomentReactionEntry[];
  viewedBy?: string[];
  viewCount?: number;
  createdAt?: { _seconds?: number; seconds?: number } | string | number | null;
  expiresAt?: { _seconds?: number; seconds?: number } | string | number | null;
};

export type MomentGroup = {
  userId: string;
  userDisplayName: string;
  userPhotoURL: string | null;
  moments: MomentItem[];
  hasUnviewed: boolean;
};
