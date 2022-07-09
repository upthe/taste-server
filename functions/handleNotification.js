/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Triggered when a notification is created so we can send notifications
// FUTURE: this function isn't truly idempotent and Cloud Functions doesn't guarantee single execution - just
// that there is an execution. In edge cases, users may get multiple notifications for the same event
exports.handleNotification = functions.firestore
    .document("/notifications/{notificationId}")
    .onCreate((snap, context) => {
      functions.logger.log("Starting to process notification", context.params.notificationId);
      const notifData = snap.data();
      functions.logger.log("Dumping notification data", notifData);

      return db.collection("users").doc(notifData.ownerId).get().then(async (qds) => {
        const userData = qds.data();
        const fcmToken = userData.fcmToken;
        if (!fcmToken) {
          functions.logger.log("FCM token is empty, dumping userData.handle and exiting", userData.handle);
          return;
        }

        const payload = admin.messaging.MessagingPayload = {
          notification: {
            title: notifData.title,
            body: notifData.body,
          },
        };
        functions.logger.log("Dumping userData.handle, fcmToken, payload, notifData.type, then sending message notification", userData.handle, fcmToken, payload, notifData.type);
        await admin.messaging().sendToDevice(fcmToken, payload);
      });
    });
