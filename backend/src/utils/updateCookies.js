// ✅ Cookie Rotation System - Automatic Expiry Handling & Fallback
// ═══════════════════════════════════════════════════════════════════════
// FEATURES:
//    1. ✅ Automatic expired cookie detection and replacement
//    2. ✅ Fallback format when cookies fail
//    3. ✅ Clean error messages for users
//    4. ✅ No static cookies - dynamic rotation
//    5. ✅ No crash on expire - graceful handling
// ═══════════════════════════════════════════════════════════════════════

import { exec } from "child_process";
import { promisify } from "util";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";
import logger from "./logger.js";

const execAsync = promisify(exec);

export const COOKIES_PATH = path.resolve(process.cwd(), "cookies.txt");
const COOKIES_BACKUP_PATH = path.resolve(process.cwd(), "cookies.backup.txt");
const COOKIE_EXPIRY_BUFFER_DAYS = 7; // Refresh cookies 7 days before expiry
const COOKIE_UPDATE_INTERVAL_HOURS = 12; // Check every 12 hours (more frequent for better reliability)

// Browser profile paths (fallback order)
const BROWSER_PROFILES = [
  // Chrome (Windows)
  process.env.CHROME_PROFILE_PATH ||
  path.join(process.env.LOCALAPPDATA || process.env.HOME || "", "Google", "Chrome", "User Data", "Default"),
  // Chrome (Linux/Mac)
  path.join(process.env.HOME || "", ".config", "google-chrome", "Default"),
  // Edge (Windows)
  path.join(process.env.LOCALAPPDATA || "", "Microsoft", "Edge", "User Data", "Default"),
  // Firefox (fallback - not directly supported but listed for reference)
];

/* ----------------------------------------------------------
   🍪 COOKIE VALIDATION & EXPIRY CHECK
---------------------------------------------------------- */

/**
 * Parse Netscape cookie file and check expiry
 */
export const parseCookieFile = async (cookiePath) => {
  try {
    if (!fsSync.existsSync(cookiePath)) {
      return { valid: false, expired: true, reason: "Cookie file not found" };
    }

    const content = await fs.readFile(cookiePath, 'utf-8');
    const lines = content.split('\n').filter(line =>
      line.trim() && !line.startsWith('#')
    );

    if (lines.length === 0) {
      return { valid: false, expired: true, reason: "Cookie file is empty" };
    }

    const now = Math.floor(Date.now() / 1000);
    let hasValidCookies = false;
    let earliestExpiry = Infinity;
    let criticalCookies = [];

    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 5) continue;

      const domain = parts[0];
      const expiry = parseInt(parts[4]) || 0;

      // Check if cookie is expired
      if (expiry > 0 && expiry < now) {
        continue; // Skip expired cookies
      }

      hasValidCookies = true;

      // Track earliest expiry
      if (expiry > 0 && expiry < earliestExpiry) {
        earliestExpiry = expiry;
      }

      // Track critical YouTube cookies
      if (domain.includes('youtube.com')) {
        const cookieName = parts[5]?.split('\t')[0] || parts[5];
        if (cookieName && (
          cookieName.includes('PSID') ||
          cookieName.includes('VISITOR') ||
          cookieName.includes('__Secure')
        )) {
          criticalCookies.push({
            name: cookieName,
            expiry: expiry,
            expiresIn: expiry > 0 ? expiry - now : Infinity
          });
        }
      }
    }

    if (!hasValidCookies) {
      return { valid: false, expired: true, reason: "All cookies are expired" };
    }

    const expiresInDays = earliestExpiry !== Infinity
      ? Math.floor((earliestExpiry - now) / 86400)
      : Infinity;

    const needsRefresh = earliestExpiry !== Infinity &&
      expiresInDays < COOKIE_EXPIRY_BUFFER_DAYS;

    return {
      valid: true,
      expired: false,
      expiresInDays,
      earliestExpiry,
      needsRefresh,
      criticalCookiesCount: criticalCookies.length,
      totalCookies: lines.length
    };

  } catch (err) {
    logger.error(`❌ [Cookies] Parse error: ${err.message}`);
    return { valid: false, expired: true, reason: `Parse error: ${err.message}` };
  }
};

