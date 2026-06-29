import Notification from "../models/NotificationModel.js";
import socketService from "./socketService.js";
import { logger } from "./logger.js";

class NotificationService {
  async createNotification(notificationData) {
    try {
      const notification = new Notification({
        recipient: notificationData.recipientId,
        sender: notificationData.senderId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
      });

      await notification.save();

      socketService.sendToUser(
        notificationData.recipientId,
        "new_notification",
        {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read: notification.read,
          createdAt: notification.createdAt,
        }
      );

      return notification;
    } catch (error) {
      logger.error(`Error creating notification: ${error}`);
      throw error;
    }
  }

  async createCampaignApplicationNotification(application) {
    try {
      const advertiserId = application.campaign.createdBy.toString();

      const notificationData = {
        recipientId: advertiserId,
        senderId: application.userId._id.toString(),
        type: "campaign_application",
        title: "New Campaign Application",
        message: `${application.userId.name} has applied for your campaign "${application.campaign.campaignName}"`,
        data: {
          applicationId: application._id.toString(),
          campaignId: application.campaign._id.toString(),
          creatorId: application.userId._id.toString(),
          creatorName: application.userId.name,
          campaignName: application.campaign.campaignName,
          appliedAt: application.appliedAt,
        },
      };

      const notification = new Notification({
        recipient: notificationData.recipientId,
        sender: notificationData.senderId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
      });

      await notification.save();

      socketService.sendToUser(
        notificationData.recipientId,
        "new_notification",
        {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read: notification.read,
          createdAt: notification.createdAt,
        }
      );

      return notification;
    } catch (error) {
      logger.error(
        `Error creating campaign application notification: ${error}`
      );
      throw error;
    }
  }

  async createCampaignCreationNotification(campaign, advertiserId) {
    try {
      const notificationData = {
        recipientId: "6880810a0d749bb7970bd16b",
        senderId: advertiserId,
        type: "campaign_created",
        title: "New Campaign Created",
        message: `New campaign "${campaign.campaignName}" created by advertiser`,
        data: {
          campaignId: campaign._id.toString(),
          campaignName: campaign.campaignName,
          advertiserId: advertiserId,
          createdAt: new Date(),
        },
      };

      const notification = await this.createNotification(notificationData);
      return notification;
    } catch (error) {
      logger.error(`Error creating campaign creation notification: ${error}`);
      throw error;
    }
  }

  async createApplicationStatusNotification(application, status, updatedBy) {
    try {
      const influencerId = application.userId._id.toString();
      const advertiserId = updatedBy.toString();

      const notificationData = {
        recipientId: influencerId,
        senderId: advertiserId,
        type:
          status === "approved"
            ? "application_approved"
            : "application_rejected",
        title:
          status === "approved"
            ? "Application Approved!"
            : "Application Update",
        message:
          status === "approved"
            ? `Your application for "${application.campaign.campaignName}" has been approved!`
            : `Your application for "${application.campaign.campaignName}" has been ${status}.`,
        data: {
          applicationId: application._id.toString(),
          campaignId: application.campaign._id.toString(),
          campaignName: application.campaign.campaignName,
          status: status,
          updatedAt: new Date(),
        },
      };

      const notification = new Notification({
        recipient: notificationData.recipientId,
        sender: notificationData.senderId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
      });

      await notification.save();

      socketService.sendToUser(
        notificationData.recipientId,
        "new_notification",
        {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read: notification.read,
          createdAt: notification.createdAt,
        }
      );

      logger.info(
        `Application status notification created for influencer: ${influencerId}`
      );

      return notification;
    } catch (error) {
      logger.error(`Error creating application status notification: ${error}`);
      throw error;
    }
  }

