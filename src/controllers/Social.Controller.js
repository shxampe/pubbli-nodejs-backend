import axios from "axios";
import User from "../models/User.js";
import UserCertification from "../models/UserCertificationModel.js";
import { logger } from "../utils/logger.js";
import config from "../config/appconfig.js";

// 1. Start Instagram Connect
export const connectInstagram = async (req, res) => {
  const userId = req.query.userId;

  if (!userId) {
    return res.status(401).json({
      success: false,
      message: "User not authenticated",
    });
  }

  const redirectUri = process.env.INSTAGRAM_REDIRECT_URI;
  const clientId = process.env.INSTAGRAM_APP_ID;

  const authUrl = `https://www.instagram.com/oauth/authorize?force_reauth=true&client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=instagram_business_basic%2Cinstagram_business_manage_messages%2Cinstagram_business_manage_comments%2Cinstagram_business_content_publish%2Cinstagram_business_manage_insights&state=${userId}`;

  res.redirect(authUrl);
};

export const addInstaLink = async (req, res) => {
  const userId = req.user._id;
  const { link } = req.body;

  if (!userId || !link) {
    return res.status(400).json({
      success: false,
      message: "User ID and link are required",
    });
  }

  try {
    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const username = link.split("/")[3];

    if (!username) {
      return res.status(400).json({
        success: false,
        message: "Invalid Instagram URL format",
      });
    }

    const url = "https://instagram120.p.rapidapi.com/api/instagram/profile";
    const options = {
      method: "POST",
      headers: {
        "x-rapidapi-key": config.rapid.apiKey,
        "x-rapidapi-host": config.rapid.instagramHost,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        username: username,
      }),
    };

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok || !data.result) {
      return res.status(400).json({
        success: false,
        message: "Failed to fetch Instagram profile data",
        error: data.message || "API request failed",
      });
    }

    const profileData = data.result;

    console.log("Profile Data", profileData);

    user.instagram = {
      ...user.instagram,
      link: link,
      connected: true,
      profile_name: username,
      instagram_id: profileData.id,
      // full_name: profileData.full_name,
      profile_bio: profileData.biography,
      profile_picture: profileData.profile_pic_url,
      profile_followers: profileData.edge_followed_by?.count || 0,
      profile_following: profileData.edge_follow?.count || 0,
      profile_posts: profileData.edge_owner_to_timeline_media?.count || 0,
      // Add timestamp for when data was fetched
      last_updated: new Date(),
    };

    await user.save();

    return res.json({
      success: true,
      message: "Instagram profile connected and data fetched successfully",
      data: {
        instagram: user.instagram,
        profile_stats: {
          followers: profileData.edge_followed_by?.count || 0,
          following: profileData.edge_follow?.count || 0,
          posts: profileData.edge_owner_to_timeline_media?.count || 0,
          is_private: profileData.is_private,
          verified: profileData.is_verified || false,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching Instagram profile:", error);

    // If API fails, still save basic link info
    try {
      const user = await User.findById(userId);
      user.instagram.link = link;
      user.instagram.connected = true;
      user.instagram.profile_name = link.split("/")[3];
      await user.save();

      return res.status(206).json({
        success: true,
        message: "Instagram link saved but profile data fetch failed",
        data: user.instagram,
        warning: "Could not fetch profile details from Instagram API",
      });
    } catch (saveError) {
      return res.status(500).json({
        success: false,
        message: "Failed to save Instagram link",
        error: saveError.message,
      });
    }
  }
};

export const instagramCallback = async (req, res) => {
  const FRONTEND_URL = process.env.FRONTEND_URI;
  // const FRONTEND_URL = "http://localhost:5173";
  const { code, error, error_reason, error_description, state } = req.query;

  if (error) {
    logger.error(`OAuth error: ${error_reason} - ${error_description}`);
    const errorRedirectUrl = `${FRONTEND_URL}/callback?error=${error_reason}&message=${error_description}`;
    logger.info(`Redirecting to frontend with error: ${errorRedirectUrl}`);
    return res.redirect(errorRedirectUrl);
  }

  if (!code) {
    logger.error("No authorization code provided");
    const noCodeRedirectUrl = `${FRONTEND_URL}/callback?error=no_code&message=No authorization code provided`;
    logger.info(
      `Redirecting to frontend with no code error: ${noCodeRedirectUrl}`
    );
    return res.redirect(noCodeRedirectUrl);
  }

  const userId = state;

  const INSTAGRAM_CLIENT_ID = process.env.INSTAGRAM_APP_ID;
  const INSTAGRAM_CLIENT_SECRET = process.env.INSTAGRAM_APP_SECRET;
  const REDIRECT_URI = process.env.INSTAGRAM_REDIRECT_URI;

  try {
    const tokenResponse = await axios.post(
      "https://api.instagram.com/oauth/access_token",
      new URLSearchParams({
        client_id: INSTAGRAM_CLIENT_ID,
        client_secret: INSTAGRAM_CLIENT_SECRET,
        grant_type: "authorization_code",
        redirect_uri: REDIRECT_URI,
        code,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const shortLivedToken = tokenResponse.data.access_token;
    const instagramUserId = tokenResponse.data.user_id; // Renamed to avoid conflict

    const longLivedResponse = await axios.get(
      "https://graph.instagram.com/access_token",
      {
        params: {
          grant_type: "ig_exchange_token",
          client_secret: INSTAGRAM_CLIENT_SECRET,
          access_token: shortLivedToken,
        },
      }
    );

    const longLivedToken = longLivedResponse.data.access_token;
    const expiresIn = longLivedResponse.data.expires_in;

    try {
      const userResponse = await axios.get("https://graph.instagram.com/me", {
        params: {
          fields: "id,username",
          access_token: longLivedToken,
        },
      });

      const correctInstagramUserId = userResponse.data.id;

      const userDetails = await axios.get(
        `https://graph.instagram.com/v23.0/${correctInstagramUserId}?fields=id,username,biography,profile_picture_url,followers_count,follows_count,media_count&access_token=${longLivedToken}`
      );
      logger.info(`User details: ${userDetails.data}`);

      await User.findByIdAndUpdate(userId, {
        instagram: {
          ig_user_id: correctInstagramUserId,
          ig_access_token: longLivedToken,
          ig_access_token_expires: new Date(Date.now() + expiresIn * 1000),
          connected: true,
          profile_picture: userDetails.data.profile_picture_url,
          profile_name: userDetails.data.username,
          profile_bio: userDetails.data.biography,
          profile_followers: userDetails.data.followers_count,
          profile_following: userDetails.data.follows_count,
          profile_posts: userDetails.data.media_count,
        },
      });

      const successRedirectUrl = `${FRONTEND_URL}/callback?code=${code}&access_token=${longLivedToken}&user_id=${correctInstagramUserId}&expires_in=${expiresIn}`;
      logger.info(
        `Redirecting to frontend with success: ${successRedirectUrl}`
      );
      res.redirect(successRedirectUrl);
    } catch (userError) {
      logger.error(
        `Error getting correct user ID: ${userError.response?.data || userError.message}`
      );
      await User.findByIdAndUpdate(userId, {
        instagram: {
          ig_user_id: instagramUserId,
          fb_access_token: longLivedToken,
          fb_access_token_expires: new Date(Date.now() + expiresIn * 1000),
          connected: true,
        },
      });

      const fallbackRedirectUrl = `${FRONTEND_URL}/callback?code=${code}&access_token=${longLivedToken}&user_id=${instagramUserId}&expires_in=${expiresIn}`;
      logger.info(
        `Redirecting to frontend with fallback user ID: ${fallbackRedirectUrl}`
      );
      res.redirect(fallbackRedirectUrl);
    }
  } catch (error) {
    logger.error(
      `Error during OAuth: ${error.response?.data || error.message}`
    );
    logger.error(`Full error object: ${error}`);
    const errorRedirectUrl = `${FRONTEND_URL}/callback?error=oauth_failed&message=${
      error.response?.data?.error_message || error.message
    }`;
    res.redirect(errorRedirectUrl);
  }
};

// 3. Disconnect Instagram
export const disconnectInstagram = async (req, res) => {
  try {
    const userId = req.user._id;

    await User.findByIdAndUpdate(userId, {
      $unset: {
        "instagram.ig_user_id": "",
        "instagram.ig_access_token": "",
        "instagram.ig_access_token_expires": "",
        "instagram.profile_picture": "",
        "instagram.profile_name": "",
        "instagram.profile_bio": "",
        "instagram.profile_followers": "",
        "instagram.profile_following": "",
        "instagram.profile_posts": "",
        "instagram.link": "",
      },
      "instagram.connected": false,
      $pull: { certificates: "Instagram" }
    });

    await UserCertification.updateOne(
      { userId: userId, platform: "Instagram" },
      { $set: { status: "not_applied" } }
    );

    return res.json({
      success: true,
      message: "Instagram account disconnected successfully.",
    });
  } catch (error) {
    logger.error(`Instagram Disconnect Error: ${error}`);
    return res
      .status(500)
      .json({ success: false, message: "Failed to disconnect." });
  }
};

export const removeYoutubeChannel = async (req, res) => {
  const userId = req.user._id;
  try {
    await User.findByIdAndUpdate(userId, {
      $unset: {
        youtube: {
          youtube_channel_url: "",
          youtube_channel_title: "",
          youtube_channel_thumbnail: "",
          youtube_subscribers: 0,
          youtube_videos: 0,
          youtube_views: 0,
          youtube_total_likes: 0,
          youtube_total_comments: 0,
          stats_last_updated: null,
          googleId: "",
          googleTokens: {
            access_token: "",
            refresh_token: "",
            expiry_date: null,
          },
          connected: false,
        },
      },
      $pull: { certificates: "Youtube shorts" }
    });

    await UserCertification.updateOne(
      { userId: userId, platform: "Youtube shorts" },
      { $set: { status: "not_applied" } }
    );

    return res.json({
      success: true,
      message: "YouTube channel removed successfully.",
    });
  } catch (error) {
    logger.error(`Error removing YouTube channel: ${error}`);
    return res
      .status(500)
      .json({ success: false, message: "Failed to remove YouTube channel." });
  }
};

export const proxyInstagramImage = async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) {
      return res
        .status(400)
        .json({ success: false, message: "Missing image URL" });
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error("Failed to fetch image");

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = await response.arrayBuffer();

    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=3600"); // cache 1hr
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("Image proxy error:", err);
    res.status(500).json({ success: false, message: "Failed to proxy image" });
  }
};
