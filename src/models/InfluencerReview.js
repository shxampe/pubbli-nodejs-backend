import mongoose, { Schema } from "mongoose";

const influencerReviewSchema = new Schema(
  {
    influencerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    campaignId: { type: Schema.Types.ObjectId, ref: "Campaign", required: true },
    advertiserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    applicationId: { type: Schema.Types.ObjectId, ref: "CampaignApplication", required: true },
    advertiserName: { type: String },
    advertiserPhotoUrl: { type: String, required: true },

    rating: { type: Number, min: 1, max: 5, required: true },
    comment: { type: String, default: "" },

    createdAt: { type: Date, default: Date.now }
  }
);

export default mongoose.model("InfluencerReview", influencerReviewSchema);
