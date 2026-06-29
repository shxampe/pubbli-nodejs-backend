import axios from "axios";
import User from "../models/User.js";
import CampaignApplication from "../models/CampaignApplication.js";
import { logger } from "../utils/logger.js";
import config from "../config/appconfig.js";

export const postToInstagram = async (req, res) => {
  try {
    const { videoUrl, caption } = req.body;
    const userId = req.user._id;

    if (!videoUrl || !caption) {
      return res.status(400).json({
        success: false,
        message: "Missing videoUrl or caption",
      });
    }

    // Step 1: Get the user's IG credentials
    const user = await User.findById(userId);

    if (!user || !user.instagram?.connected) {
      return res.status(400).json({
        success: false,
        message: "Instagram account not connected",
      });
    }

    const PAGE_ACCESS_TOKEN = user.instagram.fb_access_token;
    const IG_USER_ID = user.instagram.ig_user_id;

    if (!PAGE_ACCESS_TOKEN || !IG_USER_ID) {
      return res.status(400).json({
        success: false,
        message: "Missing Instagram credentials",
      });
    }

    // Step 2: Create Media Container
    const createRes = await axios.post(
      `https://graph.facebook.com/v19.0/${IG_USER_ID}/media`,
      null,
      {
        params: {
          media_type: "REELS",
          video_url: videoUrl,
          caption,
          access_token: PAGE_ACCESS_TOKEN,
        },
      }
    );

    const creationId = createRes.data.id;

    // Step 3: Poll media status until it's ready
    let retries = 0;
    let mediaStatus = null;

    while (retries < 10) {
      const statusRes = await axios.get(
        `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${PAGE_ACCESS_TOKEN}`
      );

      mediaStatus = statusRes.data?.status_code;

      if (mediaStatus === "FINISHED") break;

      await new Promise((resolve) => setTimeout(resolve, 3000));
      retries++;
    }

    if (mediaStatus !== "FINISHED") {
      return res.status(400).json({
        success: false,
        message: "Media not ready for publishing after retries",
      });
    }

    // Step 4: Publish the media
    const publishRes = await axios.post(
      `https://graph.facebook.com/v19.0/${IG_USER_ID}/media_publish`,
      null,
      {
        params: {
          creation_id: creationId,
          access_token: PAGE_ACCESS_TOKEN,
        },
      }
    );

    return res.status(200).json({
      success: true,
      message: "Video posted successfully to Instagram",
      postId: publishRes.data.id,
    });
  } catch (error) {
    logger.error(
      `Instagram API error: ${error.response?.data || error.message}`
    );
    return res.status(500).json({
      success: false,
      message: "Failed to post to Instagram",
      error: error.response?.data || error.message,
    });
  }
};

export const getInstagramPostInsights = async (req, res) => {
  try {
    const { url, applicationId } = req.body;
    
    if (!url || !applicationId) {
      return res.status(400).json({
        success: false,
        message: "Missing url or applicationId in request body",
      });
    }

    // Validate Instagram URL format
    const match =
      url.match(/instagram.com\/p\/([\w-]+)/) 
      || url.match(/instagram.com\/reel\/([\w-]+)/)
      || url.match(/instagram.com\/reels\/([\w-]+)/);
    if (!match) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid Instagram post URL format" });
    } 

    const application = await CampaignApplication.findById(applicationId);
    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Campaign application not found" });
    }
    
    const rapidApiResponse = await fetch(
      `https://instagram-premium-api-2023.p.rapidapi.com/v1/media/by/url?url=${url}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": config.rapid.apiKey,
          "x-rapidapi-host": 'instagram-premium-api-2023.p.rapidapi.com',
          "x-access-key": config.rapid.apiKey, // same as x-rapidapi-key
        },
      }
    );    

    if (!rapidApiResponse.ok) {
      return res.status(400).json({
        success: false,
        message: "Failed to fetch data from RapidAPI",
      });
    }

    const postData = await rapidApiResponse.json();

    // Validate response
    if (!postData || !postData.id || !postData.code) {
      return res.status(400).json({
        success: false,
        message: "Invalid response from Instagram API or post not found",
      });
    }

    // Extract metrics
    const metrics = {};

    if (postData.like_count !== undefined)
      metrics.likes = postData.like_count;
    if (postData.comment_count !== undefined)
      metrics.comments = postData.comment_count;
    if (postData.play_count !== undefined)
      metrics.views = postData.play_count;
    if (postData.video_duration !== undefined)
      metrics.duration = postData.video_duration;

    // Keep other placeholders null (if not provided by this API)
    metrics.ig_reels_avg_watch_time = null;
    metrics.ig_reels_video_view_total_time = null;
    metrics.reach = null;
    metrics.saved = null;
    metrics.shares = null;

    const insightObj = {
      post_id: postData.id || null,
      shortcode: postData.code,
      permalink: url,
      metrics,
    };

    application.postInsights = insightObj;
    await application.save();

    return res.status(200).json({ success: true, insights: insightObj });
  } catch (error) {
    logger.error(`Instagram Insights API error: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch post insights",
      error: error.message,
    });
  }
};



