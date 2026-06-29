import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
  sendInvitation,
  acceptInvitation,
  declineInvitation,
  listInfluencerInvitations,
  listAdvertiserInvitations,
} from "../../controllers/CampaignInvitation.Controller.js";

const router = express.Router();

router.post(
  "/campaigns/:campaignId/invite",
  authenticate,
  sendInvitation
);

router.get(
  "/sent",
  authenticate,
  listAdvertiserInvitations
);

router.get(
  "/received",
  authenticate,
  listInfluencerInvitations
);

router.post(
  "/:invitationId/accept",
  authenticate,
  acceptInvitation
);

router.post(
  "/:invitationId/decline",
  authenticate,
  declineInvitation
);

export default router; 