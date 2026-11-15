const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authenticate = require("../middleware/auth");

const router = express.Router();

function createToken(userId) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
}

async function applyConfiguredAdmin(user) {
  const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  if (adminEmail && user.email === adminEmail && user.role !== "admin") {
    user.role = "admin";
    await user.save();
  }
  return user;
}

function publicUser(user) {
  return { id: user._id, name: user.name, email: user.email, role: user.role || "user", isActive: user.isActive !== false, hasMpin: Boolean(user.mpinLookup) };
}

function mpinLookup(mpin) {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not configured");
  return crypto.createHmac("sha256", process.env.JWT_SECRET).update(String(mpin)).digest("hex");
}

// Mobile MPIN sign-in. The lookup is keyed so the six-digit PIN is never stored in plaintext.
router.post("/mpin-login", async (req, res, next) => {
  try {
    const mpin = String(req.body.mpin || "");
    if (!/^\d{6}$/.test(mpin)) return res.status(400).json({ success: false, message: "Enter your 6-digit MPIN." });
    const user = await User.findOne({ mpinLookup: mpinLookup(mpin) }).select("+mpinHash +mpinLookup");
    if (!user || !user.mpinHash || !(await bcrypt.compare(mpin, user.mpinHash))) {
      return res.status(401).json({ success: false, message: "Invalid MPIN." });
    }
    if (user.isActive === false) return res.status(403).json({ success: false, message: "This account has been deactivated." });
    const activeUser = await applyConfiguredAdmin(user);
    return res.json({ success: true, token: createToken(activeUser._id.toString()), user: publicUser(activeUser) });
  } catch (error) { return next(error); }
});

// Set or change MPIN from an authenticated mobile session. Current password is required.
router.put("/mpin", authenticate, async (req, res, next) => {
  try {
    const mpin = String(req.body.mpin || "");
    const confirmMpin = String(req.body.confirmMpin || "");
    const currentPassword = String(req.body.currentPassword || "");
    if (!/^\d{6}$/.test(mpin)) return res.status(400).json({ success: false, message: "MPIN must contain exactly 6 digits." });
    if (mpin !== confirmMpin) return res.status(400).json({ success: false, message: "MPIN and confirmation do not match." });
    if (!currentPassword) return res.status(400).json({ success: false, message: "Enter your current account password to continue." });
    const user = await User.findById(req.userId).select("+passwordHash +mpinHash +mpinLookup");
    if (!user || user.isActive === false) return res.status(404).json({ success: false, message: "Account not found." });
    if (!(await bcrypt.compare(currentPassword, user.passwordHash))) return res.status(401).json({ success: false, message: "Current password is incorrect." });
    const lookup = mpinLookup(mpin);
    if (user.mpinLookup === lookup) return res.status(400).json({ success: false, message: "Choose a different MPIN." });
    const existing = await User.findOne({ mpinLookup: lookup }).select("_id");
    if (existing) return res.status(409).json({ success: false, message: "This MPIN is already assigned. Choose another 6-digit code." });
    user.mpinHash = await bcrypt.hash(mpin, 12);
    user.mpinLookup = lookup;
    await user.save();
    return res.json({ success: true, message: "Your MPIN has been saved." });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "This MPIN is already assigned. Choose another 6-digit code." });
    return next(error);
  }
});

router.post("/register", async (req, res, next) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Name, valid email and password (at least 8 characters) are required"
      });
    }

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ success: false, message: "Email is already registered" });

    const passwordHash = await bcrypt.hash(password, 12);
    let user = await User.create({ name, email, passwordHash });
    user = await applyConfiguredAdmin(user);

    return res.status(201).json({
      success: true,
      token: createToken(user._id.toString()),
      user: publicUser(user)
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
    let user = await User.findOne({ email }).select("+passwordHash +mpinLookup");

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    if (user.isActive === false) {
      return res.status(403).json({ success: false, message: "This account has been deactivated. Contact Pinpoint support." });
    }

    user = await applyConfiguredAdmin(user);
    return res.json({
      success: true,
      token: createToken(user._id.toString()),
      user: publicUser(user)
    });
  } catch (error) {
    return next(error);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId).select("name email role isActive createdAt +mpinLookup");
    if (!user || user.isActive === false) return res.status(404).json({ success: false, message: "User not found" });
    return res.json({ success: true, user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});

 
// Mobile: authenticated self-deactivation. The account is soft-disabled so it
// cannot sign in on any client; existing records are retained for recovery/audit.
router.delete("/account", authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.userId);
    if (!user || user.isActive === false) {
      return res.status(404).json({ success: false, message: "Account is already unavailable" });
    }
    user.isActive = false;
    user.accountDeactivatedAt = new Date();
    await user.save();
    return res.json({ success: true, message: "Your Pinpoint account has been deactivated." });
  } catch (error) {
    return next(error);
  }
});

// Public website: verify credentials first, then require a second explicit
// confirmation before disabling the account.
router.post("/delete-account", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const confirm = req.body.confirm === true;
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password are required." });
    }
    const user = await User.findOne({ email }).select("+passwordHash");
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({ success: false, message: "The email or password is incorrect." });
    }
    if (user.isActive === false) {
      return res.status(409).json({ success: false, message: "This account is already deactivated." });
    }
    if (!confirm) {
      return res.json({ success: true, verified: true, message: "Credentials verified. Confirm below to deactivate your account." });
    }
    user.isActive = false;
    user.accountDeactivatedAt = new Date();
    await user.save();
    return res.json({ success: true, message: "Your Pinpoint account has been deactivated." });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
