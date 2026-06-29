import Campaign from "../models/CampaignModel.js";
import { deleteFileFromS3, uploadFileToS3 } from "../utils/s3Config.js";
import campaignValidation from "../validations/CampaignValidation.js";
import Product from "../models/ProductModel.js";
import CampaignApplication from "../models/CampaignApplication.js";
import UserCertification from "../models/UserCertificationModel.js";
import { fetchReviewsForInfluencer } from "./Review.Controller.js";
import User from "../models/User.js";
import InfluencerReview from "../models/InfluencerReview.js";
import Shipment from "../models/Shipment.js";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import Wallet from "../models/WalletModel.js";
import Transaction from "../models/TransactionModel.js";
import notificationService from "../utils/notificationService.js";
import crypto from "crypto";
import {
  sendCampaignRejectionEmail,
  sendCampaignCreationEmail,
  sendCampaignApprovalEmail,
  sendContentApprovalEmail,
  sendContentSubmissionEmail,
  sendContentResubmissionEmail,
} from "../utils/loopsService.js";
import { logger } from "../utils/logger.js";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;

export async function createCampaign(req, res) {
  try {
    // const user = await User.findById(req.user.id);
    // if (!user?.escrow?.connected) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Advertiser escrow account is not connected.",
    //   });
    // }

    const campaignData = {
      campaignStrategy: req.body.campaignStrategy,
      campaignType: req.body.campaignType,
      campaignName: req.body.campaignName,
      description: req.body.description,
      product:
        req.body.product && req.body.product !== "null"
          ? req.body.product
          : undefined,

      contentRequirements: {
        platform: req.body.platform?.split(",").map((f) => f.trim()) || [],
        contentFormat: req.body.contentFormat,
        contentType: req.body.contentType,
        videoDuration: req.body.videoDuration,
        displayFormat: req.body.displayFormat,
        contentBrief: req.body.contentBrief,
        contentAvoid: req.body.contentAvoid,
        examples: {
          urls: req.body.exampleUrls?.split(",").map((url) => url.trim()) || [],
          mediaFiles: [],
        },
      },

      creatorParameters: {
        preferableRegion: {
          country: req.body.preferableCountry || "Any",
          state: req.body.preferableState || "Any",
          city: req.body.preferableCity || "Any",
        },
        gender: req.body.creatorGender || "Any",
        age: req.body.creatorAges,
        ethnicity:
          req.body.creatorEthnicities?.split(",").map((e) => e.trim()) || [],
        specialRequirements:
          req.body.specialRequirements?.split(",").map((r) => r.trim()) || [],
      },

      targetAudience: {
        country: req.body.targetCountry || "Any",
        state: req.body.targetState || "Any",
        city: req.body.targetCity || "Any",
        gender: req.body.targetGender || "Any",
        age: req.body.targetAges,
      },

      compensation: {
        model:
          req.body.compensationModel ||
          "Fixed fee for influencers per post or story",
        amount: req.body.compensationAmount
          ? Number(req.body.compensationAmount)
          : 0,
      },

      applicationDeadline: {
        start: req.body.applicationStart
          ? new Date(req.body.applicationStart)
          : new Date(),
        end: req.body.applicationEnd
          ? new Date(req.body.applicationEnd)
          : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },

      postingSchedule: {
        start: req.body.postingStart
          ? new Date(req.body.postingStart)
          : new Date(),
        end: req.body.postingEnd
          ? new Date(req.body.postingEnd)
          : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },

      status: req.body.status || "Draft",
      createdBy: req.user.id,
    };

    const { error } = campaignValidation(campaignData);
    if (error) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",
        errors: error.details.map((err) => err.message),
      });
    }

    if (req.files && req.files.coverImage && req.files.coverImage.length > 0) {
      const imageUrl = await uploadFileToS3(
        "campaign_cover",
        req.files.coverImage[0]
      );
      campaignData.coverImage = imageUrl;
    }

    if (req.files && req.files.exampleMediaFiles) {
      const mediaFiles = Array.isArray(req.files.exampleMediaFiles)
        ? req.files.exampleMediaFiles
        : [req.files.exampleMediaFiles];

      const mediaFileUrls = await Promise.all(
        mediaFiles.map((file) => uploadFileToS3("campaign_examples", file))
      );

      campaignData.contentRequirements.examples.mediaFiles = mediaFileUrls;
    }

    const campaign = new Campaign(campaignData);
    await campaign.save();

    res.status(201).json({
      success: true,
      message: "Campaign created successfully",
      data: campaign,
    });
  } catch (error) {
    logger.error(`Error creating campaign: ${error}`);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create campaign",
      error: error.errors || {},
    });
  }
}

export async function getAllCampaign(req, res) {
  try {
    let {
      page = 1,
      limit = 10,
      status,
      campaignStrategy,
      startDate,
      endDate,
      userId,
    } = req.query;

    // If not explicitly passed, fallback to authenticated user
    userId = userId || req.user?.id;
    const userRole = req.user?.role || req.query?.role; // 'advertiser' or 'influencer'

    let filter = {};

    // Filter by status or strategy
    if (status) filter.status = status;
    if (campaignStrategy) filter.campaignStrategy = campaignStrategy;

    // Filter by date range
    if (startDate || endDate) {
      filter.applicationDeadline = {};
      if (startDate)
        filter.applicationDeadline.start = { $gte: new Date(startDate) };
      if (endDate) filter.applicationDeadline.end = { $lte: new Date(endDate) };
    }

    if (userId) {
      if (userRole === "advertiser") {
        // ✅ Fetch campaigns created by advertiser
        filter.createdBy = userId;
      } else if (userRole === "influencer") {
        // ✅ Fetch campaigns where influencer has applied
        const userApplications = await CampaignApplication.find({
          userId,
        }).select("campaign");
        const campaignIds = userApplications.map((app) => app.campaign);
        filter._id = { $in: campaignIds };
      }
    }

    // Fetch campaigns with filters
    const campaigns = await Campaign.find(filter)
      .populate("createdBy", "name email photoUrl")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Campaign.countDocuments(filter);

    // Fetch applications per campaign
    const campaignsWithApplications = await Promise.all(
      campaigns.map(async (campaign) => {
        const appFilter = { campaign: campaign._id };
        if (userRole === "influencer") {
          appFilter.userId = userId;
        }

        const applications = await CampaignApplication.find(appFilter)
          .populate("userId", "name email profilePic")
          .sort({ createdAt: -1 });

        return {
          ...campaign.toObject(),
          applications,
        };
      })
    );

    res.status(200).json({
      success: true,
      data: campaignsWithApplications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Error fetching campaigns: ${error}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns",
      error: error.message,
    });
  }
}

export async function getInfluencerCampaigns(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      contentCategory,
      contentType
    } = req.query;

    const userId = req.user.id;        

    if (req.user.role !== "influencer") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const userApplications = await CampaignApplication.find({ userId }).select(
      "campaign"
    );
    const appliedCampaignIds = userApplications.map((app) =>
      app.campaign.toString()
    );

    const categories = contentCategory?.split(",").map((cat) => cat.trim());    
    const types = contentType?.split(",").map((ct) => ct.trim());

    const filter = {
      _id: { $nin: appliedCampaignIds },
      approvalStatus: "approved", 
      campaignStatus: "active",
      "applicationDeadline.end" : { $gte: new Date() },
    };

    if (contentCategory) filter["contentRequirements.contentCategory"] = { $in : categories}
    if (contentType) filter["contentRequirements.contentType"] = { $in : types}
    
    const campaigns = await Campaign.find(filter)
      .populate("createdBy", "name email photoUrl")
      .populate({
        path: "product",
        populate: {
          path: "brandId",
          model: "Brand",
          select: "brandName",
        },
      })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Campaign.countDocuments(filter);

    res.status(200).json({
      success: true,
      data: campaigns,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error(`Influencer campaign fetch error: ${err}`);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
}

// export async function getAdvertiserCampaigns(req, res) {
//   try {
//     const {
//       page = 1,
//       limit = 10,
//       status,
//       campaignStrategy,
//       startDate,
//       endDate,
//     } = req.query;

//     const userId = req.user.id;

//     if (req.user.role !== "advertiser") {
//       return res.status(403).json({ success: false, message: "Unauthorized" });
//     }

//     const filter = { createdBy: userId };

//     if (status) filter.status = status;
//     if (campaignStrategy) filter.campaignStrategy = campaignStrategy;
//     if (startDate || endDate) {
//       filter.applicationDeadline = {};
//       if (startDate) filter.applicationDeadline.start = { $gte: new Date(startDate) };
//       if (endDate) filter.applicationDeadline.end = { $lte: new Date(endDate) };
//     }

//     const campaigns = await Campaign.find(filter)
//       .populate("createdBy", "name email photoUrl")
//       .skip((page - 1) * limit)
//       .limit(parseInt(limit))
//       .sort({ createdAt: -1 });

//     const total = await Campaign.countDocuments(filter);

//     const campaignsWithApplications = await Promise.all(
//       campaigns.map(async (campaign) => {
//         const applications = await CampaignApplication.find({ campaign: campaign._id })
//           .populate("userId", "name email profilePic")
//           .sort({ createdAt: -1 });

//         return {
//           ...campaign.toObject(),
//           applications,
//         };
//       })
//     );

//     res.status(200).json({
//       success: true,
//       data: campaignsWithApplications,
//       pagination: {
//         total,
//         page: parseInt(page),
//         limit: parseInt(limit),
//         pages: Math.ceil(total / limit),
//       },
//     });
//   } catch (err) {
//     console.error("Advertiser campaign fetch error:", err);
//     res.status(500).json({ success: false, message: "Server error", error: err.message });
//   }
// }

export async function getAdvertiserCampaigns(req, res) {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      campaignStrategy,
      startDate,
      endDate,
    } = req.query;

    // const userId = req.query.id;
    const userId = req.user.id;

    if (req.user.role !== "advertiser") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const filter = { createdBy: userId };

    if (status) filter.status = status;
    if (campaignStrategy) filter.campaignStrategy = campaignStrategy;
    if (startDate || endDate) {
      filter.applicationDeadline = {};
      if (startDate)
        filter.applicationDeadline.start = { $gte: new Date(startDate) };
      if (endDate) filter.applicationDeadline.end = { $lte: new Date(endDate) };
    }

    const campaigns = await Campaign.find(filter, {
      contentRequirements: 1,
      compensation: 1,
      applicationDeadline: 1,
      campaignStrategy: 1,
      campaignName: 1,
      coverImage: 1,
      campaignTypeCategory: 1,
      campaignStatus: 1,
      approvalStatus: 1,
    })
      .populate({
        path: "product",
        select: "_id brandId name image",
        populate: {
          path: "brandId",
          model: "Brand",
          select: "_id brandName logoUrl",
        },
      })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Campaign.countDocuments(filter);

    const campaignsWithApplications = await Promise.all(
      campaigns.map(async (campaign) => {
        const applications = await CampaignApplication.find(
          {
            campaign: campaign._id,
          },
          {
            applicationStatus: 1,
            contentApprovalStatus: 1,
            publishStatus: 1,
            jobTimelineStatus: 1,
          }
        ).sort({ createdAt: -1 });

        // Get shipment details for this campaign (if it has a product)
        const shipmentDetails = campaign.product
          ? await Shipment.find(
              {
                campaignId: campaign._id,
              },
              { status: 1, trackingNumber: 1 }
            )
          : [];

        // Enrich each shipment with product name, userId, influencerName
        const enrichedShipments = shipmentDetails.map((shipment) => {
          const app = applications.find(
            (a) => a._id.toString() === shipment.applicationId?.toString()
          );
          const user = app?.userId;

          return {
            ...shipment.toObject(),
            // productName: campaign.product?.name || null,
            // image: campaign.product?.image || null,
            userId: user?._id || shipment.userId,
            influencerName: user?.name || null,
          };
        });

        return {
          ...campaign.toObject(),
          applications,
          shipments: enrichedShipments, // Add shipment details to each campaign
        };
      })
    );

    res.status(200).json({
      success: true,
      data: campaignsWithApplications,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    logger.error(`Advertiser campaign fetch error: ${err}`);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
}

export async function getCampaignById(req, res) {
  try {
    const campaignId = req.params.id;
    // const requestingUserId = req.user._id;
    const { status, applicationId, userId } = req.query;

    const campaign = await Campaign.findOne({ _id: campaignId })
      .populate({
        path: "product",
        populate: {
          path: "brandId",
          model: "Brand",
          select: "brandName",
        },
      })
      .populate("createdBy", "name email platform photoUrl");

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: "Campaign not found" });
    }

    let applications = [];

    if (applicationId) {
      const singleApp = await CampaignApplication.findOne({
        _id: applicationId,
        campaign: campaign._id,
        ...(userId && { userId }),
      }).populate("userId");

      if (!singleApp) {
        return res
          .status(404)
          .json({ success: false, message: "Application not found" });
      }

      applications = [singleApp];
    } else {
      const applicationQuery = { campaign: campaign._id };
      if (status) applicationQuery.applicationStatus = status;
      if (userId) applicationQuery.userId = userId;

      applications =
        await CampaignApplication.find(applicationQuery).populate("userId");
    }

    let matchingApplicationId;
    if(!applicationId) {
    const matchingApplication = applications.find(app => app.campaign.toString() === campaignId);
    matchingApplicationId = matchingApplication ? matchingApplication._id.toString() : null;
    } else {
      matchingApplicationId = applicationId;
    }

    const shipmentDetails = campaign.product
      ? await Shipment.find({
          applicationId: { $in: applications.map((app) => app._id) },
          ...(userId && { userId }),
        })
      : [];

    const mappedApplications = await Promise.all(
      applications.map(async (application) => {
        const user = application.userId;
        if (!user) return null;

        const reviews = await InfluencerReview.find({
          influencerId: user._id,
        }).populate("campaignId", "campaignName");

        const averageRating = reviews.length
          ? (
              reviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
              reviews.length
            ).toFixed(1)
          : null;

        const completedCampaignsCount =
          await CampaignApplication.countDocuments({
            userId: user._id,
            applicationStatus: "approved",
            campaignStatus: "completed",
          });

        const shipment =
          shipmentDetails.find(
            (s) =>
              s.userId.toString() === user._id.toString() &&
              s.applicationId?.toString() === application._id.toString()
          ) || {};

          const matchingReview = reviews.find(r => r?.applicationId?.toString() === matchingApplicationId ) || null;

        return {
          _id: application._id,
          influencer: {
            _id: user._id,
            name: user.name,
            username: user.username,
            email: user.email,
            bio: user.bio,
            photoUrl: user.photoUrl,
            addresses: application.address || "",
            referenceContent: user.referenceContent || [],
            followersCount: user.followersCount,
            engagementRate: user.engagementRate,
            rating: averageRating,
            completedCampaigns: completedCampaignsCount,
            instagramConnected: user.instagram?.connected || false,
            instagramProfile: {
              connected: user.instagram?.connected || false,
              username: user.instagram?.profile_name || null,
              profileUrl: user.instagram?.profile_picture || null,
              followersCount: user.instagram?.profile_followers || 0,
              engagementRate: user.instagram?.profile_posts || 0,
            },
            tiktokConnected: user.tiktok?.connected || false,
            tiktokProfile: {
              displayName: user.tiktok?.display_name || null,
              avatarUrl: user.tiktok?.avatar_url || null,
              bio: user.tiktok?.bio_description || null,
              profileUrl: user.tiktok?.profile_deep_link || null,
              followerCount: user.tiktok?.follower_count || 0,
              likesCount: user.tiktok?.likes_count || 0,
              videoCount: user.tiktok?.video_count || 0,
            },
            reviews: reviews.map((r) => ({
              rating: r.rating,
              comment: r.comment,
              reviewer: r.reviewerName,
              campaignName: r.campaignId?.campaignName || "",
              date: r.createdAt,
            })),
            review : matchingReview,
          },
          campaign: campaign.campaignName || "Untitled",
          campaignType: campaign.campaignType || "N/A",
          description: campaign.description || "",
          campaignCategory: campaign.campaignCategory || "N/A",
          contentRequirements: campaign.contentRequirements || "N/A",
          targetAudience: campaign.targetAudience || "N/A",
          thumbnail: campaign.coverImage || "/default.png",
          paymentTerms: campaign.paymentTerms || "N/A",
          paymentSchedule: campaign.paymentSchedule || "N/A",
          productDetails: campaign.productDetails || "N/A",
          campaignStrategy: campaign.campaignStrategy || "N/A",
          contentFormat: campaign.contentFormat || "N/A",
          contentType: campaign.contentType || "N/A",
          contentBrief: campaign.contentBrief || "N/A",
          contentAvoid: campaign.contentAvoid || "N/A",
          examples: campaign.examples || "N/A",
          preferableRegion: campaign.preferableRegion || "N/A",
          specialRequirements: campaign.specialRequirements || "N/A",
          videoDuration: campaign.videoDuration || "N/A",
          displayFormat: campaign.displayFormat || "N/A",
          fee: `$ ${campaign?.compensation?.amount || 0}`,
          compensation: campaign.compensation || {},
          status: application.applicationStatus,
          approvalStatus: application.approvalStatus,
          contentDeadline: application.contentDeadline || null,
          applicationDeadline: campaign?.postingSchedule?.end,
          postingSchedule: campaign.postingSchedule,
          applicationDate: application.appliedAt,
          jobTimelineStatus: application.jobTimelineStatus,
          shipmentStatus: shipment.status,
          trackingNumber: shipment.trackingNumber,
          carrierSlug: shipment.carrierSlug,
          trackingUrl: shipment.trackingUrl,
          labelUrl: shipment.labelUrl,
          contentUploaded: application.contentShared,
          videoUrls: application.videoUrls || [],
          exampleMediaUrls: application.exampleMediaUrls || [],
          date: new Date(application.appliedAt).toLocaleDateString("en-US", {
            day: "numeric",
            month: "short",
            year: "2-digit",
          }),
          fullData: application,
        };
      })
    );

    const filteredApplications = mappedApplications.filter(
      (app) => app !== null
    );

    // ✅ Enrich each shipment with product name, userId, influencerName
    const enrichedShipments = shipmentDetails.map((shipment) => {
      const app = applications.find(
        (a) => a._id.toString() === shipment.applicationId?.toString()
      );
      const user = app?.userId;

      return {
        ...shipment.toObject(),
        productName: campaign.product?.name || null,
        image: campaign.product?.image || null,
        userId: user?._id || shipment.userId,
        influencerName: user?.name || null,
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        campaign,
        applications: filteredApplications,
        shipments: enrichedShipments,
        brands: campaign.product?.brandId
          ? {
              _id: campaign.product.brandId._id,
              brandName: campaign.product.brandId.brandName,
            }
          : null,
      },
    });
  } catch (error) {
    logger.error(`Error fetching campaign: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaign",
      error: error.message,
    });
  }
}


export async function getOnlyCampaignById(req, res) {
  try {
    const campaignId = req.params.id;
    const requestingUserId = req.user._id;

    const campaign = await Campaign.findOne({ _id: campaignId })
      .populate({
        path: "product",
        populate: {
          path: "brandId",
          model: "Brand",
          select: "brandName logoUrl",
        },
      })
      .populate("createdBy", "name email photoUrl");

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: "Campaign not found" });
    }

    const hasApplied = await CampaignApplication.exists({
      campaign: campaignId,
      userId: requestingUserId,
    });

    return res.status(200).json({
      success: true,
      data: {
        campaign,
        brands: campaign.product?.brandId
          ? {
              _id: campaign.product.brandId._id,
              brandName: campaign.product.brandId.brandName,
            }
          : null,
      },
      hasApplied: !!hasApplied,
    });
  } catch (error) {
    logger.error(`Error fetching campaign: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaign",
      error: error.message,
    });
  }
}

