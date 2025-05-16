const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/authenticate'); // Updated import
const Loan = require('../models/Loan');
const { body, validationResult } = require('express-validator');
const mongoose = require('mongoose');

/**
 * @route POST /loans
 * @desc Apply for a new loan
 * @access Private
 */
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

/**
 * @route GET /loans/my-loans
 * @desc Get user's loans with enhanced data for credit report
 * @access Private
 */
router.get('/my-loans', authenticate, async (req, res) => {
  try {
    const loans = await Loan.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .select('_id loanAmount loanPurpose loanTerm interestRate status lenderName monthlyPayment repaymentSchedule createdAt paymentHistory remainingTerm collateral creditLimit loanType')
      .lean();

    // Enhance loan data for credit report
    const enhancedLoans = loans.map(loan => {
      const paidPayments = loan.paymentHistory?.filter(p => p.status === 'paid').length || 0;
      const totalPayments = loan.paymentHistory?.length || 0;
      const paymentPercentage = totalPayments > 0 ? Math.round((paidPayments / totalPayments) * 100) : 0;
      
      return {
        ...loan,
        paymentHistory: loan.paymentHistory || [],
        remainingTerm: loan.remainingTerm || (loan.loanTerm - paidPayments),
        nextPaymentDate: loan.repaymentSchedule?.find(p => p.status === 'Pending')?.dueDate || null,
        paymentPercentage,
        originalAmount: loan.loanAmount,
        loanType: loan.loanType || 'Term',
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

/**
 * @route GET /loans/credit-report
 * @desc Get comprehensive credit report data
 * @access Private
 */
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

    // Enhanced credit score calculation
    const calculateCreditScore = (loans) => {
      const scoreFactors = {
        paymentHistory: { weight: 0.4, value: 0 },
        creditUtilization: { weight: 0.2, value: 0 },
        creditMix: { weight: 0.1, value: 0 },
        accountStatus: { weight: 0.3, value: 0 }
      };

      // Payment history (40%)
      scoreFactors.paymentHistory.value = loans.reduce((sum, loan) => {
        const paid = (loan.paymentHistory || []).filter(p => p.status === 'paid').length;
        const total = (loan.paymentHistory || []).length || 1;
        return sum + (paid / total);
      }, 0) / loans.length;

      // Credit utilization (20%)
      const totalDebt = loans.reduce((sum, loan) => 
        loan.status === 'Active' ? sum + (loan.loanAmount || 0) : sum, 0);
      const totalCredit = loans.reduce((sum, loan) => 
        loan.status === 'Active' && loan.loanType === 'Credit' ? sum + (loan.creditLimit || 0) : sum, 0);
      const utilization = totalCredit > 0 ? totalDebt / totalCredit : 0;
      scoreFactors.creditUtilization.value = 1 - Math.min(utilization, 1);

      // Credit mix (10%)
      scoreFactors.creditMix.value = new Set(loans.map(loan => loan.loanPurpose)).size / 5;

      // Account status (30%)
      const statusWeights = {
        'Paid': 5,
        'Active': 3,
        'Defaulted': -10,
        'Pending': 1
      };
      scoreFactors.accountStatus.value = loans.reduce((sum, loan) => 
        sum + (statusWeights[loan.status] || 0), 0) / loans.length;

      // Calculate final score (300-850 range)
      const baseScore = 300;
      const maxScore = 850;
      const weightedScore = Object.values(scoreFactors).reduce((sum, factor) => 
        sum + (factor.value * factor.weight * (maxScore - baseScore)), 0);

      return Math.min(Math.max(Math.round(baseScore + weightedScore), 300), 850);
    };

    const creditScore = calculateCreditScore(loans);
    const scoreRange = 
      creditScore >= 720 ? 'Excellent' :
      creditScore >= 650 ? 'Good' :
      creditScore >= 580 ? 'Fair' : 'Poor';

    // Calculate financial metrics
    const totalDebt = loans.reduce((sum, loan) => 
      loan.status === 'Active' ? sum + (loan.loanAmount || 0) : sum, 0);

    const availableCredit = loans.reduce((sum, loan) => 
  loan.status === 'Active' && loan.loanType === 'Credit' ? 
    sum + Math.max(0, (loan.creditLimit || 0) - (loan.loanAmount || 0)) : 
    sum, 0);


    const creditUtilization = totalDebt > 0 
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
        payment: loan.monthlyPayment || 0,
        interestRate: loan.interestRate ? `${loan.interestRate}%` : 'N/A',
        opened: loan.createdAt ? loan.createdAt.toISOString().split('T')[0] : 'N/A',
        term: `${loan.loanTerm || 0} months`,
        remainingTerm: `${loan.remainingTerm || 0} months`,
        paymentHistory: loan.paymentHistory || [],
        nextPaymentDate: loan.repaymentSchedule?.find(p => p.status === 'Pending')?.dueDate?.toISOString().split('T')[0] || 'N/A',
        creditLimit: loan.creditLimit || 0,
        loanType: loan.loanType || 'Term'
      })),
      creditUtilization,
      totalDebt,
      availableCredit,
      openAccounts: loans.length,
      lastUpdated: new Date().toISOString()
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

/**
 * @route GET /loans/:id
 * @desc Get specific loan details
 * @access Private
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid loan ID format'
      });
    }

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
        loanType: loan.loanType || 'Term',
        createdAt: loan.createdAt
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