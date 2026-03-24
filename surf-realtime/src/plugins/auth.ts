import type { FastifyReply, FastifyRequest } from 'fastify';
import { getAuth } from '../config/firebase-admin.js';

const parseBearerToken = (authorizationHeader?: string): string | null => {
  if (!authorizationHeader) return null;
  const [scheme, token] = authorizationHeader.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
  return token.trim();
};

export const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
  const token = parseBearerToken(request.headers.authorization);
  if (!token) {
    reply.status(401).send({ error: 'Missing bearer token' });
    return;
  }

  try {
    const decoded = await getAuth().verifyIdToken(token);
    request.uid = decoded.uid;
  } catch {
    reply.status(401).send({ error: 'Invalid token' });
  }
};
