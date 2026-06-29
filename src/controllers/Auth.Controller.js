import { google } from "googleapis";

import config from "../config/appconfig.js";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

//validations
import forgetPasswordValidation from "../validations/forgetPasswordValidation.js";
import verifyOtpValidation from "../validations/verifyOtpValidation.js";

//models
import OTP from "../models/Otp.js";
import User from "../models/User.js";

//utils
import {
  register,
  userLogin,
  getYouTubeChannelData,
  refreshGoogleTokens,
} from "../utils/Auth.js";
import {
  sendForgotPasswordOtp,
  sendWelcomeEmail,
} from "../utils/loopsService.js";
import setNewPasswordValidation from "../validations/setNewPasswordValidation.js";
import changePasswordValidation from "../validations/changePasswordValidation.js";
import validateUser from "../validations/userValidation.js";
import { logger } from "../utils/logger.js";



const oauth2Client = new google.auth.OAuth2(
  config.google.client_id,
  config.google.client_secret,
  config.google.redirect_uri
);

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/userinfo.email",
];

export async function googleAuth(req, res) {
  try {
    const { token } = req.query;

    if (!token) {
      return res.redirect(
        `${config.frontend_url}/google/callback?error=no_token&message=Authentication token required`
      );
    }

    const decoded = jwt.verify(token, config.auth.jwt_secret);
    const user = await User.findById(decoded.userId);

    if (!user) {
      return res.redirect(
        `${config.frontend_url}/google/callback?error=user_not_found&message=User not found`
      );
    }
    const state = token;

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: SCOPES,
      prompt: "consent",
      state: state,
    });
    logger.info(`Google auth URL generated: ${authUrl}`);
    res.redirect(authUrl);
  } catch (error) {
    logger.error(`Google auth error: ${error.message}`);
    res.redirect(
      `${config.frontend_url}/google/callback?error=auth_init_failed&message=${error.message}`
    );
  }
}

