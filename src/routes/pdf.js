const express = require('express');
const Joi = require('joi');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const { pdfQueue, connection: redisConnection } = require('../config/queue');
const logger = require('../utils/logger');
const pdfService = require('../services/pdfService');

const router = express.Router();

const convertLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const renderHtmlLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 50, // HTML 렌더링은 더 많이 허용
    message: { error: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const convertSchema = Joi.object({
    url: Joi.string().uri().required(),
    mode: Joi.string().valid('standard', 'full').default('full'),
    format: Joi.string().valid('A4', 'A3', 'B5', 'Letter').default('A4'),
    pageBreaks: Joi.array().items(Joi.number().min(0)).default([]),
    includeBanner: Joi.boolean().default(false),
    includeTitle: Joi.boolean().default(false),
    includeTags: Joi.boolean().default(false),
    marginTop: Joi.number().default(0),
    marginBottom: Joi.number().default(0),
    marginLeft: Joi.number().default(0),
    marginRight: Joi.number().default(0),
    pageWidth: Joi.number().min(300).max(5000).default(1080).optional()
});

const renderHtmlSchema = Joi.object({
    html: Joi.string().required(),
    format: Joi.string().valid('A4', 'A3', 'B5', 'Letter').default('A4'),
    pageBreaks: Joi.array().items(Joi.number().min(0)).default([]),
    marginTop: Joi.number().default(0),
    marginBottom: Joi.number().default(0),
    marginLeft: Joi.number().default(0),
    marginRight: Joi.number().default(0),
    pageWidth: Joi.number().min(300).max(5000).default(1080),
    filename: Joi.string().optional()
});

// Chrome Extension 데이터 스키마
const extensionDataSchema = Joi.object({
    html: Joi.string().required().max(10 * 1024 * 1024), // 10MB max
    detectedWidth: Joi.number().default(1080), // Extension에서 감지한 너비
    resources: Joi.object({
        cssLinks: Joi.array().items(
            Joi.alternatives().try(
                Joi.string(), // 기존 문자열 형식
                Joi.object({ // 새로운 객체 형식 (href, media, crossorigin)
                    href: Joi.string().required(),
                    media: Joi.string().default('all'),
                    crossorigin: Joi.string().optional().allow(null)
                })
            )
        ).default([]),
        inlineStyles: Joi.array().items(
            Joi.alternatives().try(
                Joi.string(), // 기존 문자열 형식
                Joi.object({ // 새로운 객체 형식 (id, content)
                    id: Joi.string().optional(),
                    content: Joi.string().required()
                })
            )
        ).default([])
    }).default({ cssLinks: [], inlineStyles: [] }),
    metadata: Joi.object({
        url: Joi.string().optional().allow(null), // Extension에서는 URL 불필요
        title: Joi.string().default('Notion Page'),
        timestamp: Joi.string().required()
    }).required()
});

// Extension 요청용 Rate Limiter
const extensionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20, // 15분 내 최대 20건
    message: { error: '요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.' },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Chrome Extension에서 캡처한 데이터를 받아 세션에 저장
 * POST /render-from-extension
 * Body: {
 *   html: string,
 *   resources: { cssLinks: string[], inlineStyles: string[] },
 *   metadata: { url, title, timestamp }
 * }
 */
router.post('/render-from-extension', extensionLimiter, async (req, res) => {
    try {
        logger.info(`[render-from-extension] Request received - detectedWidth in body: ${req.body.detectedWidth}, keys: ${Object.keys(req.body).join(', ')}`);
        
        const { error, value } = extensionDataSchema.validate(req.body);
        if (error) {
            logger.warn(`Invalid extension data request: ${error.details[0].message}`);
            return res.status(400).json({ error: error.details[0].message });
        }

        // 세션 ID 생성
        const sessionId = crypto.randomBytes(16).toString('hex');

        // Redis에 데이터 저장 (1시간 TTL)
        const sessionData = {
            html: value.html,
            detectedWidth: value.detectedWidth,
            resources: value.resources,
            metadata: value.metadata,
            source: 'extension',
            createdAt: new Date().toISOString()
        };

        await redisConnection.setex(
            `session:${sessionId}`,
            3600, // 1시간
            JSON.stringify(sessionData)
        );

        logger.info(`Extension data stored - SessionId: ${sessionId}, URL: ${value.metadata.url}, HTML size: ${value.html.length} bytes, detectedWidth: ${value.detectedWidth}, resources: CSS=${value.resources.cssLinks.length}, Styles=${value.resources.inlineStyles.length}`);

        res.status(200).json({
            success: true,
            sessionId,
            message: '데이터가 저장되었습니다. 편집 페이지로 이동합니다.'
        });

    } catch (err) {
        logger.error(`Failed to process extension data: ${err.message}`, { stack: err.stack });
        res.status(500).json({ error: `데이터 처리 중 오류가 발생했습니다: ${err.message}` });
    }
});

/**
 * 세션 데이터 조회
 * GET /session-data/:sessionId
 */
router.get('/session-data/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        // 세션 ID 유효성 검사
        if (!/^[a-f0-9]{32}$/.test(sessionId)) {
            logger.warn(`Invalid session ID format: ${sessionId}`);
            return res.status(400).json({ error: '유효하지 않은 세션 ID입니다.' });
        }

        // Redis에서 데이터 조회
        const sessionDataStr = await redisConnection.get(`session:${sessionId}`);

        if (!sessionDataStr) {
            logger.warn(`Session not found: ${sessionId}`);
            return res.status(404).json({ error: '세션을 찾을 수 없습니다. 세션이 만료되었을 수 있습니다.' });
        }

        let sessionData;
        try {
            sessionData = JSON.parse(sessionDataStr);
        } catch (parseErr) {
            logger.error(`Failed to parse session data: ${parseErr.message}`);
            return res.status(500).json({ error: '세션 데이터가 손상되었습니다.' });
        }

        // 세션 데이터 유효성 검사
        if (!sessionData.html || typeof sessionData.html !== 'string') {
            logger.error(`Invalid session data: missing or invalid HTML for session ${sessionId}`, { sessionData });
            return res.status(500).json({ error: '세션의 HTML 데이터가 유효하지 않습니다.' });
        }

        logger.info(`Session data retrieved - SessionId: ${sessionId}, HTML size: ${sessionData.html.length} bytes, detectedWidth: ${sessionData.detectedWidth}, returning: ${sessionData.detectedWidth || 1080}`);

        // 필수 필드만 반환, 기본값 설정
        res.json({
            html: sessionData.html,
            detectedWidth: sessionData.detectedWidth || 1080,
            resources: sessionData.resources || { cssLinks: [], inlineStyles: [] },
            metadata: sessionData.metadata || {},
            source: sessionData.source || 'extension'
        });

    } catch (err) {
        logger.error(`Failed to retrieve session data: ${err.message}`, { stack: err.stack });
        res.status(500).json({ error: `세션 데이터 조회 중 오류가 발생했습니다: ${err.message}` });
    }
});

