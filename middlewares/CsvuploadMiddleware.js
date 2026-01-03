const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Storage configuration for leave attachments
const leaveStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'leave-' + uniqueSuffix + path.extname(file.originalname));
  }
});

// Storage configuration for CSV files
const csvStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'holidays-' + uniqueSuffix + '.csv');
  }
});

// File filter for leave attachments
const leaveFileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf|doc|docx/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only images, PDF, and Word documents are allowed!'));
  }
};

// File filter for CSV files
const csvFileFilter = (req, file, cb) => {
  const extname = path.extname(file.originalname).toLowerCase();
  const mimetype = file.mimetype;

  if (extname === '.csv' || mimetype === 'text/csv' || mimetype === 'application/vnd.ms-excel') {
    return cb(null, true);
  } else {
    cb(new Error('Only CSV files are allowed!'));
  }
};

// Multer upload instances
const uploadLeave = multer({
  storage: leaveStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: leaveFileFilter
});

const uploadCSVFile = multer({
  storage: csvStorage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit for CSV
  fileFilter: csvFileFilter
});

// Middleware exports
exports.uploadLeaveAttachments = uploadLeave.array('attachments', 5);
exports.uploadCSV = uploadCSVFile.single('csvFile');