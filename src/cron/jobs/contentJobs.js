import cron from 'node-cron';
import CampaignApplication from '../../models/CampaignApplication.js';
import { sendContentDeadlineReminder } from '../../utils/loopsService.js';
import { logger } from "../../utils/logger.js";

const checkDeadlines = async () => {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);

    const applications = await CampaignApplication.find({
      contentDeadline: {
        $gte: new Date(),
        $lte: tomorrow,
      },
      contentApprovalStatus: {
        $in: ["notsubmitted", "resubmission"],
      },
    })
      .populate("userId", "email")
      .populate("campaign");

    logger.info(
      `Found ${applications.length} applications with deadlines in 24 hours`
    );

    for (const application of applications) {
      try {
        if (application.userId?.email) {
          await sendContentDeadlineReminder(
            application.userId.email,
            application.campaign._id
          );
          logger.info(
            `Sent reminder to ${application.userId.email} for campaign ${application.campaign._id}`
          );
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        logger.error(
          `Failed to send reminder for application ${application._id}:`,
          error
        );
        continue;
      }
    }

    logger.info("Completed deadline reminder checks");
  } catch (error) {
    logger.error(`Error in deadline reminder job: ${error}`);
  }
};

export const contentDeadlineReminderJob = cron.schedule('0 */12 * * *', checkDeadlines, {
    scheduled: false,
    timezone: "UTC"
}); 