export const getCampaignInsights = async (req, res) => {
  const campaignId = req.params.campaignId;
  const campaign = await CampaignApplication.find({
    campaign: campaignId,
  }).select("postInsights");
  if (!campaign) {
    return res.status(404).json({
      success: false,
      message: "Campaign not found",
    });
  }
  const insights = campaign.map((app) => app.postInsights);
  const totalLikes = insights.reduce(
    (acc, curr) => acc + curr.metrics.likes,
    0
  );
  const totalComments = insights.reduce(
    (acc, curr) => acc + curr.metrics.comments,
    0
  );
  const totalShares = insights.reduce(
    (acc, curr) => acc + curr.metrics.shares,
    0
  );
  const totalViews = insights.reduce(
    (acc, curr) => acc + curr.metrics.views,
    0
  );
  const totalSaved = insights.reduce(
    (acc, curr) => acc + curr.metrics.saved,
    0
  );
  const totalReach = insights.reduce(
    (acc, curr) => acc + curr.metrics.reach,
    0
  );
  const totalIgReelsAvgWatchTime = insights.reduce(
    (acc, curr) => acc + curr.metrics.ig_reels_avg_watch_time,
    0
  );
  return res.status(200).json({
    success: true,
    data: insights,
    totalLikes,
    totalComments,
    totalShares,
    totalViews,
    totalSaved,
    totalReach,
    totalIgReelsAvgWatchTime,
  });
};

export const getInfluencersByCampaignId = async (req, res) => {
  try {
    const campaignId = req.params.id;
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    const applications = await CampaignApplication.find({
      campaign: campaignId,
      applicationStatus: { $ne: "rejected" },
    }).populate(
        "userId",
        "name email bio photoUrl referenceContent rating instagram tiktok youtube createdAt"
      )
      .populate(
        "campaign",
        "campaignName description contentRequirements compensation applicationDeadline postingSchedule"
      );
      
    const reviews = await InfluencerReview.find({
      influencerId: { $in: applications.map((app) => app.userId) },
    }).select("influencerId rating");    

    const formattedApplications = applications.map((app) => ({
      _id: app._id,
      influencer: {
        _id: app.userId._id,
        name: app.userId.name,
        email: app.userId.email,
        bio: app.userId.bio,
        photoUrl: app.userId.photoUrl,
        referenceContent: app.userId.referenceContent,
        rating: app.userId.rating,
        addresses: app.address,
        instagram: app.userId.instagram,
        tiktok: app.userId.tiktok,
        youtube: app.userId.youtube,
        createdAt: app.userId.createdAt,
        reviews: reviews.filter((r) => r.influencerId.toString() === app.userId._id.toString())      
      },
      campaign: app.campaign?.campaignName || "N/A",
      description: app.campaign?.description || "N/A",
      campaignStrategy: campaign.campaignStrategy || "N/A",
      status: app.applicationStatus,
      applicationDate: app.createdAt,
      applicationDeadline: app.contentDeadline,
      jobTimelineStatus: app.jobTimelineStatus,
      contentUploaded: app.videoUrls && app.videoUrls.length > 0,
      videoUrls: app.videoUrls || [],
    }));

    return res.status(200).json({
      success: true,
      message: "Influencers fetched successfully",
      applications: formattedApplications,
    });
  } catch (error) {
    logger.error(`Error fetching influencers by campaign ID: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch influencers by campaign ID",
      error: error.message,
    });
  }
};

export const getFinalContentByCampaignId = async (req, res) => {
  try {
    const campaignId = req.params.campaignId;

    if (!campaignId) {
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required",
      });
    }

    // Find all applications for the campaign that have finalVideoUrl
    const applications = await CampaignApplication.find({
      campaign: campaignId,
      finalVideoUrl: { $exists: true, $nin: [null, ""] },
    }).select("finalVideoUrl -_id"); // Only select finalVideoUrl field and explicitly exclude _id
    logger.info(`Applications:`, applications);

    return res.status(200).json({
      success: true,
      message: "Final content retrieved successfully",
      finalVideoUrl: applications
        .map((app) => app.finalVideoUrl)
        .filter((url) => url !== null && url !== ""),
    });
  } catch (error) {
    logger.error(`Error fetching final content: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch final content",
      error: error.message,
    });
  }
};

export async function getApprovedCampaigns(req, res) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token)
      return res.status(401).json({ success: false, message: "Token missing" });

    const decoded = jwt.verify(token, JWT_SECRET);
    const userId = decoded.userId;

    // ✅ Fetch campaign IDs this user has applied to
    const applied = await CampaignApplication.find({ userId }).select(
      "campaign"
    );
    const appliedIds = applied.map((a) => a.campaign.toString());

    // ✅ Return only approved campaigns that this user hasn't applied to
    const campaigns = await Campaign.find({
      approvalStatus: "approved",
      campaignStatus: "active",
      _id: { $nin: appliedIds },
    }).populate("product");

    res.status(200).json({ success: true, data: campaigns });
  } catch (err) {
    logger.error(`Error fetching approved campaigns: ${err}`);
    res
      .status(500)
      .json({ success: false, message: "Internal error", error: err.message });
  }
}

