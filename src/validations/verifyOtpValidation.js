import Joi from "joi";

const verifyOtpValidation = (email, otp) => {
    const schema = Joi.object({
        email: Joi.string().email().required(),
        otp: Joi.string().length(6).required(),
      });

  return schema.validate(email, otp);
};

export default verifyOtpValidation;
