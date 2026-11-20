const express = require("express");
const mongoose = require("mongoose");
const Location = require("../models/Location");
const User = require("../models/User");
const Circle = require("../models/Circle");
const authenticate = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

async function visibleLocationFilter(userId) {
  // Public places are visible only while their owner account is active.
  const activeUserIds = await User.distinct("_id", { isActive: { $ne: false } });
  const circles = await Circle.find({ $or: [{ creator: userId }, { members: { $elemMatch: { user: userId, status: "approved" } } }] }).select("_id");
  return { $or: [{ user: userId, circle: null }, { isPublic: true, circle: null, user: { $in: activeUserIds } }, { circle: { $in: circles.map(c => c._id) } }] };
}

function locationInput(body) {
  const input = {};
  ["title", "category", "address", "notes", "contact", "website", "tags"].forEach((key) => {
    if (body[key] !== undefined) input[key] = body[key];
  });
  if (body.coordinates !== undefined) input.coordinates = body.coordinates;
  if (body.latitude !== undefined && body.longitude !== undefined) {
    input.coordinates = {
      type: "Point",
      coordinates: [Number(body.longitude), Number(body.latitude)]
    };
  }
  return input;
}

router.post("/", async (req, res, next) => {
  try {
    const input = locationInput(req.body);
    if (!input.title || !input.coordinates || !Array.isArray(input.coordinates.coordinates)) {
      return res.status(400).json({ success: false, message: "Title, longitude and latitude are required" });
    }
    let circleId = null;
    if (req.body.circle) {
      if (!mongoose.isValidObjectId(req.body.circle)) return res.status(400).json({ success: false, message: "Invalid circle." });
      const circle = await Circle.findById(req.body.circle);
      if (!circle || !(String(circle.creator) === String(req.userId) || circle.members.some(m => String(m.user) === String(req.userId) && m.status === "approved"))) return res.status(403).json({ success: false, message: "You must be an approved member of this circle." });
      circleId = circle._id;
    }
    const location = await Location.create({ ...input, user: req.userId, circle: circleId, isPublic: circleId ? false : (typeof req.body.isPublic === "boolean" ? req.body.isPublic : false) });
    return res.status(201).json({ success: true, location });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const visibilityFilter = await visibleLocationFilter(req.userId);
    const records = await Location.find(visibilityFilter).sort({ createdAt: -1 });
    const locations = records.map((location) => {
      const item = location.toObject();
      item.isOwner = String(location.user) === String(req.userId);
      return item;
    });
    return res.json({ success: true, locations });
  } catch (error) {
    return next(error);
  }
});

router.get("/nearby", async (req, res, next) => {
  try {
    const longitude = Number(req.query.longitude);
    const latitude = Number(req.query.latitude);
    const requestedDistance = req.query.maxDistance === undefined ? 5000 : Number(req.query.maxDistance);
    if (!Number.isFinite(requestedDistance) || requestedDistance < 1 || requestedDistance > 1000000) {
      return res.status(400).json({ success: false, message: "maxDistance must be between 1 and 1,000,000 metres" });
    }
    const maxDistance = requestedDistance;
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) ||
        longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return res.status(400).json({ success: false, message: "Valid longitude and latitude are required" });
    }
    const visibilityFilter = await visibleLocationFilter(req.userId);
    const locations = await Location.find({
      ...visibilityFilter,
      coordinates: {
        $near: {
          $geometry: { type: "Point", coordinates: [longitude, latitude] },
          $maxDistance: maxDistance
        }
      }
    }).limit(100);
    return res.json({ success: true, locations });
  } catch (error) {
    return next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid location ID" });
    const visibilityFilter = await visibleLocationFilter(req.userId);
    const location = await Location.findOne({ _id: req.params.id, ...visibilityFilter });
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    const item = location.toObject();
    item.isOwner = String(location.user) === String(req.userId);
    return res.json({ success: true, location: item });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid location ID" });
    const input = locationInput(req.body);
    if (typeof req.body.isPublic === "boolean") input.isPublic = req.body.isPublic;
    if (req.body.circle !== undefined) {
      if (req.body.circle === null || req.body.circle === "") input.circle = null;
      else {
        if (!mongoose.isValidObjectId(req.body.circle)) return res.status(400).json({ success: false, message: "Invalid circle." });
        const circle = await Circle.findById(req.body.circle);
        if (!circle || !(String(circle.creator) === String(req.userId) || circle.members.some(m => String(m.user) === String(req.userId) && m.status === "approved"))) return res.status(403).json({ success: false, message: "You must be an approved member of this circle." });
        input.circle = circle._id; input.isPublic = false;
      }
    }
    const location = await Location.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { $set: input },
      { new: true, runValidators: true }
    );
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    return res.json({ success: true, location });
  } catch (error) {
    return next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid location ID" });
    const location = await Location.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    return res.json({ success: true, message: "Location deleted" });
  } catch (error) {
    return next(error);
  }
});

router.patch("/:id/sharing", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid location ID" });
    if (typeof req.body.isPublic !== "boolean") return res.status(400).json({ success: false, message: "isPublic must be true or false" });
    const location = await Location.findOneAndUpdate(
      { _id: req.params.id, user: req.userId },
      { $set: { isPublic: req.body.isPublic } },
      { new: true, runValidators: true }
    );
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    return res.json({ success: true, location });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
