// import { testJob } from './jobs/test.job.js';
import { socialInsightsJob, instagramTokenRefreshJob } from './jobs/socialJobs.js';
import { contentDeadlineReminderJob } from './jobs/contentJobs.js';
import { autoCompleteApplicationsJob } from './jobs/ApplicationsJobs.js';
import { logger } from "../utils/logger.js";

export const initCronJobs = () => {
  logger.info(`Initializing cron jobs... ${new Date().toLocaleString()}`);

  socialInsightsJob.start();

  instagramTokenRefreshJob.start();

  contentDeadlineReminderJob.start();

  autoCompleteApplicationsJob.start();
};

