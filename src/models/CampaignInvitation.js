import mongoose from "mongoose";

const campaignInvitationSchema = new mongoose.Schema({
    campaignId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Campaign",
        required: true,
    },
    influencerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    advertiserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    status: {
        type: String,
        enum: ["pending", "accepted", "declined"],
        default: "pending",
    },
    invitedAt: {
        type: Date,
        default: Date.now,
    },
    respondedAt: {
        type: Date,
    },
    message: {
        type: String,
        required: false,
    },
    // expiresAt: {
    //     type: Date,
    //     default: () => new Date(+new Date() + 7*24*60*60*1000), // 7 days from now
    // },
});

campaignInvitationSchema.index({ campaignId: 1, influencerId: 1 }, { unique: true });
campaignInvitationSchema.index({ influencerId: 1, status: 1 });
campaignInvitationSchema.index({ advertiserId: 1 });

const CampaignInvitation = mongoose.model("CampaignInvitation", campaignInvitationSchema);

export default CampaignInvitation;