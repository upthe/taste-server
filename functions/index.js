const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

exports.addTaste = functions.firestore.document("/posts/{postId}")
    .onCreate((snap, context) => {
      functions.logger.log("Starting to process post", context.params.postId);
      const data = snap.data();
      functions.logger.log("Dumping post data", data);

      const userId = data["user"]["_path"]["segments"][1];
      const placeId = data["place"]["_path"]["segments"][1];

      var friendsWhoFavorited = []
      var friendsWhoTasted = []

      return db.collection("users").doc(userId).get().then((userDoc) => {
        functions.logger.log("userDoc", userDoc);
        const allFriends = userDoc.data().friends;
        functions.logger.log("all friends", allFriends);
        allFriends.forEach()
      });

      // const favorited = data.favorited;

      // if (favorited) {
      //   for (var friend : friendsWhoFavorited) {
      //     return
      //   }
      //   for (var friend : friendsWhoTasted) {
      //     return
      //   }
      // } else {
      //   for (var friend : friendsWhoFavorited) {
      //     return
      //   }
      //   for (var friend : friendsWhoTasted) {
      //     return
      //   }
      // }
    });
