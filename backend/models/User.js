const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
  passwordHash: { type: String, required: true, select: false },
  mpinHash: { type: String, default: null, select: false },
  mpinLookup: { type: String, unique: true, sparse: true, select: false },
  mpinFailedAttempts: { type: Number, default: 0, select: false },
  mpinLockUntil: { type: Date, default: null, select: false },
  role: { type: String, enum: ["user", "admin"], default: "user", index: true },
  isActive: { type: Boolean, default: true, index: true },
  accountDeactivatedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
