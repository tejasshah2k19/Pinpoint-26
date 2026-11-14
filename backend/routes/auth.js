const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authenticate = require("../middleware/auth");

const router = express.Router();

function createToken(userId) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

router.post("/register", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Name, valid email and password (at least 8 characters) are required"
      });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: "Email is already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email, passwordHash });

    return res.status(201).json({
      success: true,
      token: createToken(user._id.toString()),
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "Email is already registered" });
    return next(error);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({ email }).select("+passwordHash");

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }

    return res.json({
      success: true,
      token: createToken(user._id.toString()),
      user: { id: user._id, name: user.name, email: user.email }
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("name email createdAt");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, user: { id: user._id, name: user.name, email: user.email } });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
