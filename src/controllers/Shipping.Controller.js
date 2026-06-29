import Campaign from "../models/CampaignModel.js";
import Shipment from "../models/Shipment.js";
import { logger } from "../utils/logger.js";

export const getCampaignsWithProducts = async (req, res) => {
  try {
    const userId = req.user._id;

    const campaigns = await Campaign.find({
      createdBy: userId,
      approvalStatus: "Approved",
      campaignType: "With-Product-Shipment",
    }).sort({ createdAt: -1 });

    const shipments = await Shipment.find({ userId });

    const shipmentMap = {};
    shipments.forEach((shipment) => {
      if (shipment.campaignId) {
        shipmentMap[shipment.campaignId.toString()] = {
          status: shipment.status,
          labelUrl: shipment.labelUrl,
          trackingUrl: shipment.trackingUrl,
        };
      }
    });

    const enrichedCampaigns = campaigns.map((camp) => {
      const shipment = shipmentMap[camp._id.toString()];
      return {
        ...camp.toObject(),
        shipmentStatus: shipment?.status || null,
        labelUrl: shipment?.labelUrl || null,
        trackingUrl: shipment?.trackingUrl || null,
      };
    });

    res.status(200).json({
      success: true,
      message: "Campaigns with products fetched",
      data: enrichedCampaigns,
    });
  } catch (err) {
    logger.error(`Fetch campaign error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns with products",
      error: err.message,
    });
  }
};

//for user
export const getAllShipments = async (req, res) => {
  try {
    const userId = req.user._id;

    // Fetch all shipments created by this user
    const shipments = await Shipment.find({ userId })
      .populate({
        path: "campaignId",
        select: "campaignName coverImage product postingSchedule campaignType",
        populate: {
          path: "product",
          select: "name price imageUrl",
        },
      })
      .sort({ createdAt: -1 });

    const mapped = shipments.map((s) => {
      const campaign = s.campaignId || {};
      const product = campaign.product || {};

      return {
        id: s._id,
        product: {
          name: product.name || "Unnamed",
          price: product.price || 0,
          image: product.imageUrl || "/default.png",
        },
        campaign: {
          name: campaign.campaignName || "Untitled",
          type: campaign.campaignType || "",
          coverImage: campaign.coverImage || "/default.png",
        },
        deliveryDate: campaign.postingSchedule?.end || null,
        status: s.status || "Pending",
        labelUrl: s.labelUrl,
        trackingUrl: s.trackingUrl,
      };
    });

    res.status(200).json({
      success: true,
      message: "Stored shipments fetched successfully",
      data: mapped,
    });
  } catch (err) {
    logger.error(`❌ Shipment fetch error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch stored shipments",
      error: err.message,
    });
  }
};

export const createManualShipment = async (req, res) => {
  try {
    const { carrierSlug, trackingNumber, campaignId, url } = req.body;
    const userId = req.user._id;

    if (!carrierSlug || !trackingNumber || !campaignId) {
      return res.status(400).json({
        success: false,
        message: "carrierSlug, trackingNumber, and campaignId are required",
      });
    }

    // ✅ Check if a manual shipment for the campaign already exists
    let shipment = await Shipment.findOne({
      applicationId: campaignId,
    });

    if (shipment) {
      // 🔄 Update existing shipment (update tracking number + status)
      shipment.carrierSlug = carrierSlug;
      shipment.trackingNumber = trackingNumber;
      shipment.trackingUrl = url;
      shipment.status = "tracked";
      shipment.userId = userId;
      await shipment.save();

      return res.status(200).json({
        success: true,
        message: "Manual shipment updated successfully",
        shipment,
      });
    }

    res.status(201).json({
      success: true,
      message: "Manual shipment created successfully",
      shipment,
    });
  } catch (err) {
    logger.error(`🚨 AfterShip error: ${err.response?.data || err.message}`);
    res.status(500).json({
      success: false,
      error: err.response?.data || err.message,
    });
  }
};

export const getShipmentsAll = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;
    const shipments = await Shipment.find().skip(skip).limit(parseInt(limit));
    const total = await Shipment.countDocuments();
    res.status(200).json({
      success: true,
      data: shipments,
      total: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    logger.error(
      `🚨 Error fetching shipments: ${err.response?.data || err.message}`
    );
    res
      .status(500)
      .json({ success: false, error: err.response?.data || err.message });
  }
};

export const updateShipmentStatus = async (req, res) => {
  try {
    const { shipmentId, status } = req.body;
    const shipment = await Shipment.findByIdAndUpdate(
      shipmentId,
      { status },
      { new: true }
    );
    res.status(200).json({ success: true, data: shipment });
  } catch (err) {
    logger.error(
      `🚨 Error updating shipment status: ${err.response?.data || err.message}`
    );
    res
      .status(500)
      .json({ success: false, error: err.response?.data || err.message });
  }
};
