const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
require('dotenv').config();

const app = express();

//MIDDLEWARE
app.use(express.json()); // ALLOWS OUR SERVER TO ACCEPT JSON DATA
app.use(cors()); // ENABLES CORS POLICY ( ALLOWS FRONTEND TO ACCESS BACKEND )
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


// Import Routes
const productRoutes = require('./routes/productRoutes')
const orderRoutes = require('./routes/orderRoutes');

// Use Routes
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);

// ROUTES
app.get('/', (req, res) => {
    res.send('Maiee Saree Backend is running');
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                success: false,
                error: 'Image is too large. Max allowed size is 15MB per file.',
            });
        }

        return res.status(400).json({
            success: false,
            error: err.message || 'File upload error',
        });
    }

    if (err) {
        return res.status(500).json({
            success: false,
            error: err.message || 'Internal server error',
        });
    }

    return next();
});

// START THE SERVER
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});