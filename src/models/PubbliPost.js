import mongoose from "mongoose";

const publiPostSchema = new mongoose.Schema(
  {
    publiPostId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      unique: true,
    },
    contentType: {
      type: String,
      enum: ["video", "image"],
      required: true,
    },
    content: {
      type: String, // Store URL or base64 data of the content
      required: true,
    },
    videoDuration: {
      type: Date, // If duration is in milliseconds, change to Number
    },
    contentFormat: {
      type: String,
      required: true,
    },
    campaignId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "Campaign",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    approvalStatus: {
      type: String,
      enum: ["pending", "Approved", "Rejected"],
      required: true,
      default: "pending",
    },
    facebookAccessToken: {
      type: String,
    },
  },
  { timestamps: true }
);

const PubbliPost = mongoose.model("PubbliPost", publiPostSchema);

export default PubbliPost;
