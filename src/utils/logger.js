import winston from "winston";

import config from "../config/appconfig.js";

import "winston-mongodb"; // Import winston-mongodb

// Error stack format for logging

const enumerateErrorFormat = winston.format((info) => {
  if (info instanceof Error) {
    Object.assign(info, { message: info.stack });
  }

  return info;
});

// Changing timezone to Asia/Karachi

const timezoned = () => {
  return new Date().toLocaleString("en-US", {
    timeZone: "Asia/Karachi",
  });
};

// MongoDB transport options

const mongoTransportOptions = {
  db: config.db.mongodb_uri, // MongoDB URI
  
  dbName: config.db.name,

  collection: "log", // Collection where logs will be stored

  level: "info", // Set the level to capture logs from 'info' and above

  storeHost: true, // Store the host information in the logs

  tryReconnect: true, // Try to reconnect if the MongoDB connection fails

  capped: true, // Enable capped collections to limit the number of logs stored

  options: {
    useUnifiedTopology: true, // Recommended option for MongoDB connection
  },
};

// Create the logger instance

export const logger = winston.createLogger({
  level: config.env === "development" ? "debug" : "info", // Set level based on environment

  format: winston.format.combine(
    winston.format.timestamp({ format: timezoned }), // Add timestamp to each log entry

    enumerateErrorFormat(), // Include error stack trace when available

    config.env === "development"
      ? winston.format.colorize() // Colorize logs in development
      : winston.format.uncolorize(), // No color for production

    winston.format.splat(), // Allows use of "%s" in message

    winston.format.printf(({ level, message, timestamp }) => {
      return `${timestamp} ${level}: ${message}`; // Custom log format
    })
  ),

  transports: [
    // Console transport for logging to console (errors go to stderr)

    new winston.transports.Console({
      stderrLevels: ["error"], // Log errors to stderr

      format: winston.format.combine(
        winston.format.timestamp({ format: timezoned }),

        winston.format.colorize(), // Colorize for console output

        winston.format.splat(),

        winston.format.printf(({ level, message, timestamp }) => {
          return `${timestamp} ${level}: ${message}`; // Custom log format
        })
      ),
    }),

    // Transport for info, warn, debug logs (other than errors)

    new winston.transports.File({
      filename: "app-info.log", // File for info, warn, debug logs

      level: "info", // Logs from 'info' level and above

      format: winston.format.combine(
        winston.format.timestamp({ format: timezoned }), // Timestamp for file logs

        winston.format.json() // Store logs in JSON format for easy analysis
      ),
    }),

    // Transport for error logs only

    new winston.transports.File({
      filename: "app-error.log", // File for error logs

      level: "error", // Logs only error level

      format: winston.format.combine(
        winston.format.timestamp({ format: timezoned }), // Timestamp for file logs

        winston.format.json() // Store logs in JSON format for easy analysis
      ),
    }),

    // MongoDB transport for remote logging

    new winston.transports.MongoDB(mongoTransportOptions),
  ],
});
