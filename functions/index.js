/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

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

      const userId = data["user"]["_path"]["segments"][1];
      const placeId = data["place"]["_path"]["segments"][1];
      const starRating = data.starRating;
      const review = data.review;
      const trimmedReview = review.trim();

      const placeRef = db.collection("places").doc(placeId);
      const placeQds = await placeRef.get();
      const placeData = placeQds.data();

      let placeCity = "";
      const placeAddress = placeData.address;
      const placeAddressSplit = placeAddress.split(",");
      if (placeAddressSplit.length > 3) {
        const token = placeAddressSplit[placeAddressSplit.length - 2];
        const placeZipCode = token.substring(token.length - 5).trim();
        if (Object.keys(zipCodesToCities).includes(placeZipCode)) {
          placeCity = zipCodesToCities[placeZipCode];
        }
      }

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      const userPostsRef = db.collection("posts").where("user", "==", userRef);
      const userPostsQds = await userPostsRef.get();
      const userPostsCount = userPostsQds.docs.length;

      const userFriends = userData.friends;
      userFriends.forEach(async (userFriend) => {
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
          payload["title"] = `${userData.firstName} just added their first taste`;
          payload["body"] = `They said ${placeData.name} was ${starRatingDescriptors[starRating - 1]}`;
          payload["notificationIcon"] = userId;
          payload["notificationLink"] = placeId;
          functions.logger.log("Creating notification with payload", payload);
          db.collection("notifications").add(payload);
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
              payload["notificationLink"] = placeId;
              functions.logger.log("Creating notification with payload", payload);
              db.collection("notifications").add(payload);
            } else {
              payload["type"] = "FriendTastedPlaceYouTastedDisagree";
              payload["title"] = `${userData.firstName} disagrees with your taste`;
              payload["body"] = `You said ${placeData.name} was ${starRatingDescriptors[userFriendPostData.starRating - 1]} but they said it was ${starRatingDescriptors[starRating - 1]}`;
              payload["notificationIcon"] = userId;
              payload["notificationLink"] = placeId;
              functions.logger.log("Creating notification with payload", payload);
              db.collection("notifications").add(payload);
            }
          } else if (userFriendWantToTasteIds.includes(placeId)) {
            payload["type"] = "FriendTastedPlaceYouWantToTaste";
            payload["title"] = `${userData.firstName} just tasted ${placeData.name}`;
            payload["body"] = `You want to taste ${placeData.name} - see what they said`;
            payload["notificationIcon"] = userId;
            payload["notificationLink"] = placeId;
            functions.logger.log("Creating notification with payload", payload);
            db.collection("notifications").add(payload);
          } else if (placeCity == userFriendData.location && starRating >= 4) {
            payload["type"] = "FriendTastedPlaceYouHaveNotTasted";
            payload["title"] = `${userData.firstName} just tasted ${placeData.name}`;
            payload["body"] = `You haven't tasted ${placeData.name} yet - see what they said`;
            payload["notificationIcon"] = userId;
            payload["notificationLink"] = placeId;
            functions.logger.log("Creating notification with payload", payload);
            db.collection("notifications").add(payload);
          } else if (starRating == 5) {
            payload["type"] = "FriendTastedFiveStar";
            payload["title"] = `${userData.firstName} said ${placeData.name} was excellent`;
            payload["body"] = trimmedReview;
            payload["notificationIcon"] = userId;
            payload["notificationLink"] = placeId;
            functions.logger.log("Creating notification with payload", payload);
            db.collection("notifications").add(payload);
          }
        }
      });
    });

// Triggered when a notification is created so we can send notifications
// FUTURE: this function isn't truly idempotent and Cloud Functions doesn't guarantee single execution - just
// that there is an execution. In edge cases, users may get multiple notifications for the same event
exports.handleNotification = functions.firestore
    .document("/notifications/{notificationId}")
    .onCreate((snap, context) => {
      functions.logger.log("Starting to process notification", context.params.notificationId);
      const notifData = snap.data();
      functions.logger.log("Dumping notification data", notifData);

      return db.collection("users").doc(notifData.ownerId).get().then((qds) => {
        const userData = qds.data();
        const fcmToken = userData.fcmToken;
        if (!fcmToken) {
          functions.logger.log("FCM token is empty, dumping userData.handle and exiting", userData.handle);
          return;
        }

        const payload = admin.messaging.MessagingPayload = {
          notification: {
            title: notifData.title,
            body: notifData.body,
          },
        };
        functions.logger.log("Dumping userData.handle, fcmToken, payload, notifData.type, then sending message notification", userData.handle, fcmToken, payload, notifData.type);
        admin.messaging().sendToDevice(fcmToken, payload);
      });
    });

