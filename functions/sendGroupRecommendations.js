/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Example request:
// sendGroupRecommendations({recommendationId: "1jl7GpFUdqvGRIzuaKtr"})
exports.sendGroupRecommendations = functions
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process sending group recommendations");

      // Get data from query
      const recommendationId = data.recommendationId;

      // Get the recommendation object
      const recommendationRef = db.collection("recommendations").doc(recommendationId);
      const recommendationQds = await recommendationRef.get();
      const recommendationData = recommendationQds.data();

      const user = recommendationData.user;
      const friends = recommendationData.friends;
      const recommendedPlaces = recommendationData.recommendedPlaces;

      const userIdToUserFirstName = {};
      const group = friends.concat([user]);
      for (const userRef of group) {
        const userQds = await userRef.get();
        const userData = userQds.data();
        userIdToUserFirstName[userRef.id] = userData.firstName;
      }

      // Send notification to user
      let title = `You found ${recommendedPlaces.length} ${recommendedPlaces.length == 1 ? "place" : "places"} for your group`;
      let body = "Check out the top recommendations for you";
      if (friends.length == 1) {
        body += ` and ${userIdToUserFirstName[friends[0].id]}`;
      } else {
        for (let i = 0; i < friends.length; i++) {
          if (i == friends.length - 1) {
            body += `, and ${userIdToUserFirstName[friends[i].id]}`;
          } else {
            body += `, ${userIdToUserFirstName[friends[i].id]}`;
          }
        }
      }
      await db.collection("notifications").add({
        ownerId: user.id,
        type: "FriendCreatedGroupRecommendation",
        title: title,
        body: body,
        notificationIcon: user.id,
        notificationLink: recommendationId,
        seen: false,
        timestamp: admin.firestore.Timestamp.now(),
      });

      // Send notifications to friends
      title = `${userIdToUserFirstName[user.id]} found ${recommendedPlaces.length} ${recommendedPlaces.length == 1 ? "place" : "places"} for your group`;
      for (const friendRef of friends) {
        body = "Check out the top recommendations for you";
        const filteredFriendRefs = friends.filter((ref) => ref != friendRef);
        if (filteredFriendRefs.length == 0) {
          body += ` and ${userIdToUserFirstName[user.id]}`;
        } else {
          for (const filteredFriendRef of filteredFriendRefs) {
            body += `, ${userIdToUserFirstName[filteredFriendRef.id]}`;
          }
          body += `, and ${userIdToUserFirstName[user.id]}`;
        }
        await db.collection("notifications").add({
          ownerId: friendRef.id,
          type: "FriendCreatedGroupRecommendation",
          title: title,
          body: body,
          notificationIcon: user.id,
          notificationLink: recommendationId,
          seen: false,
          timestamp: admin.firestore.Timestamp.now(),
        });
      }

      return {};
    });
