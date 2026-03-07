const { Readable } = require('stream');
const logger = require('../utils/logger');
const browserPool = require('../utils/browserPool');

class PdfService {
    async generatePdf(url, options) {
        const browser = await browserPool.acquire();
        let page = null;

        try {
            page = await browser.newPage();

            // 보안 패치 로직 (기존 유지)
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
            const { includeBanner, includeTitle, includeTags, includeDiscussion } = options;

            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            
            // 1. 초기 뷰포트를 충분히 넓게 설정하여 데스크톱 레이아웃 유도
            await page.setViewport({ width: 2460, height: 1000 });

            await page.goto(url, { waitUntil: 'networkidle2' });

            // [Extension 로직 이식] 너비 자동 감지 및 스타일 최적화
            const dimensions = await page.evaluate(async (opts) => {
                const { includeTitle, includeBanner, includeTags, includeDiscussion } = opts;

                // A. 너비 자동 감지 (popup.js 로직)
                const contentEl = document.querySelector('.notion-page-content');
                const detectedWidth = contentEl ? Math.ceil(contentEl.getBoundingClientRect().width) : 1080;

                // B. 레이지 로딩 해제 (스크롤)
                await new Promise((resolve) => {
                    let totalHeight = 0;
                    const distance = 800;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= scrollHeight + 1000) {
                            clearInterval(timer);
                            window.scrollTo(0, 0);
                            resolve();
                        }
                    }, 50);
                });

                // C. 레이아웃 요소 크기 고정 (Freeze)
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

                // D. Extension 기반 스타일 주입 (감지된 너비 사용)
                let dynamicStyles = `
                    .notion-page-content {
                        width: ${detectedWidth}px !important;
                        max-width: ${detectedWidth}px !important;
                        min-width: ${detectedWidth}px !important;
                    }

                    .notion-sidebar-container, 
                    .notion-topbar, 
                    .notion-topbar-mobile,
                    .notion-help-button,
                    #skip-to-content,
                    header,
                    .autolayout-fill-width,
                    .notion-history-container
                    { display: none !important; }

                    .notion-floating-table-of-contents {
                        height: 1px !important;
                    }
                    
                    div[role="table"][aria-label="Page properties"] + div,
                    div[role="table"][aria-label="페이지 속성"] + div
                    { display: none !important; }

                    .notion-scroller{
                        overflow: hidden !important;
                    }

                    .notion-selectable-container > .notion-scroller { 
                        overflow: visible !important; 
                        height: auto !important;
                    }
                    /* 코드 텍스트 줄바꿈 강제 및 공백 유지 */
                    .notion-code-block, .notion-code-block span {
                        white-space: pre-wrap !important;
                        font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
                    }
                        

                    
                    .notion-app-inner, .notion-cursor-listener { height: auto !important; }
                    
                    ::-webkit-scrollbar { display: none !important; }

                    .layout { padding-bottom: 0px !important; --margin-width: 0px !important; }

                    .layout-content { padding-left: 100px !important; padding-right: 100px !important; }
                `;

                if (!includeTitle) dynamicStyles += `h1, .notion-page-block:has(h1) { display: none !important; }`;
                if (!includeBanner) dynamicStyles += `.notion-page-cover-wrapper, .notion-record-icon, .notion-page-controls { display: none !important; }`;
                if (!includeTags) dynamicStyles += `[aria-label="페이지 속성"], [aria-label="Page properties"] { display: none !important; }`;
                if (!includeDiscussion) dynamicStyles += `.layout-content-with-divider:has(.notion-page-view-discussion) { display: none !important;}`;

                const styleTag = document.createElement('style');
                styleTag.id = 'sn-pdf-style';
                styleTag.innerHTML = dynamicStyles + freezeCSS;
                document.head.appendChild(styleTag);

                // E. 공백 및 개행 처리
                const spans = document.querySelectorAll('span[data-token-index="0"]');
                spans.forEach(span => {
                    let text = span.textContent;
                    if (text.includes(" ")) text = text.replace(/ /g, '\u00A0');
                    if (text.includes("\t")) text = text.replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0');
                    span.textContent = text;
                });

                window.dispatchEvent(new Event('resize'));
                await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 3000)));

                // F. 최종 높이 재계산
                const selectors = ['.notion-page-content', '.layout'];
                let contentHeight = 0;
                for (const selector of selectors) {
                    const el = document.querySelector(selector);
                    if (el) {
                        const rect = el.getBoundingClientRect();
                        if (rect.height > contentHeight) contentHeight = rect.height;
                    }
                }

                if (contentHeight < document.body.scrollHeight) contentHeight = document.body.scrollHeight;
                
                return {
                    height: Math.ceil(contentHeight) + 100,
                    width: detectedWidth
                };
            }, { includeBanner, includeTitle, includeTags, includeDiscussion });

            // 2. 계산된 높이와 너비로 뷰포트 최종 조정
            await page.setViewport({ width: 2560, height: dimensions.height + 200 });

            // 3. PDF 생성 (Extension의 Page.printToPDF 설정 반영)
            const pdfWebStream = await page.createPDFStream({
                width: `${dimensions.width+200}px`,
                height: `${dimensions.height}px`,
                printBackground: true,
                displayHeaderFooter: false,
                margin: { top: '0px', bottom: '0px', left: '0px', right: '0px' },
                pageRanges: '1',
                preferCSSPageSize: false,
                tagged: true,
                outline: true,
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