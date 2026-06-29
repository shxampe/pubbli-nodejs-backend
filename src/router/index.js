import { Router } from "express";
import config from "../config/appconfig.js";
import AuthRouter from "./api/Auth.Routes.js";
import UserRouter from "./api/User.Routes.js";
import CampaignRouter from "./api/Campaign.Routes.js";
import instagramRoutes from "./api/instagram.routes.js";
import tiktokRoutes from "./api/TikTok.Routes.js";
import shippingRoutes from "./api/Shipping.Routes.js";
import productRoutes from "./api/productRoutes.js";
import brandRoutes from "./api/brandRoutes.js";
import certificationRoutes from "./api/certificationRoutes.js";
import stripeRoutes from "./api/Stripe.Routes.js";
import walletRoutes from "./api/Wallet.Routes.js";
import notificationRoutes from "./api/Notification.Router.js";
import invitationRoutes from "./api/CampaignInvitation.Routes.js";

const router = Router();
const basePath = config.api.base_path;

router.use(`${basePath}/auth`, AuthRouter);
router.use(`${basePath}/user`, UserRouter);
router.use(`${basePath}/campaign`, CampaignRouter);
router.use(`${basePath}/instagram`, instagramRoutes);
router.use(`${basePath}/tiktok`, tiktokRoutes);
router.use(`${basePath}/shipping`, shippingRoutes);
router.use(`${basePath}/products`, productRoutes);
router.use(`${basePath}/brands`, brandRoutes);
router.use(`${basePath}/certification`, certificationRoutes);
router.use(`${basePath}/stripe`, stripeRoutes);
router.use(`${basePath}/wallet`, walletRoutes);
router.use(`${basePath}/notification`, notificationRoutes);
router.use(`${basePath}/invitations`, invitationRoutes);

export default router;
