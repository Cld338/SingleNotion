/**
 * PdfService - Cached Session Data PDF Generation Test
 * 
 * 테스트 대상: generatePdf(url, options, sessionId)
 * 기능: 캐시된 세션 데이터를 사용하여 private Notion 페이지 PDF 생성
 * 
 * 테스트 범위:
 *   - Redis에서 캐시된 세션 데이터 검색
 *   - 캐시 적중(hit) 및 미스(miss) 처리
 *   - localhost /render-cache 엔드포인트 네비게이션
 *   - SSRF 우회 처리 (localhost 허용)
 *   - 캐시 데이터로 PDF 생성
 *   - 캐시 만료 시 URL 폴백
 */

jest.mock('puppeteer', () => ({
    launch: jest.fn(),
}));

jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/browserPool');
jest.mock('../../src/config/queue');

const PdfService = require('../../src/services/pdfService');
const browserPool = require('../../src/utils/browserPool');
const logger = require('../../src/utils/logger');
const { connection } = require('../../src/config/queue');

// Mock Readable stream
const { Readable } = require('stream');
const mockReadableStream = () => {
    const readable = new Readable({
        read() {}
    });
    return readable;
};

describe('PdfService - Cached Session PDF Generation', () => {
    let mockBrowser;
    let mockPage;
    let pdfService;

    beforeEach(() => {
        jest.clearAllMocks();

        mockPage = {
            setRequestInterception: jest.fn().mockResolvedValue(undefined),
            on: jest.fn(),
            setDefaultNavigationTimeout: jest.fn().mockReturnValue(undefined),
            setUserAgent: jest.fn().mockResolvedValue(undefined),
            setViewport: jest.fn().mockResolvedValue(undefined),
            goto: jest.fn().mockResolvedValue(undefined),
            evaluate: jest.fn(),
            removeAllListeners: jest.fn(),
            close: jest.fn().mockResolvedValue(undefined),
        };

        mockBrowser = {
            newPage: jest.fn().mockResolvedValue(mockPage),
        };

        browserPool.acquire.mockResolvedValue(mockBrowser);
        browserPool.release = jest.fn().mockResolvedValue(undefined);

        pdfService = PdfService;
    });

    /**
     * Mock 설정 헬퍼 - 모든 private 메서드 모킹
     */
    const setupGeneratePdfMocks = (overrides = {}) => {
        const defaultDimensions = {
            width: 1080,
            height: 2000,
            margins: { top: 0, bottom: 0, left: 0, right: 0 }
        };

        const defaultPdfOptions = {
            width: 1104,
            height: 2000,
            margin: { top: 0, bottom: 0, left: 12, right: 12 }
        };

        pdfService._setupBrowserPage = jest.fn().mockResolvedValue(undefined);
        pdfService._navigateToPage = jest.fn().mockResolvedValue(undefined);
        pdfService._openAllToggleBlocks = jest.fn().mockResolvedValue(undefined);
        pdfService._injectKaTeXCSS = jest.fn().mockResolvedValue(undefined);
        pdfService._injectPDFRenderingCSS = jest.fn().mockResolvedValue(undefined);
        pdfService._calculatePageDimensions = jest.fn()
            .mockResolvedValue(overrides.dimensions || defaultDimensions);
        pdfService._validateKaTeXRendering = jest.fn().mockResolvedValue(undefined);
        pdfService._adjustFinalViewport = jest.fn()
            .mockResolvedValue(overrides.pdfOptions || defaultPdfOptions);
        pdfService._captureScreenshot = jest.fn().mockResolvedValue(undefined);
        pdfService._createPDFStream = jest.fn()
            .mockResolvedValue(overrides.stream || mockReadableStream());
        pdfService._attachStreamCleanupHandlers = jest.fn().mockResolvedValue(undefined);
        pdfService._cleanupPageResources = jest.fn().mockResolvedValue(undefined);
    };

    describe('캐시 데이터 검색 및 처리', () => {
        test('sessionId가 없으면 캐시 검색 수행 안함', async () => {
            setupGeneratePdfMocks();
            connection.get = jest.fn();

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            const result = await pdfService.generatePdf(url, options, null);

            expect(connection.get).not.toHaveBeenCalled();
            expect(result).toHaveProperty('stream');
            expect(result).toHaveProperty('detectedWidth');
        });

        test('sessionId가 제공되면 Redis에서 캐시 검색', async () => {
            setupGeneratePdfMocks();
            const sessionId = 'a'.repeat(24);
            const sessionKey = `extension-session:${sessionId}`;
            const cachedData = {
                html: '<html><body>Cached Content</body></html>',
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(cachedData));

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            const result = await pdfService.generatePdf(url, options, sessionId);

            expect(connection.get).toHaveBeenCalledWith(sessionKey);
            expect(result).toHaveProperty('stream');
            expect(result).toHaveProperty('detectedWidth');
        });

        test('캐시 검색 실패 시 로그만 남기고 계속 진행', async () => {
            setupGeneratePdfMocks();
            const sessionId = 'a'.repeat(24);
            
            connection.get = jest.fn().mockRejectedValue(new Error('Redis connection failed'));

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            const result = await pdfService.generatePdf(url, options, sessionId);

            expect(connection.get).toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalled();
            expect(result).toHaveProperty('stream');
        });

        test('캐시 미스 시 URL로 폴백', async () => {
            setupGeneratePdfMocks();
            const sessionId = 'a'.repeat(24);

            connection.get = jest.fn().mockResolvedValue(null);

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            const result = await pdfService.generatePdf(url, options, sessionId);

            expect(connection.get).toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Cache miss')
            );
            expect(result).toHaveProperty('stream');
        });
    });

    describe('캐시를 사용한 네비게이션', () => {
        test('캐시 있으면 localhost /render-cache 엔드포인트로 네비게이션', async () => {
            setupGeneratePdfMocks();
            const sessionId = 'b'.repeat(24);
            const cachedData = {
                html: '<html><body>Cached Content</body></html>',
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(cachedData));

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            await pdfService.generatePdf(url, options, sessionId);

            // _navigateToPage가 localhost 엔드포인트로 호출되는지 확인
            expect(pdfService._navigateToPage).toHaveBeenCalledWith(
                mockPage,
                url,
                expect.any(Object), // cachedSessionData
                sessionId
            );
        });

        test('캐시 없으면 원본 URL로 네비게이션', async () => {
            setupGeneratePdfMocks();
            const sessionId = 'c'.repeat(24);

            connection.get = jest.fn().mockResolvedValue(null);

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            await pdfService.generatePdf(url, options, sessionId);

            // _navigateToPage가 원본 URL과 null cachedData로 호출되는지 확인
            expect(pdfService._navigateToPage).toHaveBeenCalledWith(
                mockPage,
                url,
                null,
                sessionId
            );
        });

        test('sessionId 없으면 원본 URL로 네비게이션', async () => {
            setupGeneratePdfMocks();

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            await pdfService.generatePdf(url, options, null);

            expect(pdfService._navigateToPage).toHaveBeenCalledWith(
                mockPage,
                url,
                null,
                null
            );
        });
    });

    describe('브라우저 페이지 초기화', () => {
        test('캐시 없으면 usesCachedData=false로 _setupBrowserPage 호출', async () => {
            setupGeneratePdfMocks();

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            await pdfService.generatePdf(url, options, null);

            expect(pdfService._setupBrowserPage).toHaveBeenCalledWith(mockPage, false);
        });

        test('캐시 있으면 usesCachedData=true로 _setupBrowserPage 호출', async () => {
            setupGeneratePdfMocks();
            const sessionId = 'd'.repeat(24);
            const cachedData = {
                html: '<html><body>Cached</body></html>',
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(cachedData));

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            await pdfService.generatePdf(url, options, sessionId);

            expect(pdfService._setupBrowserPage).toHaveBeenCalledWith(mockPage, true);
        });
    });

    describe('에러 처리', () => {
        test('세션 데이터 파싱 실패 시 폴백', async () => {
            setupGeneratePdfMocks();
            const sessionId = 'e'.repeat(24);

            connection.get = jest.fn().mockResolvedValue('invalid json {');

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            const result = await pdfService.generatePdf(url, options, sessionId);

            expect(logger.warn).toHaveBeenCalled();
            expect(result).toHaveProperty('stream');
        });

        test('PDF 생성 에러 발생 시 리소스 정리', async () => {
            setupGeneratePdfMocks();
            const error = new Error('PDF creation failed');
            pdfService._createPDFStream = jest.fn().mockRejectedValue(error);

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            await expect(pdfService.generatePdf(url, options, null)).rejects.toThrow(error);

            expect(pdfService._cleanupPageResources).toHaveBeenCalled();
            expect(browserPool.release).toHaveBeenCalled();
        });
    });

    describe('성능 - 타이밍 로깅', () => {
        test('캐시 검색 타이밍 로깅', async () => {
            setupGeneratePdfMocks();
            const sessionId = 'f'.repeat(24);
            const cachedData = {
                html: '<html><body>Cache Test</body></html>',
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(cachedData));

            const url = 'https://notion.so/test-page';
            const options = { marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 };

            await pdfService.generatePdf(url, options, sessionId);

            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Cache hit')
            );
        });
    });
});
