const express = require('express');
const router = express.Router();

const { placeOrder } = require('../controllers/ordersController');
const { getAllOrders} = require('../controllers/ordersController');
const { updateOrderStatus } = require('../controllers/ordersController');
const { getOrderStats } = require('../controllers/ordersController');

// PUBLIC
router.post('/', placeOrder);

// ADMIN Routes
router.get('/admin',getAllOrders);
router.put('/:id/status', updateOrderStatus);
router.get('/stats' , getOrderStats);

module.exports = router;