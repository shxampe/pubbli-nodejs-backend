import express from 'express';
import { authenticate } from "../../middleware/authMiddleware.js";
import {
  createManualShipment,
  getShipmentsAll,
  updateShipmentStatus,
} from "../../controllers/Shipping.Controller.js";

const router = express.Router();

router.post("/create-manual-shipment", authenticate, createManualShipment);
router.get("/get-shipments-all", getShipmentsAll);
router.post("/update-shipment-status", authenticate, updateShipmentStatus);

export default router;

