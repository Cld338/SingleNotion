// 테스트 코드 수정 예시 (tests/unit/pdfService.stream.test.js)
const { Readable } = require('stream');
const pdfService = require('../../src/services/pdfService');
const browserPool = require('../../src/utils/browserPool');

// browserPool 모듈을 Mock 처리
jest.mock('../../src/utils/browserPool', () => ({
    acquire: jest.fn(),
    release: jest.fn(),
    drain: jest.fn(),
    clear: jest.fn()
}));

describe('PdfService PDF 생성 단위 테스트 (Mock)', () => {
    let mockPage;
    let mockBrowser;

    beforeEach(() => {
        mockPage = {
            setRequestInterception: jest.fn().mockResolvedValue(),
            on: jest.fn(),
            setDefaultNavigationTimeout: jest.fn(),
            setDefaultTimeout: jest.fn(),
            setUserAgent: jest.fn().mockResolvedValue(),
            setViewport: jest.fn().mockResolvedValue(),
            goto: jest.fn().mockResolvedValue(),
            waitForSelector: jest.fn().mockResolvedValue(),
            evaluate: jest.fn().mockResolvedValue({
                height: 1000, width: 800, padTop: 0, padBottom: 0, padLeft: 0, padRight: 0, scale: 1
            }),
            addStyleTag: jest.fn().mockResolvedValue(),
            createPDFStream: jest.fn().mockImplementation(async () => {
                return new ReadableStream({
                    start(controller) {
                        controller.close();
                    }
                });
            }),
            close: jest.fn().mockResolvedValue(),
        };

        mockBrowser = {
            newPage: jest.fn().mockResolvedValue(mockPage),
            isConnected: jest.fn().mockReturnValue(true),
            close: jest.fn(),
            on: jest.fn(),
        };

        // browserPool.acquire 호출 시 mockBrowser 반환
        browserPool.acquire.mockResolvedValue(mockBrowser);
    });

    test('generatePdf는 메모리 누수 방지를 위해 Readable Stream 객체를 반환해야 한다', async () => {
        const options = { includeBanner: true, includeTitle: true, includeTags: true, includeDiscussion: true };
        const result = await pdfService.generatePdf('https://notion.so/test', options);
        
        expect(result.stream).toBeInstanceOf(Readable);
        expect(mockPage.createPDFStream).toHaveBeenCalled();
    });
});