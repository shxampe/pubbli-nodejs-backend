import User from "../models/User.js";
import updateUserValidation from "../validations/updateUserValidation.js";
import { deleteFileFromS3, uploadFileToS3 } from "../utils/s3Config.js";
import { photoUrlConverter } from "../utils/photoUrlConverter.js";
import bcrypt from "bcryptjs";
// import { accountDeletionTemplate } from "../misc/mail-templates.js";
// import config from "../config/appconfig.js";
import Campaign from "../models/CampaignModel.js";
import CampaignApplication from "../models/CampaignApplication.js";
import InfluencerReview from "../models/InfluencerReview.js";
import UserCertification from "../models/UserCertificationModel.js";
import Shipment from "../models/Shipment.js";
import Brand from "../models/BrandModel.js";
import Product from "../models/ProductModel.js";
const DEFAULT_AVATAR = "https://www.gravatar.com/avatar/?d=mp";
import mongoose from "mongoose";
import Wallet from "../models/WalletModel.js";
import OTP from "../models/Otp.js";
import { logger } from "../utils/logger.js";
import { sendRegisterOtp } from "../utils/loopsService.js";

export async function getAllUsers(req, res) {
  const { role } = req.query;

  const acceptableRoles = ["influencer", "advertiser"];
  if (role && !acceptableRoles.includes(role)) {
    return res.status(400).json({ error: "Invalid role", success: false });
  }

  try {
    const matchCriteria = { role: { $ne: "superadmin" } };
    if (role) {
      matchCriteria.role = role;
    }

    const users = await User.find(matchCriteria).select("-password");

    const enhancedUsers = await Promise.all(
      users.map(async (user) => {
        let advertiserCampaignsInsights = {};
        let influencerCertifications = {};
        let InfluencerCampaignsInsights = {};
        let advertiserBrands = [];
        let advertiserProducts = [];
        let influencerSocials;

        if (user.role === "advertiser") {
          let advertiserCampaigns = await Campaign.find(
            {
              createdBy: user._id,
            },
            "campaignStatus"
          );
          advertiserCampaignsInsights = {
            totalCampaigns: advertiserCampaigns.length,
            totalCampaignsCompleted: advertiserCampaigns.filter(
              (campaign) => campaign.campaignStatus === "completed"
            ).length,
            totalCampaignsActive: advertiserCampaigns.filter(
              (campaign) => campaign.campaignStatus === "active"
            ).length,
            totalCampaignsPending: advertiserCampaigns.filter(
              (campaign) => campaign.campaignStatus === "pending"
            ).length,
          };
          advertiserBrands = await Brand.find({ createdBy: user._id });
          advertiserProducts = await Product.find({ createdBy: user._id });
        }

        if (user.role === "influencer") {
          const influencerCampaigns = await CampaignApplication.find(
            {
              userId: user._id,
            },
            "applicationStatus campaignId"
          );
          InfluencerCampaignsInsights = {
            totalApplications: influencerCampaigns.length,
            totalApplicationsCompleted: influencerCampaigns.filter(
              (app) => app.applicationStatus === "completed"
            ).length,
            totalApplicationsApproved: influencerCampaigns.filter(
              (app) => app.applicationStatus === "approved"
            ).length,
          };
          influencerCertifications = await UserCertification.find({
            userId: user._id,
          });

          influencerSocials = {};

          if (user.instagram && user.instagram.connected) {
            influencerSocials.instagram = user.instagram.profile_name;
          }

          if (user.tiktok && user.tiktok.connected) {
            influencerSocials.tiktok = user.tiktok.tiktok_user_id;
          }
          if (user.youtube && user.youtube.connected) {
            influencerSocials.youtube = user.youtube.youtube_channel_url;
          }
        }
        const userWallet = await Wallet.findOne({ userId: user._id });

        return {
          _id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status || "active",
          advertiserCampaignsInsights,
          InfluencerCampaignsInsights,
          createdAt: user.createdAt,
          photoUrl: user.photoUrl || DEFAULT_AVATAR,
          influencerCertifications,
          wallet: userWallet,
          advertiserBrands,
          advertiserProducts,
          influencerSocials,
        };
      })
    );

    return res.status(200).json({ success: true, users: enhancedUsers });
  } catch (error) {
    logger.error(`Error fetching users: ${error.message}`);
    return res
      .status(500)
      .json({ error: "Error fetching users", success: false });
  }
}

