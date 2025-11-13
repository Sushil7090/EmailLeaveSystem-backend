const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const userAuthRoutes = require("./routes/userAuthRoutes");
const startEmailListener = require('./services/mailParser');
const emailRoutes = require("./routes/emaildata");
const empRoutes = require("./routes/employeeRoutes");
const adminRoutes = require("./routes/adminRoutes");
const path = require('path');

async function main() {
    try {
        await mongoose.connect(process.env.DBCONNECT, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log("✅ DB connected successfully");

        // Only start email listener if ENABLE_EMAIL is true
        if (process.env.ENABLE_EMAIL === 'true') {
            console.log("📧 Starting email listener...");
            startEmailListener();
        } else {
            console.log("⚙️ Email listener is disabled. Set ENABLE_EMAIL=true in .env to enable it.");
        }
    } catch (err) {
        console.error("❌ DB connection failed:", err);
    }
}

main();

const app = express();
const PORT = process.env.PORT || 5000;

// ✅ Allow both localhost and Render frontend
const allowedOrigins = [
    'http://localhost:8080',
    'https://leave-management-fe-du86.onrender.com'
];

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

console.log('[INFO] Registering API routes...');

// ✅ Register routes
app.use(['/emails', '/api/emails'], emailRoutes);
console.log('[INFO] Email routes registered at /emails and /api/emails');

app.use(["/auth", "/api/auth"], userAuthRoutes);
console.log('[INFO] Auth routes registered at /auth and /api/auth');

app.use(["/employee", "/api/employee"], empRoutes);
console.log('[INFO] Employee routes registered at /employee and /api/employee');

app.use(["/admin", "/api/admin"], adminRoutes);
console.log('[INFO] Admin routes registered at /admin and /api/admin');

app.get("/health", (req, res) => {
    res.json({ ok: true });
});

// Catch-all route for debugging (non-production)
if (process.env.NODE_ENV !== 'production') {
    app.get('*', (req, res) => {
        console.log(`[DEBUG] Unhandled GET request to: ${req.path}`);
        res.status(404).json({
            error: 'Route not found',
            path: req.path,
            method: req.method,
            message: 'This route is not handled by the backend. Make sure you are accessing the correct port.'
        });
    });
}

// Serve frontend in production (optional)
if (process.env.NODE_ENV === 'production' && process.env.SERVE_FRONTEND === 'true') {
    const frontendDist = path.join(__dirname, '..', 'Frontend', 'dist');
    app.use(express.static(frontendDist));
    app.get('*', (req, res) => {
        res.sendFile(path.join(frontendDist, 'index.html'));
    });
}

app.listen(PORT, () => {
    console.log(`🚀 Backend server started on port ${PORT}`);
    console.log(`📱 Frontend: localhost:8080 or Render`);
    console.log(`🔧 API Base URL: http://localhost:${PORT}`);
    console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
