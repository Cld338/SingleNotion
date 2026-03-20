const { Readable } = require('stream');
const logger = require('../utils/logger');
const browserPool = require('../utils/browserPool');
const URLPathConverter = require('../utils/urlPathConverter');
const CSSTemplates = require('../utils/cssTemplates');
const PageEvaluationScripts = require('../utils/pageEvaluationScripts');
const { log } = require('console');

class PdfService {
    /**
     * HTML 내의 모든 상대 경로를 절대 경로로 변환합니다
     * 
     * Notion 페이지에서 추출한 HTML에 포함된 이미지, 링크, 스크립트 등의
     * 상대 경로(예: ./image.png, ../resource/style.css)를 절대 URL로 변환합니다.
     * base URL을 기준으로 모든 경로를 정규화합니다.
     * 
     * @param {string} html - 변환할 HTML 문자열
     * @param {string} baseUrl - 기준이 될 Notion 페이지의 URL
     * @returns {string} 모든 상대 경로가 절대 경로로 변환된 HTML 문자열
     * 
     * 예시:
     *   입력: <img src="image.png"> with baseUrl="https://notion.so/page"
     *   출력: <img src="https://notion.so/image.png">
     */
    convertRelativeToAbsolutePaths(html, baseUrl) {
        return URLPathConverter.convertAll(html, baseUrl);
    }

    /**
     * CSS 텍스트 내의 url() 함수 경로를 proxy-asset 요청으로 변환합니다 (서버 측)
     * 
     * CSS 내 url() 함수의 외부 리소스 경로를 서버의 proxy-asset 엔드포인트로 변환하여,
     * PDF 생성 시 모든 리소스가 프록시를 통해 로드되도록 합니다.
     * 이미 프록시된 경로나 data URI는 변경하지 않습니다.
     * 
     * 주요 기능:
     *   - 절대 URL(http://, https://, //) → /proxy-asset?url=... 변환
     *   - 이미 프록시된 경로는 그대로 유지
     *   - data URI는 변경 없음 (인라인 리소스)
     *   - 변환된 각 경로를 로깅
     * 
     * @param {string} cssText - CSS 텍스트 (스타일 태그 내용 또는 속성값)
     * @returns {string} url() 경로가 프록시로 변환된 CSS 텍스트
     * 
     * 예시:
     *   입력: url("https://notion.site/icon.svg")
     *   출력: url('/proxy-asset?url=https%3A%2F%2Fnotion.site%2Ficon.svg')
     */
    convertCssUrlsToProxyAsset(cssText) {
        if (!cssText) return cssText;

        return cssText.replace(
            /url\(\s*['"]?(?!(?:\/proxy-asset|data:))([^)'"]+)['"]?\s*\)/gi,
            (match, urlPath) => {
                // 경로 정리 (앞뒤 공백 제거)
                urlPath = urlPath.trim();
                
                // 이미 proxy-asset이거나 data URI는 그대로
                if (urlPath.includes('/proxy-asset') || urlPath.startsWith('data:')) {
                    return match;
                }
                
                // 절대 경로(http/https 포함)는 proxy-asset으로 변환
                if (urlPath.startsWith('http://') || urlPath.startsWith('https://') || urlPath.startsWith('//')) {
                    const absolutePath = urlPath.startsWith('//') ? 'https:' + urlPath : urlPath;
                    const proxiedUrl = `/proxy-asset?url=${encodeURIComponent(absolutePath)}`;
                    logger.debug(`[PdfService] Converting CSS url path: ${urlPath.substring(0, 60)}...`);
                    return `url('${proxiedUrl}')`;
                }
                
                return match;
            }
        );
    }

