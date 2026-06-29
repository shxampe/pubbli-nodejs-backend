import Joi from "joi";


const updateCampaignValidation = (data) => {
  const campaignValidationSchema = Joi.object({
    campaignStrategy: Joi.string()
      .valid("Public Post Campaign", "Affiliate Campaign")
      .optional()
      .messages({
        "any.only":
          'Campaign strategy must be either "Public Post Campaign" or "Affiliate Campaign"',
      }),

    campaignType: Joi.string()
      .valid("With Product Shipment", "Without Product Shipment")
      .optional()
      .messages({
        "any.only":
          'Campaign type must be either "With Product Shipment" or "Without Product Shipment"',
      }),

    campaignName: Joi.string().trim().min(3).max(100).optional().messages({
      "string.min": "Campaign name must be at least 3 characters long",
      "string.max": "Campaign name cannot exceed 100 characters",
    }),

    coverImage: Joi.string().uri().optional().allow(null).messages({
      "string.uri": "Cover image must be a valid URL",
    }),

    description: Joi.string().optional().allow(null).max(1000).messages({
      "string.max": "Description cannot exceed 1000 characters",
    }),

    product: Joi.alternatives().conditional("campaignType", {
      is: "With Product Shipment",
      then: Joi.string().optional(),
      otherwise: Joi.string().optional().allow(null),
    }),

    contentRequirements: Joi.object({
      platform: Joi.array()
        .items(Joi.string().valid("Instagram", "TikTok", "Reels", "Other"))
        .min(1)
        .optional()
        .messages({
          "array.min": "At least one platform must be selected",
        }),

      contentFormat: Joi.string().valid("Video", "Image").optional().messages({
        "any.only": 'Content format must be either "Video" or "Image"',
      }),

      contentType: Joi.string()
        .valid("Unboxing video", "Product review", "Product demo")
        .optional()
        .messages({
          "any.only":
            'Content type must be "Unboxing video", "Product review", or "Product demo"',
        }),

      videoDuration: Joi.alternatives()
        .conditional("contentFormat", {
          is: "Video",
          then: Joi.string()
            .valid("30 seconds", "60 seconds", "1-2 minutes")
            .optional(),
          otherwise: Joi.forbidden(),
        })
        .messages({
          "any.only":
            'Video duration must be "30 seconds", "60 seconds", or "1-2 minutes"',
        }),

      displayFormat: Joi.string()
        .valid("Any", "Portrait", "Landscape", "1:1")
        .optional()
        .messages({
          "any.only":
            'Display format must be "Any", "Portrait", "Landscape", or "1:1"',
        }),

      contentBrief: Joi.string().optional().allow(null).max(1000).messages({
        "string.max": "Content brief cannot exceed 1000 characters",
      }),

      contentAvoid: Joi.string().optional().allow(null).max(1000).messages({
        "string.max":
          "Content avoid instructions cannot exceed 1000 characters",
      }),

      examples: Joi.object({
        urls: Joi.array().items(Joi.string().uri()).optional().messages({
          "string.uri": "Example URLs must be valid URLs",
        }),
        mediaFiles: Joi.array().items(Joi.string()).optional(),
      }).optional(),
    }).optional(),

    creatorParameters: Joi.object({
      preferableRegion: Joi.object({
        country: Joi.string().optional(),
        state: Joi.string().optional(),
        city: Joi.string().optional(),
      }).optional(),

      gender: Joi.string()
        .valid("Male", "Female", "Non-binary", "Any")
        .optional()
        .messages({
          "any.only":
            'Creator gender must be "Male", "Female", "Non-binary", or "Any"',
        }),

      age: Joi.string().optional().messages({
        "any.required": "Creator age is required",
      }),

      ethnicity: Joi.array()
        .items(Joi.string().valid("White", "Hispanic", "African", "Asian"))
        .optional()
        .messages({
          "any.only":
            'Ethnicity must be one of "White", "Hispanic", "African", or "Asian"',
        }),

      specialRequirements: Joi.array().items(Joi.string().trim()).optional(),
    }).optional(),

    targetAudience: Joi.object({
      country: Joi.string().optional(),
      state: Joi.string().optional(),
      city: Joi.string().optional(),

      gender: Joi.string()
        .valid("Male", "Female", "Non-binary", "Any")
        .optional()
        .messages({
          "any.only":
            'Target audience gender must be "Male", "Female", "Non-binary", or "Any"',
        }),

      age: Joi.string().optional().messages({
        "any.required": "Target audience age is required",
      }),
    }).optional(),

    compensation: Joi.object({
      model: Joi.string().optional(),

      amount: Joi.number().min(0).optional().messages({
        "number.min": "Compensation amount must be a non-negative number",
      }),
    }).optional(),

    applicationDeadline: Joi.object({
      start: Joi.date().optional().messages({
        "date.base": "Application start date must be a valid date",
      }),
      end: Joi.date().min(Joi.ref("start")).optional().messages({
        "date.min": "Application end date must be after the start date",
      }),
    }).optional(),

    postingSchedule: Joi.object({
      start: Joi.date().optional().messages({
        "date.base": "Posting start date must be a valid date",
      }),
      end: Joi.date().min(Joi.ref("start")).optional().messages({
        "date.min": "Posting end date must be after the start date",
      }),
    }).optional(),

    status: Joi.string()
      .valid("Draft", "Active", "Paused", "Completed", "Cancelled")
      .optional()
      .messages({
        "any.only":
          'Status must be one of "Draft", "Active", "Paused", "Completed", or "Cancelled"',
      }),

    approvalStatus: Joi.string()
      .valid("Pending", "Approved", "Rejected")
      .optional()
      .messages({
        "any.only":
          'Approval status must be "Pending", "Approved", or "Rejected"',
      }),
  }).min(1);

  return campaignValidationSchema.validate(data, { abortEarly: false });
};

export default updateCampaignValidation;
