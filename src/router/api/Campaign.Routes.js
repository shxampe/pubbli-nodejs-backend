import express from "express";
import {
  createCampaign,
  deleteCampaign,
  getAllCampaign,
  getCampaignById,
  getApprovedCampaigns,
  updateApprovalStatus,
  updateCampaign,
  getCampaignByIdAdmin,
  createUGCCampaign,
  getNewRequestsForCampaign,
  getAcceptedInfluencers,
  getInfluencerPostDetails,
  getAllCampaignsForAdmin,
  getApplicationDetails,
  uploadFinalContent,
  postFinalContent,
  getCampaignSummary,
  rejectApplication,
  rejectCampaignByAdmin,
  getPendingApplicationsForAdvertiser,
  getAdvertiserAppliedApplications,
  updateUserApplicationDeadline,
  approveContentByAdvertiser,
  getAdvertiserCampaigns,
  getInfluencerCampaigns,
  getContentSubmissionForUser,
  getFinalContentByCampaignId,
  getAllFinalContent,
  getInfluencersByCampaignId,
  getAllApplications,
  testAdvertiserData,
  getAdvertiserTodo,
  getCampaignByFilter,
  updateApplicationDeadline,
  cancelApplication,
  submitPostLink,
  approvePostLink,
  updateCampaignStatus,
  getCampaignInsights,
  getRecentCompletedApplications,
  getAdminTodo,
  deleteVideoUrl,
  markJobCompleted,
  getOnlyCampaignById,
} from "../../controllers/Campaign.Controller.js";
import {
  approveApplication,
  getApprovedInfluencerCampaigns,
  rejectContentSubmission,
  requestContentResubmission,
  getContentSubmissionById,
  deleteSpecificContent,
  getAllContentSubmission,
} from "../../controllers/Campign.approveApplication.js";
import {
  applyForCampaign,
  getInfluencerDetailById,
  getInfluencersWhoWorkedOnCampaigns,
  revokeCampaignApplication,
} from "../../controllers/Campign.applyCampaign.js";
import {
  getAdvertiserPayments,
  getInfluencerPayments,
  // releaseInfluencerPayment,
  getCampaignPayments,
} from "../../controllers/Payment.Controller.js";
import {
  submitInfluencerReview,
  getReviewsForInfluencer,
} from "../../controllers/Review.Controller.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { CheckRole } from "../../middleware/checkRoleMiddleware.js";
import upload from "../../middleware/multerConfig.js";

const CampaignRouter = express.Router();

// ✅ Define the expected multipart fields
const campaignUpload = upload.fields([
  { name: "mediaFiles", maxCount: 10 },
  { name: "exampleMedia", maxCount: 10 },
  { name: "campaignCoverImage", maxCount: 10 },
]);

// 🟢 Create campaign with cover image & example files
CampaignRouter.post(
  "/create-campaign",
  campaignUpload,
  authenticate,
  createCampaign
);

CampaignRouter.post(
  "/create-ugc-campaign",
  campaignUpload,
  authenticate,
  createUGCCampaign
);

// 🟢 Update campaign with new files
CampaignRouter.patch(
  "/update-campaign/:id",
  upload.fields([
    { name: "coverImage", maxCount: 1 },
    { name: "exampleMediaFiles", maxCount: 5 },
  ]),
  authenticate,
  updateCampaign
);

// 🟢 Apply for a campaign (upload video)
CampaignRouter.post("/apply", authenticate, applyForCampaign);
CampaignRouter.post("/revoke", authenticate, revokeCampaignApplication);

// ✅ Get all campaigns (admin)
CampaignRouter.get("/get-all-campaign", authenticate, getAllCampaign);

CampaignRouter.get(
  "/advertiser-campaigns",
  authenticate,
  getAdvertiserCampaigns
);
CampaignRouter.get(
  "/influencer-campaigns",
  authenticate,
  getInfluencerCampaigns
);
CampaignRouter.get("/summary", authenticate, getCampaignSummary);

CampaignRouter.post("/approve-application", authenticate, approveApplication);

CampaignRouter.get(
  "/influencer-approved",
  authenticate,
  getApprovedInfluencerCampaigns
);

CampaignRouter.get(
  "/get-application-adv",
  authenticate,
  getInfluencersWhoWorkedOnCampaigns
);

// ✅ Get campaign by id
CampaignRouter.get("/get-campaign/:id", authenticate, getCampaignById);

CampaignRouter.get("/get-campaign-by-filter", getCampaignByFilter);

CampaignRouter.get(
  "/get-influencers-by-campaign/:id",
  authenticate,
  getInfluencersByCampaignId
);

// ✅ Get final content by campaign id
CampaignRouter.get(
  "/get-final-content-by-campaignId/:campaignId",
  authenticate,
  getFinalContentByCampaignId
);

// ✅ Get campaign by id for admin
CampaignRouter.get(
  "/get-campaign-admin/:id",
  authenticate,
  getCampaignByIdAdmin
);

// ✅ Get all approved campaigns
CampaignRouter.get("/approved-campaigns", authenticate, getApprovedCampaigns);

