// tests/unit/pdfService.test.js
const { Readable } = require('stream');
const pdfService = require('../../src/services/pdfService');
const browserPool = require('../../src/utils/browserPool');

// browserPool 모듈 자체를 Mocking 하여 풀(Pool)의 동작을 추적
jest.mock('../../src/utils/browserPool', () => ({
    acquire: jest.fn(),
    release: jest.fn(),
    drain: jest.fn(),
    clear: jest.fn()
}));

describe('PdfService 동시성 및 자원 풀(Pool) 관리 단위 테스트', () => {
    let mockPage;
    let mockBrowser;

    beforeEach(() => {
        jest.clearAllMocks(); // 각 테스트 전 Mock 초기화

        // Puppeteer Page Mock
        mockPage = {
            setRequestInterception: jest.fn().mockResolvedValue(),
            on: jest.fn(),
            setDefaultNavigationTimeout: jest.fn(),
            setUserAgent: jest.fn().mockResolvedValue(),
            setViewport: jest.fn().mockResolvedValue(),
            goto: jest.fn().mockResolvedValue(),
            evaluate: jest.fn().mockResolvedValue({
                height: 1000, width: 800, padTop: 0, padBottom: 0, padLeft: 0, padRight: 0, scale: 1
            }),
            createPDFStream: jest.fn().mockImplementation(async () => {
                return new ReadableStream({
                    start(controller) {
                        controller.close();
                    }
                });
            }),
            close: jest.fn().mockResolvedValue(),
        };

        // Puppeteer Browser Mock
        mockBrowser = {
            newPage: jest.fn().mockResolvedValue(mockPage),
            close: jest.fn(),
        };
    });

    test('browserPool을 통해 브라우저를 할당받아 PDF 작업을 수행해야 한다', async () => {
        // acquire 호출 시 mockBrowser 반환
        browserPool.acquire.mockResolvedValue(mockBrowser);

        const options = { includeBanner: false, includeTitle: false, includeTags: false, includeDiscussion: false };
        const result = await pdfService.generatePdf('https://notion.so/test', options);

        // 자원 획득 확인
        expect(browserPool.acquire).toHaveBeenCalledTimes(1);
        expect(mockBrowser.newPage).toHaveBeenCalledTimes(1);
        expect(mockPage.createPDFStream).toHaveBeenCalledTimes(1);
        expect(result.stream).toBeInstanceOf(Readable);
    });

    test('다중 요청 발생 시 browserPool.acquire가 요청 수만큼 호출되어 대기열 관리를 풀(Pool)에 위임해야 한다', async () => {
        browserPool.acquire.mockResolvedValue(mockBrowser);

        const options = {};
        
        // 3개의 요청을 동시에 실행 (이때 내부적으로 generic-pool이 동시성 한도에 맞춰 큐를 관리함)
        await Promise.all([
            pdfService.generatePdf('https://www.notion.so/cloudier338/HARP-Hierarchical-Representation-Learning-for-Networks-288fc609de7380138769d66282234ec8', options),
            pdfService.generatePdf('https://www.notion.so/cloudier338/HARP-Hierarchical-Representation-Learning-for-Networks-288fc609de7380138769d66282234ec8', options),
            pdfService.generatePdf('https://www.notion.so/cloudier338/HARP-Hierarchical-Representation-Learning-for-Networks-288fc609de7380138769d66282234ec8', options)
        ]);

        // 브라우저 할당 요청이 정확히 3번 이루어졌는지 검증
        expect(browserPool.acquire).toHaveBeenCalledTimes(3);
        expect(mockBrowser.newPage).toHaveBeenCalledTimes(3);
    });

    test('작업 중 에러 발생 시 메모리 누수 방지를 위해 브라우저 자원이 정상적으로 반환(release)되어야 한다', async () => {
        browserPool.acquire.mockResolvedValue(mockBrowser);
        
        // 페이지 이동(goto) 중 고의로 에러 발생
        mockPage.goto.mockRejectedValue(new Error('Navigation timeout'));

        await expect(pdfService.generatePdf('https://www.notion.so/cloudier338/HARP-Hierarchical-Representation-Learning-for-Networks-288fc609de7380138769d66282234ec8', {}))
            .rejects.toThrow('Navigation timeout');

        // 에러가 발생하여 catch 블록으로 빠지더라도 release가 호출되었는지 검증
        expect(mockPage.close).toHaveBeenCalledTimes(1);
        expect(browserPool.release).toHaveBeenCalledWith(mockBrowser);
        expect(browserPool.release).toHaveBeenCalledTimes(1);
    });
});