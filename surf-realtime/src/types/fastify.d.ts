import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    uid?: string;
  }
}

export {};
