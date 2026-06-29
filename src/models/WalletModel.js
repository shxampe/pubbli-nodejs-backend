import mongoose from "mongoose";

const WalletSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    // required: true,
    // unique: true,
  },

  userType: {
    type: String,
    enum: ["influencer", "advertiser", "superadmin"],
    required: true,
  },
  connectedCard: {
    last4: String,
    brand: String,
    cardToken: String, // provider-specific
  },

  // Add Stripe Connect fields
  stripeAccountId: {
    type: String,
    default: null,
  },
  stripeAccountStatus: {
    type: String,
    enum: ["pending", "active", "restricted", "disabled"],
    default: "pending",
  },

  balance: { type: Number, default: 0 }, // synced with escrow provider
  currency: { type: String, default: "BRL" },

  // Coin-based wallet fields
  available_coins: {
    type: Number,
    default: 0,
    min: 0,
  },
  locked_coins: {
    type: Number,
    default: 0,
    min: 0,
  },

  totalSpent: {
    type: Number,
    default: 0,
    min: 0,
  },

  totalDepositBRL: {
    type: Number,
    default: 0,
    min: 0,
  },

  isActive: {
    type: Boolean,
    default: true,
  },
  updatedAt: { type: Date, default: Date.now },
});

// Virtual for total coins
WalletSchema.virtual("total_coins").get(function () {
  return this.available_coins + this.locked_coins;
});

// Virtual for total balance in BRL
WalletSchema.virtual("total_balance_brl").get(function () {
  return this.balanceBRL;
});

const Wallet = mongoose.models.Wallet || mongoose.model("Wallet", WalletSchema);
export default Wallet;