export async function getCampaignByIdAdmin(req, res) {
  try {
    const campaign = await Campaign.findOne({
      _id: req.params.id,
    })
      .populate("product")
      .populate("createdBy", "name email photoUrl");

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    res.status(200).json({
      success: true,
      data: campaign,
    });
  } catch (error) {
    logger.error(`Error fetching campaign: ${error}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaign",
      error: error.message,
    });
  }
}

export async function deleteCampaign(req, res) {
  try {
    const campaignId = req.params.id;
    const { remarks } = req.body;
    const adminId = req.user._id.toString();

    const campaign = await Campaign.findOne({ _id: campaignId }).populate(
      "createdBy",
      "name email"
    );

    if (!campaign) {
      logger.error(`Campaign not found: ${campaignId}`);
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    // ✅ Delete cover image from S3 if it exists
    if (campaign.coverImage) {
      await deleteFileFromS3(campaign.coverImage);
      logger.info("Cover image deleted from S3");
    }

    // Create notification for advertiser BEFORE deleting campaign
    try {
      await notificationService.createCampaignDeletionNotification(
        campaign,
        remarks,
        adminId
      );
      logger.info("Campaign deletion notification sent successfully!");
    } catch (notificationError) {
      logger.error(
        `Campaign deletion notification error: ${notificationError}`
      );
      // Don't fail the deletion if notification fails
    }

    await Campaign.findByIdAndDelete(campaignId);

    logger.info("Campaign deletion process completed successfully!");

    res.status(200).json({
      success: true,
      message: "Campaign deleted successfully",
      remarks, // ✅ included in response if needed
    });
  } catch (error) {
    logger.error(`Error deleting campaign: ${error}`);
    res.status(500).json({
      success: false,
      message: "Failed to delete campaign",
      error: error.message,
    });
  }
}

// src/controllers/Campaign.Controller.js
export async function updateApprovalStatus(req, res) {
  try {
    const campaignId = req.params.id;
    const { approvalStatus } = req.body;
    const adminId = req.user._id.toString(); // Convert to string

    // Define campaignStatus based on approvalStatus
    let campaignStatus;
    if (approvalStatus === "approved") {
      campaignStatus = "active";
    } else if (approvalStatus === "rejected") {
      campaignStatus = "rejected";
    } else {
      logger.error(`Invalid approval status: ${approvalStatus}`);
      return res.status(400).json({
        success: false,
        message: "Invalid approval status. Must be 'approved' or 'rejected'.",
      });
    }

    const campaign = await Campaign.findByIdAndUpdate(
      campaignId,
      {
        approvalStatus,
        campaignStatus,
      },
      { new: true }
    ).populate("createdBy", "name email");

    if (!campaign) {
      logger.error(`Campaign not found: ${campaignId}`);
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    logger.info(`Campaign updated successfully: ${campaign.campaignName}`);

    // Create notification for the advertiser
    try {
      await notificationService.createCampaignApprovalNotification(
        campaign,
        approvalStatus,
        adminId
      );
      logger.info("Campaign approval notification sent successfully!");
    } catch (notificationError) {
      logger.error(
        `Campaign approval notification error: ${notificationError}`
      );
      // Don't fail the approval if notification fails
    }

    // Send campaign approval/rejection email to advertiser
    try {
      const advertiserEmail = campaign.createdBy.email;
      let emailResult;

      if (approvalStatus === "approved") {
        // Get product data if available
        let productData = null;
        if (campaign.product) {
          const product = await Product.findById(campaign.product);
          productData = product;
        }

        emailResult = await sendCampaignApprovalEmail(
          advertiserEmail,
          campaign,
          productData
        );
      } else if (approvalStatus === "rejected") {
        emailResult = await sendCampaignRejectionEmail(
          advertiserEmail,
          campaign,
          "Rejected by admin"
        );
      }

      if (emailResult && !emailResult.success) {
        logger.error(
          `Failed to send campaign approval email: ${emailResult.error}`
        );
      } else if (emailResult) {
        logger.info("Campaign approval email sent successfully to advertiser");
      }
    } catch (emailError) {
      logger.error(`Error sending campaign approval email: ${emailError}`);
      // Don't fail the approval if email fails
    }

    logger.info("Campaign approval process completed successfully!");

    res.status(200).json({
      success: true,
      message: `Campaign ${approvalStatus} and status set to ${campaignStatus}`,
      data: campaign,
    });
  } catch (error) {
    logger.error(`Error updating approval status: ${error}`);
    res.status(500).json({
      success: false,
      message: "Failed to update approval status",
      error: error.message,
    });
  }
}

export const rejectApplication = async (req, res) => {
  try {
    const { applicationId, reason } = req.body;
    const advertiserId = req.user._id.toString(); // Convert to string

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required",
      });
    }

    const application = await CampaignApplication.findById(applicationId)
      .populate("userId", "name email")
      .populate("campaign", "campaignName createdBy");

    if (!application) {
      logger.error(`Application not found: ${applicationId}`);
      return res.status(404).json({
        success: false,
        message: "Campaign application not found",
      });
    }

    // If already rejected, prevent redundant updates
    if (application.applicationStatus === "rejected") {
      logger.error(`Application already rejected: ${applicationId}`);
      return res.status(400).json({
        success: false,
        message: "Application is already rejected",
      });
    }

    application.applicationStatus = "rejected";
    application.contentApprovalStatus = "rejected";
    application.publishStatus = "notPublish";
    application.reviewNotes = reason || "Rejected by advertiser";

    await application.save();
    logger.info(`Application rejected and saved: ${applicationId}`);

    // Send notification to the influencer
    try {
      await notificationService.createApplicationStatusNotification(
        application,
        "rejected",
        advertiserId
      );
      logger.info("Application rejection notification sent successfully!");
    } catch (notificationError) {
      logger.error(
        `Application rejection notification error: ${notificationError}`
      );
      // Don't fail the rejection if notification fails
    }

    logger.info("Application rejection process completed successfully!");

    res.status(200).json({
      success: true,
      message: "Application rejected successfully",
      data: application,
    });
  } catch (error) {
    logger.error(`Error rejecting application: ${error}`);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const cancelApplication = async (req, res) => {
  try {
    const { applicationId, reason } = req.body;
    const advertiserId = req.user._id.toString(); // Convert to string

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required",
      });
    }

    const application = await CampaignApplication.findById(applicationId)
      .populate("userId", "name email")
      .populate("campaign", "campaignName compensation");

    if (!application) {
      logger.error(`Application not found: ${applicationId}`);
      return res.status(404).json({
        success: false,
        message: "Campaign application not found",
      });
    }

    // If already rejected, prevent redundant updates
    if (application.applicationStatus === "rejected") {
      logger.error(`Application already rejected: ${applicationId}`);
      return res.status(400).json({
        success: false,
        message: "Application is already rejected",
      });
    }

    await Transaction.findOneAndUpdate(
      {
        applicantId: applicationId,
        amount: application.campaign.compensation.reimbursementAmount,
      },
      {
        $set: {
          type: "campaign_refund",
          status: "refund",
          description: "Application rejected.",
        },
      }
    );

    const amount = application.campaign.compensation.reimbursementAmount;
    const advWallet = await Wallet.findOne({ userId: advertiserId });
    advWallet.locked_coins -= amount;
    advWallet.available_coins += amount;
    await advWallet.save();

    application.applicationStatus = "rejected";
    application.contentApprovalStatus = "rejected";
    application.publishStatus = "notPublish";
    application.reviewNotes = reason || "Rejected by advertiser";
    application.jobTimelineStatus = "job_cancelled";

    await application.save();
    logger.info(`Application rejected and saved: ${applicationId}`);

    // Send notification to the influencer
    try {
      await notificationService.createApplicationStatusNotification(
        application,
        "rejected",
        advertiserId
      );
      logger.info("Application rejection notification sent successfully!");
    } catch (notificationError) {
      logger.error(
        `Application rejection notification error: ${notificationError}`
      );
    }

    res.status(200).json({
      success: true,
      message: "Application rejected successfully",
      data: application,
    });
  } catch (error) {
    logger.error(`Error rejecting application: ${error}`);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const rejectCampaignByAdmin = async (req, res) => {
  try {
    const { campaignId, reason } = req.body;
    const adminId = req.user._id.toString(); // Convert to string

    // Only admin or superadmin allowed
    if (!["admin", "superadmin"].includes(req.user.role)) {
      logger.error(`Unauthorized user: ${req.user.role}`);
      return res.status(403).json({
        success: false,
        message: "Unauthorized: Only admin can reject campaigns",
      });
    }

    if (!campaignId) {
      logger.error("Campaign ID missing");
      return res.status(400).json({
        success: false,
        message: "Campaign ID is required",
      });
    }

    const campaign = await Campaign.findById(campaignId).populate(
      "createdBy",
      "name email"
    );

    if (!campaign) {
      logger.error(`Campaign not found: ${campaignId}`);
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    if (campaign.approvalStatus === "Rejected") {
      logger.error(`Campaign already rejected: ${campaignId}`);
      return res.status(400).json({
        success: false,
        message: "Campaign already rejected",
      });
    }

    campaign.approvalStatus = "Rejected";
    campaign.campaignStatus = "rejected";
    campaign.campaignStatusDescription = reason || "Rejected by admin";
    await campaign.save();
    logger.info(`Campaign rejected and saved: ${campaignId}`);

    // Send notification to the advertiser
    try {
      await notificationService.createCampaignApprovalNotification(
        campaign,
        "rejected",
        adminId
      );
      logger.info("Admin campaign rejection notification sent successfully!");
    } catch (notificationError) {
      logger.error(
        `Admin campaign rejection notification error: ${notificationError}`
      );
      // Don't fail the rejection if notification fails
    }

    // Send campaign rejection email to advertiser
    try {
      const advertiserEmail = campaign.createdBy.email;
      const emailResult = await sendCampaignRejectionEmail(
        advertiserEmail,
        campaign,
        reason || "Rejected by admin"
      );

      if (!emailResult.success) {
        logger.error(
          `Failed to send campaign rejection email: ${emailResult.error}`
        );
      } else {
        logger.info("Campaign rejection email sent successfully to advertiser");
      }
    } catch (emailError) {
      logger.error(`Error sending campaign rejection email: ${emailError}`);
      // Don't fail the rejection if email fails
    }

    return res.status(200).json({
      success: true,
      message: "Campaign rejected successfully",
      data: campaign,
    });
  } catch (error) {
    logger.error(`Error rejecting campaign: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export async function createUGCCampaign(req, res) {  
  try {
    const {
      businessType,
      campaignObjective,
      contentType,
      campaignName,
      contentCategory,
      videoDuration,
      contentFormat,
      contentBrief,
      hashtagsForPosting,
      socialHandle,
      creatorAvoid,
      referenceUrls,
      // applicationStart,
      applicationEnd,
      feePerInfluencer,
      product,
      deliveryMethod,
      creatorParameters = {},
    } = req.body;

    logger.info(`Campaign data:`, req.body);

    const {
      country,
      state,
      city,
      gender,
      age: ageGroup,
      specialRequirements,
      ethnicity,
      customRequirements,
    } = creatorParameters;

    let amount = 0;
    let totalAmount = 0;
    let platformFee = 0;
    let reimbursementAmount = 0;
    let campaignFee = 0;

    const fetchedProduct = await Product.findById(product);
    if (!fetchedProduct) {
      throw new Error("Product not found");
    }

    const productPrice = parseFloat(fetchedProduct.price);
    const fee = parseFloat(feePerInfluencer);

    if (isNaN(productPrice) || isNaN(fee)) {
      throw new Error("Invalid price or feePerInfluencer");
    }

    if (deliveryMethod === "Reimbursement") {
      reimbursementAmount = parseFloat(productPrice);
      amount = parseFloat(fee * 0.8 + reimbursementAmount).toFixed(2);
      platformFee = parseFloat(fee * 0.2).toFixed(2);
      totalAmount = parseFloat(reimbursementAmount + fee).toFixed(2);
      campaignFee = fee;
    } else {
      reimbursementAmount = 0;
      amount = parseFloat(fee * 0.8).toFixed(2);
      platformFee = parseFloat(fee * 0.2).toFixed(2);
      totalAmount = parseFloat(fee).toFixed(2);
      campaignFee = fee;
    }

    const parsedAge = ageGroup?.split(",").map((a) => a.trim()) || [];

    const campaignData = {
      campaignTypeCategory: businessType?.toLowerCase() || "",
      campaignStrategy: campaignObjective || "",
      campaignName: campaignName?.trim() || "",
      coverImage : fetchedProduct.image,
      hashtagsForPosting:
        hashtagsForPosting?.split(",").map((tag) => tag.trim()) || [],
      socialHandles: socialHandle?.trim() || null,
      contentRequirements: {
        contentFormat: contentFormat?.trim() || "",
        contentType: contentType?.trim() || "",
        contentCategory: contentCategory?.trim() || contentType?.trim(),
        videoDuration: videoDuration?.trim() || "",
        contentBrief: contentBrief?.trim() || "",
        contentAvoid: creatorAvoid?.trim() || "",
        examples: {
          urls: referenceUrls?.split(",").map((url) => url.trim()) || [],
          mediaFiles: [],
        },
      },

      creatorParameters: {
        preferableRegion: {
          country: country || "Any",
          state: state || "Any",
          city: city || "Any",
        },
        gender: gender || ["All"],
        age: parsedAge,
        ethnicity: ethnicity?.split(",").map((e) => e.trim()) || [],
        specialRequirements:
          specialRequirements?.split(",").map((r) => r.trim()) || [],
        customRequirements: customRequirements?.trim() || "",
      },

      compensation: {
        model: "Fixed fee for influencers per post or story",
        amount: amount,
        platformFee: platformFee,
        totalAmount: totalAmount,
        reimbursementAmount: reimbursementAmount,
        productPrice: productPrice,
        campaignFee: campaignFee,
      },

      applicationDeadline: {
        // start: applicationStart ? new Date(applicationStart) : new Date(),
        start: new Date(),
        end: applicationEnd
          ? new Date(applicationEnd)
          : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
      deliveryMethod: deliveryMethod || "No shipping needed",
      product: product || undefined,
      createdBy: req.user.id,
    };

    // ✅ Handle Cover Image Upload
    // if (req.files?.coverImage?.length > 0) {
    //   const imgUrl = await uploadFileToS3(
    //     "campaign_cover",
    //     req.files.coverImage[0]
    //   );
    //   campaignData.coverImage = imgUrl;
    // }

    // ✅ Handle Example Media Upload
    if (req.files?.exampleMedia) {
      const mediaFiles = Array.isArray(req.files.exampleMedia)
        ? req.files.exampleMedia
        : [req.files.exampleMedia];

      const mediaUrls = await Promise.all(
        mediaFiles.map((file) => uploadFileToS3("campaign_examples", file))
      );

      campaignData.contentRequirements.examples.mediaFiles = mediaUrls;
    }

    const campaign = new Campaign(campaignData);
    await campaign.save();

    try {
      await notificationService.createCampaignCreationNotification(
        campaign,
        req.user.id
      );
      logger.info("Campaign creation notification sent to admin!");
    } catch (notificationError) {
      logger.error(
        `Campaign creation notification error: ${notificationError}`
      );
    }

    // Send campaign creation notification email to advertiser
    try {
      const advertiserEmail = req.user.email; // Get email from the authenticated user who created the campaign
      const emailResult = await sendCampaignCreationEmail(
        advertiserEmail,
        campaign
      );

      if (!emailResult.success) {
        logger.error(
          `Failed to send campaign creation email: ${emailResult.error}`
        );
        // Don't fail the campaign creation if email fails, just log it
      } else {
        logger.info("Campaign creation email sent successfully to advertiser");
      }
    } catch (emailError) {
      logger.error(`Error sending campaign creation email: ${emailError}`);
    }

    res.status(201).json({
      success: true,
      message: "UGC Campaign created successfully",
      data: campaign,
    });
  } catch (error) {
    logger.error(`Error creating UGC campaign: ${error}`);
    res.status(500).json({
      success: false,
      message: "Failed to create campaign",
      error: error.message,
    });
  }
}

export async function updateCampaign(req, res) {
  try {
    const campaignId = req.params.id;

    const {
      businessType,
      campaignObjective,
      contentType,
      campaignName,
      contentCategory,
      videoDuration,
      contentFormat,
      contentBrief,
      hashtagsForPosting,
      socialHandle,
      creatorAvoid,
      referenceUrls,
      applicationStart,
      applicationEnd,
      feePerInfluencer,
      product,
      deliveryMethod,
      creatorParameters = {},
    } = req.body;

    const {
      country,
      state,
      city,
      gender,
      age: ageGroup,
      specialRequirements,
      ethnicity,
      customRequirements,
    } = creatorParameters;

    let amount = 0;
    let totalAmount = 0;
    let platformFee = 0;
    let reimbursementAmount = 0;
    let campaignFee = 0;

    const fetchedProduct = await Product.findById(product);
    if (!fetchedProduct) {
      throw new Error("Product not found");
    }

    const productPrice = parseFloat(fetchedProduct.price);
    const fee = parseFloat(feePerInfluencer);

    if (isNaN(productPrice) || isNaN(fee)) {
      throw new Error("Invalid price or feePerInfluencer");
    }

    if (deliveryMethod === "Reimbursement") {
      reimbursementAmount = parseFloat(productPrice);
      amount = parseFloat(fee * 0.8 + reimbursementAmount).toFixed(2);
      platformFee = parseFloat(fee * 0.2).toFixed(2);
      totalAmount = parseFloat(reimbursementAmount + fee).toFixed(2);
      campaignFee = fee;
    } else {
      reimbursementAmount = 0;
      amount = parseFloat(fee * 0.8).toFixed(2);
      platformFee = parseFloat(fee * 0.2).toFixed(2);
      totalAmount = parseFloat(fee).toFixed(2);
      campaignFee = fee;
    }

    const parsedAge = ageGroup?.split(",").map((a) => a.trim()) || [];

    // Build campaignData in the same structure as createUGCCampaign
    const campaignData = {
      campaignTypeCategory: businessType?.toLowerCase(),
      campaignStrategy: campaignObjective,
      campaignName: campaignName?.trim(),
      coverImage: "",
      hashtagsForPosting:
        hashtagsForPosting?.split(",").map((tag) => tag.trim()) || [],
      socialHandles: socialHandle?.trim() || null,
      contentRequirements: {
        platform: [],
        contentFormat: contentFormat?.trim() || "",
        contentType: contentType?.trim() || "",
        contentCategory: contentCategory?.trim() || "",
        videoDuration: videoDuration?.trim() || "",
        contentBrief: contentBrief?.trim() || "",
        contentAvoid: creatorAvoid?.trim() || "",
        examples: {
          urls: referenceUrls?.split(",").map((url) => url.trim()) || [],
          mediaFiles: [],
        },
      },
      creatorParameters: {
        preferableRegion: {
          country: country || "Any",
          state: state || "Any",
          city: city || "Any",
        },
        gender: gender || ["All"],
        age: parsedAge,
        ethnicity: ethnicity?.split(",").map((e) => e.trim()) || [],
        specialRequirements:
          specialRequirements?.split(",").map((r) => r.trim()) || [],
        customRequirements: customRequirements?.trim() || "",
      },
      compensation: {
        model: "Fixed fee for influencers per post or story",
        amount: amount,
        platformFee: platformFee,
        totalAmount: totalAmount,
        reimbursementAmount: reimbursementAmount,
        productPrice: productPrice,
        campaignFee: campaignFee,
      },
      applicationDeadline: {
        start: applicationStart ? new Date(applicationStart) : new Date(),
        end: applicationEnd
          ? new Date(applicationEnd)
          : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      },
      deliveryMethod: deliveryMethod || "No shipping needed",
      product: product || undefined,
      // status: "Draft", // Optionally allow status update
      // createdBy: req.user.id, // Do not update creator
    };
    
    const existingCampaign = await Campaign.findById(campaignId);

    // Handle Cover Image Upload (same as createUGCCampaign)
    if (req.files?.coverImage?.length > 0) {
      if (existingCampaign?.coverImage) {
        await deleteFileFromS3(existingCampaign.coverImage);
      }
      const imgUrl = await uploadFileToS3(
        "campaign_cover",
        req.files.coverImage[0]
      );
      campaignData.coverImage = imgUrl;
    } else {
      campaignData.coverImage = existingCampaign.coverImage;
    }

    // Handle Example Media Upload (same as createUGCCampaign)
    if (req.files?.exampleMedia) {
      const mediaFiles = Array.isArray(req.files.exampleMedia)
        ? req.files.exampleMedia
        : [req.files.exampleMedia];

      const mediaUrls = await Promise.all(
        mediaFiles.map((file) => uploadFileToS3("campaign_examples", file))
      );

      // Merge with existing media files if any
      const existingCampaign = await Campaign.findById(campaignId);
      const existingMediaFiles =
        existingCampaign?.contentRequirements?.examples?.mediaFiles || [];

      campaignData.contentRequirements.examples.mediaFiles = [
        ...existingMediaFiles,
        ...mediaUrls,
      ];
    } else {
      // Retain existing media files if not uploading new ones
      const existingCampaign = await Campaign.findById(campaignId);
      if (existingCampaign?.contentRequirements?.examples?.mediaFiles) {
        campaignData.contentRequirements.examples.mediaFiles =
          existingCampaign.contentRequirements.examples.mediaFiles;
      }
    }

    // Optionally validate campaignData here if you have a validation function
    // const { error } = updateCampaignValidation(campaignData);
    // if (error) {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Validation failed",
    //     errors: error.details.map((err) => err.message),
    //   });
    // }

    // Remove empty or null fields
    Object.keys(campaignData).forEach((key) => {
      if (campaignData[key] === "" || campaignData[key] === null) {
        delete campaignData[key];
      }
    });

    const updatedCampaign = await Campaign.findByIdAndUpdate(
      campaignId,
      { $set: campaignData },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      message: "Campaign updated successfully",
      data: updatedCampaign,
    });
  } catch (error) {
    logger.error(`Error updating campaign: ${error}`);
    res.status(400).json({
      success: false,
      message: error.message || "Failed to update campaign",
      error: error.errors || {},
    });
  }
}

export const getReviewsForInfluencer = async (req, res) => {
  const { influencerId } = req.params;

  try {
    const reviews = await fetchReviewsForInfluencer(influencerId);
    res.status(200).json({ success: true, data: reviews });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to load reviews",
      error: err.message,
    });
  }
};

export async function getNewRequestsForCampaign(req, res) {
  const { campaignId } = req.params;

  try {
    const campaign = await Campaign.findById(campaignId);
    if (!campaign || campaign.approvalStatus?.toLowerCase() !== "approved") {
      return res.status(400).json({
        success: false,
        message: "Campaign not approved or does not exist",
      });
    }

    const applications = await CampaignApplication.find({
      campaign: campaignId,
      applicationStatus: "applied",
    })
      .populate("userId", "name email photoUrl followers")
      .select("userId videoUrls applicationStatus comments createdAt");

    const formatted = await Promise.all(
      applications.map(async (app) => {
        const reviews = await fetchReviewsForInfluencer(app.userId?._id);

        return {
          applicationId: app._id,
          _id: app._id,
          influencerName: app.userId?.name || "Unknown",
          influencerImage: app.userId?.photoUrl || "/assets/images/avatar.png",
          email: app.userId?.email || "N/A",
          followers: app.userId?.followers || 0,
          videoUrls: app.videoUrls,
          comments: app.comments,
          appliedAt: app.createdAt,
          applicationStatus: app.applicationStatus,
          reviews,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "New influencer requests fetched",
      data: formatted,
    });
  } catch (err) {
    logger.error(`Error fetching requests: ${err}`);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}

export async function getAcceptedInfluencers(req, res) {
  const { campaignId } = req.params;

  try {
    const applications = await CampaignApplication.find({
      campaign: campaignId,
      applicationStatus: "approved",
    })
      .populate(
        "campaign",
        "campaignName platform compensation applicationDeadline campaignType campaignStrategy campaignCategory contentRequirements"
      )
      .populate("userId", "name email photoUrl rating campaignsCount socials") 
      .lean();

    const data = applications.map((app) => {
      const user = app.userId || {};

      return {
        applicationId: app._id,
        influencerId: user._id,
        name: user.name || "N/A",
        avatar: user.photoUrl || "/assets/images/avatar.png",
        rating: user.rating || 0,
        campaigns: user.campaignsCount || 0,

        // ✅ Connected socials
        socials: (user.socials || [])
          .filter((s) => s.connected)
          .map((s) => s.platform),

        // ✅ Content info
        content: app.videoUrls.length > 0 ? 1 : 0,
        // contentType: app.contentType || "N/A",
        // platform: app.platform || "N/A",
        campaignName: app.campaign?.campaignName || "N/A",
        campaignType: app.campaign?.campaignType || "N/A",
        campaignStrategy: app.campaign?.campaignStrategy || "N/A",
        campaignCategory: app.campaign?.campaignCategory || "N/A",
        campaignDeadline: app.campaign?.applicationDeadline || "N/A",
        campaignFee: app.campaign?.compensation?.amount || "N/A",
        campaignContentRequirements: app.campaign?.contentRequirements || "N/A",

        // ✅ Status & metrics
        status: app.applicationStatus || "applied",
        metrics: app.metrics || { views: 0, likes: 0 },

        // ✅ Date for frontend sorting if needed
        submittedAt: app.updatedAt || app.createdAt,
      };
    });

    return res.status(200).json({
      success: true,
      message: "Accepted influencers fetched",
      data,
    });
  } catch (err) {
    logger.error(`Error fetching influencers: ${err}`);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
}

export async function getContentSubmissionForUser(req, res) {
  const { campaignId, userId } = req.params;

  try {
    const campaign = await Campaign.findById(campaignId)
      .populate({
        path: "product",
        populate: {
          path: "brandId",
          model: "Brand",
          select: "_id brandName logoUrl",
        },
      })
      .lean();

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: "Campaign not found" });
    }

    const application = await CampaignApplication.findOne({
      campaign: campaignId,
      userId,
    })
      .select("-metrics")
      .populate("userId", "name email photoUrl rating socials campaignsCount")
      .lean();

    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "No application found" });
    }

    const user = application.userId || {};

    const reviews = await InfluencerReview.find({
      influencerId: user._id,
      applicationId: application._id,
    });


    const ReviewSubmitted = reviews.some(
      (review) => review.applicationId.toString() === application._id.toString()
    );

    const completedJobs = await CampaignApplication.countDocuments({
      userId: user._id,
      jobTimelineStatus: "job_completed",
    });

    const userFiltered = {
      _id: user._id,
      name: user.name,
      email: user.email,
      photoUrl: user.photoUrl,
      completedJobs,
      socials: (user.socials || [])
        .filter((s) => s.connected)
        .map((s) => ({
          platform: s.platform,
          username: s.username,
          profileUrl: s.profileUrl,
          followers: s.followers,
        })),
    };

    let shipment = await Shipment.findOne({
      campaignId: campaignId,
    })
      .select("carrierSlug trackingNumber trackingUrl")
      .lean();

    const submission = {
      contentId: application._id,
      influencerId: user._id,
      name: user.name || "N/A",
      avatar: user.photoUrl || "/assets/images/avatar.png",
      email: user.email || "N/A",
      reviews: reviews,
      campaigns: user.campaignsCount || 0,
      socials: userFiltered.socials,
      campaign: campaign,
      ReviewSubmitted,
      application: {
        ...application,
        userId: userFiltered,
        videoUrls: application.videoUrls || [],
        exampleMediaUrls: application.exampleMediaUrls || [],
      },
      shipment: shipment,
    };

    return res.status(200).json({
      success: true,
      message: "Influencer content submission fetched",
      data: submission,
    });
  } catch (error) {
    logger.error(`Error fetching influencer content: ${error}`);
    return res
      .status(500)
      .json({ success: false, message: "Server error", error: error.message });
  }
}

