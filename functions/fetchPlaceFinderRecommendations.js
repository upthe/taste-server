/* eslint-disable max-len, require-jsdoc */

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
//   userId: "ZL9uRDZXog21sG87hWMw",
//   friendIds: [todo],
//   cuisines: [todo],
//   location: {},
//   placeRecommendations: [
//     {
//       placeId: "",
//       wantToTasteUserIds: [todo],
//       tastedUserIds: [todo]
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
        return obj;
      }, {});
      const userIdToTasted = group.reduce((obj, userId) => {
        obj[userId] = [];
        return obj;
      }, {});
      for (const userId of group) {
        const userRef = db.collection("users").doc(userId);
        const userQds = await userRef.get();
        const userData = userQds.data();

        userData.wantToTaste.forEach((placeRef) => {
          userIdToWantToTaste[userId].push(placeRef.id);
        });
        userData.tasted.forEach((placeRef) => {
          userIdToTasted[userId].push(placeRef.id);
        });
      }

      let recommendedPlaces = [];
      let resultPlaces = [];
      const allPlaces = placesLocationFilterData.map((placeSnapshot) => {
        const data = placeSnapshot.data();
        const wantToTasteUserIds = [];
        const tastedUserIds = [];
        group.forEach((userId) => {
          if (userIdToWantToTaste[userId].includes(placeSnapshot.id)) {
            wantToTasteUserIds.push(userId);
          }
          if (userIdToTasted[userId].includes(placeSnapshot.id)) {
            tastedUserIds.push(userId);
          }
        });

        let postsCount = 0;
        if ("postsCount" in data) {
          postsCount = data["postsCount"];
        }

        let cuisines = [];
        if ("cuisines" in data) {
          cuisines = data["cuisines"];
        }

        return {
          "id": placeSnapshot.id,
          "name": data["name"],
          "cuisines": cuisines,
          "postsCount": postsCount,
          "wantToTasteUserIds": wantToTasteUserIds,
          "tastedUserIds": tastedUserIds,
        };
      });

      function sortPlaces(placeA, placeB) {
        const diffWantToTasteCount = placeB.wantToTasteUserIds.length - placeA.wantToTasteUserIds.length;
        const diffTastedCount = placeA.tastedUserIds.length - placeB.tastedUserIds.length;
        const postsCountDiff = placeB.postsCount - placeA.postsCount;
        return diffWantToTasteCount || postsCountDiff || diffTastedCount;
      }

      async function createRecommendation(recommendedPlaces) {
        recommendedPlaces = recommendedPlaces.slice(0, 3);
        const recommendation = await db.collection("recommendations").add({
          user: db.collection("users").doc(userId),
          friends: friendIds.map((friendId) => db.collection("users").doc(friendId)),
          cuisines: cuisines,
          location: {
            centerLatitude: centerLatitude,
            centerLongitude: centerLongitude,
            latitudeRange: latitudeRange,
            longitudeRange: longitudeRange,
          },
          recommendedPlaces: recommendedPlaces.map((place) => {
            return {
              "place": db.collection("places").doc(place.id),
              "wantToTasteUsers": place.wantToTasteUserIds.map((userId) => db.collection("users").doc(userId)),
              "tastedUsers": place.tastedUserIds.map((userId) => db.collection("users").doc(userId)),
            };
          }),
          timestamp: admin.firestore.Timestamp.now(),
        });
        return recommendation;
      }

      functions.logger.log("Filtering for cuisines, not tasted");
      resultPlaces = allPlaces
          .filter((place) => {
            for (const cuisine of place.cuisines) {
              if (cuisines.includes(cuisine)) {
                return true;
              }
            }
            return false;
          })
          .filter((place) => place.tastedUserIds.length == 0)
          .sort(sortPlaces);
      resultPlaces.forEach((place) => {
        if (!recommendedPlaces.includes(place)) {
          recommendedPlaces.push(place);
        }
      });
      if (recommendedPlaces.length >= 3) {
        recommendedPlaces = recommendedPlaces.slice(0, 3);
        const recommendation = await createRecommendation(recommendedPlaces);
        return {
          recommendationId: recommendation.id,
        };
      }

      functions.logger.log("Filtering for not tasted");
      resultPlaces = allPlaces
          .filter((place) => place.tastedUserIds.length == 0)
          .sort(sortPlaces);
      resultPlaces.forEach((place) => {
        if (!recommendedPlaces.includes(place)) {
          recommendedPlaces.push(place);
        }
      });
      if (recommendedPlaces.length >= 3) {
        recommendedPlaces = recommendedPlaces.slice(0, 3);
        const recommendation = await createRecommendation(recommendedPlaces);
        return {
          recommendationId: recommendation.id,
        };
      }

      functions.logger.log("Filtering for nothing");
      resultPlaces = allPlaces.sort(sortPlaces);
      resultPlaces.forEach((place) => {
        if (!recommendedPlaces.includes(place)) {
          recommendedPlaces.push(place);
        }
      });
      if (recommendedPlaces.length >= 3) {
        recommendedPlaces = recommendedPlaces.slice(0, 3);
        const recommendation = await createRecommendation(recommendedPlaces);
        return {
          recommendationId: recommendation.id,
        };
      }

      const recommendation = await createRecommendation(recommendedPlaces);
      return {
        recommendationId: recommendation.id,
      };
    });
