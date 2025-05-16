const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authenticate');
const Loan = require('../models/Loan');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

// Apply for a new loan
router.post('/', 
  authenticate,
  [
    body('loanAmount').isNumeric().withMessage('Loan amount must be a number'),
    body('loanAmount').custom(value => value >= 1000).withMessage('Minimum loan amount is 1000'),
    body('loanPurpose').isIn(['Home', 'Car', 'Education', 'Business', 'Personal', 'Medical', 'Debt Consolidation']),
    body('loanTerm').isInt({ min: 1, max: 60 }),
    body('monthlyIncome').isNumeric(),
    body('employmentStatus').isIn(['employed', 'self-employed', 'student', 'retired', 'unemployed'])
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
          message: 'Validation failed'
        });
      }

      const { 
        loanAmount, 
        loanPurpose, 
        loanTerm,
        lenderId,
        lenderName,
        monthlyIncome,
        employmentStatus,
        collateral
      } = req.body;

      const interestRate = req.body.interestRate || 
                         (lenderName?.includes('Premium') ? 6.5 : 8.5);

      const loan = new Loan({
        user: req.user.id,
        loanAmount,
        loanPurpose,
        loanTerm,
        interestRate,
        lenderId: lenderId || null,
        lenderName: lenderName || 'General Application',
        monthlyIncome,
        employmentStatus: employmentStatus.toLowerCase(),
        collateral: collateral || null,
        status: 'Pending',
        paymentHistory: [],
        remainingTerm: loanTerm
      });

      // Generate repayment schedule
      loan.generateRepaymentSchedule();
      await loan.save();

      res.status(201).json({
        success: true,
        message: 'Loan application submitted successfully',
        loan: {
          id: loan._id,
          status: loan.status,
          loanAmount: loan.loanAmount,
          loanPurpose: loan.loanPurpose,
          lenderName: loan.lenderName
        }
      });

    } catch (error) {
      console.error('Loan application error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Server error during loan application'
      });
    }
  }
);

// Get user's loans with enhanced data for credit report
router.get('/my-loans', authenticate, async (req, res) => {
  try {
    const loans = await Loan.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .select('_id loanAmount loanPurpose loanTerm interestRate status lenderName monthlyPayment repaymentSchedule createdAt paymentHistory remainingTerm collateral creditLimit loanType')
      .lean();

    // Enhance loan data for credit report
    const enhancedLoans = loans.map(loan => {
      const paidPayments = loan.paymentHistory?.filter(p => p === 'paid').length || 0;
      const totalPayments = loan.paymentHistory?.length || 0;
      const paymentPercentage = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 0;
      
      return {
        ...loan,
        paymentHistory: loan.paymentHistory || [],
        remainingTerm: loan.remainingTerm || (loan.loanTerm - paidPayments),
        nextPaymentDate: loan.repaymentSchedule?.find(p => p.status === 'Pending')?.dueDate || null,
        paymentPercentage,
        originalAmount: loan.loanAmount,
        loanType: loan.loanType || 'Term', // Default to Term loan if not specified
        creditLimit: loan.creditLimit || 0
      };
    });

    res.json({
      success: true,
      count: enhancedLoans.length,
      loans: enhancedLoans
    });
  } catch (error) {
    console.error('Get loans error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching loans'
    });
  }
});

