import Joi from "joi";

const campaignValidation = (data) => {
  const campaignValidationSchema = Joi.object({
    campaignStrategy: Joi.string()
      .valid('Public Post Campaign', 'Affiliate Campaign', 'UGC Campaign')
      .required(),

    campaignTypeCategory: Joi.string()
      .valid('ecommerce', 'software', 'localBusiness', 'other')
      .required(),

    // campaignType: Joi.string()
    //   .valid('With-Product-Shipment', 'Without-Product-Shipment')
    //   .required(),

    campaignName: Joi.string().trim().min(3).max(100).required(),

    coverImage: Joi.string().uri().optional().allow('', null),

    description: Joi.string().optional().allow('', null).max(1000),

    product: Joi.alternatives().conditional('campaignType', {
      is: 'With-Product-Shipment',
      then: Joi.string().required(),
      otherwise: Joi.string().optional().allow('', null),
    }),

    contentRequirements: Joi.object({
      platform: Joi.array()
        .items(Joi.string().valid('Instagram', 'TikTok', 'Reels', 'Other'))
        .optional(),
      contentFormat: Joi.string().valid('Video', 'Image').required(),
      // contentType: Joi.string()
      //   .valid('Unboxing video', 'Product review', 'Product demo', 'Unboxing')
      //   .required(),
      // videoDuration: Joi.string()
      //   .valid('30 seconds', '60 seconds', '1-2 minutes')
      //   .required(),
      displayFormat: Joi.string()
        .valid('Any', 'Portrait', 'Landscape', '1:1', 'Stories', 'Square', 'Reels')
        .default('Any'),
      contentBrief: Joi.string().optional().allow('', null).max(1000),
      contentAvoid: Joi.string().optional().allow('', null).max(1000),
      examples: Joi.object({
        urls: Joi.array().items(Joi.string().allow('', null)).optional(),
        mediaFiles: Joi.array().items(Joi.string()).optional(),
      }),
    }).required(),

    creatorParameters: Joi.object({
      preferableRegion: Joi.object({
        country: Joi.string().default('Any'),
        state: Joi.string().default('Any'),
        city: Joi.string().default('Any'),
      }).default(),
      gender: Joi.string()
        .valid('Male', 'Female', 'Non-binary', 'Any')
        .default('Any'),
      age: Joi.array().items(Joi.string()).required(),
      ethnicity: Joi.array()
        .items(Joi.string().valid('White', 'Hispanic', 'African', 'Asian', 'Any'))
        .optional(),
      specialRequirements: Joi.array().items(Joi.string().trim()).optional(),
    }).required(),

    hashtagsForPosting: Joi.array().items(Joi.string().trim()).optional(),

    socialHandles: Joi.object({
      instagram: Joi.string().allow('', null),
      tiktok: Joi.string().allow('', null),
      youtube: Joi.string().allow('', null),
    }).optional(),

    deliveryMethod: Joi.string()
      .valid('Reimbursement', 'Delivered by me', 'No shipping needed')
      .required(),

    compensation: Joi.object({
      model: Joi.string().default('Fixed fee for influencers per post or story'),
      amount: Joi.number().min(0).required(),
    }).required(),

    applicationDeadline: Joi.object({
      start: Joi.date().required(),
      end: Joi.date().min(Joi.ref('start')).required(),
    }).required(),

    postingSchedule: Joi.object({
      start: Joi.date().required(),
      end: Joi.date().min(Joi.ref('start')).required(),
    }).required(),

    status: Joi.string()
      .valid('Draft', 'Active', 'Paused', 'Completed', 'Cancelled', 'Terminated')
      .default('Draft'),

    createdBy: Joi.string().required(),
    createdAt: Joi.date().default(Date.now),
    updatedAt: Joi.date().default(Date.now),

    approvalStatus: Joi.string()
      .valid('Pending', 'Approved', 'Rejected')
      .default('Pending'),
  });

  return campaignValidationSchema.validate(data, { abortEarly: false });
};


export default campaignValidation;
