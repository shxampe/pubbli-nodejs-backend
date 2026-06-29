import {
  createCheckoutSession,
  getCheckoutSession,
  createPaymentIntent,
  createOrRetrieveCustomer,
  refundPayment,
  createTransfer,
  getAccountDetails,
} from "../utils/StripePayment.js";
import User from "../models/User.js";
import Wallet from "../models/WalletModel.js";
import Transaction from "../models/TransactionModel.js";
import Stripe from "stripe";
import config from "../config/appconfig.js";
import crypto from "crypto";
import { logger } from "../utils/logger.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Create a checkout session for payment
 */

function generateTransactionId() {
  const random = crypto.randomBytes(4).toString("hex");
  return `txn_${Date.now()}_${random}`;
}

export const createCheckoutSessionController = async (req, res) => {
  try {
    const { amount, currency = "brl", description, metadata = {} } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
      });
    }

    // Get user and wallet information
    const user = await User.findById(userId);
    const wallet = await Wallet.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Create checkout session
    const result = await createCheckoutSession({
      amount: parseFloat(amount),
      currency,
      description: description || `Payment for ${user.name}`,
      metadata: {
        userId: userId.toString(),
        userEmail: user.email,
        userType: wallet?.userType || "user",
        ...metadata,
      },
      successUrl: `${config.stripe.successURL}?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${config.stripe.cancelURL}`,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    await Transaction.create({
      userId: userId,
      walletId: wallet?._id,
      transactionCreatedFor: "advertiser",
      type: "deposit_brl",
      amount: parseFloat(amount),
      currency: "BRL",
      status: "pending",
      description: "Transaction created for advertiser deposit amount in BRL",
      stripeSessionId: result.sessionId,
      transactionId: generateTransactionId(),
    });

    res.status(200).json({
      success: true,
      message: "Checkout session created successfully",
      data: {
        sessionId: result.sessionId,
        checkoutUrl: result.session.url,
      },
    });
  } catch (error) {
    logger.error(`Error in createCheckoutSessionController: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Get checkout session details
 */
export const getCheckoutSessionController = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    const result = await getCheckoutSession(sessionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    res.status(200).json({
      success: true,
      message: "Session details retrieved successfully",
      data: result.session,
    });
  } catch (error) {
    logger.error(`Error in getCheckoutSessionController: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Create a payment intent
 */
export const createPaymentIntentController = async (req, res) => {
  try {
    const { amount, currency = "brl", metadata = {} } = req.body;
    const userId = req.user._id;

    // Validate required fields
    if (!amount) {
      return res.status(400).json({
        success: false,
        message: "Amount is required",
      });
    }

    // Get user information
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Create or retrieve customer
    const customerResult = await createOrRetrieveCustomer({
      email: user.email,
      name: user.name,
      phone: user.phone,
    });

    if (!customerResult.success) {
      return res.status(400).json({
        success: false,
        message: customerResult.error,
      });
    }

    // Create payment intent
    const result = await createPaymentIntent({
      amount: parseFloat(amount),
      currency,
      customerId: customerResult.customer.id,
      metadata: {
        userId: userId.toString(),
        userEmail: user.email,
        ...metadata,
      },
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    res.status(200).json({
      success: true,
      message: "Payment intent created successfully",
      data: {
        clientSecret: result.clientSecret,
        customerId: customerResult.customer.id,
      },
    });
  } catch (error) {
    logger.error(`Error in createPaymentIntentController: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Process successful payment and update wallet
 */
export const processPaymentSuccess = async (req, res) => {
  try {
    const { sessionId } = req.body;
    const userId = req.user._id;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: "Session ID is required",
      });
    }

    // Get session details
    const sessionResult = await getCheckoutSession(sessionId);
    if (!sessionResult.success) {
      return res.status(400).json({
        success: false,
        message: sessionResult.error,
      });
    }

    const session = sessionResult.session;

    // Check if payment was successful
    if (session.payment_status !== "paid") {
      return res.status(400).json({
        success: false,
        message: "Payment was not successful",
      });
    }

    // Update wallet balance
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    // Convert amount from centavos to BRL
    const amountInBRL = session.amount_total / 100;

    // Update wallet balance
    wallet.balance += amountInBRL;
    // wallet.totalDepositBRL += amountInBRL;
    wallet.updatedAt = new Date();

    await wallet.save();

    res.status(200).json({
      success: true,
      message: "Payment processed successfully",
      data: {
        amount: amountInBRL,
        newBalance: wallet.balance,
        sessionId: session.id,
      },
    });
  } catch (error) {
    logger.error(`Error in processPaymentSuccess: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Create a refund
 */
export const createRefundController = async (req, res) => {
  try {
    const { paymentIntentId, amount } = req.body;
    // const userId = req.user._id;

    if (!paymentIntentId) {
      return res.status(400).json({
        success: false,
        message: "Payment intent ID is required",
      });
    }

    // Verify user owns the payment (you might want to store payment intent IDs in your database)
    // For now, we'll proceed with the refund

    const result = await refundPayment(paymentIntentId, amount);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    res.status(200).json({
      success: true,
      message: "Refund created successfully",
      data: result.refund,
    });
  } catch (error) {
    logger.error(`Error in createRefundController: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Get user's payment history
 */
export const getPaymentHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    // const { limit = 10, offset = 0 } = req.query;

    // Get user's wallet
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    // In a real implementation, you would store payment history in your database
    // For now, we'll return basic wallet information
    res.status(200).json({
      success: true,
      message: "Payment history retrieved successfully",
      data: {
        currentBalance: wallet.balance,
        totalDeposits: wallet.totalDepositBRL,
        currency: wallet.currency,
        lastUpdated: wallet.updatedAt,
      },
    });
  } catch (error) {
    logger.error(`Error in getPaymentHistory: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getTransactionHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    // const { limit = 10, offset = 0 } = req.query;

    // Get user's wallet
    const transaction = await Transaction.find({ userId }).populate(
      "campaignId",
      "campaignName coverImage campaignStrategy"
    );
    if (!transaction) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    // In a real implementation, you would store payment history in your database
    // For now, we'll return basic wallet information
    res.status(200).json({
      success: true,
      message: "Payment history retrieved successfully",
      data: transaction,
    });
  } catch (error) {
    logger.error(`Error in getTransactionHistory: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Handle Stripe webhook events
 */
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = config.stripe.webhook_secret;

  logger.info("Webhook called - checking configuration...");
  logger.info(`Signature header: ${sig ? "Present" : "Missing"}`);
  logger.info(`Webhook secret: ${endpointSecret ? "Configured" : "Missing"}`);

  // Check if webhook secret is configured
  if (!endpointSecret) {
    logger.error("STRIPE_WEBHOOK_SECRET is not configured");
    return res.status(500).json({
      error:
        "Webhook secret not configured. Please set STRIPE_WEBHOOK_SECRET environment variable.",
    });
  }

  // Check if signature is present
  if (!sig) {
    logger.error("Stripe signature header is missing");
    return res.status(400).json({
      error: "Stripe signature header is missing",
    });
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    logger.info("Webhook signature verified successfully");
  } catch (err) {
    logger.error(`Webhook signature verification failed: ${err.message}`);
    return res.status(400).json({
      error: `Webhook signature verification failed: ${err.message}`,
    });
  }

  // Handle the event
  switch (event.type) {
    case "payment_intent.succeeded":
      await handleCheckoutSessionCompleted(event.data.object);
      // await handlePaymentIntentSucceeded(event.data.object);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object);
      break;
    case "account.updated":
      await handleUpdateConnectAccountHook(event.data.object);
      break;
    case "person.updated":
      logger.info("person.updated is calling..");
      break;
    case "capability.updated":
      await handleUpdateConnectAccountHook(event.data.object);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object);
      break;
    case "payout.paid":
      await handlePayoutPaid(event.data.object);
      break;
    case "payout.failed":
      await handlePayoutFailed(event.data.object);
      break;
    case "transfer.reversed":
      await handleTransferReversed(event.data.object);
      break;
    case "payout.canceled":
      await handlePayoutCanceled(event.data.object);
      break;
    default:
      logger.info(`Unhandled event type ${event.type}`);
  }

  res.json({ received: true });
};

/**
 * Handle successful checkout session completion
 */
const handleCheckoutSessionCompleted = async (session) => {
  try {
    logger.info(`Processing checkout session completed: ${session.id}`);

    const userId = session.metadata?.userId;
    if (!userId) {
      logger.error("No userId in session metadata");
      return;
    }

    // Update wallet balance
    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      logger.error(`Wallet not found for user: ${userId}`);
      return;
    }

    logger.info(`Session amount: ${session.amount}`);

    const amountInBRL = Number(session.amount / 100 || 0);

    wallet.totalDepositBRL += amountInBRL;
    wallet.balance += amountInBRL;
    wallet.available_coins += amountInBRL;
    wallet.updatedAt = new Date();

    const newWallet = await wallet.save();

    logger.info(`New wallet balance: ${newWallet.balance}`);

    // update deposit transaction
    // const transaction = await Transaction.findOne({
    //   stripeSessionId: session.id,
    // });

    // transaction.status = "completed";
    // transaction.description = "transaction completed after successfull deposit";
    // transaction.confirmedAt = new Date();

    // await transaction.save();

    const transaction = await Transaction.create({
      userId: userId,
      walletId: wallet._id,
      transactionCreatedFor: "advertiser",
      type: "deposit_brl",
      amount: amountInBRL,
      currency: "BRL",
      status: "completed",
      description: "Transaction created for deposit",
      stripeSessionId: session.id,
      transactionId: generateTransactionId(),
      confirmedAt: new Date(),
    });

    logger.info(`Transaction created: ${transaction._id}`);

    logger.info(`Wallet updated for user ${userId}: +R$${amountInBRL}`);
  } catch (error) {
    logger.error(`Error handling checkout session completed: ${error.message}`);
  }
};

/**
 * Handle failed payment intent
 */
const handlePaymentIntentFailed = async (paymentIntent) => {
  try {
    logger.info(`Processing payment intent failed: ${paymentIntent.id}`);

    // Log the failure for monitoring
    logger.error(`Payment failed for intent: ${paymentIntent.id}`);
    logger.error(
      `Failure reason: ${paymentIntent.last_payment_error?.message}`
    );
  } catch (error) {
    logger.error(`Error handling payment intent failed: ${error.message}`);
  }
};

/**
 * Handle connect account update
 */

export const handleUpdateConnectAccount = async (req, res) => {
  try {
    const userConnectId = req.query.connectId;

    const user = await User.findOne({ stripeConnectId: userConnectId });

    const account = await stripe.accounts.retrieve(userConnectId);

    const isOnboardingComplete =
      account.details_submitted &&
      account.charges_enabled &&
      account.payouts_enabled;

    if (isOnboardingComplete) {
      user.isOnboardingComplete = true;
      await user.save();
      return res.status(200).json({
        message: "User onboarded succussfully.",
      });
    } else {
      return res.status(200).json({
        message: "User onboarding unsuccussfully.",
      });
    }
  } catch (error) {
    logger.error(`Error handling connect account: ${error.message}`);
  }
};

const handleUpdateConnectAccountHook = async (dataEvents) => {
  try {
    const userConnectId = dataEvents.id;

    const user = await User.findOne({ stripeConnectId: userConnectId });

    const account = await stripe.accounts.retrieve(userConnectId);

    const isOnboardingComplete =
      account.details_submitted &&
      account.charges_enabled &&
      account.payouts_enabled;

    if (isOnboardingComplete) {
      user.isOnboardingComplete = true;
      await user.save();
    } else {
      logger.info("User onboarding unsuccussfully.");
    }
  } catch (error) {
    logger.error(`Error handling connect account failed: ${error}`);
  }
};

/**
 * Handle charge refunded
 */
const handleChargeRefunded = async (charge) => {
  try {
    logger.info(`Processing charge refunded: ${charge.id}`);

    // You might want to update wallet balance here if needed
    // For now, just log the refund
    logger.info(`Refund processed for charge: ${charge.id}`);
  } catch (error) {
    logger.error(`Error handling charge refunded: ${error.message}`);
  }
};

/**
 * Handle payout.paid event
 */
const handlePayoutPaid = async (payout) => {
  try {
    // Find the transaction by transferId (source_transfer or id)
    const transferId = payout.source_transfer || payout.id;
    const transaction = await Transaction.findOne({
      "metadata.transferId": transferId,
      type: "withdrawal_brl",
    }).populate("userId");
    if (transaction && transaction.status !== "completed") {
      transaction.status = "completed";
      transaction.confirmedAt = new Date();
      await transaction.save();
      // // Notify user
      // if (transaction.userId && transaction.userId.email) {
      //   await sendEmail(
      //     process.env.NOTIFY_EMAIL_FROM || "no-reply@pubbli.com",
      //     transaction.userId.email,
      //     "Withdrawal Completed",
      //     withdrawalCompletedTemplate(transaction.amount)
      //   );
      // }
    }
  } catch (error) {
    logger.error(`Error handling payout.paid: ${error.message}`);
  }
};

/**
 * Handle payout.failed event
 */
const handlePayoutFailed = async (payout) => {
  try {
    // Find the transaction by transferId (source_transfer or id)
    const transferId = payout.source_transfer || payout.id;
    const transaction = await Transaction.findOne({
      "metadata.transferId": transferId,
      type: "withdrawal_brl",
    }).populate("userId");
    if (transaction && transaction.status !== "failed") {
      transaction.status = "failed";
      transaction.failedAt = new Date();
      transaction.failureReason = payout.failure_message || "Payout failed";
      await transaction.save();
      // Notify user
      // if (transaction.userId && transaction.userId.email) {
      //   await sendEmail(
      //     process.env.NOTIFY_EMAIL_FROM || "no-reply@pubbli.com",
      //     transaction.userId.email,
      //     "Withdrawal Failed",
      //     withdrawalFailedTemplate(
      //       transaction.amount,
      //       transaction.failureReason
      //     )
      //   );
      // }
    }
  } catch (error) {
    logger.error(`Error handling payout.failed: ${error.message}`);
  }
};

const handleTransferReversed = async (transfer) => {
  try {
    const transferId = transfer.id;
    const transaction = await Transaction.findOne({
      "metadata.transferId": transferId,
      type: "withdrawal_brl",
    }).populate("userId");
    if (transaction && transaction.status !== "failed") {
      transaction.status = "failed";
      transaction.failedAt = new Date();
      transaction.failureReason = "Transfer was reversed by Stripe.";
      await transaction.save();
      // if (transaction.userId && transaction.userId.email) {
      //   await sendEmail(
      //     process.env.NOTIFY_EMAIL_FROM || "no-reply@pubbli.com",
      //     transaction.userId.email,
      //     "Withdrawal Failed",
      //     withdrawalFailedTemplate(
      //       transaction.amount,
      //       transaction.failureReason
      //     )
      //   );
      // }
    }
  } catch (error) {
    logger.error(`Error handling transfer.reversed: ${error.message}`);
  }
};

const handlePayoutCanceled = async (payout) => {
  try {
    const transferId = payout.source_transfer || payout.id;
    const transaction = await Transaction.findOne({
      "metadata.transferId": transferId,
      type: "withdrawal_brl",
    }).populate("userId");
    if (transaction && transaction.status !== "failed") {
      transaction.status = "failed";
      transaction.failedAt = new Date();
      transaction.failureReason = "Payout was canceled by Stripe.";
      await transaction.save();
      // if (transaction.userId && transaction.userId.email) {
      //   await sendEmail(
      //     process.env.NOTIFY_EMAIL_FROM || "no-reply@pubbli.com",
      //     transaction.userId.email,
      //     "Withdrawal Failed",
      //     withdrawalFailedTemplate(
      //       transaction.amount,
      //       transaction.failureReason
      //     )
      //   );
      // }
    }
  } catch (error) {
    logger.error(`Error handling payout.canceled: ${error.message}`);
  }
};

// generate onboarding
export async function generateOnboardingLink(req, res) {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user || !user.stripeConnectId) {
      return res
        .status(404)
        .json({ error: "User or Connect account not found" });
    }

    const wallet = await Wallet.findOne({ userId: userId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "User Wallet not found.",
      });
    }

    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: user.stripeConnectId,
      refresh_url: `https://pubbli-influencer.vercel.app/wallet/onboarding/refresh`,
      return_url: `${config.app.successURL}connect/success?account_id=${user.stripeConnectId}`,
      type: "account_onboarding",
    });

    return res.status(201).json({
      success: true,
      onboardingUrl: accountLink.url,
    });
  } catch (error) {
    logger.error(`Error creating onboarding link: ${error.message}`);
    res.status(500).json({ error: "Failed to create onboarding link" });
  }
}

/**
 * create session for connect account onboarding
 */
export const handleCreateAccountSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user || !user.stripeConnectId) {
      return res
        .status(404)
        .json({ error: "User or Connect account not found" });
    }

    const accountSession = await stripe.accountSessions.create({
      account: user.stripeConnectId,
      components: {
        account_onboarding: {
          enabled: true,
        },
      },
    });

    return res
      .status(200)
      .json({ success: true, accountSession: accountSession.client_secret });
  } catch (error) {
    logger.error(`Error creating account session: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
};

/**
 * Initiate withdrawal
 */
export const initiateWithdrawalController = async (req, res) => {
  try {
    const { amount } = req.body;
    const userId = req.user._id;

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Valid amount is required",
      });
    }

    const user = await User.findById({ _id: userId });
    if (!user?.stripeConnectId) {
      return res.status(404).json({
        success: false,
        message: "Stripe connect account not found.",
      });
    }

    const wallet = await Wallet.findOne({ userId });
    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    // Check if user has sufficient balance
    if (wallet.balance < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
    }

    // Check if account is active
    // if (wallet.stripeAccountStatus !== "active") {
    //   return res.status(400).json({
    //     success: false,
    //     message:
    //       "Account not ready for withdrawals. Please complete onboarding.",
    //   });
    // }

    // Create transfer
    const transferResult = await createTransfer({
      destination: user.stripeConnectId,
      amount: Math.round(amount * 100), // amount in cents
      currency: "usd",
    });

    if (!transferResult.success || !transferResult.transfer?.id) {
      return res.status(400).json({
        success: false,
        message: transferResult.error,
      });
    }

    // Create transaction record
    const transaction = new Transaction({
      userId: userId,
      walletId: wallet._id,
      type: "withdrawal_brl",
      amount: amount,
      currency: "BRL",
      status: "completed",
      description: "Withdrawal to connected account",
      transactionId: generateTransactionId(),
      transactionCreatedFor: "influencer",
      metadata: {
        transferId: transferResult.transfer.id,
        destination: user.stripeConnectId,
      },
    });

    await transaction.save();

    // Update wallet balance
    // wallet.totalDepositBRL -= amount;
    wallet.balance -= amount;
    wallet.available_coins -= amount;
    await wallet.save();

    res.status(200).json({
      success: true,
      message: "Withdrawal initiated successfully",
      data: {
        transferId: transferResult.transfer.id,
        amount: amount,
        status: "pending",
      },
    });
  } catch (error) {
    logger.error(`Error in initiateWithdrawalController: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Get withdrawal history
 */
export const getWithdrawalHistoryController = async (req, res) => {
  try {
    const userId = req.user._id;
    const { page = 1, limit = 10 } = req.query;

    const transactions = await Transaction.find({
      userId,
      type: "withdrawal_brl",
    })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate("walletId", "stripeAccountId");

    const total = await Transaction.countDocuments({
      userId,
      type: "withdrawal_brl",
    });

    res.status(200).json({
      success: true,
      message: "Withdrawal history retrieved successfully",
      data: {
        transactions,
        pagination: {
          current: page,
          pages: Math.ceil(total / limit),
          total,
        },
      },
    });
  } catch (error) {
    logger.error(`Error in getWithdrawalHistoryController: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
  Save payment methods
**/

export const savePaymentMethod = async (req, res) => {
  try {
    const userId = req.user._id;

    const { paymentMethodId, setDefault } = req.body;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User does not exists.",
      });
    }

    const paymentMethod = await stripe.paymentMethods.attach(paymentMethodId, {
      customer: user.stripe_customer_id,
    });

    if (setDefault) {
      await stripe.customers.update(user.stripe_customer_id, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });
    }

    res.status(200).json({
      success: true,
      message: "card added successfully",
      data: paymentMethod,
    });
  } catch (error) {
    logger.error(`Error in savePaymentMethod: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * set default card method
 **/

export const setDefaultCard = async (req, res) => {
  try {
    const { defaultCardId } = req.body;

    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User does not exists.",
      });
    }

    const stripeCustomer = await stripe.customers.update(
      user.stripe_customer_id,
      {
        invoice_settings: {
          default_payment_method: defaultCardId,
        },
      }
    );

    if (
      stripeCustomer.invoice_settings.default_payment_method === defaultCardId
    ) {
      return res.status(201).json({});
    } else {
      res.status(400).json({
        success: false,
        message: "default card is not added.",
      });
    }
  } catch (error) {
    logger.error(`Error in setDefaultCard: ${error.message}`);
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * get user payment cards
 **/
export const getPaymentCards = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId);

    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "User not found." });
    }

    const stripePaymentMethods = await stripe.paymentMethods.list({
      customer: user.stripe_customer_id,
      type: "card",
    });

    const customer = await stripe.customers.retrieve(user.stripe_customer_id);

    let defaultPaymentMethodId = null;

    if (
      customer.invoice_settings &&
      customer.invoice_settings.default_payment_method
    ) {
      defaultPaymentMethodId = customer.invoice_settings.default_payment_method;
    }

    res.status(200).json({
      success: true,
      defaultCardId: defaultPaymentMethodId,
      data: stripePaymentMethods.data,
      message: "payment methods retrieved successfully.",
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * Delete card
 */

export const deleteCard = async (req, res) => {
  try {
    const { paymentMethodId } = req.params;
    const stripeDeleteCard =
      await stripe.paymentMethods.detach(paymentMethodId);
    if (stripeDeleteCard.customer === null) {
      return res.status(201).json();
    } else {
      return res.status(400).json({
        success: false,
        message: "Unable to delete card",
      });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

/**
 * Get account status
 */
export const getAccountStatusController = async (req, res) => {
  try {
    const userId = req.user._id;
    const wallet = await Wallet.findOne({ userId });

    if (!wallet?.stripeAccountId) {
      return res.status(404).json({
        success: false,
        message: "No connected account found",
      });
    }

    const result = await getAccountDetails(wallet.stripeAccountId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.error,
      });
    }

    // Update wallet status
    wallet.stripeAccountStatus = result.account.charges_enabled
      ? "active"
      : "pending";
    await wallet.save();

    res.status(200).json({
      success: true,
      message: "Account status retrieved successfully",
      data: {
        accountId: result.account.id,
        status: wallet.stripeAccountStatus,
        chargesEnabled: result.account.charges_enabled,
        payoutsEnabled: result.account.payouts_enabled,
        requirements: result.account.requirements,
      },
    });
  } catch (error) {
    logger.error(`Error in getAccountStatusController: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

/**
 * Charge Default Payment Method
 */
export async function chargeDefaultCard(customerId, amount) {
  const amountInCents = Math.round(parseFloat((amount * 100).toFixed(2)));

  // Validate minimum amount (50 cents for BRL)
  if (amountInCents < 50) {
    throw new Error("Payment amount must be at least R$ 0.50 (50 cents)");
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountInCents,
      currency: "brl",
      customer: customerId,
      payment_method: await getDefaultPaymentMethod(customerId),
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: "never",
      },
    });

    return paymentIntent;
  } catch (error) {
    logger.error(`Payment failed: ${error.message}`);
    throw error;
  }
}

async function getDefaultPaymentMethod(customerId) {
  // Get the customer's default payment method
  const customer = await stripe.customers.retrieve(customerId);
  return customer.invoice_settings.default_payment_method;
}