import InfluencerReview from "../models/InfluencerReview.js";
import CampaignApplication from "../models/CampaignApplication.js";

// ✅ Used internally or by other controllers
export const fetchReviewsForInfluencer = async (influencerId) => {
  const reviews = await InfluencerReview.find({ influencerId })
    .populate("campaignId", "campaignName")
    .populate("advertiserId", "name email photoUrl");

  return reviews.map((r) => ({
    rating: r.rating,
    comment: r.comment,
    reviewer: r.advertiserId?.name || "Anonymous",
    reviewerPhotoUrl: r.advertiserId?.photoUrl || "",
    campaign: r.campaignId?.campaignName || "Unknown",
    date: r.createdAt,
  }));
};

// ✅ Route handler to expose as GET /reviews/influencer/:influencerId
export const getReviewsForInfluencer = async (req, res) => {
  const { influencerId } = req.params;

  try {
    const reviews = await fetchReviewsForInfluencer(influencerId);
    res.status(200).json({ success: true, data: reviews });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to load reviews",
      error: err.message,
    });
  }
};

// ✅ Route handler to submit a review (POST)
export const submitInfluencerReview = async (req, res) => {
  const { applicationId, rating, comment } = req.body;
    
  try {
    const existingReview = await InfluencerReview.findOne({ applicationId });
    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already submitted a review for this influencer in this campaign.",
      });
    }

    const application = await CampaignApplication.findById(applicationId);
    if (!application) {
    // if (!application || application.status !== "Approved") {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    const review = await InfluencerReview.create({
      applicationId,
      campaignId: application.campaign,
      influencerId: application.userId,
      advertiserId: req.user._id,
      advertiserName: req.user.name,
      advertiserPhotoUrl: req.user.photoUrl,
      rating,
      comment,
    });

    res.status(201).json({
      success: true,
      message: "Review submitted successfully",
      data: review,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to submit review",
      error: err.message,
    });
  }
};

// ✅ Route to fetch new requests and include reviews

