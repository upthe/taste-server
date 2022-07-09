/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Triggered whenever a "want to taste" is added so we can send their friends notifications
exports.addWantToTaste = functions
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process want to taste");
      const userId = data.userId;
      const placeId = data.placeId;

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      const placeRef = db.collection("places").doc(placeId);
      const placeQds = await placeRef.get();
      const placeData = placeQds.data();

      // Create document in 'queuewanttotastes' collection
      await db.collection("queuewanttotastes").add({
        user: userRef,
        place: placeRef,
        timestamp: admin.firestore.Timestamp.now(),
      });

      const userFriends = await db.collection("users").where("friends", "array-contains", userRef).get();
      for (const userFriend of userFriends.docs) {
        const userFriendRef = db.collection("users").doc(userFriend.id);
        const userFriendQds = await userFriendRef.get();
        const userFriendData = userFriendQds.data();

        const userFriendTastedIds = [];
        const userFriendWantToTasteIds = [];
        userFriendData.tasted.forEach((place) => {
          userFriendTastedIds.push(place.id);
        });
        userFriendData.wantToTaste.forEach((place) => {
          userFriendWantToTasteIds.push(place.id);
        });

        if (userFriendTastedIds.includes(placeId)) {
          const userFriendPostRef = db.collection("posts").where("user", "==", userFriendRef).where("place", "==", placeRef).orderBy("timestamp", "desc").limit(1);
          const userFriendPostQds = await userFriendPostRef.get();
          const userFriendPostData = userFriendPostQds.docs[0].data();
          if (userFriendPostData.starRating >= 3) {
            functions.logger.log("Creating notification for FriendWantsToTastePlaceYouTasted, dumping userData.handle, userFriendData.handle, placeData.name, placeId", userData.handle, userFriendData.handle, placeData.name, placeId);
            await db.collection("notifications").add({
              ownerId: userFriend.id,
              type: "FriendWantsToTastePlaceYouTasted",
              title: `${userData.firstName} wants to taste ${placeData.name}`,
              body: "Your taste helped them discover this place - keep it up",
              notificationIcon: userId,
              notificationLink: placeId,
              seen: false,
              timestamp: admin.firestore.Timestamp.now(),
            });
          }
        }

        if (userFriendWantToTasteIds.includes(placeId)) {
          functions.logger.log("Creating notification for FriendWantsToTastePlaceYouWantToTaste, dumping userData.handle, userFriendData.handle, placeData.name, placeId", userData.handle, userFriendData.handle, placeData.name, placeId);
          await db.collection("notifications").add({
            ownerId: userFriend.id,
            type: "FriendWantsToTastePlaceYouWantToTaste",
            title: `${userData.firstName} wants to taste ${placeData.name}`,
            body: `You also want to taste ${placeData.name} - maybe you can go with them?`,
            notificationIcon: userId,
            notificationLink: placeId,
            seen: false,
            timestamp: admin.firestore.Timestamp.now(),
          });
        }
      }
    });
