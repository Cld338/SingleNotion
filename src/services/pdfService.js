const { Readable } = require('stream');
const logger = require('../utils/logger');
const browserPool = require('../utils/browserPool');
const URLPathConverter = require('../utils/urlPathConverter');
const CSSTemplates = require('../utils/cssTemplates');
const PageEvaluationScripts = require('../utils/pageEvaluationScripts');
const { log } = require('console');

class PdfService {
    // 상대 경로를 절대 경로로 변환
    convertRelativeToAbsolutePaths(html, baseUrl) {
        return URLPathConverter.convertAll(html, baseUrl);
    }

    // 노션 페이지의 콘텐츠 너비 및 HTML 측정 (미리보기용)
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
                // const { includeTitle, includeBanner, includeTags } = opts;

                const includeTitle = true;
                const includeBanner = true;
                const includeTags = true;
            
                
                const contentEl = document.querySelector('.notion-page-content');
                const width = contentEl ? Math.ceil(contentEl.getBoundingClientRect().width) + 100 : 1080;
                
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
                        resources.inlineStyles.push({
                            id: id,
                            content: style.textContent
                        });
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

            // ✅ KaTeX CSS를 페이지에 명시적으로 주입 (PDF 렌더링 개선)
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
            
            // ✅ 모든 기존 stylesheet 확인
            const stylesheetCount = await page.evaluate(() => {
                return document.querySelectorAll('link[rel="stylesheet"]').length;
            });
            logger.info(`Found ${stylesheetCount} stylesheets on page`);

            // [Extension 로직 이식] 너비 자동 감지 및 스타일 최적화
            const dimensions = await page.evaluate(async (opts) => {
                const { includeTitle, includeBanner, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight, pageWidth } = opts;

                // A. 너비 자동 감지
                const contentEl = document.querySelector('.notion-page-content');
                const detectedWidth = contentEl ? Math.ceil(contentEl.getBoundingClientRect().width) + 100 : 1080;

                const scale = pageWidth ? (pageWidth / detectedWidth) : 1;
                const padTop = (Number(marginTop) || 0) / scale;
                const padBottom = (Number(marginBottom) || 0) / scale;
                const padLeft = (Number(marginLeft) || 0) / scale;
                const padRight = (Number(marginRight) || 0) / scale;

                // ✅ KaTeX CSS 명시적 로드
                const loadKaTeXCSS = async () => {
                    return new Promise((resolve) => {
                        const existingKaTeX = document.querySelector('link[href*="katex"]');
                        if (existingKaTeX) {
                            console.log('[KaTeX] CSS already loaded from CDN');
                            resolve();
                            return;
                        }
                        
                        const link = document.createElement('link');
                        link.rel = 'stylesheet';
                        link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
                        link.crossOrigin = 'anonymous';
                        
                        link.onload = () => {
                            console.log('[KaTeX] CSS loaded successfully');
                            resolve();
                        };
                        
                        link.onerror = () => {
                            console.warn('[KaTeX] CSS load failed, continuing anyway');
                            resolve();
                        };
                        
                        setTimeout(resolve, 3000);
                        document.head.appendChild(link);
                    });
                };
                
                await loadKaTeXCSS();

                // 시각적 완성 대기
                async function waitForVisualComplete() {
                    console.time("VisualComplete");

                    try {
                        await Promise.race([
                            document.fonts.ready,
                            new Promise(resolve => setTimeout(resolve, 5000))
                        ]);
                    } catch (err) {
                        console.warn(`Font loading timeout/error: ${err.message}`);
                    }

                    const visibleImages = Array.from(document.querySelectorAll('img'))
                        .filter(img => {
                            if (!img.src) return false;
                            const rect = img.getBoundingClientRect();
                            return rect.width > 0 && rect.height > 0;
                        })
                        .slice(0, 50);
                    
                    const imagePromises = visibleImages.map(img => {
                        return Promise.race([
                            img.decode().catch(err => {
                                console.warn(`이미지 디코딩 실패: ${img.src}`, err);
                            }),
                            new Promise(resolve => setTimeout(resolve, 1000))
                        ]);
                    });
                    
                    await Promise.all(imagePromises);

                    try {
                        const hasKaTeX = document.querySelectorAll('.katex').length > 0;
                        if (hasKaTeX) {
                            console.log(`[KaTeX] Found ${document.querySelectorAll('.katex').length} KaTeX elements`);
                            await new Promise((resolve) => {
                                let isStable = false;
                                let checkCount = 0;
                                const maxChecks = 10;
                                
                                const checkKaTeXReady = () => {
                                    checkCount++;
                                    const currentKaTeXCount = document.querySelectorAll('.katex').length;
                                    console.log(`[KaTeX] Check ${checkCount}: ${currentKaTeXCount} elements`);
                                    
                                    if (isStable || checkCount >= maxChecks) {
                                        console.log(`[KaTeX] Rendering stable at check ${checkCount}`);
                                        resolve();
                                    } else {
                                        if (checkCount > 1 && currentKaTeXCount === 
                                            (window._previousKaTeXCount || 0)) {
                                            isStable = true;
                                            console.log(`[KaTeX] Rendering complete`);
                                            resolve();
                                        }
                                        window._previousKaTeXCount = currentKaTeXCount;
                                        setTimeout(checkKaTeXReady, 500);
                                    }
                                };
                                
                                checkKaTeXReady();
                            });
                        }
                        
                        if (window.MathJax && window.MathJax.typesetPromise) {
                            console.log(`[MathJax] Found, waiting for typeset...`);
                            try {
                                await Promise.race([
                                    window.MathJax.typesetPromise(),
                                    new Promise(resolve => setTimeout(resolve, 3000))
                                ]);
                                console.log(`[MathJax] Typeset complete`);
                            } catch (err) {
                                console.warn(`MathJax typeset error: ${err.message}`);
                            }
                        }
                    } catch (err) {
                        console.warn(`KaTeX/MathJax check failed: ${err.message}`);
                    }

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

                // 레이아웃 고정 CSS 생성
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

                // 동적 스타일 생성
                const padTopIdx = includeBanner ? 3 : (includeTags ? 4 : 5);
                const totalLayoutWidth = detectedWidth + padLeft + padRight;
                
                const styleTag = document.createElement('style');
                styleTag.id = 'sn-pdf-style';
                styleTag.innerHTML = freezeCSS;
                document.head.appendChild(styleTag);

                // 공백 및 개행 처리
                const spans = document.querySelectorAll('span[data-token-index="0"]');
                spans.forEach(span => {
                    let text = span.textContent;
                    if (text.includes(" ")) text = text.replace(/ /g, '\u00A0');
                    if (text.includes("\t")) text = text.replace(/\t/g, '\u00A0\u00A0\u00A0\u00A0');
                    span.textContent = text;
                });

                window.dispatchEvent(new Event('resize'));
                
                // 페이지 복잡도에 따른 동적 대기
                const elementCount = document.querySelectorAll('*').length;
                const hasKaTeX = document.querySelectorAll('.katex').length > 0;
                const hasMathJax = !!window.MathJax;
                
                let waitTime = 2000;
                
                if (hasKaTeX || hasMathJax) {
                    waitTime = Math.max(2500, waitTime);
                    console.log(`KaTeX/MathJax detected, increasing wait time to ${waitTime}ms`);
                }
                
                if (elementCount > 5000) waitTime = Math.max(3000, waitTime);
                else if (elementCount > 1000) waitTime = Math.max(2500, waitTime);
                else waitTime = Math.max(1500, waitTime);
                
                await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, waitTime)));

