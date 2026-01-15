const express = require('express');
const router = express.Router();
const { getAllProducts } = require('../controllers/productController');

// When user hits '/', run getAllProducts function
router.get('/',getAllProducts);

module.exports = router;

