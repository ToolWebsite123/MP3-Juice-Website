import mongoose from "mongoose";
import logger from "../utils/logger.js";

let cachedUri = null;
let cachedHost = null;
let isConnecting = false;
let isConnected = false;
let connectionAttempts = 0;
let lastConnectionError = null;
let isMongoDisabled = false;

// Check if MongoDB is disabled via environment variable
const checkMongoDisabled = () => {
  const disabled = process.env.DISABLE_MONGODB === 'true' || process.env.DISABLE_MONGODB === '1';
  if (disabled && !isMongoDisabled) {
    isMongoDisabled = true;
    logger.info("ℹ️ [DB] MongoDB is disabled via DISABLE_MONGODB flag");
  }
  return isMongoDisabled;
};

const resolveMongoUri = () => {
  // Check if MongoDB is disabled
  if (checkMongoDisabled()) {
    return null;
  }

  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    logger.warn("⚠️ [DB] MONGODB_URI not set - MongoDB is optional");
    return null;
  }
  cachedUri = uri;
  return uri;
};

const extractHost = (uri) => {
  if (!uri) return null;
  try {
    const parsed = new URL(uri);
    return parsed.host || "unknown-host";
  } catch {
    return mongoose.connection.host || "unknown-host";
  }
};

/**
 * Detect specific MongoDB error types for better handling
 */
const detectErrorType = (error) => {
  const message = error.message?.toLowerCase() || '';
  const name = error.name?.toLowerCase() || '';

  // IP whitelist error
  if (message.includes('ip') && message.includes('whitelist')) {
    return 'IP_WHITELIST';
  }

  // Timeout errors
  if (message.includes('timeout') || name.includes('timeout')) {
    return 'TIMEOUT';
  }

  // DNS/Network errors
  if (message.includes('enotfound') || message.includes('getaddrinfo')) {
    return 'NETWORK';
  }

  // Authentication errors
  if (message.includes('authentication') || message.includes('unauthorized')) {
    return 'AUTH';
  }

  // Generic error
  return 'UNKNOWN';
};

/**
 * Check if error is fatal (should not retry)
 */
const isFatalError = (errorType) => {
  // IP whitelist and auth errors are fatal - user needs to fix config
  return ['IP_WHITELIST', 'AUTH'].includes(errorType);
};

/**
 * Connect to MongoDB - OPTIONAL, never throws fatal errors
 * Downloads continue even if MongoDB is unavailable
 */
const connectDB = async (options = {}) => {
  // Check if MongoDB is disabled
  if (checkMongoDisabled()) {
    return null;
  }

  // Already connected
  if (mongoose.connection.readyState === 1) {
    isConnected = true;
    return mongoose.connection;
  }
  
  // Connection attempt in progress
  if (isConnecting && !options.force) {
    logger.debug("⏳ [DB] Connection attempt already in progress...");
    return mongoose.connection;
  }

  const uri = resolveMongoUri();
  if (!uri) {
    logger.warn("⚠️ [DB] MongoDB URI not configured - continuing without database");
    isConnected = false;
    return null;
  }

  // Stop retrying after too many failures
  const MAX_CONNECTION_ATTEMPTS = 5;
  if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS && lastConnectionError) {
    const errorType = detectErrorType(lastConnectionError);
    if (isFatalError(errorType)) {
      logger.warn(`⚠️ [DB] MongoDB connection permanently disabled due to ${errorType} error`);
      logger.warn(`   Fix the issue and restart the server to re-enable MongoDB`);
      isMongoDisabled = true;
      return null;
    }
  }

  isConnecting = true;
  cachedHost = extractHost(uri);

  try {
    connectionAttempts++;
    
    // Connection options with proper pooling
    const connectionOptions = {
      serverSelectionTimeoutMS: 10000, // ✅ FIX: Increased to 10s for better reliability
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000, // ✅ FIX: Increased to 15s for initial connection
      retryWrites: true,
      retryReads: true,
      // Connection pooling settings
      maxPoolSize: 10, // Maximum number of connections in pool
      minPoolSize: 2,  // Minimum number of connections in pool
      maxIdleTimeMS: 30000, // Close connections after 30s of inactivity
      // Heartbeat settings
      heartbeatFrequencyMS: 10000, // Check connection health every 10s
      // Buffer settings (bufferMaxEntries is deprecated in newer Mongoose)
      bufferCommands: false, // Don't buffer commands when disconnected
      // ✅ FIX: Add connection retry logic
      retryReads: true,
      retryWrites: true,
    };

    logger.debug(`🔄 [DB] Attempting MongoDB connection (attempt ${connectionAttempts})...`);
    
    const conn = await mongoose.connect(uri, connectionOptions);
    
    const host = cachedHost || conn.connection.host || "unknown-host";
    isConnected = true;
    connectionAttempts = 0; // Reset on success
    lastConnectionError = null;
    
    logger.info(`✅ [DB] MongoDB connected successfully (host: ${host})`);
    logger.debug(`   Pool size: ${conn.connection.maxPoolSize || 'default'}`);
    
    return conn;
  } catch (error) {
    isConnected = false;
    lastConnectionError = error;
    const errorType = detectErrorType(error);
    
    // Log error with context
    if (errorType === 'IP_WHITELIST') {
      logger.warn(`❌ [DB] MongoDB connection failed: IP not whitelisted`);
      logger.warn(`   📝 SOLUTION: Add your IP to MongoDB Atlas whitelist:`);
      logger.warn(`      1. Go to MongoDB Atlas → Network Access`);
      logger.warn(`      2. Click "Add IP Address"`);
      logger.warn(`      3. Add your current IP or use "0.0.0.0/0" for all IPs (less secure)`);
      logger.warn(`      4. Or set DISABLE_MONGODB=true to disable MongoDB completely`);
      logger.warn(`   🔗 Docs: https://www.mongodb.com/docs/atlas/security-whitelist/`);
    } else if (errorType === 'TIMEOUT') {
      logger.warn(`⏱️ [DB] MongoDB connection timeout (attempt ${connectionAttempts})`);
      logger.warn(`   Server will continue without database - downloads will work normally`);
      logger.warn(`   💡 TIP: Check MongoDB Atlas cluster status and network connectivity`);
    } else if (errorType === 'NETWORK') {
      logger.warn(`🌐 [DB] MongoDB network error: ${error.message}`);
      logger.warn(`   Check your internet connection and MongoDB Atlas cluster status`);
    } else if (errorType === 'AUTH') {
      logger.warn(`🔐 [DB] MongoDB authentication failed`);
      logger.warn(`   Check your MONGODB_URI credentials in .env file`);
    } else {
      logger.warn(`⚠️ [DB] MongoDB connection failed: ${error.message}`);
    }
    
    // If fatal error, disable MongoDB permanently
    if (isFatalError(errorType) && connectionAttempts >= 3) {
      logger.warn(`⚠️ [DB] Disabling MongoDB after ${connectionAttempts} fatal errors`);
      isMongoDisabled = true;
    }
    
    logger.warn(`   Downloads will continue without database - history persistence disabled`);
    return null;
  } finally {
    isConnecting = false;
  }
};

