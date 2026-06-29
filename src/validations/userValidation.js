import Joi from 'joi';

const validateUser = (user) => {
  const schema = Joi.object({
    name: Joi.string().min(3).max(30).optional(),
    email: Joi.string().email().required(),
    role: Joi.string().valid('user').default('user'), //more roles can be added here like .valid('user', 'admin', 'superadmin')
    password: Joi.string().min(8).required(),
    phone: Joi.string().pattern(/^[0-9]{10}$/).optional(),
    preferredCurrency: Joi.string().optional(),
    timeZone: Joi.string().optional()
  });

  return schema.validate(user);
};

export default validateUser;