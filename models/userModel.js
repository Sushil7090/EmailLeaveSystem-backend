const mongoose = require('mongoose');
const validator = require('validator');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const userSchema = new mongoose.Schema({
    fullname: {
        firstname: {
            type: String,
            required: true,
            trim: true,
        },
        middlename: {
            type: String,
            required: true,
            trim: true,
        },
        lastname: {
            type: String,
            required: true,
            trim: true,
        }
    },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
        validate: {
            validator: (value) => validator.isEmail((value || '').trim()),
            message: "Invalid email format"
        }
    },
    mobile: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        validate: {
            validator: (value) => {
                const input = (value || '').trim();
                if (validator.isMobilePhone(input, 'any', { strictMode: true })) return true;
                return /^\+?[1-9]\d{9,14}$/.test(input);
            },
            message: "Invalid mobile number"
        }
    },
    password: {
        type: String,
        required: true,
        minlength: 8,
        validate: {
            validator: (value) => validator.isStrongPassword(value, {
                minLength: 8,
                minLowercase: 1,
                minUppercase: 1,
                minNumbers: 1,
                minSymbols: 1
            }),
            message: "Password is not strong enough"
        }
    },
    role: {
        type: String,
        enum: ["employee", "admin"],
        default: "employee",
    },
    department: {
        type: String,
        required: true,
    },
    leaveBalance: {
        medical: { type: Number, default: 10 },
        others: { type: Number, default: 10 },
        usedMedical: { type: Number, default: 0 },
        usedOthers: { type: Number, default: 0 }
    },
    profilePhoto: {
        type: String,
        default: null
    },
    passwordResetToken: {
        type: String,
        select: false
    },
    passwordResetExpires: {
        type: Date,
        select: false
    },
    createdAt: {
        type: Date,
        default: Date.now,
    }
});

// Virtual field for password confirmation (not stored in database)
userSchema.virtual('confirmPassword')
    .get(function() {
        return this._confirmPassword;
    })
    .set(function(value) {
        this._confirmPassword = value;
    });

// Custom validation method for password confirmation
userSchema.methods.validatePasswordConfirmation = function(confirmPassword) {
    return this.password === confirmPassword;
};

// Pre-save middleware to validate password confirmation and hash password if needed
userSchema.pre('save', async function(next) {
    try {
        if (this.isModified('password')) {
            if (this._confirmPassword && this.password !== this._confirmPassword) {
                return next(new Error('Password confirmation does not match password'));
            }
            if (!this.password.startsWith('$2')) {
                this.password = await bcrypt.hash(this.password, 10);
            }
        }
        next();
    } catch (err) {
        next(err);
    }
});

userSchema.pre('validate', function(next) {
    if (this.isModified('password') && this._confirmPassword && this._confirmPassword !== this.password) {
        this.invalidate('confirmPassword', 'Password confirmation does not match password');
    }
    next();
});

// Instance method: generate and set password reset token (hashed) and expiry
userSchema.methods.createPasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    this.passwordResetExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    return resetToken; // return raw token to send to user via email
};

userSchema.methods.generateUserToken = function () {
    const token = jwt.sign({ _id: this._id }, process.env.JWTSECRET, { expiresIn: "24h" });

    return token;
}

userSchema.methods.comparePassword = async function (password) {
    return await bcrypt.compare(password, this.password);
}

userSchema.statics.hashPassword = async function (password) {
    return await bcrypt.hash(password, 10)
}

const userModel = mongoose.model("User", userSchema);

module.exports = userModel;