// MongoDB event handlers - log warnings only, never crash
let reconnectTimeout = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 2; // Reduced from 3 to 2

mongoose.connection.on("disconnected", () => {
  isConnected = false;
  
  // Don't attempt reconnection if MongoDB is disabled
  if (checkMongoDisabled()) {
    return;
  }
  
  // Only log first disconnect, then reduce spam
  if (reconnectAttempts === 0) {
    logger.warn("⚠️ [DB] MongoDB disconnected - downloads continue without database");
  }
  
  // Throttle reconnection attempts (max 2 attempts, then stop trying)
  if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS && !isMongoDisabled) {
    reconnectAttempts++;
    if (reconnectTimeout) clearTimeout(reconnectTimeout);
    
    // Exponential backoff: 10s, 20s
    const delay = reconnectAttempts * 10000;
    
    reconnectTimeout = setTimeout(() => {
      // Only reconnect if not disabled and not too many failures
      if (!isMongoDisabled && connectionAttempts < 5) {
        connectDB({ force: true }).catch(() => {
          if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
            logger.debug(`⚠️ [DB] Reconnect attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS} failed`);
          } else {
            logger.debug("⚠️ [DB] Max reconnect attempts reached - continuing without MongoDB");
          }
        });
      }
    }, delay);
  } else {
    logger.debug("⚠️ [DB] Stopping reconnection attempts - MongoDB unavailable");
  }
});

mongoose.connection.on("connected", () => {
  isConnected = true;
  reconnectAttempts = 0; // Reset on successful connection
  connectionAttempts = 0; // Reset connection attempts
  lastConnectionError = null;
  
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout);
    reconnectTimeout = null;
  }
  
  const host = cachedHost || mongoose.connection.host || "unknown-host";
  logger.info(`✅ [DB] MongoDB connection active (host: ${host})`);
});

mongoose.connection.on("error", (err) => {
  isConnected = false;
  lastConnectionError = err;
  
  // Only log errors if not already disabled
  if (!isMongoDisabled) {
    const errorType = detectErrorType(err);
    if (errorType === 'IP_WHITELIST') {
      logger.warn(`❌ [DB] MongoDB error: IP whitelist issue - set DISABLE_MONGODB=true to disable`);
    } else {
      logger.warn(`⚠️ [DB] MongoDB error: ${err.message}`);
    }
  }
  // Never crash on MongoDB errors
});

mongoose.connection.on("reconnected", () => {
  isConnected = true;
  connectionAttempts = 0;
  reconnectAttempts = 0;
  lastConnectionError = null;
  logger.info(`✅ [DB] MongoDB reconnected successfully`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  if (mongoose.connection.readyState === 1) {
    logger.info("🔄 [DB] Closing MongoDB connection...");
    await mongoose.connection.close();
    logger.info("✅ [DB] MongoDB connection closed");
  }
});

export const getMongoHost = () => cachedHost || mongoose.connection.host || null;
export const getMongoUri = () => cachedUri;
export const isMongoDBConnected = () => {
  if (checkMongoDisabled()) return false;
  return isConnected || mongoose.connection.readyState === 1;
};
export const isMongoDBDisabled = () => checkMongoDisabled();

export default connectDB;
