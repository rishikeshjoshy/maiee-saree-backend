const express = require('express');
const router = express.Router();

const { placeOrder } = require('../controllers/ordersController');
const { getAllOrders} = require('../controllers/ordersController');
const { updateOrderStatus } = require('../controllers/ordersController');
const { getOrderStats } = require('../controllers/ordersController');

// POST ACTIONS FOR PUBLIC
router.post('/', placeOrder);

// GET ACTIONS FOR ADMIN
router.get('/admin',getAllOrders);
router.get('/stats' , getOrderStats);

// PUT ACTIONS FOR ADMIN
router.put('/:id/status', updateOrderStatus);

module.exports = router;