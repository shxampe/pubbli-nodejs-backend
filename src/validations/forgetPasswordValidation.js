import Joi from "joi";

const forgetPasswordValidation = (email) => {
  const schema = Joi.object({
    email: Joi.string().email().required(),
  });

  return schema.validate(email);
};

export default forgetPasswordValidation;