  async createCampaignApprovalNotification(campaign, status, updatedBy) {
    try {
      const advertiserId =
        typeof campaign.createdBy === "object"
          ? campaign.createdBy._id.toString()
          : campaign.createdBy.toString();
      const adminId = updatedBy.toString();

      const notificationData = {
        recipientId: advertiserId,
        senderId: adminId,
        type: status === "approved" ? "campaign_approved" : "campaign_rejected",
        title: status === "approved" ? "Campaign Approved!" : "Campaign Update",
        message:
          status === "approved"
            ? `Your campaign "${campaign.campaignName}" has been approved and is now active!`
            : `Your campaign "${campaign.campaignName}" has been ${status}.`,
        data: {
          campaignId: campaign._id.toString(),
          campaignName: campaign.campaignName,
          status: status,
          updatedAt: new Date(),
        },
      };

      const notification = new Notification({
        recipient: notificationData.recipientId,
        sender: notificationData.senderId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
      });

      await notification.save();

      socketService.sendToUser(
        notificationData.recipientId,
        "new_notification",
        {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read: notification.read,
          createdAt: notification.createdAt,
        }
      );

      logger.info(
        `Campaign approval notification created for advertiser: ${advertiserId}`
      );

      return notification;
    } catch (error) {
      logger.error(`Error creating campaign approval notification: ${error}`);
      throw error;
    }
  }

  async createContentSubmissionNotification(application, contentData) {
    try {
      const advertiserId = application.campaign.createdBy.toString();
      const influencerId = application.userId._id.toString();

      const notificationData = {
        recipientId: advertiserId,
        senderId: influencerId,
        type: "content_submitted",
        title: "New Content Submitted",
        message: `${application.userId.name} has submitted content for your campaign "${application.campaign.campaignName}"`,
        data: {
          applicationId: application._id.toString(),
          campaignId: application.campaign._id.toString(),
          influencerId: influencerId,
          influencerName: application.userId.name,
          campaignName: application.campaign.campaignName,
          contentType: contentData.contentType || "content",
          submittedAt: new Date(),
        },
      };

      const notification = new Notification({
        recipient: notificationData.recipientId,
        sender: notificationData.senderId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
      });

      await notification.save();

      socketService.sendToUser(
        notificationData.recipientId,
        "new_notification",
        {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read: notification.read,
          createdAt: notification.createdAt,
        }
      );

      logger.info(
        `Content submission notification created for advertiser: ${advertiserId}`
      );

      return notification;
    } catch (error) {
      logger.error(`Error creating content submission notification: ${error}`);
      throw error;
    }
  }

  async createContentStatusNotification(
    application,
    status,
    feedback,
    updatedBy
  ) {
    try {
      const influencerId = application.userId._id.toString();
      const advertiserId = updatedBy.toString();

      const notificationData = {
        recipientId: influencerId,
        senderId: advertiserId,
        type: status === "approved" ? "content_approved" : "content_rejected",
        title: status === "approved" ? "Content Approved!" : "Content Update",
        message:
          status === "approved"
            ? `Your content for "${application.campaign.campaignName}" has been approved!`
            : `Your content for "${application.campaign.campaignName}" has been ${status}.`,
        data: {
          applicationId: application._id.toString(),
          campaignId: application.campaign._id.toString(),
          campaignName: application.campaign.campaignName,
          status: status,
          feedback: feedback || null,
          updatedAt: new Date(),
        },
      };

      const notification = new Notification({
        recipient: notificationData.recipientId,
        sender: notificationData.senderId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
      });

      await notification.save();

      socketService.sendToUser(
        notificationData.recipientId,
        "new_notification",
        {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read: notification.read,
          createdAt: notification.createdAt,
        }
      );

      logger.info(
        `Content status notification created for influencer: ${influencerId}`
      );

      return notification;
    } catch (error) {
      logger.error(`Error creating content status notification: ${error}`);
      throw error;
    }
  }

  async createContentResubmissionNotification(
    application,
    feedback,
    updatedBy
  ) {
    try {
      const influencerId = application.userId._id.toString();
      const advertiserId = updatedBy.toString();

      const notificationData = {
        recipientId: influencerId,
        senderId: advertiserId,
        type: "content_resubmission_requested",
        title: "Content Resubmission Requested",
        message: `Please resubmit your content for "${application.campaign.campaignName}"`,
        data: {
          applicationId: application._id.toString(),
          campaignId: application.campaign._id.toString(),
          campaignName: application.campaign.campaignName,
          feedback: feedback || "Please review and resubmit your content",
          requestedAt: new Date(),
        },
      };

      const notification = new Notification({
        recipient: notificationData.recipientId,
        sender: notificationData.senderId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
      });

      await notification.save();

      socketService.sendToUser(
        notificationData.recipientId,
        "new_notification",
        {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read: notification.read,
          createdAt: notification.createdAt,
        }
      );

      logger.info(
        `Content resubmission notification created for influencer: ${influencerId}`
      );

      return notification;
    } catch (error) {
      logger.error(
        `Error creating content resubmission notification: ${error}`
      );
      throw error;
    }
  }

