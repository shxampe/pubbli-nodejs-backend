import mongoose from "mongoose";
import config from "../config/appconfig.js";
import { logger } from "../utils/logger.js";

export async function connectDB() {
  try {
    const connectionInstance = await mongoose.connect(
      `${config.db.mongodb_uri}`,
      {
        dbName: `${config.db.name}`,
      }
    );

    logger.info(
      `\nMONGODB CONNECTED!! DB HOST: ${connectionInstance.connection.host}.`
    );
  } catch (error) {
    logger.error(`MONGODB CONNECTION FAILED: ${error}`);
    process.exit(1);
  }
}
