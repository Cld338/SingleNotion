const { Readable } = require('stream');
const logger = require('../utils/logger');
const browserPool = require('../utils/browserPool');
const { log } = require('console');

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
            const { includeBanner, includeTitle, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight, pageWidth, screenshotPath } = options;
            
            
            logger.info(`Margin - Top: ${marginTop}, Bottom: ${marginBottom}, Left: ${marginLeft}, Right: ${marginRight}`);
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            
            // 1. 초기 뷰포트를 충분히 넓게 설정하여 데스크톱 레이아웃 유도
            await page.setViewport({ width: 3000, height: 1000 });

            await page.goto(url, { waitUntil: 'networkidle0' });

            // [Extension 로직 이식] 너비 자동 감지 및 스타일 최적화
            const dimensions = await page.evaluate(async (opts) => {
                const { includeTitle, includeBanner, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight, pageWidth } = opts;

                // A. 너비 자동 감지 (popup.js 로직)
                const contentEl = document.querySelector('.notion-page-content');
                const detectedWidth = contentEl ? Math.ceil(contentEl.getBoundingClientRect().width) + 100 : 1080;

                const scale = pageWidth ? (pageWidth / detectedWidth) : 1;

                // 상하좌우 패딩 값 설정 (기본값 0)
                const padTop = (Number(marginTop) || 0) / scale;
                const padBottom = (Number(marginBottom) || 0) / scale;
                const padLeft = (Number(marginLeft) || 0) / scale;
                const padRight = (Number(marginRight) || 0) / scale;

                async function waitForVisualComplete() {
                    console.time("VisualComplete");

                    // 1. 웹 폰트 로딩 대기 (FOIT/FOUT 방지)
                    // 모든 폰트가 로드되거나 실패할 때까지 기다립니다.
                    await document.fonts.ready;

                    // 2. 이미지 로딩 및 디코딩 대기
                    // 단순히 로드된 상태가 아니라, 브라우저가 픽셀을 그릴 준비(Decode)가 되었는지 확인합니다.
                    const images = Array.from(document.querySelectorAll('img'));
                    const imagePromises = images.map(img => {
                        // 소스가 없거나 이미 디코딩에 실패한 경우 제외
                        if (!img.src) return Promise.resolve();
                        
                        // img.decode()는 이미지가 메모리에 로드되고 픽셀 데이터가 준비되면 resolve됩니다.
                        return img.decode().catch(err => {
                        console.warn(`이미지 디코딩 실패: ${img.src}`, err);
                        });
                    });
                    
                    await Promise.all(imagePromises);

                    // 3. 브라우저 페인팅 사이클 대기
                    // 리소스가 준비되어도 브라우저가 화면에 실제로 그리는 시간이 필요합니다.
                    // Double requestAnimationFrame은 레이아웃 계산과 실제 페인트를 보장하는 트릭입니다.
                    return new Promise(resolve => {
                        requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            console.timeEnd("VisualComplete");
                            resolve(true);
                        });
                        });
                    });
                    }

                    
                await waitForVisualComplete();

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
                const padTopIdx = includeBanner ? 3 : (includeTags ? 4 : 5); // 배너 포함 시 첫 번째 레이아웃에 패딩 적용
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
                    .katex-mathml,
                    .katex-display .katex-mathml,
                    .katex > .katex-mathml,
                    .annotation {
                        display: none !important;
                    } 
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
                    height: Math.ceil(contentHeight),
                    width: detectedWidth,
                    padTop: padTop,
                    padBottom: padBottom,
                    padLeft: padLeft,
                    padRight: padRight,
                    scale: scale // 계산된 스케일을 반환하여 외부에서 사용
                };
            }, { includeBanner, includeTitle, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight, pageWidth });

            logger.info(`Calculated scale: ${dimensions.scale}`);

            // 2. 계산된 높이와 너비로 뷰포트 최종 조정
            const finalHeight = Math.ceil(dimensions.height);
            const finalWidth = Math.ceil(dimensions.width + dimensions.padLeft + dimensions.padRight);
            
            await page.setViewport({ width: finalWidth + 1000, height: finalHeight });
            
            await new Promise(resolve => setTimeout(resolve, 3000));

            const scale = dimensions.scale;
            const pdfWidth = finalWidth * scale;
            const pdfHeight = finalHeight * scale;
            
            if (options.screenshotPath) {
                // 브라우저 컨텍스트에서 .layout-content 요소들의 전체 영역(Bounding Box) 계산
                const boundingBox = await page.evaluate(() => {
                    const elements = Array.from(document.querySelectorAll('.layout-content, .layout-full'));
                    if (elements.length === 0) return null;

                    let minX = Infinity;
                    let minY = Infinity;
                    let maxX = -Infinity;
                    let maxY = -Infinity;

                    elements.forEach(el => {
                        const rect = el.getBoundingClientRect();
                        // 스크롤 위치를 보정한 절대 좌표 계산
                        const x = rect.left + window.scrollX;
                        const y = rect.top + window.scrollY;
                        
                        if (x < minX) minX = x;
                        if (y < minY) minY = y;
                        if (x + rect.width > maxX) maxX = x + rect.width;
                        if (y + rect.height > maxY) maxY = y + rect.height;
                    });
                    return {
                        x: minX,
                        y: minY,
                        width: maxX - minX,
                        height: maxY - minY
                    };
                });

                if (boundingBox) {
                    // 계산된 전체 영역만 지정하여 스크린샷 캡처
                    await page.screenshot({
                        path: options.screenshotPath,
                        clip: boundingBox
                    });
                } else {
                    // 요소를 찾지 못했을 경우의 대비책
                    await page.screenshot({ path: options.screenshotPath, fullPage: true });
                }
            }

            // 3. PDF 생성 (Extension의 Page.printToPDF 설정 반영)
            const pdfWebStream = await page.createPDFStream({
                width: `${pdfWidth}px`,
                height: `${pdfHeight}px`,
                scale: scale,
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

            return {
                stream: nodeStream,
                detectedWidth: dimensions.width
            };

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