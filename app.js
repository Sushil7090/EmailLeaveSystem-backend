const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const userAuthRoutes = require("./routes/userAuthRoutes");
const startEmailListener = require("./services/mailParser");
const emailRoutes = require("./routes/emaildata");
const empRoutes = require("./routes/employeeRoutes");
const adminRoutes = require("./routes/adminRoutes");
const path = require("path");

// ⭐ NEW ROUTE ADDED HERE
const clientProjectRoutes = require("./routes/clientProjectRoute");

// ==============================
// 🧩 MongoDB Connection
// ==============================
async function main() {
  try {
    await mongoose.connect(process.env.DBCONNECT, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ DB connected successfully");

    if (process.env.ENABLE_EMAIL === "true") {
      console.log("📧 Starting email listener...");
      startEmailListener();
    } else {
      console.log(
        "⚙️ Email listener is disabled. Set ENABLE_EMAIL=true in .env to enable it."
      );
    }
  } catch (err) {
    console.error("❌ DB connection failed:", err);
  }
}

main();

const app = express();
const PORT = process.env.PORT || 5000;

// ==============================
// 🌍 CORS Configuration
// ==============================
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
  : ["http://localhost:8080"];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log("🚫 Blocked by CORS:", origin);
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

// ==============================
// 🧱 Middleware
// ==============================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ==============================
// 🛣️ Register Routes
// ==============================
console.log("[INFO] Registering API routes...");

app.use(["/emails", "/api/emails"], emailRoutes);
app.use(["/auth", "/api/auth"], userAuthRoutes);
app.use(["/employee", "/api/employee"], empRoutes);
app.use(["/admin", "/api/admin"], adminRoutes);

// ⭐ NEW CLIENT-PROJECT ROUTE ADDED
app.use(["/client-project", "/api/client-project"], clientProjectRoutes);

console.log("[INFO] All routes registered successfully.");

// ==============================
// Health Check
// ==============================
app.get("/health", (req, res) => res.json({ ok: true }));

// ==============================
// 🧭 Catch-all Route (Dev Only)
// ==============================
if (process.env.NODE_ENV !== "production") {
  app.get("*", (req, res) => {
    console.log(`[DEBUG] Unhandled GET request to: ${req.path}`);
    res.status(404).json({
      error: "Route not found",
      path: req.path,
      method: req.method,
      message:
        "This route is not handled by the backend. Make sure you are accessing the correct port.",
    });
  });
}

// ==============================
// 📦 Serve Frontend (Optional)
// ==============================
if (
  process.env.NODE_ENV === "production" &&
  process.env.SERVE_FRONTEND === "true"
) {
  const frontendDist = path.join(__dirname, "..", "Frontend", "dist");
  app.use(express.static(frontendDist));
  app.get("*", (req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

// ==============================
// 🚀 Start Server
// ==============================
app.listen(PORT, () => {
  console.log(`🚀 Backend server started on port ${PORT}`);
  console.log(`📱 Frontend: localhost:8080 or Render`);
  console.log(`🔧 API Base URL: http://localhost:${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
});

module.exports = app;
