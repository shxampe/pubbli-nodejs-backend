import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema({
  name: String,
  image: String,
  description: String,
  price: Number,
  product_type: String,
  product_industry: String,
  product_links: String,
  product_status: {
    type: String,
    enum: ["active", "inactive"],
    default: "active",
  },
  productType: {
    type: String,
    enum: ["physical", "digital"],
    default: "physical",
  },
  weight: Number,
  width: Number,
  height: Number,
  length: Number,
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  brandId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Brand",
    required: true,
  },
  sku: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// ✅ Named export for ES Modules
const Product = mongoose.model("Product", ProductSchema);
export default Product;
