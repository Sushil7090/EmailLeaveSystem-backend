const HolidayCalendar = require('../models/holidayCalendarModel');
const csv = require('csv-parser');
const fs = require('fs');
const { sendEmail } = require('../services/emailService');
const User = require('../models/userModel');

// 📤 Upload CSV and Import Holidays
exports.uploadHolidayCSV = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please upload a CSV file' });
    }

    const filePath = req.file.path;
    const holidays = [];
    const errors = [];
    let rowNumber = 1;

    // Read and parse CSV
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (row) => {
        rowNumber++;
        try {
          // Expected CSV columns: holidayName, holidayDate (YYYY-MM-DD), holidayType, description
          const holidayName = row.holidayName?.trim();
          const holidayDate = row.holidayDate?.trim();
          const holidayType = row.holidayType?.trim() || 'Public Holiday';
          const description = row.description?.trim() || '';

          if (!holidayName || !holidayDate) {
            errors.push(`Row ${rowNumber}: Missing holidayName or holidayDate`);
            return;
          }

          const date = new Date(holidayDate);
          if (isNaN(date.getTime())) {
            errors.push(`Row ${rowNumber}: Invalid date format - ${holidayDate}`);
            return;
          }

          const year = date.getFullYear();

          holidays.push({
            holidayName,
            holidayDate: date,
            holidayType,
            description,
            year,
            createdBy: req.user._id,
            isActive: true
          });
        } catch (err) {
          errors.push(`Row ${rowNumber}: ${err.message}`);
        }
      })
      .on('end', async () => {
        try {
          // Delete the uploaded file
          fs.unlinkSync(filePath);

          if (holidays.length === 0) {
            return res.status(400).json({ 
              message: 'No valid holidays found in CSV',
              errors 
            });
          }

          // Bulk insert holidays (ignore duplicates)
          const result = await HolidayCalendar.insertMany(holidays, { 
            ordered: false,
            rawResult: true 
          }).catch(err => {
            // Handle duplicate key errors
            if (err.code === 11000) {
              return { insertedCount: err.result?.nInserted || 0 };
            }
            throw err;
          });

          return res.status(200).json({
            message: 'Holidays imported successfully',
            imported: result.insertedCount || holidays.length,
            total: holidays.length,
            errors: errors.length > 0 ? errors : undefined
          });

        } catch (err) {
          console.error('Error importing holidays:', err);
          return res.status(500).json({ message: err.message });
        }
      })
      .on('error', (err) => {
        fs.unlinkSync(filePath);
        return res.status(500).json({ message: `CSV parsing error: ${err.message}` });
      });

  } catch (err) {
    console.error('Error uploading CSV:', err);
    return res.status(500).json({ message: err.message });
  }
};

// 📋 Get All Holidays (with filters)
exports.getAllHolidays = async (req, res) => {
  try {
    const { year, month, holidayType, isActive } = req.query;
    const filter = {};

    if (year) {
      filter.year = parseInt(year);
    }

    if (month) {
      const monthNum = parseInt(month);
      const startDate = new Date(year || new Date().getFullYear(), monthNum - 1, 1);
      const endDate = new Date(year || new Date().getFullYear(), monthNum, 0);
      filter.holidayDate = { $gte: startDate, $lte: endDate };
    }

    if (holidayType) {
      filter.holidayType = holidayType;
    }

    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    }

    const holidays = await HolidayCalendar
      .find(filter)
      .sort({ holidayDate: 1 })
      .populate('createdBy', 'fullname email')
      .populate('updatedBy', 'fullname email');

    return res.status(200).json({
      count: holidays.length,
      holidays
    });

  } catch (err) {
    console.error('Error fetching holidays:', err);
    return res.status(500).json({ message: err.message });
  }
};

