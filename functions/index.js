/* eslint-disable max-len */

const admin = require("firebase-admin");
admin.initializeApp();

const createNotificationsForPost = require("./createNotificationsForPost");
exports.createNotificationsForPost = createNotificationsForPost.createNotificationsForPost;

const createNotificationsForPostReply = require("./createNotificationsForPostReply");
exports.createNotificationsForPostReply = createNotificationsForPostReply.createNotificationsForPostReply;

const handleNotification = require("./handleNotification");
exports.handleNotification = handleNotification.handleNotification;

const clearStreaks = require("./clearStreaks");
exports.clearStreaks = clearStreaks.clearStreaks;

const awardBadges = require("./awardBadges");
exports.awardBadges = awardBadges.awardBadges;

const setEmptyCuisines = require("./setEmptyCuisines");
exports.setEmptyCuisines = setEmptyCuisines.setEmptyCuisines;

const addWantToTaste = require("./addWantToTaste");
exports.addWantToTaste = addWantToTaste.addWantToTaste;

const addPostReaction = require("./addPostReaction");
exports.addPostReaction = addPostReaction.addPostReaction;

const addPostReplyReaction = require("./addPostReplyReaction");
exports.addPostReplyReaction = addPostReplyReaction.addPostReplyReaction;

const mentionUserInTaste = require("./mentionUserInTaste");
exports.mentionUserInTaste = mentionUserInTaste.mentionUserInTaste;

const mentionUserInReply = require("./mentionUserInReply");
exports.mentionUserInReply = mentionUserInReply.mentionUserInReply;

const fetchPlaces = require("./fetchPlaces");
exports.fetchPlaces = fetchPlaces.fetchPlaces;
