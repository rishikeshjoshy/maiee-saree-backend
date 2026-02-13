const multer = require('multer');

// Configure Multer Storage (Memory Storage is best for Supabase upload)
const storage = multer.memoryStorage();

// Configure File Filter (The Gatekeeper)
const fileFilter = (req, file, cb) => {
  // Accepted MIME types
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true); // Accept file
  } else {
    // Reject file with helpful error
    cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, and WebP are allowed.`), false);
  }
};

// Initialize Upload Middleware
const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 7 * 1024 * 1024, // 7MB limit per file
    files: 5 // Max 5 files
  }
});

module.exports = upload;