export async function getAllUsersByRole(req, res) {
  const { role } = req.query;

  const users = await User.find({ role })
    .select(
      "name photoUrl instagram.connected instagram.profile_followers tiktok.connected tiktok.profile_followers"
    )
    .lean();
  const reviews =
    role === "influencer"
      ? await InfluencerReview.find({
          influencerId: { $in: users.map((user) => user._id) },
        })
      : null;
  const enhancedUsers = users.map((user) => {
    const userReviews = reviews
      ? reviews.filter(
          (review) => review.influencerId.toString() === user._id.toString()
        )
      : null;
    return {
      ...user,
      reviews: userReviews || null,
    };
  });
  res.status(200).json({ success: true, users: enhancedUsers });
}

// export async function completeProfile(req, res) {
//   const userId = req.user._id;
//   const {
//     name,
//     phone,
//     bio,
//     dob,
//     gender,
//     addressLine1,
//     addressLine2,
//     country,
//     state,
//     city,
//     zip,
//   } = req.body;
//   const user = await User.findById(userId);
//   if (!user) {
//     return res.status(404).json({ error: "User not found", success: false });
//   }
//   if (req.file) {
//     if (user.photoUrl) {
//       await deleteFileFromS3(user.photoUrl);
//     }
//     const imageUrl = await uploadFileToS3("profile", req.file);
//     user.photoUrl = imageUrl;
//   }
//   user.isProfileCompleted = true;
//   user.name = name;
//   user.phone = phone;
//   user.bio = bio;
//   user.dob = dob;
//   user.gender = gender;

//   // Create address object from req.body fields
//   const newAddress = {
//     type: "Home", // Default type
//     country,
//     state,
//     city,
//     zip,
//     addressLine1,
//     addressLine2,
//     addedAt: new Date(),
//   };

//   // Clear existing addresses and add the new one
//   user.addresses = [newAddress];

//   await user.save();

//   // const token = jwt.sign(
//   //   {
//   //     userId: user._id,
//   //     email: user.email,
//   //     role: user.role,
//   //   },
//   //   config.auth.jwt_secret,
//   //   { expiresIn: "7 days" }
//   // );

//   res.status(200).json({
//     success: true,
//     message: "Profile completed",
//     addresses: user.addresses,
//     // token: token
//   });
// }

export async function completeProfile(req, res) {
  const userId = req.user._id;
  const {
    name,
    phone,
    bio,
    dob,
    gender,
    addressLine1,
    addressLine2,
    country,
    state,
    city,
    zip,
  } = req.body;

  try {
    // Prepare update object
    const updateData = {
      isProfileCompleted: true,
      name,
      phone,
      bio,
      dob,
      gender,
      addresses: [
        {
          type: "Home",
          country,
          state,
          city,
          zip,
          addressLine1,
          addressLine2,
          addedAt: new Date(),
        },
      ],
    };

    // Handle profile photo
    if (req.file) {
      const existingUser = await User.findById(userId);
      if (!existingUser) {
        return res.status(404).json({ error: "User not found", success: false });
      }

      if (existingUser.photoUrl) {
        await deleteFileFromS3(existingUser.photoUrl);
      }

      const imageUrl = await uploadFileToS3("profile", req.file);
      updateData.photoUrl = imageUrl;
    }

    // Update user atomically
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true } // return updated doc
    );

    if (!updatedUser) {
      return res.status(404).json({ error: "User not found", success: false });
    }

    res.status(200).json({
      success: true,
      message: "Profile completed",
      addresses: updatedUser.addresses,
      photoUrl: updatedUser.photoUrl,
    });
  } catch (err) {
    console.error("Error completing profile:", err);
    res.status(500).json({ error: "Server error", success: false });
  }
}


export async function removeUser(req, res) {
  const { id } = req.params;

  const { status } = req.body;
  // const { reason, status } = req.body;

  try {
    const user = await User.findByIdAndUpdate(id, { status: status });
    if (!user) {
      return res.status(404).json({ error: "User not found", success: false });
    }
    // if (user.photoUrl && !user.photoUrl.includes("avatar.png")) {
    //   await deleteFileFromS3(user.photoUrl);
    // }

    // const accDelTemplate = accountDeletionTemplate(reason);
    // let senderEmail = config.nodemailer.sender_mail;

    // await sendEmail(
    //   senderEmail,
    //   user.email,
    //   "Account Deletion Reason",
    //   accDelTemplate
    // );

    return res.status(200).json({ success: true, message: "User removed" });
  } catch (error) {
    logger.error(`Error removing user: ${error.message}`);
    return res
      .status(500)
      .json({ error: "Error removing user", success: false });
  }
}

