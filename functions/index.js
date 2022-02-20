/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

exports.addPost = functions.firestore
    .document("/posts/{postId}")
    .onCreate((snap, context) => {
      functions.logger.log("Starting to process post", context.params.postId);
      const data = snap.data();
      functions.logger.log("Dumping post data", data);

      const userId = data["user"]["_path"]["segments"][1];
      const placeId = data["place"]["_path"]["segments"][1];
      const favorited = data.favorited;

      return db.collection("users").doc(userId).get().then((qds) => {
        const userData = qds.data();
        const userFriends = userData.friends;

        userFriends.forEach((userFriend) => {
          const userFriendId = userFriend.id;
          db.collection("users").doc(userFriendId).get().then((qds) => {
            const userFriendData = qds.data();

            const userFriendFavoritesIds = [];
            const userFriendTastedIds = [];
            const userFriendWantToTasteIds = [];
            userFriendData.favorites.forEach((place) => {
              userFriendFavoritesIds.push(place.id);
            });
            userFriendData.tasted.forEach((place) => {
              userFriendTastedIds.push(place.id);
            });
            userFriendData.wantToTaste.forEach((place) => {
              userFriendWantToTasteIds.push(place.id);
            });

            functions.logger.log("Dumping userFriendId, userFriendFavoritesIds", userFriendId, userFriendFavoritesIds);
            functions.logger.log("Dumping userFriendId, userFriendTastedIds", userFriendId, userFriendTastedIds);
            functions.logger.log("Dumping userFriendId, userFriendWantToTasteIds", userFriendId, userFriendWantToTasteIds);

            if (favorited) {
              if (userFriendFavoritesIds.includes(placeId)) {
                functions.logger.log("Triggered case FriendFavoritedPlaceYouFavorited; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
              } else if (userFriendTastedIds.includes(placeId)) {
                functions.logger.log("Triggered case FriendFavoritedPlaceYouTasted; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
              } else if (userFriendWantToTasteIds.includes(placeId)) {
                functions.logger.log("Triggered case FriendFavoritedPlaceYouWantToTaste; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
              } else {
                functions.logger.log("Triggered case FriendFavoritedPlace; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
              }
            } else {
              if (userFriendFavoritesIds.includes(placeId)) {
                functions.logger.log("Triggered case FriendTastedPlaceYouFavorited; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
                db.collection("notifications").doc(context.eventId).set({
                  ownerId: userFriendId,
                  type: "FriendTastedPlaceYouFavorited",
                  notificationDataUserId: userId,
                  notificationDataPlaceId: placeId,
                  seen: false,
                  timestamp: admin.firestore.Timestamp.now(),
                });
              } else if (userFriendWantToTasteIds.includes(placeId)) {
                functions.logger.log("Triggered case FriendTastedPlaceYouWantToTaste; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
              }
            }
          });
        });
      });
    });

exports.addNotification = functions.firestore
    .document("/notifications/{notificationId}")
    .onCreate((snap, context) => {
      functions.logger.log(
          "Starting to process notification",
          context.params.notificationId
      );
      const data = snap.data();
      functions.logger.log("Dumping notification data", data);

      const ownerId = data.ownerId;
      const notifDataUserId = data.notificationDataUserId;
      const notifDataPlaceId = data.notificationDataPlaceId;
      const type = data.type;

      return db.collection("users").doc(ownerId).get().then((qds) => {
        const userData = qds.data();
        const fcmToken = userData.fcmToken;

        db.collection("users").doc(notifDataUserId).get().then((qds) => {
          const notificationUserData = qds.data();
          const userFirstName = notificationUserData.firstName;

          db.collection("places").doc(notifDataPlaceId).get().then((qds) => {
            const notificationPlaceData = qds.data();
            const placeName = notificationPlaceData.name;

            let title = "";
            let body = "";

            switch (type) {
              case "FriendFavoritedPlaceYouFavorited":
                title = `${userFirstName} favorited ${placeName}`;
                body = `You also favorited ${placeName} - see what ${userFirstName} said`;
                break;
              case "FriendFavoritedPlaceYouTasted":
                title = `${userFirstName} favorited ${placeName}`;
                body = `You tasted ${placeName} - see what ${userFirstName} said`;
                break;
              case "FriendFavoritedPlaceYouWantToTaste":
                title = `${userFirstName} favorited ${placeName}`;
                body = `You want to taste ${placeName} - see what ${userFirstName} said`;
                break;
              case "FriendFavoritedPlace":
                title = `${userFirstName} favorited ${placeName}`;
                body = `See what ${userFirstName} said`;
                break;
              case "FriendTastedPlaceYouFavorited":
                title = `${userFirstName} favorited ${placeName}`;
                body = `You favorited ${placeName} - see what ${userFirstName} said`;
                break;
              case "FriendTastedPlaceYouWantToTaste":
                title = `${userFirstName} favorited ${placeName}`;
                body = `You want to taste ${placeName} - see what ${userFirstName} said before you go`;
                break;
              default:
                return;
            }

            const payload = admin.messaging.MessagingPayload = {
              notification: {
                title: title,
                body: body,
              },
            };

            functions.logger.log("Dumping payload and sending", payload);
            admin.messaging().sendToDevice(fcmToken, payload);
          });
        });
      });
    });
