import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  getUnreadCount,
} from "../../controllers/Notification.Controller.js";

const NotificationRouter = express.Router();

// Get user notifications
NotificationRouter.get("/", authenticate, getUserNotifications);

// Get unread count
NotificationRouter.get("/unread-count", authenticate, getUnreadCount);

// Mark notification as read
NotificationRouter.patch("/:id/read", authenticate, markNotificationAsRead);

// Mark all notifications as read
NotificationRouter.patch("/mark-all-read", authenticate, markAllNotificationsAsRead);

// Delete notification
NotificationRouter.delete("/:id", authenticate, deleteNotification);

export default NotificationRouter;