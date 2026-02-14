// ✅ IMPROVED: Redis Configuration with Optional Password
import Redis from "ioredis";
import dotenv from "dotenv";
import logger from "../utils/logger.js";

dotenv.config();

/* ----------------------------------------------------------
   🔧 Shared Redis Configuration Helper
---------------------------------------------------------- */

/**
 * Get Redis configuration with proper password handling
 * Only includes password if it's actually set and not empty
 */
export const getRedisConfig = () => {
  const redisPassword = process.env.REDIS_PASSWORD;
  
  // ✅ Proper password validation: check if exists, not empty, and not just whitespace
  const hasPassword = redisPassword && 
                      typeof redisPassword === 'string' && 
                      redisPassword.trim().length > 0;

  const config = {
    host: process.env.REDIS_HOST || "127.0.0.1",
    port: Number(process.env.REDIS_PORT) || 6379,
    
    // ✅ Only include password if it's actually set
    ...(hasPassword && { password: redisPassword.trim() }),

    // ✅ Required for Bull compatibility
    maxRetriesPerRequest: null,  // prevent lock errors
    enableReadyCheck: false,     // disable ready check
    connectTimeout: 10000,
    
    // ✅ Disable warnings
    showFriendlyErrorStack: false,
    lazyConnect: false,

    retryStrategy(times) {
      if (times > 5) {
        logger.warn(`⚠️ [Redis] Max retry attempts reached - stopping reconnection`);
        return null; // Stop retrying after 5 attempts
      }
      const delay = Math.min(times * 2000, 10000);
      logger.debug(`🔁 [Redis] Reconnecting in ${delay / 1000}s... (attempt ${times}/5)`);
      return delay;
    },
  };

  return config;
};

/* ----------------------------------------------------------
   ⚙️ Redis Connection Setup (Stable + Bull Compatible)
---------------------------------------------------------- */

const redisConfig = getRedisConfig();
const hasPassword = redisConfig.password && redisConfig.password.length > 0;

// Create Redis client
const redisClient = new Redis(redisConfig);

/* ----------------------------------------------------------
   🧩 Event Listeners
---------------------------------------------------------- */

redisClient.on("connect", () => {
  const authStatus = hasPassword ? "with authentication" : "without authentication";
  logger.info(`✅ [Redis] Connected successfully (${authStatus})`);
});

redisClient.on("ready", () => {
  logger.info("🚀 [Redis] Ready to accept commands");
});

redisClient.on("error", (err) => {
  // ✅ Filter out password warning - this shouldn't happen with proper config
  if (err.message && err.message.includes("password was supplied")) {
    logger.debug(`⚠️ [Redis] Password warning suppressed (password not required)`);
    return;
  }
  
  // ✅ Filter out connection refused errors (Redis not running)
  if (err.message && err.message.includes("ECONNREFUSED")) {
    logger.warn(`⚠️ [Redis] Connection refused - Redis server may not be running`);
    logger.warn(`   Server will continue without Redis caching`);
    return;
  }
  
  logger.error(`❌ [Redis] Connection error: ${err.message}`);
});

redisClient.on("end", () => {
  logger.warn("⚠️ [Redis] Connection closed");
});

redisClient.on("reconnecting", () => {
  logger.debug("♻️ [Redis] Reconnecting...");
});

/* ----------------------------------------------------------
   📊 Health Check Function
---------------------------------------------------------- */
export async function checkRedisHealth() {
  try {
    await redisClient.ping();
    return true;
  } catch (err) {
    logger.debug(`⚠️ [Redis] Health check failed: ${err.message}`);
    return false;
  }
}

/* ----------------------------------------------------------
   🧹 Graceful Shutdown
---------------------------------------------------------- */
const gracefulShutdown = async () => {
  try {
    await redisClient.quit();
    logger.info("🧹 [Redis] Connection closed gracefully");
  } catch (err) {
    logger.error("💥 [Redis] Error closing connection:", err.message);
  }
};

process.on("SIGINT", async () => {
  await gracefulShutdown();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await gracefulShutdown();
  process.exit(0);
});

export default redisClient;
