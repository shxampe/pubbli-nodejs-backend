import mongoose, { Schema } from "mongoose";

const campaignSchema = new Schema({
  // Campaign Details
  campaignStrategy: {
    type: String,
    // enum: ["Public Post Campaign", "Affiliate Campaign","UGC Campaign"],
    required: false,
  },
  campaignType: {
    type: String,
    required: false,
  },
  campaignName: {
    type: String,
    required: true,
  },
  coverImage: {
    type: String,
    required: false,
  },
  description: {
    type: String,
    required: false,
  },

  // Product (if applicable)
  product: {
    type: Schema.Types.ObjectId,
    ref: "Product",
    required: function () {
      return this.campaignType === "With-Product-Shipment";
    },
  },
  hashtagsForPosting: {
    type: [String],
  },

  socialHandles: String,
  campaignTypeCategory: {
    type: String,
    // enum: ["ecommerce", "software", "localBusiness", "other"],
    required: true,
  },
  // Content Requirements
  contentRequirements: {
    platform: [
      {
        type: String,
        // enum: ["Instagram", "TikTok", "Reels", "Other"],
        required: true,
      },
    ],
    contentFormat: {
      type: String,
      required: false,
    },
    contentType: {
      type: String,
      // enum: ['Unboxing video', 'Product review', 'Product demo', 'Unboxing'],
      required: false,
    },
    contentCategory: {
      type: String,
      // enum: ['Unboxing video', 'Product review', 'Product demo', 'Unboxing'],
      required: false,
    },
    videoDuration: {
      type: String,
      // enum: ["30 seconds", "60 seconds", "1-2 minutes"],
      // required: true,
    },
    contentBrief: {
      type: String,
      required: false,
    },
    contentAvoid: {
      type: String,
      required: false,
    },
    examples: {
      urls: [String],
      mediaFiles: [String],
    },
  },
  // Creator Parameters
  creatorParameters: {
    preferableRegion: {
      country: {
        type: String,
      },
      state: {
        type: String,
      },
      city: {
        type: String,
      },
    },
    gender: {
      type: [String],
      default: ["All"],
    },
    age: {
      type: [String],
      enum: ["13-17", "18-24", "25-34", "35-44", "45+"],
    },
    specialRequirements: {
      type: [String],
    },
    customRequirements: {
      type: String,
      required: false,
    },
  },
  // Budget & Timeline
  compensation: {
    model: {
      type: String,
      default: "Fixed fee for influencers per post or story",
    },
    amount: {
      type: Number,
      required: true,
    },
    platformFee: {
      type: Number,
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
    },
    reimbursementAmount: {
      type: Number,
      required: false,
    },
    productPrice: {
      type: Number,
    },
    campaignFee: {
      type: Number,
    },
  },
  applicationDeadline: {
    start: {
      type: Date,
      // required: true,
      default : Date.now(),
    },
    end: {
      type: Date,
      required: true,
    },
  },
  deliveryMethod: {
    type: String,
    // enum: ["Reimbursement", "Delivered by me", "No shipping needed"],
    required: true,
  },
  // Status & Metadata
  campaignStatus: {
    type: String,
    enum: ["pending", "active", "paused", "completed", "rejected"],
    default: "pending",
  },
  campaignStatusDescription: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  approvalStatus: {
    type: String,
    // enum: ["Pending", "Approved", "Rejected"],
    default: "Pending",
  },
});

const Campaign = mongoose.model("Campaign", campaignSchema);

export default Campaign;