export async function updateUser(req, res) {
  const { error } = updateUserValidation(req.body);
  if (error) {
    return res
      .status(400)
      .json({ error: error.details[0].message, success: false });
  }

  const { userId } = req.params;
  const { name, phone, password, role, email, isPrivate, reviewsShown } =
    req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found", success: false });
    }

    let imageUrl = user.photoUrl;
    if (req.file) {
      if (user.photoUrl) {
        await deleteFileFromS3(user.photoUrl);
      }
      imageUrl = await uploadFileToS3("profile", req.file);
      user.photoUrl = imageUrl;
    }

    if (name) user.name = name;
    if (phone) user.phone = phone;
    if (password) user.password = await bcrypt.hash(password, 10);
    if (role) user.role = role;
    if (email) user.email = email;
    if (isPrivate) user.isPrivate = isPrivate;
    if (reviewsShown) user.reviewsShown = reviewsShown;
    let updatedPhotoUrl = photoUrlConverter(user.photoUrl);

    await user.save();

    return res.json({
      message: "Profile updated successfully",
      success: true,
      updatedUser: { ...user._doc, photoUrl: updatedPhotoUrl },
    });
  } catch (err) {
    logger.error(`Error during profile update: ${err.message}`);
    return res.status(500).json({
      error: `Internal server error: ${JSON.stringify(err.errors)}`,
      success: false,
    });
  }
}

export async function updateProfile(req, res) {
  const { error } = updateUserValidation(req.body);
  if (error) {
    return res
      .status(400)
      .json({ error: error.details[0].message, success: false });
  }

  const UserData = req.user;

  const userId = UserData._id.toString();
  const { name, bio, isPrivate, reviewsShown, phone, gender, dob } = req.body;

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found", success: false });
    }

    let imageUrl = user.photoUrl;
    if (req.file) {
      if (user.photoUrl) {
        await deleteFileFromS3(user.photoUrl);
      }
      imageUrl = await uploadFileToS3("profile", req.file);
      user.photoUrl = imageUrl;
    }

    if (name) user.name = name;
    if (typeof bio !== "undefined") user.bio = bio;
    if (isPrivate) user.isPrivate = isPrivate;
    if (reviewsShown) user.reviewsShown = reviewsShown;
    if (phone) user.phone = phone;
    // if (gender) user.gender = gender;
    // if (dob) user.dob = dob;

    if (typeof gender !== "undefined") user.gender = gender;
    if (typeof dob !== "undefined") user.dob = dob;

    let updatedPhotoUrl = photoUrlConverter(user.photoUrl);

    await user.save();

    return res.json({
      message: "Profile updated successfully",
      success: true,
      updatedUser: { ...user._doc, photoUrl: updatedPhotoUrl },
    });
  } catch (err) {
    logger.error(`Error during profile update: ${err.message}`);
    return res
      .status(500)
      .json({ error: "Internal server error", success: false });
  }
}

