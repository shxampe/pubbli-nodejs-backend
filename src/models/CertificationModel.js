import mongoose from "mongoose";

const certificationSchema = new mongoose.Schema(
  {
    platform: {
      type: String,
      required: true,
    },
    name: String,
    description: String,
    requirements: {
      minPosts: { type: Number, default: 50 },
      mustFollow: { type: Boolean, default: false },
    },
    sampleVideos: [String],
    image: String,
    icon: String,
    isActive: { type: Boolean, default: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { timestamps: true }
);

export default mongoose.model("Certification", certificationSchema);
