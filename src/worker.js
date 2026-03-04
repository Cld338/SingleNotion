const { Worker } = require('bullmq');
const { performance } = require('perf_hooks');
const { connection } = require('./config/queue'); // 분리된 공통 설정 활용
const pdfService = require('./services/pdfService');
const storage = require('./utils/storage');
const logger = require('./utils/logger');

// Worker 인스턴스 생성 및 안정화 설정
const worker = new Worker('pdf-conversion', async (job) => {
    const { targetUrl, options } = job.data;
    logger.info(`[Job ${job.id}] Start processing: ${targetUrl} (Attempt: ${job.attemptsMade + 1})`);

    const startTime = performance.now(); // 변환 시작 시간 기록

    try {
        const pdfStream = await pdfService.generatePdf(targetUrl, options);
        const fileName = `notion-${job.id}-${Date.now()}.pdf`;
        const downloadUrl = await storage.saveStream(fileName, pdfStream);

        const endTime = performance.now(); // 변환 종료 시간 기록
        const durationMs = endTime - startTime; // 소요 시간(밀리초) 계산
        const durationSec = (durationMs / 1000).toFixed(2); // 초 단위로 변환 및 소수점 둘째 자리까지 표시

        logger.info(`[Job ${job.id}] Successfully completed in ${durationSec} seconds`);
        
        // 클라이언트(SSE) 측으로 소요 시간 데이터를 함께 전달하기 위해 반환값에 추가
        return { downloadUrl, fileName, duration: durationSec };

    } catch (error) {
        logger.error(`[Job ${job.id}] Failed attempt ${job.attemptsMade + 1}: ${error.message}`);
        throw error;
    }
}, {
    connection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '2'),
    lockDuration: 60000, 
});

const gracefulShutdown = async (signal) => {
    logger.info(`Received ${signal}. Closing worker...`);
    await worker.close();
    // connection.quit()은 queue.js를 사용하는 다른 프로세스에 영향을 줄 수 있으므로 
    // 워커 단독 종료 시에는 worker.close()만 수행하여 안전하게 종료합니다.
    await pdfService.close(); 
    process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// DLQ(Dead Letter Queue) 모니터링: 최종 실패한 작업 기록
worker.on('failed', (job, err) => {
    logger.error(`[DLQ] Job ${job?.id} failed fundamentally after all retries: ${err.message}`);
});