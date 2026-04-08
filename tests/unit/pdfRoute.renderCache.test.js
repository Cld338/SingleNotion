/**
 * PDF Route - /render-cache Endpoint Test
 * 
 * 테스트 대상: GET /render-cache/:sessionId
 * 기능: 캐시된 세션 HTML을 Puppeteer에서 로드 가능한 형태로 반환
 * 
 * 테스트 범위:
 *   - sessionId 유효성 검사
 *   - Redis에서 캐시된 세션 데이터 검색
 *   - HTML 경로 변환 (상대 → 절대)
 *   - URL을 /proxy-asset으로 변환
 *   - <base href> 태그 주입
 *   - 캐시 만료/미스 처리
 *   - HTML 콘텐츠 타입으로 반환
 */

const request = require('supertest');
const express = require('express');
const pdfRoutes = require('../../src/routes/pdf');
const { connection } = require('../../src/config/queue');
const URLPathConverter = require('../../src/utils/urlPathConverter');
const logger = require('../../src/utils/logger');

jest.mock('../../src/config/queue');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/urlPathConverter');

const app = express();
app.use(express.json());
app.use(pdfRoutes);

describe('GET /render-cache/:sessionId', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        URLPathConverter.convertAll = jest.fn((html) => html);
        URLPathConverter.convertAllToProxyAsset = jest.fn((html) => html);
    });

    describe('sessionId 유효성 검사', () => {
        test('유효한 sessionId로 요청 시 200 반환', async () => {
            const sessionId = 'a'.repeat(24);
            const sessionData = {
                html: '<html><body>Test</body></html>',
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(sessionData));

            const response = await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(response.status).toBe(200);
            expect(response.type).toBe('text/html');
        });

        test('잘못된 sessionId 형식으로 요청 시 400 반환', async () => {
            const response = await request(app)
                .get('/render-cache/invalid-id');

            expect(response.status).toBe(400);
            expect(response.text).toContain('Invalid sessionId format');
        });

        test('너무 짧은 sessionId로 요청 시 400 반환', async () => {
            const response = await request(app)
                .get('/render-cache/abc');

            expect(response.status).toBe(400);
        });

        test('16진수 아닌 문자 포함 시 400 반환', async () => {
            const response = await request(app)
                .get('/render-cache/zzzzzzzzzzzzzzzzzzzzzzzz');

            expect(response.status).toBe(400);
        });
    });

    describe('캐시된 세션 데이터 처리', () => {
        test('존재하는 세션 데이터를 HTML로 반환', async () => {
            const sessionId = 'b'.repeat(24);
            const htmlContent = '<html><body><h1>Private Page</h1></body></html>';
            const sessionData = {
                html: htmlContent,
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/private', baseUrl: 'https://notion.so' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(sessionData));

            const response = await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(response.status).toBe(200);
            expect(response.text).toContain('Private Page');
        });

        test('회기 되지 않는 sessionId로 요청 시 404 반환', async () => {
            const sessionId = 'c'.repeat(24);
            connection.get = jest.fn().mockResolvedValue(null);

            const response = await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(response.status).toBe(404);
            expect(response.text).toContain('Session data not found or expired');
        });

        test('Redis에서 데이터 조회 시 로깅', async () => {
            const sessionId = 'd'.repeat(24);
            const sessionData = {
                html: '<html><body>Test</body></html>',
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(sessionData));

            await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(logger.info).toHaveBeenCalledWith(
                expect.stringContaining('Retrieved session')
            );
        });
    });

    describe('HTML 경로 변환', () => {
        test('URLPathConverter.convertAll 호출', async () => {
            const sessionId = 'e'.repeat(24);
            const htmlContent = '<html><body><img src="./image.png"></body></html>';
            const sessionData = {
                html: htmlContent,
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so/test' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(sessionData));
            URLPathConverter.convertAll = jest.fn().mockReturnValue(htmlContent);

            await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(URLPathConverter.convertAll).toHaveBeenCalledWith(
                htmlContent,
                'https://notion.so/test'
            );
        });

        test('URLPathConverter.convertAllToProxyAsset 호출', async () => {
            const sessionId = 'f'.repeat(24);
            const htmlContent = '<html><body><img src="https://notion.so/image.png"></body></html>';
            const sessionData = {
                html: htmlContent,
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so/test' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(sessionData));
            URLPathConverter.convertAllToProxyAsset = jest.fn().mockReturnValue(htmlContent);

            await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(URLPathConverter.convertAllToProxyAsset).toHaveBeenCalledWith(
                htmlContent,
                'https://notion.so/test'
            );
        });
    });

    describe('<base href> 태그 주입', () => {
        test('<head> 태그가 있으면 start에 <base> 태그 삽입', async () => {
            const sessionId = 'g'.repeat(24);
            const htmlContent = '<html><head></head><body>Content</body></html>';
            const sessionData = {
                html: htmlContent,
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so/test' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(sessionData));
            URLPathConverter.convertAll = jest.fn().mockReturnValue(htmlContent);
            URLPathConverter.convertAllToProxyAsset = jest.fn().mockReturnValue(htmlContent);

            const response = await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(response.text).toContain('<base href="https://notion.so/test">');
        });

        test('<head> 태그가 없으면 생성하고 <base> 태그 삽입', async () => {
            const sessionId = 'h'.repeat(24);
            const htmlContent = '<html><body>Content</body></html>';
            const sessionData = {
                html: htmlContent,
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so/test' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(sessionData));
            URLPathConverter.convertAll = jest.fn().mockReturnValue(htmlContent);
            URLPathConverter.convertAllToProxyAsset = jest.fn().mockReturnValue(htmlContent);

            const response = await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(response.text).toContain('<head>');
            expect(response.text).toContain('<base href="https://notion.so/test">');
        });

        test('baseUrl이 없으면 <base> 태그 주입 안함', async () => {
            const sessionId = 'i'.repeat(24);
            const htmlContent = '<html><head></head><body>Content</body></html>';
            const sessionData = {
                html: htmlContent,
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test' } // baseUrl 없음
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(sessionData));
            URLPathConverter.convertAll = jest.fn().mockReturnValue(htmlContent);
            URLPathConverter.convertAllToProxyAsset = jest.fn().mockReturnValue(htmlContent);

            const response = await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(response.text).not.toContain('<base href');
        });
    });

    describe('응답 헤더', () => {
        test('Content-Type이 text/html로 설정', async () => {
            const sessionId = 'j'.repeat(24);
            const sessionData = {
                html: '<html><body>Test</body></html>',
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(sessionData));

            const response = await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(response.type).toBe('text/html');
        });

        test('Cache-Control이 no-cache로 설정', async () => {
            const sessionId = 'k'.repeat(24);
            const sessionData = {
                html: '<html><body>Test</body></html>',
                detectedWidth: 1080,
                resources: { cssLinks: [], inlineStyles: [] },
                metadata: { url: 'https://notion.so/test', baseUrl: 'https://notion.so' }
            };

            connection.get = jest.fn().mockResolvedValue(JSON.stringify(sessionData));

            const response = await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(response.headers['cache-control']).toContain('no-cache');
        });
    });

    describe('에러 처리', () => {
        test('세션 데이터 파싱 실패 시 500 반환', async () => {
            const sessionId = 'l'.repeat(24);
            connection.get = jest.fn().mockResolvedValue('invalid json {');

            const response = await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(response.status).toBe(500);
            expect(response.text).toContain('Failed to render');
        });

        test('Redis 연결 오류 시 500 반환', async () => {
            const sessionId = 'm'.repeat(24);
            connection.get = jest.fn().mockRejectedValue(new Error('Redis connection failed'));

            const response = await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(response.status).toBe(500);
        });

        test('에러 발생 시 로깅', async () => {
            const sessionId = 'n'.repeat(24);
            connection.get = jest.fn().mockRejectedValue(new Error('Test error'));

            await request(app)
                .get(`/render-cache/${sessionId}`);

            expect(logger.error).toHaveBeenCalled();
        });
    });
});