export const getInfluencerPostDetails = async (req, res) => {
  const { campaignId, influencerId } = req.params;

  try {
    const application = await CampaignApplication.findOne({
      campaign: campaignId,
      userId: influencerId,
      applicationStatus: "approved",
    })
      .populate(
        "campaign",
        "campaignName coverImage compensation description contentFormat displayFormat videoDuration platform mediaType contentRequirements campaignType campaignStrategy campaignCategory applicationDeadline product withProduct"
      )
      .populate("userId", "name email photoUrl rating socials campaignsCount");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Approved application not found for influencer",
      });
    }

    const user = application.userId;
    const campaign = application.campaign;

    // ✅ If campaign has product, find shipment
    let shipment = null;
    if (campaign.withProduct && campaign.product) {
      shipment = await Shipment.findOne({
        campaignId: campaign._id,
        influencerId: user._id,
      }).lean();
    }

    const data = {
      influencer: {
        id: user._id,
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
        id: campaign._id,
        name: campaign.campaignName,
        description: campaign.description,
        campaignType: campaign.campaignType,
        thumbnail: campaign.coverImage,
        fee: campaign.compensation?.amount || 0,
        contentRequirements: campaign.contentRequirements,
        campaignStrategy: campaign.campaignStrategy,
        campaignCategory: campaign.campaignCategory,
        campaignDeadline: campaign.applicationDeadline,
        campaignPlatform: campaign.platform,
        campaignMediaType: campaign.mediaType,
        campaignContentFormat: campaign.contentFormat,
        campaignVideoDuration: campaign.videoDuration,
        campaignDisplayFormat: campaign.displayFormat,

        // ✅ Product details
        product: campaign.withProduct
          ? {
              name: campaign.product?.name || "N/A",
              description: campaign.product?.description || "N/A",
              image: campaign.product?.image || null,
              brand: campaign.product?.brand || null,
            }
          : null,
      },

      campaignApplication: {
        applicationId: application._id,
        applicationStatus: application.applicationStatus,
        contentApprovalStatus: application.contentApprovalStatus,
        publishStatus: application.publishStatus,
        paymentStatus: application.paymentStatus,
        reviewNotes: application.reviewNotes || null,
      },

      content: {
        videoUrls: application.videoUrls,
        // contentType: application.contentType,
        // platform: application.platform,
        status: application.publishStatus || "Pending",
        contentShared: application.contentShared || false,
      },

      stats: {
        // platform: application.platform,
        views: application.metrics?.views || 0,
        likes: application.metrics?.likes || 0,
        comments: application.metrics?.comments || 0,
      },

      shipment: shipment
        ? {
            shipmentId: shipment._id,
            trackingUrl: shipment.trackingUrl,
            labelUrl: shipment.labelUrl,
            status: shipment.status,
            createdAt: shipment.createdAt,
          }
        : null,

      releaseEligible:
        application.publishStatus === "Approved" &&
        application.applicationStatus === "submitted",
    };

    res.status(200).json({
      success: true,
      message: "Post details fetched successfully",
      data,
    });
  } catch (error) {
    logger.error(`Error fetching post details: ${error}`);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAllCampaignsForAdmin = async (req, res) => {
  try {
    // Fetch all campaigns with creator info
    const campaigns = await Campaign.find()
      .populate("createdBy", "id name email photoUrl role") // advertiser info
      .populate({
        path: "product",
        select: "_id brandId", // Only select _id and brandId for product
        populate: {
          path: "brandId",
          model: "Brand",
          select: "_id brandName", // Only select _id and brandName for brand
        },
      })
      .sort({ createdAt: -1 });

    // Fetch application counts grouped by campaign
    const applicationCounts = await CampaignApplication.aggregate([
      {
        $group: {
          _id: "$campaign",
          count: { $sum: 1 },
        },
      },
    ]);

    const countsMap = {};
    applicationCounts.forEach((item) => {
      countsMap[item._id.toString()] = item.count;
    });

    // For each campaign, fetch applications and shipments
    const formatted = await Promise.all(
      campaigns.map(async (camp) => {
        // Applications for this campaign
        const applications = await CampaignApplication.find({
          campaign: camp._id,
        })
          .populate("userId", "name email photoUrl role")
          .sort({ createdAt: -1 });

        // Shipments for this campaign
        const shipmentDetails = camp.product
          ? await Shipment.find({ campaignId: camp._id })
          : [];

        // Enrich shipments with influencer info
        const enrichedShipments = shipmentDetails.map((shipment) => {
          const app = applications.find(
            (a) => a._id.toString() === shipment.applicationId?.toString()
          );
          const user = app?.userId;
          return {
            ...shipment.toObject(),
            productName: camp.product?.name || null,
            image: camp.product?.image || null,
            userId: user?._id || shipment.userId,
            influencerName: user?.name || null,
          };
        });

        return {
          _id: camp._id,
          campaignName: camp.campaignName,
          campaignStrategy: camp.campaignStrategy,
          type: camp.campaignType,
          createdAt: camp.createdAt,
          coverImage: camp.coverImage,
          contentRequirements: camp.contentRequirements,
          description: camp.description,
          compensation: camp.compensation,
          applicationDeadline: camp.applicationDeadline,
          postingSchedule: camp.postingSchedule,
          campaignStatus: camp.campaignStatus,
          approvalStatus: camp.approvalStatus,
          advertiser: {
            id: camp.createdBy?._id,
            name: camp.createdBy?.name || "N/A",
            email: camp.createdBy?.email || "",
            photoUrl: camp.createdBy?.photoUrl || "/default-avatar.png",
            role: camp.createdBy?.role,
          },
          influencer: {
            name: camp.influencer?.name || "N/A",
            email: camp.influencer?.email || "",
            photoUrl: camp.influencer?.photoUrl || "/default-avatar.png",
            role: camp.influencer?.role,
          },
          totalApplications: countsMap[camp._id.toString()] || 0,
          applications, // full application details
          shipments: enrichedShipments, // full shipment details
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Campaigns fetched successfully",
      data: formatted,
    });
  } catch (error) {
    logger.error(`Error fetching campaigns: ${error}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns",
      error: error.message,
    });
  }
};

export const getApplicationDetails = async (req, res) => {
  try {
    const { applicationId } = req.params;

    const application = await CampaignApplication.findById(applicationId)
      .populate("userId", "name email photoUrl followers socials")
      .populate(
        "campaign",
        "campaignName description createdBy postingSchedule"
      )
      .lean();

    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    const campaign = application.campaign;
    const influencer = application.userId;

    // Get advertiser from campaign.createdBy
    const advertiser = await User.findById(campaign.createdBy)
      .select("name email photoUrl")
      .lean();

    // Get influencer reviews
    const reviews = await InfluencerReview.find({
      influencerId: influencer._id,
    })
      .populate("advertiserId", "name")
      .populate("campaignId", "campaignName")
      .lean();

    const formattedReviews = reviews.map((r) => ({
      rating: r.rating,
      comment: r.comment,
      reviewer: r.advertiserId?.name || "Anonymous",
      campaign: r.campaignId?.campaignName || "Unknown",
      date: r.createdAt,
    }));

    const result = {
      applicationId: application._id,
      applicationStatus: application.applicationStatus,
      contentApprovalStatus: application.contentApprovalStatus,
      publishStatus: application.publishStatus,
      videoUrls: application.videoUrls,
      comments: application.comments,
      appliedAt: application.createdAt,

      campaign: {
        title: campaign.campaignName,
        description: campaign.description,
        postingSchedule: campaign.postingSchedule,
      },

      influencer: {
        id: influencer._id,
        name: influencer.name,
        email: influencer.email,
        avatar: influencer.photoUrl || "/assets/avatar.png",
        followers: influencer.followers || 0,
        socials: (influencer.socials || []).filter((s) => s.connected),
      },

      advertiser: {
        id: advertiser._id,
        name: advertiser.name,
        email: advertiser.email,
        avatar: advertiser.photoUrl || "/assets/avatar.png",
      },

      reviews: formattedReviews,
    };

    return res.status(200).json({ success: true, data: result });
  } catch (err) {
    logger.error(`Error fetching application details: ${err}`);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch application details",
      error: err.message,
    });
  }
};

export const uploadFinalContent = async (req, res) => {
  try {
    const { applicationId } = req.body;

    if (!applicationId || typeof applicationId !== "string") {
      logger.error("Invalid application ID");
      return res.status(400).json({
        success: false,
        message: "Invalid or missing application ID",
      });
    }

    const uploadedVideoFiles = req.files?.file || [];
    const exampleMediaFiles = req.files?.exampleMediaFiles || [];

    let contentLength = uploadedVideoFiles.length
    if (!contentLength) {
      logger.error("No video files uploaded");
      return res.status(400).json({
        success: false,
        message: "At least one video file is required",
      });
    }

    const application = await CampaignApplication.findById(applicationId)
      .populate("campaign", "campaignName createdBy postingSchedule")
      .populate("userId", "name email photoUrl followers socials");

    if (!application) {
      logger.error(`Application not found: ${applicationId}`);
      return res.status(404).json({
        success: false,
        message: "Campaign application not found",
      });
    }

    let existingContentLength = application.videoUrls.length
    contentLength += existingContentLength

    if(existingContentLength >= 10 || contentLength >=10 ){
     return res.status(400).json({
        success : false,
        message : "You cannot submit more than 10 content for an application"
      })
    }

    let videoUrls = [];
    let exampleMediaUrls = [];

    try {
      const videoUploadPromises = uploadedVideoFiles.map((file) =>
        uploadFileToS3("final-contents/videos", file)
      );
      const exampleUploadPromises = exampleMediaFiles.map((file) =>
        uploadFileToS3("final-contents/examples", file)
      );

      [videoUrls, exampleMediaUrls] = await Promise.all([
        Promise.all(videoUploadPromises),
        Promise.all(exampleUploadPromises),
      ]);
      logger.info("Files uploaded successfully");
    } catch (uploadErr) {
      logger.error(`File upload failed: ${uploadErr}`);
      return res.status(500).json({
        success: false,
        message: "Failed to upload one or more files to storage",
        error: uploadErr.message,
      });
    }

    // Get existing application to append to current videoUrls
    const existingApplication =
      await CampaignApplication.findById(applicationId);

    const newVideoDetails = videoUrls.map((url) => ({
      url,
      status: "pending",
    }));

    // Append new videos to existing videoUrls array
    const updatedVideoUrls = [
      ...(existingApplication.videoUrls || []),
      ...newVideoDetails,
    ];

    await CampaignApplication.findByIdAndUpdate(applicationId, {
      videoUrls: updatedVideoUrls,
      exampleMediaUrls,
      contentApprovalStatus: "submitted",
      jobTimelineStatus: "content_uploaded",
      publishStatus: "notPublish",
      contentShared: true,
    });

    logger.info("Application updated with content");

    try {
      await notificationService.createContentSubmissionNotification(
        application,
        {
          contentType: "video",
          videoCount: videoUrls.length,
          exampleCount: exampleMediaUrls.length,
        }
      );
      logger.info("Content submission notification sent successfully!");

      // Send email to advertiser
      logger.info("Sending content submission email...");
      const emailResult = await sendContentSubmissionEmail(
        application.campaign.createdBy.email,
        application.campaign._id
      );

      if (!emailResult.success) {
        logger.error(
          `Failed to send content submission email: ${emailResult.error}`
        );
      } else {
        logger.info("Content submission email sent successfully");
      }
    } catch (notificationError) {
      logger.error(
        `Content submission notification/email error: ${notificationError}`
      );
      // Don't fail the upload if notification fails
    }

    const updated = await CampaignApplication.findById(applicationId)
      .populate("campaign", "campaignName postingSchedule")
      .populate("userId", "name email photoUrl followers socials")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Final content uploaded successfully",
      data: {
        applicationId: updated?._id,
        videoUrls: updated?.videoUrls || [],
        exampleMediaUrls: updated?.exampleMediaUrls || [],
        publishStatus: updated?.publishStatus,
        contentShared: updated?.contentShared,
        updatedAt: updated?.updatedAt,
        campaign: updated?.campaign?._id
          ? {
              id: updated.campaign._id,
              title: updated.campaign.campaignName,
              postingSchedule: updated.campaign.postingSchedule,
            }
          : null,
        influencer: updated?.userId?._id
          ? {
              id: updated.userId._id,
              name: updated.userId.name,
              email: updated.userId.email,
              avatar: updated.userId.photoUrl || "/assets/avatar.png",
              followers: updated.userId.followers || 0,
              socials: (updated.userId.socials || []).filter(
                (s) => s.connected
              ),
            }
          : null,
      },
    });
  } catch (err) {
    logger.error(`Unexpected error in uploadFinalContent: ${err}`);
    return res.status(500).json({
      success: false,
      message: "Unexpected server error during content upload",
      error: err.message,
    });
  }
};

const createTransactionAndUpdateWallet = async (
  applicationId,
  applicantId,
  campaignId
) => {
  try {
    const campaign = await Campaign.findById(
      { _id: campaignId },
      { createdBy: 1, compensation: 1 }
    );

    logger.info("this function is calling...");

    // update advertiser wallet
    const amountToDeduct = campaign.compensation.totalAmount;
    const advertiserWallet = await Wallet.findOne({
      userId: campaign.createdBy,
    });
    advertiserWallet.totalSpent = Number(
      advertiserWallet.totalSpent + amountToDeduct
    ).toFixed(2);
    advertiserWallet.balance = Number(
      advertiserWallet.balance - amountToDeduct
    ).toFixed(2);
    advertiserWallet.locked_coins = Number(
      advertiserWallet.locked_coins - amountToDeduct
    ).toFixed(2);

    await advertiserWallet.save();

    // update influencer wallet (80% of the amount)
    const amountToAdd = campaign.compensation.amount;
    logger.info(`testing final amount: ${amountToAdd}`);

    // const finalAmount = amountToAdd * 0.8;
    const influencerWallet = await Wallet.findOne({
      userId: applicantId,
    });

    logger.info(`testing final amount: ${amountToAdd}`);

    influencerWallet.balance = Number(
      influencerWallet.balance + amountToAdd
    ).toFixed(2);
    influencerWallet.available_coins = Number(
      influencerWallet.available_coins + amountToAdd
    ).toFixed(2);

    await influencerWallet.save();

    // update admin wallet (20% of the amount)
    const adminAmount = campaign.compensation.platformFee;

    // Find admin user by role
    const adminUser = await User.findOne({ role: "superadmin" });

    const adminWallet = await Wallet.findOne({
      userId: adminUser._id,
    });

    if (adminUser && adminWallet) {
      adminWallet.balance = Number(adminWallet.balance + adminAmount).toFixed(
        2
      );
      adminWallet.available_coins = Number(
        adminWallet.available_coins + adminAmount
      ).toFixed(2);
      await adminWallet.save();

      const adminTransaction = await Transaction.create({
        userId: adminUser._id,
        walletId: adminWallet._id,
        transactionCreatedFor: "superadmin",
        type: "admin_fee",
        status: "completed",
        currency: "coins",
        amount: adminAmount,
        description: "Admin fee from campaign payment.",
        transactionId: `TXN_ADMIN_${Date.now()}_${crypto
          .randomBytes(4)
          .toString("hex")}`,
        campaignId: campaignId,
        applicationId: applicationId,
      });

      logger.info(`Admin transaction created: ${adminTransaction._id}`);
      logger.info(`Admin wallet updated with: ${adminAmount}`);
    }

    // update Transaction
    const transaction = await Transaction.findOne({
      applicationId: applicationId,
    });
    transaction.type = "campaign_payment";
    transaction.status = "completed";
    transaction.currency = "coins";
    transaction.amount = amountToDeduct;
    await transaction.save();

    logger.info(`applicantId: ${applicantId}`);

    // Create transaction for influencer
    const influencerTransaction = await Transaction.create({
      userId: applicantId,
      walletId: influencerWallet._id,
      transactionCreatedFor: "influencer",
      type: "campaign_payment",
      status: "completed",
      currency: "coins",
      amount: amountToAdd,
      description: "Influencer campaign payment is sent and received.",
      transactionId: `TXN_${Date.now()}_${crypto
        .randomBytes(4)
        .toString("hex")}`,
      campaignId: campaignId,
      applicationId: applicationId,
    });

    logger.info(`Influencer transaction created: ${influencerTransaction._id}`);
    // return;
  } catch (error) {
    logger.error(`err**: ${error}`);
  }
};

export const approveContentByAdvertiser = async (req, res) => {
  try {
    logger.info("Content approval/rejection started");
    const { applicationId, selectedVideoUrl, action, reviewNotes } = req.body;
    const advertiserId = req.user._id.toString();

    if (
      !applicationId ||
      !selectedVideoUrl ||
      !["approved", "resubmission"].includes(action)
    ) {
      logger.error("Invalid request parameters");
      return res.status(400).json({
        success: false,
        message:
          "Missing or invalid fields: applicationId, selectedVideoUrl, or action",
      });
    }

    // Get application with populated data
    const application = await CampaignApplication.findById(applicationId)
      .populate("userId", "name email")
      .populate("campaign", "campaignName createdBy campaignStrategy");

    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    logger.info(
      `Application found: ${application.userId.name} ${application.campaign.campaignName}`
    );

    // Check video exists in the array of objects
    const videoExists = application.videoUrls.some(
      (video) => video.url === selectedVideoUrl
    );
    if (!videoExists) {
      logger.error("Selected video not found in application");
      return res.status(400).json({
        success: false,
        message: "Selected video is not among submitted URLs",
      });
    }

    // Update fields based on action
    if (
      action === "approved" &&
      application.campaign.campaignStrategy === "Content Only"
    ) {
      application.finalVideoUrl = selectedVideoUrl;
      application.isFinal = true;
      application.contentApprovalStatus = "approved";
      application.applicationStatus = "completed";
      application.jobTimelineStatus = "content_accepted";
      application.reviewNotes = "";
      createTransactionAndUpdateWallet(
        applicationId,
        application.userId._id,
        application.campaign._id
      );
    } else if (
      action === "approved" &&
      application.campaign.campaignStrategy === "Content + Posting"
    ) {
      application.finalVideoUrl = selectedVideoUrl;
      application.isFinal = true;
      application.contentApprovalStatus = "approved";
      application.applicationStatus = "approved";
      application.jobTimelineStatus = "content_accepted";
      application.reviewNotes = "";
    }

    application.videoUrls = application.videoUrls.map((video) => ({
      ...video,
      status: video.url === selectedVideoUrl ? action : video.status,
    }));

    await application.save();

    // Send notification to influencer about content approval
    try {
      await notificationService.createContentStatusNotification(
        application,
        action === "approved" ? "approved" : "rejected",
        reviewNotes,
        advertiserId
      );
      logger.info("Content status notification sent successfully!");
    } catch (notificationError) {
      logger.error(`Content status notification error: ${notificationError}`);
      // Don't fail the approval if notification fails
    }

    // Send content approval email to influencer
    if (action === "approved") {
      logger.info("Sending content approval email to influencer...");
      try {
        const influencerEmail = application.userId.email;
        const emailResult = await sendContentApprovalEmail(
          influencerEmail,
          application
        );

        if (!emailResult.success) {
          logger.error(
            `Failed to send content approval email: ${emailResult.error}`
          );
        } else {
          logger.info("Content approval email sent successfully to influencer");
        }
      } catch (emailError) {
        logger.error(`Error sending content approval email: ${emailError}`);
        // Don't fail the approval if email fails
      }
    }

    logger.info("Content approval process completed successfully!");

    return res.status(200).json({
      success: true,
      message: `Content ${
        action === "approved" ? "approved" : "sent back for resubmission"
      }`,
      data: {
        applicationId: application._id,
        finalVideoUrl: application.finalVideoUrl,
        contentApprovalStatus: application.contentApprovalStatus,
        jobTimelineStatus: application.jobTimelineStatus,
        isFinal: application.isFinal,
      },
    });
  } catch (err) {
    logger.error(`Error in approveContentByAdvertiser: ${err}`);
    return res.status(500).json({
      success: false,
      message: "Internal server error during content approval",
      error: err.message,
    });
  }
};

export const markJobCompleted = async (req, res) => {
  try {
    const appId = req.params.id;

    const application = await CampaignApplication.findById(appId);
    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }
    if (application.applicationStatus !== "completed") {
      return res
        .status(400)
        .json({ success: false, message: "Job not completed" });
    }

    application.jobTimelineStatus = "job_completed";
    await application.save();

    return res.status(200).json({
      success: true,
      message: "Job Marked as Completed",
      data: application,
    });
  } catch (err) {
    logger.error(`Error in markJobCompleted: ${err}`);
    return res.status(500).json({
      success: false,
      message: "Error during job completion",
      error: err.message,
    });
  }
};

export const postFinalContent = async (req, res) => {
  try {
    const { applicationId } = req.body;
    // const influencerId = req.userId; // from auth middleware

    if (!applicationId) {
      return res
        .status(400)
        .json({ success: false, message: "Application ID is required" });
    }

    const application = await CampaignApplication.findById(applicationId)
      .populate("campaign", "campaignName createdBy postingSchedule")
      .populate("userId", "name email photoUrl followers socials")
      .lean();

    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    // if (application.userId._id.toString() !== influencerId.toString()) {
    //   return res.status(403).json({ success: false, message: "Unauthorized" });
    // }

    const updated = await CampaignApplication.findByIdAndUpdate(
      applicationId,
      {
        contentApprovalStatus: "approved",
        publishStatus: "notPublish",
        applicationStatus: "completed",
        contentShared: true,
      },
      { new: true }
    )
      .populate("campaign", "campaignName postingSchedule")
      .populate("userId", "name email photoUrl followers socials")
      .lean();

    return res.status(200).json({
      success: true,
      message: "Content marked as Approved",
      data: {
        applicationId: updated._id,
        publishStatus: updated.publishStatus,
        contentShared: updated.contentShared,
        postedAt: updated.updatedAt,
        campaign: {
          id: updated.campaign._id,
          title: updated.campaign.campaignName,
          postingSchedule: updated.campaign.postingSchedule,
        },
        influencer: {
          id: updated.userId._id,
          name: updated.userId.name,
          email: updated.userId.email,
          avatar: updated.userId.photoUrl || "/assets/avatar.png",
          followers: updated.userId.followers || 0,
          socials: (updated.userId.socials || []).filter((s) => s.connected),
        },
      },
    });
  } catch (err) {
    console.error("Error marking content as posted:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to mark content as posted",
      error: err.message,
    });
  }
};

export const getCampaignSummary = async (req, res) => {
  try {
    const match = {};

    // Optional: if advertiser, filter only their campaigns
    if (req.user.role === "advertiser") {
      match.createdBy = req.user.id;
    }

    const [total, active, closed, terminated] = await Promise.all([
      Campaign.countDocuments(match),
      Campaign.countDocuments({ ...match, status: "Active" }),
      Campaign.countDocuments({ ...match, status: "Closed" }),
      Campaign.countDocuments({ ...match, status: "Terminated" }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        total,
        active,
        closed,
        terminated,
      },
    });
  } catch (error) {
    console.error("Error fetching campaign summary:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaign summary",
      error: error.message,
    });
  }
};

export const updateUserApplicationDeadline = async (req, res) => {
  try {
    const { applicationId, newDeadline } = req.body;
    const advertiserId = req.user._id.toString();

    if (!applicationId || !newDeadline) {
      logger.error("Missing required fields");
      return res.status(400).json({
        success: false,
        message: "Application ID and new deadline are required",
      });
    }

    // Validate advertiser owns the campaign
    const application = await CampaignApplication.findById(applicationId)
      .populate("campaign", "createdBy campaignName")
      .populate("userId", "name email");

    if (!application) {
      logger.error(`Application not found: ${applicationId}`);
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    logger.info(
      `Application found: ${application.userId.name} ${application.campaign.campaignName}`
    );

    if (application.campaign.createdBy.toString() !== req.user._id.toString()) {
      logger.error("Unauthorized access attempt");
      return res.status(403).json({
        success: false,
        message: "You are not authorized to update this application",
      });
    }

    // Apply the override
    application.contentDeadline = new Date(newDeadline);
    await application.save();
    logger.info("Application deadline updated");

    // Create notification for influencer
    logger.info("Creating deadline extension notification...");
    try {
      await notificationService.createDeadlineExtensionNotification(
        application,
        newDeadline,
        advertiserId
      );
      logger.info("Deadline extension notification sent successfully!");
    } catch (notificationError) {
      logger.error(
        `Deadline extension notification error: ${notificationError}`
      );
      // Don't fail the deadline update if notification fails
    }

    return res.status(200).json({
      success: true,
      message: "Application deadline updated successfully",
      data: {
        applicationId: application._id,
        influencer: {
          id: application.userId._id,
          name: application.userId.name,
          email: application.userId.email,
        },
        campaign: {
          id: application.campaign._id,
          title: application.campaign.campaignName,
        },
        newDeadline: application.contentDeadline,
      },
    });
  } catch (error) {
    logger.error(`Error updating user deadline: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Failed to update deadline",
      error: error.message,
    });
  }
};

export const updateApplicationDeadline = async (req, res) => {
  try {
    const { campaignId, newDeadline } = req.body;
    const campaign = await Campaign.findByIdAndUpdate(
      campaignId,
      {
        applicationDeadline: {
          end: new Date(newDeadline),
        },
      },
      { new: true }
    );

    if (!campaign) {
      return res
        .status(404)
        .json({ success: false, message: "Campaign not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Campaign application deadline updated successfully",
    });
  } catch (error) {
    logger.error(`Error updating campaign application deadline: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Failed to update campaign application deadline",
      error: error.message,
    });
  }
};

export const getAllFinalContent = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      campaignStrategy,
      startDate,
      endDate,
    } = req.query;

    const userId = req.user.id;
    // const userId = req.params.id;

    if (req.user.role !== "advertiser") {
      return res.status(403).json({ success: false, message: "Unauthorized" });
    }

    const filter = { createdBy: userId };

    if (status) filter.status = status;
    if (campaignStrategy) filter.campaignStrategy = campaignStrategy;
    if (startDate || endDate) {
      filter.applicationDeadline = {};
      if (startDate)
        filter.applicationDeadline.start = { $gte: new Date(startDate) };
      if (endDate) filter.applicationDeadline.end = { $lte: new Date(endDate) };
    }

    // Get all campaigns for this advertiser
    const campaigns = await Campaign.find(filter)
      .populate({
        path: "product",
        populate: {
          path: "brandId",
          model: "Brand",
          select: "brandName",
        },
      })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    // const total = await Campaign.countDocuments(filter);

    // Process campaigns to only include those with final content
    const campaignsWithFinalContent = await Promise.all(
      campaigns.map(async (campaign) => {
        // Get applications that have finalVideoUrl (NOT null or empty)
        const applications = await CampaignApplication.find({
          campaign: campaign._id,
          finalVideoUrl: { $exists: true, $nin: [null, ""] },
        }).select("finalVideoUrl updatedAt -_id");

        if (applications.length === 0) {
          return null;
        }

        const finalContentData = applications
          .map((app) => ({
            finalVideoUrl: app.finalVideoUrl,
            updatedAt: app.updatedAt,
          }))
          .filter((item) => item.finalVideoUrl && item.finalVideoUrl !== "");

        return {
          _id: campaign._id,
          campaignName: campaign.campaignName,
          campaignTypeCategory: campaign.campaignTypeCategory,
          contentType: campaign.contentRequirements?.contentType,
          contentCategory: campaign.contentRequirements?.contentCategory,
          product: campaign.product
            ? {
                _id: campaign.product._id,
                name: campaign.product.name,
              }
            : null,
          finalVideoUrl: finalContentData,
        };
      })
    );

    // Filter out null campaigns (those without final content)
    const filteredCampaigns = campaignsWithFinalContent.filter(
      (campaign) => campaign !== null
    );

    res.status(200).json({
      success: true,
      data: filteredCampaigns,
      pagination: {
        total: filteredCampaigns.length,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(filteredCampaigns.length / limit),
      },
    });
  } catch (err) {
    logger.error(`Get all final content error: ${err}`);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

export const getAllApplications = async (req, res) => {
  try {
    const applications = await CampaignApplication.find()
      .populate(
        "userId",
        "name email photoUrl campaignsCount rating completedCampaigns"
      )
      .populate("campaign", "campaignName coverImage createdBy");

    // Extract unique createdBy IDs from the populated applications
    const createdByIds = [
      ...new Set(
        applications.map((app) => app.campaign?.createdBy).filter((id) => id) // Remove null/undefined values
      ),
    ];

    // Fetch all campaigns created by those users
    const userCampaigns = await Campaign.find({
      createdBy: { $in: createdByIds },
    })
      .select(
        "_id campaignName coverImage status approvalStatus createdAt createdBy"
      )
      .populate("createdBy", "name email photoUrl")
      .sort({ createdAt: -1 });

    res.status(200).json({
      success: true,
      data: applications,
      userCampaigns: userCampaigns,
    });
  } catch (err) {
    logger.error(`Get all applications error: ${err}`);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};

export const getPendingApplicationsForAdvertiser = async (req, res) => {
  try {
    // const advertiserId = req.user._id;
    const advertiserId = req.params.id;

    // Step 1: Get all campaign IDs created by this advertiser
    const campaigns = await Campaign.find({ createdBy: advertiserId }).select(
      "_id"
    );

    const campaignIds = campaigns.map((c) => c._id);

    // Step 2: Get applications for those campaigns that are in 'pending' state
    const applications = await CampaignApplication.find({
      campaign: { $in: campaignIds },
      applicationStatus: "applied", // Pending approval
    })
      .populate("userId", "name email photoUrl socials campaignsCount")
      .populate("campaign", "campaignName coverImage createdBy");

    const formatted = applications.map((app) => ({
      applicationId: app._id,
      influencerId: app.userId?._id,
      influencerName: app.userId?.name || "N/A",
      avatar: app.userId?.photoUrl || "/assets/avatar.png",
      campaignsCount: app.userId?.campaignsCount || 0,
      campaignId: app.campaign?._id,
      campaignName: app.campaign?.campaignName || "Untitled Campaign",
      campaignThumbnail: app.campaign?.coverImage,
      appliedAt: app.createdAt,
    }));

    res.status(200).json({
      success: true,
      message: "Pending influencer applications fetched",
      data: formatted,
      campaign: campaigns,
    });
  } catch (error) {
    logger.error(`Error fetching pending influencer requests: ${error}`);
    res.status(500).json({
      success: false,
      message: "Something went wrong",
      error: error.message,
    });
  }
};

export const getAdvertiserAppliedApplications = async (req, res) => {
  try {
    const advertiserId = req.params.id;

    // Step 1: Get all campaign IDs created by this advertiser
    const campaigns = await Campaign.find({
      createdBy: advertiserId,
    }).select("_id");

    const campaignIds = campaigns.map((c) => c._id);

    if (campaignIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No campaigns found for this advertiser",
        data: [],
        total: 0,
      });
    }

    // Step 2: Get applications with status "applied" only
    const applications = await CampaignApplication.find({
      campaign: { $in: campaignIds },
      applicationStatus: "applied", // Only pending acceptance
    })
      .populate(
        "userId",
        "name email photoUrl bio addresses referenceContent instagram tiktok"
      )
      .populate(
        "campaign",
        "campaignName coverImage createdBy description compensation"
      );

    // Step 3: Process each application to calculate rating, total campaigns, and completed jobs
    const processedApplications = await Promise.all(
      applications.map(async (app) => {
        // Calculate rating from reviews
        const reviews = await InfluencerReview.find({
          influencerId: app.userId._id,
        }).populate("campaignId", "campaignName");

        const averageRating = reviews.length
          ? (
              reviews.reduce((sum, r) => sum + (r.rating || 0), 0) /
              reviews.length
            ).toFixed(1)
          : null;

        // Calculate total campaigns count
        const totalCampaignsCount = await CampaignApplication.countDocuments({
          userId: app.userId._id,
        });

        // Calculate completed jobs count
        const completedJobsCount = await CampaignApplication.countDocuments({
          userId: app.userId._id,
          applicationStatus: "approved",
          jobTimelineStatus: "job_completed",
        });

        return {
          _id: app._id,
          influencer: {
            _id: app.userId._id,
            name: app.userId.name,
            email: app.userId.email,
            photoUrl: app.userId.photoUrl,
            bio: app.userId.bio,
            rating: averageRating,
            totalCampaigns: totalCampaignsCount,
            completedJobs: completedJobsCount,
            reviews: reviews.map((r) => ({
              rating: r.rating,
              comment: r.comment,
              reviewer: r.reviewerName,
              campaignName: r.campaignId?.campaignName || "",
              date: r.createdAt,
            })),
          },
          campaign: {
            _id: app.campaign._id,
            campaignName: app.campaign.campaignName,
            coverImage: app.campaign.coverImage,
            createdBy: app.campaign.createdBy,
            description: app.campaign.description,
            compensation: app.campaign.compensation,
          },
          address: app.address,
          comments: app.comments,
          applicationStatus: app.applicationStatus,
          appliedAt: app.appliedAt,
          createdAt: app.createdAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      message:
        "Applied applications for advertiser's campaigns fetched successfully",
      data: processedApplications,
      total: processedApplications.length,
      advertiserCampaigns: campaigns.length,
    });
  } catch (err) {
    logger.error(`Get advertiser applied applications error: ${err}`);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

export const getAdvertiserTodo = async (req, res) => {
  try {
    // const advertiserId = req.user._id;
    const advertiserId = req.params.id;

    // Step 1: Get all campaigns created by this advertiser
    const campaigns = await Campaign.find({
      createdBy: advertiserId,
    }).select("_id campaignName coverImage status approvalStatus");

    const campaignIds = campaigns.map((c) => c._id);

    if (campaignIds.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No campaigns found for this advertiser",
        data: {
          pendingAcceptances: [],
          pendingContentApprovals: [],
          pendingShipments: [],
          summary: {
            totalCampaigns: 0,
            pendingAcceptances: 0,
            pendingContentApprovals: 0,
            pendingShipments: 0,
            totalTodos: 0,
          },
        },
      });
    }

    // Step 2: Get applications that need acceptance (status: "applied")
    const pendingAcceptances = await CampaignApplication.find({
      campaign: { $in: campaignIds },
      applicationStatus: { $ne: "completed" },
      jobTimelineStatus: { $ne: "job_started" },
    })
      .populate("userId", "_id name email photoUrl bio rating")
      .populate("campaign", "campaignName coverImage compensation")
      .sort({ createdAt: -1 });

    // Step 3: Get content that needs approval (contentApprovalStatus: "submitted")
    // const pendingContentApprovals = await CampaignApplication.find({
    //   campaign: { $in: campaignIds },
    //   contentApprovalStatus: "submitted",
    // })
    // .populate("userId", "_id name email photoUrl")
    // .populate("campaign", "campaignName coverImage")
    // .sort({ createdAt: -1 });

    // Step 4: Get shipments with pending status
    const pendingShipments = await Shipment.find({
      campaignId: { $in: campaignIds },
      status: { $in: ["pending", "processing", "shipped"] },
    })
      .populate("userId", "_id name email photoUrl")
      .populate("campaignId", "campaignName coverImage")
      .sort({ createdAt: -1 });

    // Step 5: Process pending acceptances
    const processedAcceptances = await Promise.all(
      pendingAcceptances
        .filter((app) => app.userId && app.campaign)
        .map(async (app) => {
          // Calculate influencer stats
          if (!app.userId || !app.campaign) return null;
          const completedCampaignsCount =
            await CampaignApplication.countDocuments({
              userId: app.userId._id,
              applicationStatus: "approved",
              jobTimelineStatus: "job_completed",
            });

          const totalCampaignsCount = await CampaignApplication.countDocuments({
            userId: app.userId._id,
          });

          return {
            _id: app._id,
            influencer: {
              _id: app.userId._id,
              name: app.userId.name,
              email: app.userId.email,
              photoUrl: app.userId.photoUrl,
              bio: app.userId.bio,
              rating: app.userId.rating,
              completedCampaigns: completedCampaignsCount,
              totalCampaigns: totalCampaignsCount,
            },
            campaign: {
              applicationStatus: app.applicationStatus,
              jobTimelineStatus: app.jobTimelineStatus,
              _id: app.campaign._id,
              campaignName: app.campaign.campaignName,
              coverImage: app.campaign.coverImage,
              compensation: app.campaign.compensation,
            },
            appliedAt: app.appliedAt,
            createdAt: app.createdAt,
            actionRequired: "Accept or reject influencer application",
          };
        })
    );

    // Step 6: Process pending content approvals
    // const processedContentApprovals = pendingContentApprovals.map((app) => ({
    //   _id: app._id,
    //   influencer: {
    //     _id: app.userId._id,
    //     name: app.userId.name,
    //     email: app.userId.email,
    //     photoUrl: app.userId.photoUrl,
    //   },
    //   campaign: {
    //     _id: app.campaign._id,
    //     campaignName: app.campaign.campaignName,
    //     coverImage: app.campaign.coverImage,
    //   },
    //   contentDeadline: app.contentDeadline,
    //   videoUrls: app.videoUrls || [],
    //   exampleMediaUrls: app.exampleMediaUrls || [],
    //   createdAt: app.createdAt,
    //   actionRequired: "Review and approve/reject content",
    // }));

    // Step 7: Process pending shipments
    // const processedShipments = pendingShipments.map(shipment => ({
    //   _id: shipment._id,
    //   influencer: {
    //     _id: shipment.userId._id,
    //     name: shipment.userId.name,
    //     email: shipment.userId.email,
    //     photoUrl: shipment.userId.photoUrl
    //   },
    //   campaign: {
    //     _id: shipment.campaignId._id,
    //     campaignName: shipment.campaignId.campaignName,
    //     coverImage: shipment.campaignId.coverImage
    //   },
    //   shipmentStatus: shipment.status,
    //   trackingNumber: shipment.trackingNumber,
    //   carrierSlug: shipment.carrierSlug,
    //   trackingUrl: shipment.trackingUrl,
    //   createdAt: shipment.createdAt,
    //   actionRequired: shipment.status === "pending" ?
    //     "Process shipment" :
    //     "Track shipment status"
    // }));

    const processedShipments = pendingShipments
      .filter((shipment) => shipment.userId && shipment.campaignId)
      .map((shipment) => ({
        _id: shipment._id,
        influencer: {
          _id: shipment.userId._id,
          name: shipment.userId.name,
          email: shipment.userId.email,
          photoUrl: shipment.userId.photoUrl,
        },
        applicationId: shipment.applicationId,
        campaign: {
          _id: shipment.campaignId._id,
          campaignName: shipment.campaignId.campaignName,
          coverImage: shipment.campaignId.coverImage,
        },
        shipmentStatus: shipment.status,
        trackingNumber: shipment.trackingNumber,
        carrierSlug: shipment.carrierSlug,
        trackingUrl: shipment.trackingUrl,
        createdAt: shipment.createdAt,
        actionRequired:
          shipment.status === "pending"
            ? "Process shipment"
            : "Track shipment status",
      }));

    // Step 8: Calculate summary
    const summary = {
      totalCampaigns: campaigns.length,
      pendingAcceptances: processedAcceptances.length,
      // pendingContentApprovals: processedContentApprovals.length,
      pendingShipments: processedShipments.length,
      totalTodos:
        processedAcceptances.length +
        // processedContentApprovals.length +
        processedShipments.length,
    };

    res.status(200).json({
      success: true,
      message: "Advertiser TODO items fetched successfully",
      data: {
        pendingAcceptances: processedAcceptances,
        // pendingContentApprovals: processedContentApprovals,
        pendingShipments: processedShipments,
        summary,
      },
    });
  } catch (err) {
    logger.error(`Get advertiser TODO error: ${err}`);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};

export const testAdvertiserData = async (req, res) => {
  try {
    const advertiserId = req.query.id;

    logger.info(`Testing advertiser ID: ${advertiserId}`);

    // Get campaigns
    const campaigns = await Campaign.find({ createdBy: advertiserId });
    logger.info(`Campaigns found: ${campaigns.length}`);

    // Get campaign IDs
    const campaignIds = campaigns.map((c) => c._id);
    logger.info(`Campaign IDs: ${campaignIds}`);

    // Get ALL applications for these campaigns
    const allApplications = await CampaignApplication.find({
      campaign: { $in: campaignIds },
    });
    logger.info(`All applications: ${allApplications.length}`);

    // Get applications with status "applied"
    const appliedApplications = await CampaignApplication.find({
      campaign: { $in: campaignIds },
      applicationStatus: "applied",
    });
    logger.info(`Applied applications: ${appliedApplications.length}`);

    // Check specific campaign
    const specificCampaign = await CampaignApplication.find({
      campaign: "6870fcebe8c05ff2c27cb5c3",
    });
    logger.info(`Specific campaign applications: ${specificCampaign.length}`);

    res.json({
      advertiserId,
      campaigns: campaigns.map((c) => ({
        _id: c._id,
        name: c.campaignName,
        createdBy: c.createdBy,
      })),
      campaignIds: campaignIds,
      allApplicationsCount: allApplications.length,
      appliedApplicationsCount: appliedApplications.length,
      allApplications: allApplications.map((a) => ({
        _id: a._id,
        campaign: a.campaign,
        status: a.applicationStatus,
      })),
      specificCampaignApplications: specificCampaign.map((a) => ({
        _id: a._id,
        campaign: a.campaign,
        status: a.applicationStatus,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getCampaignByFilter = async (req, res) => {
  try {
    const { filters } = req.query;
    if (!filters) {
      return res
        .status(400)
        .json({ success: false, message: "filters query param is required" });
    }

    const contentCategories = filters
      .split(",")
      .map((type) => type.trim())
      .filter(Boolean);

    if (contentCategories.length === 0) {
      return res
        .status(400)
        .json({ success: false, message: "No valid content types provided" });
    }

    const campaigns = await Campaign.find({
      "contentRequirements.contentCategory": { $in: contentCategories },
    });

    res
      .status(200)
      .json({ success: true, data: campaigns, total: campaigns.length });
  } catch (err) {
    logger.error(`Error fetching campaigns by filter: ${err}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns by filter",
      error: err.message,
    });
  }
};

export async function requestContentResubmission(req, res) {
  try {
    logger.info("Content resubmission request started");
    const { id } = req.params;
    const { reason } = req.body;
    const advertiserId = req.user._id.toString();

    const app = await CampaignApplication.findById(id)
      .populate("userId", "name email")
      .populate("campaign", "campaignName createdBy");

    if (!app) {
      logger.error(`Application not found: ${id}`);
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });
    }

    logger.info(
      `Application found: ${app.userId.name} ${app.campaign.campaignName}`
    );

    app.contentApprovalStatus = "resubmission";
    app.publishStatus = "notPublish";
    app.reviewNotes = reason || "No reason provided";
    app.jobTimelineStatus = "resubmission";

    await app.save();
    logger.info("Application updated with resubmission request");

    // Send email to influencer
    logger.info("Sending resubmission request email...");
    try {
      const emailResult = await sendContentResubmissionEmail(
        app.userId.email,
        app.campaign._id,
        reason
      );

      if (!emailResult.success) {
        logger.error(`Failed to send resubmission email: ${emailResult.error}`);
      } else {
        logger.info("Resubmission request email sent successfully");
      }
    } catch (emailError) {
      logger.error(`Error sending resubmission email: ${emailError}`);
      // Don't fail the process if email fails
    }

    // Create notification for influencer
    logger.info("Creating content resubmission notification...");
    try {
      await notificationService.createContentResubmissionNotification(
        app,
        reason,
        advertiserId
      );
      logger.info("Content resubmission notification sent successfully!");
    } catch (notificationError) {
      logger.error(
        `Content resubmission notification error: ${notificationError}`
      );
      // Don't fail the resubmission if notification fails
    }

    res.json({
      success: true,
      message: "Content resubmission requested",
      data: {
        applicationId: app._id,
        status: app.contentApprovalStatus,
        reason: app.reviewNotes,
      },
    });
  } catch (err) {
    logger.error(`Error requesting resubmission: ${err}`);
    res.status(500).json({ success: false, error: err.message });
  }
}

