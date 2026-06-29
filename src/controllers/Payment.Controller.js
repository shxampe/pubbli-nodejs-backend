import Transaction from "../models/TransactionModel.js";

export const getAdvertiserPayments = async (req, res) => {
  try {
    const payments = await Transaction.find({
      userId: req.user._id,
      type: {
        $in: [
          "campaign_lock",
          "campaign_unlock",
          "campaign_payment",
          "campaign_refund",
        ],
      },
    })
      .populate("campaignId", "campaignName coverImage")
      .populate("applicationId", "userId")
      .populate("applicationId.userId", "name photoUrl email")
      .sort({ createdAt: -1 });

    const data = payments.map((p) => ({
      influencer: {
        name: p.applicationId?.userId?.name,
        email: p.applicationId?.userId?.email,
        avatar: p.applicationId?.userId?.photoUrl,
      },
      campaign: {
        name: p.campaignId?.campaignName,
        thumbnail: p.campaignId?.coverImage,
      },
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      transactionId: p.transactionId,
      paidAt: p.createdAt,
      description: p.description,
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not fetch payments",
      error: error.message,
    });
  }
};

export const getInfluencerPayments = async (req, res) => {
  try {
    const influencerId = req.user._id;

    const payments = await Transaction.find({
      userId: influencerId,
      type: "campaign_payment",
    })
      .populate("campaignId", "campaignName coverImage")
      .populate("applicationId", "campaign")
      .populate("applicationId.campaign", "advertiserId")
      .populate("applicationId.campaign.advertiserId", "name email")
      .sort({ createdAt: -1 });

    const formatted = payments.map((p) => ({
      campaign: {
        name: p.campaignId?.campaignName || "Untitled Campaign",
        thumbnail: p.campaignId?.coverImage || "/default.png",
      },
      advertiser: {
        name: p.applicationId?.campaign?.advertiserId?.name || "N/A",
        email: p.applicationId?.campaign?.advertiserId?.email || "N/A",
      },
      transactionId: p.transactionId,
      amount: p.amount,
      currency: p.currency || "coins",
      status: p.status,
      receivedAt: p.createdAt,
      description: p.description,
    }));

    res.status(200).json({
      success: true,
      message: "Payments received by influencer fetched",
      data: formatted,
    });
  } catch (error) {
    console.error("Error fetching influencer payments:", error);
    res.status(500).json({
      success: false,
      message: "Server error",
      error: error.message,
    });
  }
};
export const getCampaignPayments = async (req, res) => {
  try {
    const { campaignId } = req.params; // or use req.query.campaignId
    if (!campaignId) {
      return res
        .status(400)
        .json({ success: false, message: "Campaign ID required" });
    }

    const payments = await Transaction.find({
      userId: req.user._id,
      campaignId,
    })
      .populate({
        path: "applicationId",
        populate: {
          path: "userId", // populate userId inside applicationId
          select: "name email photoUrl", // select required fields from user
        },
      })
      .populate("campaignId", "campaignName coverImage")
      .sort({ createdAt: -1 });


    const data = payments.map((p) => {
      const influencer = p.applicationId?.userId;

      return {
        transactionId: p.transactionId,
        influencer: {
          name: influencer?.name || "",
          email: influencer?.email || "",
          avatar: influencer?.photoUrl || "/default-user.png",
        },
        campaign: {
          name: p.campaignId?.campaignName || "",
          thumbnail: p.campaignId?.coverImage || "/default.png",
        },
        amount: p.amount,
        status: p.status,
        paidAt: p.createdAt,
      };
    });

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not fetch payments",
      error: error.message,
    });
  }
};

// export const releaseInfluencerPayment = async (req, res) => {
//   const { applicationId } = req.body;

//   try {
//     const application = await CampaignApplication.findById(applicationId)
//       .populate("userId", "email")
//       .populate("campaign", "compensation title description");

//     if (!application) {
//       return res.status(404).json({
//         success: false,
//         message: "Application not found",
//       });
//     }

//     // ✅ Validate eligibility
//     if (
//       application.status !== "Submitted" ||
//       application.publishStatus !== "Approved"
//     ) {
//       return res.status(400).json({
//         success: false,
//         message: "Content must be approved and posted to release payment.",
//       });
//     }

//     // ✅ Prevent duplicate payment
//     const existing = await Payment.findOne({ applicationId });
//     if (existing) {
//       return res.status(400).json({
//         success: false,
//         message: "Payment has already been released for this influencer.",
//       });
//     }

//     const amount = application.campaign?.compensation?.amount;
//     if (!amount || isNaN(amount)) {
//       return res.status(400).json({
//         success: false,
//         message: "Invalid or missing payment amount",
//       });
//     }

//     const escrowResponse = await EscrowService.releasePayment({
//       buyerEmail: req.user.email,
//       sellerEmail: application.userId.email,
//       amount,
//       title: application.campaign?.title,
//       description: application.campaign?.description,
//     });

//     if (!escrowResponse.success) {
//       return res.status(400).json({
//         success: false,
//         message: escrowResponse.message || "Escrow release failed",
//       });
//     }

//     // ✅ Record payment
//     await Payment.create({
//       advertiserId: req.user._id,
//       influencerId: application.userId._id,
//       campaignId: application.campaign._id,
//       applicationId: application._id,
//       transactionId: escrowResponse.data?.transactionId || `TXN-${Date.now()}`,
//       amount,
//       status: "success",
//     });
//     await CampaignApplication.updateOne({
//       _id: application._id,
//       paymentStatus: "Released",
//     });
//     await Campaign.updateOne({
//       _id: application.campaign._id,
//       status: "Completed",
//     });

//     res.json({
//       success: true,
//       message: "Payment released successfully",
//       escrow: escrowResponse.data,
//     });
//   } catch (err) {
//     console.error("Release error:", err);
//     res.status(500).json({
//       success: false,
//       message: "Internal server error",
//       error: err.message,
//     });
//   }
// };

export const getAdminStats = async (req, res) => {
  try {
    // Only superadmin can access
    if (req.user.role !== "superadmin") {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }

    const { role, userId } = req.query;
    if (!role || !["influencer", "advertiser"].includes(role)) {
      return res.status(400).json({
        success: false,
        message: "role must be 'influencer' or 'advertiser'",
      });
    }

    let transactions = [];

    if (role === "influencer") {
      // Influencer: Only campaign_payment transactions for influencers
      const match = {
        transactionCreatedFor: "influencer",
        type: "campaign_payment",
        status: "completed",
      };
      if (userId) match.userId = userId;

      transactions = await Transaction.find(match)
        .populate("userId", "name email photoUrl")
        .sort({ createdAt: -1 });
    } else if (role === "advertiser") {
      const match = {
        type: { $in: ["campaign_lock", "campaign_payment", "campaign_refund"] },
        transactionCreatedFor: "advertiser",
      };
      if (userId) match.userId = userId;

      transactions = await Transaction.find(match)
        .populate("userId", "name email photoUrl")
        .sort({ createdAt: -1 });
    }

    res.json({
      success: true,
      data: transactions.map((t) => ({
        contentId: t.applicationId || t.contentSubmissionId || null,
        user: {
          name: t.userId?.name,
          email: t.userId?.email,
          avatar: t.userId?.photoUrl,
        },
        type: t.type,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        transactionId: t.transactionId,
        paidAt: t.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Could not fetch admin stats",
      error: error.message,
    });
  }
};
