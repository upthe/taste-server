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

      // Calculate bounding box
      const minLatitude = centerLatitude - (latitudeRange / 2);
      const maxLatitude = centerLatitude + (latitudeRange / 2);
      const minLongitude = centerLongitude - (longitudeRange / 2);
      const maxLongitude = centerLongitude + (longitudeRange / 2);

      // Fetch places in the bounding box
      const placesFilterRef = db.collection("places")
          .where("longitude", ">", minLongitude)
          .where("longitude", "<", maxLongitude);
      const placesFilterQds = await placesFilterRef.get();
      const placesFilterData = placesFilterQds.docs.filter((placeDoc) => {
        const latitude = placeDoc.data()["latitude"];
        return minLatitude < latitude && latitude < maxLatitude;
      });

      // TODO: Filter places based on state

      // TODO: Pre-fetch places with the most posts to determine icon style

      // Populate dictionary to return
      const placesReturnData = {
        "places": [],
      };
      placesFilterData.forEach((placeDoc, i) => {
        const placeData = placeDoc.data();

        const payload = {
          "id": placeDoc.id,
          "name": placeData["name"],
          "cuisines": placeData["cuisines"] || [],
        };

        // TODO: Get social star rating of place
        payload["rating"] = 3.5;

        // TODO: Get state of place
        const tempStates = ["TASTED", "WANT_TO_TASTE", "FRIENDS_TASTED", "FRIENDS_WANT_TO_TASTE"];
        payload["state"] = tempStates[i % 4];

        // TODO: Set icon style of place
        payload["iconStyle"] = i < 20 ? "PIN" : "DOT";

        placesReturnData["places"].push(payload);
      });

      return placesReturnData;
    });
