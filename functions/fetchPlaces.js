/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Example return data:
// {
//     "places": [
//         "id": "asdf1234",
//         "name": "Dummy Restaurant",
//         "cuisines": ["Pizza", "Italian"],
//         "rating": 3.5,
//         "state": "TASTED|WANT_TO_TASTE|FRIENDS_TASTED|FRIENDS_WANT_TO_TASTE",
//         "iconStyle": "PIN|DOT"
//     ]
// }
//
// Example query:
// fetchPlaces({userId: "ZL9uRDZXog21sG87hWMw", centerLatitude: 40.7357375, centerLongitude: -73.997685, latitudeRange: 0.074443, longitudeRange: 0.012352})
exports.fetchPlaces = functions
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process fetching places");

      // Get data from query
      const userId = data.userId;
      const centerLatitude = data.centerLatitude;
      const centerLongitude = data.centerLongitude;
      const latitudeRange = data.latitudeRange;
      const longitudeRange = data.longitudeRange;

      // Collect places user tasted, user wants to taste, friends tasted, friends want to taste
      const userTastedIds = new Set();
      const userWantToTasteIds = new Set();
      const friendsTastedIds = new Set();
      const friendsWantToTasteIds = new Set();

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      userData.tasted.forEach((placeRef) => {
        userTastedIds.add(placeRef.id);
      });
      userData.wantToTaste.forEach((placeRef) => {
        userWantToTasteIds.add(placeRef.id);
      });

      for (const friendRef of userData.friends) {
        const friendQds = await friendRef.get();
        const friendData = friendQds.data();

        friendData.tasted.forEach((placeRef) => {
          friendsTastedIds.add(placeRef.id);
        });
        friendData.wantToTaste.forEach((placeRef) => {
          friendsWantToTasteIds.add(placeRef.id);
        });
      }

      const socialContextIds = new Set([...userTastedIds, ...userWantToTasteIds, ...friendsTastedIds, ...friendsWantToTasteIds]);

      // Calculate bounding box
      const minLatitude = centerLatitude - (latitudeRange / 2);
      const maxLatitude = centerLatitude + (latitudeRange / 2);
      const minLongitude = centerLongitude - (longitudeRange / 2);
      const maxLongitude = centerLongitude + (longitudeRange / 2);

      // Fetch places in the bounding box
      const placesLocationFilterRef = db.collection("places")
          .where("longitude", ">", minLongitude)
          .where("longitude", "<", maxLongitude);
      const placesLocationFilterQds = await placesLocationFilterRef.get();
      const placesLocationFilterData = placesLocationFilterQds.docs.filter((placeDoc) => {
        const latitude = placeDoc.data()["latitude"];
        return minLatitude < latitude && latitude < maxLatitude;
      });

      // Filter for places with social context
      const placesCustomFilterData = placesLocationFilterData.filter((placeDoc) => {
        return socialContextIds.has(placeDoc.id);
      });

      // Pre-fetch places with the most posts to determine icon style
      const sortedPlacesWithMostPosts = placesCustomFilterData.sort((placeDocA, placeDocB) => {
        const placesCountA = placeDocA.data()["postsCount"] || 0;
        const placesCountB = placeDocB.data()["postsCount"] || 0;
        return placesCountB - placesCountA;
      });
      const top20PlacesWithMostPosts = sortedPlacesWithMostPosts.slice(0, 20).map((placeDoc) => placeDoc.id);

      // Populate dictionary to return
      const placesReturnData = {
        "places": [],
      };
      placesCustomFilterData.forEach((placeDoc, i) => {
        const placeData = placeDoc.data();

        const payload = {
          "id": placeDoc.id,
          "name": placeData["name"],
          "cuisines": placeData["cuisines"] || [],
        };

        // TODO: Get social star rating of place
        payload["rating"] = 3.5;

        // Get state of place
        if (userTastedIds.has(placeDoc.id)) {
          payload["state"] = "TASTED";
        } else if (userWantToTasteIds.has(placeDoc.id)) {
          payload["state"] = "WANT_TO_TASTE";
        } else if (friendsTastedIds.has(placeDoc.id)) {
          payload["state"] = "FRIENDS_TASTED";
        } else if (friendsWantToTasteIds.has(placeDoc.id)) {
          payload["state"] = "FRIENDS_WANT_TO_TASTE";
        } else {
          payload["state"] = "UNKNOWN";
        }

        if (top20PlacesWithMostPosts.includes(placeDoc.id)) {
          payload["iconStyle"] = "PIN";
        } else {
          payload["iconStyle"] = "DOT";
        }

        placesReturnData["places"].push(payload);
      });

      return placesReturnData;
    });