/**
 * Check if cookies are valid and not expired
 */
export const validateCookies = async () => {
  return await parseCookieFile(COOKIES_PATH);
};

/* ----------------------------------------------------------
   🔄 COOKIE ROTATION & UPDATE
---------------------------------------------------------- */

/**
 * Update cookies from browser (with fallback)
 */
export const updateCookiesFromBrowser = async (browser = 'chrome', profilePath = null) => {
  try {
    // Find yt-dlp executable
    const ytdlpPath = process.env.YTDLP_PATH ||
      (fsSync.existsSync(path.resolve(process.cwd(), "yt-dlp.exe"))
        ? path.resolve(process.cwd(), "yt-dlp.exe")
        : "yt-dlp");

    // Determine browser profile path
    let finalProfilePath = profilePath;

    if (!finalProfilePath) {
      if (browser === 'chrome') {
        // Try Windows Chrome first
        const winPath = path.join(
          process.env.LOCALAPPDATA || process.env.HOME || "",
          "Google", "Chrome", "User Data", "Default"
        );
        if (fsSync.existsSync(winPath)) {
          finalProfilePath = winPath;
        } else {
          // Try Linux/Mac Chrome
          const unixPath = path.join(
            process.env.HOME || "",
            ".config", "google-chrome", "Default"
          );
          if (fsSync.existsSync(unixPath)) {
            finalProfilePath = unixPath;
          }
        }
      } else if (browser === 'edge') {
        finalProfilePath = path.join(
          process.env.LOCALAPPDATA || "",
          "Microsoft", "Edge", "User Data", "Default"
        );
      }
    }

    if (!finalProfilePath || !fsSync.existsSync(finalProfilePath)) {
      throw new Error(`Browser profile not found: ${finalProfilePath || 'not specified'}`);
    }

    logger.info(`🍪 [Cookies] Updating from ${browser} profile: ${finalProfilePath}`);

    // Backup existing cookies
    if (fsSync.existsSync(COOKIES_PATH)) {
      try {
        await fs.copyFile(COOKIES_PATH, COOKIES_BACKUP_PATH);
        logger.info(`📦 [Cookies] Backed up existing cookies`);
      } catch (backupErr) {
        logger.warn(`⚠️ [Cookies] Backup failed: ${backupErr.message}`);
      }
    }

    // Update cookies using yt-dlp
    const command = `"${ytdlpPath}" --cookies-from-browser ${browser}:"${finalProfilePath}" --cookies "${COOKIES_PATH}" --no-download`;

    const { stdout, stderr } = await execAsync(command, {
      timeout: 30000, // 30 second timeout
      maxBuffer: 1024 * 1024 // 1MB buffer
    });

    // Validate updated cookies
    const validation = await parseCookieFile(COOKIES_PATH);

    if (!validation.valid) {
      // Restore backup if update failed
      if (fsSync.existsSync(COOKIES_BACKUP_PATH)) {
        await fs.copyFile(COOKIES_BACKUP_PATH, COOKIES_PATH);
        logger.warn(`🔄 [Cookies] Restored backup - new cookies invalid`);
      }
      throw new Error(`Updated cookies are invalid: ${validation.reason}`);
    }

    logger.info(`✅ [Cookies] Updated successfully`);
    logger.info(`   Valid cookies: ${validation.totalCookies}`);
    logger.info(`   Expires in: ${validation.expiresInDays === Infinity ? 'Never' : `${validation.expiresInDays} days`}`);

    return {
      success: true,
      path: COOKIES_PATH,
      validation,
      message: "Cookies updated successfully"
    };

  } catch (err) {
    logger.error(`❌ [Cookies] Update failed: ${err.message}`);

    // Restore backup if available
    if (fsSync.existsSync(COOKIES_BACKUP_PATH)) {
      try {
        await fs.copyFile(COOKIES_BACKUP_PATH, COOKIES_PATH);
        logger.info(`🔄 [Cookies] Restored backup after failure`);
      } catch (restoreErr) {
        logger.error(`❌ [Cookies] Backup restore failed: ${restoreErr.message}`);
      }
    }

    throw new Error(`Cookie update failed: ${err.message}`);
  }
};

