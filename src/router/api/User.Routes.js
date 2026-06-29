import express from "express";
import {
  getAllUsers,
  removeUser,
  updateProfile,
  updateUser,
  getCurrentUser,
  getAdvertiserDetailsById,
  getInfluencerDetailsById,
  getInfluencerDetailsByUserName,
  addUserAddress,
  getUserAddresses,
  uploadReferenceContent,
  getReferenceContent,
  deleteUserAddress,
  updateUserAddress,
  deleteReferenceContentById,
  getDashboardStats,
  getSocialMediaAccounts,
  getAllUsersByRole,
  completeProfile,
  setPreferedCategories
} from "../../controllers/User.Controller.js";
import { CheckRole } from "../../middleware/checkRoleMiddleware.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import config from "../../config/appconfig.js";
import multer from "multer";
import { getAdminStats } from "../../controllers/Payment.Controller.js";

const UserRouter = express.Router();

const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
    fieldSize: 25 * 1024 * 1024, // 25MB field size limit
  },
});

// UserRouter.get("/all-users", getAllUsers);
UserRouter.get(
  "/all-users",
  authenticate,
  CheckRole(["admin", "superadmin"]), // or use config.auth.active_roles if preferred
  getAllUsers
);
UserRouter.get("/me", authenticate, getCurrentUser);

UserRouter.get("/admin/admin-stats", authenticate, getAdminStats);

UserRouter.get(
  "/social-media-accounts/:id",
  // authenticate,
  getSocialMediaAccounts
);

// ✅ Protected route
UserRouter.delete(
  "/remove-user/:id",
  authenticate,
  CheckRole(["superadmin"]),
  removeUser
);

UserRouter.get("/influencer/:id", authenticate, getInfluencerDetailsById);

UserRouter.get(
  "/dashboard-stats",
  // authenticate,
  getDashboardStats
);

UserRouter.get(
  "/all-users-by-role",
  // authenticate,
  getAllUsersByRole
);

UserRouter.get("/:username", getInfluencerDetailsByUserName);

UserRouter.patch(
  "/update-user/:userId",
  authenticate,
  CheckRole(["superadmin"]),
  upload.single("image"),
  updateUser
);
UserRouter.patch(
  "/update-profile",
  authenticate,
  CheckRole(config.auth.active_roles),
  upload.single("image"),
  updateProfile
);
UserRouter.post("/address", authenticate, addUserAddress);
UserRouter.get("/address", authenticate, getUserAddresses);
UserRouter.delete("/address/:addressId", authenticate, deleteUserAddress);
UserRouter.put("/address/:addressId", authenticate, updateUserAddress);
UserRouter.get("/advertiser/:id", authenticate, getAdvertiserDetailsById);

UserRouter.post(
  "/profile/reference-content",
  authenticate,
  // referenceContentUpload,
  upload.single("file"),
  (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          message: "File size too large. Maximum allowed size is 50MB.",
        });
      }
    }
    next(error);
  },
  uploadReferenceContent
);
UserRouter.get("/profile/reference-content", authenticate, getReferenceContent);

UserRouter.delete(
  "/profile/reference-content/:referenceContentId",
  authenticate,
  deleteReferenceContentById
);

UserRouter.post("/complete-profile", 
  upload.single("image"), 
  authenticate, completeProfile);

UserRouter.post("/set-preferred-categories", 
  authenticate, 
  setPreferedCategories);

export default UserRouter;