export const getCurrentUser = async (req, res) => {
  try {
    const user = req.user;

    // fetch wallet amount
    const wallet = await Wallet.findOne(
      { userId: user?._id },
      { available_coins: 1 }
    );

    logger.info(`wallet:`, wallet);

    // 2. Fetch user's campaigns/applications
    const applications = await CampaignApplication.find({ userId: user._id })
      .populate(
        "campaign",
        "campaignName postingSchedule compensation campaignType campaignStatus"
      )
      .sort({ createdAt: -1 });

    const campaignList = applications.map((app) => ({
      campaignId: app.campaign?._id,
      title: app.campaign?.campaignName || "Untitled",
      campaignType: app.campaign?.campaignType || "Unknown",
      campaignStatus: app.campaign?.campaignStatus || "Unknown",
      publishStatus: app.publishStatus,
      paymentStatus: app.paymentStatus,
      contentShared: app.contentShared || false,
      fee: app.campaign?.compensation?.amount || 0,
      timeline: app.campaign?.postingSchedule || {},
    }));

    // 3. Reviews (if influencer)
    let reviewsList = [];
    let totalReviews = 0;

    if (user.role === "influencer") {
      const reviews = await InfluencerReview.find({ influencerId: user._id })
        .populate("advertiserId", "name email photoUrl role")
        .populate("campaignId", "coverImage")
        .populate("applicationId", "finalVideoUrl")

        .sort({ createdAt: -1 });

      reviewsList = reviews.map((rev) => ({
        reviewId: rev._id,
        rating: rev.rating,
        comment: rev.comment,
        createdAt: rev.createdAt,
        reviewer: {
          id: rev.advertiserId?._id,
          name: rev.advertiserId?.name,
          email: rev.advertiserId?.email,
          photoUrl: rev.advertiserId?.photoUrl,
          role: rev.advertiserId?.role,
        },
        coverImage: rev.campaignId?.coverImage,
        finalVideoUrl: rev.applicationId?.finalVideoUrl,
      }));

      totalReviews = reviews.length;
    }

    // 4. User addresses
    const addresses = (user.addresses || []).map((addr) => ({
      addressId: addr._id,
      type: addr.type,
      country: addr.country,
      state: addr.state,
      city: addr.city,
      zip: addr.zip,
      addressLine1: addr.addressLine1,
      addressLine2: addr.addressLine2,
      addedAt: addr.addedAt,
    }));

    // 5. Reference content
    const referenceContent = (user.referenceContent || []).map((ref) => ({
      id: ref._id,
      type: ref.type,
      url: ref.url,
      uploadedAt: ref.uploadedAt,
    }));

    // 9. Final response
    res.status(200).json({
      success: true,
      data: {
        influencer: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || null,
          wallet: wallet,
          status: user.status,
          isPrivate: user.isPrivate,
          reviewsShown: user.reviewsShown,
          isOnboardingComplete: user.isOnboardingComplete,
          isProfileCompleted: user.isProfileCompleted,
          preferedCategories: user.preferedCategories || [],
          isCategoriesSet: user.isCategoriesSet,
          isEmailVerified: user.isEmailVerified,
          certificates : user.certificates,

          photoUrl:
            user.photoUrl ||
            "https://pubbli-bucket.s3.us-east-2.amazonaws.com/profile/1750676731514.svg",
          bio: user.bio || "",
          dob: user.dob || "",
          gender: user.gender || "",
          role: user.role,
          followers: user.followers || 0,
          posts: user.posts || 0,
          likes: user.likes || 0,
          comments: user.comments || 0,
          engagementRate: user.engagementRate || 0,
          totalReviews,
          addresses,
          referenceContent,
          connectedAccounts: {
            tiktok: user.tiktok,
            instagram: user.instagram,
            youtube: user.youtube,
          },
        },
        campaigns: campaignList,
        reviews: reviewsList,
      },
    });
  } catch (err) {
    logger.error(`Error getting current user detail: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

export const getSocialMediaAccounts = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid or missing influencer ID",
    });
  }
  const user = await User.findById(req.params.id).select("-password");
  res.status(200).json({ success: true, data: user });
};
export const getAdvertiserDetailsById = async (req, res) => {
  const { id } = req.params;

  try {
    const user = await User.findById(id).select("-password");
    if (!user || user.role !== "advertiser") {
      return res
        .status(404)
        .json({ success: false, message: "Advertiser not found" });
    }

    const campaigns = await Campaign.find({ createdBy: id })
      .populate({
        path: "product",
        populate: {
          path: "brandId",
          model: "Brand",
          select: "brandName",
        },
      })
      .populate("createdBy", "name email photoUrl")
      .sort({ createdAt: -1 });

    const campaignSummary = {
      Pending: 0,
      Approved: 0,
      Rejected: 0,
    };

    campaigns.forEach((camp) => {
      const summaryKey = camp.approvalStatus || "Pending";
      if (summaryKey in campaignSummary) {
        campaignSummary[summaryKey]++;
      }
    });

    const campaignsWithApplications = await Promise.all(
      campaigns.map(async (campaign) => {
        const applications = await CampaignApplication.find({
          campaign: campaign._id,
        })
          .populate("userId", "name email profilePic")
          .sort({ createdAt: -1 });

        // Get shipment details for this campaign (if it has a product)
        const shipmentDetails = campaign.product
          ? await Shipment.find({
              campaignId: campaign._id,
            })
          : [];

        // Enrich each shipment with product name, userId, influencerName
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

        return {
          ...campaign.toObject(),
          applications,
          shipments: enrichedShipments, // Add shipment details to each campaign
        };
      })
    );

    const wallet = await Wallet.findOne({ userId: user._id });

    const response = {
      advertiser: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        photoUrl: user.photoUrl || DEFAULT_AVATAR,
        bio: user.bio || "",
        status: user.status,
        wallet: wallet,
      },
      summary: campaignSummary,
      campaigns: campaignsWithApplications,
    };

    res.status(200).json({ success: true, data: response });
  } catch (err) {
    logger.error(`Error fetching advertiser details: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

export const getInfluencerDetailsById = async (req, res) => {
  const { id } = req.params;

  // ✅ Validate ID
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({
      success: false,
      message: "Invalid or missing influencer ID",
    });
  }

  try {
    const user = await User.findById(id).select("-password");

    if (!user || user.role !== "influencer") {
      return res
        .status(404)
        .json({ success: false, message: "Influencer not found" });
    }

    // ✅ Campaign applications
    const applications = await CampaignApplication.find({ userId: id })
      .populate(
        "campaign",
        "campaignName coverImage deliveryMethod compensation contentRequirements campaignStrategy"
      )
      .sort({ createdAt: -1 });

    const campaignList = applications.map((app) => ({
      campaignId: app.campaign?._id,
      title: app.campaign?.campaignName || "Untitled",
      contentType: app.campaign?.contentRequirements?.contentType || "",
      contentCategory: app.campaign?.contentRequirements?.contentCategory || "",
      campaignStrategy: app.campaign?.campaignStrategy || "",
      deliveryMethod: app.campaign?.deliveryMethod || "Unknown",
      coverImage: app.campaign?.coverImage || null,
      status: app.status,
      publishStatus: app.publishStatus,
      paymentStatus: app.paymentStatus,
      jobTimelineStatus: app.jobTimelineStatus,
      applicationStatus: app.applicationStatus,
      fee: app.campaign?.compensation?.amount || 0,
      submittedContent: {
        videoUrl: app.videoUrls || null,
        finalVideoUrl: app.finalVideoUrl || null,
        isFinal: app.isFinal || false,
        postedAt: app.postedAt || null,
        metrics: {
          views: app.metrics?.views || 0,
          likes: app.metrics?.likes || 0,
        },
        reviewNotes: app.reviewNotes || "",
        comments: app.comments || "",
      },
    }));

    // ✅ Influencer reviews
    const reviews = await InfluencerReview.find({ influencerId: id })
      .populate("advertiserId", "name email photoUrl role")
      .populate({
        path: "campaignId",
        select: "campaignName coverImage product",
        populate: {
          path: "product",
          select: "name image product_links",
        },
      })
      .sort({ createdAt: -1 });

    const reviewsList = reviews.map((rev) => ({
      reviewId: rev._id,
      rating: rev.rating,
      comment: rev.comment,
      createdAt: rev.createdAt,
      reviewer: {
        id: rev.advertiserId?._id || null,
        name: rev.advertiserId?.name || null,
        email: rev.advertiserId?.email || null,
        photoUrl: rev.advertiserId?.photoUrl,
      },
      campaign: {
        id: rev.campaignId?._id || null,
        name: rev.campaignId?.campaignName || null,
        coverImage: rev.campaignId?.coverImage || null,
        product: {
          id: rev.campaignId?.product?._id || null,
          name: rev.campaignId?.product?.name || null,
          image: rev.campaignId?.product?.image || null,
          product_links: rev.campaignId?.product?.product_links || null,
        },
      },
    }));

    const connectedAccounts = {
      instagram: {
        connected: user.instagram.connected,
        ig_user_id: user.instagram.ig_user_id,
        profile_url: user.instagram.profile_url,
        profile_picture: user.instagram.profile_picture,
        profile_name: user.instagram.profile_name,
        profile_bio: user.instagram.profile_bio,
        profile_followers: user.instagram.profile_followers,
        profile_following: user.instagram.profile_following,
        profile_posts: user.instagram.profile_posts,
      },
      tiktok: {
        connected: user.tiktok.connected,
        username: user.tiktok.tiktok_username,
        profile_name: user.tiktok.profile_name,
        profile_picture: user.tiktok.profile_picture,
        profile_bio: user.tiktok.profile_bio,
        profile_link: user.tiktok.profile_link,
        profile_followers: user.tiktok.profile_followers,
        profile_following: user.tiktok.profile_following,
        profile_posts: user.tiktok.profile_posts,
        lastUpdated: user.tiktok.stats_last_updated,
      },
      youtube : {
        connected: user.youtube.connected,
        title: user.youtube.youtube_channel_title,
        profile_picture: user.youtube.youtube_channel_thumbnail,
        videos: user.youtube.youtube_videos,
        channel_url: user.youtube.youtube_channel_url,
        subscribers: user.youtube.youtube_subscribers,
        likes: user.youtube.youtube_total_likes,
        comments: user.youtube.youtube_total_comments,
       }
    };

    const referenceContent = (user.referenceContent || []).map((ref) => ({
      id: ref._id,
      type: ref.type,
      url: ref.url,
      uploadedAt: ref.uploadedAt,
    }));

    const certificates = await UserCertification.find({ userId: id });

    const wallet = await Wallet.findOne({ userId: id });

    res.status(200).json({
      success: true,
      data: {
        influencer: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || null,
          photoUrl:
            user.photoUrl ||
            "https://pubbli-bucket.s3.us-east-2.amazonaws.com/profile/1750676731514.svg",
          bio: user.bio || "",
          rating: user.rating || 0,
          followers: user.followers || 0,
          posts: user.posts || 0,
          likes: user.likes || 0,
          comments: user.comments || 0,
          engagementRate: user.engagementRate || 0,
          totalReviews: reviews.length,
          connectedAccounts,
          referenceContent,
          addresses: (user.addresses || []).map((addr) => ({
            id: addr._id,
            type: addr.type || "other",
            addressLine: addr.addressLine1 ? addr.addressLine1 : "" + " " + addr.addressLine2 ? addr.addressLine2 : "",
            city: addr.city,
            state: addr.state,
            country: addr.country,
            zipCode: addr.zipCode,
          })),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        jobs: campaignList,
        reviews: reviewsList,
        certificates,
        wallet,
      },
    });
  } catch (err) {
    logger.error(`Error getting influencer detail: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};
export const getInfluencerDetailsByUserName = async (req, res) => {
  const { username } = req.params;

  try {
    const user = await User.findOne({ username: username }).select("-password");

    if (!user || user.role !== "influencer") {
      return res
        .status(404)
        .json({ success: false, message: "Influencer not found" });
    }

    if (user.role !== "influencer") {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // ✅ Campaign applications
    const applications = await CampaignApplication.find({ userId: user._id })
      .populate(
        "campaign",
        "campaignName postingSchedule compensation campaignType"
      )
      .sort({ createdAt: -1 });

    const campaignList = applications.map((app) => ({
      campaignId: app.campaign?._id,
      title: app.campaign?.campaignName || "Untitled",
      campaignType: app.campaign?.campaignType || "Unknown",
      status: app.status,
      publishStatus: app.publishStatus,
      paymentStatus: app.paymentStatus,
      applicationStatus: app.applicationStatus,
      contentShared: app.contentShared || false,
      fee: app.campaign?.compensation?.amount || 0,
      timeline: app.campaign?.postingSchedule || {},
      submittedContent: {
        videoUrl: app.videoUrl || null,
        finalVideoUrl: app.finalVideoUrl || null,
        isFinal: app.isFinal || false,
        postedAt: app.postedAt || null,
        contentType: app.contentType || "Other",
        platform: app.platform || null,
        metrics: {
          views: app.metrics?.views || 0,
          likes: app.metrics?.likes || 0,
        },
        reviewNotes: app.reviewNotes || "",
        comments: app.comments || "",
      },
    }));

    // ✅ Influencer reviews
    const reviews = await InfluencerReview.find({ influencerId: user._id })
      .populate("advertiserId", "name email photoUrl role")
      .populate({
        path: "campaignId",
        select: "campaignName coverImage product",
        populate: {
          path: "product",
          select: "name image product_links",
        },
      })
      .sort({ createdAt: -1 });

    const reviewsList = reviews.map((rev) => ({
      reviewId: rev._id,
      rating: rev.rating,
      comment: rev.comment,
      createdAt: rev.createdAt,
      reviewer: {
        id: rev.advertiserId?._id || null,
        name: rev.advertiserId?.name || null,
        email: rev.advertiserId?.email || null,
        photoUrl: rev.advertiserId?.photoUrl,
      },
      campaign: {
        id: rev.campaignId?._id || null,
        name: rev.campaignId?.campaignName || null,
        coverImage: rev.campaignId?.coverImage || null,
        product: {
          id: rev.campaignId?.product?._id || null,
          name: rev.campaignId?.product?.name || null,
          image: rev.campaignId?.product?.image || null,
          product_links: rev.campaignId?.product?.product_links || null,
        },
      },
    }));

    // ✅ Connected Accounts
    const connectedAccounts = {
      instagram: {
        connected: user.instagram.connected,
        ig_user_id: user.instagram.ig_user_id,
        profile_url: user.instagram.profile_url,
        profile_picture: user.instagram.profile_picture,
        profile_name: user.instagram.profile_name,
        profile_bio: user.instagram.profile_bio,
        profile_followers: user.instagram.profile_followers,
        profile_following: user.instagram.profile_following,
        profile_posts: user.instagram.profile_posts,
      },
      tiktok: {
        connected: user.tiktok.connected,
        username: user.tiktok.tiktok_username,
        profile_name: user.tiktok.profile_name,
        profile_picture: user.tiktok.profile_picture,
        profile_bio: user.tiktok.profile_bio,
        profile_link: user.tiktok.profile_link,
        profile_followers: user.tiktok.profile_followers,
        profile_following: user.tiktok.profile_following,
        profile_posts: user.tiktok.profile_posts,
        lastUpdated: user.tiktok.stats_last_updated,
      },
    };

    // ✅ Reference Content
    const referenceContent = (user.referenceContent || []).map((ref) => ({
      id: ref._id,
      type: ref.type,
      url: ref.url,
      uploadedAt: ref.uploadedAt,
    }));

    // get influencer certifications
    const certificates = await UserCertification.find({ userId: user._id });

    const wallet = await Wallet.findOne({ userId: user._id });

    // ✅ Final response
    res.status(200).json({
      success: true,
      data: {
        influencer: {
          id: user._id,
          name: user.name,
          email: user.email,
          phone: user.phone || null,
          photoUrl:
            user.photoUrl ||
            "https://pubbli-bucket.s3.us-east-2.amazonaws.com/profile/1750676731514.svg",
          bio: user.bio || "",
          rating: user.rating || 0,
          followers: user.followers || 0,
          posts: user.posts || 0,
          likes: user.likes || 0,
          comments: user.comments || 0,
          engagementRate: user.engagementRate || 0,
          totalReviews: reviews.length,
          connectedAccounts,
          referenceContent,
          addresses: (user.addresses || []).map((addr) => ({
            id: addr._id,
            type: addr.type || "other",
            addressLine: addr.addressLine,
            city: addr.city,
            state: addr.state,
            country: addr.country,
            zipCode: addr.zipCode,
            isDefault: addr.isDefault || false,
          })),
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        jobs: campaignList.filter(
          (job) => job.jobTimelineStatus === "job_completed"
        ),
        reviews: reviewsList,
        certificates,
        wallet,
      },
    });
  } catch (err) {
    logger.error(`Error getting influencer detail: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: err.message,
    });
  }
};

