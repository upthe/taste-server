/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Triggered every week so we can clear out streaks
exports.clearStreaks = functions
    .runWith({
      timeoutSeconds: 300,
    })
    .pubsub.schedule("0 8 * * 1") // 8:00am on Mondays
    .timeZone("America/New_York")
    .onRun((context) => {
      functions.logger.log("Starting to process clearing streaks");
      const now = admin.firestore.Timestamp.now();
      return db.collection("users").get().then((snapshot) => {
        snapshot.docs.forEach((user) => {
          db.collection("posts").where("user", "==", user.ref).orderBy("timestamp", "desc").limit(1).get().then((snapshot) => {
            if (snapshot.docs.length == 0) {
              return;
            }

            const latestPostSnapshot = snapshot.docs[0];
            const latestPostTimestamp = latestPostSnapshot.data()["timestamp"];
            const diffDays = (now - latestPostTimestamp) / 60 / 60 / 24;
            if (diffDays > 7) {
              functions.logger.log("Clearing streak for user", user.id);
              user.ref.set({
                streakCount: 0,
              }, {merge: true});
            }
          });
        });
      });
    });
