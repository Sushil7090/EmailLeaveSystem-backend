const userModel = require("../models/userModel");
const jwt = require("jsonwebtoken");

module.exports.authUser = async (req, res, next) => {
    // Extract token from header or cookie
    const token = req.cookies.token || req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: "Unauthorized user" });
    }

    try {
        // Use the correct env variable name
        const decoded = jwt.verify(token, process.env.JWT_SECRET); // ✅ fixed
        const user = await userModel.findById(decoded._id);

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        req.user = user;
        next();

    } catch (err) {
        console.log("JWT verification error:", err.message); // add debug log
        return res.status(401).json({ message: "Unauthorized user" });
    }
};

module.exports.requireAdmin = (req, res, next) => {
    if (!req.user || req.user.role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden: Admins only' });
    }
    next();
};
