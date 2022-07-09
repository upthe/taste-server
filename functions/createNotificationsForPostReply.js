/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

exports.createNotificationsForPostReply = functions.firestore
    .document("/posts/{postId}/replies/{replyId}")
    .onCreate(async (snap, context) => {
      functions.logger.log("Starting to process post reply to create notifications", context.params.postId);
      const data = snap.data();
      functions.logger.log("Dumping reply data", data);

      const postId = context.params.postId;
      const replyId = context.params.replyId;

      const postRef = db.collection("posts").doc(postId);
      const postQds = await postRef.get();
      const postData = postQds.data();

      const placeRef = db.collection("places").doc(postData.place.id);
      const placeQds = await placeRef.get();
      const placeData = placeQds.data();

      const replyRef = postRef.collection("replies").doc(replyId);
      const replyQds = await replyRef.get();
      const replyData = replyQds.data();

      // Get the owner of the post
      const postOwnerRef = db.collection("users").doc(postData.user.id);
      const postOwnerQds = await postOwnerRef.get();
      const postOwnerData = postOwnerQds.data();

      // Get the person who replied
      const replyOwnerId = replyData.owner.id;
      const replyOwnerRef = db.collection("users").doc(replyOwnerId);
      const replyOwnerQds = await replyOwnerRef.get();
      const replyOwnerData = replyOwnerQds.data();

      // Get the people who've replied already (and remove the post owner and person who just replied)
      const setExistingRepliesOwnerIds = new Set();
      await postRef.collection("replies").get().then((snapshot) => {
        snapshot.docs.forEach((replyQds) => {
          setExistingRepliesOwnerIds.add(replyQds.data()["owner"]["_path"]["segments"][1]);
        });
      });
      setExistingRepliesOwnerIds.delete(postData.user.id);
      setExistingRepliesOwnerIds.delete(replyOwnerId);
      const existingRepliesOwnerIds = [...new Set(setExistingRepliesOwnerIds)];

      // Send notification to owner of post
      if (postData.user.id != replyOwnerId) {
        const payload = {
          ownerId: postData.user.id,
          type: "FriendRepliedToYourTaste",
          title: `${replyOwnerData.firstName} replied to your taste of ${placeData.name}`,
          body: replyData.reply,
          notificationIcon: replyOwnerId,
          notificationLink: postId,
          seen: false,
          timestamp: admin.firestore.Timestamp.now(),
        };
        functions.logger.log("Creating notification with payload (FriendRepliedToYourTaste)", payload);
        await db.collection("notifications").add(payload);
      }

      // Send notifications to everyone that's replied so far
      for (const existingReplyOwnerId of existingRepliesOwnerIds) {
        const payload = {
          ownerId: existingReplyOwnerId,
          type: "UserRepliedToTaste",
          title: `${replyOwnerData.firstName} replied to a taste you're following`,
          notificationIcon: replyOwnerId,
          notificationLink: postId,
          seen: false,
          timestamp: admin.firestore.Timestamp.now(),
        };

        if (postData.user.id == replyOwnerId) {
          payload["body"] = `They replied to their own taste of ${placeData.name} - see what they said`;
        } else {
          payload["body"] = `They replied to ${postOwnerData.firstName}'s taste of ${placeData.name} - see what they said`;
        }
        functions.logger.log("Creating notification with payload (UserRepliedToTaste)", payload);
        await db.collection("notifications").add(payload);
      }
    });
