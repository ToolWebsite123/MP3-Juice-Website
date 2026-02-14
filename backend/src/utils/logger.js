// src/utils/logger.js
import winston from "winston";
import path from "path";
import fs from "fs";

// Make sure logs folder exists
const logDir = "logs";
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

// Custom log format
const logFormat = winston.format.printf(({ level, message, timestamp, stack }) => {
  return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
});

// Winston logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    logFormat
  ),
  transports: [
    // Console (for development)
    new winston.transports.Console(),

    // File logs (for all levels)
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5 * 1024 * 1024, // 5 MB
      maxFiles: 5,
    }),

    // Error logs only
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5 * 1024 * 1024,
      maxFiles: 5,
    }),
  ],
});

export default logger;
