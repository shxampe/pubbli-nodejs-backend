import cron from 'node-cron';
import CampaignApplication from '../../models/CampaignApplication.js';
import notificationService from '../../utils/notificationService.js';
import { logger } from "../../utils/logger.js";

const autoCompleteApplications = async () => {
  try {
    const applications = await CampaignApplication.find({
      applicationStatus: "approved",
      contentApprovalStatus: "submitted",
      jobTimelineStatus: "content_uploaded",
      contentDeadline: { $lt: new Date() },
    })
      .populate("userId", "name email")
      .populate("campaign", "campaignName createdBy");

    logger.info(`Found ${applications.length} applications to auto-complete`);

    for (const application of applications) {
      try {
        // Update application status
        await CampaignApplication.findByIdAndUpdate(application._id, {
          applicationStatus: "completed",
          jobTimelineStatus: "job_completed",
        });

        // Notify both advertiser and influencer
        try {
          await notificationService.createApplicationStatusNotification(
            application,
            "completed",
            application.campaign.createdBy
          );
        } catch (notifyError) {
          logger.error(
            `Failed to send notification for application ${application._id}:`,
            notifyError
          );
        }

        logger.info(
          `Auto-completed application ${application._id} for campaign ${application.campaign.campaignName}`
        );

        // Wait 1 second between updates
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(
          `Failed to auto-complete application ${application._id}:`,
          error
        );
        continue;
      }
    }

    logger.info("Completed auto-completion check");
  } catch (error) {
    logger.error(`Error in auto-complete job: ${error}`);
  }
};

// Run every 24 hours at midnight
export const autoCompleteApplicationsJob = cron.schedule('0 0 * * *', autoCompleteApplications, {
    scheduled: false,
    timezone: "UTC"
}); 