// 미리보기 HTML 및 너비 정보 제공 엔드포인트
router.get('/preview-html', async (req, res) => {
    try {
        const url = req.query.url;
        
        if (!url) {
            logger.warn('Missing url parameter');
            return res.status(400).json({ error: 'url 파라미터가 필요합니다.' });
        }

        // URL 유효성 검사
        try {
            new URL(url);
        } catch (err) {
            logger.warn(`Invalid URL provided: ${url}`);
            return res.status(400).json({ error: `유효하지 않은 URL입니다: ${url}` });
        }

        // --- [추가된 부분] 옵션 파라미터 파싱 ---
        const options = {
            includeTitle: req.query.includeTitle === 'true',
            includeBanner: req.query.includeBanner === 'true',
            includeTags: req.query.includeTags === 'true'
        };

        logger.info(`Loading preview for URL: ${url}`);
        
        // --- [수정된 부분] 옵션을 getPreviewData에 전달 ---
        const previewData = await pdfService.getPreviewData(url, options);
        
        if (!previewData) {
            throw new Error('No preview data returned');
        }

        // 응답 데이터 검증
        if (!previewData.html || typeof previewData.html !== 'string') {
            logger.error(`Invalid HTML from pdfService for URL: ${url}`, { previewData });
            throw new Error('서버에서 유효한 HTML을 생성하지 못했습니다.');
        }

        const { detectedWidth, html, resources } = previewData;
        
        // resources 검증
        let validResources = resources;
        if (!validResources || typeof validResources !== 'object') {
            logger.warn(`Invalid resources from pdfService, using defaults`);
            validResources = {
                cssLinks: [],
                inlineStyles: []
            };
        }

        // 배열 검증
        if (!Array.isArray(validResources.cssLinks)) {
            validResources.cssLinks = [];
        }
        if (!Array.isArray(validResources.inlineStyles)) {
            validResources.inlineStyles = [];
        }
        
        logger.info(`Preview loaded - Detected width: ${detectedWidth}px, HTML length: ${html.length}, CSS: ${validResources.cssLinks.length}, Styles: ${validResources.inlineStyles.length}`);
        
        res.json({
            html: html,
            detectedWidth: detectedWidth || 1080,
            resources: validResources
        });

    } catch (err) {
        logger.error(`Failed to load preview: ${err.message}`, { stack: err.stack });
        res.status(500).json({ error: `미리보기를 불러오는 중 오류가 발생했습니다: ${err.message}` });
    }
});

