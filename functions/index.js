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

      return db.collection("users").doc(ownerId).get().then((userDoc) => {
        functions.logger.log("userDoc", userDoc);
      });

      // get user id in context
      // read from db to get fcm token for user
      // send notification with appropriate data to user
    });
