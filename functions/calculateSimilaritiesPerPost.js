/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

exports.calculateSimilaritiesPerPost = functions.firestore
    .document("/posts/{postId}")
    .onCreate(async (snap, context) => {
      functions.logger.log("Starting to process calculate similarities per post", context.params.postId);
      const data = snap.data();

      const userId = data["user"]["_path"]["segments"][1];

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      const userTastedIds = new Set(userData.tasted.map((placeRef) => placeRef.id));

      const friendRefs = userData["friends"];
      for (const friendRef of friendRefs) {
        const friendQds = await friendRef.get();
        const friendData = friendQds.data();

        const friendTastedIds = new Set(friendData.tasted.map((placeRef) => placeRef.id));
        const commonTastedIds = Array.from(new Set([...userTastedIds].filter((i) => friendTastedIds.has(i))));

        if (commonTastedIds.length < 4) {
          continue;
        }

        const maxDiff = 4 * commonTastedIds.length;
        let diff = 0;
        for (const placeId of commonTastedIds) {
          // FUTURE: we should cache this result so we don't have to fetch for overlapping places
          const placeRef = db.collection("places").doc(placeId);
          const userPostsRef = db.collection("posts")
              .where("place", "==", placeRef)
              .where("user", "==", userRef);
          const friendPostsRef = db.collection("posts")
              .where("place", "==", placeRef)
              .where("user", "==", userRef);

          const userPostsQds = await userPostsRef.get();
          const friendPostsQds = await friendPostsRef.get();

          const userPostsData = userPostsQds.docs;
          const friendPostsData = friendPostsQds.docs;

          const userStarRatings = userPostsData.map((postDoc) => postDoc.data()["starRating"]);
          const friendStarRatings = friendPostsData.map((postDoc) => postDoc.data()["starRating"]);

          const userAvgStarRating = userStarRatings.reduce((a, b) => a + b) / userStarRatings.length;
          const friendAvgStarRating = friendStarRatings.reduce((a, b) => a + b) / friendStarRatings.length;

          diff += Math.abs(userAvgStarRating - friendAvgStarRating);
        }
        const score = (maxDiff - diff) / maxDiff;

        const similarityRef = db.collection("similarities")
            .where(`users.${userRef.id}`, "==", true)
            .where(`users.${friendRef.id}`, "==", true);
        const similarityQds = await similarityRef.get();
        const similarityData = similarityQds.docs;
        if (similarityData.length == 1) {
          functions.logger.log("Updating similarity of users", score, userRef.id, friendRef.id);
          db.collection("similarities").doc(similarityData[0].id).update({
            "score": score,
          });
        } else if (similarityData.length == 0) {
          functions.logger.log("Inserting similarity for users", score, userRef.id, friendRef.id);
          const users = {};
          users[userRef.id] = true;
          users[friendRef.id] = true;
          db.collection("similarities").add({
            "users": users,
            "score": score,
          });
        } else {
          functions.logger.log("WARNING: multiple similarities for users; omitting...", userRef.id, friendRef.id);
        }
      }
    });
