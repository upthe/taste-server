/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Example return data:
// {
//     "places": [
//         "id": "asdf1234",
//         "data": { <data> },
//         "state": "TASTED|WANT_TO_TASTE|FRIENDS_TASTED|FRIENDS_WANT_TO_TASTE",
//         "iconStyle": "PIN|DOT"
//     ]
// }
//
// Example query:
// fetchPlaces({userId: "ZL9uRDZXog21sG87hWMw", centerLatitude: 40.7357375, centerLongitude: -73.997685, latitudeRange: 0.074443, longitudeRange: 0.012352})
exports.fetchPlaces = functions
    .runWith({
      minInstances: 1,
    })
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process fetching places");

      // Get data from query
      const userId = data.userId;
      const centerLatitude = data.centerLatitude;
      const centerLongitude = data.centerLongitude;
      const latitudeRange = data.latitudeRange;
      const longitudeRange = data.longitudeRange;
      functions.logger.log("Dumping userId, centerLatitude, centerLongitude, latitudeRange, longitudeRange", userId, centerLatitude, centerLongitude, latitudeRange, longitudeRange);

      // Collect places user tasted, user wants to taste, friends tasted, friends want to taste
      functions.logger.log("Will process user data");
      const userTastedIds = new Set();
      const userWantToTasteIds = new Set();
      const friendsTastedIds = new Set();
      const friendsWantToTasteIds = new Set();

      // move this into parallel function
      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      userData.tasted.forEach((placeRef) => {
        userTastedIds.add(placeRef.id);
      });
      userData.wantToTaste.forEach((placeRef) => {
        userWantToTasteIds.add(placeRef.id);
      });
      functions.logger.log("Done processing user data");

      functions.logger.log("Enumerating friend requests");
      const friendRefRequests = [];
      userData.friends.forEach((friendRef) => {
        friendRefRequests.push(friendRef.get().then((qds) => {
          const data = qds.data();
          data.tasted.forEach((placeRef) => {
            friendsTastedIds.add(placeRef.id);
          });
          data.wantToTaste.forEach((placeRef) => {
            friendsWantToTasteIds.add(placeRef.id);
          });
        }));
      });
      functions.logger.log(`Will process ${friendRefRequests.length} friend requests`);
      await Promise.all(friendRefRequests);
      functions.logger.log(`Done processing ${friendRefRequests.length} number of friend requests`);

      const socialContextIds = new Set([...userTastedIds, ...userWantToTasteIds, ...friendsTastedIds, ...friendsWantToTasteIds]);

      // Calculate bounding box
      const minLatitude = centerLatitude - (latitudeRange / 2);
      const maxLatitude = centerLatitude + (latitudeRange / 2);
      const minLongitude = centerLongitude - (longitudeRange / 2);
      const maxLongitude = centerLongitude + (longitudeRange / 2);

      // Fetch places in the bounding box
      functions.logger.log("Filtering places based on bounding box");
      const placesLocationFilterRef = db.collection("places")
          .where("longitude", ">", minLongitude)
          .where("longitude", "<", maxLongitude);
      const placesLocationFilterQds = await placesLocationFilterRef.get();
      const placesLocationFilterData = placesLocationFilterQds.docs.filter((placeDoc) => {
        const latitude = placeDoc.data()["latitude"];
        return minLatitude < latitude && latitude < maxLatitude;
      });
      functions.logger.log("Done filtering places based on bounding box");

      // Filter for places with social context
      functions.logger.log("Filtering places with social context");
      const placesSocialFilterData = placesLocationFilterData.filter((placeDoc) => {
        return socialContextIds.has(placeDoc.id);
      });
      functions.logger.log("Done filtering places with social context");

      // Short-circuit if too many places in bounding box with social context
      functions.logger.log("Determining whether to short-circuit");
      if (placesSocialFilterData.length > 40) {
        functions.logger.log(`Returning because too many places (${placesSocialFilterData.length}) with social context`);
        return {
          "places": [],
          "error": `Too many places (${placesSocialFilterData.length}) with social context`,
        };
      } else {
        functions.logger.log(`Will process ${placesSocialFilterData.length} places with social context`);
      }

      // Pre-fetch places with the most posts to determine icon style
      functions.logger.log("Will sort places based on post count");
      const sortedPlacesWithMostPosts = placesSocialFilterData.sort((placeDocA, placeDocB) => {
        const postsCountA = placeDocA.data()["postsCount"] || 0;
        const postsCountB = placeDocB.data()["postsCount"] || 0;
        return postsCountB - postsCountA;
      });
      const pinIconPlaceIds = sortedPlacesWithMostPosts.slice(0, 20).map((placeDoc) => placeDoc.id);
      functions.logger.log("Done sorting places based on post count");

      // Get star rating for pin icon places
      functions.logger.log("Creating chunked friend list for posts queries");
      const friendRefs = userData.friends;
      friendRefs.push(userRef);

      const chunkedFriendRefs = [];
      const firebaseQueryLimit = 10;
      let index = 0;
      while (index < friendRefs.length) {
        const limitIndex = Math.min(index + firebaseQueryLimit, friendRefs.length);
        const chunk = friendRefs.slice(index, limitIndex);
        chunkedFriendRefs.push(chunk);
        index += firebaseQueryLimit;
      }
      functions.logger.log(`Done creating ${chunkedFriendRefs.length} chunked friend list for post queries`);

      functions.logger.log("Enumerating place posts requests");
      const placeIdsToPostsQS = {};
      const placePostsRequests = [];
      pinIconPlaceIds.forEach((placeId) => {
        const placeRef = db.collection("places").doc(placeId);
        chunkedFriendRefs.forEach((chunk) => {
          const postsRef = db.collection("posts")
              .where("place", "==", placeRef)
              .where("user", "in", chunk);
          placePostsRequests.push(postsRef.get().then((qds) => {
            const postsDocs = qds.docs;
            if (placeId in placeIdsToPostsQS) {
              placeIdsToPostsQS[placeId].push(...postsDocs);
            } else {
              placeIdsToPostsQS[placeId] = postsDocs;
            }
          }));
        });
      });
      functions.logger.log(`Will process ${placePostsRequests.length} place posts requests`);
      await Promise.all(placePostsRequests);
      functions.logger.log(`Done processing ${placePostsRequests.length} place posts request`);

      // Populate dictionary to return
      functions.logger.log("Will populate places return data");
      const placesReturnData = {
        "places": [],
        "error": null,
      };
      placesSocialFilterData.forEach((placeDoc, i) => {
        const placeData = placeDoc.data();

        const payload = {
          "id": placeDoc.id,
          "data": placeData,
          "iconStyle": "DOT", // Default
          "starRating": 0.0, // Default
        };

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

        if (pinIconPlaceIds.includes(placeDoc.id)) {
          const placePostQS = placeIdsToPostsQS[placeDoc.id];
          const starRatings = placePostQS.map((post) => post.get("starRating"));
          if (starRatings.length > 0) {
            const averageStarRating = starRatings.reduce((prev, curr) => prev + curr) / starRatings.length;
            payload["iconStyle"] = "PIN";
            payload["starRating"] = averageStarRating;
          }
        }

        placesReturnData["places"].push(payload);
      });

      functions.logger.log("Done populating places return data, returning");
      return placesReturnData;
    });
