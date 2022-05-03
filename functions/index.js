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

      const postId = context.params.postId;
      const userId = data["user"]["_path"]["segments"][1];
      const placeId = data["place"]["_path"]["segments"][1];

      // Create document in 'queueposts' collection
      await db.collection("queueposts").add({
        postId: postId,
      });

      const starRating = data.starRating;
      const review = data.review;
      const trimmedReview = review.trim();

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
          payload["notificationLink"] = postId;
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
              payload["notificationLink"] = postId;
              functions.logger.log("Creating notification with payload", payload);
              db.collection("notifications").add(payload);
            } else {
              payload["type"] = "FriendTastedPlaceYouTastedDisagree";
              payload["title"] = `${userData.firstName} disagrees with your taste`;
              payload["body"] = `You said ${placeData.name} was ${starRatingDescriptors[userFriendPostData.starRating - 1]} but they said it was ${starRatingDescriptors[starRating - 1]}`;
              payload["notificationIcon"] = userId;
              payload["notificationLink"] = postId;
              functions.logger.log("Creating notification with payload", payload);
              db.collection("notifications").add(payload);
            }
          } else if (userFriendWantToTasteIds.includes(placeId)) {
            payload["type"] = "FriendTastedPlaceYouWantToTaste";
            payload["title"] = `${userData.firstName} just tasted ${placeData.name}`;
            payload["body"] = `You want to taste ${placeData.name} - see what they said`;
            payload["notificationIcon"] = userId;
            payload["notificationLink"] = postId;
            functions.logger.log("Creating notification with payload", payload);
            db.collection("notifications").add(payload);
          } else if (starRating == 5) {
            payload["type"] = "FriendTastedPlaceYouHaveNotTasted";
            payload["title"] = `${userData.firstName} said ${placeData.name} was excellent`;
            payload["body"] = trimmedReview;
            payload["notificationIcon"] = userId;
            payload["notificationLink"] = postId;
            functions.logger.log("Creating notification with payload", payload);
            db.collection("notifications").add(payload);
          }
        }
      });
    });

