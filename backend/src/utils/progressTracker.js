// ✅ FINAL COMPLETE: backend/src/utils/progressTracker.js
import logger from './logger.js';

/**
 * In-memory progress tracker for all downloads
 * Supports Server-Sent Events (SSE) for real-time updates
 * ✅ PRODUCTION READY - All bugs fixed
 */
class ProgressTracker {
  constructor() {
    this.downloads = new Map();
    this.sseClients = new Map();
    
    this.stats = {
      totalDownloads: 0,
      activeDownloads: 0,
      completedDownloads: 0,
      failedDownloads: 0,
      totalClients: 0
    };

    logger.info('📊 Progress Tracker initialized');
  }

  /**
   * ✅ Validate and clamp progress value
   */
  validateProgress(progress) {
    if (typeof progress !== 'number' || isNaN(progress)) {
      return 0;
    }
    return Math.min(100, Math.max(0, Math.floor(progress)));
  }

  /**
   * Initialize a new download
   */
  initDownload(downloadId, metadata = {}) {
    const download = {
      id: downloadId,
      title: metadata.title || 'video',
      url: metadata.url || '',
      format: metadata.format || 'mp4',
      quality: metadata.quality || '720',
      status: 'starting',
      progress: 0,
      downloaded: 0,
      total: 0,
      speed: 0,
      eta: 0,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      endTime: null,
      filePath: null,
      fileName: null,
      downloadUrl: null,
      sizeMB: null,
      error: null
    };

    this.downloads.set(downloadId, download);
    this.stats.totalDownloads++;
    this.stats.activeDownloads++;

    logger.info(`📊 [${downloadId}] Progress tracking initialized`);
    return download;
  }

  /**
   * ✅ Update download progress with validation
   */
  updateProgress(downloadId, updates) {
    const download = this.downloads.get(downloadId);
    
    if (!download) {
      logger.warn(`⚠️ [${downloadId}] Download not found for progress update`);
      return null;
    }

    // Validate progress value
    if (updates.progress !== undefined) {
      const oldProgress = download.progress;
      updates.progress = this.validateProgress(updates.progress);
      
      // Log suspicious progress jumps
      if (Math.abs(updates.progress - oldProgress) > 50 && oldProgress > 0) {
        logger.warn(`⚠️ [${downloadId}] Large progress jump: ${oldProgress}% → ${updates.progress}%`);
      }
    }

    // Validate other numeric values
    if (updates.speed !== undefined) {
      updates.speed = Math.max(0, updates.speed || 0);
    }
    
    if (updates.eta !== undefined) {
      updates.eta = Math.max(0, updates.eta || 0);
    }

    if (updates.downloaded !== undefined) {
      updates.downloaded = Math.max(0, updates.downloaded || 0);
    }
    
    if (updates.total !== undefined) {
      updates.total = Math.max(0, updates.total || 0);
    }

    // Merge updates
    Object.assign(download, updates);
    download.lastUpdate = Date.now();

    this.downloads.set(downloadId, download);

    // Broadcast to SSE clients
    this.broadcastProgress(downloadId, download);

    return download;
  }

  /**
   * Mark download as completed
   */
  completeDownload(downloadId, result = {}) {
    const download = this.downloads.get(downloadId);
    
    if (!download) {
      logger.warn(`⚠️ [${downloadId}] Download not found for completion`);
      return null;
    }

    download.status = 'completed';
    download.progress = 100;
    download.endTime = Date.now();
    download.fileName = result.fileName;
    download.filePath = result.filePath;
    download.downloadUrl = result.downloadUrl;
    download.sizeMB = result.sizeMB;
    download.title = result.title || download.title;
    download.eta = 0;
    download.speed = 0;

    this.downloads.set(downloadId, download);

    this.stats.activeDownloads = Math.max(0, this.stats.activeDownloads - 1);
    this.stats.completedDownloads++;

    // Broadcast completion
    this.broadcastProgress(downloadId, download);

    const duration = ((download.endTime - download.startTime) / 1000).toFixed(1);
    logger.info(`✅ [${downloadId}] Download completed in ${duration}s`);

    return download;
  }

