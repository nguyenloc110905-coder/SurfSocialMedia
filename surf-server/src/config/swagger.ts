import swaggerJSDoc from 'swagger-jsdoc';
import type { Options } from 'swagger-jsdoc';

const options: Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Surf Social API',
      version: '0.1.0',
      description:
        'REST API cho dự án Surf Social Media. Tất cả endpoint dưới `/api` (ngoại trừ `/api/health` và `/api/docs`) yêu cầu Firebase ID token qua header `Authorization: Bearer <token>`.',
    },
    servers: [
      { url: 'http://localhost:4000', description: 'Local dev' },
      { url: 'https://surf-api-xxxx.onrender.com', description: 'Production (Render)' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Firebase ID Token',
          description:
            'Lấy token từ Firebase Auth (`firebase.auth().currentUser.getIdToken()`) rồi paste vào ô Value (không cần prefix `Bearer `).',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: { type: 'string', example: 'Resource not found' },
          },
        },
        Post: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            authorId: { type: 'string' },
            authorDisplayName: { type: 'string' },
            authorPhotoURL: { type: 'string', nullable: true },
            content: { type: 'string' },
            mediaUrls: { type: 'array', items: { type: 'string' } },
            privacy: { type: 'string', enum: ['public', 'friends', 'only-me', 'custom', 'group'] },
            groupId: { type: 'string', nullable: true },
            parentId: { type: 'string', nullable: true },
            likeCount: { type: 'integer' },
            replyCount: { type: 'integer' },
            likedBy: { type: 'array', items: { type: 'string' } },
            hasVideo: { type: 'boolean' },
            isAnonymous: { type: 'boolean' },
            poll: {
              type: 'object',
              nullable: true,
              properties: {
                options: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      text: { type: 'string' },
                      votes: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Group: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            coverImageUrl: { type: 'string', nullable: true },
            category: { type: 'string', nullable: true },
            privacy: { type: 'string', enum: ['public', 'private'] },
            ownerId: { type: 'string' },
            adminIds: { type: 'array', items: { type: 'string' } },
            memberIds: { type: 'array', items: { type: 'string' } },
            memberCount: { type: 'integer' },
            membershipStatus: { type: 'string', enum: ['member', 'pending', 'none'] },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Đăng nhập / token' },
      { name: 'Users', description: 'Hồ sơ người dùng' },
      { name: 'Posts', description: 'Bài viết & feed cá nhân' },
      { name: 'Feed', description: 'Bảng tin tổng hợp' },
      { name: 'Friends', description: 'Bạn bè & lời mời' },
      { name: 'Groups', description: 'Nhóm & bài viết trong nhóm' },
      { name: 'Comments', description: 'Bình luận' },
      { name: 'Notifications', description: 'Thông báo' },
      { name: 'Conversations', description: 'Tin nhắn' },
      { name: 'Calls', description: 'LiveKit / fallback call' },
      { name: 'Moments', description: 'Story 24h' },
      { name: 'Videos', description: 'Video ngắn' },
      { name: 'Music', description: 'Nhạc nền' },
      { name: 'Presence', description: 'Trạng thái online' },
      { name: 'Health', description: 'Health check' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/index.ts'],
};

export const swaggerSpec = swaggerJSDoc(options);
