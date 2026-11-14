const express = require("express");
const Category = require("../models/Category");
const authenticate = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const categories = await Category.find({ user: req.userId }).sort({ name: 1 });
    res.json({ success: true, data: categories });
  } catch (error) { next(error); }
});

router.post("/", async (req, res, next) => {
  try {
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
    if (!name || name.length > 50) {
      return res.status(400).json({ success: false, message: "Category name is required (maximum 50 characters)" });
    }
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
      updates.name = updates.name.trim();
    }
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, user: req.userId }, updates, { new: true, runValidators: true }
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
    const category = await Category.findOneAndDelete({ _id: req.params.id, user: req.userId });
    if (!category) return res.status(404).json({ success: false, message: "Category not found" });
    res.json({ success: true, message: "Category deleted" });
  } catch (error) { next(error); }
});

module.exports = router;
