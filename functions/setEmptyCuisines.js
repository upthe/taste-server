/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Triggered every day to set 'cuisines' field to be an empty list as needed
// so we can filter places for manual entry
exports.setEmptyCuisines = functions
    .pubsub.schedule("0 */6 * * *") // Every 6 hours
    .timeZone("America/New_York")
    .onRun((context) => {
      functions.logger.log("Starting to process setting empty cuisines");
      return db.collection("places").get().then((snapshot) => {
        snapshot.docs.forEach(async (place) => {
          const placeData = place.data();
          if (!Object.keys(placeData).includes("cuisines")) {
            functions.logger.log("Found place with no cuisines field, setting to list with element empty string, dumping place.id, placeData.name", place.id, placeData.name);
            await place.ref.update({
              "cuisines": [""],
            });
          }
        });
      });
    });