                // 최종 높이 재계산
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
                    scale: scale
                };
            }, { includeBanner, includeTitle, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight, pageWidth });

            logger.info(`Calculated scale: ${dimensions.scale}`);

            // ✅ PDF 생성 전 최종 KaTeX 렌더링 검증
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

            // 2. 계산된 높이와 너비로 뷰포트 최종 조정
            const finalHeight = Math.ceil(dimensions.height) + 100;
            const finalWidth = Math.ceil(dimensions.width + dimensions.padLeft + dimensions.padRight);
            
            await page.setViewport({ width: finalWidth + 1000, height: finalHeight });
            
            await new Promise(resolve => setTimeout(resolve, 5000));

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
                omitBackground: false  // ✅ 배경색/이미지 포함
            });

            logger.info(`PDF generated - Width: ${pdfWidth}px, Height: ${pdfHeight}px, Scale: ${scale}`);

            const nodeStream = Readable.fromWeb(pdfWebStream);

            // ✅ 스트림 종료 시 명시적 메모리 정리
            nodeStream.on('close', async () => {
                try {
                    await this._cleanupPageResources(page);
                    await browserPool.release(browser);
                } catch (err) {
                    logger.warn(`Error during stream close cleanup: ${err.message}`);
                }
            });

            nodeStream.on('error', async (err) => {
                logger.error(`PDF stream error: ${err.message}`);
                try {
                    await this._cleanupPageResources(page);
                    await browserPool.release(browser);
                } catch (cleanupErr) {
                    logger.warn(`Error during stream error cleanup: ${cleanupErr.message}`);
                }
            });

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

    // ✅ 새 메서드: 페이지 리소스 명시적 정리
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