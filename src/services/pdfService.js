const { Readable } = require('stream');
const logger = require('../utils/logger');
const browserPool = require('../utils/browserPool');

class PdfService {
    async generatePdf(url, options) {
        const browser = await browserPool.acquire();
        let page = null;

        try {
            page = await browser.newPage();

            // 보안 및 SSRF 방지 로직 (기존 유지)
            await page.setRequestInterception(true);
            page.on('request', request => {
                const reqUrl = request.url().split('?')[0];
                const isMainFrame = request.isNavigationRequest() && request.frame() === page.mainFrame();

                if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://') && !reqUrl.startsWith('data:')) {
                    return request.abort();
                }
                if (isMainFrame) {
                    const isNotionDomain = /^https?:\/\/([a-zA-Z0-9-]+\.)?(notion\.so|notion\.site)/.test(reqUrl);
                    if (!isNotionDomain) return request.abort();
                }
                const isLocal = /^(http|https):\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1)/.test(reqUrl);
                if (isLocal) return request.abort();

                request.continue();
            });

            page.setDefaultNavigationTimeout(120000);
            const { width = '1080', includeBanner, includeTitle, includeTags, includeDiscussion } = options;

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            // 초기 뷰포트 설정
            await page.setViewport({ width: parseInt(width), height: 1000 });

            await page.goto(url, { waitUntil: 'networkidle2' });

            // [Extension 로직 이식] 레이아웃 고정 및 스타일 최적화
            const dimensions = await page.evaluate(async (opts) => {
                const { includeTitle, includeBanner, includeTags, includeDiscussion, width } = opts;

                // 1. 레이지 로딩 해제 (스크롤)
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 400;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= scrollHeight + 200) {
                            clearInterval(timer);
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, 50);
                });

                // 2. 이미지 및 레이아웃 요소 크기 고정 (Freeze)
                let freezeCSS = "";
                const layoutElements = document.querySelectorAll('.notion-image-block, .notion-asset-wrapper, div[data-block-id][style*="width"]');
                layoutElements.forEach((el, index) => {
                    const id = `sn-freeze-${index}`;
                    el.dataset.snFreeze = id;
                    const rect = el.getBoundingClientRect();
                    freezeCSS += `
                        [data-sn-freeze="${id}"] {
                            width: ${rect.width}px !important;
                            max-width: ${rect.width}px !important;
                            min-width: ${rect.width}px !important;
                            ${(el.classList.contains('notion-image-block') || el.classList.contains('notion-asset-wrapper')) ? `height: ${rect.height}px !important;` : ''}
                        }\n`;
                });

                // 3. Extension 기반 핵심 스타일 정의
                let dynamicStyles = `
                    .notion-page-content {
                        width: ${width}px !important;
                        max-width: ${width}px !important;
                        min-width: ${width}px !important;
                    }
                    .notion-sidebar-container, .notion-topbar, .notion-topbar-mobile,
                    .notion-help-button, #skip-to-content, header, .autolayout-fill-width { display: none !important; }
                    
                    .notion-scroller { overflow: hidden !important; }
                    .notion-selectable-container > .notion-scroller { 
                        overflow: visible !important; 
                        height: auto !important;
                    }
                    .notion-app-inner, .notion-cursor-listener { height: auto !important; }
                    .layout { padding-bottom: 0px !important; --margin-width: 0px !important; }
                    .layout-content { padding-left: 100px !important; padding-right: 100px !important; }
                    
                    .notion-code-block, .notion-code-block span {
                        white-space: pre-wrap !important;
                        font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
                    }
                    ::-webkit-scrollbar { display: none !important; }
                `;

                if (!includeTitle) dynamicStyles += `h1, .notion-page-block:has(h1) { display: none !important; }`;
                if (!includeBanner) dynamicStyles += `.notion-page-cover-wrapper, .notion-record-icon, .notion-page-controls { display: none !important; }`;
                if (!includeTags) dynamicStyles += `[aria-label="페이지 속성"], [aria-label="Page properties"] { display: none !important; }`;
                if (!includeDiscussion) dynamicStyles += `.layout-content-with-divider:has(.notion-page-view-discussion) { display: none !important;}`;

                const styleTag = document.createElement('style');
                styleTag.innerHTML = dynamicStyles + freezeCSS;
                document.head.appendChild(styleTag);

                // 4. 텍스트 노드 공백 처리 (Extension 버전 동기화)
                const spans = document.querySelectorAll('span[data-token-index="0"]');
                spans.forEach(span => {
                    let text = span.textContent;
                    if (text.includes(" ")) text = text.replace(/ /g, '\u00A0');
                    if (text.includes("\t")) text = text.replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0'); // 8칸 동기화
                    span.textContent = text;
                });

                // 5. 렌더링 확정 대기
                window.dispatchEvent(new Event('resize'));
                await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 3000)));

                // 6. 최종 높이 계산
                const contentEl = document.querySelector('.notion-page-content');
                const contentHeight = contentEl ? contentEl.getBoundingClientRect().height : document.body.scrollHeight;
                
                return {
                    height: Math.ceil(contentHeight) + 100,
                    width: parseInt(width)
                };
            }, { includeBanner, includeTitle, includeTags, includeDiscussion, width });

            // 계산된 높이로 뷰포트 재설정
            await page.setViewport({ width: dimensions.width, height: dimensions.height });

            // PDF 생성 (Extension의 Page.printToPDF 옵션과 매칭)
            const pdfWebStream = await page.createPDFStream({
                width: `${dimensions.width}px`,
                height: `${dimensions.height}px`,
                printBackground: true,
                displayHeaderFooter: false,
                margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
                pageRanges: '1',
                preferCSSPageSize: false // Extension 설정 반영
            });

            const nodeStream = Readable.fromWeb(pdfWebStream);

            nodeStream.on('close', async () => {
                if (page) await page.close();
                await browserPool.release(browser);
            });

            return nodeStream;

        } catch (error) {
            logger.error(`PDF Generation failed: ${error.message}`);
            if (page) await page.close();
            await browserPool.release(browser);
            throw error;
        }
    }

    async close() {
        await browserPool.drain();
        await browserPool.clear();
    }
}

module.exports = new PdfService();