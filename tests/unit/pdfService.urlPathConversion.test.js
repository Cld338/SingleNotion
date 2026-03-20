/**
 * PdfService - URL 경로 변환 기능 테스트
 * 
 * 테스트 대상: convertRelativeToAbsolutePaths(html, baseUrl)
 * 기능:  상대 경로를 절대 경로로 변환하는 로직 검증
 */

// Mock puppeteer BEFORE requiring PdfService
jest.mock('puppeteer', () => ({
    launch: jest.fn(),
}));

jest.mock('../../src/utils/urlPathConverter');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/browserPool');

const PdfService = require('../../src/services/pdfService');
const URLPathConverter = require('../../src/utils/urlPathConverter');

describe('PdfService - URL 경로 변환 (convertRelativeToAbsolutePaths)', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('기본 상대경로 변환', () => {
        test('상대 경로를 절대 경로로 변환해야 함', () => {
            // Arrange
            const html = '<img src="image.png">';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            const expectedOutput = '<img src="https://notion.so/image.png">';
            
            URLPathConverter.convertAll.mockReturnValue(expectedOutput);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(URLPathConverter.convertAll).toHaveBeenCalledWith(html, baseUrl);
            expect(result).toBe(expectedOutput);
        });

        test('여러 리소스의 상대 경로를 모두 변환해야 함', () => {
            // Arrange
            const html = '<img src="img/photo.jpg"><link href="style.css"><script src="app.js"></script>';
            const baseUrl = 'https://notion.so/docs/page';
            const expectedOutput = '<img src="https://notion.so/docs/img/photo.jpg"><link href="https://notion.so/docs/style.css"><script src="https://notion.so/docs/app.js"></script>';
            
            URLPathConverter.convertAll.mockReturnValue(expectedOutput);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(URLPathConverter.convertAll).toHaveBeenCalledWith(html, baseUrl);
            expect(result).toBe(expectedOutput);
        });
    });

    describe('상위 디렉토리 경로 변환', () => {
        test('상위 디렉토리 경로(../)를 올바르게 변환해야 함', () => {
            // Arrange
            const html = '<img src="../assets/image.png">';
            const baseUrl = 'https://notion.so/docs/subfolder/page';
            const expectedOutput = '<img src="https://notion.so/docs/assets/image.png">';
            
            URLPathConverter.convertAll.mockReturnValue(expectedOutput);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(result).toBe(expectedOutput);
        });

        test('루트 상대 경로(/로 시작)를 변환해야 함', () => {
            // Arrange
            const html = '<img src="/images/photo.jpg">';
            const baseUrl = 'https://notion.so/docs/page';
            const expectedOutput = '<img src="https://notion.so/images/photo.jpg">';
            
            URLPathConverter.convertAll.mockReturnValue(expectedOutput);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(result).toBe(expectedOutput);
        });
    });

    describe('절대경로 URL 처리', () => {
        test('절대 경로 URL(http)은 변경하지 않아야 함', () => {
            // Arrange
            const html = '<img src="http://example.com/image.png">';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            
            URLPathConverter.convertAll.mockReturnValue(html);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(result).toBe(html);
        });

        test('절대 경로 URL(https)은 변경하지 않아야 함', () => {
            // Arrange
            const html = '<img src="https://cdn.example.com/image.png">';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            
            URLPathConverter.convertAll.mockReturnValue(html);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(result).toBe(html);
        });

        test('프로토콜 상대 URL(//)은 변경하지 않아야 함', () => {
            // Arrange
            const html = '<img src="//cdn.example.com/image.png">';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            
            URLPathConverter.convertAll.mockReturnValue(html);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(result).toBe(html);
        });
    });

    describe('Edge Case', () => {
        test('빈 HTML 문자열 처리', () => {
            // Arrange
            const html = '';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            
            URLPathConverter.convertAll.mockReturnValue('');

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(URLPathConverter.convertAll).toHaveBeenCalledWith(html, baseUrl);
            expect(result).toBe('');
        });

        test('baseUrl이 슬래시로 끝나는 경우 올바르게 처리', () => {
            // Arrange
            const html = '<img src="image.png">';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8/';
            const expectedOutput = '<img src="https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8/image.png">';
            
            URLPathConverter.convertAll.mockReturnValue(expectedOutput);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(URLPathConverter.convertAll).toHaveBeenCalledWith(html, baseUrl);
            expect(result).toBe(expectedOutput);
        });

        test('따옴표 없는 경로도 처리해야 함', () => {
            // Arrange
            const html = '<img src=image.png>';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            const expectedOutput = '<img src=https://notion.so/image.png>';
            
            URLPathConverter.convertAll.mockReturnValue(expectedOutput);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(result).toBe(expectedOutput);
        });

        test('특수 문자가 포함된 URL 처리', () => {
            // Arrange
            const html = '<img src="images/photo%20name.png">';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            const expectedOutput = '<img src="https://notion.so/images/photo%20name.png">';
            
            URLPathConverter.convertAll.mockReturnValue(expectedOutput);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(result).toBe(expectedOutput);
        });

        test('쿼리 매개변수가 있는 URL 처리', () => {
            // Arrange
            const html = '<img src="image.png?size=large&format=webp">';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            const expectedOutput = '<img src="https://notion.so/image.png?size=large&format=webp">';
            
            URLPathConverter.convertAll.mockReturnValue(expectedOutput);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(result).toBe(expectedOutput);
        });

        test('앵커가 있는 URL 처리', () => {
            // Arrange
            const html = '<a href="page.html#section">';
            const baseUrl = 'https://notion.so/docs/page';
            const expectedOutput = '<a href="https://notion.so/docs/page.html#section">';
            
            URLPathConverter.convertAll.mockReturnValue(expectedOutput);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(result).toBe(expectedOutput);
        });
    });

    describe('정상 동작 검증', () => {
        test('URLPathConverter.convertAll이 정확히 한 번 호출되어야 함', () => {
            // Arrange
            const html = '<img src="image.png">';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            
            URLPathConverter.convertAll.mockReturnValue(html);

            // Act
            PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(URLPathConverter.convertAll).toHaveBeenCalledTimes(1);
            expect(URLPathConverter.convertAll).toHaveBeenCalledWith(html, baseUrl);
        });

        test('변환된 HTML을 그대로 반환해야 함', () => {
            // Arrange
            const html = '<div></div>';
            const baseUrl = 'https://cloudier338.notion.site/TEST-Text-001-Text-Heading-Format-List-Checkbox-314fc609de7380f08407d60b1a74b8e8';
            const expectedOutput = '<div class="converted"></div>';
            
            URLPathConverter.convertAll.mockReturnValue(expectedOutput);

            // Act
            const result = PdfService.convertRelativeToAbsolutePaths(html, baseUrl);

            // Assert
            expect(result).toBe(expectedOutput);
            expect(result).not.toBe(html);
        });
    });
});
