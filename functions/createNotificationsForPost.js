/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

// Triggered when a post is created so we can create notification documents
exports.createNotificationsForPost = functions.firestore
    .document("/posts/{postId}")
    .onCreate(async (snap, context) => {
      functions.logger.log("Starting to process post to create notifications", context.params.postId);
      const data = snap.data();
      functions.logger.log("Dumping post data", data);

      const starRatingDescriptors = [
        "terrible",
        "bad",
        "okay",
        "good",
        "excellent",
      ];

      const zipCodesToCities = {};
      await db.collection("neighborhoods").get().then((snapshot) => {
        snapshot.docs.forEach((neighborhood) => {
          const neighborhoodData = neighborhood.data();
          const city = neighborhoodData.city;
          neighborhoodData.zipCode.forEach((zipCode) => {
            zipCodesToCities[zipCode] = city;
          });
        });
      });

      const postId = context.params.postId;
      const userId = data["user"]["_path"]["segments"][1];
      const placeId = data["place"]["_path"]["segments"][1];

      // Create document in 'queueposts' collection
      await db.collection("queueposts").add({
        postId: postId,
      });

      const starRating = data.starRating;

      const placeRef = db.collection("places").doc(placeId);
      const placeQds = await placeRef.get();
      const placeData = placeQds.data();

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      const userPostsRef = db.collection("posts").where("user", "==", userRef);
      const userPostsQds = await userPostsRef.get();
      const userPostsCount = userPostsQds.docs.length;

      const userFriends = userData.friends;
      for (const userFriend of userFriends) {
        const payload = {
          ownerId: userFriend.id,
          seen: false,
          timestamp: admin.firestore.Timestamp.now(),
        };

        const userFriendRef = db.collection("users").doc(userFriend.id);
        const userFriendQds = await userFriendRef.get();
        const userFriendData = userFriendQds.data();

        const userFriendTastedIds = [];
        const userFriendWantToTasteIds = [];
        userFriendData.tasted.forEach((place) => {
          userFriendTastedIds.push(place.id);
        });
        userFriendData.wantToTaste.forEach((place) => {
          userFriendWantToTasteIds.push(place.id);
        });

        if (userPostsCount == 1) {
          payload["type"] = "FriendFirstTaste";
          payload["title"] = `${userData.firstName} added their first taste`;
          payload["body"] = `They said ${placeData.name} was ${starRatingDescriptors[starRating - 1]}`;
          payload["notificationIcon"] = userId;
          payload["notificationLink"] = postId;
          functions.logger.log("Creating notification with payload", payload);
          await db.collection("notifications").add(payload);
        } else {
          if (userFriendTastedIds.includes(placeId)) {
            const userFriendPostRef = db.collection("posts").where("user", "==", userFriendRef).where("place", "==", placeRef).orderBy("timestamp", "desc").limit(1);
            const userFriendPostQds = await userFriendPostRef.get();
            const userFriendPostData = userFriendPostQds.docs[0].data();
            if (starRating == userFriendPostData.starRating) {
              payload["type"] = "FriendTastedPlaceYouTastedAgree";
              payload["title"] = `${userData.firstName} agrees with your taste`;
              payload["body"] = `They also said ${placeData.name} was ${starRatingDescriptors[starRating - 1]}`;
              payload["notificationIcon"] = userId;
              payload["notificationLink"] = postId;
              functions.logger.log("Creating notification with payload", payload);
              await db.collection("notifications").add(payload);
            } else {
              payload["type"] = "FriendTastedPlaceYouTastedDisagree";
              payload["title"] = `${userData.firstName} disagrees with your taste`;
              payload["body"] = `You said ${placeData.name} was ${starRatingDescriptors[userFriendPostData.starRating - 1]} but they said it was ${starRatingDescriptors[starRating - 1]}`;
              payload["notificationIcon"] = userId;
              payload["notificationLink"] = postId;
              functions.logger.log("Creating notification with payload", payload);
              await db.collection("notifications").add(payload);
            }
          } else if (userFriendWantToTasteIds.includes(placeId)) {
            payload["type"] = "FriendTastedPlaceYouWantToTaste";
            payload["title"] = `${userData.firstName} tasted ${placeData.name}`;
            payload["body"] = `You want to taste ${placeData.name} - see what they said`;
            payload["notificationIcon"] = userId;
            payload["notificationLink"] = postId;
            functions.logger.log("Creating notification with payload", payload);
            await db.collection("notifications").add(payload);
          } else if (starRating == 5) {
            payload["type"] = "FriendTastedPlaceYouHaveNotTasted";
            payload["title"] = `${userData.firstName} said ${placeData.name} was excellent`;
            payload["body"] = "Check out their taste";
            payload["notificationIcon"] = userId;
            payload["notificationLink"] = postId;
            functions.logger.log("Creating notification with payload", payload);
            await db.collection("notifications").add(payload);
          }
        }
      }
    });