// Triggered every week so we can clear out streaks
exports.clearStreaks = functions
    .runWith({
      timeoutSeconds: 300,
    })
    .pubsub.schedule("0 8 * * 1") // 8:00am on Mondays
    .timeZone("America/New_York")
    .onRun((context) => {
      functions.logger.log("Starting to process clearing streaks");
      const now = admin.firestore.Timestamp.now();
      return db.collection("users").get().then((snapshot) => {
        snapshot.docs.forEach((user) => {
          db.collection("posts").where("user", "==", user.ref).orderBy("timestamp", "desc").limit(1).get().then((snapshot) => {
            const latestPost = snapshot.docs[0];
            const latestPostTimestamp = latestPost.data()["timestamp"];
            const diffDays = (now - latestPostTimestamp) / 60 / 60 / 24;
            if (diffDays > 7) {
              functions.logger.log("Clearing streak for user", user.id);
              user.ref.set({
                streakCount: 0,
              }, {merge: true});
            }
          });
        });
      });
    });

// Triggered every day so we can award badges
// FUTURE: we should probably cache the cusines for each place
exports.awardBadges = functions
    .runWith({
      timeoutSeconds: 300,
    })
    .pubsub.schedule("0 10 * * *") // 10:00am everyday
    .timeZone("America/New_York")
    .onRun(async (context) => {
      functions.logger.log("Starting to process awarding badges");
      const cuisineToBadgeFriendlyIdentifier = {
        "Bagel": "Tasted10BagelPlaces",
        "Bakery": "Tasted10BakeryPlaces",
        "Bar": "Tasted10BarPlaces",
        "Breakfast/Brunch": "Tasted10BreakfastBrunchPlaces",
        "Burger": "Tasted10BurgerPlaces",
        "Burrito/Taco": "Tasted10BurritoTacoPlaces",
        "Cafe": "Tasted10CafePlaces",
        "Chicken": "Tasted10ChickenPlaces",
        "Chinese": "Tasted10ChinesePlaces",
        "Dessert": "Tasted10DessertPlaces",
        "Ethiopian": "Tasted10EthiopianPlaces",
        "French": "Tasted10FrenchPlaces",
        "Indian": "Tasted10IndianPlaces",
        "Italian": "Tasted10ItalianPlaces",
        "Japanese": "Tasted10JapanesePlaces",
        "Korean": "Tasted10KoreanPlaces",
        "Mediterranean/Middle Eastern": "Tasted10MediterraneanMiddleEasternPlaces",
        "Mexican": "Tasted10MexicanPlaces",
        "New American": "Tasted10NewAmericanPlaces",
        "Pizza": "Tasted10PizzaPlaces",
        "Ramen": "Tasted10RamenPlaces",
        "Salad": "Tasted10SaladPlaces",
        "Southern": "Tasted10SouthernPlaces",
        "Sushi": "Tasted10SushiPlaces",
        "Thai": "Tasted10ThaiPlaces",
      };

      const badgeFriendlyIdentifiersToDetails = {};
      await db.collection("badges").get().then((snapshot) => {
        snapshot.docs.forEach((badge) => {
          const badgeData = badge.data();
          const badgeFriendlyIdentifier = badgeData.friendlyIdentifier;
          const badgeName = badgeData.name;
          const badgeDescription = badgeData.description;
          badgeFriendlyIdentifiersToDetails[badgeFriendlyIdentifier] = {
            name: badgeName,
            description: badgeDescription,
          };
        });
      });

      return db.collection("users").get().then(async (snapshot) => {
        snapshot.docs.forEach((user) => {
          const userData = user.data();
          const userBadgeFriendlyIdentifiers = userData.badgeFriendlyIdentifiers ? userData.badgeFriendlyIdentifiers : [];
          const userTastedPlaceRefs = userData.tasted ? userData.tasted : [];
          const userFriends = userData.friends ? userData.friends : [];
          const userCusinesToCount = {};

          const placeRefRequests = [];
          userTastedPlaceRefs.forEach((placeRef) => {
            placeRefRequests.push(placeRef.get().then((qds) => {
              const placeData = qds.data();
              if (placeData && "cuisines" in placeData) {
                placeData.cuisines.forEach((cuisine) => {
                  if (cuisine in userCusinesToCount) {
                    userCusinesToCount[cuisine] += 1;
                  } else {
                    userCusinesToCount[cuisine] = 1;
                  }
                });
              }
            }));
          });

          Promise.all(placeRefRequests).then(() => {
            Object.keys(cuisineToBadgeFriendlyIdentifier).forEach(async (cuisine) => {
              if (cuisine in userCusinesToCount && userCusinesToCount[cuisine] >= 10) {
                const badgeFriendlyIdentifier = cuisineToBadgeFriendlyIdentifier[cuisine];
                if (!userBadgeFriendlyIdentifiers.includes(badgeFriendlyIdentifier)) {
                  functions.logger.log("Awarding badge to user and creating notifications, dumping badgeFriendlyIdentifier, userData.handle", badgeFriendlyIdentifier, userData.handle);
                  await user.ref.update({
                    badgeFriendlyIdentifiers: admin.firestore.FieldValue.arrayUnion(badgeFriendlyIdentifier),
                  });

                  const badgeName = badgeFriendlyIdentifiersToDetails[badgeFriendlyIdentifier].name;

                  db.collection("notifications").add({
                    ownerId: user.id,
                    type: "BadgeAwardedToYou",
                    title: `You were awarded the ${badgeName} badge`,
                    body: "Go to your profile to see your badge",
                    notificationIcon: badgeFriendlyIdentifier,
                    notificationLink: user.id,
                    seen: false,
                    timestamp: admin.firestore.Timestamp.now(),
                  });

                  userFriends.forEach((userFriend) => {
                    db.collection("notifications").add({
                      ownerId: userFriend.id,
                      type: "BadgeAwardedToFriend",
                      title: `${userData.firstName} was awarded the ${badgeName} badge`,
                      body: "Go to their profile to see their badge",
                      notificationIcon: badgeFriendlyIdentifier,
                      notificationLink: user.id,
                      seen: false,
                      timestamp: admin.firestore.Timestamp.now(),
                    });
                  });
                }
              }
            });
          });
        });
      });
    });

