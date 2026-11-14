const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Location = require("../models/Location");
const Category = require("../models/Category");
const Offer = require("../models/Offer");
const authenticate = require("../middleware/auth");
const requireAdmin = require("../middleware/requireAdmin");

const router = express.Router();
router.use(authenticate, requireAdmin);

function validId(id) {
  return mongoose.isValidObjectId(id);
}
function pageParams(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
}
function validCoordinates(body) {
  let coordinates = body.coordinates;
  if (body.latitude !== undefined && body.longitude !== undefined) {
    coordinates = { type: "Point", coordinates: [Number(body.longitude), Number(body.latitude)] };
  }
  if (!coordinates || !Array.isArray(coordinates.coordinates) || coordinates.coordinates.length !== 2) return null;
  const [lng, lat] = coordinates.coordinates.map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || lng < -180 || lng > 180 || lat < -90 || lat > 90) return null;
  return { type: "Point", coordinates: [lng, lat] };
}

router.get("/overview", async (req, res, next) => {
  try {
    const [users, activeUsers, locations, publicLocations, categories, offers, activeOffers] = await Promise.all([
      User.countDocuments(), User.countDocuments({ isActive: { $ne: false } }),
      Location.countDocuments(), Location.countDocuments({ isPublic: true }),
      Category.countDocuments(), Offer.countDocuments(), Offer.countDocuments({ status: "active" })
    ]);
    res.json({ success: true, data: { users, activeUsers, locations, publicLocations, categories, offers, activeOffers } });
  } catch (error) { next(error); }
});

router.get("/users", async (req, res, next) => {
  try {
    const { page, limit, skip } = pageParams(req.query);
    const filter = {};
    if (req.query.search) {
      const search = String(req.query.search).trim().slice(0, 100);
      filter.$or = [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }];
    }
    const [data, total] = await Promise.all([
      User.find(filter).select("name email role isActive createdAt").sort({ createdAt: -1 }).skip(skip).limit(limit),
      User.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.patch("/users/:id", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid user ID" });
    const user = await User.findById(req.params.id).select("name email role isActive createdAt");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (String(user._id) === String(req.userId) &&
        ((req.body.role && req.body.role !== "admin") || req.body.isActive === false)) {
      return res.status(400).json({ success: false, message: "You cannot remove your own administrator access or deactivate your account" });
    }
    if (req.body.role !== undefined) {
      if (!["user", "admin"].includes(req.body.role)) return res.status(400).json({ success: false, message: "Role must be user or admin" });
      if (user.role === "admin" && req.body.role === "user") {
        const admins = await User.countDocuments({ role: "admin", isActive: { $ne: false } });
        if (admins <= 1) return res.status(400).json({ success: false, message: "At least one active administrator must remain" });
      }
      user.role = req.body.role;
    }
    if (req.body.isActive !== undefined) {
      if (typeof req.body.isActive !== "boolean") return res.status(400).json({ success: false, message: "isActive must be true or false" });
      if (user.role === "admin" && req.body.isActive === false) {
        const admins = await User.countDocuments({ role: "admin", isActive: { $ne: false } });
        if (admins <= 1) return res.status(400).json({ success: false, message: "At least one active administrator must remain" });
      }
      user.isActive = req.body.isActive;
    }
    await user.save();
    res.json({ success: true, data: user });
  } catch (error) { next(error); }
});

router.get("/locations", async (req, res, next) => {
  try {
    const { page, limit, skip } = pageParams(req.query);
    const filter = {};
    if (req.query.visibility === "public") filter.isPublic = true;
    if (req.query.visibility === "private") filter.isPublic = false;
    const [data, total] = await Promise.all([
      Location.find(filter).populate("user", "name email").sort({ createdAt: -1 }).skip(skip).limit(limit),
      Location.countDocuments(filter)
    ]);
    res.json({ success: true, data, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { next(error); }
});

router.post("/locations", async (req, res, next) => {
  try {
    const title = String(req.body.title || "").trim();
    const coordinates = validCoordinates(req.body);
    if (!title || title.length > 120 || !coordinates) {
      return res.status(400).json({ success: false, message: "A title (maximum 120 characters), valid latitude and longitude are required" });
    }
    let ownerId = req.userId;
    if (req.body.userId) {
      if (!validId(req.body.userId)) return res.status(400).json({ success: false, message: "Invalid owner user ID" });
      const owner = await User.findById(req.body.userId);
      if (!owner) return res.status(404).json({ success: false, message: "Owner user not found" });
      ownerId = owner._id;
    }
    const location = await Location.create({
      user: ownerId, title, category: String(req.body.category || "Other").trim().slice(0, 50),
      address: String(req.body.address || "").trim().slice(0, 300),
      notes: String(req.body.notes || "").trim().slice(0, 2000),
      coordinates, isPublic: req.body.isPublic !== false
    });
    res.status(201).json({ success: true, data: location });
  } catch (error) { next(error); }
});

router.put("/locations/:id", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid location ID" });
    const updates = {};
    for (const field of ["title", "category", "address", "notes", "contact", "website", "tags", "isPublic"]) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.title !== undefined && (typeof updates.title !== "string" || !updates.title.trim())) {
      return res.status(400).json({ success: false, message: "A place title is required" });
    }
    if (req.body.latitude !== undefined || req.body.longitude !== undefined || req.body.coordinates !== undefined) {
      const coordinates = validCoordinates(req.body);
      if (!coordinates) return res.status(400).json({ success: false, message: "Valid coordinates are required" });
      updates.coordinates = coordinates;
    }
    if (updates.isPublic !== undefined && typeof updates.isPublic !== "boolean") {
      return res.status(400).json({ success: false, message: "isPublic must be true or false" });
    }
    const location = await Location.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true }).populate("user", "name email");
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    res.json({ success: true, data: location });
  } catch (error) { next(error); }
});

