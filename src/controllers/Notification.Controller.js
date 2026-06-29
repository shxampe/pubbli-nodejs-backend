import notificationService from "../utils/notificationService.js";
import { logger } from "../utils/logger.js";

export const getUserNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 40 } = req.query;
    const userId = req.user._id;

    const result = await notificationService.getUserNotifications(
      userId,
      parseInt(page),
      parseInt(limit)
    );

    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error(`Get user notifications error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch notifications",
      error: error.message,
    });
  }
};

export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await notificationService.getUserNotifications(userId, 1, 1);

    res.status(200).json({
      success: true,
      data: {
        unreadCount: result.unreadCount,
      },
    });
  } catch (error) {
    logger.error(`Get unread count error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to fetch unread count",
      error: error.message,
    });
  }
};

export const markNotificationAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await notificationService.markAsRead(id, userId);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      data: notification,
    });
  } catch (error) {
    logger.error(`Mark notification as read error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to mark notification as read",
      error: error.message,
    });
  }
};

export const markAllNotificationsAsRead = async (req, res) => {
  try {
    const userId = req.user._id;

    await notificationService.markAllAsRead(userId);

    res.status(200).json({
      success: true,
      message: "All notifications marked as read",
    });
  } catch (error) {
    logger.error(`Mark all notifications as read error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to mark notifications as read",
      error: error.message,
    });
  }
};

export const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await notificationService.deleteNotification(
      id,
      userId
    );

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: "Notification not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Notification deleted successfully",
    });
  } catch (error) {
    logger.error(`Delete notification error: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "Failed to delete notification",
      error: error.message,
    });
  }
}; 