require("dotenv").config();
const mongoose = require("mongoose");
const validator = require("validator");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const crypto = require("crypto");

// ---------------------------
// USER SCHEMA
// ---------------------------
const userSchema = new mongoose.Schema({
  fullname: {
    firstname: { type: String, required: true, trim: true },
    middlename: { type: String, required: true, trim: true },
    lastname: { type: String, required: true, trim: true },
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    validate: {
      validator: (value) => validator.isEmail((value || "").trim()),
      message: "Invalid email format",
    },
  },

  mobile: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    validate: {
      validator: (value) => {
        const input = (value || "").trim();
        if (validator.isMobilePhone(input, "any", { strictMode: true })) return true;
        return /^\+?[1-9]\d{9,14}$/.test(input);
      },
      message: "Invalid mobile number",
    },
  },

  password: {
    type: String,
    required: true,
    minlength: 8,
    validate: {
      validator: (value) =>
        validator.isStrongPassword(value, {
          minLength: 8,
          minLowercase: 1,
          minUppercase: 1,
          minNumbers: 1,
          minSymbols: 1,
        }),
      message: "Password is not strong enough",
    },
  },

  role: {
    type: String,
    enum: ["employee", "admin"],
    default: "employee",
  },

  leaveBalance: {
    medical: { type: Number, default: 10 },
    others: { type: Number, default: 10 },
    usedMedical: { type: Number, default: 0 },
    usedOthers: { type: Number, default: 0 },
  },

  profilePhoto: {
    type: String,
    default: null,
  },

  passwordResetToken: {
    type: String,
    select: false,
  },

  passwordResetExpires: {
    type: Date,
    select: false,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// ---------------------------
// CONFIRM PASSWORD VIRTUAL
// ---------------------------
userSchema
  .virtual("confirmPassword")
  .get(function () {
    return this._confirmPassword;
  })
  .set(function (value) {
    this._confirmPassword = value;
  });

// ---------------------------
// VALIDATE PASSWORD CONFIRMATION
// ---------------------------
userSchema.pre("validate", function (next) {
  if (
    this.isModified("password") &&
    this._confirmPassword &&
    this._confirmPassword !== this.password
  ) {
    this.invalidate(
      "confirmPassword",
      "Password confirmation does not match password"
    );
  }
  next();
});

// ---------------------------
// HASH PASSWORD BEFORE SAVE
// ---------------------------
userSchema.pre("save", async function (next) {
  try {
    if (this.isModified("password")) {
      if (this._confirmPassword && this.password !== this._confirmPassword) {
        return next(new Error("Password confirmation does not match password"));
      }
      if (!this.password.startsWith("$2")) {
        this.password = await bcrypt.hash(this.password, 10);
      }
    }
    next();
  } catch (err) {
    next(err);
  }
});

// ---------------------------
// CREATE PASSWORD RESET TOKEN
// ---------------------------
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.passwordResetToken = crypto
    .createHash("sha256")
    .update(resetToken)
    .digest("hex");
  this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000);
  return resetToken;
};

// ---------------------------
// GENERATE JWT TOKEN
// ---------------------------
userSchema.methods.generateUserToken = function () {
  const secretKey = process.env.JWT_SECRET;

  if (!secretKey || secretKey.trim() === "") {
    throw new Error("JWT_SECRET is missing or empty in environment variables");
  }

  return jwt.sign(
    { _id: this._id, email: this.email, role: this.role },
    secretKey,
    { expiresIn: process.env.JWT_EXPIRES_IN || "30d" }
  );
};

// ---------------------------
// COMPARE PASSWORD
// ---------------------------
userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

// ---------------------------
// STATIC HASH HELPER
// ---------------------------
userSchema.statics.hashPassword = async function (password) {
  return await bcrypt.hash(password, 10);
};

// ---------------------------
// EXPORT MODEL
// ---------------------------
const User = mongoose.model("User", userSchema);
module.exports = User;