export async function googleCallback(req, res) {
  const { code, error, state } = req.query;
  logger.info(
    `Google callback - code: ${code}, error: ${error}, state: ${state}`
  );

  if (error) {
    logger.error(`Google OAuth error: ${error}`);
    return res.redirect(
      `${config.frontend_url}/google/callback?error=oauth_denied&message=${error}`
    );
  }

  if (!code) {
    return res.redirect(
      `${config.frontend_url}/google/callback?error=no_code&message=No authorization code provided`
    );
  }

  if (!state) {
    return res.redirect(
      `${config.frontend_url}/google/callback?error=no_state&message=No state parameter provided`
    );
  }

  try {
    const decoded = jwt.verify(state, config.auth.jwt_secret);
    const userId = decoded.userId;
    logger.info(`Google callback - userId: ${userId}`);

    logger.info(`Getting tokens for code: ${code}`);
    const { tokens } = await oauth2Client.getToken(code);
    logger.info(`Tokens received: ${tokens ? "Yes" : "No"}`);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2",
    });

    const youtube = google.youtube({
      version: "v3",
      auth: oauth2Client,
    });

    // Add timeout and better error handling for YouTube API call
    // let channelData = null;
    let channelUrl = null;
    let totalViews = 0;
    let totalSubscribers = 0;
    let totalVideos = 0;
    let channelTitle = "Unknown Channel";
    let channelThumbnailUrl = null;
    let totalLikesAcrossVideos = 0;
    let totalCommentsAcrossVideos = 0;

    try {
      logger.info("Fetching YouTube channel data...");

      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("YouTube API timeout")), 10000)
      );

      const youtubePromise = youtube.channels.list({
        part: "snippet,statistics,contentDetails",
        mine: true,
      });

      const data = await Promise.race([youtubePromise, timeoutPromise]);

      if (!data.data.items || data.data.items.length === 0) {
        logger.warn("No YouTube channel found for this user");
        // Don't return null, continue with default values
      } else {
        const channel = data.data.items[0];
        console.log("Youtube Data for channel", channel);
        console.log("Youtube Data for snippet", channel.snippet);
        console.log("Youtube Data for statistics", channel.statistics);
        console.log("Youtube Data for contentDetails", channel.contentDetails);
        const stats = channel.statistics;
        channelUrl = channel.snippet.customUrl;
        channelTitle = channel.snippet.title;
        channelThumbnailUrl =
          channel.snippet?.thumbnails?.high?.url ||
          channel.snippet?.thumbnails?.medium?.url ||
          channel.snippet?.thumbnails?.default?.url ||
          null;
        totalViews = parseInt(stats.viewCount) || 0;
        totalSubscribers = parseInt(stats.subscriberCount) || 0;
        totalVideos = parseInt(stats.videoCount) || 0;

        // Prefer single-query aggregates via YouTube Analytics API
        try {
          const youtubeAnalytics = google.youtubeAnalytics({
            version: "v2",
            auth: oauth2Client,
          });
          const endDate = new Date().toISOString().slice(0, 10);
          const { data: analyticsData } = await youtubeAnalytics.reports.query({
            ids: "channel==MINE",
            startDate: "2006-01-01",
            endDate,
            metrics: "likes,comments",
          });

          if (analyticsData?.rows?.length) {
            const [likes, comments] = analyticsData.rows[0];
            totalLikesAcrossVideos = parseInt(likes) || 0;
            totalCommentsAcrossVideos = parseInt(comments) || 0;
          }
        } catch (analyticsErr) {
          logger.warn(`YouTube Analytics fallback: ${analyticsErr.message}`);
          // If analytics is unavailable, leave totals as 0 (or compute later if needed)
        }
      }
    } catch (youtubeError) {
      logger.error(`YouTube API error: ${youtubeError.message}`);
      // Continue execution with default values instead of failing
      logger.info("Continuing with default YouTube values due to API error");
    }

    logger.info(`YouTube data processed for user: ${userId}`);

    // Get user info - this is more reliable than YouTube API
    const { data: userInfo } = await oauth2.userinfo.get();
    logger.info(`Google user info received: ${userInfo.email}`);

    // Find existing user by ID from state
    const user = await User.findById(userId);

    if (!user) {
      return res.redirect(
        `${config.frontend_url}/google/callback?error=user_not_found&message=User not found`
      );
    }

    // Update existing user with Google details
    user.youtube = {
      googleId: userInfo.id,
      googleTokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
      },
      connected: true,
      youtube_channel_url: channelUrl,
      youtube_channel_title: channelTitle,
      youtube_channel_thumbnail: channelThumbnailUrl,
      youtube_subscribers: totalSubscribers,
      youtube_videos: totalVideos,
      youtube_views: totalViews,
      youtube_total_likes: totalLikesAcrossVideos,
      youtube_total_comments: totalCommentsAcrossVideos,
      stats_last_updated: new Date(),
    };

    await user.save();
    logger.info(`User updated successfully: ${user.email}`);

    // Generate JWT for frontend
    const jwtToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
      },
      config.auth.jwt_secret,
      { expiresIn: config.auth.jwt_expiresin }
    );

    // Redirect back to React app with token
    const redirectUrl = `${config.frontend_url}/google/callback?token=${jwtToken}&user=${encodeURIComponent(
      JSON.stringify({
        id: user._id,
        name: user.name,
        email: user.email,
        photoUrl: user.photoUrl,
        role: user.role,
      })
    )}`;

    logger.info(`Redirecting to: ${config.frontend_url}/google/callback`);
    res.redirect(redirectUrl);
  } catch (error) {
    logger.error(`OAuth callback error: ${error.message}`);
    logger.error(`Error stack: ${error.stack}`);
    res.redirect(
      `${config.frontend_url}/google/callback?error=auth_failed&message=${error.message}`
    );
  }
}

export async function registerUser(req, res) {
  const ALLROLES = config.auth.active_roles;

  const ROLES = new Set(ALLROLES?.map((role) => role.toLowerCase()));

  const role = req.query.role?.trim().toLowerCase();

  if (role === "superadmin") {
    return res.status(400).json({
      error: "Invalid role. Superadmin cannot be created",
      success: false,
    });
  }

  if (!role) {
    return res.status(400).json({
      error: "Role is required",
      success: false,
    });
  }

  if (!ROLES.has(role.toLowerCase())) {
    if (ROLES.has("superadmin")) {
      ROLES.delete("superadmin");
    }

    if (!ROLES.has(role.toLowerCase())) {
      return res.status(400).json({
        error: `Invalid role. Available roles are: ${Array.from(ROLES).join(
          ", "
        )}`,
        success: false,
      });
    }
  }

  await register(req.body, role, req, res);
}

export async function loginUser(req, res) {
  logger.info(`Login attempt for user: ${req.body.email}`);
  await userLogin(req.body, res);
}

export async function forgetPassword(req, res) {
  const { error } = forgetPasswordValidation(req.body);
  if (error)
    return res
      .status(400)
      .json({ error: error.details[0].message, success: false });

  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    return res.status(404).json({ error: "User not found", success: false });
  }

  const otpCode = crypto.randomInt(100000, 999999).toString();
  const otpExpiry = new Date();
  otpExpiry.setMinutes(otpExpiry.getMinutes() + 60); // OTP valid for 60 minutes

  try {
    await OTP.create({ email, otp: otpCode, expiresAt: otpExpiry });

    // Send OTP email using new format
    try {
      await sendForgotPasswordOtp(email, otpCode);
      logger.info(`Password reset OTP sent to: ${email}`);
      res.status(200).json({ message: "OTP sent to email", success: true });
    } catch (emailError) {
      logger.error(`Error sending password reset OTP: ${emailError.message}`);
      res
        .status(500)
        .json({ error: "Failed to send OTP email", success: false });
    }
  } catch (error) {
    logger.error(`Error generating OTP: ${error.message}`);
    res.status(500).json({ error: "Error generating OTP", success: false });
  }
}

