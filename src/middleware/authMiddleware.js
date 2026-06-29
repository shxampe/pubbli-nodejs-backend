import jwt from "jsonwebtoken";
import User from "../models/User.js";
import config from "../config/appconfig.js";
import { logger } from "../utils/logger.js";

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: Token missing or malformed.",
      });
    }

    const token = authHeader.split(" ")[1];

    // Verify token using your secret
    const decoded = jwt.verify(token, config.auth.jwt_secret);

    // Fetch the user from DB using decoded userId
    const user = await User.findById(decoded.userId).select("-password");

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User not found.",
      });
    }

    // Attach user to request
    req.user = user;

    next();
  } catch (error) {
    logger.error(`Authentication Error: ${error}`);
    return res.status(401).json({
      success: false,
      message: "Unauthorized: Invalid or expired token.",
    });
  }
};
