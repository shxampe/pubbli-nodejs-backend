import Joi from "joi";

const changePasswordValidation = (
  currentPassword,
  newPassword,
  confirmPassword
) => {
  const passwordSchema = Joi.object({
    currentPassword: Joi.string().required(),
    newPassword: Joi.string().min(8).required(),
    confirmPassword: Joi.string()
      .valid(Joi.ref("newPassword"))
      .required()
      .messages({
        "any.only": '"confirmPassword" must match "newPassword"',
      }),
  });

  return passwordSchema.validate(currentPassword, newPassword, confirmPassword);
};

export default changePasswordValidation;