export const addUserAddress = async (req, res) => {
  const { type, country, state, city, zip, addressLine1, addressLine2 } =
    req.body;

  try {
    const user = await User.findById(req.user._id);
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    const newAddress = {
      type: type || "Home",
      country,
      state,
      city,
      zip,
      addressLine1,
      addressLine2,
    };

    user.addresses.push(newAddress);
    await user.save();

    res.status(200).json({
      success: true,
      message: "Address added",
      addresses: user.addresses,
    });
  } catch (err) {
    logger.error(`Error adding address: ${err.message}`);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
export const getUserAddresses = async (req, res) => {
  try {
    // const user = await User.findById(req.params.id).select("addresses");
    const user = await User.findById(req.user._id).select("addresses");
    if (!user)
      return res
        .status(404)
        .json({ success: false, message: "User not found" });

    res.status(200).json({ success: true, addresses: user.addresses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteUserAddress = async (req, res) => {
  const { addressId } = req.params;

  if (!addressId) {
    return res
      .status(400)
      .json({ success: false, message: "Address ID is required" });
  }

  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    logger.info(`addressId: ${addressId}`);
    // Remove address by _id
    user.addresses = user.addresses.filter(
      (addr) => addr._id.toString() !== addressId
    );

    logger.info(`user.addresses:`, user.addresses);

    await user.save();

    res.status(200).json({
      success: true,
      message: "Address deleted",
      addresses: user.addresses,
    });
  } catch (err) {
    logger.error(`Error deleting address: ${err.message}`);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
export const updateUserAddress = async (req, res) => {
  const { addressId } = req.params;
  const { type, country, state, city, zip, addressLine1, addressLine2 } =
    req.body;
  const user = req.user;

  try {
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // Find the address by _id
    const address = user.addresses.id(addressId);
    if (!address) {
      return res
        .status(404)
        .json({ success: false, message: "Address not found" });
    }

    // Update address fields if provided
    if (type) address.type = type;
    if (country) address.country = country;
    if (state) address.state = state;
    if (city) address.city = city;
    if (zip) address.zip = zip;
    if (addressLine1) address.addressLine1 = addressLine1;
    if (addressLine2) address.addressLine2 = addressLine2;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Address updated",
      address,
      addresses: user.addresses,
    });
  } catch (err) {
    logger.error(`Error updating address: ${err.message}`);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
export const uploadReferenceContent = async (req, res) => {
  try {
    const userId = req.user._id;
    const file = req.file;
    // Log safe file metadata instead of entire file object to prevent BSON errors
    if (file) {
      logger.info(
        `File upload - Name: ${file.originalname}, Size: ${file.size} bytes, Type: ${file.mimetype}`
      );
    }
    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const { type } = req.body;
    if (!["video", "image"].includes(type)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid content type" });
    }

    // Upload to S3 or your storage
    const fileUrl = await uploadFileToS3("files", file);

    // Add to user profile
    await User.findByIdAndUpdate(userId, {
      $push: {
        referenceContent: {
          type,
          url: fileUrl,
        },
      },
    });

    res.status(200).json({
      success: true,
      message: "Reference content uploaded",
      url: fileUrl,
      type,
    });
  } catch (err) {
    logger.error(`Upload error: ${err.message}`);
    res
      .status(500)
      .json({ success: false, message: "Server error", error: err.message });
  }
};
export const getReferenceContent = async (req, res) => {
  try {
    const userId = req.user._id;

    const user = await User.findById(userId).select("referenceContent");

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    res.status(200).json({
      success: true,
      message: "Reference content fetched",
      data: user.referenceContent || [],
    });
  } catch (err) {
    logger.error(`Fetch reference content error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};
export const deleteReferenceContentById = async (req, res) => {
  const { referenceContentId } = req.params;
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }
    // Remove reference content by _id
    user.referenceContent = user.referenceContent.filter(
      (ref) => ref._id.toString() !== referenceContentId
    );

    const fileUrl = user.referenceContent.find(
      (ref) => ref._id.toString() === referenceContentId
    );

    if (fileUrl) {
      deleteFileFromS3(fileUrl.url);
    }

    await user.save();
    res.status(200).json({
      success: true,
      message: "Reference content deleted",
      referenceContent: user.referenceContent,
    });
  } catch (err) {
    logger.error(`Error deleting reference content: ${err.message}`);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
};
export const setPreferedCategories = async (req, res) => {
  try {
    const userId = req.user._id;
    const { preferedCategories } = req.body;

    // Validate preferedCategories structure
    if (!preferedCategories || typeof preferedCategories !== "object") {
      return res.status(400).json({
        success: false,
        message: "Preferred categories are required",
      });
    }

    // Validate the structure
    const { primary, secondary, third } = preferedCategories;
    if (
      !Array.isArray(primary) ||
      !Array.isArray(secondary) ||
      !Array.isArray(third)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Preferred categories must have primary, secondary, and third arrays",
      });
    }

    // Update user's preferred categories
    const user = await User.findByIdAndUpdate(
      userId,
      { isCategoriesSet: true, preferedCategories: preferedCategories },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const existingOtp = await OTP.findOne({ email: user.email });
    if (existingOtp) {
      await existingOtp.deleteOne();
    }

    // Generate OTP for email verification
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiry = new Date();
    otpExpiry.setMinutes(otpExpiry.getMinutes() + 10); // OTP valid for 10 minutes

    // Save OTP
    const newOtp = new OTP({
      email: user.email,
      otp: otp,
      expiresAt: otpExpiry,
    });
    await newOtp.save();

    // Send OTP email
    try {
      await sendRegisterOtp(user.email, otp);
      logger.info(`OTP sent successfully to: ${user.email}`);
    } catch (emailError) {
      logger.error(`Error sending OTP email: ${emailError.message}`);
      return res.status(500).json({
        success: false,
        message: "Failed to send verification email. Please try again.",
      });
    }

    res.status(200).json({
      success: true,
      message:
        "Preferred categories set successfully. Please check your email for verification OTP.",
      requiresVerification: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        preferedCategories: user.preferedCategories,
      },
    });
  } catch (error) {
    logger.error(`Error setting preferred categories: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getDashboardStats = async (req, res) => {
  try {
    const [totalUsers, advertisers, influencers] = await Promise.all([
      User.countDocuments({ role: { $in: ["advertiser", "influencer"] } }),
      User.countDocuments({ role: "advertiser" }),
      User.countDocuments({ role: "influencer" }),
    ]);

    logger.info(`totalUsers: ${totalUsers}`);
    logger.info(`advertisers: ${advertisers}`);
    logger.info(`influencers: ${influencers}`);

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    const recentInfluencers = await User.find({
      role: "influencer",
      createdAt: { $gte: twoDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name email photoUrl createdAt");

    const recentAdvertisers = await User.find({
      role: "advertiser",
      createdAt: { $gte: twoDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(5)
      .select("name email photoUrl createdAt");

    res.status(200).json({
      success: true,
      data: {
        totalUsers,
        advertiserCount: advertisers,
        influencerCount: influencers,
        recentInfluencers,
        recentAdvertisers,
      },
    });
  } catch (err) {
    logger.error(`Error fetching dashboard stats: ${err.message}`);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

export const updatePreferedCategories = async (req, res) => {
  try {
    const userId = req.user._id;
    const { preferedCategories } = req.body;

    // Validate preferedCategories structure
    if (!preferedCategories || typeof preferedCategories !== "object") {
      return res.status(400).json({
        success: false,
        message: "Preferred categories are required",
      });
    }

    const { primary, secondary, third } = preferedCategories;

    if (
      !Array.isArray(primary) ||
      !Array.isArray(secondary) ||
      !Array.isArray(third)
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Preferred categories must have primary, secondary, and third arrays",
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { preferedCategories },
      { new: true }
    ).select("name email preferedCategories");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Preferred categories updated successfully",
      user,
    });
  } catch (error) {
    logger.error(`Error updating preferred categories: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};
