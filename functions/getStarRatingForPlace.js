/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Example return data:
// {
//     "starRating": 4.5
// }
//
// Example query:
// getStarRatingForPlace({placeId: "a2ed1beb210ef0a28d8a16f36997495adb05e78a3e1ef67080390d2fea27c415", userId: "ZL9uRDZXog21sG87hWMw"})
exports.getStarRatingForPlace = functions
    .runWith({
      minInstances: 3,
    })
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process getting star rating for place");

      // Get data from query
      const placeId = data.placeId;
      const userId = data.userId;
      functions.logger.log("Dumping placeId, userId", placeId, userId);

      // Get place reference and user data
      const placeRef = db.collection("places").doc(placeId);

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      const friendRefs = userData["friends"];
      friendRefs.push(userRef);

      // Chunk friend references to prepare for posts queries
      const chunkedFriendRefs = [];
      const firebaseQueryLimit = 10;
      let index = 0;
      while (index < friendRefs.length) {
        const limitIndex = Math.min(index + firebaseQueryLimit, friendRefs.length);
        const chunk = friendRefs.slice(index, limitIndex);
        chunkedFriendRefs.push(chunk);
        index += firebaseQueryLimit;
      }

      // Execute post queries and collect
      const allPostsData = [];
      for (const chunk of chunkedFriendRefs) {
        const postsRef = db.collection("posts")
            .where("place", "==", placeRef)
            .where("user", "in", chunk);
        const postsQds = await postsRef.get();
        const postsData = postsQds.docs;
        allPostsData.push(...postsData);
      }

      // Calculate average star rating and return
      const starRatings = allPostsData.map((postDoc) => postDoc.data()["starRating"]);
      const averageStarRating = starRatings.reduce((prev, curr) => prev + curr) / starRatings.length;
      return {
        "starRating": averageStarRating,
      };
    });
