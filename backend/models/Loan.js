const mongoose = require('mongoose');
const validator = require('validator');

const LoanSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'A loan must belong to a user'],
    index: true
  },
  loanAmount: {
    type: Number,
    required: [true, 'Loan amount is required'],
    min: [1000, 'Minimum loan amount is 1000'],
    max: [1000000, 'Maximum loan amount is 1,000,000'],
    set: val => Math.round(val * 100) / 100 // Ensure 2 decimal places
  },
  loanPurpose: {
    type: String,
    required: [true, 'Loan purpose is required'],
    enum: {
      values: ['Home', 'Car', 'Education', 'Business', 'Personal', 'Medical', 'Debt Consolidation'],
      message: 'Invalid loan purpose'
    },
    index: true
  },
  loanTerm: {
    type: Number,
    required: [true, 'Loan term is required'],
    min: [1, 'Minimum loan term is 1 month'],
    max: [60, 'Maximum loan term is 60 months']
  },
  interestRate: {
    type: Number,
    min: [1, 'Minimum interest rate is 1%'],
    max: [25, 'Maximum interest rate is 25%'],
    default: 8.5
  },
  monthlyIncome: {
    type: Number,
    required: [true, 'Monthly income is required']
  },
  employmentStatus: {
    type: String,
    required: [true, 'Employment status is required'],
    enum: ['employed', 'self-employed', 'student', 'retired', 'unemployed']
  },
  lenderId: {
    type: String,
    default: null
  },
  lenderName: {
    type: String,
    default: 'General Application'
  },
  status: {
    type: String,
    enum: {
      values: ['Pending', 'Approved', 'Rejected', 'Active', 'Completed', 'Defaulted'],
      message: 'Invalid loan status'
    },
    default: 'Pending',
    index: true
  },
  repaymentSchedule: [{
    dueDate: {
      type: Date,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['Pending', 'Paid', 'Late', 'Partial'],
      default: 'Pending'
    },
    paidDate: Date,
    transactionId: String
  }],
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  approvedAt: Date,
  rejectionReason: String,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: Date
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
  timestamps: true
});

// Indexes for better query performance
LoanSchema.index({ user: 1, status: 1 });
LoanSchema.index({ createdAt: -1 });
LoanSchema.index({ loanAmount: 1 });
LoanSchema.index({ loanPurpose: 'text' });

// Virtual property for total repayment amount
LoanSchema.virtual('totalRepayment').get(function() {
  const monthlyInterestRate = this.interestRate / 100 / 12;
  const payment = this.loanAmount * 
    (monthlyInterestRate * Math.pow(1 + monthlyInterestRate, this.loanTerm)) / 
    (Math.pow(1 + monthlyInterestRate, this.loanTerm) - 1);
  return payment * this.loanTerm;
});

// Virtual property for monthly payment
LoanSchema.virtual('monthlyPayment').get(function() {
  return this.totalRepayment / this.loanTerm;
});

// Instance method to generate repayment schedule
LoanSchema.methods.generateRepaymentSchedule = function() {
  const schedule = [];
  const monthlyPayment = this.monthlyPayment;
  const startDate = new Date();
  
  for (let i = 1; i <= this.loanTerm; i++) {
    const dueDate = new Date(startDate);
    dueDate.setMonth(dueDate.getMonth() + i);
    
    schedule.push({
      dueDate,
      amount: monthlyPayment,
      status: 'Pending'
    });
  }
  
  this.repaymentSchedule = schedule;
};

// Pre-save hook to update interest rate if lender changes
LoanSchema.pre('save', function(next) {
  if (this.isModified('lenderName')) {
    if (this.lenderName.includes('Premium')) {
      this.interestRate = 6.5;
    } else if (this.lenderName.includes('Standard')) {
      this.interestRate = 8.5;
    }
  }
  next();
});

// Query middleware to automatically populate user data
LoanSchema.pre(/^find/, function(next) {
  this.populate({
    path: 'user',
    select: 'name email phone'
  }).populate({
    path: 'approvedBy',
    select: 'name'
  });
  next();
});

module.exports = mongoose.model('Loan', LoanSchema);