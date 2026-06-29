import express from "express";
import {
  changePassword,
  forgetPassword,
  loginUser,
  registerUser,
  setPassword,
  verifyOtp,
  verifyEmailOtp,
  getUserById,
  googleAuth,
  googleCallback,
  getYouTubeData,
  getYouTubeVideoData,
} from "../../controllers/Auth.Controller.js";
import { authenticate } from "../../middleware/authMiddleware.js";
import { CheckRole } from "../../middleware/checkRoleMiddleware.js";
import config from "../../config/appconfig.js";

const AuthRouter = express.Router();

AuthRouter.post("/register-user", registerUser);
AuthRouter.post("/login", loginUser);
AuthRouter.get("/get-user/:id", authenticate, getUserById);

//-------------- reset password routes --------------
AuthRouter.post("/forget-password", forgetPassword);
AuthRouter.post("/verify-otp", verifyOtp);
AuthRouter.post("/verify-email", verifyEmailOtp);
AuthRouter.post("/set-password", setPassword);
//---------------------------------------------------

AuthRouter.post("/change-password", authenticate, CheckRole(config.auth.active_roles), changePassword); //all roles support
// AuthRouter.patch("/update-profile", authenticate, CheckRole(config.auth.active_roles), updateProfile);

AuthRouter.get("/google", googleAuth);
AuthRouter.get("/google-callback", googleCallback);
AuthRouter.get("/youtube-data", authenticate, getYouTubeData);
AuthRouter.post("/youtube-video-data", authenticate, getYouTubeVideoData);


export default AuthRouter;
