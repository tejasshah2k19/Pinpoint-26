const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  location: { type: mongoose.Schema.Types.ObjectId, ref: "Location", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, trim: true, maxlength: 1000 },
  discountType: { type: String, enum: ["percentage", "amount", "text"], default: "text" },
  discountValue: { type: Number, min: 0 },
  startsAt: { type: Date },
  expiresAt: { type: Date },
  status: { type: String, enum: ["active", "inactive"], default: "active" }
}, { timestamps: true });

offerSchema.index({ location: 1, status: 1, expiresAt: 1 });

module.exports = mongoose.model("Offer", offerSchema);
