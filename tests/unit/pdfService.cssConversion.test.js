/**
 * PdfService - CSS URL 변환 기능 테스트
 * 
 * 테스트 대상: convertCssUrlsToProxyAsset(cssText)
 * 기능: CSS의 url() 함수 경로를 proxy-asset으로 변환하는 로직 검증
 */

// Mock puppeteer BEFORE requiring PdfService
jest.mock('puppeteer', () => ({
    launch: jest.fn(),
}));

jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/browserPool');

const PdfService = require('../../src/services/pdfService');

describe('PdfService - CSS URL 변환 (convertCssUrlsToProxyAsset)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('절대 URL 변환', () => {
        test('http://로 시작하는 URL을 proxy-asset으로 변환', () => {
            // Arrange
            const cssText = 'url("http://example.com/icon.svg")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
            expect(result).toContain('http%3A%2F%2Fexample.com%2Ficon.svg');
        });

        test('https://로 시작하는 URL을 proxy-asset으로 변환', () => {
            // Arrange
            const cssText = 'url("https://notion.site/icon.svg")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
            expect(result).toContain('https%3A%2F%2Fnotion.site%2Ficon.svg');
        });

        test('프로토콜 상대 URL(//)을 proxy-asset으로 변환', () => {
            // Arrange
            const cssText = 'url("//cdn.example.com/style.css")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
            expect(result).toContain('https%3A%2F%2Fcdn.example.com%2Fstyle.css');
        });

        test('주소 뒤에 \'https\'를 추가해야 함 (// URL의 경우)', () => {
            // Arrange
            const cssText = 'url("//cdn.example.com/fonts/font.woff")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('https');
            expect(result).toContain('/proxy-asset?url=');
        });
    });

    describe('이미 프록시된 경로 처리', () => {
        test('이미 proxy-asset인 경로는 변경하지 않음', () => {
            // Arrange
            const cssText = 'url(\'/proxy-asset?url=https%3A%2F%2Fexample.com%2Ficon.svg\')';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toBe(cssText);
        });

        test('복수의 proxy-asset url은 그대로 유지', () => {
            // Arrange
            const cssText = 'background: url(\'/proxy-asset?url=test1\'), url(\'/proxy-asset?url=test2\')';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=test1');
            expect(result).toContain('/proxy-asset?url=test2');
        });
    });

    describe('Data URI 처리', () => {
        test('Data URI는 변경하지 않음 (svg)', () => {
            // Arrange
            const cssText = 'url(\'data:image/svg+xml;utf8,<svg></svg>\')';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toBe(cssText);
        });

        test('Data URI는 변경하지 않음 (base64 image)', () => {
            // Arrange
            const cssText = 'url(\'data:image/png;base64,iVBORw0KGgoAAAA...\')';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toBe(cssText);
        });

        test('Data URI는 변경하지 않음 (font)', () => {
            // Arrange
            const cssText = 'url(\'data:application/x-font-woff;base64,d09GRg...\')';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toBe(cssText);
        });
    });

    describe('따옴표 처리', () => {
        test('큰따옴표로 감싼 URL 변환', () => {
            // Arrange
            const cssText = 'url("http://example.com/icon.svg")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
            expect(result).not.toContain('http://example.com');
        });

        test('작은따옴표로 감싼 URL 변환', () => {
            // Arrange
            const cssText = "url('http://example.com/icon.svg')";
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
        });

        test('따옴표 없는 URL 변환', () => {
            // Arrange
            const cssText = 'url(http://example.com/icon.svg)';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
        });

        test('혼합 따옴표 처리', () => {
            // Arrange
            const cssText = 'background-image: url("http://a.com/1.svg"), url(\'http://b.com/2.svg\'), url(http://c.com/3.svg)';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            const matches = result.match(/\/proxy-asset\?url=/g) || [];
            expect(matches.length).toBe(3);
        });
    });

    describe('공백 처리', () => {
        test('URL 앞뒤 공백 제거', () => {
            // Arrange
            const cssText = 'url( "http://example.com/icon.svg" )';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
            expect(result).not.toContain('( "');
        });

        test('여러 공백도 올바르게 처리', () => {
            // Arrange
            const cssText = 'url(  "http://example.com/icon.svg"  )';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
        });
    });

    describe('복수 URL 처리', () => {
        test('여러 url() 함수가 포함된 CSS 모두 변환', () => {
            // Arrange
            const cssText = `
                background-image: url("http://example.com/bg.jpg");
                border-image: url("http://example.com/border.png");
                mask-image: url("http://example.com/mask.svg");
            `;
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            const matches = result.match(/\/proxy-asset\?url=/g) || [];
            expect(matches.length).toBe(3);
        });

        test('동일한 URL 참조도 모두 변환', () => {
            // Arrange
            const cssText = 'background: url("http://example.com/icon.svg"), url("http://example.com/icon.svg")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            const matches = result.match(/\/proxy-asset\?url=/g) || [];
            expect(matches.length).toBe(2);
        });

        test('혼합 URL (절대, proxy-asset, data) 처리', () => {
            // Arrange
            const cssText = `
                background: url("http://example.com/bg.jpg"),
                            url('/proxy-asset?url=already-proxied'),
                            url('data:image/svg+xml;...'),
                            url("http://example.com/other.png");
            `;
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            const matches = result.match(/\/proxy-asset\?url=/g) || [];
            expect(matches.length).toBe(3); // 2개 변환 + 1개 기존 = 3개 total
            expect(result).toContain('already-proxied');
            expect(result).toContain('data:image/svg+xml');
        });
    });

    describe('Null/Empty 처리', () => {
        test('null 입력은 null 반환', () => {
            // Arrange
            const cssText = null;
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toBe(null);
        });

        test('undefined 입력은 undefined 반환', () => {
            // Arrange
            const cssText = undefined;
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toBe(undefined);
        });

        test('빈 문자열은 빈 문자열 반환', () => {
            // Arrange
            const cssText = '';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toBe('');
        });

        test('url() 없는 CSS는 변경하지 않음', () => {
            // Arrange
            const cssText = '.class { color: red; background-color: blue; }';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toBe(cssText);
        });
    });

    describe('특수 문자 처리', () => {
        test('URL의 특수 문자 인코딩', () => {
            // Arrange
            const cssText = 'url("http://example.com/image file.png")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
            expect(result).toContain('%');
        });

        test('URL의 한글 문자 처리', () => {
            // Arrange
            const cssText = 'url("http://example.com/이미지.png")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
        });

        test('URL의 쿼리 문자열 처리', () => {
            // Arrange
            const cssText = 'url("http://example.com/font.woff?v=1.2&format=woff")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
            expect(result).toContain('v%3D');
            expect(result).toContain('format%3Dwoff');
        });
    });

    describe('정상 동작 검증', () => {
        test('변환된 url()은 역따옴표로 감싸짐', () => {
            // Arrange
            const cssText = 'url("http://example.com/icon.svg")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain("url('");
        });

        test('URL은 인코딩되어야 함', () => {
            // Arrange
            const cssText = 'url("http://example.com/icon.svg")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('http%3A%2F%2F');
        });

        test('여러 번 호출 시 매번 변환', () => {
            // Arrange
            const css1 = 'url("http://example1.com/icon.svg")';
            const css2 = 'url("http://example2.com/font.woff")';
            
            // Act
            const result1 = PdfService.convertCssUrlsToProxyAsset(css1);
            const result2 = PdfService.convertCssUrlsToProxyAsset(css2);

            // Assert
            expect(result1).toContain('example1');
            expect(result2).toContain('example2');
            expect(result1).not.toContain('example2');
        });
    });

    describe('정규식 패턴 검증', () => {
        test('대소문자 구분 없음 (URL()도 변환)', () => {
            // Arrange
            const cssText = 'URL("http://example.com/icon.svg")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
        });

        test('Url() 형식도 변환', () => {
            // Arrange
            const cssText = 'Url("http://example.com/icon.svg")';
            
            // Act
            const result = PdfService.convertCssUrlsToProxyAsset(cssText);

            // Assert
            expect(result).toContain('/proxy-asset?url=');
        });
    });
});