router.delete("/locations/:id", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid location ID" });
    const location = await Location.findByIdAndDelete(req.params.id);
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    await Offer.deleteMany({ location: location._id });
    res.json({ success: true, message: "Location and its offers deleted" });
  } catch (error) { next(error); }
});

router.get("/categories", async (req, res, next) => {
  try {
    const data = await Category.find().populate("user", "name email").sort({ name: 1 }).limit(500);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.post("/categories", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    if (!name || name.length > 50) return res.status(400).json({ success: false, message: "Category name is required (maximum 50 characters)" });
    const category = await Category.create({ user: req.userId, name, color: req.body.color, icon: req.body.icon });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This category already exists for this account" });
    next(error);
  }
});

router.put("/categories/:id", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid category ID" });
    const updates = {};
    for (const field of ["name", "color", "icon"]) if (req.body[field] !== undefined) updates[field] = req.body[field];
    if (updates.name !== undefined) updates.name = String(updates.name).trim();
    if (updates.name !== undefined && (!updates.name || updates.name.length > 50)) return res.status(400).json({ success: false, message: "Category name must be 1–50 characters" });
    const category = await Category.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, data: category });
  } catch (error) { next(error); }
});

router.delete("/categories/:id", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid category ID" });
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, message: "Category deleted" });
  } catch (error) { next(error); }
});

router.get("/offers", async (req, res, next) => {
  try {
    const data = await Offer.find().populate("location", "title address").populate("user", "name email").sort({ createdAt: -1 }).limit(500);
    res.json({ success: true, data });
  } catch (error) { next(error); }
});

router.post("/offers", async (req, res, next) => {
  try {
    if (!validId(req.body.locationId)) return res.status(400).json({ success: false, message: "A valid location is required" });
    const title = String(req.body.title || "").trim();
    if (!title || title.length > 120) return res.status(400).json({ success: false, message: "Offer title is required (maximum 120 characters)" });
    const location = await Location.findById(req.body.locationId);
    if (!location) return res.status(404).json({ success: false, message: "Location not found" });
    const offer = await Offer.create({
      user: req.userId, location: location._id, title,
      description: req.body.description, discountType: req.body.discountType || "text",
      discountValue: req.body.discountValue, startsAt: req.body.startsAt || undefined,
      expiresAt: req.body.expiresAt || undefined, status: req.body.status || "active"
    });
    res.status(201).json({ success: true, data: offer });
  } catch (error) { next(error); }
});

router.put("/offers/:id", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid offer ID" });
    const updates = {};
    for (const field of ["title", "description", "discountType", "discountValue", "startsAt", "expiresAt", "status"]) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.title !== undefined) updates.title = String(updates.title).trim();
    if (updates.title !== undefined && (!updates.title || updates.title.length > 120)) return res.status(400).json({ success: false, message: "Offer title must be 1–120 characters" });
    const offer = await Offer.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true, runValidators: true });
    if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });
    res.json({ success: true, data: offer });
  } catch (error) { next(error); }
});

router.delete("/offers/:id", async (req, res, next) => {
  try {
    if (!validId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid offer ID" });
    const offer = await Offer.findByIdAndDelete(req.params.id);
    if (!offer) return res.status(404).json({ success: false, message: "Offer not found" });
    res.json({ success: true, message: "Offer deleted" });
  } catch (error) { next(error); }
});

module.exports = router;
