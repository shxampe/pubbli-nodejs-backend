import Brand from "../models/BrandModel.js";
import Campaign from "../models/CampaignModel.js";
import mongoose from "mongoose";
import { deleteFileFromS3, uploadFileToS3 } from "../utils/s3Config.js";
import { logger } from "../utils/logger.js";

export const createBrand = async (req, res) => {
  const user = req.user;
  try {
    // Check for file size limits
    if (req.files?.logoUrl?.[0]) {
      const file = req.files.logoUrl[0];
      const maxSize = 10 * 1024 * 1024; // 10MB limit for images

      if (file.size > maxSize) {
        return res.status(413).json({
          success: false,
          message: "Logo file size too large. Maximum allowed size is 10MB.",
        });
      }

      // Check file type
      const allowedTypes = [
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
      ];
      if (!allowedTypes.includes(file.mimetype)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed.",
        });
      }
    }

    let logoUrl = "";
    if (req.files?.logoUrl?.[0]) {
      logoUrl = await uploadFileToS3("brands", req.files.logoUrl[0]);
    }
    const { brandName } = req.body;

    if (!brandName || brandName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Brand name is required",
      });
    }

    const existingBrand = await Brand.findOne({
      brandName: { $regex: new RegExp(`^${brandName.trim()}$`, "i") },
      createdBy: user._id,
    });

    if (existingBrand) {
      return res.status(400).json({
        success: false,
        message: "Brand with this name already exists",
      });
    }

    const brand = await Brand.create({
      ...req.body,
      brandName: brandName.trim(),
      logoUrl: logoUrl,
      createdBy: user._id,
    });
    res.status(201).json({ success: true, brand });
  } catch (err) {
    logger.error(`Error creating brand: ${err.message}`);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Brand with this name already exists",
      });
    }

    // Handle specific error types
    if (err.name === "ValidationError") {
      return res.status(400).json({
        success: false,
        message: "Validation error: " + err.message,
      });
    }

    if (err.message.includes("LIMIT_FILE_SIZE")) {
      return res.status(413).json({
        success: false,
        message: "File size too large. Please upload a smaller file.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Internal server error while creating brand",
    });
  }
};

// Get All Brands
export const getAllBrands = async (req, res) => {
  const user = req.user;

  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  try {
    const [brands, totalCount] = await Promise.all([
      Brand.find({ createdBy: user._id })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Brand.countDocuments({ createdBy: user._id }),
    ]);

    res.json({
      success: true,
      brands,
      total: totalCount,
      page: page,
      limit: limit,
      totalPages: Math.ceil(totalCount / limit),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Get Single Brand
export const getBrandById = async (req, res) => {
  logger.info(`getBrandById called for brand ID: ${req.params.id}`);
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res
        .status(404)
        .json({ success: false, message: "Brand not found" });
    }
    logger.info(`Brand found: ${brand.brandName}`);
    res.json({ success: true, brand });
  } catch (err) {
    logger.error(`Error getting brand by ID: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
};

// Update Brand
export const updateBrand = async (req, res) => {
  const brandId = req.params.id;

  try {
    const existingBrand = await Brand.findOne({
      _id: brandId,
      createdBy: req.user._id,
    });
    if (!existingBrand) {
      return res
        .status(404)
        .json({ success: false, message: "Brand not found" });
    }

    // Check if brand name is being updated and if it already exists
    if (req.body.brandName && req.body.brandName !== existingBrand.brandName) {
      const brandWithSameName = await Brand.findOne({
        brandName: req.body.brandName,
        _id: { $ne: req.params.id }, // Exclude current brand from check
      });

      if (brandWithSameName) {
        return res.status(400).json({
          success: false,
          message: "Brand name already exists",
        });
      }
    }

    let logoUrl = req.body.logoUrl;
    if (req.files?.logoUrl?.[0]) {
      if (existingBrand.logoUrl) {
        await deleteFileFromS3(existingBrand.logoUrl);
      }
      logoUrl = await uploadFileToS3("brands", req.files.logoUrl[0]);
    }

    const brand = await Brand.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        logoUrl: logoUrl,
      },
      { new: true }
    );

    res.json({ success: true, brand });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

// Delete Brand
export const deleteBrand = async (req, res) => {
  try {
    const brand = await Brand.findById(req.params.id);
    if (!brand) {
      return res
        .status(404)
        .json({ success: false, message: "Brand not found" });
    }
    if (brand.logoUrl) {
      await deleteFileFromS3(brand.logoUrl);
    }
    await Brand.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Brand deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


export const checkBrandCampaigns = async (req, res) => {
  try {
    const { id } = req.params;
    
    const campaigns = await Campaign.aggregate([
      {
        $lookup: {
          from: "products",
          localField: "product", 
          foreignField: "_id",
          as: "productInfo"
        }
      },
      {
        $match: {
          "productInfo.brandId": mongoose.Types.ObjectId.createFromHexString(id)
        }
      }
    ]);

    res.json({
      success: true,
      hasCampaigns: campaigns.length > 0,
      campaignsCount: campaigns.length,
      campaigns: campaigns
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getBrandsByUser = async (req, res) => {
  const id = req.params.id;
  try {
    const brands = await Brand.find({ createdBy: id }).select("brandName");
    res.json({ success: true, brands });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
