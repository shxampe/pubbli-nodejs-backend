import User from "../models/User.js";
import validateUser from "../validations/userValidation.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import config from "../config/appconfig.js";
import Wallet from "../models/WalletModel.js";
import Stripe from "stripe";
import OTP from "../models/Otp.js";
import { google } from "googleapis";
import mongoose from "mongoose";
import { logger } from "./logger.js";
import { sendRegisterOtp } from "./loopsService.js";

const ROLES = config.auth.active_roles;

const stripe = new Stripe(config.stripe.stripeSecretKey);

export async function register(details, role, req, res) {
  const session = await mongoose.startSession();

  session.startTransaction();
  // session.startTransaction();

  try {
    const { error } = validateUser(req.body);
    if (error)
      return res.status(400).json({
        message: error.details[0].message,
        success: false,
      });

    let emailNotRegistered = await validateEmail(details.email);
    if (!emailNotRegistered) {
      return res.status(400).json({
        message: "Email is already taken.",
        success: false,
      });
    }

    const hashedPassword = await bcrypt.hash(details.password, 12);

    // 1. Create user with walletId and stripeConnectId
    const newUser = await User.create(
      [
        {
          ...details,
          password: hashedPassword,
          role: role,
          isEmailVerified: false,
          isProfileCompleted: role === "influencer" ? false : true,
          isCategoriesSet: role === "influencer" ? false : true,
        },
      ],
      { session }
    );

    if (!newUser || newUser.length === 0) {
      throw new Error("User creation failed");
    }

    const createdUser = newUser[0];

    if (role === "advertiser") {
      const existingOtp = await OTP.findOne({ email: details.email });
      if (existingOtp) {
        await existingOtp.deleteOne();
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date();
      otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

      // Save OTP
      const newOtp = new OTP({
        email: details.email,
        otp: otp,
        expiresAt: otpExpiry,
      });
      await newOtp.save();

      // Send OTP email
      try {
        await sendRegisterOtp(details.email, otp);
        logger.info(`Verification OTP resent to: ${details.email}`);
      } catch (emailError) {
        logger.error(`Error sending OTP email: ${emailError}`);
      }
    }
    // 2. Create Stripe Connect account (optional, if you use Stripe)
    let stripeConnectId;
    try {
      const account = await stripe.accounts.create({
        type: "express",
        email: details.email,
        capabilities: {
          transfers: { requested: true }, // enables ability to receive funds (withdrawals)
          card_payments: { requested: true }, // optional: if user will accept payments directly
        },
        business_type: "individual", // or 'company' if applicable
        country: "US", // set user’s country
        // Enable embedded components
        settings: {
          payouts: {
            schedule: {
              interval: "daily",
            },
          },
        },
      });

      stripeConnectId = account.id;
    } catch (stripeError) {
      logger.error(`Error creating Stripe Connect account: ${stripeError}`);
    }

    // 2. Create wallet first

    let walletId;
    try {
      let userType = role === "advertiser" ? "advertiser" : "influencer";

      const newWallet = await Wallet.create({
        userId: createdUser._id, // Will be updated after user creation
        userType: userType,
        connectedCard: {
          last4: null,
          brand: null,
          cardToken: null,
        },
        balance: 0,
        currency: "BRL",
        available_coins: 0,
        locked_coins: 0,
        totalDepositBRL: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      walletId = newWallet._id;
      logger.info(`Custom wallet created successfully: ${walletId}`);
    } catch (walletError) {
      logger.error(`Error creating custom wallet: ${walletError}`);
      return res.status(500).json({
        message: "Failed to create wallet. Please try again.",
        success: false,
      });
    }

    // Create stripe customer first
    let stripeCustomerId = null;
    try {
      const customer = await stripe.customers.create({
        email: details.email,
        name: details.name,
        metadata: {
          platform: "pubbli",
        },
      });
      stripeCustomerId = customer.id;
      logger.info(`Stripe customer created: ${stripeCustomerId}`);
    } catch (error) {
      logger.error(`Error creating Stripe customer: ${error}`);
    }

    const updatedUser = await User.findByIdAndUpdate(
      createdUser._id,
      {
        $set: {
          stripe_customer_id: stripeCustomerId,
          stripeConnectId: stripeConnectId,
          updatedAt: new Date(),
        },
      },
      { new: true, session }
    );

    logger.info(`updated User: ${updatedUser}`);
    await session.commitTransaction();
    if (updatedUser) {
      if (ROLES.includes(role)) {
        const token = jwt.sign(
          {
            userId: updatedUser._id,
            email: updatedUser.email,
            role: updatedUser.role,
          },
          config.auth.jwt_secret,
          { expiresIn: config.auth.jwt_expiresin }
        );

        const message = `${role.charAt(0).toUpperCase() + role.slice(1)} registered successfully. Please complete your profile and set preferred categories.`;
        return res.status(200).json({
          message,
          success: true,
          requiresProfileCompletion: true,
          token: token,
          userId: updatedUser._id,
        });
      }
    }
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Transaction aborted due to error: ${error}`);
    throw error; // Re-throw for handling in the calling function
  } finally {
    session.endSession();
  }
}


export async function userLogin(details, res) {
  try {

    const { email, password } = details;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        message: "Email not found",
        success: false,
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Incorrect password",
        success: false,
      });
    }

    const token = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
      },
      config.auth.jwt_secret,
      { expiresIn: config.auth.jwt_expiresin }
    );

    // const userDetails = {
    //   role: user.role,
    //   isProfileCompleted: user.isProfileCompleted,
    //   isCategoriesSet: user.isCategoriesSet,
    //   name: user.name,
    //   photoUrl: user.photoUrl,
    //   phone: user.phone,
    //   addresses: user.addresses,
    // }

    if (user.role === "influencer") {
      if (
        !user.isProfileCompleted ||
        !user.isCategoriesSet
        || (!user.tiktok.connected && !user.instagram.connected && !user.youtube.connected)
      ) {
        return res.status(403).json({
          message: "Profile not completed, complete it",
          userId: user._id,
          requiresProfileCompletion: !user.isProfileCompleted,
          requiresCategoriesSet: !user.isCategoriesSet,
          requiresTikTokConnection: !user.tiktok.connected,
          requiresInstagramConnection: !user.instagram.connected,
          requiresYouTubeConnection: !user.youtube.connected,
          success: false,
          role: user.role,
          // user: userDetails,
          token: token,
        });
      }
    }

    if (!user.isEmailVerified) {
      const existingOtp = await OTP.findOne({ email: email });
      if (existingOtp) {
        await existingOtp.deleteOne();
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      const otpExpiry = new Date();
      otpExpiry.setMinutes(otpExpiry.getMinutes() + 10);

      // Save OTP
      const newOtp = new OTP({
        email: email,
        otp: otp,
        expiresAt: otpExpiry,
      });
      await newOtp.save();

      // Send OTP email
      try {
        await sendRegisterOtp(email, otp);
      } catch (emailError) {
        logger.error(`Error sending OTP email: ${emailError}`);
      }

      return res.status(403).json({
        message: "Email not verified.",
        success: false,
        requiresVerification: true,
        email: email,
      });
    }

    let result = {
      userId: user._id,
      token: `Bearer ${token}`,
      role: user.role,
      name: user.name,
      email: user.email,
      photoUrl: user.photoUrl,
      phone: user.phone,
      timeZone: user.timeZone,
      isPrivate: user.isPrivate,
      status: user.status,
      reviewsShown: user.reviewsShown,
      addresses: user.addresses,
      referenceContent: user.referenceContent,
      instagram: user.instagram,
      tiktok: user.tiktok,
      isOnboardingComplete: user.isOnboardingComplete,
      stripeConnectId: user.stripeConnectId,
      certificates : user.certificates
    };

    return res.status(200).json({
      ...result,
      message: "Logged in successfully",
      success: true,
    });
  } catch (err) {
    logger.error(`Login error: ${err}`);
    return res.status(500).json({
      message: "An error occurred",
      success: false,
    });
  }
}

// Google OAuth utilities
export async function refreshGoogleTokens(user) {
  try {
    if (!user.google?.googleTokens?.refresh_token) {
      throw new Error("No refresh token available");
    }

    const oauth2Client = new google.auth.OAuth2(
      config.google.client_id,
      config.google.client_secret,
      config.google.redirect_uri
    );

    oauth2Client.setCredentials({
      refresh_token: user.google.googleTokens.refresh_token,
    });

    const { credentials } = await oauth2Client.refreshAccessToken();

    // Update user's tokens
    user.google.googleTokens = {
      access_token: credentials.access_token,
      refresh_token:
        credentials.refresh_token || user.google.googleTokens.refresh_token,
      expiry_date: credentials.expiry_date,
    };

    await user.save();
    return credentials;
  } catch (error) {
    logger.error(`Error refreshing Google tokens: ${error}`);
    throw error;
  }
}

export async function getYouTubeChannelData(user) {
  try {
    if (user.google?.googleTokens?.expiry_date < Date.now()) {
      await refreshGoogleTokens(user);
    }

    const oauth2Client = new google.auth.OAuth2(
      config.google.client_id,
      config.google.client_secret,
      config.google.redirect_uri
    );

    oauth2Client.setCredentials({
      access_token: user.google.googleTokens.access_token,
    });

    const youtube = google.youtube({
      version: "v3",
      auth: oauth2Client,
    });

    // const youtubeAnalytics = google.youtubeAnalytics({
    //   version: 'v2',
    //   auth: oauth2Client
    // });

    // Get basic channel data
    const { data: channels } = await youtube.channels.list({
      part: "snippet,statistics,brandingSettings,contentDetails",
      mine: true,
    });

    if (!channels.items || channels.items.length === 0) {
      return null;
    }

    const channel = channels.items[0];
    const stats = channel.statistics;
    const channelId = channel.id;

    // Get recent videos for detailed analytics
    const { data: videos } = await youtube.search.list({
      part: "snippet",
      channelId: channelId,
      order: "date",
      type: "video",
      maxResults: 10,
      // maxResults: 50
    });

    // Get video IDs for analytics
    const videoIds = videos.items?.map((video) => video.id.videoId) || [];

    // Get detailed video statistics
    let videoStats = [];
    if (videoIds.length > 0) {
      const { data: videoDetails } = await youtube.videos.list({
        part: "statistics,snippet,contentDetails",
        id: videoIds.join(","),
      });
      videoStats = videoDetails.items || [];
    }

    // Get channel analytics (last 30 days)
    // const endDate = new Date();
    // const startDate = new Date();
    // startDate.setDate(startDate.getDate() - 30);

    // let analyticsData = null;
    // try {
    //   const { data: analytics } = await youtubeAnalytics.reports.query({
    //     ids: `channel==${channelId}`,
    //     startDate: startDate.toISOString().split('T')[0],
    //     endDate: endDate.toISOString().split('T')[0],
    //     metrics: 'views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,subscribersLost',
    //     dimensions: 'day',
    //     sort: 'day'
    //   });
    //   analyticsData = analytics;
    // } catch (analyticsError) {
    //   logger.error(`Analytics data not available: ${analyticsError.message}`);
    // }

    // Get audience demographics (if available)
    // let demographicsData = null;
    // try {
    //   const { data: demographics } = await youtubeAnalytics.reports.query({
    //     ids: `channel==${channelId}`,
    //     startDate: startDate.toISOString().split('T')[0],
    //     endDate: endDate.toISOString().split('T')[0],
    //     metrics: 'viewerPercentage',
    //     dimensions: 'ageGroup,gender',
    //     sort: 'ageGroup,gender'
    //   });
    //   demographicsData = demographics;
    // } catch (demographicsError) {
    //   logger.error(`Demographics data not available: ${demographicsError.message}`);
    // }

    // Get geographic data
    // let geographicData = null;
    // try {
    //   const { data: geographic } = await youtubeAnalytics.reports.query({
    //     ids: `channel==${channelId}`,
    //     startDate: startDate.toISOString().split('T')[0],
    //     endDate: endDate.toISOString().split('T')[0],
    //     metrics: 'views,estimatedMinutesWatched',
    //     dimensions: 'country',
    //     sort: '-views'
    //   });
    //   geographicData = geographic;
    // } catch (geographicError) {
    //   logger.error(`Geographic data not available: ${geographicError.message}`);
    // }

    // Calculate additional metrics

    const totalViews = parseInt(stats.viewCount) || 0;
    const totalSubscribers = parseInt(stats.subscriberCount) || 0;
    const totalVideos = parseInt(stats.videoCount) || 0;
    const totalComments = parseInt(stats.commentCount) || 0;
    const totalLikes = videoStats.reduce(
      (sum, video) => sum + (parseInt(video.statistics?.likeCount) || 0),
      0
    );
    const totalDislikes = videoStats.reduce(
      (sum, video) => sum + (parseInt(video.statistics?.dislikeCount) || 0),
      0
    );

    // Calculate engagement rate
    // const engagementRate = totalViews > 0 ? ((totalLikes + totalComments) / totalViews * 100).toFixed(2) : 0;

    // Calculate average views per video
    // const avgViewsPerVideo = totalVideos > 0 ? (totalViews / totalVideos).toFixed(0) : 0;

    // Update user's YouTube data
    user.youtube.youtube_channel_url = channel.snippet.customUrl;
    user.youtube.youtube_channel_title = channel.snippet.title;
    user.youtube.youtube_subscribers = totalSubscribers;
    user.youtube.youtube_videos = totalVideos;
    user.youtube.youtube_views = totalViews;
    user.youtube.stats_last_updated = new Date();

    await user.save();

    return {
      // Basic channel info
      channelId: channelId,
      title: channel.snippet.title,
      description: channel.snippet.description,
      publishedAt: channel.snippet.publishedAt,
      thumbnails: channel.snippet.thumbnails,

      // Lifetime statistics
      statistics: {
        subscribers: totalSubscribers,
        videos: totalVideos,
        views: totalViews,
        comments: totalComments,
        likes: totalLikes,
        dislikes: totalDislikes,
      },

      // Calculated metrics
      // metrics: {
      //   engagementRate: parseFloat(engagementRate),
      //   avgViewsPerVideo: parseInt(avgViewsPerVideo),
      //   subscriberToVideoRatio: totalVideos > 0 ? (totalSubscribers / totalVideos).toFixed(2) : 0
      // },

      // Recent videos with stats
      // recentVideos: videoStats.map(video => ({
      //   videoId: video.id,
      //   title: video.snippet.title,
      //   publishedAt: video.snippet.publishedAt,
      //   duration: video.contentDetails?.duration,
      //   statistics: {
      //     views: parseInt(video.statistics?.viewCount) || 0,
      //     likes: parseInt(video.statistics?.likeCount) || 0,
      //     comments: parseInt(video.statistics?.commentCount) || 0,
      //     dislikes: parseInt(video.statistics?.dislikeCount) || 0
      //   }
      // })),

      // Analytics data (last 30 days)
      // analytics: analyticsData ? {
      //   timeSeries: analyticsData.rows?.map(row => ({
      //     date: row[0],
      //     views: parseInt(row[1]) || 0,
      //     estimatedMinutesWatched: parseInt(row[2]) || 0,
      //     averageViewDuration: parseInt(row[3]) || 0,
      //     averageViewPercentage: parseFloat(row[4]) || 0,
      //     subscribersGained: parseInt(row[5]) || 0,
      //     subscribersLost: parseInt(row[6]) || 0
      //   })) || [],
      //   totals: {
      //     views: analyticsData.rows?.reduce((sum, row) => sum + (parseInt(row[1]) || 0), 0) || 0,
      //     minutesWatched: analyticsData.rows?.reduce((sum, row) => sum + (parseInt(row[2]) || 0), 0) || 0,
      //     subscribersGained: analyticsData.rows?.reduce((sum, row) => sum + (parseInt(row[5]) || 0), 0) || 0,
      //     subscribersLost: analyticsData.rows?.reduce((sum, row) => sum + (parseInt(row[6]) || 0), 0) || 0
      //   }
      // } : null,

      // Demographics data
      // demographics: demographicsData ? {
      //   ageGroups: demographicsData.rows?.map(row => ({
      //     ageGroup: row[0],
      //     gender: row[1],
      //     viewerPercentage: parseFloat(row[2]) || 0
      //   })) || []
      // } : null,

      // Geographic data
      // geographic: geographicData ? {
      //   countries: geographicData.rows?.map(row => ({
      //     country: row[0],
      //     views: parseInt(row[1]) || 0,
      //     minutesWatched: parseInt(row[2]) || 0
      //   })) || []
      // } : null,

      // Channel branding
      // branding: {
      //   description: channel.snippet.description,
      //   keywords: channel.brandingSettings?.channel?.keywords,
      //   defaultLanguage: channel.brandingSettings?.channel?.defaultLanguage,
      //   unsubscribedTrailer: channel.brandingSettings?.channel?.unsubscribedTrailer
      // }
    };
  } catch (error) {
    logger.error(`Error getting YouTube channel data: ${error}`);
    throw error;
  }
}

const validateEmail = async (email) => {
  let user = await User.findOne({ email });
  if (user) {
    return false;
  } else {
    return true;
  }
};
