/**
 * Content Script for Notion to PDF Extension
 * Captures page DOM and resources
 */

(function() {
    // Configuration - default values
    let CONFIG = {
        SERVER_URL: 'https://notion-pdf.cld338.me'
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
     * HTML 문자열에서 모든 상대 경로를 proxy-asset으로 변환
     * img src, svg href/xlink:href, style의 url() 등 처리
     */
    function convertPathsToProxyAsset(htmlString) {
        if (!htmlString) return htmlString;

        let html = htmlString;

        // 1. img src 변환 (상대 경로만)
        html = html.replace(
            /(?:src)=["'](?!(?:http|https|data:|\/\/))([^"']+)["']/gi,
            (match, path) => {
                const absolutePath = resolveRelativePath(path);
                const proxiedUrl = `/proxy-asset?url=${encodeURIComponent(absolutePath)}`;
                return match.replace(path, proxiedUrl);
            }
        );

        // 2. SVG xlink:href 변환
        html = html.replace(
            /xlink:href=["'](?!(?:http|https|data:|\/\/|#))([^"']+)["']/gi,
            (match, path) => {
                const absolutePath = resolveRelativePath(path);
                const proxiedUrl = `/proxy-asset?url=${encodeURIComponent(absolutePath)}`;
                return match.replace(path, proxiedUrl);
            }
        );

        // 3. SVG href 변환 (xlink:href 아님)
        html = html.replace(
            /(?<!xlink:)href=["'](?!(?:http|https|data:|\/\/|#))([^"']+)["']/gi,
            (match, path) => {
                const absolutePath = resolveRelativePath(path);
                const proxiedUrl = `/proxy-asset?url=${encodeURIComponent(absolutePath)}`;
                return match.replace(path, proxiedUrl);
            }
        );

        // 4. style 속성 내 url() 변환
        html = html.replace(
            /style=["']([^"']*)["']/gi,
            (match, styleContent) => {
                const updatedStyle = styleContent.replace(
                    /url\s*\(\s*([^)]*)\s*\)/g,
                    (urlMatch, rawPath) => {
                        const cleanPath = rawPath.trim().replace(/^["']|["']$/g, '');
                        if (cleanPath.startsWith('http') || cleanPath.startsWith('data:') || cleanPath.startsWith('//')) {
                            return urlMatch;
                        }
                        const absolutePath = resolveRelativePath(cleanPath);
                        const proxiedUrl = `/proxy-asset?url=${encodeURIComponent(absolutePath)}`;
                        return `url("${proxiedUrl}")`;
                    }
                );
                return `style="${updatedStyle}"`;
            }
        );

        // 5. <style> 태그 내 url() 변환
        html = html.replace(
            /<style[^>]*>([^<]*)<\/style>/gi,
            (match, styleContent) => {
                const updatedStyle = styleContent.replace(
                    /url\s*\(\s*([^)]*)\s*\)/g,
                    (urlMatch, rawPath) => {
                        const cleanPath = rawPath.trim().replace(/^["']|["']$/g, '');
                        if (cleanPath.startsWith('http') || cleanPath.startsWith('data:') || cleanPath.startsWith('//') || cleanPath.startsWith('#')) {
                            return urlMatch;
                        }
                        const absolutePath = resolveRelativePath(cleanPath);
                        const proxiedUrl = `/proxy-asset?url=${encodeURIComponent(absolutePath)}`;
                        return `url("${proxiedUrl}")`;
                    }
                );
                return match.replace(styleContent, updatedStyle);
            }
        );

        return html;
    }

    /**
     * CSS 파일을 fetch해서 내용을 inline으로 변환
     * CSS 내의 상대 경로도 proxy-asset으로 래핑
     */
    async function fetchAndInlineCss(cssUrl) {
        try {
            const response = await fetch(cssUrl);
            if (!response.ok) {
                console.warn('[Notion-PDF] Failed to fetch CSS:', cssUrl, response.status);
                return null;
            }

            let cssContent = await response.text();

            // CSS 내의 url() 경로를 proxy-asset으로 변환
            cssContent = cssContent.replace(
                /url\s*\(\s*([^)]*)\s*\)/g,
                (match, rawPath) => {
                    const cleanPath = rawPath.trim().replace(/^["']|["']$/g, '');
                    
                    // 이미 절대 경로이거나 데이터 URI인 경우
                    if (cleanPath.startsWith('http') || cleanPath.startsWith('data:') || cleanPath.startsWith('//') || cleanPath.startsWith('#')) {
                        return match;
                    }

                    // CSS URL을 기준으로 상대 경로 절대화
                    try {
                        const absolutePath = new URL(cleanPath, cssUrl).href;
                        const proxiedUrl = `/proxy-asset?url=${encodeURIComponent(absolutePath)}`;
                        return `url("${proxiedUrl}")`;
                    } catch (err) {
                        console.warn('[Notion-PDF] Failed to resolve CSS path:', cleanPath, cssUrl);
                        return match;
                    }
                }
            );

            return cssContent;
        } catch (err) {
            console.error('[Notion-PDF] Error fetching CSS:', cssUrl, err);
            return null;
        }
    }

    /**
     * Converts all images in the document to base64 data URIs
     * Falls back to proxy URL if CORS-blocked or conversion failed
     */
    function convertImagesToBase64(htmlElement) {
        const images = htmlElement.querySelectorAll('img');
        const promises = Array.from(images).map(img => {
            return new Promise((resolve) => {
                // Skip if already data URI
                if (img.src && img.src.startsWith('data:')) {
                    resolve();
                    return;
                }

                // Skip very small or data URIs
                if (!img.src || img.src.length < 5) {
                    resolve();
                    return;
                }

                const originalSrc = img.src;
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const tempImg = new Image();
                
                // Don't set crossOrigin on local/relative URLs
                if (img.src.startsWith('http')) {
                    tempImg.crossOrigin = 'anonymous';
                }
                
                let loadCalled = false;
                let errorCalled = false;

                tempImg.onload = function() {
                    if (errorCalled || loadCalled) return;
                    loadCalled = true;

                    try {
                        canvas.width = tempImg.width;
                        canvas.height = tempImg.height;
                        ctx.drawImage(tempImg, 0, 0);
                        img.src = canvas.toDataURL('image/png', 0.8);
                        console.log('[Notion-PDF] Image converted to base64:', img.src.substring(0, 50) + '...');
                        resolve();
                    } catch (e) {
                        // Canvas tainted or other error - use proxy URL
                        errorCalled = true;
                        console.warn('[Notion-PDF] Canvas error, using proxy URL for:', originalSrc.substring(0, 80));
                        const proxyUrl = `${CONFIG.SERVER_URL}/proxy-image?url=${encodeURIComponent(originalSrc)}`;
                        console.log('[Notion-PDF] Setting proxy URL:', proxyUrl.substring(0, 120) + '...');
                        
                        // Remove crossOrigin to allow proxy image loading without CORS
                        if (img.hasAttribute('crossorigin')) {
                            img.removeAttribute('crossorigin');
                        }
                        
                        // Monitor proxy image loading
                        img.onload = function() {
                            console.log('[Notion-PDF] Proxy image loaded successfully:', originalSrc.substring(0, 60) + '...');
                        };
                        img.onerror = function() {
                            console.error('[Notion-PDF] Proxy image failed to load:', originalSrc.substring(0, 60) + '...');
                        };
                        
                        img.src = proxyUrl;
                        resolve();
                    }
                };
                
                tempImg.onerror = function() {
                    if (errorCalled || loadCalled) return;
                    errorCalled = true;

                    // CORS error or network issue - use proxy URL
                    console.warn('[Notion-PDF] CORS/network blocked, using proxy URL for:', originalSrc.substring(0, 80));
                    const proxyUrl = `${CONFIG.SERVER_URL}/proxy-image?url=${encodeURIComponent(originalSrc)}`;
                    console.log('[Notion-PDF] Setting proxy URL:', proxyUrl.substring(0, 120) + '...');
                    
                    // Remove crossOrigin to allow proxy image loading without CORS
                    if (img.hasAttribute('crossorigin')) {
                        img.removeAttribute('crossorigin');
                    }
                    
                    // Monitor proxy image loading
                    img.onload = function() {
                        console.log('[Notion-PDF] Proxy image loaded successfully:', originalSrc.substring(0, 60) + '...');
                    };
                    img.onerror = function() {
                        console.error('[Notion-PDF] Proxy image failed to load:', originalSrc.substring(0, 60) + '...');
                    };
                    
                    img.src = proxyUrl;
                    resolve();
                };

                // Timeout after 3 seconds
                setTimeout(() => {
                    if (!loadCalled && !errorCalled) {
                        errorCalled = true;
                        console.warn('[Notion-PDF] Image conversion timeout, using proxy URL for:', originalSrc.substring(0, 80));
                        const proxyUrl = `${CONFIG.SERVER_URL}/proxy-image?url=${encodeURIComponent(originalSrc)}`;
                        console.log('[Notion-PDF] Setting proxy URL:', proxyUrl.substring(0, 120) + '...');
                        
                        // Remove crossOrigin to allow proxy image loading without CORS
                        if (img.hasAttribute('crossorigin')) {
                            img.removeAttribute('crossorigin');
                        }
                        
                        // Monitor proxy image loading
                        img.onload = function() {
                            console.log('[Notion-PDF] Proxy image loaded successfully:', originalSrc.substring(0, 60) + '...');
                        };
                        img.onerror = function() {
                            console.error('[Notion-PDF] Proxy image failed to load:', originalSrc.substring(0, 60) + '...');
                        };
                        
                        img.src = proxyUrl;
                        resolve();
                    }
                }, 3000);

                // Try to load image
                try {
                    tempImg.src = originalSrc;
                } catch (e) {
                    console.warn('[Notion-PDF] Failed to set image src, using proxy URL:', originalSrc.substring(0, 80));
                    const proxyUrl = `${CONFIG.SERVER_URL}/proxy-image?url=${encodeURIComponent(originalSrc)}`;
                    console.log('[Notion-PDF] Setting proxy URL:', proxyUrl.substring(0, 120) + '...');
                    
                    // Remove crossOrigin to allow proxy image loading without CORS
                    if (img.hasAttribute('crossorigin')) {
                        img.removeAttribute('crossorigin');
                    }
                    
                    // Monitor proxy image loading
                    img.onload = function() {
                        console.log('[Notion-PDF] Proxy image loaded successfully:', originalSrc.substring(0, 60) + '...');
                    };
                    img.onerror = function() {
                        console.error('[Notion-PDF] Proxy image failed to load:', originalSrc.substring(0, 60) + '...');
                    };
                    
                    img.src = proxyUrl;
                    resolve();
                }
            });
        });

        return Promise.all(promises);
    }

    /**
     * 모든 CSS가 로드될 때까지 대기
     */
    async function waitForCSSLoading() {
        const maxWaitTime = 10000; // 10초
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            const checkCSSReady = () => {
                if (Date.now() - startTime > maxWaitTime) {
                    console.warn('[Notion-PDF] CSS loading timeout, proceeding...');
                    resolve();
                    return;
                }

                // 모든 stylesheet가 로드되었는지 확인
                const stylesheets = Array.from(document.querySelectorAll('link[rel="stylesheet"]'));
                const allLoaded = stylesheets.every(link => {
                    try {
                        return link.sheet !== null || link.hasAttribute('disabled');
                    } catch (e) {
                        return true; // CORS 제약이 있는 경우 로드됨으로 간주
                    }
                });

                if (allLoaded && stylesheets.length > 0) {
                    // 웹 폰트 로드 확인
                    if (document.fonts && document.fonts.status === 'loaded') {
                        console.log('[Notion-PDF] CSS and fonts fully loaded');
                        resolve();
                    } else if (document.fonts) {
                        // 폰트 로드 대기
                        document.fonts.ready.then(() => {
                            console.log('[Notion-PDF] Fonts ready');
                            resolve();
                        }).catch(() => {
                            console.warn('[Notion-PDF] Font loading failed, continuing...');
                            resolve();
                        });
                    } else {
                        resolve();
                    }
                } else {
                    // 로드될 때까지 대기
                    setTimeout(checkCSSReady, 500);
                }
            };

            checkCSSReady();
        });
    }

    /**
     * Extracts CSS resources from the page with metadata
     */
    async function extractCssResources() {
        const cssLinks = [];
        const inlineStyles = [];

        try {
            // CSS 로드 완료 대기
            console.log('[Notion-PDF] Waiting for CSS to load...');
            await waitForCSSLoading();

            // Extract stylesheet links with metadata
            const styleLinks = document.querySelectorAll('link[rel="stylesheet"]');
            if (styleLinks && styleLinks.length > 0) {
                for (let i = 0; i < styleLinks.length; i++) {
                    const link = styleLinks[i];
                    if (link.href) {
                        console.log('[Notion-PDF] Fetching CSS:', link.href);
                        const cssContent = await fetchAndInlineCss(link.href);
                        if (cssContent) {
                            inlineStyles.push({
                                id: link.id || `_link_${i}`,
                                content: cssContent
                            });
                            console.log('[Notion-PDF] Inlined CSS (', link.href.substring(0, 60), '...) - content length:', cssContent.length);
                        } else {
                            console.warn('[Notion-PDF] Failed to fetch CSS, falling back to link:', link.href);
                            // Fallback: send as link with proxy-asset
                            const absoluteHref = resolveRelativePath(link.href);
                            const proxiedHref = `/proxy-asset?url=${encodeURIComponent(absoluteHref)}`;
                            cssLinks.push({
                                href: proxiedHref,
                                media: link.getAttribute('media') || 'all',
                                crossorigin: link.getAttribute('crossorigin')
                            });
                        }
                    }
                }
            }
            console.log('[Notion-PDF] Found', inlineStyles.filter(s => s.id.startsWith('_link_')).length, 'inlined stylesheet links + ', cssLinks.length, 'fallback links');

            // Extract inline styles from <style> tags with ID
            const styleTags = document.querySelectorAll('style');
            if (styleTags && styleTags.length > 0) {
                styleTags.forEach((style, idx) => {
                    if (style.textContent && style.textContent.length > 0) {
                        // 객체 형식으로 ID 포함 (pdfService와 동일)
                        inlineStyles.push({
                            id: style.id || `_style_${idx}`,
                            content: style.textContent
                        });
                    }
                });
            }
            console.log('[Notion-PDF] Found', inlineStyles.length, 'inline style tags');

            // 추가: Notion 특화 CSS 주입 (동기화된 스타일)
            // 이슈 https://github.com/notion-enhancer/notion-remastered/issues
            // Notion의 동적 스타일도 포함시키기 위해 computed styles from critical elements
            const notionElements = document.querySelectorAll('.notion-page-block, .notion-text, .notion-heading, .notion-image-block');
            if (notionElements.length > 0) {
                let notionSpecificCSS = '/* Notion-special styles captured from extension */\n';
                let hasSpecificStyle = false;

                notionElements.forEach((el, idx) => {
                    const computedStyle = window.getComputedStyle(el);
                    // 중요한 스타일 속성들 캡처
                    const importantProps = ['fontFamily', 'fontSize', 'lineHeight', 'color', 'backgroundColor'];
                    let elementCSS = '';
                    
                    importantProps.forEach(prop => {
                        const value = computedStyle[prop];
                        if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
                            const cssProp = prop.replace(/([A-Z])/g, '-$1').toLowerCase();
                            elementCSS += `${cssProp}: ${value};`;
                            hasSpecificStyle = true;
                        }
                    });
                });

                // Notion 기본 폴백 스타일 추가
                notionSpecificCSS += `
                    .notion-page-content, .notion-page-content * {
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                        line-height: 1.5;
                    }
                    .notion-text { display: block; margin: 8px 0; }
                    .notion-heading { font-weight: 600; margin: 16px 0 8px 0; }
                    .notion-heading-1 { font-size: 1.875em; }
                    .notion-heading-2 { font-size: 1.5em; }
                    .notion-heading-3 { font-size: 1.25em; }
                    .notion-divider { border: 0; border-top: 1px solid #e0e0e0; margin: 16px 0; }
                    .notion-image { max-width: 100%; height: auto; margin: 8px 0; }
                    .notion-bookmark { padding: 12px; background: #f5f5f5; border-radius: 4px; margin: 8px 0; }
                    .notion-quote { border-left: 4px solid #6366f1; padding-left: 12px; margin: 8px 0; }
                    .notion-code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; font-family: monospace; }
                    .notion-table-content { overflow-x: auto; }
                `;

                inlineStyles.push({
                    id: 'notion-fallback-styles',
                    content: notionSpecificCSS
                });
                console.log('[Notion-PDF] Added notion-specific fallback styles');
            }
        } catch (error) {
            console.error('[Notion-PDF] Error extracting CSS resources:', error);
        }

        // Always return objects with arrays - never undefined
        return { 
            cssLinks: Array.isArray(cssLinks) ? cssLinks : [],
            inlineStyles: Array.isArray(inlineStyles) ? inlineStyles : []
        };
    }

    /**
     * Cleans the HTML by removing scripts and iframes
     */
    function cleanHtml(element) {
        // Clone to avoid modifying original
        const clone = element.cloneNode(true);

        // Remove script tags
        clone.querySelectorAll('script').forEach(script => script.remove());

        // Remove iframe tags
        clone.querySelectorAll('iframe').forEach(iframe => iframe.remove());

        // Remove noscript tags
        clone.querySelectorAll('noscript').forEach(noscript => noscript.remove());

        // Remove event handlers
        clone.querySelectorAll('*').forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.startsWith('on')) {
                    el.removeAttribute(attr.name);
                }
            });
        });

        return clone;
    }

    /**
     * Captures the full page content - identical to pdfService.getPreviewData()
     */
    async function capturePageContent() {
        try {
            console.log('[Notion-PDF] Starting page capture (matching getPreviewData logic)...');

            // 1. CSS 로드 대기
            console.log('[Notion-PDF] Waiting for CSS to load...');
            await waitForCSSLoading();

            // 3. 토글 블록 모두 열기 (원본 문서에서 실행 - getPreviewData와 동일하게)
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
                
                await new Promise(resolve => setTimeout(resolve, 1000));
                console.log('[Notion-PDF-Toggle] Toggle processing completed');
            } catch (err) {
                console.warn(`[Notion-PDF-Toggle] Error opening toggles: ${err.message}`);
            }

            // 4. 토글 열린 후 구성 추출 및 너비 감지
            console.log('[Notion-PDF] Extracting content after toggle expansion...');
            const contentEl = document.querySelector('.notion-page-content');
            const detectedWidth = contentEl ? Math.ceil(contentEl.getBoundingClientRect().width) : 1080;
            console.log(`[Notion-PDF] Detected content width: ${detectedWidth}px`);

            // 5. Convert images to base64 (원본 document에서)
            console.log('[Notion-PDF] Converting images to base64...');
            await convertImagesToBase64(document.body);

            // 6. Clone for HTML extraction
            const contentClone = cleanHtml(document.documentElement);

            // 7. HTML 추출 - getPreviewData와 동일하게 (배너, 제목, 속성, 메인 콘텐츠)
            console.log('[Notion-PDF] Extracting HTML content...');
            let htmlParts = [];
            let addedElements = new Set();
            
            // 중복 추출 방지 헬퍼 함수
            const pushElement = (el) => {
                if (el && !addedElements.has(el)) {
                    htmlParts.push(el.outerHTML);
                    addedElements.add(el);
                }
            };

            // (0) 전역 SVG 심볼(Sprite) 추출
            contentClone.querySelectorAll('svg symbol, svg defs').forEach(el => {
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
            const cover = contentClone.querySelector('.layout-full');
            pushElement(cover);

            // (2) 제목
            const h1 = contentClone.querySelector('h1');
            if (h1) {
                const titleBlock = h1.closest('.notion-page-block') || h1;
                pushElement(titleBlock);
            }

            // (3) 페이지 속성 (태그)
            const tags = contentClone.querySelector('div[aria-label="페이지 속성"], div[aria-label="Page properties"]');
            pushElement(tags);

            // (4) 메인 콘텐츠
            const contentElInClone = contentClone.querySelector('.notion-page-content');
            if (contentElInClone) {
                htmlParts.push(contentElInClone.innerHTML);
            }

            const html = htmlParts.join('\n');

            // HTML의 모든 상대 경로를 proxy-asset으로 변환
            console.log('[Notion-PDF] Converting paths to proxy-asset...');
            const htmlWithProxyPaths = convertPathsToProxyAsset(html);

            if (!htmlWithProxyPaths || typeof htmlWithProxyPaths !== 'string' || htmlWithProxyPaths.length === 0) {
                throw new Error('HTML 캡처 실패: 유효한 HTML을 얻을 수 없습니다.');
            }

            console.log('[Notion-PDF] HTML generated and converted', { length: htmlWithProxyPaths.length });

            // 8. Extract resources from original document (getPreviewData와 동일)
            console.log('[Notion-PDF] Extracting resources...');
            const resources = {
                cssLinks: [],
                inlineStyles: []
            };

            // CSS Links (head에서만) - fetch해서 inline으로 변환
            const headLinks = document.querySelectorAll('head link[rel="stylesheet"]');
            if (headLinks && headLinks.length > 0) {
                for (let i = 0; i < headLinks.length; i++) {
                    const link = headLinks[i];
                    if (link.href) {
                        console.log('[Notion-PDF] Fetching head CSS:', link.href);
                        const cssContent = await fetchAndInlineCss(link.href);
                        if (cssContent) {
                            resources.inlineStyles.push({
                                id: link.id || `_head_link_${i}`,
                                content: cssContent
                            });
                            console.log('[Notion-PDF] Inlined head CSS - content length:', cssContent.length);
                        } else {
                            console.warn('[Notion-PDF] Failed to fetch head CSS, falling back to link:', link.href);
                            // Fallback: send as link with proxy-asset
                            const absoluteHref = resolveRelativePath(link.href);
                            const proxiedHref = `/proxy-asset?url=${encodeURIComponent(absoluteHref)}`;
                            resources.cssLinks.push({
                                href: proxiedHref,
                                media: link.getAttribute('media') || 'all',
                                crossorigin: link.getAttribute('crossorigin')
                            });
                        }
                    }
                }
            }
            console.log('[Notion-PDF] Found', resources.inlineStyles.filter(s => s.id.startsWith('_head_link_')).length, 'inlined head CSS + ', resources.cssLinks.length, 'fallback links');

            // Inline Styles (head에서만)
            document.querySelectorAll('head style').forEach((style, idx) => {
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

            const capturedData = {
                html: htmlWithProxyPaths,
                detectedWidth,
                resources: {
                    cssLinks: resources.cssLinks || [],
                    inlineStyles: resources.inlineStyles || []
                },
                metadata: {
                    url: window.location.href,
                    title: document.title || 'Notion Page',
                    timestamp: new Date().toISOString()
                }
            };

            // Final validation
            if (!Array.isArray(capturedData.resources.cssLinks)) {
                capturedData.resources.cssLinks = [];
            }
            if (!Array.isArray(capturedData.resources.inlineStyles)) {
                capturedData.resources.inlineStyles = [];
            }

            console.log('[Notion-PDF] Capture complete', {
                htmlLength: htmlWithProxyPaths.length,
                detectedWidth: detectedWidth,
                cssLinks: capturedData.resources.cssLinks.length,
                inlineStyles: capturedData.resources.inlineStyles.length,
                title: capturedData.metadata.title
            });

            return capturedData;
        } catch (error) {
            console.error('[Notion-PDF] Capture error:', error);
            console.error('[Notion-PDF] Stack trace:', error.stack);
            throw error;
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
