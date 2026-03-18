const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const fs = require('fs');

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

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../public/views'));

app.use(express.static(path.join(__dirname, '../public'), {
    index: false,
    setHeaders: (res, filePath, stat) => {
        // WOFF2 폰트 파일의 올바른 Content-Type 설정
        if (filePath.endsWith('.woff2')) {
            res.set('Content-Type', 'application/font-woff2');
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
            res.set('Access-Control-Allow-Origin', '*');
        }
        if (filePath.match(/\.(png|jpg|jpeg|gif|webp)$/i)) {
            res.set('Cross-Origin-Resource-Policy', 'cross-origin');
        }
    }
    
}));

console.log(path.join(__dirname, '../public'));

// WOFF2 폰트 파일의 Content-Type 설정
app.use('/katex/fonts', express.static(path.join(__dirname, '../public/katex/fonts'), {
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.woff2')) {
            res.set('Content-Type', 'application/font-woff2');
            res.set('Cache-Control', 'public, max-age=31536000, immutable');
        }
    }
}));


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
    res.render('index');
});

// 영문 메인 페이지
app.get('/en', (req, res) => {
    res.render('index_en');
});

app.use((req, res, next) => {
    if (req.path.endsWith('.html') && req.path !== '/index.html') {
        const newPath = req.path.slice(0, -5);
        return res.redirect(301, newPath + (req.url.slice(req.path.length)));
    }
    next();
});


// 2. 확장자 없는 라우트 처리
app.get('/:page', (req, res, next) => {
    const page = req.params.page;
    
    // 정적 파일(이미지, CSS 등) 요청은 무시하고 다음 미들웨어로 넘김
    if (page.includes('.')) return next();

    res.render(page, (err, html) => {
        if (err) {
            next(); // 파일을 찾지 못한 경우 404로 이동
        } else {
            res.send(html);
        }
    });
});

app.get('/blog/:post', (req, res, next) => {
    const post = req.params.post;
    
    const viewMap = {
        'notetaking': 'blog/notetaking',
        'tools-comparison': 'blog/tools-comparison',
        'visual-regression-test': 'blog/visual-regression-test'
    };
    
    const viewName = viewMap[post] || `blog/${post}`;

    res.render(viewName, (err, html) => {
        if (err) {
            return next();
        }
        res.send(html);
    });
});

// sitemap.xml 라우터 추가 (파일 수정일 동적 반영)
app.get('/sitemap.xml', (req, res) => {
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    // 파일의 마지막 수정 시간(mtime)을 가져오는 유틸리티 함수
    const getLastMod = (fileName) => {
        try {
            const filePath = path.join(__dirname, '../public/views', fileName);
            const stats = fs.statSync(filePath);
            return stats.mtime.toISOString().split('T')[0];
        } catch (err) {
            // 파일을 찾지 못할 경우 기본값으로 오늘 날짜 반환
            return new Date().toISOString().split('T')[0];
        }
    };

    const allowedPages = [
        { url: '/', changefreq: 'weekly', priority: '1.0', lastmod: getLastMod('index.ejs') },
        { url: '/en', changefreq: 'weekly', priority: '1.0', lastmod: getLastMod('index.ejs') },
        { url: '/how-to-use', changefreq: 'monthly', priority: '0.7', lastmod: getLastMod('how-to-use.ejs') },
        { url: '/blog', changefreq: 'weekly', priority: '0.9', lastmod: getLastMod('blog.ejs') },
        { url: '/blog/tools-comparison', changefreq: 'weekly', priority: '0.8', lastmod: getLastMod('blog/tools-comparison.ejs') },
        { url: '/blog/notetaking', changefreq: 'weekly', priority: '0.8', lastmod: getLastMod('blog/notetaking.ejs') },
        { url: '/blog/visual-regression-test', changefreq: 'weekly', priority: '0.8', lastmod: getLastMod('blog/visual-regression-test.ejs') },
        { url: '/faq', changefreq: 'weekly', priority: '0.8', lastmod: getLastMod('faq.ejs') }
    ];

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        ${allowedPages.map(page => `
        <url>
            <loc>${baseUrl}${page.url}</loc>
            <lastmod>${page.lastmod}</lastmod>
            <changefreq>${page.changefreq}</changefreq>
            <priority>${page.priority}</priority>
        </url>`).join('')}
        </urlset>`;
        
    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
});

app.get('/proxy-asset', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).send('URL이 필요합니다.');

    try {
        const parsedUrl = new URL(targetUrl);
        
        // 1. 도메인 화이트리스트 검증 
        // - 자신의 서버 (notion-pdf.cld338.me)
        // - Notion 공식 도메인 (notion.so, notion.site)
        const isAllowedDomain = /^https?:\/\/([a-zA-Z0-9-]+\.)?(notion-pdf\.cld338\.me|notion\.so|notion\.site)/.test(targetUrl);
        
        if (!isAllowedDomain) {
            logger.warn(`허용되지 않은 도메인 접근 시도 차단: ${targetUrl}`);
            return res.status(403).send('허용되지 않은 대상입니다.');
        }

        // 2. 내부 네트워크(Localhost) 접근 차단 (SSRF 방지)
        const isLocal = /^(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1)/.test(parsedUrl.hostname);
        if (isLocal) {
            return res.status(403).send('내부 네트워크 접근은 금지되어 있습니다.');
        }

        const response = await axios.get(targetUrl, {
            responseType: 'arraybuffer',
            timeout: 5000, // 무한 대기 방지
            headers: {
                'User-Agent': 'Mozilla/5.0 ...'
            }
        });

        // Content-Type 설정: CSS 파일의 경우 명시적으로 text/css 설정
        let contentType = response.headers['content-type'];
        if (targetUrl.endsWith('.css') && !contentType) {
            contentType = 'text/css; charset=utf-8';
        } else if (targetUrl.endsWith('.css') && contentType === 'text/html') {
            // 서버가 CSS를 HTML로 반환하는 경우 교정
            contentType = 'text/css; charset=utf-8';
        }

        res.set('Content-Type', contentType || 'application/octet-stream');
        res.set('Access-Control-Allow-Origin', '*'); 
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        res.send(response.data);
        
    } catch (err) {
        logger.error(`Proxy Error: ${err.message}`);
        res.status(500).send('에셋을 불러오지 못했습니다.');
    }
});

// 파일 정리 스케줄러 실행
startCleanupJob();

const server = app.listen(PORT, () => {
    logger.info(`Server running on http://localhost:${PORT}`);
});

process.on('SIGTERM', () => server.close());
process.on('SIGINT', () => server.close());

module.exports = app;