/**
 * PdfService - getPreviewData() 메서드 테스트
 * 
 * 테스트 대상: getPreviewData(url, options)
 * 기능: Notion 페이지를 분석하여 미리보기용 데이터 수집
 * 
 * 테스트 범위:
 *   - 페이지 로드 및 HTML 추출
 *   - 페이지 너비 감지
 *   - 리소스 수집 (CSS, 이미지, 스크립트, 폰트, 아이콘, 비디오)
 *   - 에러 처리
 *   - 리소스 정리
 */

jest.mock('puppeteer', () => ({
    launch: jest.fn(),
}));

jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/browserPool');

const PdfService = require('../../src/services/pdfService');
const browserPool = require('../../src/utils/browserPool');
const logger = require('../../src/utils/logger');

describe('PdfService - getPreviewData()', () => {
    let mockBrowser;
    let mockPage;

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
    });

    /**
     * Mock 설정 헬퍼
     * page.evaluate는 3번 호출: (1) CSS 로딩 대기, (2) 데이터 수집, (3) 정리
     * 2번째 호출에서만 미리보기 데이터를 반환
     */
    const setupMocks = (previewData = null) => {
        const defaultData = previewData || {
            detectedWidth: 1080,
            html: 'content',
            resources: {
                cssLinks: [],
                scripts: [],
                inlineStyles: [],
                images: [],
                icons: [],
                fonts: [],
                katexResources: [],
                videos: [],
                otherAssets: []
            },
            debug: {}
        };

        let callCount = 0;
        mockPage.evaluate.mockImplementation(async () => {
            callCount++;
            if (callCount === 2) {
                return defaultData;
            }
            return undefined;
        });
    };

    describe('기본 기능 - 페이지 로드 및 데이터 수집', () => {
        test('정상적인 Notion URL로 요청하면 미리보기 데이터를 반환', async () => {
            const url = 'https://notion.so/sample-page';
            const mockData = {
                detectedWidth: 1080,
                html: '<div class="notion-page-content">Content</div>',
                resources: {
                    cssLinks: [{ href: 'https://notion.so/style.css', media: 'all', crossorigin: null }],
                    scripts: [],
                    inlineStyles: [],
                    images: [{ src: 'https://notion.so/image.png', alt: 'test', title: '' }],
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: { imageCount: 1 }
            };

            setupMocks(mockData);

            const result = await PdfService.getPreviewData(url);

            expect(result).toBeDefined();
            expect(result.detectedWidth).toBe(1080);
            expect(result.html).toContain('notion-page-content');
        });

        test('options가 없어도 기본값으로 정상 작동', async () => {
            setupMocks();

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result).toBeDefined();
            expect(mockPage.evaluate).toHaveBeenCalled();
        });

        test('브라우저 페이지가 정상적으로 초기화됨', async () => {
            setupMocks();

            await PdfService.getPreviewData('https://notion.so/page');

            expect(browserPool.acquire).toHaveBeenCalled();
            expect(mockBrowser.newPage).toHaveBeenCalled();
            expect(mockPage.setRequestInterception).toHaveBeenCalledWith(true);
            expect(mockPage.setUserAgent).toHaveBeenCalled();
            expect(mockPage.setViewport).toHaveBeenCalledWith({ width: 3000, height: 1000 });
        });

        test('Notion 도메인으로 이동', async () => {
            const url = 'https://notion.so/test-page';
            setupMocks();

            await PdfService.getPreviewData(url);

            expect(mockPage.goto).toHaveBeenCalledWith(url, { waitUntil: 'networkidle2' });
        });
    });

    describe('HTML 및 콘텐츠 추출', () => {
        test('HTML 콘텐츠가 올바르게 반환됨', async () => {
            const expectedHtml = '<h1>Page Title</h1><p>Content</p>';
            setupMocks({
                detectedWidth: 1080,
                html: expectedHtml,
                resources: {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: [],
                    images: [],
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: {}
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.html).toBe(expectedHtml);
        });

        test('페이지 너비가 올바르게 감지됨', async () => {
            setupMocks({
                detectedWidth: 1200,
                html: 'content',
                resources: {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: [],
                    images: [],
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: {}
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.detectedWidth).toBe(1200);
        });

        test('빈 HTML도 정상 처리', async () => {
            setupMocks({
                detectedWidth: 1080,
                html: '',
                resources: {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: [],
                    images: [],
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: {}
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.html).toBe('');
            expect(result).toBeDefined();
        });
    });

    describe('리소스 수집 - CSS', () => {
        test('CSS 링크가 모두 수집됨', async () => {
            const cssResources = [
                { href: 'https://notion.so/style1.css', media: 'all', crossorigin: null },
                { href: 'https://notion.so/style2.css', media: 'print', crossorigin: 'anonymous' }
            ];

            setupMocks({
                detectedWidth: 1080,
                html: 'content',
                resources: {
                    cssLinks: cssResources,
                    scripts: [],
                    inlineStyles: [],
                    images: [],
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: { stylesheetLinks: 2 }
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.cssLinks).toHaveLength(2);
            expect(result.resources.cssLinks[0].href).toBe(cssResources[0].href);
            expect(result.resources.cssLinks[1].media).toBe('print');
        });

        test('인라인 스타일이 수집됨', async () => {
            const inlineStyles = [
                { id: 'style-1', content: 'body { margin: 0; }' },
                { id: 'style-2', content: '.class { color: red; }' }
            ];

            setupMocks({
                detectedWidth: 1080,
                html: 'content',
                resources: {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: inlineStyles,
                    images: [],
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: { allStyleTags: 2 }
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.inlineStyles).toHaveLength(2);
            expect(result.resources.inlineStyles[0].id).toBe('style-1');
        });

        test('CSS가 없는 경우도 정상 처리', async () => {
            setupMocks();

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.cssLinks).toHaveLength(0);
            expect(result.resources.inlineStyles).toHaveLength(0);
        });
    });

    describe('리소스 수집 - 이미지', () => {
        test('이미지가 모두 수집됨', async () => {
            const images = [
                { src: 'https://notion.so/image1.png', alt: 'Image 1', title: 'Title 1', dataAttributes: [] },
                { src: 'https://notion.so/image2.jpg', alt: 'Image 2', title: '', dataAttributes: [] }
            ];

            setupMocks({
                detectedWidth: 1080,
                html: 'content',
                resources: {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: [],
                    images: images,
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: { imageCount: 2 }
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.images).toHaveLength(2);
            expect(result.resources.images[0].src).toBe(images[0].src);
            expect(result.resources.images[0].alt).toBe('Image 1');
        });

        test('picture 요소의 이미지도 수집됨', async () => {
            const images = [
                { src: 'https://notion.so/responsive1.jpg', srcset: true, media: '(min-width: 768px)' },
                { src: 'https://notion.so/responsive2.jpg', srcset: true, media: '(max-width: 767px)' }
            ];

            setupMocks({
                detectedWidth: 1080,
                html: 'content',
                resources: {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: [],
                    images: images,
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: { imageCount: 2 }
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.images[0].srcset).toBe(true);
            expect(result.resources.images[0].media).toBeDefined();
        });

        test('이미지가 없는 경우도 정상 처리', async () => {
            setupMocks();

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.images).toHaveLength(0);
        });
    });

    describe('리소스 수집 - 스크립트, 폰트, 아이콘, 기타', () => {
        test('외부 스크립트가 수집됨', async () => {
            const scripts = [
                { type: 'external', src: 'https://example.com/script1.js', async: true, defer: false },
                { type: 'external', src: 'https://example.com/script2.js', async: false, defer: true }
            ];

            setupMocks({
                detectedWidth: 1080,
                html: 'content',
                resources: {
                    cssLinks: [],
                    scripts: scripts,
                    inlineStyles: [],
                    images: [],
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: { scriptTags: 2 }
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.scripts).toHaveLength(2);
            expect(result.resources.scripts[0].type).toBe('external');
        });

        test('웹 폰트가 수집됨', async () => {
            const fonts = [
                { href: 'https://fonts.googleapis.com/css?family=Roboto' },
                { href: 'https://example.com/font.woff2' }
            ];

            setupMocks({
                detectedWidth: 1080,
                html: 'content',
                resources: {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: [],
                    images: [],
                    icons: [],
                    fonts: fonts,
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: { fontCount: 2 }
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.fonts).toHaveLength(2);
            expect(result.resources.fonts[0].href).toContain('googleapis');
        });

        test('아이콘이 수집됨', async () => {
            const icons = [
                { href: 'https://notion.so/favicon.ico', rel: 'icon', type: 'image/x-icon', sizes: null },
                { href: 'https://notion.so/apple-touch-icon.png', rel: 'apple-touch-icon', type: 'image/png', sizes: '180x180' }
            ];

            setupMocks({
                detectedWidth: 1080,
                html: 'content',
                resources: {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: [],
                    images: [],
                    icons: icons,
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                },
                debug: { iconCount: 2 }
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.icons).toHaveLength(2);
            expect(result.resources.icons[1].rel).toBe('apple-touch-icon');
        });

        test('KaTeX 리소스가 수집됨', async () => {
            const katexResources = [
                { type: 'link', href: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css' },
                { type: 'script', src: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js' }
            ];

            setupMocks({
                detectedWidth: 1080,
                html: 'content',
                resources: {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: [],
                    images: [],
                    icons: [],
                    fonts: [],
                    katexResources: katexResources,
                    videos: [],
                    otherAssets: []
                },
                debug: { katexCount: 2 }
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.katexResources).toHaveLength(2);
            expect(result.resources.katexResources[0].type).toBe('link');
        });

        test('비디오/미디어가 수집됨', async () => {
            const videos = [
                { tag: 'video', src: 'https://notion.so/video.mp4', type: 'video/mp4' },
                { tag: 'audio', src: 'https://notion.so/audio.mp3', type: 'audio/mpeg' }
            ];

            setupMocks({
                detectedWidth: 1080,
                html: 'content',
                resources: {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: [],
                    images: [],
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: videos,
                    otherAssets: []
                },
                debug: { videoCount: 2 }
            });

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result.resources.videos).toHaveLength(2);
            expect(result.resources.videos[0].tag).toBe('video');
        });
    });

    describe('에러 처리', () => {
        test('페이지 로드 실패 시 에러 발생', async () => {
            const pageError = new Error('Failed to navigate to page');
            mockPage.goto.mockRejectedValue(pageError);

            await expect(
                PdfService.getPreviewData('https://notion.so/page')
            ).rejects.toThrow();
        });

        test('브라우저 풀 에러 처리', async () => {
            browserPool.acquire.mockRejectedValue(new Error('Browser pool exhausted'));

            await expect(
                PdfService.getPreviewData('https://notion.so/page')
            ).rejects.toThrow('Browser pool exhausted');
        });
    });

    describe('리소스 정리', () => {
        test('정상 완료 후 리소스가 정리됨', async () => {
            setupMocks();

            await PdfService.getPreviewData('https://notion.so/page');

            expect(mockPage.removeAllListeners).toHaveBeenCalled();
            expect(mockPage.close).toHaveBeenCalled();
        });

        test('페이지가 null이 아닐 때 정리됨', async () => {
            setupMocks();

            await PdfService.getPreviewData('https://notion.so/page');

            expect(mockPage.removeAllListeners).toHaveBeenCalled();
            expect(mockPage.close).toHaveBeenCalled();
            expect(browserPool.release).toHaveBeenCalled();
        });

        test('정리 중 에러가 발생해도 계속 진행됨', async () => {
            mockPage.close.mockRejectedValueOnce(new Error('Close failed'));
            setupMocks();

            const result = await PdfService.getPreviewData('https://notion.so/page');

            expect(result).toBeDefined();
            expect(mockPage.close).toHaveBeenCalled();
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Page cleanup error')
            );
        });
    });

    describe('복합 시나리오', () => {
        test('다양한 리소스가 모두 수집되는 종합 테스트', async () => {
            setupMocks({
                detectedWidth: 1200,
                html: '<div class="notion-page"><h1>Title</h1><p>Content</p></div>',
                resources: {
                    cssLinks: [{ href: 'https://notion.so/style.css', media: 'all', crossorigin: null }],
                    scripts: [{ type: 'external', src: 'https://example.com/script.js', async: true, defer: false }],
                    inlineStyles: [{ id: 'style-inline', content: 'body { font-family: sans-serif; }' }],
                    images: [{ src: 'https://notion.so/image.png', alt: 'Test Image', title: 'Test', dataAttributes: [] }],
                    icons: [{ href: 'https://notion.so/favicon.ico', rel: 'icon', type: 'image/x-icon', sizes: null }],
                    fonts: [{ href: 'https://fonts.googleapis.com/css?family=Roboto' }],
                    katexResources: [{ type: 'link', href: 'https://cdn.jsdelivr.net/npm/katex/dist/katex.min.css' }],
                    videos: [{ tag: 'video', src: 'https://notion.so/video.mp4', type: 'video/mp4' }],
                    otherAssets: [{ url: 'https://notion.so/_assets/icon.svg', type: 'svg' }]
                },
                debug: { imageCount: 1, scriptCount: 1, iconCount: 1, fontCount: 1, katexCount: 1, videoCount: 1, assetCount: 1 }
            });

            const result = await PdfService.getPreviewData('https://notion.so/complete-page');

            expect(result.detectedWidth).toBe(1200);
            expect(result.html).toContain('notion-page');
            expect(result.resources.cssLinks).toHaveLength(1);
            expect(result.resources.scripts).toHaveLength(1);
            expect(result.resources.images).toHaveLength(1);
            expect(result.resources.icons).toHaveLength(1);
        });
    });
});