export async function verifyOtp(req, res) {
  const { error } = verifyOtpValidation(req.body);
  if (error)
    return res
      .status(400)
      .json({ error: error.details[0].message, success: false });

  const { email, otp } = req.body;

  try {
    const otpRecord = await OTP.findOne({ email, otp });

    if (!otpRecord) {
      return res
        .status(400)
        .json({ error: "Invalid OTP or email", success: false });
    }

    if (otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ error: "OTP has expired", success: false });
    }

    // Mark email as verified
    const user = await User.findOneAndUpdate(
      { email },
      { isEmailVerified: true },
      { new: true } // Returns the updated document
    );
    await sendWelcomeEmail(email, {
      name: user.name,
      role: user.role,
    });

    await OTP.deleteOne({ email, otp });

    const token = jwt.sign({ email }, config.auth.jwt_secret, {
      expiresIn: "5m",
    });
    res
      .status(200)
      .json({ message: "OTP verified successfully", success: true, token });
  } catch (error) {
    logger.error(`Error verifying OTP: ${error.message}`);
    res.status(500).json({ error: "Error verifying OTP", success: false });
  }
}

export async function setPassword(req, res) {
  const { token } = req.query;
  const { newPassword } = req.body;

  if (!token) {
    return res.status(401).json({ error: "Token is required", success: false });
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwt_secret);
    const email = decoded.email;

    const { error } = setNewPasswordValidation(req.body);
    if (error) {
      return res
        .status(400)
        .json({ error: error.details[0].message, success: false });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ error: "User not found", success: false });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;
    await user.save();

    res.status(200).json({
      message: "Password updated successfully",
      success: true,
    });
  } catch (error) {
    logger.error(`Error in setPassword: ${error.message}`);
    res.status(401).json({ error: "Invalid or expired token", success: false });
  }
}

export async function changePassword(req, res) {
  const { error } = changePasswordValidation(req.body);
  if (error) {
    return res
      .status(400)
      .json({ error: error.details[0].message, success: false });
  }

  const { email } = req.user;
  const { currentPassword, newPassword } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ error: "User not found", success: false });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ error: "Invalid current password", success: false });
    }

    const newHashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = newHashedPassword;
    await user.save();

    return res.json({
      message: "Password changed successfully",
      success: true,
    });
  } catch (error) {
    logger.error(`Error during password change: ${error.message}`);
    return res
      .status(500)
      .json({ error: "Internal server error", success: false });
  }
}

export async function updateProfile(req, res) {
  const { error } = validateUser(req.body);

  if (error) {
    logger.error(
      `Profile update validation error: ${error.details[0].message}`
    );
    return res
      .status(400)
      .json({ error: error.details[0].message, success: false });
  }

  const { name, email, photoUrl, phone, preferredCurrency, timeZone } =
    req.body;

  const userId = req.user._id;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found", success: false });
    }

    if (name) user.name = name;
    if (email) user.email = email;
    if (photoUrl) user.photoUrl = photoUrl;
    if (phone) user.phone = phone;
    if (preferredCurrency) user.preferredCurrency = preferredCurrency;
    if (timeZone) user.timeZone = timeZone;

    await user.save();

    return res.json({ message: "Profile updated successfully", success: true });
  } catch (error) {
    logger.error(`Error during profile update: ${error.message}`);
    return res
      .status(500)
      .json({ error: "Internal server error", success: false });
  }
}

export async function getUserById(req, res) {
  const { id } = req.params;

  try {
    const user = await User.findById(id).select("-password");
    if (!user) {
      return res.status(404).json({ error: "User not found", success: false });
    }

    return res.status(200).json({ success: true, user });
  } catch (error) {
    logger.error(`Error fetching user profile: ${error.message}`);
    return res.status(500).json({ error: "Server error", success: false });
  }
}

