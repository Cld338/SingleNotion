const express = require('express');
const Joi = require('joi');
const path = require('path');
const fs = require('fs');
const rateLimit = require('express-rate-limit');
const { pdfQueue, connection } = require('../config/queue');
const logger = require('../utils/logger');
const pdfService = require('../services/pdfService');
const URLPathConverter = require('../utils/urlPathConverter');
const crypto = require('crypto');

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
            return res.status(400).json({ error: '유효하지 않은 URL입니다.' });
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

        const { detectedWidth, html, resources } = previewData;
        
        logger.info(`Preview loaded - Detected width: ${detectedWidth}px, HTML length: ${html.length}, CSS: ${resources?.cssLinks?.length || 0}, JS: ${resources?.jsScripts?.length || 0}`);
        
        // 모든 외부 URL과 상대 경로를 proxy-asset으로 변환 (CORS 에러 방지)
        let processedHtml = html;
        if (html && url) {
            logger.debug(`Converting all URLs in preview HTML to proxy-asset with baseUrl: ${url}`);
            const urlCountBefore = (html.match(/https?:\/\//g) || []).length;
            processedHtml = URLPathConverter.convertAllToProxyAsset(html, url);
            const urlCountAfter = (processedHtml.match(/https?:\/\//g) || []).length;
            logger.debug(`Proxy-asset conversion completed: ${urlCountBefore} external URLs → ${urlCountAfter}`);
        }
        
        res.json({
            html: processedHtml,
            detectedWidth: detectedWidth,
            resources: resources || {
                cssLinks: [],
                inlineStyles: []
            }
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
 * Extension에서 캡처한 데이터를 받아 Redis에 저장
 * POST /render-from-extension
 * Body: {
 *   html: string,
 *   detectedWidth: number,
 *   resources: { cssLinks: [], inlineStyles: [] },
 *   metadata: { url, title, timestamp, ... }
 * }
 */
router.post('/render-from-extension', async (req, res) => {
    try {
        const { html, resources, metadata, detectedWidth } = req.body;

        // 입력 검증
        if (!html || typeof html !== 'string') {
            logger.warn('Invalid HTML in render-from-extension request');
            return res.status(400).json({ error: 'HTML content is required and must be a string' });
        }

        if (!resources || typeof resources !== 'object') {
            logger.warn('Invalid resources in render-from-extension request');
            return res.status(400).json({ error: 'resources object is required' });
        }

        if (!metadata || typeof metadata !== 'object') {
            logger.warn('Invalid metadata in render-from-extension request');
            return res.status(400).json({ error: 'metadata object is required' });
        }

        // sessionId 생성
        const sessionId = crypto.randomBytes(12).toString('hex');
        const sessionKey = `extension-session:${sessionId}`;

        // 세션 데이터 구성 - extension에서 수집한 모든 리소스 저장
        const sessionData = {
            html,
            detectedWidth: detectedWidth || 1080,
            resources: {
                cssLinks: Array.isArray(resources.cssLinks) ? resources.cssLinks : [],
                inlineStyles: Array.isArray(resources.inlineStyles) ? resources.inlineStyles : [],
                scripts: Array.isArray(resources.scripts) ? resources.scripts : [],
                icons: Array.isArray(resources.icons) ? resources.icons : [],
                fonts: Array.isArray(resources.fonts) ? resources.fonts : [],
                katexResources: Array.isArray(resources.katexResources) ? resources.katexResources : [],
                videos: Array.isArray(resources.videos) ? resources.videos : []
            },
            metadata: {
                ...metadata,
                source: 'extension',
                createdAt: new Date().toISOString(),
                // baseUrl이 없으면 url에서 추출 (정규화)
                baseUrl: metadata.baseUrl || (() => {
                    try {
                        const urlObj = new URL(metadata.url);
                        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}`;
                    } catch {
                        return metadata.url;
                    }
                })()
            }
        };

        // Redis에 저장 (24시간 TTL)
        await connection.setex(
            sessionKey,
            86400,
            JSON.stringify(sessionData)
        );

        logger.info(`Session created for extension: sessionId=${sessionId}, htmlLength=${html.length}, metadata=${JSON.stringify(metadata)}`);

        res.status(201).json({
            success: true,
            sessionId,
            message: 'Extension data saved successfully'
        });

    } catch (err) {
        logger.error(`Failed to process render-from-extension: ${err.message}`, { stack: err.stack });
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to save extension data' });
        }
    }
});

/**
 * 저장된 세션 데이터 조회
 * GET /session-data/:sessionId
 */
router.get('/session-data/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;

        // sessionId 유효성 검사 (16진수 24자리)
        if (!/^[a-f0-9]{24}$/.test(sessionId)) {
            logger.warn(`Invalid sessionId format: ${sessionId}`);
            return res.status(400).json({ error: 'Invalid sessionId format' });
        }

        const sessionKey = `extension-session:${sessionId}`;
        const sessionDataStr = await connection.get(sessionKey);

        if (!sessionDataStr) {
            logger.warn(`Session not found: sessionId=${sessionId}`);
            return res.status(404).json({ error: 'Session data not found or expired' });
        }

        const sessionData = JSON.parse(sessionDataStr);

        logger.info(`Session retrieved: sessionId=${sessionId}, htmlLength=${sessionData.html.length}`);

        // [Step 1] HTML 경로 변환 (상대 경로 → 절대 경로)
        const baseUrl = sessionData.metadata?.baseUrl || sessionData.metadata?.url;
        if (baseUrl && sessionData.html) {
            logger.debug(`Converting paths in HTML using baseUrl: ${baseUrl}`);
            sessionData.html = URLPathConverter.convertAll(sessionData.html, baseUrl);
            logger.debug(`HTML path conversion completed, new length: ${sessionData.html.length}`);
        }

        // [Step 2] 모든 외부 URL과 상대 경로를 proxy-asset으로 변환 (CORS 에러 방지)
        // baseUrl을 전달하여 상대 경로(/_assets/...)도 처리
        if (sessionData.html) {
            logger.debug(`Converting all URLs to proxy-asset${baseUrl ? ` with baseUrl: ${baseUrl}` : ''}`);
            const urlCountBefore = (sessionData.html.match(/https?:\/\//g) || []).length;
            sessionData.html = URLPathConverter.convertAllToProxyAsset(sessionData.html, baseUrl);
            const urlCountAfter = (sessionData.html.match(/https?:\/\//g) || []).length;
            const relativePathCount = (sessionData.html.match(/(?:href|src)=["']\/[^"']*["']/g) || []).length;
            logger.debug(`Proxy-asset conversion completed: ${urlCountBefore} external URLs → ${urlCountAfter}, relative paths converted: ${relativePathCount > 0 ? 'yes' : 'no'}`);
        }

        res.json(sessionData);

    } catch (err) {
        logger.error(`Failed to retrieve session data: ${err.message}`, { stack: err.stack });
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to retrieve session data' });
        }
    }
});

module.exports = router;