// ✅ Delete campaign
CampaignRouter.delete(
  "/delete-campaign/:id",
  authenticate,
  // CheckRole(["admin", "superadmin"]),
  deleteCampaign
);

// ✅ Update approval status
CampaignRouter.patch(
  "/approval-status/:id",
  authenticate,
  CheckRole(["admin", "superadmin"]),
  updateApprovalStatus
);

CampaignRouter.get("/influencer", authenticate, getInfluencerDetailById);

CampaignRouter.get(
  "/campaigns/:campaignId/new-requests",
  authenticate,
  getNewRequestsForCampaign
);

CampaignRouter.get(
  "/campaigns/:campaignId/accepted-influencers",
  authenticate,
  getAcceptedInfluencers
);

CampaignRouter.get(
  "/campaigns/:campaignId/content-submissions/:userId",
  authenticate,
  CheckRole(["advertiser", "admin"]),
  getContentSubmissionForUser
);
CampaignRouter.get(
  "/payments/advertiser",
  authenticate,
  CheckRole(["advertiser"]),
  getAdvertiserPayments
);

CampaignRouter.get(
  "/payments/campaign/:campaignId",
  authenticate,
  getCampaignPayments
);

CampaignRouter.get(
  "/payments/influencer",
  authenticate,
  CheckRole(["influencer"]),
  getInfluencerPayments
);

CampaignRouter.post(
  "/content/:id/reject",
  authenticate,
  CheckRole(["admin", "advertiser"]),
  rejectContentSubmission
);

CampaignRouter.post(
  "/content/:id/delete-specific",
  authenticate,
  // CheckRole(["admin", "advertiser", "influencer"]),
  deleteSpecificContent
);

CampaignRouter.post(
  "/content/:id/resubmit",
  authenticate,
  requestContentResubmission
);

CampaignRouter.get("/content/:id", authenticate, getContentSubmissionById);

CampaignRouter.get(
  "/campaigns/:campaignId/influencer/:influencerId/post-details",
  // authenticate,
  getInfluencerPostDetails
);

CampaignRouter.get(
  "/get-campaign-insights/:campaignId",
  authenticate,
  getCampaignInsights
);

CampaignRouter.post("/reviews/submit", authenticate, submitInfluencerReview);

CampaignRouter.get(
  "/reviews/influencer/:influencerId",
  authenticate,
  getReviewsForInfluencer
);

CampaignRouter.get("/all-campaigns", authenticate, getAllCampaignsForAdmin);
CampaignRouter.post(
  "/upload-final-content",
  authenticate,
  // upload.single("file"),
  upload.fields([
    { name: "file", maxCount: 10 },
    { name: "exampleMediaFiles", maxCount: 10 },
  ]),
  uploadFinalContent
);
CampaignRouter.post(
  "/approve-content",
  authenticate,
  approveContentByAdvertiser
);

CampaignRouter.post("/post-final-content", authenticate, postFinalContent);

CampaignRouter.get(
  "/applications/:applicationId/details",
  authenticate,
  getApplicationDetails
);

CampaignRouter.get("/get-all-applications", authenticate, getAllApplications);

CampaignRouter.post("/reject-application", authenticate, rejectApplication);

CampaignRouter.post("/reject-campaign", authenticate, rejectCampaignByAdmin);

CampaignRouter.get(
  "/pending-applications",
  authenticate,
  getPendingApplicationsForAdvertiser
);

CampaignRouter.post(
  "/update-application-deadline",
  authenticate,
  updateUserApplicationDeadline
);

CampaignRouter.patch(
  "/update-campaign-deadline",
  authenticate,
  updateApplicationDeadline
);

CampaignRouter.get("/all-final-content/:id", authenticate, getAllFinalContent);

CampaignRouter.get(
  "/advertiser-applied-applications/:id",
  authenticate,
  getAdvertiserAppliedApplications
);

CampaignRouter.get("/test-advertiser-data", testAdvertiserData);

CampaignRouter.get("/advertiser-todo/:id", getAdvertiserTodo);

CampaignRouter.post("/cancel-application", authenticate, cancelApplication);

CampaignRouter.post("/submit-post-link", authenticate, submitPostLink);

CampaignRouter.post("/approve-post-link", authenticate, approvePostLink);

CampaignRouter.patch("/update-status/:id", authenticate, updateCampaignStatus);


CampaignRouter.get(
  "/recent-completed-applications",
  authenticate,
  getRecentCompletedApplications
);

CampaignRouter.get(
  "/admin-todo",
  authenticate, CheckRole(["admin", "superadmin"]),
  getAdminTodo
);

CampaignRouter.delete(
  "/applications/:applicationId/video-urls/:videoUrlId",
  //  authenticate,
  deleteVideoUrl
);

CampaignRouter.get(
  "/all-content/:id",
   authenticate,
  getAllContentSubmission
);

CampaignRouter.post("/mark-job-completed/:id", authenticate, markJobCompleted);

CampaignRouter.get(
  "/get-campaign-by-id/:id",
  authenticate,
  getOnlyCampaignById
);

export default CampaignRouter;