  /**
   * Mark download as failed
   */
  failDownload(downloadId, error) {
    const download = this.downloads.get(downloadId);
    
    if (!download) {
      logger.warn(`⚠️ [${downloadId}] Download not found for failure`);
      return null;
    }

    download.status = 'failed';
    download.error = error?.message || String(error) || 'Download failed';
    download.endTime = Date.now();
    download.eta = 0;
    download.speed = 0;

    this.downloads.set(downloadId, download);

    this.stats.activeDownloads = Math.max(0, this.stats.activeDownloads - 1);
    this.stats.failedDownloads++;

    // Broadcast error
    this.broadcastProgress(downloadId, download);

    logger.error(`❌ [${downloadId}] Download failed: ${download.error}`);

    return download;
  }

  /**
   * Get a specific download
   */
  get(downloadId) {
    return this.downloads.get(downloadId) || null;
  }

  /**
   * Get a specific download (alias)
   */
  getDownload(downloadId) {
    return this.get(downloadId);
  }

  /**
   * ✅ Get formatted progress for API response
   */
  getFormattedProgress(downloadId) {
    const download = this.downloads.get(downloadId);
    
    if (!download) {
      return null;
    }

    return {
      id: download.id,
      title: download.title,
      status: download.status,
      progress: this.validateProgress(download.progress),
      downloaded: Math.max(0, download.downloaded || 0),
      total: Math.max(0, download.total || 0),
      speed: Math.max(0, download.speed || 0),
      eta: Math.max(0, download.eta || 0),
      format: download.format,
      quality: download.quality,
      fileName: download.fileName,
      downloadUrl: download.downloadUrl,
      sizeMB: download.sizeMB,
      error: download.error,
      startTime: download.startTime,
      duration: download.endTime 
        ? download.endTime - download.startTime 
        : Date.now() - download.startTime
    };
  }

  /**
   * Get all downloads
   */
  getAllDownloads() {
    return Array.from(this.downloads.values())
      .map(download => this.getFormattedProgress(download.id))
      .filter(Boolean);
  }

  /**
   * Remove a download from tracker
   */
  removeDownload(downloadId) {
    const deleted = this.downloads.delete(downloadId);
    
    if (deleted) {
      logger.info(`🗑️ [${downloadId}] Removed from tracker`);
      this.disconnectAllClients(downloadId);
    }

    return deleted;
  }

