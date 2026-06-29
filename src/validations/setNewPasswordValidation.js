import Joi from "joi";

const setNewPasswordValidation = (email, newPassword) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
    newPassword: Joi.string().min(6).required(),
  });

  return schema.validate(email, newPassword);
};

export default setNewPasswordValidation;
