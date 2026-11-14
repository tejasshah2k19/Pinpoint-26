const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, maxlength: 120 },
  category: { type: String, default: "Other", trim: true, maxlength: 50 },
  address: { type: String, trim: true, maxlength: 300 },
  coordinates: {
    type: { type: String, enum: ["Point"], default: "Point", required: true },
    coordinates: {
      type: [Number],
      required: true,
      validate: {
        validator: (value) => Array.isArray(value) && value.length === 2 &&
          Number.isFinite(value[0]) && Number.isFinite(value[1]) &&
          value[0] >= -180 && value[0] <= 180 && value[1] >= -90 && value[1] <= 90,
        message: "Coordinates must be [longitude, latitude] within valid ranges"
      }
    }
  },
  notes: { type: String, trim: true, maxlength: 2000 },
  contact: { type: String, trim: true, maxlength: 100 },
  website: { type: String, trim: true, maxlength: 300 },
  tags: [{ type: String, trim: true, maxlength: 30 }],
  isPublic: { type: Boolean, default: false }
}, { timestamps: true });

locationSchema.index({ coordinates: "2dsphere" });
locationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Location", locationSchema);
