const multer = require('multer');

// Configure Storage
// Using memoryStorage to store the files in RAM for few secs till it reaches supabase

const storage = multer.memoryStorage();

// File Filter to accept only images (ONLY JPEG & PNG)

const fileFilter = ( req , file , cb ) => {

    if (file.mimetype.startsWith('image/')){
        cb(null , true);
    } else {
        cb(new Error('Only JPEG & PNG image files are allowed!'), false);
    }
};

// Initialize Multer 
const upload = multer({
    storage : storage,
    limits : {
        fileSize : 7 * 1024 * 1024 // 5MB
    },
    fileFilter : fileFilter
});

module.exports = upload;