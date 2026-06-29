// models/Transaction.js
import mongoose from "mongoose";

const TransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    transactionCreatedFor: {
      type: String,
      enum: ["advertiser", "influencer", "superadmin"],
      required: true,
    },
    type: {
      type: String,
      enum: [
        "deposit_brl",
        "withdrawal_brl",
        "campaign_lock",
        "campaign_unlock",
        "campaign_payment",
        "campaign_refund",
        "admin_fee",
      ],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      enum: ["BRL", "coins"],
      default: "coins",
    },
    status: {
      type: String,
      enum: ["pending", "locked", "refund" , "completed", "failed", "cancelled"],
      default: "pending",
    },

    paymentReference: {
      type: String, // For PIX keys, bank account numbers, etc.
    },

    // Campaign related fields
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Campaign",
    },

    applicationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CampaignApplication",
    },

    contentSubmissionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ContentSubmission",
    },

    // Transaction details
    description: {
      type: String,
      required: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
    },

    stripeSessionId: {
      type: String,
      default: null,
    },

    transactionId: {
      type: String,
      required: true,
    },

    confirmedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Index for better query performance
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ walletId: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, status: 1 });

const Transaction =
  mongoose.models.Transaction ||
  mongoose.model("Transaction", TransactionSchema);
export default Transaction;
