const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Staff = require('../models/Staff'); // <-- Admin model
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// === USER SIGNUP ===
router.post('/signup', async (req, res) => {
  try {
    const { firstName, lastName, email, phone, password, role, employmentStatus, annualIncome } = req.body;

    const requiredFields = ['firstName', 'lastName', 'email', 'phone', 'password', 'employmentStatus', 'annualIncome'];
    const missingFields = requiredFields.filter(field => !req.body[field]);
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${missingFields.join(', ')}`
      });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email or phone already exists'
      });
    }

    const user = new User({
      firstName,
      lastName,
      email,
      phone,
      password,
      role: role || 'user',
      employmentStatus,
      annualIncome
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(201).json({
      success: true,
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during registration'
    });
  }
});

// === USER LOGIN ===
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );

    const userResponse = user.toObject();
    delete userResponse.password;

    res.status(200).json({
      success: true,
      token,
      user: userResponse
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error during login'
    });
  }
});

// === ADMIN SIGNUP ===
router.post('/admin/signup', async (req, res) => {
  try {
    const { fullName, email, password, employeeId } = req.body;
    const validEmployeeIds = ['CM001', 'CM002'];

    if (!fullName || !email || !password || !employeeId) {
      return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (!validEmployeeIds.includes(employeeId)) {
      return res.status(401).json({ success: false, message: 'Invalid employee ID.' });
    }

    const existingAdmin = await Staff.findOne({ email });
    if (existingAdmin) {
      return res.status(409).json({ success: false, message: 'Admin already exists.' });
    }

    const admin = new Staff({ fullName, email, password, employeeId });
    await admin.save();

    const token = jwt.sign(
      { id: admin._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully.',
      token,
      user: { name: admin.fullName, email: admin.email, role: 'admin' }
    });

  } catch (error) {
    console.error('Admin signup error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error.' });
  }
});

// === ADMIN LOGIN ===
router.post('/admin/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Staff.findOne({ email }).select('+password');
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: admin._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRE || '30d' }
    );

    res.status(200).json({
      success: true,
      message: 'Admin logged in successfully.',
      token,
      user: { name: admin.fullName, email: admin.email, role: 'admin' }
    });

  } catch (error) {
    console.error('Admin login error:', error);
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

module.exports = router;
