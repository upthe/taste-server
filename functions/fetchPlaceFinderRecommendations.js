/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Example request:
// fetchPlaceFinderRecommendations({
//   userId: "ZL9uRDZXog21sG87hWMw",
//   friendIds: ["mvWOoxW4dOltwNjpkUvS"],
//   centerLatitude: 40.7357375,
//   centerLongitude: -73.997685,
//   latitudeRange: 0.074443,
//   longitudeRange: 0.012352,
//   cuisines: ["Pizza"]
// })
// fetchPlaceFinderRecommendations({userId: "ZL9uRDZXog21sG87hWMw", friendIds: ["mvWOoxW4dOltwNjpkUvS"], centerLatitude: 40.7357375, centerLongitude: -73.997685, latitudeRange: 0.074443, longitudeRange: 0.012352, cuisines: ["Pizza"]})
// 
// Example response:
// { "recommendationsId": "" }
// 
// Example recommendation:
// {
//   ownerId: "ZL9uRDZXog21sG87hWMw",
//   friendIds: [todo],
//   placeRecommendations: [
//     {
//       "placeId": "",
//       "wantToTasteUserIds": [todo],
//       "tastedUserIds": [todo],
//       "cuisines": [todo]
//     },
//     ...
//   ]
// }
exports.fetchPlaceFinderRecommendations = functions
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process fetch place finder recommendations");

      // Get data from query
      const userId = data.userId;
      const friendIds = data.friendIds;
      const centerLatitude = data.centerLatitude;
      const centerLongitude = data.centerLongitude;
      const latitudeRange = data.latitudeRange;
      const longitudeRange = data.longitudeRange;
      const cuisines = data.cuisines;
      functions.logger.log("Dumping userId, friendIds, centerLatitude, centerLongitude, latitudeRange, longitudeRange, cuisines", userId, friendIds, centerLatitude, centerLongitude, latitudeRange, longitudeRange, cuisines);

      // Calculate bounding box
      const minLatitude = centerLatitude - (latitudeRange / 2);
      const maxLatitude = centerLatitude + (latitudeRange / 2);
      const minLongitude = centerLongitude - (longitudeRange / 2);
      const maxLongitude = centerLongitude + (longitudeRange / 2);
      functions.logger.log("Dumping minLatitude, maxLatitude, minLongitude, maxLongitude", minLatitude, maxLatitude, minLongitude, maxLongitude);

      // Fetch places in the bounding box
      const placesLocationFilterRef = db.collection("places")
          .where("longitude", ">", minLongitude)
          .where("longitude", "<", maxLongitude);
      const placesLocationFilterQds = await placesLocationFilterRef.get();
      const placesLocationFilterData = placesLocationFilterQds.docs.filter((placeDoc) => {
        const latitude = placeDoc.data()["latitude"];
        return minLatitude < latitude && latitude < maxLatitude;
      });
      functions.logger.log("Done filtering places based on bounding box");

      // Setup pre-processed holding variables
      const group = friendIds.concat([userId]);
      const userIdToWantToTaste = group.reduce((obj, userId) => {
        obj[userId] = [];
        return obj
      }, {});
      const userIdToTasted = group.reduce((obj, userId) => {
        obj[userId] = [];
        return obj
      }, {});
      for (const userId of group) {
        const userRef = db.collection("users").doc(userId);
        const userQds = await userRef.get();
        const userData = userQds.data();

        for (placeRef of userData.wantToTaste) {
          userIdToWantToTaste[userId].push(placeRef.id);
        }
        for (placeRef of userData.tasted) {
          userIdToTasted[userId].push(placeRef.id);
        }
      }

      const allPlaces = placesLocationFilterData.map((placeSnapshot) => {
        const data = placeSnapshot.data();
        const wantToTasteUserIds = [];
        const tastedUserIds = [];
        for (const userId of group) {
          if (userIdToWantToTaste[userId].includes(placeSnapshot.id)) {
            wantToTasteUserIds.push(userId);
          }
          if (userIdToTasted[userId].includes(placeSnapshot.id)) {
            tastedUserIds.push(userId);
          }
        }
        return {
            "name": data["name"],
            "wantToTasteUserIds": wantToTasteUserIds,
            "tastedUserIds": tastedUserIds,
            "postsCount": data["postsCount"],
        }
      });

      // Filter for cuisines, want to taste, not tasted

      // Filter for want to taste, not tasted

      // Filter for want to taste

      // Filter for not tasted

      // Filter for nothing

      return {};
    });
