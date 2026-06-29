import Stripe from "stripe";
import config from "../config/appconfig.js";
import { logger } from "./logger.js";

// Initialize Stripe with secret key from environment variables
const stripe = new Stripe(config.stripe.stripeSecretKey);

/**
 * Create a Stripe checkout session for payment
 * @param {Object} paymentData - Payment information
 * @param {number} paymentData.amount - Amount in dollars
 * @param {string} paymentData.currency - Currency code (default: 'usd')
 * @param {string} paymentData.description - Payment description
 * @param {Object} paymentData.metadata - Additional metadata
 * @param {string} paymentData.successUrl - Success redirect URL
 * @param {string} paymentData.cancelUrl - Cancel redirect URL
 * @returns {Promise<Object>} Stripe session object
 */
export const createCheckoutSession = async (paymentData) => {
  try {
    const {
      amount,
      currency = "brl",
      description = "Payment",
      metadata = {},
      successUrl,
      cancelUrl,
    } = paymentData;

    // Validate amount
    if (!amount || amount <= 0) {
      throw new Error("Invalid amount");
    }

    // Minimum amount validation (Stripe minimum is R$0.50 for BRL)
    if (amount < 0.5) {
      throw new Error("Minimum amount is R$0.50");
    }

    // Convert BRL to centavos for Stripe
    const amountInCentavos = Math.round(amount * 100);

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: "Custom Amount Payment",
              description: description,
            },
            unit_amount: amountInCentavos,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url:
        successUrl ||
        `${process.env.CLIENT_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.CLIENT_URL}/cancel`,
      metadata: {
        custom_amount: amount.toString(),
        payment_type: "custom_amount",
        ...metadata,
      },
    });

    return {
      success: true,
      sessionId: session.id,
      session: session,
    };
  } catch (error) {
    logger.error(`Error creating checkout session: ${error}`);
    return {
      success: false,
      error: error.message || "Failed to create checkout session",
    };
  }
};

/**
 * Retrieve a Stripe checkout session by session ID
 * @param {string} sessionId - Stripe session ID
 * @returns {Promise<Object>} Session details
 */
