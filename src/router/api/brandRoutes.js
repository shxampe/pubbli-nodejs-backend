import express from "express";
import {
  createBrand,
  getAllBrands, 
  getBrandById,
  updateBrand,
  deleteBrand,
  checkBrandCampaigns,
  getBrandsByUser,
} from "../../controllers/brandController.js";
import multer from "multer";
import { authenticate } from "../../middleware/authMiddleware.js";

// Specific multer config for brand uploads with better error handling
const brandUploadConfig = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for brand logos
    files: 1, // Maximum 1 file
    fields: 10, // Maximum 10 non-file fields
    fieldSize: 1024 * 1024, // 1MB per field
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    const allowedTypes = [
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname),
        false
      );
    }
  },
});

const brandUpload = brandUploadConfig.fields([
  { name: "logoUrl", maxCount: 1 },
]);

// Middleware to handle multer errors
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    switch (err.code) {
      case "LIMIT_FILE_SIZE":
        return res.status(413).json({
          success: false,
          message: "File size too large. Maximum allowed size is 10MB.",
        });
      case "LIMIT_FILE_COUNT":
        return res.status(400).json({
          success: false,
          message: "Too many files. Only 1 logo file is allowed.",
        });
      case "LIMIT_UNEXPECTED_FILE":
        return res.status(400).json({
          success: false,
          message: "Unexpected file type. Only image files are allowed.",
        });
      case "LIMIT_FIELD_COUNT":
        return res.status(400).json({
          success: false,
          message: "Too many fields in the request.",
        });
      case "LIMIT_FIELD_SIZE":
        return res.status(413).json({
          success: false,
          message: "Field value too large.",
        });
      default:
        return res.status(400).json({
          success: false,
          message: "File upload error: " + err.message,
        });
    }
  }
  next(err);
};

const router = express.Router();

router.post("/", brandUpload, handleUploadErrors, authenticate, createBrand);
router.get("/", authenticate, getAllBrands);
router.get("/user/:id", getBrandsByUser);
router.get("/:id", getBrandById);
router.put("/:id", brandUpload, handleUploadErrors, updateBrand);
router.delete("/:id", deleteBrand);
router.get("/:id/campaigns", checkBrandCampaigns);

export default router;
