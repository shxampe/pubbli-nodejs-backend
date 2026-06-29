// middleware/multerConfig.js
import multer from "multer";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 * 1024 }, // 1GB limit
});

export default upload;
