/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Triggered whenever a reaction is added to a post reply so we can send notifications
exports.addPostReplyReaction = functions
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process post reply reaction");
      const userId = data.userId;
      const postId = data.postId;
      const replyId = data.replyId;
      const emojiCode = parseInt(data.emojiCode);

      const emojiHex = emojiCode.toString(16);
      const emojiString = String.fromCodePoint(parseInt(emojiHex, 16));

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      const replyRef = db.collection("posts").doc(postId).collection("replies").doc(replyId);
      const replyQds = await replyRef.get();
      const replyData = replyQds.data();

      const postRef = db.collection("posts").doc(postId);
      const postQds = await postRef.get();
      const postData = postQds.data();

      const postOwnerQds = await postData.user.get();
      const postOwnerData = postOwnerQds.data();
      const postOwnerFirstName = postOwnerData.firstName;

      if (replyData.owner.id != userId) {
        const payload = {
          ownerId: replyData.owner.id,
          type: "UserReactedToReply",
          title: `${userData.firstName} reacted ${emojiString} to your reply`,
          body: `They reacted to your reply on ${postOwnerFirstName}'s taste`,
          notificationIcon: userId,
          notificationLink: postId,
          seen: false,
          timestamp: admin.firestore.Timestamp.now(),
        };
        functions.logger.log("Creating notification with payload", payload);
        await db.collection("notifications").add(payload);
      }
    });
