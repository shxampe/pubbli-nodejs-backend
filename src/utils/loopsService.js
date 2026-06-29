import { LoopsClient, APIError } from 'loops';
import config from '../config/appconfig.js';
import { logger } from "./logger.js";

const loops = new LoopsClient(config.loops.api_key);

export async function createContact(email, contactDetails = {}) {
  try {
    const response = await loops.createContact(email, contactDetails);
    logger.info(`Contact created successfully: ${response.id}`);
    return { success: true, contactId: response.id };
  } catch (error) {
    if (error instanceof APIError) {
      logger.error(`Loops API Error: ${error.json.message}`);
      return { success: false, error: error.json.message };
    } else {
      logger.error(`Unexpected Error creating contact: ${error}`);
      return { success: false, error: error.message };
    }
  }
}

export async function sendTransactionalEmail(
  email,
  transactionalId,
  variables = {}
) {
  try {
    const emailResponse = await loops.sendTransactionalEmail({
      transactionalId: transactionalId,
      email: email,
      dataVariables: variables,
    });

    if (emailResponse.success) {
      logger.info(`Email sent successfully to: ${email}`);
      return { success: true, message: "Email sent successfully" };
    } else {
      logger.error(`Failed to send email: ${emailResponse.message}`);
      return { success: false, error: emailResponse.message };
    }
  } catch (error) {
    logger.error(`Error sending transactional email: ${error}`);
    return { success: false, error: error.message };
  }
}

export const sendRegisterOtp = async (email, otp) => {
  try {
    const transactionalId = "cmdyonx27040bzf0icapmoyc4";
    const dataVariables = {
      datavariable: otp,
    };
    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );
    logger.info(`Register OTP sent : ${emailResult}`);
    return { success: true, message: "Register OTP sent successfully" };
  } catch (error) {
    logger.error(`Error in sendRegisterOnboardingEmail: ${error}`);
    return { success: false, error: error.message };
  }
};
export const sendForgotPasswordOtp = async (email, otp) => {
  try {
    const transactionalId = "cme6zb2v1001dus0ir7vjp8gz";
    const dataVariables = {
      datavariable: otp,
    };
    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );
    logger.info(`Forgot Password OTP sent : ${emailResult}`);
    return { success: true, message: "Forgot Password OTP sent successfully" };
  } catch (error) {
    logger.error(`Error in sendRegisterOnboardingEmail: ${error}`);
    return { success: false, error: error.message };
  }
};

