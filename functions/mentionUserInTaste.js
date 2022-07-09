/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Triggered for each mention in a taste
exports.mentionUserInTaste = functions
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process mention user in taste");
      const userId = data.userId;
      const mentionUserId = data.mentionUserId;
      const postId = data.postId;

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      if (userId != mentionUserId) {
        const payload = {
          ownerId: mentionUserId,
          type: "UserMentionedYouInTaste",
          title: `${userData.firstName} mentioned you in their taste`,
          body: "See what they said",
          notificationIcon: userId,
          notificationLink: postId,
          seen: false,
          timestamp: admin.firestore.Timestamp.now(),
        };
        functions.logger.log("Creating notification with payload", payload);
        await db.collection("notifications").add(payload);
      }
    });
