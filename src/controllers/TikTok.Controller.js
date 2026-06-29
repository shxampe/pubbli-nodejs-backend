import axios from "axios";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { downloadVideoToBuffer } from "../utils/downloadVideo.js";
import UserCertification from "../models/UserCertificationModel.js";
import { logger } from "../utils/logger.js";


// TikTok Connect
export const connectTikTok = async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).send("Missing user token");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded._id || decoded.userId;
    logger.info(`userId: ${userId}`);

    // Create secure state token
    const state = jwt.sign(
      { userId, csrf: Math.random().toString(36).substring(2) },
      process.env.JWT_SECRET,
      { expiresIn: "10m" }
    );

    // Force TikTok to show permissions screen even if session exists
    const authUrl =
      `https://www.tiktok.com/v2/auth/authorize/` +
      `?client_key=${process.env.TIKTOK_CLIENT_KEY}` +
      `&response_type=code` +
      `&scope=user.info.basic,video.upload,video.publish,video.list,user.info.profile,user.info.stats` +
      `&redirect_uri=${encodeURIComponent(process.env.TIKTOK_REDIRECT_URI)}` +
      `&state=${state}` +
      `&disable_auto_auth=1`;      

    logger.info(`Redirecting to: ${authUrl}`);
    return res.redirect(authUrl);
  } catch (err) {
    logger.error(`TikTok Connect Error: ${err.message}`);
    return res.status(500).send("TikTok Connect failed");
  }
};

// 02. OAuth Callback
export const tiktokCallback = async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  // Check for OAuth errors first
  if (error) {
    logger.error(`TikTok OAuth Error: ${error} - ${error_description}`);
    return res.redirect(`${process.env.FRONTEND_URI}/tiktokCallback?error=${error}&description=${error_description}`);
  }
  
  logger.info(`code: ${code}`);
  logger.info(`state: ${state}`);
  
  if (!code || !state) {
    logger.error("Missing code or state in callback");
    return res.status(400).send("Missing code/state");
  }

  try {
    // Verify state token
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const userId = decoded.userId;
    logger.info(`userId: ${userId}`);
    
    if (!userId) {
      throw new Error("Invalid state token - no userId found");
    }

    logger.info("Attempting to exchange code for access token");

    // Exchange authorization code for access token
    const tokenRes = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.TIKTOK_REDIRECT_URI,
      }),
      { 
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        timeout: 10000 // 10 second timeout
      }
    );
    
    logger.info(`Token response status: ${tokenRes.status}`);
    logger.info(`Token response data:`, tokenRes.data);

    // Check if token exchange was successful
    if (!tokenRes.data || !tokenRes.data.access_token) {
      logger.error("Token exchange failed - no access token received");
      logger.error("Full response:", tokenRes.data);
      throw new Error("Failed to obtain access token from TikTok");
    }

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    
    if (!access_token) {
      throw new Error("No access token in response");
    }

    logger.info("Successfully obtained access token, fetching user details");

    // Get user details
    const userDetails = await axios.get(
      `https://open.tiktokapis.com/v2/user/info/?fields=username,avatar_url,is_verified,display_name,bio_description,follower_count,following_count,likes_count,video_count`,
      { 
        headers: { Authorization: `Bearer ${access_token}` },
        timeout: 10000 // 10 second timeout
      }
    );
    
    logger.info(`User details response status: ${userDetails.status}`);
    logger.info(`User details:`, userDetails.data);

    // Check if user details request was successful
    if (!userDetails.data || !userDetails.data.data || !userDetails.data.data.user) {
      logger.error("Failed to fetch user details from TikTok");
      logger.error("User details response:", userDetails.data);
      throw new Error("Failed to fetch user profile from TikTok");
    }

    const tiktokUser = userDetails.data.data.user;
    
    // Validate required user data
    if (!tiktokUser.username) {
      throw new Error("TikTok user data is incomplete - missing username");
    }

    logger.info(`Updating user ${userId} with TikTok data`);

    // Update user in database
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        tiktok: {
          tiktok_user_id: tiktokUser.username,
          tiktok_access_token: access_token,
          tiktok_refresh_token: refresh_token || null,
          tiktok_access_token_expires: expires_in ? new Date(Date.now() + expires_in * 1000) : null,
          connected: true,
          // Add profile information from userDetails API call
          profile_name: tiktokUser.display_name || '',
          profile_picture: tiktokUser.avatar_url || '',
          profile_bio: tiktokUser.bio_description || '',
          profile_verified: tiktokUser.is_verified || false,
          profile_followers: tiktokUser.follower_count || 0,
          profile_following: tiktokUser.following_count || 0,
          profile_posts: tiktokUser.video_count || 0,
          stats_likes: tiktokUser.likes_count || 0,
          stats_last_updated: new Date(),
        },
      },
      { new: true, select: 'tiktok name' }
    );

    if (!updatedUser) {
      logger.error(`User not found with ID: ${userId}`);
      throw new Error("User not found in database");
    }

    logger.info(`User successfully updated: ${updatedUser._id}`);
    logger.info(`TikTok connection status: ${updatedUser.tiktok.connected}`);

    // Successful redirect
    return res.redirect(
      `${process.env.FRONTEND_URI}/tiktokCallback?tiktokConnected=${updatedUser.tiktok.connected}&username=${updatedUser.tiktok.tiktok_user_id}`
    );

  } catch (err) {
    logger.error(`TikTok callback error:`, {
      message: err.message,
      stack: err.stack,
      response: err.response?.data,
      status: err.response?.status,
      code: err.code
    });
    
    // Different handling based on error type
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.redirect(`${process.env.FRONTEND_URI}/tiktokCallback?error=invalid_state&description=Security token expired or invalid`);
    }
    
    if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
      return res.redirect(`${process.env.FRONTEND_URI}/tiktokCallback?error=network_error&description=Unable to connect to TikTok servers`);
    }
    
    return res.redirect(`${process.env.FRONTEND_URI}/tiktokCallback?error=connection_failed&description=Failed to connect TikTok account`);
  }
};

