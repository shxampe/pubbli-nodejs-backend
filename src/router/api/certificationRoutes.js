import express from "express";
import {
  createCertification,
  getAllCertifications,
  applyForCertification,
  getUserCertifications,
  getCertificationById,
  updateCertificationStatus,
  getAllUserCertifications,
} from "../../controllers/certificationController.js";

import { authenticate } from "../../middleware/authMiddleware.js";
import upload from "../../middleware/multerConfig.js";
const router = express.Router();

// Admin routes
router.post("/admin/create", authenticate, createCertification);
router.get("/admin/list", authenticate, getAllCertifications);
router.get("/admin/:id", authenticate, getCertificationById);

// Influencer routes
router.post(
  "/apply/:id",
  authenticate,
  upload.single("file"),
  applyForCertification
);
router.get("/my-certifications/:id", authenticate, getUserCertifications);
router.put("/admin/status/:id", authenticate, updateCertificationStatus);

router.get("/all-certifications", authenticate, getAllUserCertifications);

export default router;
