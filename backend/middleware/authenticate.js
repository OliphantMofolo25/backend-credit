const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Staff = require('../models/Staff'); // Admin model

// Main authentication middleware
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No token provided. Authorization denied.'
      });
    }

    // Verify JWT
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    let user;
    if (decoded.role === 'admin') {
      user = await Staff.findById(decoded.id).select('-password');
    } else {
      user = await User.findById(decoded.id).select('-password');
    }

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User or Admin not found.'
      });
    }

    // Attach user and role to request
    req.user = user;
    req.role = decoded.role;
    next();
  } catch (err) {
    console.error('Authentication error:', err.message);
    res.status(401).json({
      success: false,
      message: 'Invalid or expired token.'
    });
  }
};

// Middleware to allow only admins
const adminOnly = (req, res, next) => {
  if (req.role !== 'admin') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Admins only.'
    });
  }
  next();
};

// Middleware to allow only users
const userOnly = (req, res, next) => {
  if (req.role !== 'user') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Users only.'
    });
  }
  next();
};

// Export all middlewares as named exports
module.exports = {
  authenticate,
  adminOnly,
  userOnly
};