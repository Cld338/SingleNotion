const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const pdfRoutes = require('./routes/pdf');
const startCleanupJob = require('./jobs/cleanup');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;



app.set('trust proxy', 1);

app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
}));
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use(express.static(path.join(__dirname, '../public')));

console.log(path.join(__dirname, '../public'));


app.use('/downloads', express.static(path.join(__dirname, '../public/downloads'), {
    setHeaders: (res, path, stat) => {
        res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    }
}));

app.use('/docs', express.static(path.join(__dirname, '../docs/.vitepress/dist')));

// 모니터링 라우터 등록
app.use(process.env.BULL_BOARD_PATH || '/admin/queues', adminRoutes);

// 라우터 등록
app.use('/', pdfRoutes);

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public', 'index.html'));
});

// sitemap.xml 라우터 추가
app.get('/sitemap.xml', (req, res) => {
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    // 허용된 페이지 목록 (우선 메인 페이지 포함)
    const allowedPages = [
        { url: '/', changefreq: 'daily', priority: '1.0' },
        // 추가 페이지 예시: { url: '/docs', changefreq: 'weekly', priority: '0.8' }
    ];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${allowedPages.map(page => `
        <url>
            <loc>${baseUrl}${page.url}</loc>
            <lastmod>2026-03-08</lastmod>
            <changefreq>${page.changefreq}</changefreq>
            <priority>${page.priority}</priority>
        </url>`).join('')}
        </urlset>`;
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
});

// 파일 정리 스케줄러 실행
startCleanupJob();

const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());

module.exports = app;