// Add these new controller functions

export const submitPostLink = async (req, res) => {
  try {
    const { applicationId, postLink } = req.body;

    if (!applicationId || !postLink) {
      return res.status(400).json({
        success: false,
        message: "Application ID and post link are required",
      });
    }

    const application = await CampaignApplication.findById(applicationId)
      .populate("campaign", "campaignStrategy campaignName")
      .populate("userId", "email");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    logger.info(`Application: ${application}`);

    if (application.campaign.campaignStrategy !== "Content + Posting") {
      return res.status(400).json({
        success: false,
        message: "This campaign does not require post link submission",
      });
    }

    if (application.jobTimelineStatus !== "content_accepted") {
      return res.status(400).json({
        success: false,
        message: "Cannot submit post link at this stage",
      });
    }

    // if (application.jobTimelineStatus !== "video_posted") {
    //   return res.status(400).json({
    //     success: false,
    //     message: "Cannot submit post link at this stage",
    //   });
    // }

    // Update application with post link
    application.postLink = postLink;
    application.jobTimelineStatus = "pending_post_approval";
    await application.save();

    return res.status(200).json({
      success: true,
      message: "Post link submitted successfully",
      data: {
        applicationId: application._id,
        postLink,
        status: application.jobTimelineStatus,
      },
    });
  } catch (error) {
    logger.error(`Error submitting post link: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Failed to submit post link",
      error: error.message,
    });
  }
};

export const approvePostLink = async (req, res) => {
  try {
    const { applicationId, approved } = req.body;

    if (!applicationId) {
      return res.status(400).json({
        success: false,
        message: "Application ID is required",
      });
    }

    const application = await CampaignApplication.findById(applicationId)
      .populate("campaign", "campaignStrategy campaignName")
      .populate("userId", "email");

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    if (application.jobTimelineStatus !== "pending_post_approval") {
      return res.status(400).json({
        success: false,
        message: "Cannot approve post link at this stage",
      });
    }

    if (approved) {
      // Update application status
      application.jobTimelineStatus = "post_link_approved";
      application.applicationStatus = "completed";
      await application.save();

      createTransactionAndUpdateWallet(
        applicationId,
        application.userId._id,
        application.campaign._id
      );

      return res.status(200).json({
        success: true,
        message: "Post link approved and campaign completed",
        data: {
          applicationId: application._id,
          status: application.jobTimelineStatus,
        },
      });
    } else {
      // If not approved, reset the status to pending_post_link
      application.jobTimelineStatus = "pending_post_link";
      application.postLink = null; // Clear the rejected post link
      await application.save();

      // TODO: Uncomment this when notification service is ready

      // const notificationData = {
      //   userId: application.userId._id,
      //   type: "post_link_rejected",
      //   title: "Post Link Rejected",
      //   message: "Your post link was not approved. Please submit a new link.",
      //   campaignId: application.campaign._id,
      // };

      // await createNotification(notificationData);

      return res.status(200).json({
        success: true,
        message: "Post link rejected",
        data: {
          applicationId: application._id,
          status: application.jobTimelineStatus,
        },
      });
    }
  } catch (error) {
    logger.error(`Error approving post link: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Failed to approve post link",
      error: error.message,
    });
  }
};