export async function sendWelcomeEmail(email, userDetails = {}) {
  try {
    const contactResult = await createContact(email, {
      role: userDetails.role || "user",
      name: userDetails.name,
    });

    const role = userDetails.role || "user";
    const transactionalId =
      role === "influencer"
        ? "cmd3gjr47275b100ibc6bkpjq"
        : "cmd4jumze214rvy0jrll5f1u4";
    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      userDetails
    );

    return {
      success: emailResult.success,
      contactCreated: contactResult.success,
      message: emailResult.success
        ? "Welcome email sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendWelcomeEmail: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendCampaignRejectionEmail(
  email,
  campaignData,
  rejectReason
) {
  try {
    const transactionalId = "cmd4kl5iv04bnw20iik367qwu";
    const dataVariables = {
      campaignName: campaignData.campaignName || "",
      rejectReason: rejectReason || "",
      campaignUrlByID: `https://brand.pubbli.com/dashboard/campaign-details/${campaignData._id}`,
      campaignUrlById: `https://brand.pubbli.com/dashboard/campaign-details/${campaignData._id}`,
    };

    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Campaign rejection email sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendCampaignRejectionEmail: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendCampaignCreationEmail(email, campaignData) {
  try {
    const transactionalId = "cmd4ki7y603g3w20is7yyhkt1";
    const dataVariables = {
      campaignName: campaignData.campaignName || "",
      campaignUrlByID: `https://brand.pubbli.com/dashboard/campaign-details/${campaignData._id}`,
      campaignUrlById: `https://brand.pubbli.com/dashboard/campaign-details/${campaignData._id}`,
    };

    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Campaign creation email sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendCampaignCreationEmail: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendCampaignApprovalEmail(
  email,
  campaignData,
  productData = null
) {
  try {
    const transactionalId = "cmd4knizv0qdwt40iak6dr2na";
    const dataVariables = {
      campaignName: campaignData.campaignName || "",
      productName: productData?.name || "",
      campaignUrlByID: `https://brand.pubbli.com/dashboard/campaign-details/${campaignData._id}`,
      campaignUrlById: `https://brand.pubbli.com/dashboard/campaign-details/${campaignData._id}`,
    };

    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Campaign approval email sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendCampaignApprovalEmail: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendContentApprovalEmail(email, applicationData) {
  try {
    const transactionalId = "cmd4iafsr1ihmt80iy6e6g1yl";
    const dataVariables = {
      campaignUrlByID: `https://creator.pubbli.com/dashboard/campaign-details/${applicationData.campaign._id}`,
      campaignUrlById: `https://creator.pubbli.com/dashboard/campaign-details/${applicationData.campaign._id}`,
    };

    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Content approval email sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendContentApprovalEmail: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendContentDeadlineReminder(email, campaignId) {
  try {
    const transactionalId = "cmd3ip0nr0627030icl0zu9ug";
    const dataVariables = {
      campaignUrlById: `https://creator.pubbli.com/dashboard/campaign-details/${campaignId}`,
    };

    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Content deadline reminder sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendContentDeadlineReminder: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendApplicationApprovalEmail(
  email,
  campaignId,
  deadline
) {
  try {
    const transactionalId = "cmd3ilqte0bbkyu0ih0wqej6m";
    const today = new Date();
    const deadlineDate = new Date(deadline);
    const remainingDays = Math.ceil(
      (deadlineDate - today) / (1000 * 60 * 60 * 24)
    );

    const dataVariables = {
      remainingDays: remainingDays,
      campaignUrlByID: `https://creator.pubbli.com/dashboard/campaign-details/${campaignId}`,
      campaignUrlById: `https://creator.pubbli.com/dashboard/campaign-details/${campaignId}`,
    };

    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Application approval email sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendApplicationApprovalEmail: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendApplicationApprovalConfirmationEmail(
  email,
  campaignId
) {
  try {
    const transactionalId = "cmd4l3h780v0two0ikourk3wm";
    const dataVariables = {
      campaignUrlByID: `https://brand.pubbli.com/dashboard/campaign-details/${campaignId}`,
      campaignUrlById: `https://brand.pubbli.com/dashboard/campaign-details/${campaignId}`,
    };

    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Application approval confirmation email sent to advertiser"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendApplicationApprovalConfirmationEmail: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendCertificationApprovalEmail(email) {
  try {
    const transactionalId = "cmd3ibfpc045kzc0i687o0l9u";
    const emailResult = await sendTransactionalEmail(email, transactionalId);

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Certification approval email sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendCertificationApprovalEmail: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendCertificationRejectionEmail(email, reason) {
  try {
    const transactionalId = "cmd3iia260anm0i0ikqrzt6ya";
    const dataVariables = {
      reason: reason || "No reason provided",
    };

    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Certification rejection email sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendCertificationRejectionEmail: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendContentSubmissionEmail(email, campaignId) {
  try {
    const transactionalId = "cmd3iriew0c4pwq0iwess1w5e";
    const dataVariables = {
      campaignUrlByID: `https://creator.pubbli.com/dashboard/campaign-details/${campaignId}`,
      campaignUrlById: `https://creator.pubbli.com/dashboard/campaign-details/${campaignId}`,
    };

    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Content submission email sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendContentSubmissionEmail: ${error}`);
    return { success: false, error: error.message };
  }
}

export async function sendContentResubmissionEmail(email, campaignId, reason) {
  try {
    const transactionalId = "cmd4j31ft0cfbwo0ir9n9d0ov";
    const dataVariables = {
      reason: reason || "No reason provided",
      campaignUrlByID: `https://creator.pubbli.com/dashboard/campaign-details/${campaignId}`,
      campaignUrlById: `https://creator.pubbli.com/dashboard/campaign-details/${campaignId}`,
    };

    const emailResult = await sendTransactionalEmail(
      email,
      transactionalId,
      dataVariables
    );

    return {
      success: emailResult.success,
      message: emailResult.success
        ? "Content resubmission request email sent successfully"
        : emailResult.error,
    };
  } catch (error) {
    logger.error(`Error in sendContentResubmissionEmail: ${error}`);
    return { success: false, error: error.message };
  }
} 