// 📅 Get Holiday by ID
exports.getHolidayById = async (req, res) => {
  try {
    const { id } = req.params;

    const holiday = await HolidayCalendar
      .findById(id)
      .populate('createdBy', 'fullname email')
      .populate('updatedBy', 'fullname email');

    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }

    return res.status(200).json({ holiday });

  } catch (err) {
    console.error('Error fetching holiday:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ➕ Create Single Holiday
exports.createHoliday = async (req, res) => {
  try {
    const { holidayName, holidayDate, holidayType, description } = req.body;

    if (!holidayName || !holidayDate) {
      return res.status(400).json({ 
        message: 'holidayName and holidayDate are required' 
      });
    }

    const date = new Date(holidayDate);
    if (isNaN(date.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const year = date.getFullYear();

    const holiday = new HolidayCalendar({
      holidayName,
      holidayDate: date,
      holidayType: holidayType || 'Public Holiday',
      description,
      year,
      createdBy: req.user._id,
      isActive: true
    });

    await holiday.save();

    return res.status(201).json({
      message: 'Holiday created successfully',
      holiday
    });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ 
        message: 'Holiday with this name and date already exists' 
      });
    }
    console.error('Error creating holiday:', err);
    return res.status(500).json({ message: err.message });
  }
};

// ✏️ Update Holiday
exports.updateHoliday = async (req, res) => {
  try {
    const { id } = req.params;
    const { holidayName, holidayDate, holidayType, description, isActive } = req.body;

    const holiday = await HolidayCalendar.findById(id);
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }

    if (holidayName) holiday.holidayName = holidayName;
    if (holidayDate) {
      const date = new Date(holidayDate);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ message: 'Invalid date format' });
      }
      holiday.holidayDate = date;
      holiday.year = date.getFullYear();
    }
    if (holidayType) holiday.holidayType = holidayType;
    if (description !== undefined) holiday.description = description;
    if (isActive !== undefined) holiday.isActive = isActive;
    
    holiday.updatedBy = req.user._id;

    await holiday.save();

    return res.status(200).json({
      message: 'Holiday updated successfully',
      holiday
    });

  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ 
        message: 'Holiday with this name and date already exists' 
      });
    }
    console.error('Error updating holiday:', err);
    return res.status(500).json({ message: err.message });
  }
};

// 🗑️ Delete Holiday
exports.deleteHoliday = async (req, res) => {
  try {
    const { id } = req.params;

    const holiday = await HolidayCalendar.findByIdAndDelete(id);
    if (!holiday) {
      return res.status(404).json({ message: 'Holiday not found' });
    }

    return res.status(200).json({
      message: 'Holiday deleted successfully'
    });

  } catch (err) {
    console.error('Error deleting holiday:', err);
    return res.status(500).json({ message: err.message });
  }
};

// 🗑️ Delete All Holidays for a Year
exports.deleteHolidaysByYear = async (req, res) => {
  try {
    const { year } = req.params;

    const result = await HolidayCalendar.deleteMany({ year: parseInt(year) });

    return res.status(200).json({
      message: `Deleted ${result.deletedCount} holidays for year ${year}`,
      deletedCount: result.deletedCount
    });

  } catch (err) {
    console.error('Error deleting holidays by year:', err);
    return res.status(500).json({ message: err.message });
  }
};

// 📊 Get Holiday Statistics
exports.getHolidayStats = async (req, res) => {
  try {
    const currentYear = new Date().getFullYear();
    
    const stats = await HolidayCalendar.aggregate([
      {
        $facet: {
          totalHolidays: [
            { $match: { year: currentYear, isActive: true } },
            { $count: 'count' }
          ],
          byType: [
            { $match: { year: currentYear, isActive: true } },
            { $group: { _id: '$holidayType', count: { $sum: 1 } } }
          ],
          byMonth: [
            { $match: { year: currentYear, isActive: true } },
            { 
              $group: { 
                _id: { $month: '$holidayDate' }, 
                count: { $sum: 1 } 
              } 
            },
            { $sort: { _id: 1 } }
          ],
          upcomingHolidays: [
            { 
              $match: { 
                holidayDate: { $gte: new Date() },
                isActive: true 
              } 
            },
            { $sort: { holidayDate: 1 } },
            { $limit: 5 }
          ]
        }
      }
    ]);

    return res.status(200).json({
      year: currentYear,
      totalHolidays: stats[0].totalHolidays[0]?.count || 0,
      byType: stats[0].byType,
      byMonth: stats[0].byMonth,
      upcomingHolidays: stats[0].upcomingHolidays
    });

  } catch (err) {
    console.error('Error fetching holiday stats:', err);
    return res.status(500).json({ message: err.message });
  }
};