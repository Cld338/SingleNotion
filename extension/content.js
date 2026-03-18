/**
 * Content Script for Notion to PDF Extension
 * Captures page DOM and resources
 */

(function() {
    // Configuration - default values
    let CONFIG = {
        SERVER_URL: 'http://localhost:3001'
    };

    // Promise-based config loader
    function loadConfig() {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'getConfig' }, (response) => {
                if (response && response.serverUrl) {
                    CONFIG.SERVER_URL = response.serverUrl;
                    console.log('[Notion-PDF-Config] Server URL loaded from background:', CONFIG.SERVER_URL);
                } else {
                    console.log('[Notion-PDF-Config] Using default SERVER URL:', CONFIG.SERVER_URL);
                }
                // 항상 resolve - 기본값이든 로드된 값이든
                resolve(CONFIG.SERVER_URL);
            });
        });
    }

    // Initialize config on script load
    loadConfig().then(() => {
        console.log('[Notion-PDF] Config initialized, SERVER_URL =', CONFIG.SERVER_URL);
    });

    // Log that content script is loaded
    console.log('[Notion-PDF] Content script loaded on', window.location.href);

    /**
     * HTML entity를 디코딩 (e.g., &amp; → &, &quot; → ", &#34; → ")
     */
    function decodeHtmlEntity(html) {
        const textarea = document.createElement('textarea');
        textarea.innerHTML = html;
        return textarea.value;
    }

    /**
     * HTML entity를 완전히 디코딩하는 함수
     * outerHTML에서 나온 &quot;, &apos; 등을 모두 정상 문자로 변환
     * 정규식으로 직접 변환 (textarea.value는 entity를 보존하므로 사용 불가)
     */
    function decodeAllHtmlEntities(html) {
        if (!html) return html;
        
        let decoded = html
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(parseInt(dec, 10)))
            .replace(/&#x([a-fA-F0-9]+);/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)));
        
        const stillHasEntities = /&[a-z]+;|&#\d+;|&#x[a-fA-F0-9]+;/i.test(decoded);
        console.log('[Notion-PDF-DEBUG] HTML entity decoding - Still has entities:', stillHasEntities);
        
        if (decoded.includes('&quot;')) {
            console.log('[Notion-PDF-DEBUG] WARNING: &quot; still found after decoding!');
        }
        
        return decoded;
    }

    /**
     * 정규화된 baseUrl 추출 (쿼리 파라미터, 해시 제거)
     * 예: https://www.notion.so/Page-Name-abc123?v=1#section → https://www.notion.so/Page-Name-abc123
     */
    function getNormalizedBaseUrl() {
        try {
            const url = new URL(window.location.href);
            // 쿼리 파라미터와 해시 제거
            return `${url.protocol}//${url.host}${url.pathname}`;
        } catch (err) {
            console.warn('[Notion-PDF] Failed to normalize base URL:', err);
            return window.location.href;
        }
    }

    /**
     * 상대 경로를 절대 경로(full URL)로 변환
     */
    function resolveRelativePath(path) {
        if (!path) return path;
        
        // 이미 절대 경로인 경우
        if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('//') || path.startsWith('data:')) {
            return path;
        }
        
        // 상대 경로를 현재 페이지(Notion.so)를 기준으로 절대 경로로 변환
        try {
            return new URL(path, window.location.href).href;
        } catch (err) {
            console.warn('[Notion-PDF] Failed to resolve path:', path, err);
            return path;
        }
    }

    /**
     * CSS 텍스트 내의 url() 함수 경로를 절대 경로로 변환
     * 상대 경로는 절대 경로로, 절대 경로는 그대로 반환 (proxy-asset은 서버에서 처리)
     */
    function convertCssUrlsToAbsolute(cssText) {
        if (!cssText) return cssText;

        return cssText.replace(
            /url\(\s*['"]?(?!(?:\/proxy-asset|data:))([^)'"]+)['"]?\s*\)/gi,
            (match, urlPath) => {
                urlPath = urlPath.trim();
                
                // 이미 proxy-asset이거나 data URI는 그대로
                if (urlPath.includes('/proxy-asset') || urlPath.startsWith('data:')) {
                    return match;
                }
                
                // 절대 경로(http/https 포함)는 그대로
                if (urlPath.startsWith('http://') || urlPath.startsWith('https://') || urlPath.startsWith('//')) {
                    return match;
                }
                
                // 상대 경로는 절대 경로로 변환
                try {
                    const absolutePath = resolveRelativePath(urlPath);
                    console.log('[Notion-PDF-CSS] Converting CSS url path:', urlPath.substring(0, 60) + '...');
                    // 원래 따옴표 형식 유지
                    return match.replace(urlPath, absolutePath);
                } catch (err) {
                    console.warn('[Notion-PDF-CSS] Failed to convert path:', urlPath, err);
                    return match;
                }
            }
        );
    }

    /**
     * innerHTML에서 남은 상대 경로를 절대 경로로 변환
     * (proxy-asset 변환은 서버에서 처리)
     * ⚠️ style 속성 내부의 따옴표(&quot;)는 보호 - 서버에서 처리
     */
    function convertPathsToAbsolute(htmlString) {
        if (!htmlString) return htmlString;

        let html = htmlString;
        
        // ⚠️ Style 속성을 임시 보호
        const styleAttributes = [];
        const styleMarker = '__STYLE_ATTR_';
        
        // style 속성들을 추출하고 임시 플레이스홀더로 대체
        // 더 간단하고 안전한 정규식: style="..."  또는 style='...'
        // "(큰따옴표 또는 엔티티)*" 파턴으로 처리
        html = html.replace(/style\s*=\s*"((?:[^"]|&[a-zA-Z0-9#]*;)*)"/gi, (match) => {
            styleAttributes.push(match);
            console.log('[Notion-PDF-DEBUG] Protected style (double-quote):', match.substring(0, 100) + '...');
            return `${styleMarker}${styleAttributes.length - 1}${styleMarker}`;
        });
        
        html = html.replace(/style\s*=\s*'((?:[^']|&[a-zA-Z0-9#]*;)*)'/gi, (match) => {
            styleAttributes.push(match);
            console.log('[Notion-PDF-DEBUG] Protected style (single-quote):', match.substring(0, 100) + '...');
            return `${styleMarker}${styleAttributes.length - 1}${styleMarker}`;
        });
        
        console.log('[Notion-PDF-DEBUG] Protected', styleAttributes.length, 'style attributes');
        
        // ⚠️ HTML entity 디코딩 - &quot;, &#34; 는 제외 (style 속성 내부에 필요)
        // 대신 다른 엔티티만 디코딩
        html = html
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, (match, dec) => {
                const code = parseInt(dec, 10);
                // &quot; (34)와 &#34; 는 보호
                if (code === 34) return match;
                return String.fromCharCode(code);
            })
            .replace(/&#x([a-fA-F0-9]+);/g, (match, hex) => {
                const code = parseInt(hex, 16);
                // &quot; (0x22)는 보호  
                if (code === 0x22) return match;
                return String.fromCharCode(code);
            });

        console.log('[Notion-PDF-DEBUG] HTML entities decoded (excluding &quot;)');
        
        // Style 속성 복원 (원본 유지)
        html = html.replace(new RegExp(`${styleMarker}(\\d+)${styleMarker}`, 'g'), (match, index) => {
            const restored = styleAttributes[parseInt(index)];
            if (restored) {
                console.log('[Notion-PDF-DEBUG] Restored style:', restored.substring(0, 100) + '...');
            }
            return restored || match;
        });

        // [디버그] 처리 전 상태 확인
        const srcMatches1 = html.match(/\ssrc=["'][^"']+["']/gi) || [];
        const hrefMatches1 = html.match(/\shref=["'][^"']+["']/gi) || [];
        console.log('[Notion-PDF-DEBUG] Before conversion - src count:', srcMatches1.length, ', href count:', hrefMatches1.length);

        // 상대 경로 src 처리 (절대 경로로만 변환, proxy-asset은 서버에서 처리)
        let srcCount = 0;
        html = html.replace(
            /(\ssrc=")(?!(?:\/proxy-asset|data:))([^"]+)(")/gi,
            (match, prefix, path, suffix) => {
                if (path.startsWith('http')){
                    return match; // 이미 절대 경로
                }
                const absolutePath = resolveRelativePath(path);
                srcCount++;
                console.log('[Notion-PDF] Converting src path:', path.substring(0, 50) + '...');
                return `${prefix}${absolutePath}${suffix}`;
            }
        );
        
        html = html.replace(
            /(\ssrc=')(?!(?:\/proxy-asset|data:))([^']+)(')/gi,
            (match, prefix, path, suffix) => {
                if (path.startsWith('http')) {
                    return match;
                }
                const absolutePath = resolveRelativePath(path);
                srcCount++;
                return `${prefix}${absolutePath}${suffix}`;
            }
        );

        console.log('[Notion-PDF-DEBUG] src paths converted:', srcCount);

        // 상대 경로 href 처리
        let hrefCount = 0;
        html = html.replace(
            /\shref=["'](?!#|\/proxy-asset|data:)([^"']+)["']/gi,
            (match, path) => {
                if (path.startsWith('http') || path.startsWith('/')) {
                    return match;
                }
                const absolutePath = resolveRelativePath(path);
                hrefCount++;
                return match.replace(path, absolutePath);
            }
        );

        console.log('[Notion-PDF-DEBUG] href paths converted:', hrefCount);

        // ⚠️ style 속성 처리는 제거!
        // 이유: style 속성 내의 따옴표 처리가 복잡하고 정규식으로 안전하게 처리하기 어려움
        // 서버의 urlPathConverter.convertStyleUrls()가 처리함
        console.log('[Notion-PDF-DEBUG] Style attribute processing skipped (handled by server)');
        
        return html;
    }





    /**
     * 모든 CSS가 로드될 때까지 대기 (getPreviewData와 동일한 로직)
     */
    async function waitForCSSLoading() {
        await new Promise((resolve) => {
            // 1. 모든 스타일시트 로드 완료 확인
            const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
            const styleloadPromises = stylesheets.map(link => {
                return new Promise((resolve) => {
                    if (link.sheet) {
                        // 이미 로드됨
                        resolve();
                    } else {
                        // 로드 완료 대기
                        link.onload = () => resolve();
                        link.onerror = () => resolve(); // 에러나도 계속
                        
                        // 타임아웃 (30초)
                        setTimeout(resolve, 30000);
                    }
                });
            });
            
            if (styleloadPromises.length > 0) {
                Promise.all(styleloadPromises).then(resolve);
            } else {
                resolve();
            }
        });

        // 2. 웹 폰트 로딩 대기
        if (document.fonts && document.fonts.ready) {
            await document.fonts.ready;
        }
        
        // 3. 리플로우 완료 대기 (레이아웃 계산)
        await new Promise(resolve => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    resolve();
                });
            });
        });
    }





    /**
     * Captures the full page content - identical to pdfService.getPreviewData()
     */
    async function capturePageContent() {
        // Store original state for restoration after capture
        const originalState = {
            scrollPosition: { x: window.scrollX, y: window.scrollY },
            imgSrcs: new Map(),
            srcAttributes: new Map(),
            hrefAttributes: new Map(),
            cssLinkHrefs: new Map(),
            openedToggles: []
            // ⚠️ style 속성 수정 안함 - HTML 추출 후 문자열 단계에서만 처리
        };

        try {
            console.log('[Notion-PDF] Starting page capture (matching getPreviewData logic)...');

            // 1. CSS 로드 대기
            console.log('[Notion-PDF] Waiting for CSS to load...');
            await waitForCSSLoading();

            // 2. 스크롤 및 CSS 안정화 대기
            console.log('[Notion-PDF] Scrolling to load all content...');
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 100;
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

            // 3. 토글 블록 모두 열기
            console.log('[Notion-PDF-Toggle] Starting to open all toggles...');
            try {
                let allToggleClosed = false;
                let iterationCount = 0;
                const maxIterations = 20;
                
                while (!allToggleClosed && iterationCount < maxIterations) {
                    iterationCount++;
                    console.log(`[Notion-PDF-Toggle] Iteration ${iterationCount}: Checking for closed toggles...`);
                    
                    const toggleButtons = document.querySelectorAll('.notion-toggle-block [role="button"]');
                    const closedToggles = Array.from(toggleButtons).filter(btn => 
                        btn.getAttribute('aria-expanded') === 'false'
                    );
                    
                    console.log(`[Notion-PDF-Toggle] Iteration ${iterationCount}: Found ${closedToggles.length} closed toggles`);
                    
                    if (closedToggles.length === 0) {
                        allToggleClosed = true;
                        console.log('[Notion-PDF-Toggle] All toggles are now open');
                    } else {
                        closedToggles.forEach(button => {
                            // Track which toggles we opened for restoration later
                            originalState.openedToggles.push(button);
                            button.click();
                        });
                        
                        await new Promise(resolve => setTimeout(resolve, 500));
                        
                        await new Promise(resolve => {
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    resolve();
                                });
                            });
                        });
                    }
                }
                
                if (iterationCount >= maxIterations) {
                    console.warn('[Notion-PDF-Toggle] Max iterations reached, some toggles may still be closed');
                }
                
                // 최종 안정화 대기
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[Notion-PDF-Toggle] Toggle processing completed');
            } catch (err) {
                console.warn(`[Notion-PDF-Toggle] Error opening toggles: ${err.message}`);
            }

            // 4. KaTeX/MathJax 렌더링 완료 대기 (getPreviewData와 동일)
            try {
                const hasKaTeX = document.querySelectorAll('.katex').length > 0;
                if (hasKaTeX) {
                    console.log(`[Notion-PDF] Found ${document.querySelectorAll('.katex').length} KaTeX elements`);
                    await new Promise((resolve) => {
                        let isStable = false;
                        let checkCount = 0;
                        const maxChecks = 10;
                        
                        const checkKaTeXReady = () => {
                            checkCount++;
                            const currentKaTeXCount = document.querySelectorAll('.katex').length;
                            console.log(`[Notion-PDF] Check ${checkCount}: ${currentKaTeXCount} KaTeX elements`);
                            
                            if (isStable || checkCount >= maxChecks) {
                                console.log(`[Notion-PDF] KaTeX rendering complete`);
                                resolve();
                            } else {
                                if (checkCount > 1 && currentKaTeXCount === 
                                    (window._previewKaTeXCount || 0)) {
                                    isStable = true;
                                    console.log(`[Notion-PDF] Stable at check ${checkCount}`);
                                    resolve();
                                }
                                window._previewKaTeXCount = currentKaTeXCount;
                                setTimeout(checkKaTeXReady, 500);
                            }
                        };
                        
                        checkKaTeXReady();
                    });
                }
                
                if (window.MathJax && window.MathJax.typesetPromise) {
                    console.log(`[Notion-PDF] Found MathJax, waiting for typeset...`);
                    try {
                        await Promise.race([
                            window.MathJax.typesetPromise(),
                            new Promise(resolve => setTimeout(resolve, 3000))
                        ]);
                        console.log(`[Notion-PDF] MathJax typeset complete`);
                    } catch (err) {
                        console.warn(`[Notion-PDF] MathJax typeset error: ${err.message}`);
                    }
                }
            } catch (err) {
                console.warn(`[Notion-PDF] KaTeX/MathJax check failed: ${err.message}`);
            }

            // 5. 레이아웃 계산 완료 대기 (리플로우)
            await new Promise(resolve => {
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        resolve();
                    });
                });
            });

            // 6. 최종 안정화 대기 (CSS 애니메이션 + 렌더링 완료)
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 7. 콘텐츠 데이터 추출 (getPreviewData와 동일한 방식)
            console.log('[Notion-PDF] Extracting page data...');
            const contentEl = document.querySelector('.notion-page-content');
            const detectedWidth = contentEl ? Math.ceil(contentEl.getBoundingClientRect().width) : 1080;
            console.log(`[Notion-PDF] Detected content width: ${detectedWidth}px`);

            // 7-1. HTML capture 전에 이미지와 링크를 처리
            console.log('[Notion-PDF] Pre-processing paths in DOM...');
            
            // ⚠️ 주의: style 속성은 수정하지 않습니다!
            // getPreviewData처럼 innerHTML로 추출 후 문자열 단계에서 처리합니다.
            // 이유: DOM 속성을 수정하면 outerHTML로 추출할 때 **깨집니다**.
            
            // ⚠️ proxy-asset 변환도 하지 않습니다!
            // 이유: 상대 경로를 proxy-asset으로 변환하면, 서버에서
            // /proxy-asset을 절대 경로로 변환할 때 Notion origin으로 변환됩니다.
            // 대신 절대 경로로만 변환하고, 서버 Step 2에서 proxy-asset으로 변환합니다.
            
            // CSS link 처리 (절대 경로로 변환)
            document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('data:')) {
                    // Store original href for restoration
                    originalState.cssLinkHrefs.set(link, href);
                    const absoluteHref = resolveRelativePath(href);
                    link.setAttribute('href', absoluteHref);
                    console.log('[Notion-PDF] CSS link href resolved:', href, '->', absoluteHref);
                }
            });
            
            // 이미지 처리 (절대 경로로만 변환, proxy-asset은 서버에서 처리)
            document.querySelectorAll('img').forEach((img) => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('data:')) {
                    originalState.imgSrcs.set(img, src);
                    const absolutePath = resolveRelativePath(src);
                    img.setAttribute('src', absolutePath);
                    console.log('[Notion-PDF] Image processed:', src.substring(0, 60) + '...');
                }
            });
            
            // 모든 src 속성 처리 (source, script, iframe 등) (절대 경로로만 변환)
            document.querySelectorAll('[src]').forEach((el) => {
                if (el.tagName === 'IMG') return;
                const src = el.getAttribute('src');
                if (src && !src.startsWith('data:')) {
                    originalState.srcAttributes.set(el, src);
                    const absolutePath = resolveRelativePath(src);
                    el.setAttribute('src', absolutePath);
                }
            });
            
            // href 처리 (SVG use, a, 등 - link 태그와 anchor 제외) (절대 경로로만 변환)
            document.querySelectorAll('[href]').forEach((el) => {
                if (el.tagName === 'LINK') return;
                const href = el.getAttribute('href');
                if (href && !href.startsWith('#') && !href.startsWith('data:')) {
                    originalState.hrefAttributes.set(el, href);
                    const absolutePath = resolveRelativePath(href);
                    el.setAttribute('href', absolutePath);
                }
            });
            
            console.log('[Notion-PDF] All paths pre-processed');


            // 8. HTML 추출 - getPreviewData와 동일하게 (배너, 제목, 속성, 메인 콘텐츠)
            console.log('[Notion-PDF] Extracting HTML content...');
            let htmlParts = [];
            let addedElements = new Set();
            
            const pushElement = (el) => {
                if (el && !addedElements.has(el)) {
                    htmlParts.push(el.outerHTML);
                    addedElements.add(el);
                }
            };

            // (0) 전역 SVG 심볼(Sprite) 추출
            document.querySelectorAll('svg symbol, svg defs').forEach(el => {
                const parentSvg = el.closest('svg');
                if (parentSvg && !addedElements.has(parentSvg)) {
                    const clone = parentSvg.cloneNode(true);
                    clone.style.display = 'none';
                    clone.style.position = 'absolute';
                    clone.style.width = '0';
                    clone.style.height = '0';
                    htmlParts.push(clone.outerHTML);
                    addedElements.add(parentSvg);
                }
            });

            // (1) 배너
            const cover = document.querySelector('.layout-full');
            pushElement(cover);

            // (2) 제목
            const h1 = document.querySelector('h1');
            if (h1) {
                const titleBlock = h1.closest('.notion-page-block') || h1;
                pushElement(titleBlock);
            }

            // (3) 페이지 속성 (태그)
            const tags = document.querySelector('div[aria-label="페이지 속성"], div[aria-label="Page properties"]');
            pushElement(tags);

            // (4) 메인 콘텐츠
            if (contentEl) {
                htmlParts.push(contentEl.innerHTML);
            }

            // HTML을 먼저 join (리소스 전에)
            let html = htmlParts.join('\n');
            
            // [중요] HTML entity 디코딩 - &quot;는 보호 (style 속성의 따옴표 처리를 위함)
            // &quot; 외의 엔티티만 디코딩
            console.log('[Notion-PDF] Decoding HTML entities from outerHTML (excluding &quot;)...');
            html = html
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&apos;/g, "'")
                .replace(/&#(\d+);/g, (match, dec) => {
                    const code = parseInt(dec, 10);
                    if (code === 34) return match; // &quot; 보호
                    return String.fromCharCode(code);
                })
                .replace(/&#x([a-fA-F0-9]+);/g, (match, hex) => {
                    const code = parseInt(hex, 16);
                    if (code === 0x22) return match; // &quot; 보호
                    return String.fromCharCode(code);
                });
                        // [디버그] 엔티티 디코딩 확인
            const hasQuotEntity = html.includes('&quot;');
            const hasAposEntity = html.includes('&apos;');
            const hasAmpEntity = html.includes('&amp;');
            console.log('[Notion-PDF-DEBUG] After entity decode - &quot;:', hasQuotEntity, ', &apos;:', hasAposEntity, ', &amp;:', hasAmpEntity);
                        // [디버그] style 속성을 가진 요소들 샘플 출력
            const styleMatches = html.match(/style="[^"]*url\([^)]*\)[^"]*"/gi) || [];
            console.log('[Notion-PDF-DEBUG] Found', styleMatches.length, 'style attributes with url()');
            if (styleMatches.length > 0) {
                console.log('[Notion-PDF-DEBUG] Style samples (first 2):');
                styleMatches.slice(0, 2).forEach((sample, idx) => {
                    console.log(`  [${idx}] ${sample.substring(0, 120)}`);
                    console.log(`      Has &quot;: ${sample.includes('&quot;')}`);
                });
            }
            
            // (추가) HTML 수집 후 CSS/styles를 HTML 상단에 삽입
            console.log('[Notion-PDF] Collecting head CSS and styles for HTML inclusion...');
            let headContent = '';
            
            // CSS 링크 수집 및 HTML에 포함 (절대 경로로만 - proxy-asset은 서버 Step 2에서 처리)
            document.querySelectorAll('link[rel="stylesheet"]').forEach((link, idx) => {
                // getAttribute로 현재 href 값 가져오기 (앞에서 절대 경로로 변환됨)
                const currentHref = link.getAttribute('href');
                const media = link.getAttribute('media') || 'all';
                
                if (currentHref) {
                    // 절대 경로로만 유지 (proxy-asset 변환은 서버에서 처리)
                    const finalHref = currentHref;
                    
                    // HTML에 CSS link 태그 추가
                    const crossorigin = link.getAttribute('crossorigin');
                    headContent += `<link href="${finalHref}" rel="stylesheet" media="${media}"${crossorigin ? ` crossorigin="${crossorigin}"` : ''}>\n`;
                }
            });
            
            // Inline styles 수집 및 HTML에 포함
            // ⚠️ style.textContent는 수정하지 않음 - 서버의 urlPathConverter가 처리
            document.querySelectorAll('style').forEach((style, idx) => {
                const id = style.id || `_style_${idx}`;
                const contentLength = style.textContent.length;
                
                if (contentLength < 1000000) {
                    // 원본 CSS 텍스트 그대로 사용  (서버에서 처리)
                    headContent += `<style id="${id}">${style.textContent}</style>\n`;
                }
            });
            
            // HTML 상단에 CSS/styles 삽입
            if (headContent) {
                console.log('[Notion-PDF] Prepending CSS and styles to HTML');
                html = headContent + html;
            }

            // HTML의 모든 상대 경로를 절대 경로로 변환하고, convertPathsToAbsolute 함수도 제거해도 됨
            // (이미 DOM에서 절대 경로로 변환했으므로 innerHTML만 남아있음)
            // 참고: proxy-asset 변환은 서버에서 Step 2로 처리
            console.log('[Notion-PDF] Converting remaining paths to absolute URLs...');
            const htmlWithAbsolutePaths = convertPathsToAbsolute(html);

            if (!htmlWithAbsolutePaths || typeof htmlWithAbsolutePaths !== 'string' || htmlWithAbsolutePaths.length === 0) {
                throw new Error('HTML 캡처 실패: 유효한 HTML을 얻을 수 없습니다.');
            }

            console.log('[Notion-PDF] HTML generated and converted', { length: htmlWithAbsolutePaths.length });

            // 9. 리소스 추출 (getPreviewData와 동일한 방식)
            console.log('[Notion-PDF] Extracting resources...');
            const resources = {
                cssLinks: [],
                inlineStyles: [],
                scripts: [],
                images: [],
                icons: [],
                fonts: [],
                katexResources: [],
                videos: [],
                otherAssets: []
            };

            // 1. CSS 링크 수집 (HTML에 포함되었으므로 참조용으로 유지)
            document.querySelectorAll('link[rel="stylesheet"]').forEach((link, idx) => {
                const href = link.getAttribute('href');
                const media = link.getAttribute('media') || 'all';
                
                if (href) {
                    // 절대 경로로 변환 (HTML에 이미 proxy-asset으로 포함됨)
                    const absoluteHref = resolveRelativePath(href);
                    
                    resources.cssLinks.push({
                        href: absoluteHref,
                        media: media,
                        crossorigin: link.getAttribute('crossorigin')
                    });
                }
            });
            console.log('[Notion-PDF] Found', resources.cssLinks.length, 'CSS links');

            // 2. 아이콘 수집
            document.querySelectorAll('link[rel*="icon"]').forEach((link) => {
                const href = link.getAttribute('href');
                if (href) {
                    resources.icons.push({
                        href: href,
                        rel: link.getAttribute('rel'),
                        type: link.getAttribute('type'),
                        sizes: link.getAttribute('sizes')
                    });
                }
            });
            console.log('[Notion-PDF] Found', resources.icons.length, 'icon links');

            // 3. 웹 폰트 수집
            document.querySelectorAll('link[href*="font"]').forEach((link) => {
                const href = link.getAttribute('href');
                if (href && !resources.cssLinks.some(css => css.href === href)) {
                    resources.fonts.push({ href: href });
                }
            });
            console.log('[Notion-PDF] Found', resources.fonts.length, 'font links');

            // 4. 스크립트 수집
            document.querySelectorAll('script').forEach((script, idx) => {
                if (script.src) {
                    resources.scripts.push({
                        type: 'external',
                        src: script.getAttribute('src'),
                        async: script.hasAttribute('async'),
                        defer: script.hasAttribute('defer')
                    });
                } else if (script.textContent.trim().length > 0 && script.textContent.length < 500000) {
                    resources.scripts.push({
                        type: 'inline',
                        content: script.textContent,
                        contentLength: script.textContent.length
                    });
                }
            });
            console.log('[Notion-PDF] Found', resources.scripts.length, 'scripts');

            // 5. 인라인 스타일 수집 (HTML에 포함되었으므로 참조용으로 유지)
            document.querySelectorAll('style').forEach((style, idx) => {
                const id = style.id || `_style_${idx}`;
                const contentLength = style.textContent.length;
                
                if (contentLength < 1000000) {
                    resources.inlineStyles.push({
                        id: id,
                        content: style.textContent
                    });
                }
            });
            console.log('[Notion-PDF] Found', resources.inlineStyles.length, 'inline styles');

            // 6. 이미지 수집
            const imageUrls = new Set();
            
            document.querySelectorAll('img').forEach((img) => {
                const src = img.getAttribute('src');
                if (src && !imageUrls.has(src)) {
                    imageUrls.add(src);
                    resources.images.push({
                        src: src,
                        alt: img.getAttribute('alt') || '',
                        title: img.getAttribute('title') || '',
                        dataAttributes: Array.from(img.attributes)
                            .filter(attr => attr.name.startsWith('data-'))
                            .map(attr => ({ name: attr.name, value: attr.value }))
                    });
                }
            });

            // picture 요소의 이미지
            document.querySelectorAll('picture source').forEach((source) => {
                const srcset = source.getAttribute('srcset');
                if (srcset) {
                    srcset.split(',').forEach(pair => {
                        const url = pair.trim().split(' ')[0];
                        if (url && !imageUrls.has(url)) {
                            imageUrls.add(url);
                            resources.images.push({
                                src: url,
                                srcset: true,
                                media: source.getAttribute('media')
                            });
                        }
                    });
                }
            });
            console.log('[Notion-PDF] Found', resources.images.length, 'images');

            // 7. KaTeX 리소스 수집
            document.querySelectorAll('link[href*="katex"]').forEach((link) => {
                resources.katexResources.push({
                    type: 'link',
                    href: link.getAttribute('href')
                });
            });

            document.querySelectorAll('script[src*="katex"]').forEach((script) => {
                resources.katexResources.push({
                    type: 'script',
                    src: script.getAttribute('src')
                });
            });
            console.log('[Notion-PDF] Found', resources.katexResources.length, 'KaTeX resources');

            // 8. 비디오 및 미디어 수집
            document.querySelectorAll('video, audio').forEach((media) => {
                const src = media.getAttribute('src');
                if (src) {
                    resources.videos.push({
                        tag: media.tagName.toLowerCase(),
                        src: src,
                        type: media.getAttribute('type')
                    });
                }
                
                media.querySelectorAll('source').forEach((source) => {
                    const srcVal = source.getAttribute('src');
                    if (srcVal) {
                        resources.videos.push({
                            tag: 'source',
                            src: srcVal,
                            type: source.getAttribute('type')
                        });
                    }
                });
            });
            console.log('[Notion-PDF] Found', resources.videos.length, 'video/audio resources');

            // 9. 기타 확장자 리소스 수집
            document.querySelectorAll('[href*="_assets"], [src*="_assets"]').forEach((el) => {
                const href = el.getAttribute('href') || el.getAttribute('src');
                if (href && !resources.otherAssets.some(a => a.url === href)) {
                    resources.otherAssets.push({
                        url: href,
                        type: el.tagName.toLowerCase()
                    });
                }
            });
            console.log('[Notion-PDF] Found', resources.otherAssets.length, 'other assets');

            // 10. 리소스 경로 변환 (getPreviewData와 동일한 방식)
            console.log('[Notion-PDF] Converting resource paths to absolute URLs...');
            const baseUrl = getNormalizedBaseUrl();

            // CSS 링크 경로 변환
            resources.cssLinks = resources.cssLinks.map(css => {
                const resolvedHref = resolveRelativePath(css.href);
                return { ...css, href: resolvedHref };
            });

            // 이미지 경로 변환
            resources.images = resources.images.map(img => {
                const resolvedSrc = resolveRelativePath(img.src);
                return { ...img, src: resolvedSrc };
            });

            // 아이콘 경로 변환
            resources.icons = resources.icons.map(icon => {
                const resolvedHref = resolveRelativePath(icon.href);
                return { ...icon, href: resolvedHref };
            });

            // 폰트 경로 변환
            resources.fonts = resources.fonts.map(font => {
                const resolvedHref = resolveRelativePath(font.href);
                return { ...font, href: resolvedHref };
            });

            // 스크립트 경로 변환 (외부 스크립트만)
            resources.scripts = resources.scripts.map(script => {
                if (script.type === 'external') {
                    const resolvedSrc = resolveRelativePath(script.src);
                    return { ...script, src: resolvedSrc };
                }
                return script;
            });

            // KaTeX 리소스 경로 변환
            resources.katexResources = resources.katexResources.map(katex => {
                if (katex.type === 'link') {
                    const resolvedHref = resolveRelativePath(katex.href);
                    return { ...katex, href: resolvedHref };
                } else {
                    const resolvedSrc = resolveRelativePath(katex.src);
                    return { ...katex, src: resolvedSrc };
                }
            });

            // 비디오/미디어 경로 변환
            resources.videos = resources.videos.map(video => {
                const resolvedSrc = resolveRelativePath(video.src);
                return { ...video, src: resolvedSrc };
            });

            // 기타 assets 경로 변환
            resources.otherAssets = resources.otherAssets.map(asset => {
                const resolvedUrl = resolveRelativePath(asset.url);
                return { ...asset, url: resolvedUrl };
            });

            console.log('[Notion-PDF] Resource paths converted to absolute URLs');

            // ⚠️ Debug: 전송 전 style attribute 확인
            const maskBeforeSend = htmlWithAbsolutePaths.match(/mask:\s*url\([^)]*\)/gi) || [];
            console.log('[Notion-PDF-DEBUG-SEND] Found', maskBeforeSend.length, 'mask: url() patterns before sending to server');
            maskBeforeSend.slice(0, 2).forEach((match, idx) => {
                console.log(`[Notion-PDF-DEBUG-SEND] Mask ${idx + 1}:`, match.substring(0, 150));
            });

            const capturedData = {
                html: htmlWithAbsolutePaths,
                detectedWidth,
                resources: resources,
                metadata: {
                    url: window.location.href,
                    baseUrl: getNormalizedBaseUrl(),
                    title: document.title || 'Notion Page',
                    timestamp: new Date().toISOString()
                }
            };

            console.log('[Notion-PDF] Capture complete', {
                htmlLength: htmlWithAbsolutePaths.length,
                detectedWidth: detectedWidth,
                cssLinks: resources.cssLinks.length,
                inlineStyles: resources.inlineStyles.length,
                scripts: resources.scripts.length,
                icons: resources.icons.length,
                fonts: resources.fonts.length,
                katexResources: resources.katexResources.length,
                videos: resources.videos.length,
                images: resources.images.length,
                otherAssets: resources.otherAssets.length,
                title: capturedData.metadata.title
            });

            // [디버그] HTML에서 style 속성 샘플 출력
            const htmlStyleSamples = html.match(/style="[^"]{0,150}"/gi);
            if (htmlStyleSamples && htmlStyleSamples.length > 0) {
                console.log('[Notion-PDF-DEBUG] HTML style samples after entity decoding (first 2):');
                htmlStyleSamples.slice(0, 2).forEach((sample, idx) => {
                    console.log(`  [${idx}] ${sample}`);
                    console.log(`      Has &quot;: ${sample.includes('&quot;')}, Has actual quotes: ${sample.includes('"') && !sample.startsWith('style="')}`);
                });
            }

            // [디버그] JSON 직렬화 전 capturedData 검증
            console.log('[Notion-PDF-DEBUG] capturedData.html first 200 chars:', capturedData.html.substring(0, 200));
            console.log('[Notion-PDF-DEBUG] Checking for &quot; in HTML:', capturedData.html.includes('&quot;') ? 'FOUND!' : 'Not found');
            const testJSON = JSON.stringify(capturedData);
            console.log('[Notion-PDF-DEBUG] JSON serialization successful, length:', testJSON.length);

            return capturedData;
        } catch (error) {
            console.error('[Notion-PDF] Capture error:', error);
            console.error('[Notion-PDF] Stack trace:', error.stack);
            throw error;
        } finally {
            // Restore original state after capture completes
            console.log('[Notion-PDF] Restoring page to original state...');
            
            try {
                // Restore scrolled toggles to closed state
                console.log('[Notion-PDF-Restore] Closing opened toggles...');
                originalState.openedToggles.forEach(button => {
                    if (button && button.getAttribute('aria-expanded') === 'true') {
                        button.click();
                    }
                });
                
                // Restore img src attributes
                console.log('[Notion-PDF-Restore] Restoring image src attributes...');
                originalState.imgSrcs.forEach((originalSrc, img) => {
                    if (img && img.parentElement) { // Check if element still exists in DOM
                        img.setAttribute('src', originalSrc);
                    }
                });
                
                // Restore src attributes
                console.log('[Notion-PDF-Restore] Restoring src attributes...');
                originalState.srcAttributes.forEach((originalSrc, el) => {
                    if (el && el.parentElement) { // Check if element still exists in DOM
                        el.setAttribute('src', originalSrc);
                    }
                });
                
                // Restore href attributes
                console.log('[Notion-PDF-Restore] Restoring href attributes...');
                originalState.hrefAttributes.forEach((originalHref, el) => {
                    if (el && el.parentElement) { // Check if element still exists in DOM
                        el.setAttribute('href', originalHref);
                    }
                });
                
                // Restore CSS link hrefs
                console.log('[Notion-PDF-Restore] Restoring CSS link hrefs...');
                originalState.cssLinkHrefs.forEach((originalHref, link) => {
                    if (link && link.parentElement) { // Check if element still exists in DOM
                        link.setAttribute('href', originalHref);
                    }
                });
                
                // Restore scroll position
                console.log('[Notion-PDF-Restore] Restoring scroll position...');
                window.scrollTo(originalState.scrollPosition.x, originalState.scrollPosition.y);
                
                console.log('[Notion-PDF-Restore] Page restoration complete');
            } catch (restoreError) {
                console.error('[Notion-PDF-Restore] Error restoring page:', restoreError);
            }
        }
    }

    // Listen for messages from popup
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === 'captureContent') {
            console.log('[Notion-PDF] Capture request received');
            
            // Ensure config is loaded before capturing
            loadConfig().then(() => {
                console.log('[Notion-PDF] Config verified before capture, SERVER_URL =', CONFIG.SERVER_URL);
                return capturePageContent();
            })
                .then(data => {
                    console.log('[Notion-PDF] Sending captured data back to popup');
                    sendResponse({ success: true, data });
                })
                .catch(error => {
                    console.error('[Notion-PDF] Capture failed:', error.message);
                    sendResponse({ success: false, error: error.message });
                });
            
            // Return true to indicate we'll send response asynchronously
            return true;
        }
    });
})();
