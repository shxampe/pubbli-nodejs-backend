import mongoose, { Schema } from "mongoose";

const paymentSchema = new Schema(
  {
    advertiserId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    influencerId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    campaignId: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "CampaignApplication",
    },
    transactionId: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    currency: {
      type: String,
      default: "USD",
    },
    status: {
      type: String,
      enum: ["success", "failed", "pending"],
      default: "success",
    },
  },
  { timestamps: true }
);

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