router.post('/convert-url', convertLimiter, async (req, res) => {
    try {
        const rawBody = { ...req.body };
        ['includeBanner', 'includeTitle', 'includeTags'].forEach(key => {
            if (typeof rawBody[key] === 'string') rawBody[key] = rawBody[key].toLowerCase() === 'true';
        });

        const { error, value } = convertSchema.validate(rawBody);
        if (error) return res.status(400).json({ error: error.details[0].message });

        const job = await pdfQueue.add('convert', {
            targetUrl: value.url,
            options: { 
                mode: value.mode,
                format: value.format,
                pageBreaks: value.pageBreaks,
                includeBanner: value.includeBanner,
                includeTitle: value.includeTitle,
                includeTags: value.includeTags,
                marginTop: value.marginTop,
                marginBottom: value.marginBottom,
                marginLeft: value.marginLeft,
                marginRight: value.marginRight,
                pageWidth: value.pageWidth
            }
        }, {
            attempts: 5, // 최대 3회 재시도
            backoff: {
                type: 'exponential', // 지수 백오프 전략 (1초, 2초, 4초 대기 후 재시도)
                delay: 1000
            },
            removeOnComplete: 100, // 성공한 작업은 최근 100개만 유지
            removeOnFail: 500      // 실패한 작업(DLQ)은 분석을 위해 500개까지 보관
        });

        logger.info(`Job ${job.id} added to queue for URL: ${value.url}`);
        res.status(202).json({ jobId: job.id, message: '변환 대기열에 등록되었습니다.' });

    } catch (err) {
        logger.error(`Failed to enqueue job: ${err.message}`);
        res.status(500).json({ error: '서버 내부 오류로 대기열 등록에 실패했습니다.' });
    }
});

router.get('/job-events/:id', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Nginx 버퍼링 방지

    const jobId = req.params.id;
    let lastState = null;
    let timeoutCount = 0;
    const MAX_TIMEOUT_CYCLES = 300; // 2초 주기, 최대 10분 대기

    // 스트림 종료 여부를 확인하는 안전한 전송 함수
    const sendEvent = (data) => {
        if (!res.writableEnded) {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
    };

    const intervalId = setInterval(async () => {
        try {
            timeoutCount++;
            
            // 1. 무한 대기 방지 (Timeout)
            if (timeoutCount > MAX_TIMEOUT_CYCLES) {
                sendEvent({ status: 'error', error: '작업 대기 시간이 초과되었습니다.' });
                clearInterval(intervalId);
                return res.end();
            }

            const job = await pdfQueue.getJob(jobId);
            
            if (!job) {
                sendEvent({ status: 'error', error: '작업을 찾을 수 없습니다.' });
                clearInterval(intervalId);
                return res.end();
            }

            const state = await job.getState();
            
            // 2. 불필요한 이벤트 발행 최소화 (상태가 변경되었을 때만 전송)
            if (state !== lastState) {
                lastState = state;

                if (state === 'completed') {
                    const result = job.returnvalue; 
                    sendEvent({ status: 'completed', result });
                    clearInterval(intervalId);
                    res.end();
                } else if (state === 'failed') {
                    sendEvent({ status: 'failed', error: job.failedReason });
                    clearInterval(intervalId);
                    res.end();
                } else {
                    sendEvent({ status: state });
                }
            } else if (state === 'active' && job.progress) {
                // 향후 worker.js에서 job.updateProgress() 사용 시 진행률 전송 지원
                sendEvent({ status: state, progress: job.progress });
            }

        } catch (err) {
            logger.error(`[SSE] Error processing job ${jobId}: ${err.message}`);
            sendEvent({ status: 'error', error: '상태 조회 중 서버 오류 발생' });
            clearInterval(intervalId);
            res.end();
        }
    }, 500);

    // 3. 연결 유실 대비 예외 처리 강화
    req.on('close', () => {
        logger.info(`[SSE] Client disconnected for job ${jobId}`);
        clearInterval(intervalId);
    });

    req.on('error', (err) => {
        logger.error(`[SSE] Request error for job ${jobId}: ${err.message}`);
        clearInterval(intervalId);
    });
});

