/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const db = admin.firestore();

// Triggered when a post is created so we can create notification documents
exports.createNotificationsForPost = functions.firestore
    .document("/posts/{postId}")
    .onCreate((snap, context) => {
      functions.logger.log("Starting to process post to create notifications", context.params.postId);
      const data = snap.data();
      functions.logger.log("Dumping post data", data);

      const userId = data["user"]["_path"]["segments"][1];
      const placeId = data["place"]["_path"]["segments"][1];
      const favorited = data.favorited;

      return db.collection("users").doc(userId).get().then((qds) => {
        const userData = qds.data();
        const userFriends = userData.friends;

        userFriends.forEach((userFriend) => {
          const userFriendId = userFriend.id;
          const documentId = btoa(context.eventId.concat(userFriendId));
          db.collection("users").doc(userFriendId).get().then((qds) => {
            const userFriendData = qds.data();

            const userFriendFavoritesIds = [];
            const userFriendTastedIds = [];
            const userFriendWantToTasteIds = [];
            userFriendData.favorites.forEach((place) => {
              userFriendFavoritesIds.push(place.id);
            });
            userFriendData.tasted.forEach((place) => {
              userFriendTastedIds.push(place.id);
            });
            userFriendData.wantToTaste.forEach((place) => {
              userFriendWantToTasteIds.push(place.id);
            });

            const payload = {
              ownerId: userFriendId,
              notificationDataUserId: userId,
              notificationDataPlaceId: placeId,
              seen: false,
              timestamp: admin.firestore.Timestamp.now(),
            };

            if (favorited) {
              if (userFriendFavoritesIds.includes(placeId)) {
                functions.logger.log("Triggered case FriendFavoritedPlaceYouFavorited, creating document; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
                payload["type"] = "FriendFavoritedPlaceYouFavorited";
                db.collection("notifications").doc(documentId).set(payload);
              } else if (userFriendTastedIds.includes(placeId)) {
                functions.logger.log("Triggered case FriendFavoritedPlaceYouTasted, creating document; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
                payload["type"] = "FriendFavoritedPlaceYouTasted";
                db.collection("notifications").doc(documentId).set(payload);
              } else if (userFriendWantToTasteIds.includes(placeId)) {
                functions.logger.log("Triggered case FriendFavoritedPlaceYouWantToTaste, creating document; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
                payload["type"] = "FriendFavoritedPlaceYouWantToTaste";
                db.collection("notifications").doc(documentId).set(payload);
              } else {
                functions.logger.log("Triggered case FriendFavoritedPlace, creating document; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
                payload["type"] = "FriendFavoritedPlace";
                db.collection("notifications").doc(documentId).set(payload);
              }
            } else {
              if (userFriendFavoritesIds.includes(placeId)) {
                functions.logger.log("Triggered case FriendTastedPlaceYouFavorited, creating document; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
                payload["type"] = "FriendTastedPlaceYouFavorited";
                db.collection("notifications").doc(documentId).set(payload);
              } else if (userFriendWantToTasteIds.includes(placeId)) {
                functions.logger.log("Triggered case FriendTastedPlaceYouWantToTaste, creating document; dumping userId, userFriendId, placeId", userId, userFriendId, placeId);
                payload["type"] = "FriendTastedPlaceYouWantToTaste";
                db.collection("notifications").doc(documentId).set(payload);
              }
            }
          });
        });
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

      const ownerId = notifData.ownerId;
      const type = notifData.type;

      return db.collection("users").doc(ownerId).get().then((qds) => {
        const userData = qds.data();
        const fcmToken = userData.fcmToken;
        if (!fcmToken) {
          functions.logger.log("FCM token is empty, dumping userData.handle and exiting", userData.handle);
          return;
        }

        if (type == "BadgeAwarded") {
          // Data fields: notificationDataBadgeFriendlyIdentifier
          const notifDataBadgeFriendlyIdentifier = notifData.notificationDataBadgeFriendlyIdentifier;
          return db.collection("badges").where("friendlyIdentifier", "==", notifDataBadgeFriendlyIdentifier).get().then((snapshot) => {
            const badge = snapshot.docs[0];
            const badgeData = badge.data();

            const title = `You've been awarded the ${badgeData.name} badge`;
            const body = "You can find this badge in your profile now";

            const payload = admin.messaging.MessagingPayload = {
              notification: {
                title: title,
                body: body,
              },
            };
            functions.logger.log("Dumping userData.handle, fcmToken, payload, then sending message notification", userData.handle, fcmToken, payload);
            admin.messaging().sendToDevice(fcmToken, payload);
          });
        } else {
          // Data fields: notificationDataUserId, notificationDataPlaceId
          const notifDataUserId = notifData.notificationDataUserId;
          const notifDataPlaceId = notifData.notificationDataPlaceId;

          db.collection("users").doc(notifDataUserId).get().then((qds) => {
            const notificationUserData = qds.data();
            const userFirstName = notificationUserData.firstName;

            db.collection("places").doc(notifDataPlaceId).get().then((qds) => {
              const notificationPlaceData = qds.data();
              const placeName = notificationPlaceData.name;

              let title = "";
              let body = "";

              // FUTURE: this needs to change given no favorites
              switch (type) {
                case "FriendFavoritedPlaceYouFavorited":
                  title = `${userFirstName} favorited ${placeName}`;
                  body = `You also favorited ${placeName} - see what ${userFirstName} said`;
                  break;
                case "FriendFavoritedPlaceYouTasted":
                  title = `${userFirstName} favorited ${placeName}`;
                  body = `You tasted ${placeName} - see what ${userFirstName} said`;
                  break;
                case "FriendFavoritedPlaceYouWantToTaste":
                  title = `${userFirstName} favorited ${placeName}`;
                  body = `You want to taste ${placeName} - see what ${userFirstName} said before you go`;
                  break;
                case "FriendFavoritedPlace":
                  title = `${userFirstName} favorited ${placeName}`;
                  body = `See what ${userFirstName} said`;
                  break;
                case "FriendTastedPlaceYouFavorited":
                  title = `${userFirstName} tasted ${placeName}`;
                  body = `You favorited ${placeName} - see what ${userFirstName} said`;
                  break;
                case "FriendTastedPlaceYouWantToTaste":
                  title = `${userFirstName} tasted ${placeName}`;
                  body = `You want to taste ${placeName} - see what ${userFirstName} said before you go`;
                  break;
                default:
                  return;
              }

              const payload = admin.messaging.MessagingPayload = {
                notification: {
                  title: title,
                  body: body,
                },
              };
              functions.logger.log("Dumping userData.handle, fcmToken, payload, then sending message notification", userData.handle, fcmToken, payload);
              admin.messaging().sendToDevice(fcmToken, payload);
            });
          });
        }
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
          functions.logger.log("Processing user", user.id, user.data().firstName);
          db.collection("posts").where("user", "==", user.ref).orderBy("timestamp", "desc").limit(1).get().then((snapshot) => {
            const latestPost = snapshot.docs[0];
            const latestPostTimestamp = latestPost.data()["timestamp"];
            const diffDays = (now - latestPostTimestamp) / 60 / 60 / 24;
            functions.logger.log("Dumping latest post, user, diffDays", latestPost.id, user.id, diffDays);
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
    .onRun((context) => {
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

      return db.collection("users").get().then(async (snapshot) => {
        snapshot.docs.forEach((user) => {
          functions.logger.log("Processing user", user.id);
          const userData = user.data();
          const userBadgeFriendlyIdentifiers = userData.badgeFriendlyIdentifiers ? userData.badgeFriendlyIdentifiers : [];
          const userTastedPlaceRefs = userData.tasted ? userData.tasted : [];
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
              if (cuisine in userCusinesToCount && userCusinesToCount[cuisine] > 9) {
                const badgeFriendlyIdentifier = cuisineToBadgeFriendlyIdentifier[cuisine];
                if (!userBadgeFriendlyIdentifiers.includes(badgeFriendlyIdentifier)) {
                  functions.logger.log("Awarding badge to user and creating notification, dumping badgeFriendlyIdentifier, userData.handle:", badgeFriendlyIdentifier, userData.handle);
                  user.ref.update({
                    badgeFriendlyIdentifiers: admin.firestore.FieldValue.arrayUnion(badgeFriendlyIdentifier),
                  });
                  const notificationDocumentId = Buffer.from(context.eventId.concat(badgeFriendlyIdentifier)).toString("base64");
                  await db.collection("notifications").doc(notificationDocumentId).set({
                    ownerId: user.id,
                    notificationDataBadgeFriendlyIdentifier: badgeFriendlyIdentifier,
                    type: "BadgeAwarded",
                    seen: false,
                    timestamp: admin.firestore.Timestamp.now(),
                  });
                }
              }
            });
          });
        });
      });
    });
