import mongoose from "mongoose";

const userCertificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    certificationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Certification",
      required: true,
    },
    platform: String,
    applied: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ["pending", "certified", "rejected", "revoked"],
      default: "pending",
      required: true
    },
    appliedAt: { type: Date, default: Date.now },
    fileUrl: { type: String },
    adminNotes: { type: String }
  },
  { timestamps: true }
);

export default mongoose.model("UserCertification", userCertificationSchema);
