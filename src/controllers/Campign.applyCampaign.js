import CampaignApplication from "../models/CampaignApplication.js";
import Campaign from '../models/CampaignModel.js';
import { fetchReviewsForInfluencer } from "../controllers/Review.Controller.js";
import notificationService from "../utils/notificationService.js";
import { logger } from "../utils/logger.js";

export async function applyForCampaign(req, res) {
  try {
    const { campaignId, address } = req.body;

    const userCertificates = req.user.certificates;

    if (!campaignId) {
      logger.error(
        `Missing required fields for campaign application by user: ${req.user._id}`
      );
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required",
      });
    }

    const application = await CampaignApplication.findOne({
      userId: req.user._id,
      campaign: campaignId,
    });
    if (application) {
      return res.status(400).json({
        success: false,
        message: "You have already applied for this campaign",
      });
    }

    const campaign = await Campaign.findById(campaignId).select(
      "campaignStrategy contentRequirements applicationDeadline"
    );
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    // if (campaign.applicationDeadline.start > new Date()) {
    //   return res.status(400).json({
    //     success: false,
    //     message: `You cannot apply before ${campaign.applicationDeadline.start.toDateString()}`,
    //   });
    // } else 
      if (campaign.applicationDeadline.end < new Date()) {
      return res.status(400).json({
        success: false,
        message: `Sorry, Cannot apply as deadline ended at : ${campaign.applicationDeadline.end.toDateString()}`,
      });
    }

    let contentType = campaign.contentRequirements.contentType;
    contentType == "Video"
      ? (contentType = "Video")
      : contentType == "Image"
        ? (contentType = "Selfie")
        : contentType == "Instagram reels"
          ? (contentType = "Instagram")
          : contentType == "Tiktok videos"
            ? (contentType = "Tiktok")
          : contentType == "Youtube shorts"
            ? (contentType = "Youtube shorts")
            : "";

    if (!userCertificates.includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: `You do not have the required certificate "${contentType}" to apply for this campaign`,
      });
    }

    logger.info(`Creating new application for campaign: ${campaignId}`);
    const newApplication = new CampaignApplication({
      userId: req.user._id,
      campaign: campaignId,
      campaignStrategy: campaign.campaignStrategy,
      address: address
        ? {
            type: address.type || "Home",
            country: address.country,
            state: address.state,
            city: address.city,
            zip: address.zip,
            addressLine1: address.addressLine1 || "",
            addressLine2: address.addressLine2 || "",
          }
        : null,
      applicationStatus: "applied",
      contentApprovalStatus: "notsubmitted",
      publishStatus: "notPublish",
      jobTimelineStatus: "applied",
    });

    await newApplication.save();

    const populatedApplication = await CampaignApplication.findById(
      newApplication._id
    )
      .populate("userId", "name email photoUrl")
      .populate("campaign", "campaignName createdBy");

    try {
      await notificationService.createCampaignApplicationNotification(
        populatedApplication
      );
    } catch (notificationError) {
      logger.error(`Notification error: ${notificationError.message}`);
    }

    return res.status(201).json({
      success: true,
      message: "Campaign application submitted successfully",
      data: newApplication,
    });
  } catch (error) {
    logger.error(`Error submitting application: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while applying",
      error: error.message,
    });
  }
}

export async function revokeCampaignApplication(req, res) {
  try {
    const { campaignId } = req.body;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required",
      });
    }

    const application = await CampaignApplication.findOneAndDelete({
      userId: req.user._id,
      campaign: campaignId,
      applicationStatus: "applied",
    });

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "No active application found to revoke",
      });
    }

    res.status(200).json({
      success: true,
      message: "Application revoked and deleted",
      data: application,
    });
  } catch (error) {
    logger.error(`Error revoking application: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Something went wrong while revoking",
      error: error.message,
    });
  }
}

export const getInfluencersWhoWorkedOnCampaigns = async (req, res) => {
  try {
    const advertiserId = req.user._id;
    logger.info(
      `Getting influencers who worked on campaigns for advertiser: ${advertiserId}`
    );

    const campaigns = await Campaign.find({
      createdBy: advertiserId,
      approvalStatus: { $regex: /^approved$/i },
    }).select("_id");

    const campaignIds = campaigns.map((c) => c._id);

    const workedStatuses = [
      /^approved$/i,
      /^completed$/i,
      /^final-submitted$/i,
    ];

    const applications = await CampaignApplication.find({
      campaign: { $in: campaignIds },
      status: { $in: workedStatuses },
    })
      .select("campaign status userId videoUrls")
      .populate("userId", "name email photoUrl followers")
      .populate("campaign", "title thumbnail description");

    const formatted = applications.map((app) => ({
      _id: app._id,
      influencerName: app.userId?.name || "Unknown Influencer",
      influencerImage: app.userId?.photoUrl || "/assets/images/avatar.png",
      email: app.userId?.email || "N/A",
      followers: app.userId?.followers || "N/A",
      status: app.status,
      videoUrls: app.videoUrls || null,

      campaignTitle: app.campaign?.title || "Untitled Campaign",
      campaignThumbnail:
        app.campaign?.thumbnail || "https://placehold.co/60x80",
      campaignDescription:
        app.campaign?.description || "No description available",
    }));

    res.json({
      success: true,
      message: "Influencers who worked on campaigns fetched",
      data: formatted,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export async function getInfluencerDetailById(req, res) {
  // const { id } = req.params;
  const user = req.user;
  const id = user._id;
  try {
    if (!user || user.role !== "influencer") {
      return res.status(404).json({
        success: false,
        message: "Influencer not found",
      });
    }

    const applications = await CampaignApplication.find({
      userId: id,
    }).lean();
    const totalCampaigns = applications.length;

    const reviews = await fetchReviewsForInfluencer(id);

    const averageRating =
      reviews.length > 0
        ? (
            reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
          ).toFixed(1)
        : null;

    const connectedSocials = (user.socials || [])
      .filter((s) => s.connected)
      .map((s) => ({
        platform: s.platform,
        username: s.username,
        profileUrl: s.profileUrl,
        followers: s.followers || 0,
        likes: s.likes || 0,
      }));

    const influencerProfile = {
      name: user.name,
      email: user.email,
      photoUrl: user.photoUrl,
      addresses: user.addresses || [],
      totalCampaigns,
      rating: averageRating,
      reviews,
      socials: connectedSocials,
      paymentStatus: applications.paymentStatus,
    };

    res.status(200).json({
      success: true,
      data: influencerProfile,
    });
  } catch (err) {
    logger.error(`Error fetching influencer details: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}