router.get('/download/:filename', (req, res) => {
    const fileName = req.params.filename;
    const filePath = path.join(__dirname, '../../public/downloads', fileName);

    if (!/^[a-zA-Z0-9\-\.]+\.pdf$/.test(fileName)) {
        return res.status(400).json({ error: '잘못된 파일 형식입니다.' });
    }

    res.download(filePath, fileName, (err) => {
        if (err) {
            if (!res.headersSent) {
                res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
            }
            return;
        }

        fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
                logger.error(`Failed to delete temporary file ${fileName}: ${unlinkErr.message}`);
            } else {
                logger.info(`Temporary file deleted: ${fileName}`);
            }
        });
    });
});

/**
 * HTML 콘텐츠로부터 직접 PDF 생성 (standard-edit용)
 * POST /render-html
 * Body: {
 *   html: string,
 *   format: 'A4' | 'A3' | 'B5' | 'Letter',
 *   pageBreaks: number[],
 *   marginTop: number,
 *   marginBottom: number,
 *   marginLeft: number,
 *   marginRight: number,
 *   pageWidth: number,
 *   filename: string (optional)
 * }
 */
router.post('/render-html', renderHtmlLimiter, async (req, res) => {
    try {
        const { error, value } = renderHtmlSchema.validate(req.body);
        if (error) {
            logger.warn(`Invalid render-html request: ${error.details[0].message}`);
            return res.status(400).json({ error: error.details[0].message });
        }

        logger.info(`Rendering HTML to PDF: format=${value.format}, pageBreaks=${value.pageBreaks.length}, margins=[${value.marginTop}, ${value.marginBottom}, ${value.marginLeft}, ${value.marginRight}]`);

        // PDF 생성
        const { stream, detectedWidth } = await pdfService.generatePdfFromHtml(
            value.html,
            value.format,
            {
                pageBreaks: value.pageBreaks,
                marginTop: value.marginTop,
                marginBottom: value.marginBottom,
                marginLeft: value.marginLeft,
                marginRight: value.marginRight,
                pageWidth: value.pageWidth
            }
        );

        // PDF 스트림을 클라이언트로 전송
        res.setHeader('Content-Type', 'application/pdf');
        
        const filename = value.filename || `notion-${Date.now()}.pdf`;
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

        stream.on('error', (err) => {
            logger.error(`Stream error during PDF transfer: ${err.message}`);
            if (!res.headersSent) {
                res.status(500).json({ error: 'PDF 전송 중 오류 발생' });
            }
        });

        stream.pipe(res);

        logger.info(`PDF rendered successfully: ${filename}`);

    } catch (err) {
        logger.error(`Failed to render HTML to PDF: ${err.message}`, { stack: err.stack });
        if (!res.headersSent) {
            res.status(500).json({ error: `PDF 렌더링 실패: ${err.message}` });
        }
    }
});

/**
 * 이미지 프록시 엔드포인트
 * Extension에서 캡처한 이미지 URL을 프록시하여 CORS 문제 해결
 * GET /proxy-image?url=<encoded-url>
 */
