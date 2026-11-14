const express = require("express");
const mongoose = require("mongoose");
const Offer = require("../models/Offer");
const Location = require("../models/Location");
const authenticate = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

function validDate(value) {
  return value === undefined || value === null || value === "" || !Number.isNaN(Date.parse(value));
}

router.post("/", async (req, res, next) => {
  try {
    const { locationId, title, description, discountType, discountValue, startsAt, expiresAt, status } = req.body;
    if (!mongoose.isValidObjectId(locationId)) {
      return res.status(400).json({ success: false, message: "A valid locationId is required" });
    }
    if (typeof title !== "string" || !title.trim() || title.trim().length > 120) {
      return res.status(400).json({ success: false, message: "Offer title is required (maximum 120 characters)" });
    }
    if (!validDate(startsAt) || !validDate(expiresAt)) {
      return res.status(400).json({ success: false, message: "Offer dates must be valid dates" });
    }
    const location = await Location.findOne({ _id: locationId, user: req.userId });
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });

    const offer = await Offer.create({
      user: req.userId, location: locationId, title: title.trim(), description,
      discountType, discountValue, startsAt: startsAt || undefined,
      expiresAt: expiresAt || undefined, status
    });
    res.status(201).json({ success: true, data: offer });
  } catch (error) { next(error); }
});

router.get("/location/:locationId", async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.locationId)) {
      return res.status(400).json({ success: false, message: "Invalid location ID" });
    }
    const location = await Location.findOne({ _id: req.params.locationId, user: req.userId });
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    const offers = await Offer.find({ location: location._id, user: req.userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: offers });
  } catch (error) { next(error); }
});

router.put("/:id", async (req, res, next) => {
  try {
    const updates = {};
    for (const field of ["title", "description", "discountType", "discountValue", "startsAt", "expiresAt", "status"]) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.title !== undefined) {
      if (typeof updates.title !== "string" || !updates.title.trim() || updates.title.trim().length > 120) {
        return res.status(400).json({ success: false, message: "Offer title must be 1–120 characters" });
      }
      updates.title = updates.title.trim();
    }
    if (!validDate(updates.startsAt) || !validDate(updates.expiresAt)) {
      return res.status(400).json({ success: false, message: "Offer dates must be valid dates" });
    }
    const offer = await Offer.findOneAndUpdate(
      { _id: req.params.id, user: req.userId }, updates, { new: true, runValidators: true }
    );
    if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });
    res.json({ success: true, data: offer });
  } catch (error) { next(error); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const offer = await Offer.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });
    res.json({ success: true, message: "Offer deleted" });
  } catch (error) { next(error); }
});

module.exports = router;
