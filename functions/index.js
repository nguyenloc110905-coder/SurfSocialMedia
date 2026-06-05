const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");
admin.initializeApp();
const db = admin.firestore();

// Trigger this when a user is deleted from Firebase Auth (Console or otherwise)
exports.cleanupUserContent = functions.auth.user().onDelete(async (user) => {
  const uid = user.uid;
  console.log(`User ${uid} was deleted. Cleaning up data...`);

  // 1. Delete user from Firestore
  try {
    await db.collection("users").doc(uid).delete();
    console.log(`Deleted user document for ${uid}`);
  } catch (err) {
    console.error(`Error deleting user document for ${uid}:`, err);
  }

  // 2. Hide or Delete user's posts
  try {
    const postsSnapshot = await db.collection("posts").where("authorId", "==", uid).get();
    if (!postsSnapshot.empty) {
      const batch = db.batch();
      postsSnapshot.forEach((doc) => {
        batch.update(doc.ref, { deleted: true, deletedAt: admin.firestore.FieldValue.serverTimestamp() }); // Soft delete
      });
      await batch.commit();
      console.log(`Soft deleted ${postsSnapshot.size} posts for user ${uid}`);
    }
  } catch (err) {
    console.error(`Error soft-deleting posts for ${uid}:`, err);
  }

  // 3. (Optional) Hide or delete comments
  try {
    const commentsSnapshot = await db.collection("comments").where("authorId", "==", uid).get();
    if (!commentsSnapshot.empty) {
      const batch = db.batch();
      commentsSnapshot.forEach((doc) => {
        batch.delete(doc.ref); // Hard delete or soft delete as you prefer
      });
      await batch.commit();
      console.log(`Deleted ${commentsSnapshot.size} comments for user ${uid}`);
    }
  } catch (err) {
    console.error(`Error deleting comments for ${uid}:`, err);
  }
});