exports.createNotificationsForPostReply = functions.firestore
    .document("/posts/{postId}/replies/{replyId}")
    .onCreate(async (snap, context) => {
      functions.logger.log("Starting to process post reply to create notifications", context.params.postId);
      const data = snap.data();
      functions.logger.log("Dumping reply data", data);

      const postId = context.params.postId;
      const replyId = context.params.replyId;

      const postRef = db.collection("posts").doc(postId);
      const postQds = await postRef.get();
      const postData = postQds.data();

      const placeRef = db.collection("places").doc(postData.place.id);
      const placeQds = await placeRef.get();
      const placeData = placeQds.data();

      const replyRef = postRef.collection("replies").doc(replyId);
      const replyQds = await replyRef.get();
      const replyData = replyQds.data();

      // Get the owner of the post
      const postOwnerRef = db.collection("users").doc(postData.user.id);
      const postOwnerQds = await postOwnerRef.get();
      const postOwnerData = postOwnerQds.data();

      // Get the person who replied
      const replyOwnerId = replyData.owner.id;
      const replyOwnerRef = db.collection("users").doc(replyOwnerId);
      const replyOwnerQds = await replyOwnerRef.get();
      const replyOwnerData = replyOwnerQds.data();

      // Get the people who've replied already (and remove the post owner and person who just replied)
      const setExistingRepliesOwnerIds = new Set();
      await postRef.collection("replies").get().then((snapshot) => {
        snapshot.docs.forEach((replyQds) => {
          setExistingRepliesOwnerIds.add(replyQds.data()["owner"]["_path"]["segments"][1]);
        });
      });
      setExistingRepliesOwnerIds.delete(postData.user.id);
      setExistingRepliesOwnerIds.delete(replyOwnerId);
      const existingRepliesOwnerIds = [...new Set(setExistingRepliesOwnerIds)];

      // Send notification to owner of post
      if (postData.user.id != replyOwnerId) {
        const payload = {
          ownerId: postData.user.id,
          type: "FriendRepliedToYourTaste",
          title: `${replyOwnerData.firstName} replied to your taste of ${placeData.name}`,
          body: `${replyData.reply}`,
          notificationIcon: replyOwnerId,
          notificationLink: postId,
          seen: false,
          timestamp: admin.firestore.Timestamp.now(),
        };
        functions.logger.log("Creating notification with payload (FriendRepliedToYourTaste)", payload);
        await db.collection("notifications").add(payload);
      }

      // Send notifications to everyone that's replied so far
      existingRepliesOwnerIds.forEach((existingReplyOwnerId) => {
        const payload = {
          ownerId: existingReplyOwnerId,
          type: "UserRepliedToTaste",
          title: `${replyOwnerData.firstName} replied to a taste you're following`,
          body: `They replied to ${postOwnerData.firstName}'s taste of ${placeData.name} - see what they said`,
          notificationIcon: replyOwnerId,
          notificationLink: postId,
          seen: false,
          timestamp: admin.firestore.Timestamp.now(),
        };
        functions.logger.log("Creating notification with payload (UserRepliedToTaste)", payload);
        db.collection("notifications").add(payload);
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
            if (snapshot.docs.length == 0) {
              return;
            }

            const latestPostSnapshot = snapshot.docs[0];
            const latestPostTimestamp = latestPostSnapshot.data()["timestamp"];
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

// Triggered whenever a "want to taste" is added so we can send their friends notifications
exports.addWantToTaste = functions
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process want to taste");
      const userId = data.userId;
      const placeId = data.placeId;

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      const placeRef = db.collection("places").doc(placeId);
      const placeQds = await placeRef.get();
      const placeData = placeQds.data();

      // Create document in 'queuewanttotastes' collection
      await db.collection("queuewanttotastes").add({
        user: userRef,
        place: placeRef,
        timestamp: admin.firestore.Timestamp.now(),
      });

      const userFriends = await db.collection("users").where("friends", "array-contains", userRef).get();
      userFriends.forEach(async (userFriend) => {
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

        if (userFriendTastedIds.includes(placeId)) {
          const userFriendPostRef = db.collection("posts").where("user", "==", userFriendRef).where("place", "==", placeRef).orderBy("timestamp", "desc").limit(1);
          const userFriendPostQds = await userFriendPostRef.get();
          const userFriendPostData = userFriendPostQds.docs[0].data();
          if (userFriendPostData.starRating >= 4) {
            functions.logger.log("Creating notification for FriendWantsToTastePlaceYouTasted, dumping userData.handle, userFriendData.handle, placeData.name, placeId", userData.handle, userFriendData.handle, placeData.name, placeId);
            db.collection("notifications").add({
              ownerId: userFriend.id,
              type: "FriendWantsToTastePlaceYouTasted",
              title: `${userData.firstName} wants to taste ${placeData.name}`,
              body: "Your taste helped them discover this place - keep it up",
              notificationIcon: userId,
              notificationLink: placeId,
              seen: false,
              timestamp: admin.firestore.Timestamp.now(),
            });
          }
        }

        if (userFriendWantToTasteIds.includes(placeId)) {
          functions.logger.log("Creating notification for FriendWantsToTastePlaceYouWantToTaste, dumping userData.handle, userFriendData.handle, placeData.name, placeId", userData.handle, userFriendData.handle, placeData.name, placeId);
          db.collection("notifications").add({
            ownerId: userFriend.id,
            type: "FriendWantsToTastePlaceYouWantToTaste",
            title: `${userData.firstName} just said they want to taste ${placeData.name}`,
            body: `You also want to taste ${placeData.name} - maybe you can go with them?`,
            notificationIcon: userId,
            notificationLink: placeId,
            seen: false,
            timestamp: admin.firestore.Timestamp.now(),
          });
        }
      });
    });

// Triggered whenever a reaction is added to a post so we can send notifications
exports.addPostReaction = functions
    .https.onCall(async (data, context) => {
      functions.logger.log("Starting to process post reaction");
      const userId = data.userId;
      const postId = data.postId;
      const emojiCode = parseInt(data.emojiCode);

      const emojiHex = emojiCode.toString(16);
      const emojiString = String.fromCodePoint(parseInt(emojiHex, 16));

      const userRef = db.collection("users").doc(userId);
      const userQds = await userRef.get();
      const userData = userQds.data();

      const postRef = db.collection("posts").doc(postId);
      const postQds = await postRef.get();
      const postData = postQds.data();

      const postPlaceQds = await postData.place.get();
      const postPlaceData = postPlaceQds.data();
      const placeName = postPlaceData.name;

      const payload = {
        ownerId: postData.user.id,
        type: "UserReactedToTaste",
        title: `${userData.firstName} reacted ${emojiString} to your taste`,
        body: `They reacted to your taste of ${placeName}`,
        notificationIcon: userId,
        notificationLink: postId,
        seen: false,
        timestamp: admin.firestore.Timestamp.now(),
      };
      functions.logger.log("Creating notification with payload", payload);
      db.collection("notifications").add(payload);
    });

// // Triggered every week so we can figure out which users are Taste Emerald
// exports.setEmeraldUsers = functions
//     .runWith({
//       timeoutSeconds: 300,
//     })
//     .pubsub.schedule("0 20 * * 2") // 8:00pm on Tuesdays
//     .timeZone("America/New_York")
//     .onRun(async (context) => {
//       functions.logger.log("Starting to process setting Taste Emerald users");
//       const userIdsToEmeraldCredsTuples = [];
//       const curEmeraldUserIds = [];

//       const userCollection = db.collection("users");
//       const userCollectionQds = await userCollection.get();
//       const userCollectionDocs = userCollectionQds.docs;
//       const userIdsToUserData = {};
//       for (const userDoc of userCollectionDocs) {
//         const userData = userDoc.data();
//         userIdsToUserData[userDoc.id] = userData;
//         if (userData.emeraldCreds) {
//           userIdsToEmeraldCredsTuples.push([userDoc.id, userData.emeraldCreds]);
//         } else {
//           userIdsToEmeraldCredsTuples.push([userDoc.id, 0]);
//         }
//         if (userData.emerald) {
//           curEmeraldUserIds.push(userDoc.id);
//         }
//       }

//       userIdsToEmeraldCredsTuples.sort(function(i, j) {
//         return j[1] - i[1];
//       });
//       userIdsToEmeraldCredsTuples.slice(0, userIdsToEmeraldCredsTuples.length * 0.1);
//       const newEmeraldUserIds = [];
//       // FUTURE: we might be arbitrarily picking someone if there's a tie, should probably handle this
//       for (const userIdToEmeraldCredsTuple of userIdsToEmeraldCredsTuples.slice(0, userIdsToEmeraldCredsTuples.length * 0.1)) {
//         newEmeraldUserIds.push(userIdToEmeraldCredsTuple[0]);
//       }

//       const awardingEmeraldUserIds = [];
//       const removingEmeraldUserIds = [];
//       for (const userId of newEmeraldUserIds) {
//         if (!curEmeraldUserIds.includes(userId)) {
//           awardingEmeraldUserIds.push(userId);
//         }
//       }
//       for (const userId of curEmeraldUserIds) {
//         if (!newEmeraldUserIds.includes(userId)) {
//           removingEmeraldUserIds.push(userId);
//         }
//       }

//       awardingEmeraldUserIds.forEach(async (userId) => {
//         functions.logger.log("Awarding Taste Emerald to user and sending notifications", userId);
//         // const userData = userIdsToUserData[userId];
//         await db.collection("users").doc(userId).update({
//           emerald: true,
//         });
//         // payload = {
//         //   ownerId: userId,
//         //   type: "YouWereAwardedTasteEmerald",
//         //   title: `Congratulations, ${userData.firstName} - you were awarded Taste Emerald`,
//         //   body: "you have dope recs",
//         //   notificationIcon: "",
//         //   notificationLink: "",
//         //   seen: false,
//         //   timestamp: admin.firestore.Timestamp.now(),
//         // }
//         // db.collection("notifications").add(payload);
//         // TODO: send notification to friends
//       });

//       removingEmeraldUserIds.forEach(async (userId) => {
//         functions.logger.log("Removing Taste Emerald from user and sending notifications", userId);
//         // const userData = userIdsToUserData[userId];
//         await db.collection("users").doc(userId).update({
//           emerald: false,
//         });
//         // payload = {
//         //   ownerId: userId,
//         //   type: "YouWereAwardedTasteEmerald",
//         //   title: `You've lost your Taste Emerald status`,
//         //   body: "wow that sucks",
//         //   notificationIcon: "",
//         //   notificationLink: "",
//         //   seen: false,
//         //   timestamp: admin.firestore.Timestamp.now(),
//         // }
//         // db.collection("notifications").add(payload);
//         // TODO: send notification to user
//       });
//     });

// exports.createNotificationsForBatchPosts = functions
//     .pubsub.schedule("0 21 * * *") // 9:00pm everyday
//     .timeZone("America/New_York")
//     .onRun(async (context) => {
//       functions.logger.log("Starting to process batch posts");
//       const dayAgoDate = new Date(admin.firestore.Timestamp.now().seconds * 1000 - (24 * 60 * 60 * 1000));
//       const userIdsToFirstName = {};
//       const userIdsToNewPlacesTastedIds = {};
//       const userIdsToFriendIds = {};
//       const userIdsToTastedPlaceIds = {};
//       const userIdsToWantToTastePlaceIds = {};

//       const usersSnapshot = await db.collection("users").get();
//       for (const user of usersSnapshot.docs) {
//         const userData = user.data();
//         const userNewPlacesTastedIds = [];
//         const userFriendIds = [];
//         const userTastedIds = [];
//         const userWantToTasteIds = [];

//         const postsSnapshot = await db.collection("posts").where("user", "==", user.ref).where("timestamp", ">=", dayAgoDate).get();
//         for (const post of postsSnapshot.docs) {
//           const postData = post.data();
//           userNewPlacesTastedIds.push(postData["place"].id);
//         }

//         userData["friends"].forEach((friendRef) => {
//           userFriendIds.push(friendRef.id);
//         })
//         userData["tasted"].forEach((placeRef) => {
//           userTastedIds.push(placeRef.id);
//         });
//         userData["wantToTaste"].forEach((placeRef) => {
//           userWantToTasteIds.push(placeRef.id);
//         });

//         userIdsToFirstName[user.id] = userData["firstName"];
//         userIdsToNewPlacesTastedIds[user.id] = userNewPlacesTastedIds;
//         userIdsToTastedPlaceIds[user.id] = userTastedIds;
//         userIdsToWantToTastePlaceIds[user.id] = userWantToTasteIds;
//         userIdsToFriendIds[user.id] = userFriendIds;
//       }

//       Object.keys(userIdsToNewPlacesTastedIds).forEach((userId) => {
//         const newPlacesTastedIds = new Set([...userIdsToNewPlacesTastedIds[userId]]);
//         if (newPlacesTastedIds.size == 0) {
//           return;
//         }

//         const userFirstName = userIdsToFirstName[userId];
//         const userFriendIds = userIdsToFriendIds[userId];
//         for (const userFriendId of userFriendIds) {
//           const friendTastedIds = new Set([...userIdsToTastedPlaceIds[userFriendId]]);
//           const friendWantToTasteIds = new Set([...userIdsToWantToTastePlaceIds[userFriendId]]);
//           const relevantPlaceIds = new Set([...newPlacesTastedIds].filter(p => !friendTastedIds.has(p)).filter(p => !friendWantToTasteIds.has(p)));
//           if (relevantPlaceIds.size < 2) {
//             continue;
//           }

//           const title = `${userFirstName} tasted ${relevantPlaceIds.size} ${relevantPlaceIds.size == 1 ? "place" : "places"} in the last day`;
//           const body = `You haven't heard of ${relevantPlaceIds.size == 1 ? "this place" : "these places"} - go to their profile to check ${relevantPlaceIds.size == 1 ? "it" : "them"} out`;
//           functions.logger.log(userIdsToFirstName[userFriendId]);
//           functions.logger.log(title);
//           functions.logger.log(body);
//           functions.logger.log();

//           payload = {
//             ownerId: userFriendId,
//             type: "FriendTastedPlacesYouDoNotKnow",
//             title: title,
//             body: body,
//             notificationIcon: userId,
//             notificationLink: userId,
//             seen: false,
//             timestamp: admin.firestore.Timestamp.now(),
//           }
//           // functions.logger.log(payload);
//           // db.collection("notifications").add({
//           //   ownerId: userFriendId,
//           //   type: "FriendTastedPlacesYouDoNotKnow",
//           //   title: `${userFirstName} tasted ${relevantPlaceIds.size} ${relevantPlaceIds.size == 1 ? "place" : "places"} in the last day`,
//           //   body: "You haven't heard of these places - go to their profile to check them out",
//           //   notificationIcon: userId,
//           //   notificationLink: userId,
//           //   seen: false,
//           //   timestamp: admin.firestore.Timestamp.now(),
//           // });
//         }
//       });
//     });

// // TEMP: keeping this around for now
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

// // TEMP: keeping this around for now, too
// exports.createReply = functions
//     .pubsub.schedule("0 */6 * * *") // Every 6 hours
//     .onRun(async (context) => {
//       const docId = "000000";
//       return db.collection("posts").doc(docId).collection("replies").add({
//         "owner": db.collection("users").doc("AxbXPlEJ6xmTSEDXwffY"),
//         "reply": "some reply",
//         "timestamp": admin.firestore.Timestamp.now()
//       });
//     });
