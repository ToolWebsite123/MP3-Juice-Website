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
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    logFormat
  ),
  transports: [
    // Console (Clean output: shows warnings and errors only by default)
    new winston.transports.Console({
      level: process.env.CONSOLE_LOG_LEVEL || "warn"
    }),

    // File logs (detailed history for all info/debug messages)
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      level: "info",
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
