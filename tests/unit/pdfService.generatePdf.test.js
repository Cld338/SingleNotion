/**
 * PdfService - generatePdf() 메서드 테스트
 * 
 * 테스트 대상: generatePdf(url, options)
 * 기능: Notion 페이지를 PDF로 변환하여 스트림으로 반환
 * 
 * 테스트 범위:
 *   - PDF 스트림 생성 및 반환
 *   - 페이지 초기화 및 설정
 *   - 토글 블록 펼치기, KaTeX 주입 등 처리
 *   - 여백 및 옵션 처리
 *   - 에러 발생 시 리소스 정리
 *   - 스트림 정리 핸들러 등록
 */

jest.mock('puppeteer', () => ({
    launch: jest.fn(),
}));

jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/browserPool');

const PdfService = require('../../src/services/pdfService');
const browserPool = require('../../src/utils/browserPool');
const logger = require('../../src/utils/logger');

// Mock Readable stream
const { Readable } = require('stream');
const mockReadableStream = () => {
    const readable = new Readable({
        read() {}
    });
    return readable;
};

describe('PdfService - generatePdf()', () => {
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

        // Private 메서드들을 모킹
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

    describe('기본 기능 - PDF 생성 및 스트림 반환', () => {
        test('정상적인 Notion URL로 요청하면 스트림과 detectedWidth를 반환', async () => {
            // Arrange
            const url = 'https://notion.so/sample-page';
            const options = {
                marginTop: 10,
                marginBottom: 10,
                marginLeft: 10,
                marginRight: 10,
                pageWidth: 1080
            };
            setupGeneratePdfMocks({
                dimensions: { width: 1080, height: 2000, margins: { top: 10, bottom: 10, left: 10, right: 10 } }
            });

            // Act
            const result = await pdfService.generatePdf(url, options);

            // Assert
            expect(result).toBeDefined();
            expect(result.stream).toBeDefined();
            expect(result.detectedWidth).toBe(1080);
        });

        test('options 없이도 기본값으로 정상 작동', async () => {
            // Arrange
            const url = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            setupGeneratePdfMocks();

            // Act - options를 전달하지 않음
            const result = await pdfService.generatePdf(url, {});

            // Assert
            expect(result).toBeDefined();
            expect(result.stream).toBeDefined();
        });

        test('브라우저 및 페이지가 정상적으로 생성됨', async () => {
            // Arrange
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});

            // Assert
            expect(browserPool.acquire).toHaveBeenCalled();
            expect(mockBrowser.newPage).toHaveBeenCalled();
        });
    });

    describe('페이지 초기화 및 설정', () => {
        test('_setupBrowserPage가 호출됨', async () => {
            // Arrange
            const url = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf(url, {});

            // Assert
            expect(pdfService._setupBrowserPage).toHaveBeenCalledWith(mockPage);
        });

        test('Notion 도메인으로 페이지 이동', async () => {
            // Arrange
            const url = 'https://notion.so/test-page';
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf(url, {});

            // Assert
            expect(pdfService._navigateToPage).toHaveBeenCalledWith(mockPage, url);
        });
    });

    describe('콘텐츠 처리', () => {
        test('모든 토글 블록을 펼치는 메서드가 호출됨', async () => {
            // Arrange
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});

            // Assert
            expect(pdfService._openAllToggleBlocks).toHaveBeenCalledWith(mockPage);
        });

        test('KaTeX CSS가 주입됨', async () => {
            // Arrange
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});

            // Assert
            expect(pdfService._injectKaTeXCSS).toHaveBeenCalledWith(mockPage);
        });

        test('KaTeX 렌더링이 검증됨', async () => {
            // Arrange
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});

            // Assert
            expect(pdfService._validateKaTeXRendering).toHaveBeenCalledWith(mockPage);
        });
    });

    describe('페이지 치수 및 뷰포트 계산', () => {
        test('페이지 치수가 계산되고 옵션이 전달됨', async () => {
            // Arrange
            const options = {
                includeBanner: true,
                includeTitle: true,
                includeTags: false,
                includeDiscussion: false,
                marginTop: 20,
                marginBottom: 20,
                marginLeft: 15,
                marginRight: 15,
                pageWidth: 1200
            };
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', options);

            // Assert
            expect(pdfService._calculatePageDimensions).toHaveBeenCalledWith(
                mockPage,
                options
            );
        });

        test('최종 뷰포트가 조정됨', async () => {
            // Arrange
            const dimensions = { width: 1080, height: 2500, margins: {} };
            setupGeneratePdfMocks({ dimensions });

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});

            // Assert
            expect(pdfService._adjustFinalViewport).toHaveBeenCalledWith(mockPage, dimensions);
        });
    });

    describe('PDF 생성', () => {
        test('PDF 스트림이 생성되고 정리 핸들러가 등록됨', async () => {
            // Arrange
            const mockStream = mockReadableStream();
            const pdfOptions = { width: 1104, height: 2000, margin: {} };
            setupGeneratePdfMocks({
                stream: mockStream,
                pdfOptions
            });

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});

            // Assert
            expect(pdfService._createPDFStream).toHaveBeenCalledWith(mockPage, pdfOptions);
            expect(pdfService._attachStreamCleanupHandlers)
                .toHaveBeenCalledWith(mockStream, mockPage, mockBrowser);
        });

        test('스크린샷 경로가 있을 때 이를 처리', async () => {
            // Arrange
            const screenshotPath = '/tmp/debug.png';
            const options = { screenshotPath };
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', options);

            // Assert
            expect(pdfService._captureScreenshot).toHaveBeenCalledWith(mockPage, screenshotPath);
        });
    });

    describe('여백(Margin) 옵션 처리', () => {
        test('여백 옵션이 로깅되고 전달됨', async () => {
            // Arrange
            const options = {
                marginTop: 25,
                marginBottom: 30,
                marginLeft: 20,
                marginRight: 35
            };
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', options);

            // Assert
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Margin - Top: 25, Bottom: 30, Left: 20, Right: 35')
            );
        });

        test('여백 옵션이 _calculatePageDimensions에 전달됨', async () => {
            // Arrange
            const options = {
                marginTop: 10,
                marginBottom: 15,
                marginLeft: 5,
                marginRight: 5
            };
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', options);

            // Assert
            const callArgs = pdfService._calculatePageDimensions.mock.calls[0][1];
            expect(callArgs.marginTop).toBe(10);
            expect(callArgs.marginBottom).toBe(15);
            expect(callArgs.marginLeft).toBe(5);
            expect(callArgs.marginRight).toBe(5);
        });
    });

    describe('에러 처리 및 리소스 정리', () => {
        test('에러 발생 시 페이지 리소스가 정리됨', async () => {
            // Arrange
            const error = new Error('Navigation failed');
            setupGeneratePdfMocks();
            pdfService._navigateToPage = jest.fn().mockRejectedValue(error);

            // Act & Assert
            await expect(pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {}))
                .rejects.toThrow('Navigation failed');

            expect(pdfService._cleanupPageResources).toHaveBeenCalledWith(mockPage);
        });

        test('에러 발생 시 브라우저가 pool에 반환됨', async () => {
            // Arrange
            const error = new Error('PDF generation failed');
            setupGeneratePdfMocks();
            pdfService._createPDFStream = jest.fn().mockRejectedValue(error);

            // Act & Assert
            await expect(pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {}))
                .rejects.toThrow('PDF generation failed');

            expect(browserPool.release).toHaveBeenCalledWith(mockBrowser);
        });

        test('에러 메시지가 로깅됨', async () => {
            // Arrange
            const errorMessage = 'Page load timeout';
            setupGeneratePdfMocks();
            pdfService._navigateToPage = jest.fn()
                .mockRejectedValue(new Error(errorMessage));

            // Act & Assert
            await expect(pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {}))
                .rejects.toThrow();

            expect(logger.error).toHaveBeenCalledWith(
                expect.stringContaining(`PDF Generation failed: ${errorMessage}`)
            );
        });

        test('정리 중 에러 발생해도 원래 에러는 throw됨', async () => {
            // Arrange
            const originalError = new Error('Original error');
            const cleanupError = new Error('Cleanup error');
            setupGeneratePdfMocks();
            pdfService._setupBrowserPage = jest.fn()
                .mockRejectedValue(originalError);
            pdfService._cleanupPageResources = jest.fn()
                .mockRejectedValue(cleanupError);

            // Act & Assert
            await expect(pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {}))
                .rejects.toThrow('Original error');

            // 정리 에러도 로깅되어야 함
            expect(logger.warn).toHaveBeenCalledWith(
                expect.stringContaining('Error during exception cleanup')
            );
        });
    });

    describe('메서드 호출 순서', () => {
        test('모든 메서드가 올바른 순서로 호출됨', async () => {
            // Arrange
            setupGeneratePdfMocks();
            const callOrder = [];

            pdfService._setupBrowserPage.mockImplementation(() => {
                callOrder.push('_setupBrowserPage');
                return Promise.resolve();
            });
            pdfService._navigateToPage.mockImplementation(() => {
                callOrder.push('_navigateToPage');
                return Promise.resolve();
            });
            pdfService._openAllToggleBlocks.mockImplementation(() => {
                callOrder.push('_openAllToggleBlocks');
                return Promise.resolve();
            });
            pdfService._injectKaTeXCSS.mockImplementation(() => {
                callOrder.push('_injectKaTeXCSS');
                return Promise.resolve();
            });
            pdfService._calculatePageDimensions.mockImplementation(() => {
                callOrder.push('_calculatePageDimensions');
                return Promise.resolve({ width: 1080, height: 2000 });
            });
            pdfService._validateKaTeXRendering.mockImplementation(() => {
                callOrder.push('_validateKaTeXRendering');
                return Promise.resolve();
            });
            pdfService._adjustFinalViewport.mockImplementation(() => {
                callOrder.push('_adjustFinalViewport');
                return Promise.resolve({ width: 1104, height: 2000 });
            });
            pdfService._captureScreenshot.mockImplementation(() => {
                callOrder.push('_captureScreenshot');
                return Promise.resolve();
            });
            pdfService._createPDFStream.mockImplementation(() => {
                callOrder.push('_createPDFStream');
                return Promise.resolve(mockReadableStream());
            });
            pdfService._attachStreamCleanupHandlers.mockImplementation(() => {
                callOrder.push('_attachStreamCleanupHandlers');
                return Promise.resolve();
            });

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});

            // Assert
            expect(callOrder).toEqual([
                '_setupBrowserPage',
                '_navigateToPage',
                '_openAllToggleBlocks',
                '_injectKaTeXCSS',
                '_calculatePageDimensions',
                '_validateKaTeXRendering',
                '_adjustFinalViewport',
                '_captureScreenshot',
                '_createPDFStream',
                '_attachStreamCleanupHandlers'
            ]);
        });
    });

    describe('포함/제외 옵션 (includeBanner, includeTitle 등)', () => {
        test('모든 포함 옵션이 _calculatePageDimensions에 전달됨', async () => {
            // Arrange
            const options = {
                includeBanner: true,
                includeTitle: false,
                includeTags: true,
                includeDiscussion: false
            };
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', options);

            // Assert
            const callArgs = pdfService._calculatePageDimensions.mock.calls[0][1];
            expect(callArgs.includeBanner).toBe(true);
            expect(callArgs.includeTitle).toBe(false);
            expect(callArgs.includeTags).toBe(true);
            expect(callArgs.includeDiscussion).toBe(false);
        });
    });

    describe('반환값 검증', () => {
        test('반환값에 stream과 detectedWidth가 포함됨', async () => {
            // Arrange
            const mockStream = mockReadableStream();
            setupGeneratePdfMocks({
                stream: mockStream,
                dimensions: { width: 1240, height: 2000 }
            });

            // Act
            const result = await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});

            // Assert
            expect(result).toHaveProperty('stream');
            expect(result).toHaveProperty('detectedWidth');
            expect(result.stream).toBe(mockStream);
            expect(result.detectedWidth).toBe(1240);
        });

        test('반환된 stream이 Readable 형식', async () => {
            // Arrange
            const mockStream = mockReadableStream();
            setupGeneratePdfMocks({ stream: mockStream });

            // Act
            const result = await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});

            // Assert
            expect(result.stream).toBeInstanceOf(Readable);
        });
    });

    describe('페이지 클로젝업', () => {
        test('성공 시 페이지가 정리됨 (finally 블록에서는 명시적 정리 없음)', async () => {
            // Arrange
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});

            // Assert
            // 성공 케이스에서는 _attachStreamCleanupHandlers에서 정리 핸들러가 등록됨
            expect(pdfService._attachStreamCleanupHandlers).toHaveBeenCalled();
        });

        test('실패 시 페이지가 명시적으로 정리됨', async () => {
            // Arrange
            setupGeneratePdfMocks();
            pdfService._setupBrowserPage = jest.fn()
                .mockRejectedValue(new Error('Setup failed'));

            // Act & Assert
            try {
                await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});
            } catch (error) {
                // 예상된 에러
            }

            expect(pdfService._cleanupPageResources).toHaveBeenCalledWith(mockPage);
            expect(browserPool.release).toHaveBeenCalledWith(mockBrowser);
        });
    });

    describe('경계값 및 예외 케이스', () => {
        test('빈 options 객체로도 작동', async () => {
            // Arrange
            setupGeneratePdfMocks();

            // Act & Assert
            const result = await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', {});
            expect(result).toBeDefined();
        });

        test('모든 옵션이 undefined인 경우도 처리', async () => {
            // Arrange
            setupGeneratePdfMocks();
            const options = {
                marginTop: undefined,
                marginBottom: undefined,
                marginLeft: undefined,
                marginRight: undefined,
                pageWidth: undefined,
                screenshotPath: undefined
            };

            // Act & Assert
            const result = await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', options);
            expect(result).toBeDefined();
        });

        test('매우 큰 margin 값도 처리', async () => {
            // Arrange
            const options = {
                marginTop: 200,
                marginBottom: 200,
                marginLeft: 300,
                marginRight: 300
            };
            setupGeneratePdfMocks();

            // Act & Assert
            const result = await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', options);
            expect(result).toBeDefined();
        });

        test('0 값의 margin도 올바르게 처리', async () => {
            // Arrange
            const options = {
                marginTop: 0,
                marginBottom: 0,
                marginLeft: 0,
                marginRight: 0
            };
            setupGeneratePdfMocks();

            // Act
            await pdfService.generatePdf('https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8', options);

            // Assert
            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Margin - Top: 0, Bottom: 0, Left: 0, Right: 0')
            );
        });
    });
});
