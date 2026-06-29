import mongoose from "mongoose";
import config from "../config/appconfig.js";
import { defaultAvatarPath } from "../config/constants.js";

const ROLES = config.auth.active_roles;

const { Schema } = mongoose;

const UserSchema = new Schema(
  {
    name: {
      type: String,
    },
    photoUrl: {
      type: String,
      default: `${defaultAvatarPath}`,
    },
    email: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      default: "user",
      enum: ROLES,
    },
    phone: {
      type: String,
      default: null,
    },
    password: {
      type: String,
      required: true,
    },
    timeZone: {
      type: String,
      default: "UTC",
    },
    bio: {
      type: String,
    },
    dob: {
      type: Date,
      default: null,
    },
    gender: {
      type: String,
    },

    stripe_customer_id: {
      type: String,
      default: null,
    },

    stripeConnectId: {
      type: String,
      default: null,
    },

    isOnboardingComplete: {
      type: Boolean,
    },

    // 📌 Instagram connection
    instagram: {
      ig_user_id: { type: String, default: null },
      ig_access_token: { type: String, default: null },
      ig_access_token_expires: { type: Date, default: null },
      connected: { type: Boolean, default: false },
      profile_picture: { type: String, default: null },
      profile_name: { type: String, default: null },
      profile_bio: { type: String, default: null },
      profile_followers: { type: Number, default: 0 },
      profile_following: { type: Number, default: 0 },
      profile_posts: { type: Number, default: 0 },
      link: { type: String, default: null },
    },

    // 📌 TikTok connection
    tiktok: {
      tiktok_user_id: { type: String, default: null },
      tiktok_access_token: { type: String, default: null },
      tiktok_refresh_token: { type: String, default: null },
      tiktok_access_token_expires: { type: Date, default: null },
      connected: { type: Boolean, default: false },

      // 📊 Public stats from TikTok profile
      profile_name: { type: String, default: null },
      profile_picture: { type: String, default: null },
      profile_bio: { type: String, default: null },
      profile_link: { type: String, default: null },
      profile_followers: { type: Number, default: 0 },
      profile_following: { type: Number, default: 0 },
      profile_verified: { type: Boolean, default: false },
      profile_posts: { type: Number, default: 0 },
      stats_last_updated: { type: Date, default: null },
      stats_likes: { type: Number, default: 0 },

      // 🔄 Content posting tracking
      tiktok_publish_id: { type: String, default: null },
      tiktok_status_last_checked: { type: Date, default: null },
      tiktok_last_status: {
        type: String,
        enum: ["READY", "PROCESSING", "FAILED", null],
        default: null,
      },
    },

    // 📌 YouTube connection
    youtube: {
      googleId: { type: String, default: null },
      googleTokens: {
        access_token: { type: String, default: null },
        refresh_token: { type: String, default: null },
        expiry_date: { type: Date, default: null },
      },
      connected: { type: Boolean, default: false },
      youtube_channel_url: { type: String, default: null },
      youtube_channel_title: { type: String, default: null },
      youtube_channel_thumbnail: { type: String, default: null },
      youtube_subscribers: { type: Number, default: 0 },
      youtube_videos: { type: Number, default: 0 },
      youtube_views: { type: Number, default: 0 },
      youtube_total_likes: { type: Number, default: 0 },
      youtube_total_comments: { type: Number, default: 0 },
      stats_last_updated: { type: Date, default: null },
    },

    isPrivate: {
      type: Boolean,
      default: true,
    },
    status: {
      type: String,
      default: "active",
      enum: ["active", "inactive", "blocked", "deleted"],
    },

    reviewsShown: {
      type: Boolean,
      default: false,
    },

    addresses: [
      {
        type: {
          type: String,
          default: "Home",
        },
        country: String,
        state: String,
        city: String,
        zip: String,
        addressLine1: String,
        addressLine2: String,
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    preferedCategories: {
      primary: [String],
      secondary: [String],
      third: [String],
    },

    isProfileCompleted: {
      type: Boolean,
      default: false,
    },

    isCategoriesSet: {
      type: Boolean,
      default: false,
    },

    certificates: {
      type: [],
    },

    isEmailVerified: {
      type: Boolean,
      default: false,
    },

    referenceContent: [
      {
        type: {
          type: String,
          enum: ["video", "image"],
          required: true,
        },
        url: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

const User = mongoose.models.User || mongoose.model("User", UserSchema);

export default User;