require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const User = require("./models/User");

const app = express();
// Render runs behind a trusted reverse proxy; use the client IP for rate limits.
app.set("trust proxy", 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net", "https://tessdata.projectnaptha.com"],
      workerSrc: ["'self'", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.tile.openstreetmap.org", "https://unpkg.com"],
      connectSrc: ["'self'", "https://tiles.openfreemap.org", "https://photon.komoot.io", "https://cdn.jsdelivr.net"],
      fontSrc: ["'self'", "data:"]
    }
  }
}));
app.use(cors({
  origin: process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(",").map((value) => value.trim())
    : true
}));
app.use(express.json({ limit: "1mb" }));

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: "draft-7",
  legacyHeaders: false
}));

// Installable Pinpoint web app (PWA), served alongside the native Expo app.
app.get(["/app", "/app/"], (req, res) => res.sendFile(path.join(__dirname, "public", "app.html")));
app.get("/app/sw.js", (req, res) => {
  res.setHeader("Service-Worker-Allowed", "/app/");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});
app.use("/app-assets", express.static(path.join(__dirname, "public"), { index: false, maxAge: "1h" }));

// Public PinPoint26 introduction page.
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/delete-account", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "delete-account.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});
app.use("/admin-assets", express.static(path.join(__dirname, "public"), { index: false }));

app.get("/api/v1/health", (req, res) => {
  res.json({
    success: true,
    status: "healthy",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected"
  });
});

app.use("/api/v1/auth", require("./routes/auth"));
app.use("/api/v1/locations", require("./routes/locations"));
app.use("/api/v1/circles", require("./routes/circles"));
app.use("/api/v1/categories", require("./routes/categories"));
app.use("/api/v1/offers", require("./routes/offers"));
app.use("/api/v1/admin", require("./routes/admin"));

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message || "Internal server error"
  });
});

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error("MONGODB_URI is required. Configure it in the hosting environment.");
    }
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error("JWT_SECRET must be configured with at least 32 characters.");
    }

    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB connected");

    const adminEmail = String(process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    if (adminEmail) {
      const result = await User.updateOne({ email: adminEmail }, { $set: { role: "admin" } });
      if (result.matchedCount) console.log("Configured administrator account is enabled");
      else console.log("ADMIN_EMAIL is set; account will be promoted after it is registered");
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Pinpoint API listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start Pinpoint API:", error.message);
    process.exit(1);
  }
}

startServer();
