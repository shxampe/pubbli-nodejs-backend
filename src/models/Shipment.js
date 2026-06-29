import mongoose from "mongoose";

const shipmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' }, // ✅ Add campaign reference
  melhorEnvioId: { type: String, required: false },
  labelUrl: { type: String },
  trackingUrl: { type: String },
  status: { type: String, enum: ['pending', 'shipped', 'tracked', 'delivered'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "CampaignApplication" },
  isManual: { type: Boolean, default: false },
  carrierSlug: { type: String }, // e.g. "usps"
  trackingNumber: { type: String }, 
 
});

export default mongoose.model('Shipment', shipmentSchema);