const genericPool = require('generic-pool');
const puppeteer = require('puppeteer');
const logger = require('./logger');

const factory = {
    create: async function() {
        logger.info('Creating new Puppeteer browser instance for pool.');
        return await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-extensions',
                // ✅ 메모리 최적화 플래그
                '--memory-pressure-off',           // 메모리 압박 신호 비활성화
                '--renderer-process-limit=1',      // 렌더러 프로세스 1개로 제한
                '--use-largepages',                // 큰 페이지 메모리 할당 사용
                '--v8-code-cache-strategy=eager',  // V8 코드 캐시 적극 활용
                '--disable-breakpad',              // 크래시 리포터 비활성화
                '--disable-crash-reporter',        // 크래시 리포트 전송 비활성화
                '--disable-metrics',               // 메트릭 수집 비활성화
            ],
            timeout: 30000  // ✅ 30초 타임아웃 설정
        });
    },
    destroy: async function(browser) {
        logger.info('Destroying Puppeteer browser instance.');
        try {
            await browser.close();
        } catch (err) {
            logger.warn(`Error closing browser: ${err.message}`);
        }
    },
    // ✅ 새 메서드: 풀에서 빌릴 때 브라우저 상태 검증
    validate: async function(browser) {
        try {
            const version = await browser.version();
            return !!version;
        } catch (err) {
            logger.warn(`Browser validation failed: ${err.message}`);
            return false;
        }
    }
};

const opts = {
    max: Math.min(parseInt(process.env.WORKER_CONCURRENCY || '2', 10), 4), // ✅ 최대 4개 (메모리 제한)
    min: 1,
    evictionRunIntervalMillis: 30000,   // ✅ 30초마다 유휴 브라우저 정리
    idleTimeoutMillis: 60000,           // ✅ 60초 미사용 브라우저 자동 종료
    testOnBorrow: true,                 // ✅ 빌릴 때 상태 검증
    testOnReturn: true,                 // ✅ 반환할 때 상태 검증
    numTestsPerEvictionRun: 3,          // 정기 검사 시 3개 브라우저 테스트
    softIdleTimeoutMillis: 30000        // 부드러운 유휴 타임아웃
};

const browserPool = genericPool.createPool(factory, opts);

browserPool.on('factoryCreateError', (err) => {
    logger.error(`Browser pool creation error: ${err.message}`);
});

browserPool.on('factoryDestroyError', (err) => {
    logger.error(`Browser pool destruction error: ${err.message}`);
});

module.exports = browserPool;