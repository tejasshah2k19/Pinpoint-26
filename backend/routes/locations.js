const express = require("express");
const mongoose = require("mongoose");
const Location = require("../models/Location");
const authenticate = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

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
    const location = await Location.create({
      ...input,
      user: req.userId,
      isPublic: typeof req.body.isPublic === "boolean" ? req.body.isPublic : false
    });
    return res.status(201).json({ success: true, location });
  } catch (error) {
    return next(error);
  }
});

router.get("/", async (req, res, next) => {
  try {
    const locations = await Location.find({ user: req.userId }).sort({ createdAt: -1 });
    return res.json({ success: true, locations });
  } catch (error) {
    return next(error);
  }
});

router.get("/nearby", async (req, res, next) => {
  try {
    const longitude = Number(req.query.longitude);
    const latitude = Number(req.query.latitude);
    const maxDistance = Math.min(Number(req.query.maxDistance) || 5000, 50000);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude) ||
        longitude < -180 || longitude > 180 || latitude < -90 || latitude > 90) {
      return res.status(400).json({ success: false, message: "Valid longitude and latitude are required" });
    }
    const locations = await Location.find({
      $or: [{ user: req.userId }, { isPublic: true }],
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
    const location = await Location.findOne({ _id: req.params.id, user: req.userId });
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    return res.json({ success: true, location });
  } catch (error) {
    return next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid location ID" });
    const input = locationInput(req.body);
    if (typeof req.body.isPublic === "boolean") input.isPublic = req.body.isPublic;
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
