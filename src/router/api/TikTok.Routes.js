import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
  connectTikTok,
  tiktokCallback,
  resetTikTokConnection,
  postToTikTok,
  fetchTikTokVideoStatus,
  getTikTokProfile,
  tiktokWebhookCallback,
  updateTikTokProfileByUsername,
  checkTikTokFollow,
  // getVideoInsights,
} from "../../controllers/TikTok.Controller.js";
 
const router = express.Router();
 
// ✅ Start OAuth flow
router.get("/connect", connectTikTok);
 
// ✅ OAuth callback (code exchange)
router.get("/callback", tiktokCallback);
router.get("/tcallback", tiktokCallback); // optional duplicate
 
// ✅ Webhook (if used)
router.post("/callback", tiktokWebhookCallback);
 
// ✅ Reset TikTok connection (for missing scopes etc.)
router.post("/reset", authenticate, resetTikTokConnection);
// ✅ Upload video to TikTok
router.post("/post-tiktok", authenticate, postToTikTok);
 
// ✅ Get publish status
router.post("/status", authenticate, fetchTikTokVideoStatus);
 
// ✅ Fetch connected TikTok public profile info
router.get("/profile", authenticate, getTikTokProfile);
 
// ✅ Quick route check
router.get("/fetch/:username", authenticate, updateTikTokProfileByUsername);
 
// ✅ Check if user follows Pubbli
router.get("/check-follow", authenticate, checkTikTokFollow);
 
// ✅ Get video insights
// router.post("/video-insights",
//    authenticate,
//     getVideoInsights);
 
export default router;