// export const getInstagramPostInsights = async (req, res) => {
//   try {
//     const { url, applicationId } = req.body;
//     if (!url || !applicationId) {
//       return res.status(400).json({
//         success: false,
//         message: "Missing url or applicationId in request body",
//       });
//     }

//     const match =
//       url.match(/instagram.com\/p\/([\w-]+)/) ||
//       url.match(/instagram.com\/reel\/([\w-]+)/);
//     if (!match) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Invalid Instagram post URL format" });
//     }
//     const shortcode = match[1];

//     // const userId = req.user?._id

//     const application = await CampaignApplication.findById(applicationId);
//     if (!application) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Campaign application not found" });
//     }

//     const user = await User.findById(application.userId);
//     if (!user || !user.instagram?.connected) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Instagram account not connected" });
//     }
//     const IG_USER_ID = user.instagram.ig_user_id;
//     const ACCESS_TOKEN = user.instagram.ig_access_token;
//     if (!IG_USER_ID || !ACCESS_TOKEN) {
//       return res
//         .status(400)
//         .json({ success: false, message: "Missing Instagram credentials" });
//     }

//     const mediaRes = await axios.get(
//       `https://graph.instagram.com/${IG_USER_ID}/media`,
//       {
//         params: {
//           fields: "id,shortcode,permalink",
//           limit: 20,
//           access_token: ACCESS_TOKEN,
//         },
//       }
//     );
//     const mediaArr = mediaRes.data?.data || [];
//     const post = mediaArr.find((m) => m.shortcode === shortcode);
//     if (!post) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid URL: shortcode not found in user's recent posts",
//       });
//     }

//     const insightsRes = await axios.get(
//       `https://graph.instagram.com/v23.0/${post.id}/insights`,
//       {
//         params: {
//           metric:
//             "likes,comments,ig_reels_avg_watch_time,ig_reels_video_view_total_time,reach,saved,shares,views",
//           access_token: ACCESS_TOKEN,
//         },
//       }
//     );
//     const metrics = {};
//     if (Array.isArray(insightsRes.data?.data)) {
//       for (const item of insightsRes.data.data) {
//         metrics[item.name] = item.values?.[0]?.value ?? null;
//       }
//     }

//     const insightObj = {
//       post_id: post.id,
//       shortcode: post.shortcode,
//       permalink: post.permalink,
//       metrics,
//     };

//     application.postInsights = insightObj;
//     await application.save();

//     return res.status(200).json({ success: true, insights: insightObj });
//   } catch (error) {
//     logger.error(
//       `Instagram Insights API error: ${error.response?.data || error.message}`
//     );
//     return res.status(500).json({
//       success: false,
//       message: "Failed to fetch post insights",
//       error: error.response?.data || error.message,
//     });
//   }
// };


// export const getInstagramPostInsights = async (req, res) => {
//   console.log("Inside getInstagramPostInsights");
//   res.status(200).json({ success: true, msgg: "gyft" });
// };

export const getYoutubePostInsights = async (req, res) => {
  try {
    const { url, applicationId } = req.body;
    if (!url || !applicationId) {
      return res.status(400).json({
        success: false,
        message: "Missing url or applicationId in request body",
      });
    }

    const application = await CampaignApplication.findById(applicationId);
    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Campaign application not found" });
    }

    const user = await User.findById(application.userId);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found for application" });
    }

    const getYouTubeVideoId = (input) => {
      try {
        const u = new URL(input);
        const host = u.hostname.replace(/^www\./, "");
        if (host === "youtu.be") return u.pathname.slice(1);
        const v = u.searchParams.get("v") || u.searchParams.get("vi");
        if (v) return v;
        const p = u.pathname;
        if (p.startsWith("/embed/")) return p.split("/embed/")[1].split("/")[0];
        if (p.startsWith("/shorts/"))
          return p.split("/shorts/")[1].split("/")[0];
      } catch (error) {
        logger.error(`Error getting YouTube video ID: ${error}`);
      }
      const m = String(input).match(
        /(?:v=|youtu\.be\/|\/(?:embed|shorts)\/)([A-Za-z0-9_-]{11})/
      );
      return m ? m[1] : null;
    };

    const videoId = getYouTubeVideoId(url);
    logger.info(`Youtube Video ID: ${videoId} for url: ${url}`);
    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "Invalid YouTube URL; could not extract video ID",
      });
    }

    const { data } = await axios.get(
      "https://www.googleapis.com/youtube/v3/videos",
      {
        params: {
          part: "snippet,statistics,contentDetails,status",
          id: videoId,
          key: config.google.api_key,
        },
      }
    );

    const item = data?.items?.[0];
    if (!item) {
      return res
        .status(404)
        .json({ success: false, message: "Video not found or not public" });
    }

    const stats = item.statistics || {};

    let duration = item.contentDetails?.duration || null;
    if (duration) {
      const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
      if (match) {
        const hours = parseInt(match[1] || "0", 10);
        const minutes = parseInt(match[2] || "0", 10);
        const seconds = parseInt(match[3] || "0", 10);
        duration = hours * 3600 + minutes * 60 + seconds;
      }
    }

    const newMetrics = {
      likes: stats.likeCount ? Number(stats.likeCount) : undefined,
      comments: stats.commentCount ? Number(stats.commentCount) : undefined,
      views: stats.viewCount ? Number(stats.viewCount) : undefined,
      duration: duration,
    };

    const existingInsights = application.postInsights || {};
    application.postInsights = {
      ...existingInsights,
      post_id: videoId,
      permalink: url,
      metrics: {
        ...(existingInsights.metrics || {}),
        ...newMetrics,
      },
    };
    await application.save();

    return res
      .status(200)
      .json({ success: true, insights: application.postInsights });
  } catch (error) {
    logger.error(
      `Youtube Insights API error: ${error.response?.data || error.message}`
    );
    return res.status(500).json({
      success: false,
      message: "Failed to fetch YouTube insights",
      error: error.response?.data || error.message,
    });
  }
};

