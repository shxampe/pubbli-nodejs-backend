import mongoose from "mongoose";

const { Schema, model } = mongoose;

const otpSchema = Schema({
  email: { type: String, required: true },
  otp: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
});

otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const OTP = model("OTP", otpSchema);

export default OTP;