export async function verifyEmailOtp(req, res) {
  const { error } = verifyOtpValidation(req.body);
  if (error)
    return res
      .status(400)
      .json({ error: error.details[0].message, success: false });

  const { email, otp } = req.body;

  try {
    const otpRecord = await OTP.findOne({ email, otp });

    if (!otpRecord) {
      return res
        .status(400)
        .json({ error: "Invalid OTP or email", success: false });
    }

    if (otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ error: "OTP has expired", success: false });
    }

    // Mark email as verified
    await User.findOneAndUpdate({ email }, { isEmailVerified: true });

    await OTP.deleteOne({ email, otp });

    res.status(200).json({
      message: "Email verified successfully. You can now login.",
      success: true,
    });
  } catch (error) {
    logger.error(`Error verifying email OTP: ${error.message}`);
    res.status(500).json({ error: "Error verifying OTP", success: false });
  }
}

export async function verifyPasswordResetOtp(req, res) {
  const { error } = verifyOtpValidation(req.body);
  if (error)
    return res
      .status(400)
      .json({ error: error.details[0].message, success: false });

  const { email, otp } = req.body;

  try {
    const otpRecord = await OTP.findOne({ email, otp });

    if (!otpRecord) {
      return res
        .status(400)
        .json({ error: "Invalid OTP or email", success: false });
    }

    if (otpRecord.expiresAt < new Date()) {
      return res.status(400).json({ error: "OTP has expired", success: false });
    }

    await OTP.deleteOne({ email, otp });

    // Generate a short-lived token for password reset
    const token = jwt.sign({ email }, config.auth.jwt_secret, {
      expiresIn: "5m",
    });

    res.status(200).json({
      message: "OTP verified successfully. You can now reset your password.",
      success: true,
      token,
    });
  } catch (error) {
    logger.error(`Error verifying password reset OTP: ${error.message}`);
    res.status(500).json({ error: "Error verifying OTP", success: false });
  }
}

export async function getYouTubeData(req, res) {
  try {
    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({ error: "User not found", success: false });
    }

    if (!user.google?.connected) {
      return res.status(400).json({
        error:
          "YouTube not connected. Please connect your Google account first.",
        success: false,
      });
    }
    const channelData = await getYouTubeChannelData(user);

    if (!channelData) {
      return res.status(404).json({
        error: "No YouTube channel found for this account",
        success: false,
      });
    }

    res.json({
      success: true,
      data: channelData,
    });
  } catch (error) {
    logger.error(`Error getting YouTube data: ${error.message}`);
    res.status(500).json({
      error: "Failed to get YouTube data",
      success: false,
    });
  }
}

export async function getYouTubeVideoData(req, res) {
  try {
    logger.info(`YouTube video data request for user: ${req.user._id}`);

    const { videoUrl } = req.body;

    if (!videoUrl) {
      return res.status(400).json({
        error: "Video URL is required",
        success: false,
      });
    }

    // Extract video ID from URL
    const videoIdMatch = videoUrl.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/
    );
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    if (!videoId) {
      return res.status(400).json({
        error: "Invalid YouTube URL",
        success: false,
      });
    }

    const userId = req.user._id;
    const user = await User.findById(userId);

    if (!user?.google?.connected) {
      return res.status(400).json({
        error: "YouTube not connected",
        success: false,
      });
    }

    // Refresh tokens if needed
    if (user.google.googleTokens.expiry_date < Date.now()) {
      try {
        await refreshGoogleTokens(user);
      } catch (refreshError) {
        logger.error(`Token refresh failed: ${refreshError.message}`);
        return res.status(401).json({
          error:
            "YouTube authentication expired. Please reconnect your account.",
          success: false,
        });
      }
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

    // Get video data
    const { data: videoData } = await youtube.videos.list({
      part: "snippet,statistics",
      id: videoId,
    });

    if (!videoData.items?.[0]) {
      return res.status(404).json({
        error: "Video not found",
        success: false,
      });
    }

    const video = videoData.items[0];
    const stats = video.statistics;

    const insights = {
      videoId: videoId,
      title: video.snippet.title,
      channelTitle: video.snippet.channelTitle,
      publishedAt: video.snippet.publishedAt,
      views: parseInt(stats.viewCount) || 0,
      likes: parseInt(stats.likeCount) || 0,
      comments: parseInt(stats.commentCount) || 0,
      engagementRate:
        stats.viewCount > 0
          ? (
              (((parseInt(stats.likeCount) || 0) +
                (parseInt(stats.commentCount) || 0)) /
                parseInt(stats.viewCount)) *
              100
            ).toFixed(2)
          : 0,
    };

    logger.info(`YouTube video insights generated for video: ${videoId}`);

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    logger.error(`Error getting YouTube video data: ${error.message}`);

    // Handle specific authentication errors
    if (error.code === 401) {
      return res.status(401).json({
        error: "YouTube authentication failed. Please reconnect your account.",
        success: false,
      });
    }

    res.status(500).json({
      error: "Failed to get video data",
      success: false,
    });
  }
}