/**
 * Try multiple browsers/profiles as fallback
 */
export const updateCookiesWithFallback = async () => {
  const browsers = ['chrome', 'edge'];
  let lastError = null;

  for (const browser of browsers) {
    try {
      logger.info(`🔄 [Cookies] Trying ${browser}...`);
      const result = await updateCookiesFromBrowser(browser);
      return result;
    } catch (err) {
      lastError = err;
      logger.warn(`⚠️ [Cookies] ${browser} failed: ${err.message}`);
      continue;
    }
  }

  // If all browsers failed, try with explicit profile paths
  for (const profilePath of BROWSER_PROFILES.filter(Boolean)) {
    if (!fsSync.existsSync(profilePath)) continue;

    try {
      logger.info(`🔄 [Cookies] Trying profile: ${profilePath}...`);
      const result = await updateCookiesFromBrowser('chrome', profilePath);
      return result;
    } catch (err) {
      lastError = err;
      logger.warn(`⚠️ [Cookies] Profile ${profilePath} failed: ${err.message}`);
      continue;
    }
  }

  throw new Error(`All cookie update methods failed. Last error: ${lastError?.message || 'Unknown'}`);
};

/* ----------------------------------------------------------
   ⚙️ AUTOMATIC COOKIE ROTATION
---------------------------------------------------------- */

let rotationInterval = null;
let isRotating = false;

/**
 * Start automatic cookie rotation (only if cookies are enabled)
 */
export const startCookieRotation = async () => {
  // Check if cookies are enabled via ENV flag
  const envFlag = process.env.ENABLE_COOKIES;
  const cookiesEnabled = envFlag === 'true' || envFlag === '1' || envFlag === 'yes';
  
  if (!cookiesEnabled) {
    logger.debug(`ℹ️ [Cookies] Cookie rotation skipped (ENABLE_COOKIES not set)`);
    return;
  }

  if (rotationInterval) {
    logger.warn(`⚠️ [Cookies] Rotation already running`);
    return;
  }

  logger.info(`🔄 [Cookies] Starting automatic rotation (check every ${COOKIE_UPDATE_INTERVAL_HOURS} hours)`);

  // Initial check
  await checkAndRotateCookies().catch(() => {
    logger.warn(`⚠️ [Cookies] Initial rotation check failed - continuing without cookies`);
  });

  // Set up periodic rotation
  rotationInterval = setInterval(async () => {
    await checkAndRotateCookies().catch(() => {
      logger.debug(`⚠️ [Cookies] Periodic rotation check failed - continuing without cookies`);
    });
  }, COOKIE_UPDATE_INTERVAL_HOURS * 60 * 60 * 1000);
};

/**
 * Stop automatic cookie rotation
 */
export const stopCookieRotation = () => {
  if (rotationInterval) {
    clearInterval(rotationInterval);
    rotationInterval = null;
    logger.info(`🛑 [Cookies] Rotation stopped`);
  }
};

/**
 * Check cookies and rotate if needed (silent rotation - no user interruption)
 */
export const checkAndRotateCookies = async () => {
  if (isRotating) {
    logger.debug(`⏳ [Cookies] Rotation already in progress, skipping...`);
    return;
  }

  isRotating = true;

  try {
    const validation = await validateCookies();

    if (!validation.valid || validation.expired) {
      logger.warn(`⚠️ [Cookies] Cookies expired or invalid - rotating silently...`);
      logger.warn(`   Reason: ${validation.reason || 'Expired'}`);

      try {
        await updateCookiesWithFallback();
        logger.info(`✅ [Cookies] Silent rotation successful`);
      } catch (err) {
        logger.warn(`⚠️ [Cookies] Silent rotation failed (continuing without cookies): ${err.message}`);
        // Don't throw - continue with fallback (no cookies) - graceful degradation
      }
    } else if (validation.needsRefresh) {
      logger.info(`🔄 [Cookies] Cookies expiring soon (${validation.expiresInDays} days) - refreshing silently...`);

      try {
        await updateCookiesWithFallback();
        logger.info(`✅ [Cookies] Silent refresh successful`);
      } catch (err) {
        logger.debug(`⚠️ [Cookies] Silent refresh failed, but cookies still valid: ${err.message}`);
        // Don't throw - existing cookies still work
      }
    } else {
      logger.debug(`✅ [Cookies] Valid (expires in ${validation.expiresInDays === Infinity ? 'Never' : `${validation.expiresInDays} days`})`);
    }

  } catch (err) {
    logger.warn(`⚠️ [Cookies] Rotation check error (graceful fallback): ${err.message}`);
    // Don't throw - graceful degradation (continue without cookies)
  } finally {
    isRotating = false;
  }
};

