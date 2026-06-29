import mongoose, { Schema } from "mongoose";

const campaignApplicationSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    campaign: {
      type: Schema.Types.ObjectId,
      ref: "Campaign",
      required: true,
    },
    address: {
      type: {
        type: String,
        enum: ["Home", "Office"],
        default: "Home",
      },
      country: { type: String },
      state: { type: String },
      city: { type: String },
      zip: { type: String },
      addressLine1: { type: String },
      addressLine2: { type: String },
    },
    videoUrls: [
      {
        url: { type: String },
        status: {
          type: String,
          enum: ["pending", "approved", "rejected", "resubmission"],
          default: "pending",
        },
      },
    ],
    exampleMediaUrls: {
      type: [String],
      default: [],
    },
    comments: {
      type: String,
    },
    adminNotes: {
      type: String,
    },

    applicationStatus: {
      type: String,
      enum: ["applied", "approved", "rejected", "completed"],
      default: "applied",
    },
    contentDeadline: {
      type: Date,
    },

    contentApprovalStatus: {
      type: String,
      enum: [
        "notsubmitted",
        "submitted",
        "approved",
        "rejected",
        "resubmission",
      ],
      default: "notsubmitted",
    },

    publishStatus: {
      type: String,
      enum: ["notPublish", "published"],
      default: "notPublish",
    },
    jobTimelineStatus: {
      type: String,
      enum: [
        "applied",
        "job_started",
        "content_uploaded",
        "content_accepted",
        "resubmission",
        "pending_post_approval",
        "post_link_approved",
        "post_link_rejected",
        "job_completed",
        "job_cancelled",
      ],
      default: "applied",
    },
    reviewNotes: {
      type: String,
    },
    finalVideoUrl: {
      type: String,
    },
    postLink: {
      type: String,
    },
    isFinal: {
      type: Boolean,
      default: false,
    },
    postedAt: {
      type: Date,
    },
    // contentType: {
    //   type: String,
    //   enum: ["Review", "Unboxing", "Demo", "Other"],
    //   default: "Other",
    // },
    // platform: {
    //   type: String,
    //   enum: ["Instagram", "TikTok", null],
    //   default: null,
    // },

    contentShared: {
      type: Boolean,
      default: false,
    },
    metrics: {
      views: { type: Number, default: 0 },
      likes: { type: Number, default: 0 },
      comments: { type: Number, default: 0 },
      shares: { type: Number, default: 0 },
      reach: { type: Number, default: 0 },
    },
    paymentStatus: {
      type: String,
      enum: ["Not Released", "Released"],
      default: "Not Released",
    },
    appliedAt: {
      type: Date,
      default: Date.now,
    },
    postInsights: {
      post_id: { type: String },
      shortcode: { type: String },
      permalink: { type: String },
      metrics: {
        likes: { type: Number },
        comments: { type: Number },
        ig_reels_avg_watch_time: { type: Number },
        ig_reels_video_view_total_time: { type: Number },
        reach: { type: Number },
        saved: { type: Number },
        shares: { type: Number },
        views: { type: Number },
        play : { type: Number },
        duration : { type: Number }
      },
    },
  },

  { timestamps: true }
);

const CampaignApplication = mongoose.model(
  "CampaignApplication",
  campaignApplicationSchema
);

export default CampaignApplication;