// Get loan details for credit report - primary endpoint for frontend
router.get('/credit-report', authenticate, async (req, res) => {
  try {
    const loans = await Loan.find({ user: req.user.id })
      .select('_id loanAmount loanPurpose loanTerm interestRate status lenderName monthlyPayment repaymentSchedule createdAt paymentHistory remainingTerm creditLimit loanType')
      .lean();

    if (!loans || loans.length === 0) {
      return res.json({
        creditScore: 0,
        scoreRange: 'No Credit History',
        accounts: [],
        inquiries: [],
        publicRecords: [],
        creditUtilization: '0%',
        totalDebt: 0,
        availableCredit: 0,
        openAccounts: 0
      });
    }

    // Calculate credit score
    const calculateCreditScore = (loans) => {
      if (loans.length === 0) return 0;
      
      let score = 650; // Base score
      
      // Payment history (40% weight)
      const paymentHistoryScore = loans.reduce((sum, loan) => {
        const paid = (loan.paymentHistory || []).filter(p => p === 'paid').length;
        const total = (loan.paymentHistory || []).length || 1;
        return sum + (paid / total);
      }, 0) / loans.length * 400;

      // Credit utilization (20% weight)
      const totalDebt = loans.reduce((sum, loan) => 
        loan.status === 'Active' ? sum + (loan.loanAmount || 0) : sum, 0);
      const totalCredit = loans.reduce((sum, loan) => 
        loan.status === 'Active' && loan.loanType === 'Credit' ? sum + (loan.creditLimit || 0) : sum, 0);
      const utilization = totalCredit > 0 ? totalDebt / totalCredit : 0;
      const utilizationScore = (1 - Math.min(utilization, 1)) * 200;

      // Loan mix (10% weight)
      const loanTypes = new Set(loans.map(loan => loan.loanPurpose));
      const mixScore = loanTypes.size * 10;

      // Status factors (30% weight)
      const paidLoans = loans.filter(loan => loan.status === 'Paid').length;
      const activeLoans = loans.filter(loan => loan.status === 'Active').length;
      const defaultedLoans = loans.filter(loan => loan.status === 'Defaulted').length;
      
      const statusScore = paidLoans * 5 + activeLoans * 3 - defaultedLoans * 10;

      score = paymentHistoryScore + utilizationScore + mixScore + statusScore;
      
      return Math.min(Math.max(Math.round(score), 300), 850);
    };

    const creditScore = calculateCreditScore(loans);
    const scoreRange = 
      creditScore >= 720 ? 'Excellent' :
      creditScore >= 650 ? 'Good' :
      creditScore >= 580 ? 'Fair' : 'Poor';

    const totalDebt = loans.reduce((sum, loan) => 
      loan.status === 'Active' ? sum + (loan.loanAmount || 0) : sum, 0);

    const availableCredit = loans.reduce((sum, loan) => 
      loan.status === 'Active' && loan.loanType === 'Credit' ? 
      sum + (loan.creditLimit || 0) - (loan.loanAmount || 0) : sum, 0);

    const creditUtilization = availableCredit > 0 
      ? `${Math.round((totalDebt / (totalDebt + availableCredit)) * 100)}%`
      : '0%';

    const response = {
      creditScore,
      scoreRange,
      accounts: loans.map(loan => ({
        id: loan._id,
        name: loan.lenderName || 'Personal Loan',
        type: loan.loanPurpose ? `${loan.loanPurpose} Loan` : 'Personal Loan',
        status: loan.status || 'Pending',
        balance: loan.loanAmount || 0,
        originalAmount: loan.originalAmount || loan.loanAmount || 0,
        payment: loan.monthlyPayment || 0,
        interestRate: loan.interestRate ? `${loan.interestRate}%` : 'N/A',
        opened: loan.createdAt ? loan.createdAt.toISOString() : 'N/A',
        term: loan.loanTerm ? `${loan.loanTerm} months` : 'N/A',
        remainingTerm: loan.remainingTerm ? `${loan.remainingTerm} months` : 'N/A',
        paymentHistory: loan.paymentHistory || [],
        nextPaymentDate: loan.nextPaymentDate ? loan.nextPaymentDate.toISOString() : 'N/A',
        collateral: loan.collateral || 'N/A',
        repaymentPlan: loan.repaymentPlan || 'Standard',
        creditLimit: loan.creditLimit || 0,
        loanType: loan.loanType || 'Term'
      })),
      inquiries: [],
      publicRecords: [],
      creditUtilization,
      totalDebt,
      availableCredit,
      openAccounts: loans.length
    };

    res.json(response);
  } catch (error) {
    console.error('Credit report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating credit report'
    });
  }
});

// Get loan details
router.get('/:id', authenticate, async (req, res) => {
  try {
    const loan = await Loan.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    res.json({
      success: true,
      loan: {
        id: loan._id,
        loanAmount: loan.loanAmount,
        loanPurpose: loan.loanPurpose,
        loanTerm: loan.loanTerm,
        interestRate: loan.interestRate,
        status: loan.status,
        lenderName: loan.lenderName,
        monthlyPayment: loan.monthlyPayment,
        nextPayment: loan.repaymentSchedule.find(p => p.status === 'Pending'),
        paymentHistory: loan.paymentHistory || [],
        collateral: loan.collateral || null,
        creditLimit: loan.creditLimit || 0,
        loanType: loan.loanType || 'Term'
      }
    });
  } catch (error) {
    console.error('Get loan error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching loan details'
    });
  }
});

module.exports = router;