export const CheckRole = (roles) => (req, res, next) => {
  if (roles.includes(req.user.role)) {
    return next();
  } else {
    return res.status(401).json({
      message:
        "Invalid Role, please make sure that you have previliges to access this.",
      success: false,
    });
  }
};
