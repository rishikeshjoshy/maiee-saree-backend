const express = require('express');
const router = express.Router();

const productController = require('../controllers/productController');
const upload = require('../config/multer');

console.log("--- DEBUG ROUTES ---");
console.log("Controller Loaded?", !!productController);
console.log("Has getAllProducts?", !!productController.getAllProducts);
console.log("Has createProduct?", !!productController.createProduct);

// When user hits '/', run getAllProducts function
router.get('/',productController.getAllProducts);

// Quick Edit for products in CMS
router.put('/:id', productController.updateProduct);

// Stock-only update in CMS
router.patch('/:id/stock', productController.updateProductStock);

// Delete Product in CMS (Admin only)
router.delete('/:id', productController.deleteProduct);        

// POST new product (With image)
console.log("Multer Check: ", upload);
router.post('/', upload.array('image' , 5), productController.createProduct);

module.exports = router;

