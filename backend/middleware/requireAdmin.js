const User = require("../models/User");

module.exports = async function requireAdmin(req, res, next) {
  try {
    const user = await User.findById(req.userId).select("role isActive");
    if (!user || user.isActive === false) {
      return res.status(401).json({ success: false, message: "Account is unavailable" });
    }
    if (user.role !== "admin") {
      return res.status(403).json({ success: false, message: "Administrator access required" });
    }
    req.adminUser = user;
    return next();
  } catch (error) {
    return next(error);
  }
};
