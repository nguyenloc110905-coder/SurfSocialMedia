export const FRIEND_REQUEST_PRIVACY_OPTIONS = ['everyone', 'friends_of_friends'] as const;

export type FriendRequestPrivacy = (typeof FRIEND_REQUEST_PRIVACY_OPTIONS)[number];

export const DEFAULT_FRIEND_REQUEST_PRIVACY: FriendRequestPrivacy = 'everyone';

export const isFriendRequestPrivacy = (value: unknown): value is FriendRequestPrivacy =>
  typeof value === 'string' &&
  FRIEND_REQUEST_PRIVACY_OPTIONS.includes(value as FriendRequestPrivacy);

export const normalizeFriendRequestPrivacy = (value: unknown): FriendRequestPrivacy =>
  isFriendRequestPrivacy(value) ? value : DEFAULT_FRIEND_REQUEST_PRIVACY;