export const getTikTokPostInsights = async (req, res) => {
  try {
    const { url, applicationId } = req.body;
    if (!url || !applicationId) {
      return res.status(400).json({
        success: false,
        message: "Missing url or applicationId in request body",
      });
    }

    // Extract video ID from TikTok URL
    let videoId;
    const patterns = [
      /tiktok\.com\/.*\/video\/(\d+)/,
      /tiktok\.com\/@[\w.-]+\/video\/(\d+)/,
      /vm\.tiktok\.com\/(\w+)/,
      /tiktok\.com\/t\/(\w+)/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        videoId = match[1];
        break;
      }
    }

    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "Invalid TikTok URL format or unable to extract video ID",
      });
    }

    const application = await CampaignApplication.findById(applicationId);
    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Campaign application not found" });
    }

    // Call TikTok RapidAPI
    const rapidApiResponse = await fetch(`https://tiktok-api23.p.rapidapi.com/api/post/detail?videoId=${videoId}`, {
      method: 'GET',
      headers: {
        'x-rapidapi-key': config.rapid.apiKey,
        'x-rapidapi-host': config.rapid.tiktokHost,
      }
    });

    if (!rapidApiResponse.ok) {
      return res.status(400).json({
        success: false,
        message: "Failed to fetch data from TikTok API",
      });
    }

    const tiktokData = await rapidApiResponse.json();
    
    // Check if we got valid data
    if (!tiktokData.itemInfo || !tiktokData.itemInfo.itemStruct) {
      return res.status(400).json({
        success: false,
        message: "Invalid response from TikTok API or video not found",
      });
    }

    const itemStruct = tiktokData.itemInfo.itemStruct;
    const stats = itemStruct.stats || itemStruct.statsV2;

    // Map TikTok API response fields to your model fields
    const metrics = {};
    
    // Map available fields from TikTok API response to your model
    if (stats.diggCount !== undefined) {
      metrics.likes = parseInt(typeof stats.diggCount === 'string' ? stats.diggCount : stats.diggCount);
    }
    if (stats.commentCount !== undefined) {
      metrics.comments = parseInt(typeof stats.commentCount === 'string' ? stats.commentCount : stats.commentCount);
    }
    if (stats.playCount !== undefined) {
      metrics.views = parseInt(typeof stats.playCount === 'string' ? stats.playCount : stats.playCount);
    }
    if (stats.shareCount !== undefined) {
      metrics.shares = parseInt(typeof stats.shareCount === 'string' ? stats.shareCount : stats.shareCount);
    }
    if (stats.playCount !== undefined) {
      metrics.play = parseInt(typeof stats.playCount === 'string' ? stats.playCount : stats.playCount);
    }

    metrics.duration = itemStruct.video?.duration ? parseInt(typeof itemStruct.video?.duration === 'string' ? itemStruct.video?.duration : itemStruct.video?.duration) : null;
    
    // These fields are not available in TikTok API, set to null
    metrics.ig_reels_avg_watch_time = null;
    metrics.ig_reels_video_view_total_time = null;
    metrics.reach = null;
    metrics.saved = stats.collectCount ? parseInt(typeof stats.collectCount === 'string' ? stats.collectCount : stats.collectCount) : null;

    // Create a unique identifier for TikTok posts (since there's no shortcode)
    const shortcode = `tiktok_${videoId}`;

    const insightObj = {
      post_id: itemStruct.id,
      shortcode: shortcode,
      permalink: url, // Use the original URL as permalink
      metrics,
    };

    application.postInsights = insightObj;
    await application.save();

    return res.status(200).json({ 
      success: true, 
      insights: insightObj,
      additionalData: {
        username: itemStruct.author?.uniqueId || null,
        nickname: itemStruct.author?.nickname || null,
        description: itemStruct.desc || null,
        duration: itemStruct.video?.duration || null,
        createTime: itemStruct.createTime || null,
        videoUrl: itemStruct.video?.playAddr || null,
        coverUrl: itemStruct.video?.cover || null,
      }
    });
  } catch (error) {
    logger.error(
      `TikTok Insights API error: ${error.message}`
    );
    return res.status(500).json({
      success: false,
      message: "Failed to fetch TikTok post insights",
      error: error.message,
    });
  }
};
