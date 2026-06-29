import Joi from "joi";

const updateProfileValidation = (data) => {
  
  const schema = Joi.object({
    email: Joi.string().email().messages({
      "string.email": "Invalid email format.",
    }).optional(),
    role: Joi.string().messages({
      "string.base": "Invalid role value.",
    }).optional(),
    name: Joi.string().min(2).max(50).trim().messages({
      "string.min": "Name must be at least 2 characters.",
      "string.max": "Name cannot exceed 50 characters.",
    }).optional(),
    phone: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .messages({
        "string.pattern.base": "Invalid phone number format.",
      }).optional(),
    password: Joi.string().min(6).max(100).messages({
      "string.min": "Password must be at least 6 characters.",
      "string.max": "Password cannot exceed 100 characters.",
    }).optional(),
  });

  return schema.validate(data, { abortEarly: false });
};

export default updateProfileValidation;