export const getCheckoutSession = async (sessionId) => {
  try {
    if (!sessionId) {
      throw new Error("Session ID is required");
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    return {
      success: true,
      session: {
        id: session.id,
        amount_total: session.amount_total,
        payment_status: session.payment_status,
        customer_email: session.customer_details?.email,
        metadata: session.metadata,
        currency: session.currency,
        created: session.created,
        expires_at: session.expires_at,
      },
    };
  } catch (error) {
    logger.error(`Error retrieving session: ${error}`);
    return {
      success: false,
      error: error.message || "Failed to retrieve session",
    };
  }
};

/**
 * Create a payment intent for more complex payment flows
 * @param {Object} paymentData - Payment information
 * @param {number} paymentData.amount - Amount in cents
 * @param {string} paymentData.currency - Currency code
 * @param {string} paymentData.customerId - Stripe customer ID (optional)
 * @returns {Promise<Object>} Payment intent object
 */
export const createPaymentIntent = async (paymentData) => {
  try {
    const { amount, currency = "brl", customerId, metadata = {} } = paymentData;

    // Validate amount
    if (!amount || amount <= 0) {
      throw new Error("Invalid amount");
    }

    const paymentIntentData = {
      amount: Math.round(amount * 100), // Convert to centavos
      currency: currency.toLowerCase(),
      metadata: {
        payment_type: "payment_intent",
        ...metadata,
      },
    };

    // Add customer if provided
    if (customerId) {
      paymentIntentData.customer = customerId;
    }

    const paymentIntent = await stripe.paymentIntents.create(paymentIntentData);

    return {
      success: true,
      clientSecret: paymentIntent.client_secret,
      paymentIntent: paymentIntent,
    };
  } catch (error) {
    logger.error(`Error creating payment intent: ${error}`);
    return {
      success: false,
      error: error.message || "Failed to create payment intent",
    };
  }
};

/**
 * Create or retrieve a Stripe customer
 * @param {Object} customerData - Customer information
 * @param {string} customerData.email - Customer email
 * @param {string} customerData.name - Customer name
 * @param {string} customerData.phone - Customer phone (optional)
 * @returns {Promise<Object>} Customer object
 */
export const createOrRetrieveCustomer = async (customerData) => {
  try {
    const { email, name, phone } = customerData;

    if (!email) {
      throw new Error("Email is required");
    }

    // Check if customer already exists
    const existingCustomers = await stripe.customers.list({
      email: email,
      limit: 1,
    });

    if (existingCustomers.data.length > 0) {
      return {
        success: true,
        customer: existingCustomers.data[0],
        isNew: false,
      };
    }

    // Create new customer
    const customer = await stripe.customers.create({
      email,
      name,
      phone,
    });

    return {
      success: true,
      customer: customer,
      isNew: true,
    };
  } catch (error) {
    logger.error(`Error creating/retrieving customer: ${error}`);
    return {
      success: false,
      error: error.message || "Failed to create/retrieve customer",
    };
  }
};

/**
 * Refund a payment
 * @param {string} paymentIntentId - Payment intent ID to refund
 * @param {number} amount - Amount to refund (optional, full amount if not provided)
 * @returns {Promise<Object>} Refund object
 */
export const refundPayment = async (paymentIntentId, amount = null) => {
  try {
    if (!paymentIntentId) {
      throw new Error("Payment intent ID is required");
    }

    const refundData = {
      payment_intent: paymentIntentId,
    };

    if (amount) {
      refundData.amount = Math.round(amount * 100); // Convert to centavos
    }

    const refund = await stripe.refunds.create(refundData);

    return {
      success: true,
      refund: refund,
    };
  } catch (error) {
    logger.error(`Error creating refund: ${error}`);
    return {
      success: false,
      error: error.message || "Failed to create refund",
    };
  }
};

/**
 * Create a Stripe Connect account for withdrawals
 * @param {Object} accountData - Account information
 * @param {string} accountData.email - User email
 * @param {string} accountData.country - Country code
 * @returns {Promise<Object>} Connect account object
 */
export const createConnectAccount = async (accountData) => {
  try {
    const { email, country = "BR" } = accountData;

    if (!email) {
      throw new Error("Email is required");
    }

    const account = await stripe.accounts.create({
      type: "express",
      country: country,
      email: email,
      capabilities: {
        transfers: { requested: true },
        card_payments: { requested: true },
      },
      business_type: "individual",
    });

    return {
      success: true,
      account: account,
    };
  } catch (error) {
    logger.error(`Error creating connect account: ${error}`);
    return {
      success: false,
      error: error.message || "Failed to create connect account",
    };
  }
};

/**
 * Create a transfer to connected account
 * @param {Object} transferData - Transfer information
 * @param {string} transferData.destination - Connected account ID
 * @param {number} transferData.amount - Amount in centavos
 * @param {string} transferData.currency - Currency code
 * @returns {Promise<Object>} Transfer object
 */
export const createTransfer = async (transferData) => {
  try {
    const { destination, amount, currency = "brl" } = transferData;

    if (!destination || !amount) {
      throw new Error("Destination and amount are required");
    }

    const transfer = await stripe.transfers.create({
      amount: Math.round(amount * 100), // Convert to centavos
      currency: currency.toLowerCase(),
      destination: destination,
    });

    return {
      success: true,
      transfer: transfer,
    };
  } catch (error) {
    logger.error(`Error creating transfer: ${error}`);
    return {
      success: false,
      error: error.message || "Failed to create transfer",
    };
  }
};

/**
 * Get account details
 * @param {string} accountId - Stripe account ID
 * @returns {Promise<Object>} Account details
 */
export const getAccountDetails = async (accountId) => {
  try {
    if (!accountId) {
      throw new Error("Account ID is required");
    }

    const account = await stripe.accounts.retrieve(accountId);

    return {
      success: true,
      account: account,
    };
  } catch (error) {
    logger.error(`Error retrieving account: ${error}`);
    return {
      success: false,
      error: error.message || "Failed to retrieve account",
    };
  }
};

/**
 * Create account link for onboarding
 * @param {string} accountId - Stripe account ID
 * @param {string} returnUrl - Return URL after onboarding
 * @param {string} refreshUrl - Refresh URL if onboarding expires
 * @returns {Promise<Object>} Account link object
 */
export const createAccountLink = async (accountId, returnUrl, refreshUrl) => {
  try {
    if (!accountId) {
      throw new Error("Account ID is required");
    }

    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return {
      success: true,
      accountLink: accountLink,
    };
  } catch (error) {
    logger.error(`Error creating account link: ${error}`);
    return {
      success: false,
      error: error.message || "Failed to create account link",
    };
  }
};

export default {
  createCheckoutSession,
  getCheckoutSession,
  createPaymentIntent,
  createOrRetrieveCustomer,
  refundPayment,
  createConnectAccount,
  createTransfer,
  getAccountDetails,
  createAccountLink,
};