export const tiktokCallback2 = async (req, res) => {
  const { code, state } = req.query;
  logger.info(`code: ${code}`);
  logger.info(`state: ${state}`);
  if (!code || !state) return res.status(400).send("Missing code/state");

  try {
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    const userId = decoded.userId;
    logger.info(`userId: ${userId}`);
    if (!userId) throw new Error("Invalid state token");

    logger.info("Trying to get token");

    const tokenRes = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: process.env.TIKTOK_REDIRECT_URI,
      }),
      { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
    );

    const { access_token, refresh_token, expires_in } = tokenRes.data;

    const userDetails = await axios.get(
      `https://open.tiktokapis.com/v2/user/info/?fields=username,avatar_url,is_verified,display_name,bio_description,follower_count,following_count,likes_count,video_count`,
      { headers: { Authorization: `Bearer ${access_token}` } }
    );
    logger.info(`userDetails:`, userDetails.data.data.user);

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        tiktok: {
          tiktok_user_id: userDetails.data.data.user.username,
          tiktok_access_token: access_token,
          tiktok_refresh_token: refresh_token,
          tiktok_access_token_expires: new Date(Date.now() + expires_in * 1000),
          connected: true,
          // Add profile information from userDetails API call
          profile_name: userDetails.data.data.user.display_name,
          profile_picture: userDetails.data.data.user.avatar_url,
          profile_bio: userDetails.data.data.user.bio_description,
          profile_verified: userDetails.data.data.user.is_verified,
          profile_followers: userDetails.data.data.user.follower_count,
          profile_following: userDetails.data.data.user.following_count,
          profile_posts: userDetails.data.data.user.video_count,
          stats_likes: userDetails.data.data.user.likes_count,
          stats_last_updated: new Date(),
        },
      },
      { new: true, tiktok: 1, name: 1 }
    );
    logger.info(`User updated: ${updatedUser._id}`);

    // return res.redirect("http://localhost:5173/dashboard/profile");
    return res.redirect(
      "https://creator.pubbli.com/dashboard/dashboard/certification/tiktok"
    );
    // return res.json({ success: true, message: "TikTok connected successfully", data: updatedUser });
  } catch (err) {
    logger.error(`tiktokCallback error: ${err.response?.data || err.message}`);
    return res.status(500).send("TikTok callback failed");
  }
};

