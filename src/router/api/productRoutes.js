import express from "express";
import { authenticate } from "../../middleware/authMiddleware.js";
import {
  getAllProducts,
  getProductsByBrand,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductById,
  getCampaignsByProductId,
  duplicateProduct,
  changeProductStatus
} from "../../controllers/ProductController.js";
import upload from "../../middleware/multerConfig.js";
const productUpload = upload.fields([
  { name: "image", maxCount: 1 },
]);
const router = express.Router();

router.get("/get-all-products", authenticate, getAllProducts);
router.get("/get-product-by-id/:id", getProductById);
router.get("/get-products-by-brand/:brandId", getProductsByBrand);
router.post("/create-product", authenticate, productUpload, createProduct);
router.put("/update-product/:id", authenticate, productUpload, updateProduct);
router.delete("/delete-product/:id", authenticate, deleteProduct);
router.get("/get-campaigns-by-product-id/:productId", getCampaignsByProductId);
router.post("/duplicate-product/:id", authenticate, duplicateProduct);
router.patch("/change-product-status/:id", authenticate, changeProductStatus);
export default router;