  async createDeadlineExtensionNotification(
    application,
    newDeadline,
    updatedBy
  ) {
    try {
      const influencerId = application.userId._id.toString();
      const advertiserId = updatedBy.toString();

      const notificationData = {
        recipientId: influencerId,
        senderId: advertiserId,
        type: "deadline_extended",
        title: "Deadline Extended",
        message: `Your deadline for "${application.campaign.campaignName}" has been extended to ${new Date(newDeadline).toLocaleDateString()}`,
        data: {
          applicationId: application._id.toString(),
          campaignId: application.campaign._id.toString(),
          campaignName: application.campaign.campaignName,
          newDeadline: newDeadline,
          extendedAt: new Date(),
        },
      };

      const notification = new Notification({
        recipient: notificationData.recipientId,
        sender: notificationData.senderId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
      });

      await notification.save();

      socketService.sendToUser(
        notificationData.recipientId,
        "new_notification",
        {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read: notification.read,
          createdAt: notification.createdAt,
        }
      );

      logger.info(
        `Deadline extension notification created for influencer: ${influencerId}`
      );

      return notification;
    } catch (error) {
      logger.error(`Error creating deadline extension notification: ${error}`);
      throw error;
    }
  }

  async createCampaignDeletionNotification(campaign, remarks, deletedBy) {
    try {
      const advertiserId =
        typeof campaign.createdBy === "object"
          ? campaign.createdBy._id.toString()
          : campaign.createdBy.toString();
      const adminId = deletedBy.toString();

      const notificationData = {
        recipientId: advertiserId,
        senderId: adminId,
        type: "campaign_deleted",
        title: "Campaign Deleted",
        message: `Your campaign "${campaign.campaignName}" has been deleted by admin${remarks ? `: ${remarks}` : ""}`,
        data: {
          campaignId: campaign._id.toString(),
          campaignName: campaign.campaignName,
          remarks: remarks || null,
          deletedAt: new Date(),
        },
      };

      const notification = new Notification({
        recipient: notificationData.recipientId,
        sender: notificationData.senderId,
        type: notificationData.type,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data || {},
      });

      await notification.save();

      socketService.sendToUser(
        notificationData.recipientId,
        "new_notification",
        {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          read: notification.read,
          createdAt: notification.createdAt,
        }
      );

      logger.info(
        `Campaign deletion notification created for advertiser: ${advertiserId}`
      );

      return notification;
    } catch (error) {
      logger.error(`Error creating campaign deletion notification: ${error}`);
      throw error;
    }
  }

  async getUserNotifications(userId, page = 1, limit = 40) {
    try {
      const skip = (page - 1) * limit;

      const notifications = await Notification.find({ recipient: userId })
        .populate("sender", "name photoUrl")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      const total = await Notification.countDocuments({ recipient: userId });
      const unreadCount = await Notification.countDocuments({
        recipient: userId,
        read: false,
      });

      return {
        notifications,
        pagination: {
          total,
          page,
          limit,
          pages: Math.ceil(total / limit),
        },
        unreadCount,
      };
    } catch (error) {
      logger.error(`Error getting user notifications: ${error}`);
      throw error;
    }
  }

  async markAsRead(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        { _id: notificationId, recipient: userId },
        { read: true, readAt: new Date() },
        { new: true }
      );

      return notification;
    } catch (error) {
      logger.error(`Error marking notification as read: ${error}`);
      throw error;
    }
  }

  async markAllAsRead(userId) {
    try {
      await Notification.updateMany(
        { recipient: userId, read: false },
        { read: true, readAt: new Date() }
      );

      return true;
    } catch (error) {
      logger.error(`Error marking all notifications as read: ${error}`);
      throw error;
    }
  }

  async deleteNotification(notificationId, userId) {
    try {
      const notification = await Notification.findOneAndDelete({
        _id: notificationId,
        recipient: userId,
      });

      return notification;
    } catch (error) {
      logger.error(`Error deleting notification: ${error}`);
      throw error;
    }
  }
}

const notificationService = new NotificationService();

export default notificationService;