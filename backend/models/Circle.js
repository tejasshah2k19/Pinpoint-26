const mongoose = require("mongoose");
const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  requestedAt: { type: Date, default: Date.now },
  reviewedAt: { type: Date, default: null }
}, { _id: false });
const circleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 300, default: "" },
  creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  inviteCode: { type: String, required: true, unique: true, index: true },
  members: { type: [memberSchema], default: [] }
}, { timestamps: true });
circleSchema.index({ "members.user": 1, "members.status": 1 });
module.exports = mongoose.model("Circle", circleSchema);
