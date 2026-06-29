import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
  createCheckoutSessionController,
  getCheckoutSessionController,
  createPaymentIntentController,
  processPaymentSuccess,
  createRefundController,
  getPaymentHistory,
  // Add new withdraw functions
  initiateWithdrawalController,
  getWithdrawalHistoryController,
  getAccountStatusController,
  getTransactionHistory,
  generateOnboardingLink,
  handleUpdateConnectAccount,
  savePaymentMethod,
  getPaymentCards,
  deleteCard,
  handleCreateAccountSession,
  setDefaultCard,
} from "../../controllers/Stripe.Controller.js";

const router = express.Router();

// Create checkout session
router.post(
  "/create-checkout-session",
  authenticate,
  createCheckoutSessionController
);

// Get checkout session details
router.get(
  "/checkout-session/:sessionId",
  authenticate,
  getCheckoutSessionController
);

// Create payment intent
router.post(
  "/create-payment-intent",
  authenticate,
  createPaymentIntentController
);

// Process successful payment
router.post("/process-payment-success", authenticate, processPaymentSuccess);

// Create refund
router.post("/create-refund", authenticate, createRefundController);

// Get payment history
router.get("/payment-history", authenticate, getPaymentHistory);

router.get("/transaction-history", authenticate, getTransactionHistory);
// get stripe payment methods
router.get('/payment-methods', authenticate, getPaymentCards)
// add payment card
router.post('/save-payment-method', authenticate, savePaymentMethod);
// delete card
router.delete('/delete-card/:paymentMethodId', authenticate, deleteCard)
// set default card
router.put('/set-default-card', authenticate, setDefaultCard);

// generate onboarding link for connect account
router.get("/onboarding-link", authenticate, generateOnboardingLink);
router.patch("/onboard-complete", authenticate, handleUpdateConnectAccount)
router.post("/create-account-session", authenticate, handleCreateAccountSession)
// Withdraw functionality routes
router.post("/initiate-withdrawal", authenticate, initiateWithdrawalController);
router.get("/withdrawal-history", authenticate, getWithdrawalHistoryController);
router.get("/account-status", authenticate, getAccountStatusController);


export default router;
