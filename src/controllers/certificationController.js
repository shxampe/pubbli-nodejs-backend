import Certification from "../models/CertificationModel.js";
import UserCertification from "../models/UserCertificationModel.js";
import User from "../models/User.js";
import { uploadFileToS3 } from "../utils/s3Config.js";
import { sendCertificationApprovalEmail, sendCertificationRejectionEmail } from "../utils/loopsService.js";
import { logger } from "../utils/logger.js";

// Admin: Create certification
export const createCertification = async (req, res) => {
  try {
    const cert = await Certification.create({
      ...req.body,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: cert });
  } catch (err) {
    res
      .status(500)
      .json({
        success: false,
        message: "Failed to create certification",
        error: err.message,
      });
  }
};

// Admin: Get all certifications
export const getAllCertifications = async (req, res) => {
  try {
    const certs = await Certification.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      data: certs,
      summary: {
        total: certs.length,
        active: certs.filter((cert) => cert.isActive).length,
        inactive: certs.filter((cert) => !cert.isActive).length,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Admin: Get single cert by ID
export const getCertificationById = async (req, res) => {
  try {
    const cert = await Certification.findById(req.params.id);
    if (!cert)
      return res
        .status(404)
        .json({ success: false, message: "Certification not found" });

    res.json({ success: true, data: cert });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Influencer: Apply for certification
// export const applyForCertification = async (req, res) => {
//   const certificationId = req.params.id;
//   const user = req.user;
//   const userId = user._id;

//   try {
//     const existing = await UserCertification.findOne({
//       userId,
//       certificationId,
//       status: { $ne: "rejected" }
//     });
//     if (existing) {
//       return res.status(400).json({
//         success: false,
//         message: "Already applied for this certification",
//       });
//     }

//     const cert = await Certification.findById(certificationId);
//     if (!cert) {
//       return res
//         .status(404)
//         .json({ success: false, message: "Certification not found" });
//     }

//     if (cert.platform === "tiktok" || cert.platform === "instagram" || cert.platform === "Youtube shorts") {
//       if (cert.platform === "tiktok") {
//         if (!user.tiktok.connected) {
//           return res.status(400).json({
//             success: false,
//             message: "You must connect your TikTok account before applying",
//           });
//         }
//         if (user.tiktok.profile_posts < cert.requirements.minPosts) {
//           return res.status(400).json({
//             success: false,
//             message:
//               "You must have at least " +
//               cert.requirements.minPosts +
//               " posts on TikTok before applying",
//           });
//         }
//       }
//       if (cert.platform === "instagram") {
//         if (!user.instagram.connected) {
//           return res.status(400).json({
//             success: false,
//             message: "You must connect your Instagram account before applying",
//           });
//         }
//         if (user.instagram.profile_posts < cert.requirements.minPosts) {
//           return res.status(400).json({
//             success: false,
//             message:
//               "You must have at least " +
//               cert.requirements.minPosts +
//               " posts on Instagram before applying",
//           });
//         }
//       }
//       if (cert.platform === "Youtube shorts") {
//         if (!user.youtube.connected) {
//           return res.status(400).json({
//             success: false,
//             message: "You must connect your Youtube account before applying",
//           });
//         }
//         if (user.youtube.profile_videos < cert.requirements.minPosts) {
//           return res.status(400).json({
//             success: false,
//             message:
//               "You must have at least " +
//               cert.requirements.minPosts +
//               " posts on Youtube before applying",
//           });
//         }
//       }
//     }

//     let fileUrl = null;
//     if (cert.platform === "selfie" || cert.platform === "demo") {
//       const file = req.file;
//       if (!file) {
//         return res.status(400).json({
//           success: false,
//           message: "You must upload a file before applying",
//         });
//       }
//       fileUrl = await uploadFileToS3(
//         `certifications/${cert.platform}/${userId}`,
//         file
//       );
//       if (!fileUrl) {
//         return res
//           .status(400)
//           .json({ success: false, message: "Failed to upload file" });
//       }
//     }

//     const application = await UserCertification.create({
//       userId,
//       certificationId,
//       platform: cert.name,
//       applied: true,
//       // status: cert.platform === "tiktok" || cert.platform === "instagram" ? "certified" : "pending",
//       status: "pending",
//       fileUrl: fileUrl,
//     });

//     res.status(201).json({ success: true, data: application });
//   } catch (err) {
//     res
//       .status(500)
//       .json({ success: false, message: "Failed to apply", error: err.message });
//   }
// };


export const applyForCertification = async (req, res) => {
  const certificationId = req.params.id;
  const user = req.user;
  const userId = user._id;

  try {
    const cert = await Certification.findById(certificationId);
    if (!cert) {
      return res
        .status(404)
        .json({ success: false, message: "Certification not found" });
    }

    // 🔹 Check if user already has an application
    const existing = await UserCertification.findOne({ userId, certificationId });

    if (existing && existing.status !== "rejected") {
      return res.status(400).json({
        success: false,
        message: "Already applied for this certification",
      });
    }

    // 🔹 Validate platform requirements
    if (["tiktok", "instagram", "Youtube shorts"].includes(cert.platform)) {
      if (cert.platform === "tiktok") {
        if (!user.tiktok.connected) {
          return res.status(400).json({
            success: false,
            message: "You must connect your TikTok account before applying",
          });
        }
        if (user.tiktok.profile_posts < cert.requirements.minPosts) {
          return res.status(400).json({
            success: false,
            message: `You must have at least ${cert.requirements.minPosts} posts on TikTok before applying`,
          });
        }
      }
      if (cert.platform === "instagram") {
        if (!user.instagram.connected) {
          return res.status(400).json({
            success: false,
            message: "You must connect your Instagram account before applying",
          });
        }
        if (user.instagram.profile_posts < cert.requirements.minPosts) {
          return res.status(400).json({
            success: false,
            message: `You must have at least ${cert.requirements.minPosts} posts on Instagram before applying`,
          });
        }
      }
      if (cert.platform === "Youtube shorts") {
        if (!user.youtube.connected) {
          return res.status(400).json({
            success: false,
            message: "You must connect your Youtube account before applying",
          });
        }
        if (user.youtube.profile_videos < cert.requirements.minPosts) {
          return res.status(400).json({
            success: false,
            message: `You must have at least ${cert.requirements.minPosts} posts on Youtube before applying`,
          });
        }
      }
    }

    // 🔹 Handle file uploads for selfie/demo
    let fileUrl = null;
    if (["selfie", "demo"].includes(cert.platform)) {
      const file = req.file;
      if (!file) {
        return res.status(400).json({
          success: false,
          message: "You must upload a file before applying",
        });
      }
      fileUrl = await uploadFileToS3(
        `certifications/${cert.platform}/${userId}`,
        file
      );
      if (!fileUrl) {
        return res
          .status(400)
          .json({ success: false, message: "Failed to upload file" });
      }
    }

    // 🔹 If rejected → update instead of creating new
    let application;
    if (existing && existing.status === "rejected") {
      application = await UserCertification.findByIdAndUpdate(
        existing._id,
        {
          $set: {
            applied: true,
            status: "pending",
            fileUrl: fileUrl,
          },
        },
        { new: true }
      );
    } else {
      application = await UserCertification.create({
        userId,
        certificationId,
        platform: cert.name,
        applied: true,
        status: "pending",
        fileUrl: fileUrl,
      });
    }

    res.status(201).json({ success: true, data: application });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: "Failed to apply", error: err.message });
  }
};


// Influencer: Get user's certifications
export const getUserCertifications = async (req, res) => {
  try {
    // const userId = req.user._id;
    const userId = req.params.id;
    logger.info(`Searching for user certifications for userId: ${userId}`);

    // Validate userId parameter
    if (!userId || userId === "undefined" || userId === "null") {
      return res.status(400).json({
        success: false,
        message: "Valid user ID is required",
      });
    }

    const allCertifications = await Certification.find({ isActive: true });

    const userApplications = await UserCertification.find({ userId });

    const userApplicationsMap = {};
    userApplications.forEach((app) => {
      userApplicationsMap[app.certificationId.toString()] = app;
    });

    const certificationsWithStatus = allCertifications.map((cert) => {
      const userApp = userApplicationsMap[cert._id.toString()];

      return {
        _id: userApp ? userApp._id : null,
        certificationId: cert._id,
        name: cert.name,
        platform: cert.platform,
        description: cert.description,
        requirements: cert.requirements,
        sampleVideos: cert.sampleVideos,
        fileUrl: userApp ? userApp.fileUrl : null,
        // User's status for this certification
        userStatus: userApp ? userApp.status : "not_applied",
        // platformUsername: userApp ? userApp.platformUsername : null,
        appliedAt: userApp ? userApp.appliedAt : null,
        image: cert.image,
        icon: cert.icon,
        // Whether user can apply (not applied or rejected/revoked)
        // canApply: !userApp || ["rejected", "revoked"].includes(userApp.status)
      };
    });

    res.json({
      success: true,
      data: certificationsWithStatus,
      summary: {
        total: certificationsWithStatus.length,
        applied: userApplications.filter((app) => app.status !== "not_applied")
          .length,
        certified: userApplications.filter((app) => app.status === "certified")
          .length,
        pending: userApplications.filter((app) => app.status === "pending")
          .length,
      },
    });
  } catch (err) {
    logger.error(`Error in getUserCertifications: ${err.message}`);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch your certifications" });
  }
};

export const updateCertificationStatus = async (req, res) => {
  try {
    const { approvalStatus } = req.body;

    const cert = await UserCertification.findById(req.params.id).populate(
      "userId",
      "email"
    );

    if (!cert) {
      return res
        .status(404)
        .json({ success: false, message: "User certification not found" });
    }

    // const updatedCert = await UserCertification.findByIdAndUpdate(
    //   req.params.id,
    //   {
    //     status: approvalStatus.approvalStatus,
    //     adminNotes: approvalStatus.rejectedReason
    //       ? approvalStatus.rejectedReason
    //       : null,
    //   },
    //   { new: true }
    // );

    // Update certification status
    cert.status = approvalStatus.approvalStatus;
    cert.adminNotes = approvalStatus.rejectedReason
      ? approvalStatus.rejectedReason
      : null;
    await cert.save();

    if (approvalStatus.approvalStatus === "certified") {
      await User.findByIdAndUpdate(cert.userId, {
        $addToSet: { certificates: cert.platform },
      });
    } else if (approvalStatus.approvalStatus === "rejected") {
      if(!approvalStatus.rejectedReason){
        return res.status(400).json({
          success : false,
          message : "Reason must be provided for rejection"
        })
      }
      await User.findByIdAndUpdate(cert.userId, {
        $pull: { certificates: cert.platform },
      });
    }

    try {
      if (approvalStatus.approvalStatus === "certified") {
        await sendCertificationApprovalEmail(cert.userId.email);
      } else if (approvalStatus.approvalStatus === "rejected") {
        await sendCertificationRejectionEmail(
          cert.userId.email,
          approvalStatus.rejectedReason
        );
      }
    } catch (emailError) {
      logger.error(`Failed to send certification email: ${emailError.message}`);
    }

    res.json({
      success: true,
      data: cert,
      message: `Certification ${approvalStatus === "certified" ? "approved" : "rejected"} successfully`,
    });
  } catch (err) {
    logger.error(`Error updating certification status: ${err.message}`);
    res
      .status(500)
      .json({ success: false, message: "Failed to update status" });
  }
};

export const getAllUserCertifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;
    const certifications = await UserCertification.find()
      .populate("userId", "name email photoUrl")
      .skip(skip)
      .limit(parseInt(limit));
    const total = await UserCertification.countDocuments();
    res.json({
      success: true,
      data: certifications,
      total: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to fetch certifications",
      error: err.message,
    });
  }
};
