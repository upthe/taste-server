const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

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
        functions.logger.log("userData", userData);
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
                title = `${userFirstName} favorited ${placeName}`; // eslint-disable-line max-len
                body = `You also favorited ${placeName} - see what ${userFirstName} said`; // eslint-disable-line max-len
                break;
              case "FriendFavoritedPlace":
                title = `${userFirstName} favorited ${placeName}`; // eslint-disable-line max-len
                body = `See what ${userFirstName} said`; // eslint-disable-line max-len
                break;
              case "FriendTastedPlaceYouFavorited":
                title = `${userFirstName} favorited ${placeName}`; // eslint-disable-line max-len
                body = `You favorited ${placeName} - see what ${userFirstName} said`; // eslint-disable-line max-len
                break;
              case "FriendTastedPlaceYouWantToTaste":
                title = `${userFirstName} favorited ${placeName}`; // eslint-disable-line max-len
                body = `You want to taste ${placeName} - see what ${userFirstName} said before you go`; // eslint-disable-line max-len
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
