const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

//MIDDLEWARE
app.use(express.json()); // ALLOWS OUR SERVER TO ACCEPT JSON DATA
app.use(cors()); // ENABLES CORS POLICY ( ALLOWS FRONTEND TO ACCESS BACKEND )


// Import Routes
const productRoutes = require('./routes/productRoutes')

// Use Routes
app.use('/api/products', productRoutes);

// ROUTES
app.get('/', (req, res) => {
    res.send('Maiee Saree Backend is running');
});

// START THE SERVER
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});