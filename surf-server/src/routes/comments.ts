import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.js';
import { getDb } from '../config/firebase-admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { io } from '../index.js';

const router = Router();

// Get comments for a post
router.get('/:postId', requireAuth, async (req, res) => {
  try {
    const db = getDb();
    const commentsRef = db.collection('comments');
    
    console.log(`📥 GET /api/comments/${req.params.postId} - Fetching comments...`);
    
    const commentsSnap = await commentsRef
      .where('postId', '==', req.params.postId)
      .orderBy('createdAt', 'asc')
      .get();
    
    const comments = commentsSnap.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    
    console.log(`✅ Found ${comments.length} comments for post ${req.params.postId}`);
    
    res.json({ comments });
  } catch (e) {
    console.error('❌ Error getting comments:', e);
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
    
    const { content } = req.body;
    
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
    
    // Get user info
    const userDoc = await usersRef.doc(req.uid!).get();
    const user = userDoc.data();
    
    // Create comment
    const commentRef = commentsRef.doc();
    const commentData = {
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
    
    console.log(`📝 Creating comment for post ${req.params.postId} by ${req.uid}`);
    
    await commentRef.set(commentData);
    
    console.log(`✅ Comment created with ID: ${commentRef.id}`);
    
    // Update post's replyCount
    await postsRef.doc(req.params.postId).update({
      replyCount: FieldValue.increment(1),
    });
    
    const responseData = { 
      id: commentRef.id, 
      ...commentData 
    };
    
    console.log(`📤 Sending response:`, responseData);

    // RT-4: broadcast new comment to all users viewing this post
    io.to(`post:${req.params.postId}`).emit('comment:new', responseData);

    res.status(201).json(responseData);
  } catch (e) {
    console.error('Error creating comment:', e);
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
    console.error('Error editing comment:', e);
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
    console.error('Error deleting comment:', e);
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
    console.error('Error liking comment:', e);
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

    await commentsRef.doc(req.params.commentId).update({
      likedBy,
      likeCount: likedBy.length,
      reactions,
      updatedAt: new Date(),
    });

    res.json({
      liked: likedBy.includes(req.uid!),
      likeCount: likedBy.length,
      reactions,
    });
  } catch (e) {
    console.error('Error reacting to comment:', e);
    res.status(500).json({ error: (e as Error).message });
  }
});

export default router;