export const updateCampaignStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    if (!["active", "paused"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Status must be either 'active' or 'paused'",
      });
    }

    const campaign = await Campaign.findById(id);

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found",
      });
    }

    // Check if user has permission (admin or campaign owner)
    if (campaign.createdBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: "You don't have permission to update this campaign",
      });
    }

    campaign.campaignStatus = status;
    await campaign.save();

    res.status(200).json({
      success: true,
      message: `Campaign ${
        status === "paused" ? "paused" : "activated"
      } successfully`,
      data: campaign,
    });
  } catch (error) {
    logger.error(`Error in updateCampaignStatus: ${error}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getRecentCompletedApplications = async (req, res) => {
  try {
    const userId = req.user.id;

    const recentApplications = await CampaignApplication.find({
      userId: userId,
      jobTimelineStatus: "job_completed",
    })
      .populate(
        "campaign",
        "campaignName campaignStrategy coverImage contentRequirements.contentType compensation"
      )
      .sort({ createdAt: -1 })
      .limit(10)
      .select("campaign appliedAt finalVideoUrl");

    if (!recentApplications || recentApplications.length === 0) {
      return res.status(200).json({
        success: true,
        message: "No completed applications found",
      });
    }

    const total = await CampaignApplication.countDocuments({
      userId: userId,
      jobTimelineStatus: "job_completed",
    });

    const transformedApplications = recentApplications.map((app) => ({
      campaignName: app.campaign?.campaignName,
      campaignStrategy: app.campaign?.campaignStrategy,
      coverImage: app.campaign?.coverImage,
      finalVideoUrl: app.finalVideoUrl,
      contentType: app.campaign?.contentRequirements?.contentType,
      compensation: app.campaign?.compensation,
      appliedAt: app.appliedAt,
    }));

    return res.status(200).json({
      success: true,
      message: "Recent completed applications retrieved successfully",
      data: transformedApplications,
      total: total,
    });
  } catch (error) {
    logger.error(`Error fetching recent completed applications: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getAdminTodo = async (req, res) => {
  try {
    // Only admin and superadmin can access
    // if (!["admin", "superadmin"].includes(req.user.role)) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "Access denied. Admin privileges required."
    //   });
    // }

    // Fetch pending campaigns
    const pendingCampaigns = await Campaign.find({
      approvalStatus: "Pending",
    })
      .populate("createdBy", "name email photoUrl")
      .sort({ createdAt: -1 })
      .select(
        "campaignName campaignStrategy contentRequirements compensation coverImage description createdBy createdAt"
      ).limit(5)

    // Fetch pending user certifications
    const pendingCertifications = await UserCertification.find({
      status: "pending",
    })
      .populate("userId", "name email photoUrl")
      .populate("certificationId", "name platform description")
      .sort({ createdAt: -1 })
      .select("userId certificationId platform appliedAt fileUrl")
      .limit(5)

    return res.status(200).json({
      success: true,
      message: "Admin todo items retrieved successfully",
      data: {
        pendingCampaigns: pendingCampaigns.map((campaign) => ({
          _id: campaign._id,
          campaignName: campaign.campaignName,
          campaignStrategy: campaign.campaignStrategy,
          coverImage: campaign.coverImage,
          description: campaign.description,
          contentRequirements: campaign.contentRequirements,
          compensation: campaign.compensation,
          createdBy: campaign.createdBy
            ? {
                _id: campaign.createdBy._id,
                name: campaign.createdBy.name,
                email: campaign.createdBy.email,
                photoUrl: campaign.createdBy.photoUrl,
              }
            : null,
          createdAt: campaign.createdAt,
        })),
        pendingCertifications: pendingCertifications.map((cert) => ({
          _id: cert._id,
          user: cert.userId
            ? {
                _id: cert.userId._id,
                name: cert.userId.name,
                email: cert.userId.email,
                photoUrl: cert.userId.photoUrl,
              }
            : null,
          certification: cert.certificationId
            ? {
                _id: cert.certificationId._id,
                name: cert.certificationId.name,
                platform: cert.certificationId.platform,
                description: cert.certificationId.description,
              }
            : null,
          platform: cert.platform,
          appliedAt: cert.appliedAt,
          fileUrl: cert.fileUrl,
        })),
      },
    });
  } catch (error) {
    logger.error(`Error fetching admin todo items: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const deleteVideoUrl = async (req, res) => {
  try {
    const { applicationId, videoUrlId } = req.params;

    if (!applicationId || !videoUrlId) {
      return res.status(400).json({
        success: false,
        message: "Application ID and video URL ID are required",
      });
    }

    // Find the application and verify it exists
    const application = await CampaignApplication.findById(applicationId);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: "Campaign application not found",
      });
    }

    // Find the video URL entry to delete
    const videoUrlIndex = application.videoUrls.findIndex(
      (video) => video._id.toString() === videoUrlId
    );

    if (videoUrlIndex === -1) {
      return res.status(404).json({
        success: false,
        message: "Video URL entry not found",
      });
    }

    // Get the actual S3 URL before removing the entry
    const videoUrlToDelete = application.videoUrls[videoUrlIndex];
    const s3FileUrl = videoUrlToDelete.url;

    // Remove the video URL entry from the array
    application.videoUrls.splice(videoUrlIndex, 1);

    // Delete the file from S3 using the actual URL
    if (s3FileUrl) {
      try {
        await deleteFileFromS3(s3FileUrl);
      } catch (s3Error) {
        logger.error(`Error deleting file from S3: ${s3Error}`);
        // Don't fail the entire operation if S3 deletion fails
      }
    }

    // Check if videoUrls array is empty and update jobTimelineStatus accordingly
    if (
      application.videoUrls.length === 0 &&
      application.jobTimelineStatus === "content_uploaded"
    ) {
      application.jobTimelineStatus = "job_started";
    }

    // Save the updated application
    await application.save();

    return res.status(200).json({
      success: true,
      message: "Video URL entry deleted successfully",
      data: {
        deletedVideoUrlId: videoUrlId,
        remainingVideoUrls: application.videoUrls.length,
      },
    });
  } catch (error) {
    logger.error(`Error deleting video URL entry: ${error}`);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