    /**
     * Notion 페이지를 분석하여 미리보기용 데이터를 수집합니다
     * 
     * 주어진 Notion 페이지 URL을 Puppeteer 브라우저로 열고, 페이지의 콘텐츠를
     * 완전히 로드할 때까지 대기한 후 다음 정보를 수집합니다:
     *   - 감지된 콘텐츠 너비
     *   - HTML 코드
     *   - 모든 리소스 (CSS, 이미지, 폰트, 스크립트, KaTeX 등)
     *   - 디버그 정보
     * 
     * 로딩 완료 조건:
     *   1. 모든 CSS 스타일시트 로드 완료
     *   2. 웹 폰트 로드 완료
     *   3. KaTeX/MathJax 수식 렌더링 완료
     *   4. Notion 토글 블록 모두 펼침
     *   5. CSS 애니메이션 및 렌더링 완료
     * 
     * 수집되는 리소스:
     *   - CSS 링크 및 인라인 스타일
     *   - 이미지 (img, picture 태그)
     *   - 아이콘 (favicon, apple-touch-icon)
     *   - 웹 폰트
     *   - 스크립트 (외부/인라인)
     *   - KaTeX 리소스
     *   - 비디오/오디오 미디어
     *   - 기타 자산 (_assets 폴더)
     * 
     * 모든 리소스 경로는 절대 경로로 변환됩니다.
     * 
     * @param {string} url - 분석할 Notion 페이지의 URL
     * @param {Object} options - 미리보기 옵션
     * @returns {Promise<Object>} 수집된 미리보기 데이터
     *   - detectedWidth: {number} 감지된 페이지 콘텐츠 너비 (픽셀)
     *   - html: {string} 추출된 HTML 코드
     *   - resources: {Object} 수집된 모든 리소스
     *   - debug: {Object} 디버그 정보 (리소스 개수 등)
     * 
     * @throws {Error} 페이지 로드 실패 또는 기타 브라우저 에러
     */
    async getPreviewData(url, options={}) {
        const browser = await browserPool.acquire();
        let page = null;

        try {
            page = await browser.newPage();

            // 보안 패치 로직
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
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            await page.setViewport({ width: 3000, height: 1000 });
            await page.goto(url, { waitUntil: 'networkidle2' });

            // CSS와 JS 로딩이 완료될 때까지 대기
            logger.info('Waiting for CSS and JS to load completely...');
            
            await page.evaluate(async () => {
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
                    await Promise.all(styleloadPromises);
                }
                
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
                
                // 4. ✅ KaTeX/MathJax 렌더링 완료 대기
                try {
                    const hasKaTeX = document.querySelectorAll('.katex').length > 0;
                    if (hasKaTeX) {
                        console.log(`[Preview] Found ${document.querySelectorAll('.katex').length} KaTeX elements`);
                        await new Promise((resolve) => {
                            let isStable = false;
                            let checkCount = 0;
                            const maxChecks = 10;
                            
                            const checkKaTeXReady = () => {
                                checkCount++;
                                const currentKaTeXCount = document.querySelectorAll('.katex').length;
                                console.log(`[Preview-KaTeX] Check ${checkCount}: ${currentKaTeXCount} elements`);
                                
                                if (isStable || checkCount >= maxChecks) {
                                    console.log(`[Preview-KaTeX] Rendering complete`);
                                    resolve();
                                } else {
                                    if (checkCount > 1 && currentKaTeXCount === 
                                        (window._previewKaTeXCount || 0)) {
                                        isStable = true;
                                        console.log(`[Preview-KaTeX] Stable at check ${checkCount}`);
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
                        console.log(`[Preview-MathJax] Found, waiting for typeset...`);
                        try {
                            await Promise.race([
                                window.MathJax.typesetPromise(),
                                new Promise(resolve => setTimeout(resolve, 3000))
                            ]);
                            console.log(`[Preview-MathJax] Typeset complete`);
                        } catch (err) {
                            console.warn(`Preview MathJax typeset error: ${err.message}`);
                        }
                    }
                } catch (err) {
                    console.warn(`Preview KaTeX/MathJax check failed: ${err.message}`);
                }
                
                // 5. ✅ 노션 토글 블록 모두 열기 및 렌더링 대기
                console.log('[Preview-Toggle] Starting to open all toggles...');
                try {
                    let allToggleClosed = false;
                    let iterationCount = 0;
                    const maxIterations = 20; // 무한 루프 방지
                    
                    // 중첩된 토글까지 모두 처리하기 위해 반복 실행
                    while (!allToggleClosed && iterationCount < maxIterations) {
                        iterationCount++;
                        console.log(`[Preview-Toggle] Iteration ${iterationCount}: Checking for closed toggles...`);
                        
                        const toggleButtons = document.querySelectorAll('.notion-toggle-block [role="button"]');
                        const closedToggles = Array.from(toggleButtons).filter(btn => 
                            btn.getAttribute('aria-expanded') === 'false'
                        );
                        
                        console.log(`[Preview-Toggle] Iteration ${iterationCount}: Found ${closedToggles.length} closed toggles`);
                        
                        if (closedToggles.length === 0) {
                            allToggleClosed = true;
                            console.log('[Preview-Toggle] All toggles are now open');
                        } else {
                            // 모든 닫힌 토글 클릭
                            closedToggles.forEach(button => {
                                button.click();
                            });
                            
                            // 렌더링 대기 (새로운 토글이 DOM에 추가될 시간 제공)
                            await new Promise(resolve => setTimeout(resolve, 500));
                            
                            // requestAnimationFrame로 레이아웃 계산 완료 대기
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
                        console.warn('[Preview-Toggle] Max iterations reached, some toggles may still be closed');
                    }
                    
                    // 최종 안정화 대기
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    console.log('[Preview-Toggle] Toggle processing completed');
                } catch (err) {
                    console.warn(`[Preview-Toggle] Error opening toggles: ${err.message}`);
                }
                
                // 6. 추가 지연 (CSS 애니메이션 + 렌더링 완료)
                await new Promise(resolve => setTimeout(resolve, 2000));
            });

            logger.info('CSS and JS loading completed');

            // 콘텐츠 너비, HTML 및 필요한 리소스 추출
            const result = await page.evaluate((opts) => {
                // ✅ CSS url() 변환 함수 (평가 환경에서 실행)
                function convertCssUrlsToProxyAsset(cssText) {
                    if (!cssText) return cssText;
                    
                    return cssText.replace(
                        /url\(\s*['"]?(?!(?:\/proxy-asset|data:))([^)'"]+)['"]?\s*\)/gi,
                        (match, urlPath) => {
                            urlPath = urlPath.trim();
                            
                            // 이미 proxy-asset이거나 data URI는 그대로
                            if (urlPath.includes('/proxy-asset') || urlPath.startsWith('data:')) {
                                return match;
                            }
                            
                            // 절대 경로(http/https 포함)는 proxy-asset으로 변환
                            if (urlPath.startsWith('http://') || urlPath.startsWith('https://') || urlPath.startsWith('//')) {
                                const absolutePath = urlPath.startsWith('//') ? 'https:' + urlPath : urlPath;
                                const proxiedUrl = `/proxy-asset?url=${encodeURIComponent(absolutePath)}`;
                                console.log('[Preview-CSS] Converting CSS url path:', urlPath.substring(0, 60) + '...');
                                return `url('${proxiedUrl}')`;
                            }
                            
                            return match;
                        }
                    );
                }

                // const { includeTitle, includeBanner, includeTags } = opts;

                const includeTitle = true;
                const includeBanner = true;
                const includeTags = true;
            
                
                const contentEl = document.querySelector('.notion-page-content');
                const width = contentEl ? Math.ceil(contentEl.getBoundingClientRect().width) : 1080;
                
                // --- [수정된 부분] 옵션에 따라 HTML 블록들을 추출하여 병합 ---
                let htmlParts = [];
                let addedElements = new Set();
                
                // 중복 추출을 방지하기 위한 헬퍼 함수
                const pushElement = (el) => {
                    if (el && !addedElements.has(el)) {
                        htmlParts.push(el.outerHTML);
                        addedElements.add(el);
                    }
                };

                // --- [추가된 부분] (0) 전역 SVG 심볼(Sprite) 추출 ---
                // 노션 문서 내에 숨겨진 아이콘/도형 정의들을 찾아 함께 포함시킵니다.
                document.querySelectorAll('svg symbol, svg defs').forEach(el => {
                    const parentSvg = el.closest('svg');
                    if (parentSvg && !addedElements.has(parentSvg)) {
                        const clone = parentSvg.cloneNode(true);
                        // 미리보기 레이아웃을 해치지 않도록 완전히 숨김 처리
                        clone.style.display = 'none';
                        clone.style.position = 'absolute';
                        clone.style.width = '0';
                        clone.style.height = '0';
                        htmlParts.push(clone.outerHTML);
                        addedElements.add(parentSvg);
                    }
                });
                // ---------------------------------------------------

                // (1) 배너 및 아이콘
                if (includeBanner) {
                    const cover = document.querySelector('.layout-full');
                    pushElement(cover);
                    
                    const iconBlock = document.querySelector('.layout-content:nth-child(1) > div > div > .pseudoSelection > div > div > div > div > div > img');
                    if (iconBlock) {
                        pushElement(iconBlock);
                    }
                }
                
                // (2) 제목
                if (includeTitle) {
                    const h1 = document.querySelector('h1');
                    if (h1) {
                        const titleBlock = h1.closest('.notion-page-block') || h1;
                        pushElement(titleBlock);
                    }
                }
                
                // (3) 페이지 속성 (태그)
                if (includeTags) {
                    const tags = document.querySelector('div[aria-label="페이지 속성"], div[aria-label="Page properties"]');
                    if (tags) pushElement(tags);
                }
                
                // (4) 메인 콘텐츠 블록들 (기존의 내용)
                if (contentEl) {
                    htmlParts.push(contentEl.innerHTML);
                }
                
                // 모든 파트를 순서대로 하나의 HTML 문자열로 병합
                const html = htmlParts.join('\n');
                // -------------------------------------------------------------
                
                // 필요한 모든 리소스 수집
                const resources = {
                    cssLinks: [],
                    scripts: [],
                    inlineStyles: [],
                    images: [],
                    icons: [],
                    fonts: [],
                    katexResources: [],
                    videos: [],
                    otherAssets: []
                };
                const debugInfo = {};

                // 1. CSS 링크 수집
                debugInfo.allLinkTags = document.querySelectorAll('link').length;
                debugInfo.stylesheetLinks = document.querySelectorAll('link[rel="stylesheet"]').length;
                
                document.querySelectorAll('link[rel="stylesheet"]').forEach((link, idx) => {
                    const href = link.getAttribute('href');
                    const media = link.getAttribute('media') || 'all';
                    
                    if (href) {
                        resources.cssLinks.push({
                            href: href,
                            media: media,
                            crossorigin: link.getAttribute('crossorigin')
                        });
                    }
                });

                // 2. 아이콘 수집 (favicon, apple-touch-icon 등)
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

                // 3. 웹 폰트 수집 (link 요소와 @font-face)
                document.querySelectorAll('link[href*="font"]').forEach((link) => {
                    const href = link.getAttribute('href');
                    if (href && !resources.cssLinks.some(css => css.href === href)) {
                        resources.fonts.push({ href: href });
                    }
                });

                // 4. 스크립트 수집
                debugInfo.scriptTags = document.querySelectorAll('script').length;
                
                document.querySelectorAll('script').forEach((script, idx) => {
                    if (script.src) {
                        // 외부 스크립트
                        resources.scripts.push({
                            type: 'external',
                            src: script.getAttribute('src'),
                            async: script.hasAttribute('async'),
                            defer: script.hasAttribute('defer')
                        });
                    } else if (script.textContent.trim().length > 0 && script.textContent.length < 500000) {
                        // 인라인 스크립트 (500KB 이하만)
                        resources.scripts.push({
                            type: 'inline',
                            content: script.textContent,
                            contentLength: script.textContent.length
                        });
                    }
                });

                // 5. 인라인 스타일 수집
                debugInfo.allStyleTags = document.querySelectorAll('style').length;
                
                document.querySelectorAll('style').forEach((style, idx) => {
                    const id = style.id || `_style_${idx}`;
                    const contentLength = style.textContent.length;
                    
                    // 매우 큰 스타일만 제외 (1MB 이상)
                    if (contentLength < 1000000) {
                        // ✅ CSS 내 url() 경로를 proxy-asset으로 변환
                        const convertedCssText = convertCssUrlsToProxyAsset(style.textContent);
                        resources.inlineStyles.push({
                            id: id,
                            content: convertedCssText
                        });
                    }
                });

                // ✅ 또한 요소의 style 속성 내 url() 경로도 처리 (인라인 스타일)
                console.log('[Preview] Converting inline style attributes with url()...');
                document.querySelectorAll('[style*="url"]').forEach((el) => {
                    const styleAttr = el.getAttribute('style');
                    if (styleAttr && styleAttr.includes('url(')) {
                        const convertedStyle = convertCssUrlsToProxyAsset(styleAttr);
                        el.setAttribute('style', convertedStyle);
                    }
                });

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

                // 7. KaTeX 리소스 수집
                const katexLinks = document.querySelectorAll('link[href*="katex"]');
                const katexScripts = document.querySelectorAll('script[src*="katex"]');
                
                katexLinks.forEach((link) => {
                    resources.katexResources.push({
                        type: 'link',
                        href: link.getAttribute('href')
                    });
                });

                katexScripts.forEach((script) => {
                    resources.katexResources.push({
                        type: 'script',
                        src: script.getAttribute('src')
                    });
                });

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
                    
                    // source 태그의 src도 수집
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

                // 9. _assets 폴더 참조 찾기 (CSS, script, img src에서)
                const assetPattern = /_assets|/gm;
                const allResourceText = JSON.stringify(resources);
                
                if (assetPattern.test(allResourceText)) {
                    debugInfo.hasAssets = true;
                }

                // 10. 기타 확장자 리소스 수집 (SVG, WebP 등)
                document.querySelectorAll('[href*="_assets"], [src*="_assets"]').forEach((el) => {
                    const href = el.getAttribute('href') || el.getAttribute('src');
                    if (href && !resources.otherAssets.some(a => a.url === href)) {
                        resources.otherAssets.push({
                            url: href,
                            type: el.tagName.toLowerCase()
                        });
                    }
                });

                debugInfo.imageCount = resources.images.length;
                debugInfo.scriptCount = resources.scripts.length;
                debugInfo.iconCount = resources.icons.length;
                debugInfo.fontCount = resources.fonts.length;
                debugInfo.katexCount = resources.katexResources.length;
                debugInfo.videoCount = resources.videos.length;
                debugInfo.assetCount = resources.otherAssets.length;

                // 메타 정보 함께 반환
                return {
                    detectedWidth: width,
                    html: html,
                    resources: resources,
                    debug: debugInfo
                };
            }, options);

            logger.info(`getPreviewData - Debug: ${JSON.stringify(result.debug)}`);
            logger.info(`getPreviewData - Width: ${result.detectedWidth}`);
            
            // ⚠️ Debug: 서버 수신 HTML에서 mask 속성 확인
            const maskMatches = result.html.match(/mask:\s*url\([^)]*\)/gi) || [];
            logger.info(`[DEBUG] mask: url() patterns received from client: ${maskMatches.length}`);
            maskMatches.slice(0, 3).forEach((match, idx) => {
                logger.debug(`[DEBUG] Mask ${idx + 1}: ${match.substring(0, 100)}`);
            });
            
            logger.info(`getPreviewData - Resources Summary:`);
            logger.info(`  - CSS Links: ${result.resources.cssLinks.length}`);
            logger.info(`  - Scripts: ${result.resources.scripts.length}`);
            logger.info(`  - Inline Styles: ${result.resources.inlineStyles.length}`);
            logger.info(`  - Images: ${result.resources.images.length}`);
            logger.info(`  - Icons: ${result.resources.icons.length}`);
            logger.info(`  - Fonts: ${result.resources.fonts.length}`);
            logger.info(`  - KaTeX Resources: ${result.resources.katexResources.length}`);
            logger.info(`  - Videos/Media: ${result.resources.videos.length}`);
            logger.info(`  - Other Assets: ${result.resources.otherAssets.length}`);
            
            // 상세 로그 (DEBUG 레벨)
            result.resources.cssLinks.forEach((css, idx) => {
                logger.debug(`CSS[${idx + 1}]: ${css.href}`);
            });
            
            result.resources.images.forEach((img, idx) => {
                logger.debug(`Image[${idx + 1}]: ${img.src}`);
            });
            
            result.resources.icons.forEach((icon, idx) => {
                logger.debug(`Icon[${idx + 1}]: ${icon.href}`);
            });
            
            result.resources.scripts.filter(s => s.type === 'external').forEach((script, idx) => {
                logger.debug(`Script[${idx + 1}]: ${script.src}`);
            });
            
            result.resources.katexResources.forEach((katex, idx) => {
                logger.debug(`KaTeX[${idx + 1}]: ${katex.src || katex.href}`);
            });

            // 상대 경로를 절대 경로로 변환
            result.html = this.convertRelativeToAbsolutePaths(result.html, url);
            
            // 모든 리소스 링크를 절대 경로로 변환
            result.resources.cssLinks = result.resources.cssLinks.map(css => {
                try {
                    const converted = this.convertRelativeToAbsolutePaths(`<link href="${css.href}">`, url);
                    const match = converted.match(/href="([^"]+)"/);
                    const resolvedHref = match ? match[1] : css.href;
                    return { ...css, href: resolvedHref };
                } catch (err) {
                    logger.warn(`Failed to convert CSS href: ${css.href} - ${err.message}`);
                    return css;
                }
            });
            
            // 이미지 경로 변환
            result.resources.images = result.resources.images.map(img => {
                try {
                    const converted = this.convertRelativeToAbsolutePaths(`<img src="${img.src}">`, url);
                    const match = converted.match(/src="([^"]+)"/);
                    const resolvedSrc = match ? match[1] : img.src;
                    return { ...img, src: resolvedSrc };
                } catch (err) {
                    logger.warn(`Failed to convert image src: ${img.src} - ${err.message}`);
                    return img;
                }
            });
            
            // 아이콘 경로 변환
            result.resources.icons = result.resources.icons.map(icon => {
                try {
                    const converted = this.convertRelativeToAbsolutePaths(`<link href="${icon.href}">`, url);
                    const match = converted.match(/href="([^"]+)"/);
                    const resolvedHref = match ? match[1] : icon.href;
                    return { ...icon, href: resolvedHref };
                } catch (err) {
                    logger.warn(`Failed to convert icon href: ${icon.href} - ${err.message}`);
                    return icon;
                }
            });
            
            // 폰트 경로 변환
            result.resources.fonts = result.resources.fonts.map(font => {
                try {
                    const converted = this.convertRelativeToAbsolutePaths(`<link href="${font.href}">`, url);
                    const match = converted.match(/href="([^"]+)"/);
                    const resolvedHref = match ? match[1] : font.href;
                    return { ...font, href: resolvedHref };
                } catch (err) {
                    logger.warn(`Failed to convert font href: ${font.href} - ${err.message}`);
                    return font;
                }
            });
            
            // 스크립트 경로 변환 (외부 스크립트만)
            result.resources.scripts = result.resources.scripts.map(script => {
                if (script.type === 'external') {
                    try {
                        const converted = this.convertRelativeToAbsolutePaths(`<script src="${script.src}"></script>`, url);
                        const match = converted.match(/src="([^"]+)"/);
                        const resolvedSrc = match ? match[1] : script.src;
                        return { ...script, src: resolvedSrc };
                    } catch (err) {
                        logger.warn(`Failed to convert script src: ${script.src} - ${err.message}`);
                        return script;
                    }
                }
                return script;
            });
            
            // KaTeX 리소스 경로 변환
            result.resources.katexResources = result.resources.katexResources.map(katex => {
                try {
                    if (katex.type === 'link') {
                        const converted = this.convertRelativeToAbsolutePaths(`<link href="${katex.href}">`, url);
                        const match = converted.match(/href="([^"]+)"/);
                        const resolvedHref = match ? match[1] : katex.href;
                        return { ...katex, href: resolvedHref };
                    } else {
                        const converted = this.convertRelativeToAbsolutePaths(`<script src="${katex.src}"></script>`, url);
                        const match = converted.match(/src="([^"]+)"/);
                        const resolvedSrc = match ? match[1] : katex.src;
                        return { ...katex, src: resolvedSrc };
                    }
                } catch (err) {
                    logger.warn(`Failed to convert KaTeX resource - ${err.message}`);
                    return katex;
                }
            });
            
            // 비디오/미디어 경로 변환
            result.resources.videos = result.resources.videos.map(video => {
                try {
                    const converted = this.convertRelativeToAbsolutePaths(`<source src="${video.src}">`, url);
                    const match = converted.match(/src="([^"]+)"/);
                    const resolvedSrc = match ? match[1] : video.src;
                    return { ...video, src: resolvedSrc };
                } catch (err) {
                    logger.warn(`Failed to convert video src: ${video.src} - ${err.message}`);
                    return video;
                }
            });
            
            // 기타 assets 경로 변환
            result.resources.otherAssets = result.resources.otherAssets.map(asset => {
                try {
                    const converted = this.convertRelativeToAbsolutePaths(`<a href="${asset.url}">`, url);
                    const match = converted.match(/href="([^"]+)"/);
                    const resolvedUrl = match ? match[1] : asset.url;
                    return { ...asset, url: resolvedUrl };
                } catch (err) {
                    logger.warn(`Failed to convert asset url: ${asset.url} - ${err.message}`);
                    return asset;
                }
            });

            logger.info(`Preview data collected - Width: ${result.detectedWidth}, Resources - CSS: ${result.resources.cssLinks.length}, Images: ${result.resources.images.length}, Icons: ${result.resources.icons.length}, Fonts: ${result.resources.fonts.length}, Scripts: ${result.resources.scripts.length}, KaTeX: ${result.resources.katexResources.length}, Videos: ${result.resources.videos.length}`);

            return result;
        } finally {
            // ✅ 명시적 정리 추가
            try {
                if (page) {
                    page.removeAllListeners();
                    await this._cleanupPageResources(page);
                }
            } catch (err) {
                logger.warn(`Error during getPreviewData cleanup: ${err.message}`);
            }
            
            try {
                await browserPool.release(browser);
            } catch (err) {
                logger.warn(`Error releasing browser from pool: ${err.message}`);
            }
        }
    }

    /**
     * Notion 페이지를 PDF로 변환하여 스트림으로 반환합니다
     * 
     * 주어진 Notion 페이지 URL을 열고, 다음 단계를 거쳐 PDF를 생성합니다:
     *   1. 페이지 초기화 및 보안 설정
     *   2. Notion 페이지 로드
     *   3. 토글 블록 펼치기
     *   4. KaTeX CSS 주입
     *   5. 페이지 치수 계산 및 스타일 최적화
     *   6. KaTeX 렌더링 검증
     *   7. 최종 뷰포트 조정
     *   8. 스크린샷 캡처 (선택사항)
     *   9. PDF 생성
     *   10. 리소스 정리 핸들러 등록
     * 
     * PDF 스트림은 자동으로 메모리를 정리하고, 에러 발생 시에도 리소스를 정리합니다.
     * 
     * @param {string} url - 변환할 Notion 페이지의 URL
     * @param {Object} options - PDF 생성 옵션
     * @param {number} [options.marginTop=0] - 상단 여백 (픽셀)
     * @param {number} [options.marginBottom=0] - 하단 여백 (픽셀)
     * @param {number} [options.marginLeft=0] - 좌측 여백 (픽셀)
     * @param {number} [options.marginRight=0] - 우측 여백 (픽셀)
     * @param {number} [options.pageWidth] - PDF 페이지 너비 (픽셀, 미지정 시 자동)
     * @param {string} [options.screenshotPath] - 디버그용 스크린샷 저장 경로
     * 
     * @returns {Promise<Object>} PDF 생성 결과
     *   - stream: {ReadableStream} PDF 데이터의 읽기 스트림
     *   - detectedWidth: {number} 감지된 페이지 너비
     * 
     * @throws {Error} PDF 생성 실패 또는 페이지 로드 실패
     */
    async generatePdf(url, options) {
        const browser = await browserPool.acquire();
        let page = null;

        try {
            page = await browser.newPage();

            // ✅ 브라우저 페이지 초기화
            await this._setupBrowserPage(page);

            // 로깅 및 옵션 추출
            const { includeBanner, includeTitle, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight, pageWidth, screenshotPath } = options;
            
            logger.info(`Margin - Top: ${marginTop}, Bottom: ${marginBottom}, Left: ${marginLeft}, Right: ${marginRight}`);
            
            // ✅ 페이지 이동
            await this._navigateToPage(page, url);

            // ✅ Notion 토글 블록 모두 펼치기
            await this._openAllToggleBlocks(page);

            // ✅ KaTeX CSS 주입
            await this._injectKaTeXCSS(page);

            // ✅ [Extension 로직 이식] 너비 자동 감지 및 스타일 최적화
            const dimensions = await this._calculatePageDimensions(page, { includeBanner, includeTitle, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight, pageWidth });

            // ✅ PDF 생성 전 최종 KaTeX 렌더링 검증
            await this._validateKaTeXRendering(page);

            // ✅ 최종 뷰포트 조정 및 PDF 크기 계산
            const pdfOptions = await this._adjustFinalViewport(page, dimensions);

            // ✅ 디버그용 스크린샷 캡처 (선택사항)
            await this._captureScreenshot(page, screenshotPath);

            // ✅ PDF 생성
            const nodeStream = await this._createPDFStream(page, pdfOptions);

            // ✅ 스트림 정리 핸들러 등록
            await this._attachStreamCleanupHandlers(nodeStream, page, browser);

            return {
                stream: nodeStream,
                detectedWidth: dimensions.width
            };

        } catch (error) {
            logger.error(`PDF Generation failed: ${error.message}`);
            
            // ✅ 에러 발생 시에도 명시적 정리
            try {
                await this._cleanupPageResources(page);
                await browserPool.release(browser);
            } catch (cleanupErr) {
                logger.warn(`Error during exception cleanup: ${cleanupErr.message}`);
            }
            
            throw error;
        }
    }

    /**
     * Puppeteer 페이지를 PDF 생성을 위해 초기화합니다
     * 
     * 보안 설정, 사용자 에이전트, 초기 뷰포트를 설정합니다.
     * 
     * 설정 항목:
     *   1. Request Interception - Notion 도메인 및 로컬 요청만 허용
     *   2. User Agent - Chrome 브라우저로 식별
     *   3. Viewport - 3000x1000 (데스크톱 레이아웃 유도)
     *   4. Navigation Timeout - 120초
     * 
     * @param {Page} page - Puppeteer 페이지 인스턴스
     * @returns {Promise<void>}
     * @private
     */
    async _setupBrowserPage(page) {
        // 보안 패치: 요청 필터링
        await page.setRequestInterception(true);
        page.on('request', request => {
            const reqUrl = request.url().split('?')[0];
            const isMainFrame = request.isNavigationRequest() && request.frame() === page.mainFrame();

            // 유효한 프로토콜만 허용
            if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://') && !reqUrl.startsWith('data:')) {
                return request.abort();
            }

            // 메인 프레임: Notion 도메인만 허용
            if (isMainFrame) {
                const isNotionDomain = /^https?:\/\/([a-zA-Z0-9-]+\.)?(notion\.so|notion\.site)/.test(reqUrl);
                if (!isNotionDomain) return request.abort();
            }

            // 로컬 요청 차단
            const isLocal = /^(http|https):\/\/(localhost|127\.|192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|::1)/.test(reqUrl);
            if (isLocal) return request.abort();

            request.continue();
        });

        // 타이머 및 브라우저 환경 설정
        page.setDefaultNavigationTimeout(120000);
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
        
        // 초기 뷰포트: 데스크톱 레이아웃 유도
        await page.setViewport({ width: 3000, height: 1000 });
    }

    /**
     * Notion 페이지로 이동하고 네트워크 안정화를 대기합니다
     * 
     * 모든 네트워크 요청이 완료될 때까지 대기하여 페이지가
     * 완전히 로드되었음을 보장합니다.
     * 
     * @param {Page} page - Puppeteer 페이지 인스턴스
     * @param {string} url - 이동할 Notion 페이지 URL
     * @returns {Promise<void>}
     * @private
     */
    async _navigateToPage(page, url) {
        logger.info(`Navigating to URL: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle0' });
        logger.info('Page navigation completed');
    }

    /**
     * Notion 페이지의 모든 토글 블록을 펼칩니다
     * 
     * 중첩된 토글을 포함하여 페이지 내 모든 토글 블록을 반복적으로 열고,
     * 각 반복마다 렌더링이 완료될 때까지 대기합니다.
     * 
     * 최대 반복 횟수(20회)에 도달하면 작업을 종료합니다.
     * (무한 루프 방지)
     * 
     * @param {Page} page - Puppeteer 페이지 인스턴스
     * @returns {Promise<void>}
     * @private
     */
    async _openAllToggleBlocks(page) {
        logger.info('[PDF-Toggle] Starting to open all toggles...');
        try {
            let allToggleClosed = false;
            let iterationCount = 0;
            const maxIterations = 20; // 무한 루프 방지
            
            // 중첩된 토글까지 모두 처리하기 위해 반복 실행
            while (!allToggleClosed && iterationCount < maxIterations) {
                iterationCount++;
                
                const toggleInfo = await page.evaluate(() => {
                    const toggleButtons = document.querySelectorAll('.notion-toggle-block [role="button"]');
                    const closedToggles = Array.from(toggleButtons).filter(btn => 
                        btn.getAttribute('aria-expanded') === 'false'
                    );
                    
                    return {
                        totalCount: toggleButtons.length,
                        closedCount: closedToggles.length
                    };
                });
                
                logger.debug(`[PDF-Toggle] Iteration ${iterationCount}: Total=${toggleInfo.totalCount}, Closed=${toggleInfo.closedCount}`);
                
                if (toggleInfo.closedCount === 0) {
                    allToggleClosed = true;
                    logger.info('[PDF-Toggle] All toggles are now open');
                } else {
                    // 모든 닫힌 토글 클릭
                    await page.evaluate(() => {
                        const toggleButtons = document.querySelectorAll('.notion-toggle-block [role="button"]');
                        const closedToggles = Array.from(toggleButtons).filter(btn => 
                            btn.getAttribute('aria-expanded') === 'false'
                        );
                        closedToggles.forEach(button => {
                            button.click();
                        });
                    });
                    
                    // 렌더링 대기
                    await page.waitForTimeout(500);
                    
                    // requestAnimationFrame 대기 (레이아웃 계산 완료)
                    await page.evaluate(() => {
                        return new Promise(resolve => {
                            requestAnimationFrame(() => {
                                requestAnimationFrame(() => {
                                    resolve();
                                });
                            });
                        });
                    });
                }
            }
            
            if (iterationCount >= maxIterations) {
                logger.warn('[PDF-Toggle] Max iterations reached, some toggles may still be closed');
            }
            
            // 최종 안정화 대기
            await page.waitForTimeout(1000);
            logger.info('[PDF-Toggle] Toggle processing completed');
        } catch (err) {
            logger.warn(`[PDF-Toggle] Error opening toggles: ${err.message}`);
        }
    }

    /**
     * KaTeX CSS를 페이지에 주입합니다
     * 
     * CDN에서 KaTeX 스타일시트를 로드하고 페이지에 적용합니다.
     * KaTeX 요소의 수식 렌더링을 개선하기 위해 필요합니다.
     * 
     * CDN 로드 실패해도 계속 진행합니다. (Notion 페이지에 이미 있을 수 있음)
     * 
     * @param {Page} page - Puppeteer 페이지 인스턴스
     * @returns {Promise<number>} 페이지에 로드된 스타일시트의 총 개수
     * @private
     */
    async _injectKaTeXCSS(page) {
        logger.info('Injecting KaTeX CSS for PDF rendering...');
        try {
            await page.addStyleTag({
                url: 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
                crossorigin: 'anonymous'
            });
            logger.info('KaTeX CSS injected successfully');
        } catch (err) {
            // CDN 실패해도 계속 진행 (Notion 페이지에 이미 있을 수 있음)
            logger.debug(`KaTeX CSS injection attempted: ${err.message}`);
        }
        
        // 모든 기존 stylesheet 확인
        const stylesheetCount = await page.evaluate(() => {
            return document.querySelectorAll('link[rel="stylesheet"]').length;
        });
        logger.info(`Found ${stylesheetCount} stylesheets on page`);
        
        return stylesheetCount;
    }

    /**
     * Notion 페이지의 치수를 계산하고 렌더링 최적화를 수행합니다
     * 
     * 페이지 너비를 감지하고, CSS를 동적으로 최적화하며, 
     * 웹 폰트, KaTeX, MathJax 렌더링을 대기합니다.
     * 
     * 반환값:
     *   - height: 계산된 페이지 높이
     *   - width: 감지된 페이지 너비
     *   - padTop, padBottom, padLeft, padRight: 계산된 여백
     *   - scale: PDF 생성 스케일
     * 
     * @param {Page} page - Puppeteer 페이지 인스턴스
     * @param {Object} options - 페이지 옵션 (includeBanner, marginTop, marginBottom 등)
     * @returns {Promise<Object>} 페이지 치수 정보
     * @private
     */
    async _calculatePageDimensions(page, options) {
        // ... (이미 구현됨)
    }

    /**
     * KaTeX 렌더링 상태를 검증합니다
     * 
     * PDF 생성 전에 KaTeX 요소들이 올바르게 렌더링되었는지 확인합니다.
     * - KaTeX 요소의 개수
     * - 폰트 로드 여부
     * - CSS 로드 완료 여부
     * 
     * @param {Page} page - Puppeteer 페이지 인스턴스
     * @returns {Promise<Object>} KaTeX 검증 결과
     *   - count: KaTeX 요소 개수
     *   - status: 상태 ('no-katex', 'rendered', 등)
     *   - fontFamily: 적용된 폰트
     *   - cssLoaded: CSS 로드 여부
     * @private
     */
    async _validateKaTeXRendering(page) {
        const katexStatus = await page.evaluate(() => {
            const katexElements = document.querySelectorAll('.katex');
            const katexCount = katexElements.length;
            
            if (katexCount === 0) {
                return { count: 0, status: 'no-katex', hasCSS: !!document.querySelector('link[href*="katex"]') };
            }
            
            // 첫 번째 KaTeX 요소 검증
            const firstKatex = katexElements[0];
            const computedStyle = window.getComputedStyle(firstKatex);
            const fontFamily = computedStyle.fontFamily;
            
            console.log(`[KaTeX Validation] Count: ${katexCount}, Font: ${fontFamily}`);
            
            // ✅ CSS 로드 확인 (유효한 선택자만 사용)
            const hasKaTeXLink = !!document.querySelector('link[href*="katex"]');
            const hasKaTeXStyleTag = !!document.querySelector('style[data-katex]');
            // style 태그의 textContent 검사
            const hasKaTeXInlineStyle = Array.from(document.querySelectorAll('style')).some(style => 
                style.textContent && style.textContent.includes('.katex')
            );
            const cssLoaded = hasKaTeXLink || hasKaTeXStyleTag || hasKaTeXInlineStyle;
            
            return {
                count: katexCount,
                status: 'rendered',
                fontFamily: fontFamily,
                hasHTML: !!firstKatex.querySelector('.katex-html'),
                cssLoaded: cssLoaded,
                debugCSS: { hasKaTeXLink, hasKaTeXStyleTag, hasKaTeXInlineStyle }
            };
        });
        
        logger.info(`KaTeX Pre-PDF Status: ${JSON.stringify(katexStatus)}`);
        
        if (katexStatus.count > 0 && katexStatus.fontFamily) {
            logger.info(`✅ KaTeX fonts appear to be loaded: ${katexStatus.fontFamily}`);
        } else if (katexStatus.count > 0 && !katexStatus.fontFamily) {
            logger.warn(`⚠️ KaTeX elements found but fonts may not be loaded properly`);
        }
        
        return katexStatus;
    }

    /**
     * 최종 뷰포트를 조정하고 렌더링 완료를 대기합니다
     * 
     * 계산된 치수에 따라 브라우저 뷰포트를 최종 조정하고,
     * 레이아웃 렌더링이 완료될 때까지 대기합니다.
     * 
     * @param {Page} page - Puppeteer 페이지 인스턴스
     * @param {Object} dimensions - 페이지 치수 (height, width, padLeft, padRight 등)
     * @returns {Promise<Object>} 최종 PDF 크기 정보 (pdfWidth, pdfHeight, scale)
     * @private
     */
    async _adjustFinalViewport(page, dimensions) {
        const finalHeight = Math.ceil(dimensions.height) + 100;
        const finalWidth = Math.ceil(dimensions.width + dimensions.padLeft + dimensions.padRight);
        
        logger.info(`Adjusting viewport to ${finalWidth}x${finalHeight}`);
        await page.setViewport({ width: finalWidth + 1000, height: finalHeight });
        
        // 레이아웃 안정화 대기
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        const scale = dimensions.scale;
        const pdfWidth = finalWidth * scale;
        const pdfHeight = finalHeight * scale;
        
        return { pdfWidth, pdfHeight, scale };
    }

    /**
     * 페이지의 스크린샷을 캡처하여 파일로 저장합니다
     * 
     * 디버그 목적으로 PDF 생성 전 페이지의 스크린샷을 캡처합니다.
     * 렌더링된 콘텐츠 영역만 캡처하여 빈 공간을 최소화합니다.
     * 
     * @param {Page} page - Puppeteer 페이지 인스턴스
     * @param {string} screenshotPath - 저장할 스크린샷 파일 경로
     * @returns {Promise<boolean>} 성공 여부
     * @private
     */
    async _captureScreenshot(page, screenshotPath) {
        if (!screenshotPath) return false;
        
        try {
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
                    path: screenshotPath,
                    clip: boundingBox
                });
            } else {
                // 요소를 찾지 못했을 경우의 대비책
                await page.screenshot({ path: screenshotPath, fullPage: true });
            }
            
            logger.info(`Screenshot saved to ${screenshotPath}`);
            return true;
        } catch (err) {
            logger.warn(`Screenshot capture failed: ${err.message}`);
            return false;
        }
    }

    /**
     * 계산된 치수로 PDF를 생성하고 스트림을 반환합니다
     * 
     * Puppeteer의 createPDFStream을 사용하여 PDF를 생성합니다.
     * 페이지 배경색/이미지 포함, 태그 기반 PDF 등의 옵션을 적용합니다.
     * 
     * @param {Page} page - Puppeteer 페이지 인스턴스
     * @param {Object} pdfOptions - PDF 크기 정보 (pdfWidth, pdfHeight, scale)
     * @returns {Promise<ReadableStream>} Node.js 읽기 스트림 형태의 PDF 데이터
     * @private
     */
    async _createPDFStream(page, pdfOptions) {
        const { pdfWidth, pdfHeight, scale } = pdfOptions;
        
        logger.info(`Creating PDF - Width: ${pdfWidth}px, Height: ${pdfHeight}px, Scale: ${scale}`);
        
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
            omitBackground: false  // ✅ 배경색/이미지 포함
        });

        const nodeStream = Readable.fromWeb(pdfWebStream);
        logger.info(`PDF stream created successfully`);
        
        return nodeStream;
    }

    /**
     * PDF 스트림에 정리 핸들러를 등록합니다
     * 
     * 스트림이 종료되거나 에러가 발생할 때 페이지와 브라우저 리소스를
     * 정리하는 이벤트 리스너를 등록합니다.
     * 
     * @param {ReadableStream} stream - PDF 스트림
     * @param {Page} page - Puppeteer 페이지 인스턴스
     * @param {Browser} browser - Puppeteer 브라우저 인스턴스
     * @returns {void}
     * @private
     */
    async _attachStreamCleanupHandlers(stream, page, browser) {
        stream.on('close', async () => {
            try {
                await this._cleanupPageResources(page);
                await browserPool.release(browser);
                logger.debug('Stream closed and resources cleaned up');
            } catch (err) {
                logger.warn(`Error during stream close cleanup: ${err.message}`);
            }
        });

        stream.on('error', async (err) => {
            logger.error(`PDF stream error: ${err.message}`);
            try {
                await this._cleanupPageResources(page);
                await browserPool.release(browser);
            } catch (cleanupErr) {
                logger.warn(`Error during stream error cleanup: ${cleanupErr.message}`);
            }
        });
    }

    /**
     * Puppeteer 페이지 인스턴스의 리소스를 명시적으로 정리합니다
     * (내부 유틸리티 메서드)
     * 
     * 페이지 렌더링이 완료되거나 에러가 발생한 후 메모리 누수를 방지하기 위해
     * 페이지의 모든 이벤트 리스너, 캐시, DOM 내용을 정리하고 페이지를 종료합니다.
     * 
     * 정리 단계:
     *   1. 모든 이벤트 리스너 제거 (request, response, console 등)
     *   2. 페이지 컨텍스트에서 전역 변수 및 DOM 내용 정리
     *   3. 페이지 인스턴스 종료 (closed 상태로 변경)
     * 
     * 정리 중 에러가 발생해도 후속 단계를 계속 수행하여 최대한 리소스를 정리합니다.
     * 
     * @param {Page|null} page - Puppeteer 페이지 인스턴스
     *                           null이면 아무 작업도 수행하지 않음
     * @returns {Promise<void>}
     * 
     * @private
     */
    async _cleanupPageResources(page) {
        if (!page) return;

        try {
            // 1. 모든 이벤트 리스너 제거
            page.removeAllListeners();
            
            // 2. 페이지 컨텍스트 초기화 (가능한 범위 내)
            try {
                await page.evaluate(() => {
                    // 전역 변수 정리
                    window._resources = null;
                    window._assets = null;
                    // DOM 내용 정리
                    document.body.innerHTML = '';
                });
            } catch (evalErr) {
                logger.debug(`Page evaluation cleanup skipped: ${evalErr.message}`);
            }
            
            // 3. 페이지 종료
            await page.close();
            
        } catch (err) {
            logger.warn(`Page cleanup error: ${err.message}`);
        }
    }

    /**
     * PDF 서비스를 종료하고 모든 리소스를 정리합니다
     * 
     * 서버 종료 시 또는 서비스가 더 이상 필요 없을 때 호출되어야 합니다.
     * 브라우저 풀의 모든 브라우저 인스턴스를 정리합니다.
     * 
     * 정리 단계:
     *   1. 브라우저 풀 드레인 (진행 중인 작업 완료 대기)
     *   2. 브라우저 풀 초기화 (모든 브라우저 인스턴스 종료)
     * 
     * 에러 발생 시에도 경고를 로깅하고 계속 진행하여 최대한의 정리를 시도합니다.
     * 
     * @returns {Promise<void>}
     * 
     * 사용 예시:
     *   const pdfService = require('./pdfService');
     *   // ... 서비스 사용 ...
     *   await pdfService.close(); // 서버 종료 전 호출
     */
    async close() {
        try {
            await browserPool.drain();
            await browserPool.clear();
        } catch (err) {
            logger.warn(`Error during service close: ${err.message}`);
        }
    }
}

module.exports = new PdfService();