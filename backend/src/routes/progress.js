// ✅ FINAL FIX: backend/src/routes/progress.js - SSE MIME Type Fixed
import express from 'express';
import {
    startDownload,
    downloadFile,
    getDownloadStatus,
    cancelDownload,
    getActiveDownloads,
    getStats
} from '../controllers/downloadController.js';
import logger from '../utils/logger.js';

const router = express.Router();

/**
 * POST /api/download/start
 * Start a new download job
 */
router.post('/start', startDownload);

/**
 * GET /api/download/progress/:downloadId
 * ✅ COMPLETELY FIXED: SSE endpoint with proper headers
 */
router.get('/progress/:downloadId', (req, res) => {
    const { downloadId } = req.params;

    if (!downloadId) {
        return res.status(400).json({
            success: false,
            error: 'Download ID is required'
        });
    }

    logger.info(`📡 [${downloadId}] SSE client connecting...`);

    // ✅ FIX 1: Set headers BEFORE any writes
    res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Credentials': 'false',
        'Access-Control-Allow-Headers': 'Cache-Control'
    });

    // ✅ FIX 2: Send connection message
    res.write(`data: ${JSON.stringify({
        type: 'connected',
        downloadId,
        message: 'Connected to progress stream',
        timestamp: Date.now()
    })}\n\n`);

    // ✅ FIX 3: Get progress tracker from app
    const progressTracker = req.app.get('progressTracker');

    if (!progressTracker) {
        res.write(`data: ${JSON.stringify({
            type: 'error',
            message: 'Progress tracker not available',
            timestamp: Date.now()
        })}\n\n`);
        return res.end();
    }

    // ✅ FIX 4: Keep-alive ping
    const keepAliveInterval = setInterval(() => {
        try {
            res.write(`:keepalive ${Date.now()}\n\n`);
        } catch (err) {
            logger.warn(`⚠️ [${downloadId}] Keep-alive failed`);
            clearInterval(keepAliveInterval);
        }
    }, 15000);

    // ✅ FIX 5: Progress polling
    const progressInterval = setInterval(() => {
        try {
            const progress = progressTracker.get(downloadId);

            if (!progress) {
                logger.warn(`⚠️ [${downloadId}] No progress data`);
                return;
            }

            // Validate and send progress
            const validProgress = Math.min(100, Math.max(0, progress.progress || 0));

            res.write(`data: ${JSON.stringify({
                type: 'progress',
                downloadId,
                status: progress.status || 'processing',
                progress: validProgress,
                message: progress.message || 'Processing...',
                speed: Math.max(0, progress.speed || 0),
                eta: Math.max(0, progress.eta || 0),
                downloaded: Math.max(0, progress.downloaded || 0),
                total: Math.max(0, progress.total || 0),
                filename: progress.filename || '',
                timestamp: Date.now()
            })}\n\n`);

            // Check completion
            if (progress.status === 'completed') {
                res.write(`data: ${JSON.stringify({
                    type: 'completed',
                    downloadId,
                    filename: progress.fileName,
                    message: 'Download complete',
                    timestamp: Date.now()
                })}\n\n`);

                clearInterval(progressInterval);
                clearInterval(keepAliveInterval);

                setTimeout(() => res.end(), 500);
            }

            // Check failure
            if (progress.status === 'failed' || progress.status === 'error') {
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    downloadId,
                    message: progress.error || 'Download failed',
                    timestamp: Date.now()
                })}\n\n`);

                clearInterval(progressInterval);
                clearInterval(keepAliveInterval);

                setTimeout(() => res.end(), 500);
            }

        } catch (err) {
            logger.error(`❌ [${downloadId}] Progress error:`, err.message);
        }
    }, 1000);

    // ✅ FIX 6: Cleanup on disconnect
    req.on('close', () => {
        clearInterval(progressInterval);
        clearInterval(keepAliveInterval);
        logger.info(`🔌 [${downloadId}] SSE client disconnected`);
    });

    req.on('error', (err) => {
        clearInterval(progressInterval);
        clearInterval(keepAliveInterval);
        logger.error(`❌ [${downloadId}] SSE error:`, err.message);
    });
});

/**
 * GET /api/download/status/:downloadId
 * Get current download status (REST fallback)
 */
router.get('/status/:downloadId', getDownloadStatus);

/**
 * GET /api/download/file/:downloadId
 * Download the completed file
 */
router.get('/file/:downloadId', downloadFile);

/**
 * DELETE /api/download/cancel/:downloadId
 * Cancel an active download
 */
router.delete('/cancel/:downloadId', cancelDownload);

/**
 * GET /api/download/active
 * Get all active downloads
 */
router.get('/active', getActiveDownloads);

/**
 * GET /api/download/stats
 * Get tracker statistics
 */
router.get('/stats', getStats);

// ✅ Legacy compatibility route
router.get('/:filename', async (req, res) => {
    try {
        const { filename } = req.params;
        const path = await import('path');
        const fs = await import('fs');

        const DOWNLOAD_DIR = path.resolve(process.cwd(), 'downloads');
        const filePath = path.join(DOWNLOAD_DIR, filename);

        if (!fs.existsSync(filePath)) {
            return res.status(404).json({
                success: false,
                error: 'File not found'
            });
        }

        res.download(filePath);
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message
        });
    }
});

logger.info('✅ Download routes initialized (SSE MIME TYPE FIXED)');

export default router;