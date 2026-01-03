const mongoose = require('mongoose');

const holidayCalendarSchema = new mongoose.Schema(
  {
    holidayName: {
      type: String,
      required: true,
      trim: true
    },
    holidayDate: {
      type: Date,
      required: true
    },
    holidayType: {
      type: String,
      enum: ['Public Holiday', 'Optional Holiday', 'Restricted Holiday', 'Festival', 'National Holiday'],
      default: 'Public Holiday'
    },
    description: {
      type: String,
      trim: true
    },
    year: {
      type: Number,
      required: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

// Index for faster queries
holidayCalendarSchema.index({ holidayDate: 1 });
holidayCalendarSchema.index({ year: 1 });
holidayCalendarSchema.index({ isActive: 1 });

// Compound index for unique holidays per year
holidayCalendarSchema.index({ holidayName: 1, holidayDate: 1 }, { unique: true });

module.exports = mongoose.model('HolidayCalendar', holidayCalendarSchema);