  /**
   * ✅ CRITICAL FIX: Add SSE client - NO HEADERS SET HERE!
   * Headers are set in downloadController.js BEFORE calling this
   */
  addClient(downloadId, res) {
    const download = this.downloads.get(downloadId);
    
    if (!download) {
      logger.warn(`⚠️ [${downloadId}] Download not found for SSE client`);
      
      try {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'Download not found'
        })}\n\n`);
        res.end();
      } catch (err) {
        logger.error(`❌ Failed to send error:`, err.message);
      }
      
      return () => {};
    }

    // Initialize SSE clients set
    if (!this.sseClients.has(downloadId)) {
      this.sseClients.set(downloadId, new Set());
    }

    const clients = this.sseClients.get(downloadId);
    clients.add(res);

    this.stats.totalClients++;

    logger.info(`👤 [${downloadId}] SSE client connected (total: ${clients.size})`);

    // ✅ Send connection confirmation
    try {
      res.write(`data: ${JSON.stringify({
        type: 'connected',
        downloadId,
        message: 'Connected to progress stream',
        timestamp: Date.now()
      })}\n\n`);
    } catch (err) {
      logger.error(`❌ Failed to send connection message:`, err.message);
    }

    // ✅ Send current progress immediately
    this.sendProgressToClient(res, download);

    // ✅ CRITICAL: Keep-alive heartbeat
    const heartbeat = setInterval(() => {
      try {
        if (!res.writableEnded) {
          res.write(': heartbeat\n\n');
        } else {
          clearInterval(heartbeat);
        }
      } catch (err) {
        clearInterval(heartbeat);
      }
    }, 15000); // Every 15 seconds

    // Store heartbeat for cleanup
    res._heartbeat = heartbeat;

    // ✅ Return cleanup function
    return () => {
      if (res._heartbeat) {
        clearInterval(res._heartbeat);
        delete res._heartbeat;
      }
      
      clients.delete(res);
      this.stats.totalClients = Math.max(0, this.stats.totalClients - 1);
      
      logger.info(`🔌 [${downloadId}] Client disconnected (remaining: ${clients.size})`);
      
      if (clients.size === 0) {
        this.sseClients.delete(downloadId);
      }
    };
  }

  /**
   * ✅ Broadcast progress to all connected SSE clients
   */
  broadcastProgress(downloadId, download) {
    const clients = this.sseClients.get(downloadId);
    
    if (!clients || clients.size === 0) {
      return;
    }

    const data = {
      type: download.status === 'completed' ? 'completed' : 
            download.status === 'failed' ? 'error' : 'progress',
      downloadId: download.id,
      status: download.status,
      progress: this.validateProgress(download.progress),
      downloaded: Math.max(0, download.downloaded || 0),
      total: Math.max(0, download.total || 0),
      speed: Math.max(0, download.speed || 0),
      eta: Math.max(0, download.eta || 0),
      fileName: download.fileName,
      downloadUrl: download.downloadUrl,
      sizeMB: download.sizeMB,
      error: download.error,
      message: this.getStatusMessage(download),
      timestamp: Date.now()
    };

    const message = `data: ${JSON.stringify(data)}\n\n`;

    const deadClients = [];
    
    clients.forEach(client => {
      try {
        client.write(message);
      } catch (err) {
        logger.warn(`⚠️ [${downloadId}] Failed to send SSE:`, err.message);
        deadClients.push(client);
      }
    });

    // Remove dead clients
    deadClients.forEach(client => clients.delete(client));
  }

  /**
   * ✅ Send progress to a specific client
   */
  sendProgressToClient(client, download) {
    try {
      const data = {
        type: 'progress',
        downloadId: download.id,
        status: download.status,
        progress: this.validateProgress(download.progress),
        downloaded: Math.max(0, download.downloaded || 0),
        total: Math.max(0, download.total || 0),
        speed: Math.max(0, download.speed || 0),
        eta: Math.max(0, download.eta || 0),
        message: this.getStatusMessage(download),
        timestamp: Date.now()
      };

      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      logger.warn(`⚠️ [${download.id}] Failed to send initial progress:`, err.message);
    }
  }

  /**
   * Disconnect all SSE clients for a download
   */
  disconnectAllClients(downloadId) {
    const clients = this.sseClients.get(downloadId);
    
    if (!clients || clients.size === 0) {
      return;
    }

    logger.info(`🔌 [${downloadId}] Disconnecting ${clients.size} clients`);

    clients.forEach(client => {
      try {
        // Clear heartbeat
        if (client._heartbeat) {
          clearInterval(client._heartbeat);
          delete client._heartbeat;
        }
        
        client.write(`data: ${JSON.stringify({
          type: 'disconnected',
          message: 'Connection closed',
          timestamp: Date.now()
        })}\n\n`);
        client.end();
      } catch (err) {
        // Ignore errors during disconnect
      }
    });

    this.sseClients.delete(downloadId);
  }

  /**
   * Get status message for UI
   */
  getStatusMessage(download) {
    const progress = this.validateProgress(download.progress);
    
    switch (download.status) {
      case 'starting':
        return '🔄 Initializing download...';
      case 'downloading':
        return `📥 Downloading... ${progress}%`;
      case 'processing':
        return `⚙️ Processing... ${progress}%`;
      case 'completed':
        return '✅ Download complete!';
      case 'failed':
        return `❌ ${download.error || 'Download failed'}`;
      case 'cancelled':
        return '⚠️ Download cancelled';
      default:
        return 'Processing...';
    }
  }

  /**
   * Get tracker statistics
   */
  getStats() {
    return {
      ...this.stats,
      activeDownloads: this.stats.activeDownloads,
      downloads: this.downloads.size,
      sseConnections: Array.from(this.sseClients.values())
        .reduce((sum, clients) => sum + clients.size, 0)
    };
  }

  /**
   * Cleanup old completed/failed downloads
   */
  cleanup(maxAge = 3600000) {
    const now = Date.now();
    let cleaned = 0;

    for (const [downloadId, download] of this.downloads.entries()) {
      const isOld = download.endTime && (now - download.endTime > maxAge);
      const hasNoClients = !this.sseClients.has(downloadId) || 
                          this.sseClients.get(downloadId).size === 0;

      if ((download.status === 'completed' || download.status === 'failed') && 
          isOld && hasNoClients) {
        this.removeDownload(downloadId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.info(`🧹 Cleaned up ${cleaned} old downloads`);
    }

    return cleaned;
  }
}

// ✅ Create singleton instance
const progressTracker = new ProgressTracker();

// ✅ Run cleanup every 15 minutes
setInterval(() => {
  progressTracker.cleanup();
}, 15 * 60 * 1000);

export default progressTracker;