// 03. Reset connection
export const resetTikTokConnection = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, {
      "tiktok.access_token": "",
      "tiktok.refresh_token": "",
      "tiktok.tiktok_access_token_expires": "",
      "tiktok.tiktok_user_id": "",
      "tiktok.connected": false,
      "tiktok.profile_name": "",
      "tiktok.profile_picture": "",
      "tiktok.profile_bio": "",
      "tiktok.profile_verified": false,
      "tiktok.profile_followers": 0,
      "tiktok.profile_following": 0,
      "tiktok.profile_posts": 0,
      $pull: { certificates: "Tiktok"}
    }

  );

    await UserCertification.updateOne(
      { userId: req.user._id, platform: "Tiktok" },
      { $set: { status: "not_applied" } }
    );
    return res.json({ success: true, message: "Disconnected" });
  } catch (err) {
    logger.error(`resetTikTokConnection error: ${err.message}`);
    return res.status(500).json({ success: false, message: "Reset failed" });
  }
};

// Get TikTok Profile
export const getTikTokProfile = async (req, res) => {
  try {
    logger.info("Entering getTikTokProfile...");
    const user = await User.findById(req.user._id);

    if (!user) {
      logger.error("No user found in DB");
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const token = user?.tiktok?.tiktok_access_token;
    const openId = user?.tiktok?.tiktok_user_id;
    const tokenExpiry = user?.tiktok?.tiktok_access_token_expires;

    logger.info(`Token: ${token ? "Present" : "Missing"}`);
    logger.info(`OpenID: ${openId}`);
    logger.info(`Token Expiry: ${tokenExpiry}`);
    logger.info(`Is Connected: ${user?.tiktok?.connected}`);

    if (!token || !openId || !user?.tiktok?.connected) {
      return res
        .status(400)
        .json({ success: false, message: "TikTok not connected" });
    }

    const response = await axios.get(
      "https://open.tiktokapis.com/v2/user/info/",
      {
        headers: { Authorization: `Bearer ${token}` },
        params: {
          fields:
            "open_id,display_name,avatar_url,bio_description,follower_count,following_count,likes_count,video_count",
        },
      }
    );

    logger.info(`TikTok Profile Response:`, response.data);

    res.json({ success: true, profile: response.data?.data });
  } catch (err) {
    logger.error(`getTikTokProfile error: ${err.message}`, {
      data: err.response?.data,
      headers: err.response?.headers,
      status: err.response?.status,
    });

    if (err.response?.data?.error?.code === "invalid_access_token") {
      return res.status(401).json({
        success: false,
        message: "Fetch failed",
        error: "TikTok token expired (refresh flow needed)",
      });
    }

    res.status(500).json({
      success: false,
      message: "Failed to fetch TikTok profile",
      error: err.response?.data || err.message,
    });
  }
};
// Upload TikTok Video
export const postToTikTok = async (req, res) => {
  try {
    const { videoUrl } = req.body;
    const user = await User.findById(req.user._id);
    const accessToken = user?.tiktok?.tiktok_access_token;

    if (!user?.tiktok?.connected || !accessToken) {
      return res.status(400).json({ message: "TikTok not connected" });
    }

    const videoBuffer = await downloadVideoToBuffer(videoUrl);
    const videoSize = videoBuffer.length;

    const initRes = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/inbox/video/init/",
      {
        source_info: {
          source: "FILE_UPLOAD",
          video_size: videoSize,
          chunk_size: videoSize,
          total_chunk_count: 1,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    const { upload_url, publish_id } = initRes.data.data;
    if (!upload_url || !publish_id) throw new Error("Upload session failed");

    await axios.put(upload_url, videoBuffer, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Range": `bytes 0-${videoSize - 1}/${videoSize}`,
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    await User.findByIdAndUpdate(req.user._id, {
      "tiktok.tiktok_publish_id": publish_id,
      "tiktok.tiktok_status_last_checked": new Date(),
      "tiktok.tiktok_last_status": "PROCESSING",
    });

    return res.status(200).json({
      success: true,
      message: "Video uploaded successfully",
      publish_id,
    });
  } catch (err) {
    logger.error(`TikTok Publish Error: ${err.response?.data || err.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to post TikTok video",
      error: err.response?.data || err.message,
    });
  }
};

// Fetch TikTok Video Status
export const fetchTikTokVideoStatus = async (req, res) => {
  try {
    const { publish_id } = req.body;
    const user = await User.findById(req.user._id);
    const accessToken = user?.tiktok?.tiktok_access_token;

    if (!accessToken) {
      return res.status(401).json({ message: "TikTok access token missing" });
    }

    const statusRes = await axios.post(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      { publish_id },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.status(200).json({
      success: true,
      status: statusRes.data,
    });
  } catch (err) {
    logger.error(
      `Fetch TikTok status error: ${err.response?.data || err.message}`
    );
    return res.status(500).json({
      success: false,
      message: "Failed to fetch TikTok video status",
    });
  }
};

// TikTok Webhook
export const tiktokWebhookCallback = async (req, res) => {
  try {
    logger.info(`TikTok Webhook Received:`, req.body);
    return res.status(200).send("Webhook received");
  } catch (error) {
    logger.error(`Webhook error: ${error.message}`);
    return res.status(500).send("Webhook processing failed");
  }
};

export const updateTikTokProfileByUsername = async (req, res) => {
  const { username } = req.params;
  const userId = req.user._id; // assumes auth middleware is setting `req.user`

  try {
    const response = await axios.get(
      `${process.env.TIKTOK_SCRAPER}/get_user_info/${username}`
    );
    const data = response.data;

    if (!data || !data.user_id) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid TikTok data" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          "tiktok.tiktok_user_id": data.user_id,
          "tiktok.tiktok_username": data.unique_id,
          "tiktok.connected": true,
          "tiktok.display_name": data.nickname,
          "tiktok.avatar_url": data.profile_pic,
          "tiktok.bio_description": data.signature || "",
          "tiktok.follower_count": Number(data.followers) || 0,
          "tiktok.following_count": Number(data.following) || 0,
          "tiktok.likes_count": Number(data.likes) || 0,
          "tiktok.video_count": Number(data.videos) || 0,
          "tiktok.stats_last_updated": new Date(),
        },
      },
      { new: true }
    );

    res.status(200).json({ success: true, user: updatedUser });
  } catch (err) {
    logger.error(`TikTok fetch error: ${err.message}`);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch TikTok data" });
  }
};
export const checkTikTokFollow = async (accessToken) => {
  try {
    const response = await axios.get(
      "https://open.tiktokapis.com/v2/user/following/check/",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        params: {
          target_user_id: process.env.TIKTOK_PUBBLI_USER_ID, // your brand TikTok ID
        },
      }
    );

    return response.data?.data?.is_following === true;
  } catch (err) {
    logger.error(
      `checkTikTokFollow error: ${err.response?.data || err.message}`
    );
    return false;
  }
};

// export const getVideoInsights = async (req, res) => {
//   try {
//     const { input } = req.body;

//     const client = new ApifyClient({
//       token: config.apify.api_key,
//     });

//     const run = await client
//       .actor("clockworks/tiktok-video-scraper")
//       .call(input);
//     const { items } = await client.dataset(run.defaultDatasetId).listItems();

//     const insights = items.map((item) => ({
//       videoId: item.id,
//       url: item.webVideoUrl,
//       description: item.text,
//       author: {
//         username: item.authorMeta?.name,
//         nickname: item.authorMeta?.nickName,
//         followers: item.authorMeta?.fans,
//         following: item.authorMeta?.following,
//       },
//       stats: {
//         views: item.playCount,
//         likes: item.diggCount,
//         comments: item.commentCount,
//         shares: item.shareCount,
//       },
//       music: {
//         title: item.musicMeta?.musicName,
//         author: item.musicMeta?.musicAuthor,
//         duration: item.musicMeta?.musicDuration,
//       },
//       hashtags: item.hashtags || [],
//       createdAt: item.createTime,
//       duration: item.videoMeta?.duration,
//     }));

//     res.json({
//       success: true,
//       count: items.length,
//       data: insights,
//     });
//   } catch (error) {
//     logger.error(`Error scraping TikTok videos: ${error.message}`);
//     res.status(500).json({
//       error: "Failed to scrape video insights",
//       message: error.message,
//     });
//   }
// };
