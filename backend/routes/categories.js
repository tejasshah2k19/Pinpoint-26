const express = require("express");
const Category = require("../models/Category");
const authenticate = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

router.get("/", async (req, res, next) => {
  try {
    const records = await Category.find().sort({ name: 1 });
    const seen = new Set();
    const categories = records.filter((item) => {
      const key = String(item.name || "").trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    res.json({ success: true, data: categories });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim().replace(/\\s+/g, " ") : "";
    if (!name || name.length > 50) {
      return res.status(400).json({ success: false, message: "Category name is required (maximum 50 characters)" });
    }
    const existing = await Category.findOne({ name: new RegExp("^" + escapeRegex(name) + "$", "i") });
    if (existing) return res.json({ success: true, data: existing, alreadyExists: true });
    const category = await Category.create({
      user: req.userId,
      name,
      color: req.body.color,
      icon: req.body.icon
    });
    res.status(201).json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This category already exists" });
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const updates = {};
    for (const field of ["name", "color", "icon"]) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }
    if (updates.name !== undefined) {
      if (typeof updates.name !== "string" || !updates.name.trim() || updates.name.trim().length > 50) {
        return res.status(400).json({ success: false, message: "Category name must be 1–50 characters" });
      }
      updates.name = updates.name.trim().replace(/\\s+/g, " ");
      const duplicate = await Category.findOne({
        _id: { $ne: req.params.id },
        name: new RegExp("^" + escapeRegex(updates.name) + "$", "i")
      });
      if (duplicate) return res.status(409).json({ success: false, message: "Another category already uses this name" });
    }
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id }, { $set: updates }, { new: true, runValidators: true }
    );
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, data: category });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This category already exists" });
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    const category = await Category.findByIdAndDelete(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, data: category, message: "Category deleted" });
  } catch (error) { next(error); }
});

module.exports = router;
