const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Staff = require('../models/Staff');

// === CONFIG ===
const JWT_SECRET = process.env.JWT_SECRET || 'default_secret';
const JWT_EXPIRE = process.env.JWT_EXPIRE || '30d';
const VALID_EMPLOYEE_IDS = ['901017233', '901017146'];

// === UTIL: Generate JWT Token ===
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, JWT_SECRET, { expiresIn: JWT_EXPIRE });
};

// === USER LOGIN ===
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid email or password.'
      });
    }

    const token = generateToken(user._id, user.role);
    const { password: _, ...userData } = user.toObject(); // Remove password

    res.status(200).json({ success: true, token, user: userData });

  } catch (err) {
    console.error('User login error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error during login.'
    });
  }
};

// === USER SIGNUP ===
exports.signup = async (req, res) => {
  try {
    const {
      firstName, lastName, email, phone,
      password, role, employmentStatus, annualIncome
    } = req.body;

    const requiredFields = [
      'firstName', 'lastName', 'email', 'phone',
      'password', 'employmentStatus', 'annualIncome'
    ];

    const missingFields = requiredFields.filter(field => !req.body[field]);
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Missing fields: ${missingFields.join(', ')}`
      });
    }

    const existingUser = await User.findOne({ $or: [{ email }, { phone }] });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'A user with this email or phone already exists.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      firstName,
      lastName,
      email,
      phone,
      password: hashedPassword,
      role: role || 'user',
      employmentStatus,
      annualIncome
    });

    await newUser.save();

    const token = generateToken(newUser._id, newUser.role);
    const { password: _, ...userData } = newUser.toObject();

    res.status(201).json({
      success: true,
      token,
      user: userData
    });

  } catch (err) {
    console.error('User signup error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error during registration.'
    });
  }
};

// === ADMIN LOGIN ===
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required.'
      });
    }

    const admin = await Staff.findOne({ email }).select('+password');
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid admin credentials.'
      });
    }

    const token = generateToken(admin._id, 'admin');

    res.status(200).json({
      success: true,
      token,
      user: {
        name: admin.fullName,
        email: admin.email,
        role: 'admin'
      }
    });

  } catch (err) {
    console.error('Admin login error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin login.'
    });
  }
};

// === ADMIN SIGNUP ===
exports.adminSignup = async (req, res) => {
  try {
    const { fullName, email, password, employeeId } = req.body;

    if (!fullName || !email || !password || !employeeId) {
      return res.status(400).json({
        success: false,
        message: 'All fields are required.'
      });
    }

    if (!VALID_EMPLOYEE_IDS.includes(employeeId)) {
      return res.status(403).json({
        success: false,
        message: 'Invalid or unauthorized employee ID.'
      });
    }

    const existingAdmin = await Staff.findOne({ email });
    if (existingAdmin) {
      return res.status(409).json({
        success: false,
        message: 'Admin with this email already exists.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const admin = new Staff({
      fullName,
      email,
      password: hashedPassword,
      employeeId
    });

    await admin.save();

    const token = generateToken(admin._id, 'admin');

    res.status(201).json({
      success: true,
      message: 'Admin registered successfully.',
      token,
      user: {
        name: admin.fullName,
        email: admin.email,
        role: 'admin'
      }
    });

  } catch (err) {
    console.error('Admin signup error:', err);
    res.status(500).json({
      success: false,
      message: 'Internal server error during admin registration.'
    });
  }
};
