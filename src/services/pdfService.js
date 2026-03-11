const { Readable } = require('stream');
const logger = require('../utils/logger');
const browserPool = require('../utils/browserPool');
const { log } = require('console');

class PdfService {
    // 상대 경로를 절대 경로로 변환
    convertRelativeToAbsolutePaths(html, baseUrl) {
        try {
            const parser = new URL(baseUrl);
            const baseOrigin = parser.origin;

            // HTML을 정규식으로 처리하여 상대 경로 변환
            let processedHtml = html;

            // src 속성 변환 (이미지, 스크립트, iframe 등)
            processedHtml = processedHtml.replace(
                /(?:src|href)=["'](?!(?:http|https|data:|\/\/))([^"']+)["']/gi,
                (match, path) => {
                    try {
                        let resolvedUrl;
                        if (path.startsWith('/')) {
                            // 절대 경로(/로 시작): baseOrigin + path
                            resolvedUrl = `${baseOrigin}${path}`;
                        } else {
                            // 상대 경로: baseUrl + path
                            resolvedUrl = new URL(path, baseUrl).href;
                        }
                        return match.replace(path, resolvedUrl);
                    } catch (err) {
                        logger.warn(`Failed to convert path: ${path}, error: ${err.message}`);
                        return match;
                    }
                }
            );

            // background-image URL 변환
            processedHtml = processedHtml.replace(
                /background-image\s*:\s*url\(["']?(?!(?:http|https|data:|\/\/))([^)'"]+)["']?\)/gi,
                (match, path) => {
                    try {
                        let resolvedUrl;
                        if (path.startsWith('/')) {
                            resolvedUrl = `${baseOrigin}${path}`;
                        } else {
                            resolvedUrl = new URL(path, baseUrl).href;
                        }
                        return match.replace(path, resolvedUrl);
                    } catch (err) {
                        logger.warn(`Failed to convert background URL: ${path}`);
                        return match;
                    }
                }
            );

            // style 속성 내의 url() 변환
            processedHtml = processedHtml.replace(
                /style=["']([^"']*)["']/gi,
                (match, styleContent) => {
                    let updatedStyle = styleContent.replace(
                        /url\(["']?(?!(?:http|https|data:|\/\/))([^)'"]+)["']?\)/g,
                        (urlMatch, path) => {
                            try {
                                let resolvedUrl;
                                if (path.startsWith('/')) {
                                    resolvedUrl = `${baseOrigin}${path}`;
                                } else {
                                    resolvedUrl = new URL(path, baseUrl).href;
                                }
                                return `url(${resolvedUrl})`;
                            } catch (err) {
                                logger.warn(`Failed to convert style URL: ${path}`);
                                return urlMatch;
                            }
                        }
                    );
                    return `style="${updatedStyle}"`;
                }
            );

            return processedHtml;
        } catch (err) {
            logger.warn(`Error converting relative paths: ${err.message}`);
            return html;
        }
    }

    // 노션 페이지의 콘텐츠 너비 및 HTML 측정 (미리보기용)
    async getPreviewData(url) {
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

            page.setDefaultNavigationTimeout(60000);
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            await page.setViewport({ width: 3000, height: 1000 });
            await page.goto(url, { waitUntil: 'networkidle0' });

            // CSS와 JS 로딩이 완료될 때까지 대기
            logger.info('Waiting for CSS and JS to load completely...');
            
            await page.evaluate(async () => {
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
                
                // 4. 추가 지연 (CSS 애니메이션 완료)
                await new Promise(resolve => setTimeout(resolve, 2000));
            });

            logger.info('CSS and JS loading completed');

            // 콘텐츠 너비, HTML 및 필요한 리소스 추출
            const result = await page.evaluate(() => {
                const contentEl = document.querySelector('.notion-page-content');
                const width = contentEl ? Math.ceil(contentEl.getBoundingClientRect().width) + 100 : 1080;
                const html = contentEl ? contentEl.innerHTML : '';
                
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
            });

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
            if (page) await page.close();
            await browserPool.release(browser);
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

    /**
     * HTML 콘텐츠로부터 PDF 생성 (standard-edit용)
     * @param {string} htmlContent - HTML 콘텐츠
     * @param {string} format - 종이 크기 (A4, A3, B5, Letter)
     * @param {object} options - 옵션 (margins, pageBreaks, pageWidth 등)
     */
    async generatePdfFromHtml(htmlContent, format, options = {}) {
        const browser = await browserPool.acquire();
        let page = null;

        try {
            page = await browser.newPage();

            // 콘텐츠 너비 설정 (기본값 1080px)
            const contentWidth = options.pageWidth || 1080;
            const marginTop = options.marginTop || 0;
            const marginBottom = options.marginBottom || 0;
            const marginLeft = options.marginLeft || 0;
            const marginRight = options.marginRight || 0;
            const pageBreaks = options.pageBreaks || [];

            // HTML에 페이지 분할 스타일 주입
            let htmlWithPageBreaks = htmlContent;
            
            // 페이지 분할 CSS 생성
            let pageBreakCSS = '<style id="pdf-pagebreak-style">\n';
            if (Array.isArray(pageBreaks) && pageBreaks.length > 0) {
                pageBreaks.forEach(blockIdx => {
                    pageBreakCSS += `[data-block-index="${blockIdx}"] { page-break-after: always !important; break-after: page !important; }\n`;
                });
            }
            pageBreakCSS += '</style>';

            // CSS를 </head> 앞에 삽입 또는 body 시작 부분에 삽입
            if (htmlWithPageBreaks.includes('</head>')) {
                htmlWithPageBreaks = htmlWithPageBreaks.replace('</head>', pageBreakCSS + '</head>');
            } else {
                htmlWithPageBreaks = pageBreakCSS + htmlWithPageBreaks;
            }

            // Data URI로 변환 (상대 경로는 이미 절대 경로로 변환되어 있어야 함)
            const dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(htmlWithPageBreaks)}`;

            // 보안 패치 로직 (data: URI 허용)
            await page.setRequestInterception(true);
            page.on('request', request => {
                const reqUrl = request.url().split('?')[0];
                
                // data: URI는 항상 허용
                if (reqUrl.startsWith('data:')) {
                    return request.continue();
                }

                if (!reqUrl.startsWith('http://') && !reqUrl.startsWith('https://')) {
                    return request.abort();
                }

                request.continue();
            });

            page.setDefaultNavigationTimeout(120000);
            
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36');
            
            // 초기 뷰포트 설정
            await page.setViewport({ width: contentWidth + 1000, height: 1000 });

            // Data URI로 페이지 로드
            await page.goto(dataUri, { waitUntil: 'networkidle0' });

            // 리소스 로딩 완료 대기
            logger.info('Waiting for resources to load in rendered HTML...');
            await page.evaluate(async () => {
                // 1. 모든 스타일시트 로드 완료 확인
                const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
                const styleloadPromises = stylesheets.map(link => {
                    return new Promise((resolve) => {
                        if (link.sheet) {
                            resolve();
                        } else {
                            link.onload = () => resolve();
                            link.onerror = () => resolve();
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
                
                // 3. 이미지 디코딩 대기
                const images = Array.from(document.querySelectorAll('img'));
                const imagePromises = images.map(img => {
                    if (!img.src) return Promise.resolve();
                    return img.decode().catch(err => {
                        console.warn(`이미지 디코딩 실패: ${img.src}`, err);
                    });
                });
                await Promise.all(imagePromises);
                
                // 4. 리플로우 완료 대기
                await new Promise(resolve => {
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            resolve();
                        });
                    });
                });
                
                // 5. 추가 지연 (렌더링 안정화)
                await new Promise(resolve => setTimeout(resolve, 2000));
            });

            logger.info('Resource loading completed for rendered HTML');

            // 콘텐츠 높이 계산
            const contentHeight = await page.evaluate(() => {
                const body = document.body;
                const html = document.documentElement;
                return Math.max(body.scrollHeight, body.clientHeight, html.scrollHeight, html.clientHeight);
            });

            const finalHeight = Math.ceil(contentHeight);
            const finalWidth = Math.ceil(contentWidth + marginLeft + marginRight);
            
            // 최종 뷰포트 조정
            await page.setViewport({ width: finalWidth + 1000, height: finalHeight });
            
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 형식에 따른 종이 크기 설정
            const formatMap = {
                'A4': { width: 210, height: 297 },
                'A3': { width: 297, height: 420 },
                'B5': { width: 176, height: 250 },
                'Letter': { width: 215.9, height: 279.4 }
            };

            const paperSize = formatMap[format] || formatMap['A4'];
            const scale = (paperSize.width - (marginLeft + marginRight) / 10) / (contentWidth / 10);

            logger.info(`PDF Generation: Format=${format}, Scale=${scale.toFixed(4)}, ContentWidth=${contentWidth}px, FinalHeight=${finalHeight}px`);

            // PDF 생성
            const pdfWebStream = await page.createPDFStream({
                width: `${finalWidth}px`,
                height: `${finalHeight}px`,
                scale: scale,
                printBackground: true,
                displayHeaderFooter: false,
                margin: {
                    top: `${marginTop}mm`,
                    bottom: `${marginBottom}mm`,
                    left: `${marginLeft}mm`,
                    right: `${marginRight}mm`
                },
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
                detectedWidth: contentWidth
            };

        } catch (error) {
            logger.error(`PDF Generation from HTML failed: ${error.message}`);
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