// Triggered every day to set 'cuisines' field to be an empty list as needed
// so we can filter places for manual entry
exports.setEmptyCuisines = functions
    .pubsub.schedule("0 */6 * * *") // Every 6 hours
    .timeZone("America/New_York")
    .onRun((context) => {
      functions.logger.log("Starting to process setting empty cuisines");
      return db.collection("places").get().then((snapshot) => {
        snapshot.docs.forEach((place) => {
          const placeData = place.data();
          if (!Object.keys(placeData).includes("cuisines")) {
            functions.logger.log("Found place with no cuisines field, setting to list with element empty string, dumping place.id, placeData.name", place.id, placeData.name);
            place.ref.update({
              "cuisines": [""],
            });
          }
        });
      });
    });

// TEMP: keeping this around for now
// exports.createPost = functions
//     .pubsub.schedule("0 */6 * * *") // Every 6 hours
//     .onRun(async (context) => {
//       const docId = "000000";
//       await db.collection("posts").doc(docId).delete()
//       return db.collection("posts").doc(docId).set({
//         starRating: 5,
//         review: "some review",
//         dishes: "some dishes",
//         place: db.collection("places").doc("04454239dcb3e1bfd3670e834869b9f413a7379b49ebd926f317ca5d24b2ffef"),
//         user: db.collection("users").doc("ZL9uRDZXog21sG87hWMw"),
//         timestamp: admin.firestore.Timestamp.now(),
//       });
//     });
