import CampaignApplication from "../models/CampaignApplication.js";
import Shipment from "../models/Shipment.js";
import notificationService from "../utils/notificationService.js";
import Transaction from "../models/TransactionModel.js";
import Wallet from "../models/WalletModel.js";
import crypto from "crypto";
import {
  sendApplicationApprovalEmail,
  sendApplicationApprovalConfirmationEmail,
} from "../utils/loopsService.js";
import { chargeDefaultCard } from "./Stripe.Controller.js";
import User from "../models/User.js";
import { logger } from "../utils/logger.js";

export const approveApplication = async (req, res) => {
  
  try {
    const { applicationId, contentDeadline } = req.body;
    const advertiserId = req.user._id.toString();

    const application = await CampaignApplication.findById(applicationId)
      .populate("userId", "name email")
      .populate(
        "campaign",
        "_id campaignName description compensation createdBy product deliveryMethod"
      );

    if (!application) {
      logger.error(`Application not found: ${applicationId}`);
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    if (application.applicationStatus === "approved") {
      return res
        .status(400)
        .json({ success: false, message: "Application already approved" });
    }

    const amountToPay = application.campaign?.compensation?.totalAmount;

    if (!amountToPay || isNaN(amountToPay)) {
      logger.error(`Invalid payment amount: ${amountToPay}`);
      return res.status(400).json({
        success: false,
        message: "Payment amount not set in campaign.",
      });
    }

    const wallet = await Wallet.findOne({
      userId: application.campaign.createdBy,
    });

    if (wallet.available_coins < amountToPay) {
      const user = await User.findById(application.campaign.createdBy);

      const paymentResult = await chargeDefaultCard(
        user?.stripe_customer_id,
        amountToPay
      );
      logger.info(`Payment result: ${paymentResult.status}`);
      if (paymentResult.status === "succeeded") {
        wallet.locked_coins += amountToPay;
        await wallet.save();
      } else {
        return res.status(400).json({
          success: false,
          message: "Payment failed. Unable to process application approval.",
        });
      }
    } else {
      wallet.available_coins -= amountToPay;
      wallet.locked_coins += amountToPay;
      wallet.updatedAt = new Date();

      await wallet.save();
    }

    await Transaction.create({
      userId: application.campaign.createdBy,
      walletId: wallet._id,
      transactionCreatedFor: "advertiser",
      type: "campaign_lock",
      campaignId: application.campaign._id,
      applicationId: application._id,
      amount: amountToPay,
      currency: "coins",
      status: "locked",
      description: "Transaction created for campaign application approval.",
      transactionId: `TXN_${Date.now()}_${crypto
        .randomBytes(4)
        .toString("hex")}`,
    });

    application.applicationStatus = "approved";
    application.jobTimelineStatus = "job_started";
    if (contentDeadline) {
      application.contentDeadline = new Date(contentDeadline);
    }
    await application.save();
    logger.info(`Application approved and saved: ${applicationId}`);

    let shipment = null;

    if (
      application.campaign?.product &&
      application.campaign?.deliveryMethod === "Delivered by me"
    ) {
      try {
        const shipmentPayload = {
          userId: application.userId._id,
          campaignId: application.campaign._id,
          applicationId: application._id,
          status: "pending",
          isManual: true,
          trackingNumber: null,
          trackingUrl: null,
          labelUrl: null,
          carrierSlug: null,
        };

        shipment = await Shipment.create(shipmentPayload);

      } catch (shipmentErr) {
        logger.error(`Shipment creation failed: ${shipmentErr.message}`);
        if (shipmentErr.errors) {
          logger.error(
            `Validation Errors: ${JSON.stringify(shipmentErr.errors)}`
          );
        }
      }
    } 
    try {
      const emailResult = await sendApplicationApprovalEmail(
        application.userId.email,
        application.campaign._id,
        application.contentDeadline
      );

      if (!emailResult.success) {
        logger.error(`Failed to send approval email: ${emailResult.error}`);
      }
    } catch (emailError) {
      logger.error(`Error sending approval email: ${emailError.message}`);
    }

    try {
      const advertiserEmail = req.user.email; // Get advertiser's email from the authenticated user
      const emailResult = await sendApplicationApprovalConfirmationEmail(
        advertiserEmail,
        application.campaign._id
      );

      if (!emailResult.success) {
        logger.error(
          `Failed to send confirmation email to advertiser: ${emailResult.error}`
        );
      }
    } catch (emailError) {
      logger.error(
        `Error sending confirmation email to advertiser: ${emailError.message}`
      );
    }
    try {
      await notificationService.createApplicationStatusNotification(
        application,
        "approved",
        advertiserId
      );
    } catch (notificationError) {
      logger.error(
        `Application approval notification error: ${notificationError.message}`
      );
    }
    res.json({
      success: true,
      message: "Application approved and payment recorded (no escrow)",
      shipment,
    });
  } catch (error) {
    logger.error(`Approve application error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export async function getContentSubmissionById(req, res) {
  try {
    const { id } = req.params;

    const app = await CampaignApplication.findById(id)
      .populate("userId", "name email photoUrl rating socials campaignsCount") // userId will be populated with these fields
      .populate("campaign", "campaignName description")
      .lean();

    if (!app) {
      return res
        .status(404)
        .json({ success: false, message: "Content not found" });
    }

    const user = app.userId;

    const data = {
      contentId: app._id,
      videoUrl: app.videoUrl,
      status: app.status,
      reviewNotes: app.reviewNotes || null,

      contentDetails: {
        type: app.contentType || "N/A",
        videoDuration: app.videoDuration || "N/A",
        format: app.displayFormat || "N/A",
      },

      influencer: {
        id: user._id, // ✅ Added influencer ID here
        name: user.name,
        email: user.email,
        avatar: user.photoUrl || "/assets/avatar.png",
        rating: user.rating || 0,
        campaigns: user.campaignsCount || 0,
        socials: (user.socials || [])
          .filter((s) => s.connected)
          .map((s) => ({
            platform: s.platform,
            username: s.username,
            profileUrl: s.profileUrl,
          })),
      },

      campaign: {
        title: app.campaign?.campaignName,
        description: app.campaign?.description,
      },

      submittedAt: app.createdAt,
    };

    res.status(200).json({ success: true, data });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
}

export const getApprovedInfluencerCampaigns = async (req, res) => {
  try {
    const influencerId = req.user._id;

    const applications = await CampaignApplication.find({
      userId: influencerId,
      // status: "Approved",
    })
      .populate({
        path: "campaign",
        select: [
          "campaignName",
          "coverImage",
          "description",
          "compensation",
          "postingSchedule",
          "campaignType",
          "campaignCategory",
          "contentRequirements",
          "targetAudience",
          "paymentTerms",
          "paymentSchedule",
          "productDetails",
          "campaignStrategy",
          "contentFormat",
          "contentType",
          "videoDuration",
          "displayFormat",
          "contentBrief", // ✅ Creative Guidelines
          "contentAvoid",
          "examples", // ✅ Examples/References
          "preferableRegion",
          "specialRequirements",
          "campaignStatus",
          "applicationDeadline",
          "creatorParameters", // ✅ Creators parameters
        ].join(" "),
      })
      .sort({ createdAt: -1 });

    const mapped = applications.map((app) => ({
      _id: app._id,
      campaign: app.campaign?.campaignName || "Untitled",
      campaignType: app.campaign?.campaignType || "N/A",
      description: app.campaign?.description || "",
      campaignCategory: app.campaign?.campaignCategory || "N/A",
      contentRequirements: app.campaign?.contentRequirements || "N/A",
      targetAudience: app.campaign?.targetAudience || "N/A",
      thumbnail: app.campaign?.coverImage || "/default.png",
      paymentTerms: app.campaign?.paymentTerms || "N/A",
      paymentSchedule: app.campaign?.paymentSchedule || "N/A",
      productDetails: app.campaign?.productDetails || "N/A",
      campaignStrategy: app.campaign?.campaignStrategy || "N/A",
      contentFormat: app.campaign?.contentFormat || "N/A",
      contentType: app.campaign?.contentType || "N/A",
      contentBrief: app.campaign?.contentBrief || "N/A",
      contentAvoid: app.campaign?.contentAvoid || "N/A",
      examples: app.campaign?.examples || "N/A",
      preferableRegion: app.campaign?.preferableRegion || "N/A",
      specialRequirements: app.campaign?.specialRequirements || "N/A",
      videoDuration: app.campaign?.videoDuration || "N/A",
      displayFormat: app.campaign?.displayFormat || "N/A",
      fee: `$ ${app.campaign?.compensation?.totalAmount || 0}`,
      status: app.status,
      approvalStatus: app.approvalStatus,
      applicationDeadline: app.campaign?.postingSchedule?.end,
      postingSchedule: app.campaign?.postingSchedule,
      applicationStatus: app.status,
      applicationDate: app.appliedAt,
      date: new Date(app.appliedAt).toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "2-digit",
      }),
      fullData: app, // pass full object to frontend
    }));

    res.json({
      success: true,
      message: "Approved campaigns fetched successfully",
      data: mapped,
    });
  } catch (error) {
    logger.error(`Error fetching approved campaigns: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

// ❌ REJECT content
export async function rejectContentSubmission(req, res) {
  try {
    logger.info(`Content rejection started for application: ${req.params.id}`);
    const { id } = req.params;
    const { reason } = req.body;
    const advertiserId = req.user._id.toString();

    logger.info(
      `Content rejection request for application: ${id}, reason: ${reason}`
    );

    const app = await CampaignApplication.findById(id)
      .populate("userId", "name email")
      .populate("campaign", "campaignName createdBy");

    if (!app) {
      logger.error(`Application not found for rejection: ${id}`);
      return res.status(404).json({ success: false, message: "Not found" });
    }

    logger.info(
      `Application found for rejection: ${app.userId.name} - ${app.campaign.campaignName}`
    );

    app.contentApprovalStatus = "rejected";
    app.publishStatus = "notPublish";
    app.reviewNotes = reason || "No reason provided";
    app.jobTimelineStatus = "job_started";

    app.videoUrls = app.videoUrls.map((video) => ({
      ...video,
      status: "rejected",
    }));

    await app.save();
    logger.info(`Application updated with rejection: ${id}`);

    // Create notification for influencer
    try {
      await notificationService.createContentStatusNotification(
        app,
        "rejected",
        reason,
        advertiserId
      );
    } catch (notificationError) {
      logger.error(
        `Content rejection notification error: ${notificationError.message}`
      );
      // Don't fail the rejection if notification fails
    }

    logger.info(
      `Content rejection process completed successfully for application: ${id}`
    );

    res.json({ success: true, message: "Content rejected" });
  } catch (err) {
    logger.error(`Error rejecting content: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
}

export async function getAllContentSubmission(req, res) {
  try {
    const { id } = req.params;
    const app = await CampaignApplication.findById(id).select(
      "videoUrls finalVideoUrl jobTimelineStatus contentApprovalStatus reviewNotes postLink"
    );

    if (!app) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }
    res.json({ success: true, data: app });
  } catch (err) {
    logger.error(`Error fetching all content submission: ${err.message}`);
  }
}

// 🗑️ DELETE specific content (individual videos)
export async function deleteSpecificContent(req, res) {
  try {
    const { id } = req.params; // application ID
    const { videoId } = req.body;

    const app = await CampaignApplication.findById(id);
    if (!app) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    let deletedContent = [];

    logger.info(`Deleting specific content - videoId: ${videoId}`);
    logger.info(`Application videoUrls count: ${app.videoUrls?.length || 0}`);

    // Delete specific video if provided
    if (videoId) {
      if (
        app.videoUrls &&
        app.videoUrls.some(
          (video) => video._id.toString() === videoId.toString()
        )
      ) {
        app.videoUrls = app.videoUrls.map((video) =>
          video._id.toString() === videoId.toString()
            ? { ...video, status: "rejected" }
            : video
        );

        deletedContent.push("video");

        if (app.finalVideoUrl === videoId) {
          app.finalVideoUrl = null;
          app.isFinal = false;
        }
      } else {
        logger.error(`Video URL not found in application: ${videoId}`);
        return res.status(400).json({
          success: false,
          message: "Video URL not found in this application",
        });
      }
    }

    // If no content specified to delete
    if (!videoId) {
      return res.status(400).json({
        success: false,
        message: "Please specify videoUrl to delete",
      });
    }

    // Update content approval status if no videos remain
    if (videoId && app.videoUrls.length === 0) {
      app.contentApprovalStatus = "notsubmitted";
      app.jobTimelineStatus = "job_started";
    }

    await app.save();

    res.json({
      success: true,
      message: `Specific ${deletedContent.join(" and ")} deleted successfully`,
      data: {
        applicationId: app._id,
        remainingVideos: app.videoUrls.length,
        contentApprovalStatus: app.contentApprovalStatus,
        finalVideoUrl: app.finalVideoUrl,
      },
    });
  } catch (err) {
    logger.error(`Error deleting specific content: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
}

// 🔁 RESUBMISSION request
export async function requestContentResubmission(req, res) {
  try {

    const { id } = req.params;
    const { reason, videoId } = req.body;
    const advertiserId = req.user._id.toString();

    if (!videoId) {
      return res
        .status(400)
        .json({ success: false, message: "Video URL is required" });
    }

    const app = await CampaignApplication.findById(id)
      .populate("userId", "name email")
      .populate("campaign", "campaignName createdBy");

    if (!app) {
      logger.error(`Application not found for resubmission: ${id}`);
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    logger.info(
      `Application found for resubmission: ${app.userId.name} - ${app.campaign.campaignName}`
    );

    app.contentApprovalStatus = "resubmission";
    app.publishStatus = "notPublish";
    app.reviewNotes = reason || "No reason provided";
    app.jobTimelineStatus = "resubmission";

    app.videoUrls = app.videoUrls.map((video) =>
      video._id.toString() === videoId.toString()
        ? { ...video, status: "resubmission" }
        : video
    );

    await app.save();
    logger.info(`Application updated with resubmission request: ${id}`);

    // Create notification for influencer
    try {
      await notificationService.createContentResubmissionNotification(
        app,
        reason,
        advertiserId
      );
    } catch (notificationError) {
      logger.error(
        `Content resubmission notification error: ${notificationError.message}`
      );
      // Don't fail the resubmission if notification fails
    }

    logger.info(
      `Content resubmission request process completed successfully for application: ${id}`
    );

    res.json({ success: true, message: "Content resubmission requested" });
  } catch (err) {
    logger.error(`Error requesting resubmission: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
}
