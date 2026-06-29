import CampaignInvitation from "../models/CampaignInvitation.js";
import Campaign from "../models/CampaignModel.js";
import CampaignApplication from "../models/CampaignApplication.js";
import User from "../models/User.js";
import notificationService from "../utils/notificationService.js";
import { logger } from "../utils/logger.js";

export const sendInvitation = async (req, res) => {
  try {
    const { campaignId } = req.params;
    const { influencerId, message } = req.body;
    const advertiserId = req.user._id;

    const campaign = await Campaign.findOne({
      _id: campaignId,
      createdBy: advertiserId,
      campaignStatus: "active",
    });

    if (!campaign) {
      return res.status(404).json({
        success: false,
        message: "Campaign not found or not active",
      });
    }

    const influencer = await User.findById(influencerId);
    if (!influencer) {
      return res.status(404).json({
        success: false,
        message: "Influencer not found",
      });
    }

    const existingInvitation = await CampaignInvitation.findOne({
      campaignId,
      influencerId,
    });

    if (existingInvitation) {
      return res.status(400).json({
        success: false,
        message: "Invitation already sent to this influencer",
      });
    }

    const existingApplication = await CampaignApplication.findOne({
      campaign: campaignId,
      userId: influencerId,
    });

    if (existingApplication) {
      return res.status(400).json({
        success: false,
        message: "Influencer has already applied to this campaign",
      });
    }

    const invitation = new CampaignInvitation({
      campaignId,
      influencerId,
      advertiserId,
      message,
    });

    await invitation.save();

    await notificationService.createNotification({
      recipientId: influencerId,
      senderId: advertiserId,
      type: "campaign_invitation",
      title: "New Campaign Invitation",
      message: `You've been invited to participate in the campaign "${campaign.campaignName}"`,
      data: {
        invitationId: invitation._id,
        campaignId: campaign._id,
        campaignName: campaign.campaignName,
        message: message || null,
        expiresAt: invitation.expiresAt,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Invitation sent successfully",
      data: invitation,
    });
  } catch (error) {
    logger.error(`Error sending invitation: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to send invitation",
      error: error.message,
    });
  }
};

export const acceptInvitation = async (req, res) => {
  try {
    const { invitationId } = req.params;
    const influencerId = req.user._id;

    const invitation = await CampaignInvitation.findOne({
      _id: invitationId,
      influencerId,
      status: "pending",
    }).populate("campaignId");

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found or already processed",
      });
    }

    if (invitation.expiresAt < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Invitation has expired",
      });
    }

    const application = new CampaignApplication({
      userId: influencerId,
      campaign: invitation.campaignId._id,
      applicationStatus: "applied",
      jobTimelineStatus: "applied",
    });

    await application.save();

    invitation.status = "accepted";
    invitation.respondedAt = new Date();
    await invitation.save();

    await notificationService.createNotification({
      recipientId: invitation.advertiserId,
      senderId: influencerId,
      type: "invitation_accepted",
      title: "Invitation Accepted",
      message: `Your invitation for campaign "${invitation.campaignId.campaignName}" has been accepted`,
      data: {
        invitationId: invitation._id,
        campaignId: invitation.campaignId._id,
        campaignName: invitation.campaignId.campaignName,
        applicationId: application._id,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Invitation accepted successfully",
      data: { invitation, application },
    });
  } catch (error) {
    logger.error(`Error accepting invitation: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to accept invitation",
      error: error.message,
    });
  }
};

export const declineInvitation = async (req, res) => {
  try {
    const { invitationId } = req.params;
    const influencerId = req.user._id;

    const invitation = await CampaignInvitation.findOne({
      _id: invitationId,
      influencerId,
      status: "pending",
    }).populate("campaignId");

    if (!invitation) {
      return res.status(404).json({
        success: false,
        message: "Invitation not found or already processed",
      });
    }

    invitation.status = "declined";
    invitation.respondedAt = new Date();
    await invitation.save();

    await notificationService.createNotification({
      recipientId: invitation.advertiserId,
      senderId: influencerId,
      type: "invitation_declined",
      title: "Invitation Declined",
      message: `Your invitation for campaign "${invitation.campaignId.campaignName}" has been declined`,
      data: {
        invitationId: invitation._id,
        campaignId: invitation.campaignId._id,
        campaignName: invitation.campaignId.campaignName,
      },
    });

    return res.status(200).json({
      success: true,
      message: "Invitation declined successfully",
      data: invitation,
    });
  } catch (error) {
    logger.error(`Error declining invitation: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to decline invitation",
      error: error.message,
    });
  }
};

export const listInfluencerInvitations = async (req, res) => {
  try {
    const influencerId = req.user._id;
    const { status } = req.query;

    const query = { influencerId };
    if (status) {
      query.status = status;
    }

    const invitations = await CampaignInvitation.find(query)
      .populate(
        "campaignId",
        "campaignName description coverImage compensation"
      )
      .populate("advertiserId", "name photoUrl")
      .sort({ invitedAt: -1 });

    return res.status(200).json({
      success: true,
      data: invitations,
    });
  } catch (error) {
    logger.error(`Error listing invitations: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to list invitations",
      error: error.message,
    });
  }
};

export const listAdvertiserInvitations = async (req, res) => {
  try {
    const advertiserId = req.user._id;
    const { status, campaignId } = req.query;

    const query = { advertiserId };
    if (status) {
      query.status = status;
    }
    if (campaignId) {
      query.campaignId = campaignId;
    }

    const invitations = await CampaignInvitation.find(query)
      .populate("campaignId", "campaignName")
      .populate("influencerId", "name photoUrl")
      .sort({ invitedAt: -1 });

    return res.status(200).json({
      success: true,
      data: invitations,
    });
  } catch (error) {
    logger.error(`Error listing sent invitations: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: "Failed to list sent invitations",
      error: error.message,
    });
  }
}; 