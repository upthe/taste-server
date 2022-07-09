/* eslint-disable max-len */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const db = admin.firestore();

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

      await db.collection("users").get().then(async (snapshot) => {
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

          return Promise.all(placeRefRequests).then(() => {
            functions.logger.log("Dumping user handle and user cuisines to count", userData.handle, userCusinesToCount);
            Object.keys(cuisineToBadgeFriendlyIdentifier).forEach(async (cuisine) => {
              if (cuisine in userCusinesToCount && userCusinesToCount[cuisine] >= 10) {
                const badgeFriendlyIdentifier = cuisineToBadgeFriendlyIdentifier[cuisine];
                if (!userBadgeFriendlyIdentifiers.includes(badgeFriendlyIdentifier)) {
                  functions.logger.log("Awarding badge to user and creating notifications, dumping badgeFriendlyIdentifier, userData.handle", badgeFriendlyIdentifier, userData.handle);
                  await user.ref.update({
                    badgeFriendlyIdentifiers: admin.firestore.FieldValue.arrayUnion(badgeFriendlyIdentifier),
                  });

                  const badgeName = badgeFriendlyIdentifiersToDetails[badgeFriendlyIdentifier].name;

                  await db.collection("notifications").add({
                    ownerId: user.id,
                    type: "BadgeAwardedToYou",
                    title: `You were awarded the ${badgeName} badge`,
                    body: "Go to your profile to see your badge",
                    notificationIcon: badgeFriendlyIdentifier,
                    notificationLink: user.id,
                    seen: false,
                    timestamp: admin.firestore.Timestamp.now(),
                  });

                  userFriends.forEach(async (userFriend) => {
                    await db.collection("notifications").add({
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