/* ----------------------------------------------------------
   🛡️ GET COOKIES WITH FALLBACK
---------------------------------------------------------- */

/**
 * Get cookie path with validation and fallback
 * Returns null if cookies are not available (graceful degradation)
 * Only works if cookies are enabled via ENABLE_COOKIES=true
 */
export const getCookiesPath = async () => {
  // Check if cookies are enabled via ENV flag
  const envFlag = process.env.ENABLE_COOKIES;
  const cookiesEnabled = envFlag === 'true' || envFlag === '1' || envFlag === 'yes';
  
  if (!cookiesEnabled) {
    return null; // Cookies disabled - return null immediately
  }

  try {
    const validation = await validateCookies();

    if (!validation.valid || validation.expired) {
      logger.warn(`⚠️ [Cookies] Cookies invalid/expired - attempting rotation...`);

      try {
        await updateCookiesWithFallback();
        // Re-validate after update
        const newValidation = await validateCookies();
        if (newValidation.valid && !newValidation.expired) {
          return COOKIES_PATH;
        }
      } catch (err) {
        logger.warn(`⚠️ [Cookies] Rotation failed, continuing without cookies: ${err.message}`);
        return null; // Graceful fallback - no cookies
      }
    }

    return COOKIES_PATH;

  } catch (err) {
    logger.warn(`⚠️ [Cookies] Validation error, continuing without cookies: ${err.message}`);
    return null; // Graceful fallback
  }
};

/* ----------------------------------------------------------
   📊 GET COOKIE STATUS (For Health Check)
---------------------------------------------------------- */

export const getCookieStatus = async () => {
  try {
    const validation = await validateCookies();
    const exists = fsSync.existsSync(COOKIES_PATH);

    return {
      exists,
      valid: validation.valid,
      expired: validation.expired,
      expiresInDays: validation.expiresInDays,
      needsRefresh: validation.needsRefresh,
      totalCookies: validation.totalCookies || 0,
      criticalCookiesCount: validation.criticalCookiesCount || 0,
      reason: validation.reason || null,
      path: COOKIES_PATH,
      rotationActive: rotationInterval !== null
    };
  } catch (err) {
    return {
      exists: fsSync.existsSync(COOKIES_PATH),
      valid: false,
      expired: true,
      error: err.message,
      path: COOKIES_PATH,
      rotationActive: rotationInterval !== null
    };
  }
};

/* ----------------------------------------------------------
   🚀 INITIALIZE (If run directly)
---------------------------------------------------------- */

// If run directly (not imported), start rotation
if (import.meta.url === `file://${process.argv[1]}`) {
  (async () => {
    try {
      logger.info(`🍪 [Cookies] Manual update requested...`);
      const result = await updateCookiesWithFallback();
      logger.info(`✅ [Cookies] ${result.message}`);
      process.exit(0);
    } catch (err) {
      logger.error(`❌ [Cookies] Manual update failed: ${err.message}`);
      process.exit(1);
    }
  })();
}

export default {
  COOKIES_PATH,
  validateCookies,
  updateCookiesFromBrowser,
  updateCookiesWithFallback,
  checkAndRotateCookies,
  startCookieRotation,
  stopCookieRotation,
  getCookiesPath,
  getCookieStatus
};
