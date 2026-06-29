import express from "express";
import {
  postToInstagram,
  getInstagramPostInsights,
  getYoutubePostInsights,
  getTikTokPostInsights
} from "../../controllers/instagram.controller.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
  connectInstagram,
  instagramCallback,
  disconnectInstagram,
  addInstaLink,
  removeYoutubeChannel,
  proxyInstagramImage,
} from "../../controllers/Social.Controller.js";

const router = express.Router();

router.get("/auth/instagram", connectInstagram);

router.post("/add-link", authenticate, addInstaLink);

router.get("/auth/instagram/callback", instagramCallback);

router.post("/post-instagram", authenticate, postToInstagram);

router.post("/reset", authenticate, disconnectInstagram);

router.post("/get-post-insights",
   authenticate, 
   getInstagramPostInsights);

router.post(
  "/get-youtube-insights",
  authenticate,
  getYoutubePostInsights
);

router.post(
  "/get-tiktok-insights",
  authenticate,
  getTikTokPostInsights
);

router.post("/remove-youtube", authenticate, removeYoutubeChannel);

router.get("/proxy", proxyInstagramImage);

// Disconnect Instagram
//router.post("/instagram/disconnect-instagram", authenticate, disconnectInstagram);

export default router;
