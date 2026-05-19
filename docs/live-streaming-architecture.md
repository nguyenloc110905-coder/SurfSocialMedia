# Surf Live Streaming Architecture

## Decision

Provider selected: **Daily.co**.

Daily is the target production provider because Surf needs browser-first realtime video, optional HLS/RTMP fan-out, and future room/token APIs without forcing mobile work in this task set. Daily's public docs describe WebRTC-based browser video, Client SDKs/Prebuilt, live streaming support, and a scale path where interactive live streams can support large realtime audiences while RTMP/HLS output covers broadcast-style distribution.

References:

- Daily get started: https://docs.daily.co/get-started
- Daily interactive live streaming and RTMP output: https://docs.daily.co/guides/scaling-calls/interactive-live-streaming-rtmp-output
- Agora interactive live streaming comparison reference: https://www.agora.io/en/products/interactive-live-streaming/

## Current Web Implementation

This repo now ships a web MVP that uses the Surf API and Socket.IO to satisfy the product acceptance criteria without touching `surf-mobile`.

- `POST /api/live-streams` creates a live session, requests a Daily room when `DAILY_API_KEY` is configured, and otherwise falls back to native browser WebRTC with Socket.IO signalling.
- The broadcaster uses `navigator.mediaDevices.getUserMedia({ video, audio })`, so the browser permission prompt is the go-live gate.
- Viewers join by stream ID at `/feed/live/:streamId`.
- Socket.IO events handle WebRTC offers/answers/candidates, viewer count, comments, reactions, and live notifications.
- Friend live notifications are emitted as `friend:live` to each friend room and rendered as a web toast with a join button.

## Production Target

Daily should become the default media transport once account credentials are available:

1. Server creates Daily rooms from `POST /api/live-streams`.
2. Server issues host/viewer meeting tokens with role-specific permissions.
3. Web broadcaster/viewer joins the Daily room through `daily-js` or Daily Prebuilt.
4. Surf keeps comments, reactions, RSVP, event notifications, and friend-live toasts on existing Socket.IO channels.
5. For very large audiences, enable Daily HLS/RTMP output and embed the player for passive viewers.

## API Surface

Live:

- `GET /api/live-streams`
- `GET /api/live-streams/:id`
- `POST /api/live-streams`
- `PATCH /api/live-streams/:id/end`
- `GET /api/live-streams/:id/comments`

Events:

- `GET /api/events?location=...`
- `POST /api/events`
- `PATCH /api/events/:id`
- `POST /api/events/:id/rsvp`

## Socket Events

Client emits:

- `live:join`
- `live:leave`
- `live:signal`
- `live:comment`
- `live:reaction`

Server emits:

- `friend:live`
- `live:viewer-joined`
- `live:viewer-left`
- `live:viewer-count`
- `live:signal`
- `live:comment`
- `live:reaction`
- `live:ended`
- `event:updated`
- `notification:new`
- `notification:unread-count`

## Data Model

`live_streams/{id}`:

- `hostId`, `hostName`, `hostPhotoURL`
- `title`
- `status`: `live | ended`
- `provider`: `daily`
- `transport`: `daily | socket-webrtc`
- `providerRoomName`, `providerRoomUrl`
- `viewerCount`
- `reactionCounts`
- `startedAt`, `endedAt`, `updatedAt`

`live_stream_comments/{id}`:

- `streamId`
- `userId`, `authorName`, `authorPhotoURL`
- `text`
- `createdAt`

`events/{id}`:

- `creatorId`, `creatorName`
- `name`, `date`, `location`, `description`, `coverImageUrl`
- `attendeeCounts.going`, `attendeeCounts.maybe`, `attendeeCounts.not_going`
- `createdAt`, `updatedAt`

`event_rsvps/{eventId_userId}`:

- `eventId`
- `userId`
- `status`: `going | maybe | not_going`
- `updatedAt`

## Operational Notes

- Native WebRTC fallback is intended for MVP/dev and small tests. Production NAT traversal, SFU routing, recording, moderation, and large-scale fan-out should use Daily.
- Current Socket.IO auth follows the existing app pattern: Firebase auth maps a socket to a user after the web client emits `join`.
- Comments and reactions are persisted enough for reload/join-late UX, while signalling state remains ephemeral.
