import Product from "../models/ProductModel.js";
import Campaign from "../models/CampaignModel.js";
import CampaignApplication from "../models/CampaignApplication.js";
import { uploadFileToS3, deleteFileFromS3 } from "../utils/s3Config.js";
import { logger } from "../utils/logger.js";

// ✅ GET all products
export const getAllProducts = async (req, res) => {
  const user = req.user;
  const { page = 1, limit = 10 } = req.query;
  const skip = (page - 1) * limit;
  const total = await Product.countDocuments({
    createdBy: user._id,
  });
  try {
    const products = await Product.find({
      createdBy: user._id,
    })
      .sort({ _id: -1 })
      .populate("brandId", "brandName logoUrl _id")
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const campaigns = await Campaign.find({
      product: { $in: products.map((product) => product._id) },
    })
      .populate("product", "productName")
      .populate("createdBy", "name email photoUrl _id")
      .sort({ createdAt: -1 })
      .lean();

    // const applications = await CampaignApplication.find({ campaign: { $in: campaigns.map(campaign => campaign._id) } })
    //   .populate("campaign", "campaignName")
    //   .populate("userId", "name email photoUrl _id")
    //   .sort({ createdAt: -1 }).lean();

    const productWithCampaignsAndApplications = products.map((product) => {
      const productCampaigns = campaigns.filter(
        (campaign) => campaign.product._id.toString() === product._id.toString()
      );
      // const productApplications = applications.filter(application => productCampaigns.some(campaign => campaign._id.toString() === application.campaign._id.toString()));
      return {
        ...product,
        campaigns: productCampaigns,
        // applications: productApplications,
        totalCampaigns: productCampaigns.length,
        activeCampaigns: productCampaigns.filter(
          (campaign) => campaign.campaignStatus === "active"
        ).length,
      };
    });
    res.json({
      success: true,
      data: productWithCampaignsAndApplications,
      total: total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// single product with campaigns and applications
export const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Pagination and filters
    const {
      page = 1,
      limit = 10,
      status,
      campaignStrategy,
      startDate,
      endDate,
    } = req.query;

    // Build filter for campaigns that use this product
    const filter = { product: req.params.id };
    if (status) filter.status = status;
    if (campaignStrategy) filter.campaignStrategy = campaignStrategy;
    if (startDate || endDate) {
      filter.applicationDeadline = {};
      if (startDate)
        filter.applicationDeadline.start = { $gte: new Date(startDate) };
      if (endDate) filter.applicationDeadline.end = { $lte: new Date(endDate) };
    }

    // Get paginated campaigns for this product
    const campaigns = await Campaign.find(filter)
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const totalCampaigns = await Campaign.countDocuments({
      product: req.params.id,
    });
    const pendingCampaigns = await Campaign.countDocuments({
      product: req.params.id,
      campaignStatus: "pending",
    });
    const activeCampaigns = await Campaign.countDocuments({
      product: req.params.id,
      campaignStatus: "active",
    });
    const pausedCampaigns = await Campaign.countDocuments({
      product: req.params.id,
      campaignStatus: "paused",
    });

    // Get application counts and final content for each campaign
    const campaignsWithDetails = await Promise.all(
      campaigns.map(async (campaign) => {
        // Get total applications for this campaign
        const totalApplications = await CampaignApplication.countDocuments({
          campaign: campaign._id,
        });

        // Get applications with final content
        const finalContentApplications = await CampaignApplication.find({
          campaign: campaign._id,
          finalVideoUrl: { $exists: true, $nin: [null, ""] },
        });

        // Get approved applications
        const approvedApplications = await CampaignApplication.countDocuments({
          campaign: campaign._id,
          applicationStatus: "approved",
        });

        return {
          _id: campaign._id,
          campaignName: campaign.campaignName,
          description: campaign.description,
          campaignType: campaign.campaignType,
          campaignStrategy: campaign.campaignStrategy,
          campaignTypeCategory: campaign.campaignTypeCategory,
          status: campaign.status,
          approvalStatus: campaign.approvalStatus,
          compensation: campaign.compensation,
          applicationDeadline: campaign.applicationDeadline,
          postingSchedule: campaign.postingSchedule,
          contentRequirements: campaign.contentRequirements,
          createdBy: campaign.createdBy,
          stats: {
            totalApplications,
            approvedApplications,
            finalContentCount: finalContentApplications.length,
            finalVideoUrls: finalContentApplications
              .map((app) => app.finalVideoUrl)
              .filter((url) => url !== null && url !== undefined && url !== ""),
          },
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
        };
      })
    );

    res.json({
      product,
      campaigns: campaignsWithDetails,
      totalCampaigns,
      pendingCampaigns,
      activeCampaigns,
      pausedCampaigns,
      pagination: {
        total: totalCampaigns,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(totalCampaigns / limit),
      },
      success: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// ✅ GET products by brand
export const getProductsByBrand = async (req, res) => {
  try {
    const { brandId } = req.params;
    const products = await Product.find({ brandId }).populate(
      "brandId",
      "brandName logoUrl website industry description"
    );
    res.json(products);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
// ✅ CREATE product
export const createProduct = async (req, res) => {
  try {
    let imageUrl = "";

    if (req.files?.image?.[0]) {
      imageUrl = await uploadFileToS3("products", req.files.image[0]);
    }

    const product = new Product({
      ...req.body,
      image: imageUrl,
      createdBy: req.user._id,
    });

    await product.save();
    res.status(201).json(product);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const updateProduct = async (req, res) => {
  try {
    let updateData = { ...req.body };

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    if (product.image) {
      await deleteFileFromS3(product.image);
    }

    if (req.files?.image?.[0]) {
      const imageUrl = await uploadFileToS3("products", req.files.image[0]);
      updateData.image = imageUrl;
    }

    const updated = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
    });

    if (!updated) return res.status(404).json({ error: "Product not found" });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
// ✅ DELETE product
export const deleteProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ error: "Product not found" });
    if (product.image) {
      await deleteFileFromS3(product.image);
    }
    await Product.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

export const getCampaignsByProductId = async (req, res) => {
  try {
    const { productId } = req.params;
    const {
      page = 1,
      limit = 10,
      status,
      campaignStrategy,
      startDate,
      endDate,
    } = req.query;

    if (!productId) {
      return res.status(400).json({
        success: false,
        message: "Product ID is required",
      });
    }

    // Build filter for campaigns that use this product
    const filter = { product: productId };

    if (status) filter.status = status;
    if (campaignStrategy) filter.campaignStrategy = campaignStrategy;
    if (startDate || endDate) {
      filter.applicationDeadline = {};
      if (startDate)
        filter.applicationDeadline.start = { $gte: new Date(startDate) };
      if (endDate) filter.applicationDeadline.end = { $lte: new Date(endDate) };
    }

    // Get all campaigns for this product
    const campaigns = await Campaign.find(filter)
      .populate({
        path: "product",
        populate: {
          path: "brandId",
          model: "Brand",
          select: "brandName",
        },
      })
      .populate("createdBy", "name email photoUrl")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    const total = await Campaign.countDocuments(filter);

    // Get application counts and final content for each campaign
    const campaignsWithDetails = await Promise.all(
      campaigns.map(async (campaign) => {
        // Get total applications for this campaign
        const totalApplications = await CampaignApplication.countDocuments({
          campaign: campaign._id,
        });

        // Get applications with final content
        const finalContentApplications = await CampaignApplication.find({
          campaign: campaign._id,
          finalVideoUrl: { $exists: true, $nin: [null, ""] },
        });

        // Get approved applications
        const approvedApplications = await CampaignApplication.countDocuments({
          campaign: campaign._id,
          applicationStatus: "approved",
        });

        return {
          _id: campaign._id,
          campaignName: campaign.campaignName,
          description: campaign.description,
          campaignType: campaign.campaignType,
          campaignStrategy: campaign.campaignStrategy,
          campaignTypeCategory: campaign.campaignTypeCategory,
          status: campaign.status,
          approvalStatus: campaign.approvalStatus,
          compensation: campaign.compensation,
          applicationDeadline: campaign.applicationDeadline,
          postingSchedule: campaign.postingSchedule,
          contentRequirements: campaign.contentRequirements,
          createdBy: campaign.createdBy,
          // product: campaign.product ? {
          //   _id: campaign.product._id,
          //   name: campaign.product.name,
          //   brand: campaign.product.brandId ? {
          //     _id: campaign.product.brandId._id,
          //     brandName: campaign.product.brandId.brandName
          //   } : null
          // } : null,
          stats: {
            totalApplications,
            approvedApplications,
            finalContentCount: finalContentApplications.length,
            finalVideoUrls: finalContentApplications
              .map((app) => app.finalVideoUrl)
              .filter((url) => url !== null && url !== undefined && url !== ""),
          },
          createdAt: campaign.createdAt,
          updatedAt: campaign.updatedAt,
        };
      })
    );

    res.status(200).json({
      success: true,
      message: "Campaigns for product retrieved successfully",
      productId: campaigns[0].product._id,
      productName: campaigns[0].product.name,
      data: campaignsWithDetails,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    logger.error(`Error fetching campaigns by product: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch campaigns for product",
      error: error.message,
    });
  }
};

export const duplicateProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId)
      .select("-_id -createdAt -updatedAt")
      .lean();
    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }
    const newProduct = new Product({
      ...product,
      productName: `${product.productName} (Duplicate)`,
    });
    await newProduct.save();
    res.status(201).json(newProduct);
  } catch (error) {
    res
      .status(500)
      .json({ error: "Failed to duplicate product", message: error.message });
  }
};

// Change product status (active/inactive)
export const changeProductStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!["active", "inactive"].includes(status)) {
      return res
        .status(400)
        .json({
          error: 'Invalid status value. Must be "active" or "inactive".',
        });
    }
    const updatedProduct = await Product.findByIdAndUpdate(
      id,
      { product_status: status },
      { new: true }
    );
    if (!updatedProduct) {
      return res.status(404).json({ error: "Product not found" });
    }
    res.json({ success: true, product: updatedProduct });
  } catch (err) {
    res
      .status(500)
      .json({ error: "Failed to update product status", message: err.message });
  }
};