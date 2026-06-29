import cron from 'node-cron';
import User from '../../models/User.js';
import axios from 'axios';
import { logger } from "../../utils/logger.js";

const refreshTikTokToken = async (user) => {
  try {
    const response = await axios.post(
      "https://open.tiktokapis.com/v2/oauth/token/",
      {
        client_key: process.env.TIKTOK_CLIENT_KEY,
        client_secret: process.env.TIKTOK_CLIENT_SECRET,
        grant_type: "refresh_token",
        refresh_token: user.tiktok.refresh_token,
      }
    );

    return {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_in: response.data.expires_in,
    };
  } catch (error) {
    logger.error(`Failed to refresh TikTok token for user ${user._id}:`, error);
    throw error;
  }
};

const updateSocialInsights = async () => {
  try {
    const users = await User.find({
      role: "influencer",
      $or: [{ "instagram.connected": true }, { "tiktok.connected": true }],
    });

    logger.info(`Starting insights update for ${users.length} users`);

    for (let i = 0; i < users.length; i += 10) {
      const batch = users.slice(i, i + 10);
      for (const user of batch) {
        try {
          if (user.instagram?.connected && user.instagram?.ig_access_token) {
            const instaResponse = await axios.get(
              `https://graph.instagram.com/v23.0/${user.instagram.ig_user_id}`,
              {
                params: {
                  fields:
                    "id,username,biography,profile_picture_url,followers_count,follows_count,media_count",
                  access_token: user.instagram.ig_access_token,
                },
              }
            );

            await User.findByIdAndUpdate(user._id, {
              "instagram.profile_picture":
                instaResponse.data.profile_picture_url,
              "instagram.profile_name": instaResponse.data.username,
              "instagram.profile_bio": instaResponse.data.biography,
              "instagram.profile_followers": instaResponse.data.followers_count,
              "instagram.profile_following": instaResponse.data.follows_count,
              "instagram.profile_posts": instaResponse.data.media_count,
            });

            logger.info(`Updated Instagram insights for user ${user._id}`);
          }

          if (user.tiktok?.connected && user.tiktok?.tiktok_access_token) {
            const newTokens = await refreshTikTokToken(user);

            const tiktokResponse = await axios.get(
              "https://open.tiktokapis.com/v2/user/info/",
              {
                headers: {
                  Authorization: `Bearer ${newTokens.access_token}`,
                },
              }
            );

            await User.findByIdAndUpdate(user._id, {
              "tiktok.access_token": newTokens.access_token,
              "tiktok.refresh_token": newTokens.refresh_token,
              "tiktok.token_expires_in": newTokens.expires_in,
              "tiktok.display_name": tiktokResponse.data.display_name,
              "tiktok.avatar_url": tiktokResponse.data.avatar_url,
              "tiktok.follower_count": tiktokResponse.data.follower_count,
              "tiktok.following_count": tiktokResponse.data.following_count,
              "tiktok.likes_count": tiktokResponse.data.likes_count,
              "tiktok.video_count": tiktokResponse.data.video_count,
            });

            logger.info(`Updated TikTok insights for user ${user._id}`);
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (userError) {
          logger.error(
            `Failed to update insights for user ${user._id}:`,
            userError
          );
          continue;
        }
      }
    }

    logger.info("Completed social insights update");
  } catch (error) {
    logger.error(`Error in social insights cron job: ${error}`);
  }
};

const refreshInstagramToken = async () => {
  try {
    const users = await User.find({
      role: "influencer",
      "instagram.connected": true,
      "instagram.ig_access_token": { $ne: null },
    });

    logger.info(`Starting Instagram token refresh for ${users.length} users`);

    for (const user of users) {
      try {
        const response = await axios.get(
          "https://graph.instagram.com/refresh_access_token",
          {
            params: {
              grant_type: "ig_refresh_token",
              access_token: user.instagram.ig_access_token,
            },
          }
        );

        await User.findByIdAndUpdate(user._id, {
          "instagram.ig_access_token": response.data.access_token,
          "instagram.ig_access_token_expires": new Date(
            Date.now() + response.data.expires_in * 1000
          ),
        });

        logger.info(`Refreshed Instagram token for user ${user._id}`);

        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(
          `Failed to refresh Instagram token for user ${user._id}:`,
          error
        );
        continue;
      }
    }

    logger.info("Completed Instagram token refresh");
  } catch (error) {
    logger.error(`Error in Instagram token refresh job: ${error}`);
  }
};

export const socialInsightsJob = cron.schedule('0 0 * * *', updateSocialInsights, {
    scheduled: false,
    timezone: "UTC"
}); 

export const instagramTokenRefreshJob = cron.schedule('0 0 */59 * *', refreshInstagramToken, {
    scheduled: false,
    timezone: "UTC"
}); 