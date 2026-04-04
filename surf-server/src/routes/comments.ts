import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { emitCommentNew } from '../realtime/emitters/post.emitter.js';
import { getIo } from '../realtime/io.js';
import { logger } from '../config/logger.js';

const router = Router();

// Get comments for a post — returns all comments sorted in-memory (no composite index needed)
router.get('/:postId', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const commentsRef = db.collection('comments');

    const snap = await commentsRef
      .where('postId', '==', req.params.postId)
      .limit(500)
      .get();

    type CommentDoc = { id: string; createdAt?: { seconds?: number; _seconds?: number } };
    const comments = (snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) as CommentDoc[])
      .sort((a, b) => {
        const aT = a.createdAt?.seconds ?? a.createdAt?._seconds ?? 0;
        const bT = b.createdAt?.seconds ?? b.createdAt?._seconds ?? 0;
        return aT - bT;
      });

    res.json({ comments, nextCursor: null, total: comments.length });
  } catch (e) {
    logger.error('❌ Error getting comments:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

// Create a new comment
router.post('/:postId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const commentsRef = db.collection('comments');
    const postsRef = db.collection('posts');
    const usersRef = db.collection('users');
    
    const { content, parentId } = req.body;
    
    if (!content?.trim()) {
      res.status(400).json({ error: 'Comment content is required' });
      return;
    }

    // Check if post exists
    const postDoc = await postsRef.doc(req.params.postId).get();
    if (!postDoc.exists) {
      res.status(404).json({ error: 'Post not found' });
      return;
    }

    // If parentId given, verify parent comment exists and belongs to this post
    if (parentId) {
      const parentDoc = await commentsRef.doc(parentId).get();
      if (!parentDoc.exists || parentDoc.data()?.postId !== req.params.postId) {
        res.status(404).json({ error: 'Parent comment not found' });
        return;
      }
    }
    
    // Get user info
    const userDoc = await usersRef.doc(req.uid!).get();
    const user = userDoc.data();

    // Create comment
    const commentRef = commentsRef.doc();
    const commentData: Record<string, unknown> = {
      postId: req.params.postId,
      authorId: req.uid,
      authorDisplayName: user?.displayName ?? 'Anonymous',
      authorPhotoURL: user?.photoURL ?? null,
      content: content.trim(),
      createdAt: new Date(),
      updatedAt: new Date(),
      likeCount: 0,
      likedBy: [],
    };
    if (parentId) commentData.parentId = parentId;
    
    console.log(`📝 Creating comment for post ${req.params.postId} by ${req.uid}`);

    await commentRef.set(commentData);

    console.log(`✅ Comment created with ID: ${commentRef.id}`);

    // Update post's replyCount
    await postsRef.doc(req.params.postId).update({
      replyCount: FieldValue.increment(1),
    });

    const responseData = {
      id: commentRef.id,
      ...commentData,
    };

    console.log(`📤 Sending response:`, responseData);

    // RT-4: broadcast new comment to all users viewing this post
    emitCommentNew(req.params.postId, responseData);

    const postAuthorId = postDoc.data()?.authorId as string | undefined;
    // Notify post author about new top-level comment (skip own post, skip replies — handled below)
    if (!parentId && postAuthorId && postAuthorId !== req.uid) {
      const notifRef = db.collection('notifications').doc();
      const notifData = {
        id: notifRef.id,
        type: 'comment',
        recipientId: postAuthorId,
        actorId: req.uid,
        actorName: user?.displayName ?? 'Ai đó',
        actorPhoto: user?.photoURL ?? null,
        postId: req.params.postId,
        postSnippet: (postDoc.data()?.content as string ?? '').substring(0, 100),
        commentSnippet: content.trim().substring(0, 80),
        read: false,
        createdAt: new Date(),
      };
      notifRef.set(notifData).catch(() => {});
      getIo().to(`user:${postAuthorId}`).emit('notification:new', {
        ...notifData,
        createdAt: new Date().toISOString(),
      });
    }

    // Notify parent comment author when someone replies (skip self, skip if same as post author — already notified)
    if (parentId) {
      const parentDoc = await commentsRef.doc(parentId).get();
      const parentAuthorId = parentDoc.data()?.authorId as string | undefined;
      if (parentAuthorId && parentAuthorId !== req.uid && parentAuthorId !== postAuthorId) {
        const notifRef = db.collection('notifications').doc();
        const notifData = {
          id: notifRef.id,
          type: 'reply',
          recipientId: parentAuthorId,
          actorId: req.uid,
          actorName: user?.displayName ?? 'Ai đó',
          actorPhoto: user?.photoURL ?? null,
          postId: req.params.postId,
          commentSnippet: content.trim().substring(0, 80),
          read: false,
          createdAt: new Date(),
        };
        notifRef.set(notifData).catch(() => {});
        getIo().to(`user:${parentAuthorId}`).emit('notification:new', {
          ...notifData,
          createdAt: new Date().toISOString(),
        });
      }
      // Also notify post author about the reply if they're not the parent author (already above)
      if (postAuthorId && postAuthorId !== req.uid && postAuthorId !== parentAuthorId) {
        const notifRef = db.collection('notifications').doc();
        const notifData = {
          id: notifRef.id,
          type: 'reply',
          recipientId: postAuthorId,
          actorId: req.uid,
          actorName: user?.displayName ?? 'Ai đó',
          actorPhoto: user?.photoURL ?? null,
          postId: req.params.postId,
          commentSnippet: content.trim().substring(0, 80),
          read: false,
          createdAt: new Date(),
        };
        notifRef.set(notifData).catch(() => {});
        getIo().to(`user:${postAuthorId}`).emit('notification:new', {
          ...notifData,
          createdAt: new Date().toISOString(),
        });
      }
    }

    res.status(201).json(responseData);
  } catch (e) {
    logger.error('Error creating comment:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

// Edit a comment (CMT-4)
router.patch('/:postId/:commentId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const commentsRef = db.collection('comments');

    const { content } = req.body;
    if (!content?.trim()) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    const commentDoc = await commentsRef.doc(req.params.commentId).get();
    if (!commentDoc.exists) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    if (commentDoc.data()?.authorId !== req.uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const updated = { content: content.trim(), updatedAt: new Date(), isEdited: true };
    await commentsRef.doc(req.params.commentId).update(updated);

    res.json({ id: req.params.commentId, ...commentDoc.data(), ...updated });
  } catch (e) {
    logger.error('Error editing comment:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

// Delete a comment
router.delete('/:postId/:commentId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const commentsRef = db.collection('comments');
    const postsRef = db.collection('posts');

    const commentDoc = await commentsRef.doc(req.params.commentId).get();

    if (!commentDoc.exists) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    const commentData = commentDoc.data();

    // Only the comment author can delete it
    if (commentData?.authorId !== req.uid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Delete comment
    await commentsRef.doc(req.params.commentId).delete();

    // Update post's replyCount
    await postsRef.doc(req.params.postId).update({
      replyCount: FieldValue.increment(-1),
    });

    res.json({ message: 'Comment deleted' });
  } catch (e) {
    logger.error('Error deleting comment:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

// Like/unlike a comment
router.post('/:postId/:commentId/like', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const commentsRef = db.collection('comments');

    const commentDoc = await commentsRef.doc(req.params.commentId).get();

    if (!commentDoc.exists) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    const commentData = commentDoc.data();
    const likedBy = commentData?.likedBy || [];
    const isLiked = likedBy.includes(req.uid);

    if (isLiked) {
      // Unlike
      await commentsRef.doc(req.params.commentId).update({
        likedBy: FieldValue.arrayRemove(req.uid),
        likeCount: FieldValue.increment(-1),
      });
      res.json({ liked: false });
    } else {
      // Like
      await commentsRef.doc(req.params.commentId).update({
        likedBy: FieldValue.arrayUnion(req.uid),
        likeCount: FieldValue.increment(1),
      });
      res.json({ liked: true });
    }
  } catch (e) {
    logger.error('Error liking comment:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

// React to a comment with emoji (POST /:postId/:commentId/react)
router.post('/:postId/:commentId/react', requireAuth, async (req: AuthRequest, res) => {
  try {
    const db = getDb();
    const commentsRef = db.collection('comments');

    const commentDoc = await commentsRef.doc(req.params.commentId).get();
    if (!commentDoc.exists) {
      res.status(404).json({ error: 'Comment not found' });
      return;
    }

    const data = commentDoc.data()!;
    const likedBy: string[] = data.likedBy ?? [];
    const reactions: Record<string, string> = data.reactions ?? {};
    const { reaction = '❤️' } = req.body;

    const idx = likedBy.indexOf(req.uid!);
    if (idx === -1) {
      // Not yet reacted — add reaction
      likedBy.push(req.uid!);
      reactions[req.uid!] = reaction as string;
    } else if (reactions[req.uid!] === reaction) {
      // Same reaction — toggle off
      likedBy.splice(idx, 1);
      delete reactions[req.uid!];
    } else {
      // Different reaction — switch emoji, keep in likedBy
      reactions[req.uid!] = reaction as string;
    }

    const wasAdding = idx === -1 || reactions[req.uid!] !== reaction;

    await commentsRef.doc(req.params.commentId).update({
      likedBy,
      likeCount: likedBy.length,
      reactions,
      updatedAt: new Date(),
    });

    // Notify comment author when someone reacts (only when adding, not removing; skip own)
    if (wasAdding && likedBy.includes(req.uid!) && data.authorId && data.authorId !== req.uid) {
      const commentAuthorId = data.authorId as string;
      const usersRef = db.collection('users');
      const actorDoc = await usersRef.doc(req.uid!).get();
      const actor = actorDoc.data();
      const notifRef = db.collection('notifications').doc();
      const notifData = {
        id: notifRef.id,
        type: 'comment_reaction',
        recipientId: commentAuthorId,
        actorId: req.uid,
        actorName: actor?.displayName ?? 'Ai đó',
        actorPhoto: actor?.photoURL ?? null,
        postId: req.params.postId,
        commentId: req.params.commentId,
        reaction: likedBy.includes(req.uid!) ? reactions[req.uid!] : reaction,
        commentSnippet: (data.content as string ?? '').substring(0, 80),
        read: false,
        createdAt: new Date(),
      };
      notifRef.set(notifData).catch(() => {});
      getIo().to(`user:${commentAuthorId}`).emit('notification:new', {
        ...notifData,
        createdAt: new Date().toISOString(),
      });
    }

    res.json({
      liked: likedBy.includes(req.uid!),
      likeCount: likedBy.length,
      reactions,
    });
  } catch (e) {
    logger.error('Error reacting to comment:', { stack: e instanceof Error ? e.stack : String(e) });
    res.status(500).json({ error: (e as Error).message });
  }
});

// GET /:postId/:commentId/reactions — list of users who reacted to a comment
router.get('/:postId/:commentId/reactions', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const commentDoc = await db.collection('comments').doc(req.params.commentId).get();
    if (!commentDoc.exists) { res.status(404).json({ error: 'Comment not found' }); return; }
    const reactions: Record<string, string> = commentDoc.data()?.reactions ?? {};
    const uids = Object.keys(reactions);
    if (uids.length === 0) { res.json([]); return; }
    const usersSnap = await db.collection('users').get();
    const usersMap = new Map(usersSnap.docs.map((d) => [d.id, d.data()]));
    const result = uids.map((uid) => ({
      uid,
      displayName: usersMap.get(uid)?.displayName ?? 'User',
      photoURL: usersMap.get(uid)?.photoURL ?? null,
      reaction: reactions[uid],
    }));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
