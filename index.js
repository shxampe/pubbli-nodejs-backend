import { app } from "./src/app.js";
import config from "./src/config/appconfig.js";
import { connectDB } from "./src/db/index.js";
import { createServer } from "http";
import socketService from "./src/utils/socketService.js";
import { logger } from "./src/utils/logger.js";

const startApp = async () => {
  try {
    await connectDB();

    const server = createServer(app);
    socketService.initialize(server);
    server.listen(config.app.port, () => {
      logger.info(
        `HTTP server running on port ${config.app.port}\nlink: http://localhost:${config.app.port}`
      );
    });
  } catch (error) {
    logger.error("MONGO DB Connection Failed!! ", error);
  }
};

startApp();
