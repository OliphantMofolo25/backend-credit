const express = require('express');
const router = express.Router();
const Payment = require('../models/Payment');
const jwt = require('jsonwebtoken');

// Middleware to verify JWT
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, 'your_jwt_secret'); // Replace with your secret
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid token' });
  }
};

// GET /api/payment-history
router.get('/payment-history', authenticate, async (req, res) => {
  try {
    // Find payments related to the logged-in user
    const payments = await Payment.find({ user: req.user.id }).sort({ paymentDate: -1 });
    res.json(payments);
  } catch (error) {
    console.error('Error fetching payment history:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

module.exports = router;
