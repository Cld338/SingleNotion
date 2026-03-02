const { Readable } = require('stream');
const logger = require('../utils/logger');
const browserPool = require('../utils/browserPool'); // 신규 추가된 풀 모듈

class PdfService {
    async generatePdf(url, options) {
        // 1. 풀에서 브라우저 인스턴스 대여
        const browser = await browserPool.acquire();
        let page = null;

        try {
            page = await browser.newPage();

            // [보안 패치] 요청 가로채기 활성화
            await page.setRequestInterception(true);

            page.on('request', request => {
                const reqUrl = request.url();
                reqUrl.replace("?source=copy_link", "");
                const isMainFrame = request.isNavigationRequest() && request.frame() === page.mainFrame();

                // 1. 프로토콜 체크
                if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://') && !reqUrl.startsWith('data:')) {
                    logger.warn(`Blocked unsafe protocol: ${reqUrl}`);
                    return request.abort();
                }

                // 2. 메인 페이지 이동 시 노션 도메인 여부 검증
                if (isMainFrame) {
                    const isNotionDomain = /^https?:\/\/([a-zA-Z0-9-]+\.)?(notion\.so|notion\.site)/.test(reqUrl);
                    if (!isNotionDomain) {
                        logger.warn(`Blocked unauthorized navigation to: ${reqUrl}`);
                        return request.abort();
                    }
                }

                // 3. 로컬 호스트 및 사설 IP 대역 차단 (SSRF 방지)
                const isLocal = /^(http|https):\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1)/.test(reqUrl);

                if (isLocal) {
                    logger.warn(`Blocked local network access: ${reqUrl}`);
                    return request.abort();
                }

                request.continue();
            });

            page.setDefaultNavigationTimeout(120000);
            page.setDefaultTimeout(120000);

            const { width = '1080px', includeBanner, includeTitle, includeTags } = options;

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            await page.setViewport({ width: parseInt(width), height: 100 });

            await page.goto(url, { waitUntil: 'networkidle0' });

            // 노션 핵심 콘텐츠 래퍼 엘리먼트 렌더링 대기
            try {
                await page.waitForSelector('.notion-page-content', { visible: true, timeout: 10000 });
            } catch (e) {
                logger.warn('Notion page content selector not found or delayed.');
            }

            // DOM 안정화 검증 (MutationObserver 활용)
            await page.evaluate(() => {
                return new Promise((resolve) => {
                    let timeout;
                    const observer = new MutationObserver(() => {
                        clearTimeout(timeout);
                        timeout = setTimeout(() => {
                            observer.disconnect();
                            resolve();
                        }, 1500);
                    });
                    
                    observer.observe(document.body, { childList: true, subtree: true, attributes: true });
                    
                    timeout = setTimeout(() => {
                        observer.disconnect();
                        resolve();
                    }, 1500);

                    setTimeout(() => {
                        observer.disconnect();
                        resolve();
                    }, 10000);
                });
            });

            // CSS 강제 주입
            await page.addStyleTag({
                content: `
                    .notion-code-block, .notion-code-block span {
                        white-space: pre-wrap !important;
                        font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
                    }
                `
            });

            let hideStyles = '';
            
            if (!includeTitle) {
                hideStyles += `h1, .notion-page-block:has(h1) { display: none !important; }`;
            }

            if (!includeBanner) {
                hideStyles += `.notion-page-cover-wrapper, .notion-record-icon, .notion-page-controls { display: none !important; }`;
            }

            if (!includeTags) {
                hideStyles += `[aria-label="페이지 속성"], .layout-content-with-divider:has([role="table"]) { display: none !important; }`;
            }

            if (hideStyles.trim().length > 0) {
                await page.addStyleTag({ content: hideStyles });
            }

            await page.evaluate(() => {
                document.querySelectorAll('div.notion-selectable.notion-table_of_contents-block a').forEach(link => {
                    const href = link.getAttribute('href');
                    if (href && href.includes('#')) {
                        link.setAttribute('href', href.substring(href.indexOf('#')));
                        link.removeAttribute('role');
                    }
                });

                const spans = document.querySelectorAll('span[data-token-index="0"]');
                spans.forEach(span => {
                    let text = span.textContent;
                    if (text.includes(" ")) text = text.replace(/ /g, '\u00A0');
                    if (text.includes("\t")) text = text.replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0');

                    if (text.includes("\n")) {
                        const lines = text.split("\n");
                        span.textContent = lines[0];
                        let currentSpan = span;
                        lines.slice(1).forEach(line => {
                            const br = document.createElement("br");
                            currentSpan.after(br);
                            const newSpan = span.cloneNode(false);
                            newSpan.textContent = line;
                            br.after(newSpan);
                            currentSpan = newSpan;
                        });
                    } else {
                        span.textContent = text;
                    }
                });
            }, { includeBanner, includeTitle, includeTags });

            // 이미지 로딩 확실히 대기
            await page.evaluate(async () => {
                document.querySelectorAll('img[loading="lazy"]').forEach(img => {
                    img.removeAttribute('loading');
                });

                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= scrollHeight) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 50); 
                });

                const images = Array.from(document.querySelectorAll('img'));
                await Promise.all(images.map(img => {
                    if (img.complete) return Promise.resolve();
                    return new Promise((resolve) => {
                        img.addEventListener('load', resolve, { once: true });
                        img.addEventListener('error', resolve, { once: true });
                    });
                }));

                window.scrollTo(0, 0);
            });

            const bodyHeight = await page.evaluate(() => {
                const target = document.querySelector('#main > div > div > div.whenContentEditable > div');
                return target ? target.getBoundingClientRect().height : document.body.scrollHeight;
            });

            await page.setViewport({ width: parseInt(width), height: Math.ceil(bodyHeight) + 100 });

            const pdfWebStream = await page.createPDFStream({
                width: width,
                height: `${Math.ceil(bodyHeight) + 100}px`,
                printBackground: true,
                displayHeaderFooter: false,
                margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
                pageRanges: '1',
                tagged: true,
                outline: true,
            });

            const nodeStream = Readable.fromWeb(pdfWebStream);

            // 2. 스트림 종료 시 페이지 닫기 및 인스턴스 반납
            nodeStream.on('close', async () => {
                try {
                    if (page) await page.close();
                } catch (err) {
                    logger.error(`Page close error: ${err.message}`);
                } finally {
                    await browserPool.release(browser);
                    logger.info('Browser instance released to pool after stream closed.');
                }
            });

            return nodeStream;

        } catch (error) {
            logger.error(`PDF Generation failed: ${error.message}`);
            // 3. 에러 발생 시 리소스 정리 및 반납
            try {
                if (page) await page.close();
            } catch (closeError) {
                logger.error(`Page close error during exception handling: ${closeError.message}`);
            } finally {
                await browserPool.release(browser);
            }
            throw error;
        }
    }

    async close() {
        logger.info('Draining and clearing browser pool...');
        await browserPool.drain();
        await browserPool.clear();
    }
}

module.exports = new PdfService();