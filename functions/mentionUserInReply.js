/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Triggered for each mention in reply
exports.mentionUserInReply = functions
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process mention user in reply");
      const userId = data.userId;
      const mentionUserId = data.mentionUserId;
      const postId = data.postId;
      const replyId = data.replyId;

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      const replyRef = db.collection("posts").doc(postId).collection("replies").doc(replyId);
      const replyQds = await replyRef.get();
      const replyData = replyQds.data();

      if (userId != mentionUserId) {
        const payload = {
          ownerId: mentionUserId,
          type: "UserMentionedYouInReply",
          title: `${userData.firstName} mentioned you in their reply`,
          body: replyData.reply,
          notificationIcon: userId,
          notificationLink: postId,
          seen: false,
          timestamp: admin.firestore.Timestamp.now(),
        };
        functions.logger.log("Creating notification with payload", payload);
        await db.collection("notifications").add(payload);
      }
    });
