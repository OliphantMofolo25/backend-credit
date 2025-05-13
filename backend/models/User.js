const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const UserSchema = new mongoose.Schema({
  firstName: { 
    type: String, 
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: { 
    type: String, 
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  email: { 
    type: String, 
    required: [true, 'Email is required'],
    unique: true,
    trim: true,
    lowercase: true,
    maxlength: [100, 'Email cannot exceed 100 characters'],
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please add a valid email']
  },
  phone: { 
    type: String, 
    required: [true, 'Phone number is required'],
    unique: true,
    validate: {
      validator: function(v) {
        return /^\+266\d{8}$/.test(v);
      },
      message: 'Lesotho phone must be +266 followed by 8 digits'
    }
  },
  password: { 
    type: String, 
    required: [true, 'Password is required'],
    minlength: [8, 'Password must be at least 8 characters'],
    validate: {
      validator: function(v) {
        return /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[^a-zA-Z0-9])/.test(v);
      },
      message: 'Password must contain uppercase, lowercase, number and special character'
    },
    select: false
  },
  role: { 
    type: String, 
    enum: ['user', 'premium', 'admin'],
    default: 'user'
  },
  employmentStatus: { 
    type: String,
    required: [true, 'Employment status is required'],
    enum: ['Employed', 'Self-employed', 'Unemployed', 'Student', 'Retired']
  },
  annualIncome: { 
    type: Number,
    required: [true, 'Annual income is required'],
    min: [0, 'Annual income cannot be negative'],
    max: [10000000, 'Annual income cannot exceed 10,000,000']
  },
  creditScore: {
    type: Number,
    min: [300, 'Minimum credit score is 300'],
    max: [850, 'Maximum credit score is 850'],
    default: 650
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, { 
  versionKey: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual populate loans
UserSchema.virtual('loans', {
  ref: 'Loan',
  localField: '_id',
  foreignField: 'user'
});

// Encrypt password before saving
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

module.exports = mongoose.model('User', UserSchema);