router.get('/proxy-image', rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200, // 이미지 프록시는 많은 요청 허용
    message: { error: '요청 한도를 초과했습니다.' },
    standardHeaders: true,
    legacyHeaders: false,
}), async (req, res) => {
    try {
        const { url } = req.query;
        
        logger.info(`[proxy-image] Request received - raw URL param: ${url ? url.substring(0, 80) + '...' : '(empty)'}`);

        if (!url) {
            logger.warn('[proxy-image] Missing url parameter');
            return res.status(400).json({ error: 'url 파라미터가 필요합니다.' });
        }

        // URL 디코딩 및 유효성 검사
        let decodedUrl;
        let parsedUrl;
        try {
            decodedUrl = decodeURIComponent(url);
            logger.info(`[proxy-image] Decoded URL: ${decodedUrl.substring(0, 80)}...`);
            parsedUrl = new URL(decodedUrl);
        } catch (e) {
            logger.warn(`[proxy-image] Invalid URL: ${url}, error: ${e.message}`);
            return res.status(400).json({ error: '유효하지 않은 URL입니다.' });
        }

        // Notion 이미지만 프록시 허용
        if (!parsedUrl.hostname.includes('notionusercontent.com') && 
            !parsedUrl.hostname.includes('notion.site')) {
            logger.warn(`[proxy-image] Non-Notion domain blocked: ${parsedUrl.hostname}`);
            return res.status(403).json({ error: 'Notion 이미지만 프록시할 수 있습니다.' });
        }

        logger.debug(`[proxy-image] Fetching image from: ${decodedUrl.substring(0, 100)}...`);

        // 이미지 데이터 가져오기 - 디코딩된 URL 사용
        const imageResponse = await axios.get(decodedUrl, {
            responseType: 'arraybuffer',
            timeout: 10000,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://notion.so'
            }
        });

        // 응답 헤더 설정
        res.set('Content-Type', imageResponse.headers['content-type'] || 'image/png');
        res.set('Cache-Control', 'public, max-age=86400'); // 24시간 캐시
        res.set('Access-Control-Allow-Origin', '*'); // CORS 허용
        res.set('Cross-Origin-Resource-Policy', 'cross-origin'); // CORP 허용
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Cache-Control');

        res.send(imageResponse.data);

        logger.debug(`[proxy-image] Image successfully proxied from: ${parsedUrl.hostname} (${imageResponse.headers['content-type']})`);

    } catch (err) {
        const errorDetails = {
            message: err.message,
            code: err.code,
            status: err.response?.status,
            url: decodedUrl.substring(0, 100)
        };
        logger.warn(`[proxy-image] Failed to proxy image: ${JSON.stringify(errorDetails)}`);
        
        // 이미지 실패 시 1x1 투명 PNG 반환 (레이아웃 깨짐 방지)
        const transparentPng = Buffer.from(
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
            'base64'
        );
        res.set('Content-Type', 'image/png');
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.set('Access-Control-Expose-Headers', 'Content-Length, Content-Type, Cache-Control');
        res.send(transparentPng);
    }
});

/**
 * 프론트엔드 로그 수신 엔드포인트
 * POST /log-frontend
 */
router.post('/log-frontend', (req, res) => {
    try {
        const { message, type = 'log', data, source = 'unknown' } = req.body;
        
        if (!message) {
            return res.status(400).json({ error: 'message is required' });
        }
        
        // 프론트엔드 로그를 서버 로그에 출력
        const logMessage = `[FRONTEND-${source.toUpperCase()}] [${type.toUpperCase()}] ${message}`;
        
        if (type === 'error') {
            logger.error(logMessage, data);
            console.error(`\x1b[31m${logMessage}\x1b[0m`, data || '');
        } else if (type === 'warn') {
            logger.warn(logMessage, data);
            console.warn(`\x1b[33m${logMessage}\x1b[0m`, data || '');
        } else {
            logger.info(logMessage, data);
            console.log(`\x1b[36m${logMessage}\x1b[0m`, data || '');
        }
        
        res.json({ success: true });
    } catch (err) {
        logger.error(`Failed to process frontend log: ${err.message}`);
        res.status(500).json({ error: 'Failed to process log' });
    }
});

module.exports = router;