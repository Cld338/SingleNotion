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
            const { includeBanner, includeTitle, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight } = options;
            
            
            logger.info(`Margin - Top: ${marginTop}, Bottom: ${marginBottom}, Left: ${marginLeft}, Right: ${marginRight}`);
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            
            // 1. 초기 뷰포트를 충분히 넓게 설정하여 데스크톱 레이아웃 유도
            await page.setViewport({ width: 2460, height: 1000 });

            await page.goto(url, { waitUntil: 'networkidle0' });

            // [Extension 로직 이식] 너비 자동 감지 및 스타일 최적화
            const dimensions = await page.evaluate(async (opts) => {
                const { includeTitle, includeBanner, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight } = opts;

                // 상하좌우 패딩 값 설정 (기본값 0)
                const padTop = Number(marginTop) || 0;
                const padBottom = Number(marginBottom) || 0;
                const padLeft = Number(marginLeft) || 0;
                const padRight = Number(marginRight) || 0;



                // A. 너비 자동 감지 (popup.js 로직)
                const contentEl = document.querySelector('.notion-page-content');
                const detectedWidth = contentEl ? Math.ceil(contentEl.getBoundingClientRect().width) : 1080;

                // B. Lazy 로딩 해제 및 이미지 로딩 보장(스크롤)
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

                await new Promise(async (resolve) => {
                    // 1. 문서 내 모든 웹 폰트 로딩 대기 (KaTeX 수학 기호 폰트 포함)
                    await document.fonts.ready;

                    let maxAttempts = 50; // 최대 10초 대기
                    let attempts = 0;
                    let previousKatexCount = -1;
                    let stableCount = 0;

                    const checkResources = () => {
                        attempts++;
                        
                        // 2. 이미지 로딩 완료 확인
                        const images = Array.from(document.images);
                        const allImagesLoaded = images.every(img => img.complete);

                        // 3. KaTeX 렌더링 안정화 확인 (DOM 내 개수 변화 추적)
                        const currentKatexCount = document.querySelectorAll('.katex-mathml').length;
                        if (currentKatexCount === previousKatexCount) {
                            stableCount++;
                        } else {
                            stableCount = 0; // 개수가 변했다면 렌더링 중이므로 카운트 초기화
                            previousKatexCount = currentKatexCount;
                        }

                        // 이미지가 모두 로드되었고, KaTeX 요소 개수가 3회(약 600ms) 연속 변동이 없으면 렌더링 완료로 간주
                        const isKatexStable = stableCount >= 3;

                        if ((allImagesLoaded && isKatexStable) || attempts >= maxAttempts) {
                            setTimeout(resolve, 500); // 최종 레이아웃 안정을 위한 짧은 대기 후 종료
                        } else {
                            setTimeout(checkResources, 200);
                        }
                    };
                    checkResources();
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
                const padTopIdx = includeBanner ? 1 : (includeTags ? 2 : 3); // 배너 포함 시 첫 번째 레이아웃에 패딩 적용
                const totalLayoutWidth = detectedWidth + padLeft + padRight;
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

                    .layout > .layout-content:nth-child(${padTopIdx}) { padding-top: ${padTop}px !important; }

                    .whenContentEditable, .layout, .layout-content {
                        width: ${totalLayoutWidth}px !important;
                        max-width: ${totalLayoutWidth}px !important;
                        min-width: ${totalLayoutWidth}px !important;
                    }


                    .layout {
                        padding-bottom: ${padBottom}px !important;
                        --margin-width: 0px !important;
                    }

                    .layout-content { 
                        padding-left: ${padLeft}px !important; 
                        padding-right: ${padRight}px !important;
                    }

                    /* .katex-mathml {
                        display: none !important;
                    } 
                    */

                    
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
                    if (text.includes("\t")) text = text.replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0');
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
                    width: detectedWidth,
                    padTop: padTop,
                    padBottom: padBottom,
                    padLeft: padLeft,
                    padRight: padRight
                };
            }, { includeBanner, includeTitle, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight });

            // 2. 계산된 높이와 너비로 뷰포트 최종 조정
            const finalHeight = Math.ceil(dimensions.height + 100);
            const finalWidth = Math.ceil(dimensions.width + dimensions.padLeft + dimensions.padRight);
            
            await page.setViewport({ width: finalWidth + 100, height: finalHeight });
            
            await new Promise(resolve => setTimeout(resolve, 3000));



            // 3. PDF 생성 (Extension의 Page.printToPDF 설정 반영)
            const pdfWebStream = await page.createPDFStream({
                width: `${finalWidth}px`,
                height: `${finalHeight}px`,
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