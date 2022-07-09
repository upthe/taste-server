/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Triggered whenever a reaction is added to a post so we can send notifications
exports.addPostReaction = functions
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process post reaction");
      const userId = data.userId;
      const postId = data.postId;
      const emojiCode = parseInt(data.emojiCode);

      const emojiHex = emojiCode.toString(16);
      const emojiString = String.fromCodePoint(parseInt(emojiHex, 16));

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      const postRef = db.collection("posts").doc(postId);
      const postQds = await postRef.get();
      const postData = postQds.data();

      const postPlaceQds = await postData.place.get();
      const postPlaceData = postPlaceQds.data();
      const placeName = postPlaceData.name;

      if (postData.user.id != userId) {
        const payload = {
          ownerId: postData.user.id,
          type: "UserReactedToTaste",
          title: `${userData.firstName} reacted ${emojiString} to your taste`,
          body: `They reacted to your taste of ${placeName}`,
          notificationIcon: userId,
          notificationLink: postId,
          seen: false,
          timestamp: admin.firestore.Timestamp.now(),
        };
        functions.logger.log("Creating notification with payload", payload);
        await db.collection("notifications").add(payload);
      }
    });
