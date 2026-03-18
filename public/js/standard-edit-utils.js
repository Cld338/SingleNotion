/**
 * Utility Functions - Common utilities for standard-edit.html
 */

const Utils = {
/**
     * 용지 규격에 따른 페이지 높이 계산
     */
    /**
     * 용지 규격에 따른 페이지 높이 계산
     */
    getPageHeight(format) {
        const formats = {
            'SINGLE': 999999, // 단일 페이지는 높이 무제한 처리
            'A4': 1123,     // 297mm
            'A3': 1587,     // 420mm
            'ISO_B5': 945,  // 250mm
            'B5_JIS': 971,  // 257mm
            'Letter': 1056  // 11in
        };
        return formats[format] || 1123;
    },

    /**
     * 용지 규격에 따른 페이지 너비 계산 (96 DPI 기준)
     */
    getPageWidth(format) {
        const formats = {
            'SINGLE': parseInt(document.getElementById('pageWidth')?.value) || 1080,
            'A4': 794,      
            'A3': 1123,     
            'ISO_B5': 665,  
            'B5_JIS': 688,  
            'Letter': 816   
        };
        return formats[format] || 794;
    },

    /**
     * 클라이언트에서 상대 경로를 절대 경로로 변환
     */
    fixRelativePaths(baseUrl, contentArea) {
        let fixedCount = 0;
        try {
            const parser = new URL(baseUrl);
            const baseOrigin = parser.origin;

            // 이미지 src 속성 변환
            contentArea.querySelectorAll('img[src]').forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('//') 
                    && !src.startsWith('/proxy-asset') && !src.startsWith('/proxy-image')) {
                    try {
                        if (src.startsWith('/')) {
                            img.src = `${baseOrigin}${src}`;
                        } else {
                            img.src = new URL(src, baseUrl).href;
                        }
                        fixedCount++;
                    } catch (err) {
                        Logger.warn(`Failed to fix image path: ${src}`, err);
                    }
                }
            });

            // iframe src 속성 변환
            contentArea.querySelectorAll('iframe[src]').forEach(iframe => {
                const src = iframe.getAttribute('src');
                if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('//')
                    && !src.startsWith('/proxy-asset') && !src.startsWith('/proxy-image')) {
                    try {
                        if (src.startsWith('/')) {
                            iframe.src = `${baseOrigin}${src}`;
                        } else {
                            iframe.src = new URL(src, baseUrl).href;
                        }
                        fixedCount++;
                    } catch (err) {
                        Logger.warn(`Failed to fix iframe path: ${src}`, err);
                    }
                }
            });

            // 스타일 내 모든 URL 속성 변환 부분
            contentArea.querySelectorAll('[style]').forEach(el => {
                const style = el.getAttribute('style');
                if (style) {
                    let isChanged = false;
                    const updatedStyle = style.replace(
                        /url\s*\(\s*([^)]*)\s*\)/g,
                        (match, rawPath) => {
                            try {
                                // (기존 따옴표 및 경로 정규화 로직 유지)
                                let cleanPath = rawPath.trim().replace(/^["']+|["']+$/g, '').replace(/&quot;/g, '').trim();
                                if (!cleanPath) return match;

                                // [핵심] 이미 proxy 처리된 URL은 건너뛰기
                                if (cleanPath.startsWith('/proxy-asset') || cleanPath.startsWith('/proxy-image')) {
                                    return match;
                                }

                                // 이미 절대 경로인 경우 그대로 반환 (proxy 래핑 없음)
                                if (cleanPath.startsWith('http') || cleanPath.startsWith('data:') || cleanPath.startsWith('//')) {
                                    return match;
                                }

                                // 상대 경로만 proxy로 래핑
                                const absoluteUrl = (cleanPath.startsWith('/') ? `${baseOrigin}${cleanPath}` : new URL(cleanPath, baseUrl).href);
                                const resolvedUrl = `/proxy-asset?url=${encodeURIComponent(absoluteUrl)}`;
                                isChanged = true;
                                fixedCount++;

                                return `url("${resolvedUrl}")`; 
                            } catch (err) {
                                return match;
                            }
                        }
                    );

                    if (isChanged) {
                        el.setAttribute('style', updatedStyle);
                    }
                }
            });

            // 1. svg 태그 내부의 image xlink:href 또는 href 처리
            contentArea.querySelectorAll('svg image').forEach(svgImg => {
                const href = svgImg.getAttribute('xlink:href') || svgImg.getAttribute('href');
                if (href && !href.startsWith('http') && !href.startsWith('data:') && !href.startsWith('//')
                    && !href.startsWith('/proxy-asset') && !href.startsWith('/proxy-image')) {
                    const resolved = href.startsWith('/') ? `${baseOrigin}${href}` : new URL(href, baseUrl).href;
                    svgImg.setAttribute('href', resolved);
                    fixedCount++;
                }
            });

            // 2. .notion-page-icon 등 SVG 직접 삽입된 경우의 스타일 처리
            contentArea.querySelectorAll('svg').forEach(svg => {
                // SVG 자체가 특정 경로를 참조하는 경우 처리 로직 추가 가능
                svg.style.display = 'inline-block'; // 렌더링 누락 방지
            });

            Logger.log(`Relative paths fixed: ${fixedCount} items`);
            return fixedCount;
        } catch (err) {
            Logger.warn('Error fixing relative paths', err);
            return fixedCount;
        }
    },

    /**
     * CSS 리소스 로드
     */
    async loadCSSResources(cssLinks) {
        if (!cssLinks || !Array.isArray(cssLinks)) {
            Logger.warn('No CSS links provided');
            return;
        }

        Logger.log(`CSS Loading ${cssLinks.length} files...`, 'info');

        // 폴백 스타일 추가
        const fallbackStyles = `
            .notion-page-content, .notion-page-content * {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
                line-height: 1.5;
            }
            .notion-text { display: block; margin: 8px 0; }
            .notion-heading { font-weight: 600; margin: 16px 0 8px 0; }
            .notion-divider { border: 0; border-top: 1px solid #e0e0e0; margin: 16px 0; }
            .notion-image { max-width: 100%; height: auto; margin: 8px 0; }
            .notion-bookmark { padding: 12px; background: #f5f5f5; border-radius: 4px; margin: 8px 0; }
            .notion-quote { border-left: 4px solid #6366f1; padding-left: 12px; margin: 8px 0; }
        `;

        const fallbackStyle = document.createElement('style');
        fallbackStyle.id = 'notion-fallback-styles';
        fallbackStyle.textContent = fallbackStyles;
        document.head.appendChild(fallbackStyle);
        Logger.success('Fallback styles injected');

        let successCount = 0;
        let failureCount = 0;

        return Promise.all(cssLinks.map((css, index) => {
            return new Promise((resolve) => {
                try {
                    const link = document.createElement('link');
                    link.rel = 'stylesheet';
                    link.href = css.href;
                    if (css.media) {
                        link.media = css.media;
                    }

                    const onComplete = (success) => {
                        clearTimeout(timeoutId);
                        if (success) {
                            Logger.success(`CSS [${index + 1}/${cssLinks.length}] Loaded: ${css.href.substring(0, 60)}...`);
                            successCount++;
                        } else {
                            Logger.warn(`CSS [${index + 1}/${cssLinks.length}] Failed: ${css.href.substring(0, 60)}...`);
                            failureCount++;
                        }
                        resolve();
                    };

                    link.onload = () => onComplete(true);
                    link.onerror = () => onComplete(false);

                    const timeoutId = setTimeout(() => {
                        onComplete(false);
                    }, 15000);

                    document.head.appendChild(link);
                    Logger.log(`CSS [${index + 1}/${cssLinks.length}] Loading...`, 'info');

                } catch (err) {
                    Logger.warn(`CSS Error: ${err.message}`);
                    failureCount++;
                    resolve();
                }
            });
        })).then(() => {
            Logger.log(`CSS Complete - Success: ${successCount}, Failed: ${failureCount}`, successCount > failureCount ? 'success' : 'warning');
        });
    },

    /**
     * 인라인 스타일 주입
     */
    loadInlineStyles(inlineStyles) {
        if (!inlineStyles || !Array.isArray(inlineStyles)) {
            Logger.warn('No inline styles provided');
            return;
        }

        Logger.log(`Loading ${inlineStyles.length} inline styles`, 'info');

        inlineStyles.forEach((style, index) => {
            try {
                const styleEl = document.createElement('style');
                if (style.id) {
                    styleEl.id = style.id;
                }
                styleEl.textContent = style.content;
                document.head.appendChild(styleEl);
                Logger.success(`Inline style ${index + 1} added: ${style.id || 'unnamed'} (${style.content.length} bytes)`);
            } catch (err) {
                Logger.warn(`Error loading inline style: ${err.message}`);
            }
        });
    },

    /**
     * CSS 텍스트에서 @font-face, @import 등 글로벌 규칙 추출
     */
    extractGlobalRules(cssText) {
        if (!cssText) return '';
        
        try {
            const globalPattern = /@(font-face|import|keyframes|media|supports|document|page)\s*[^;]*(?:{[^}]*}|;)/gi;
            const globalRules = [];
            let match;
            
            while ((match = globalPattern.exec(cssText)) !== null) {
                globalRules.push(match[0]);
            }
            
            return globalRules.join('\n');
        } catch (err) {
            Logger.warn(`Error extracting global rules: ${err.message}`);
            return '';
        }
    },

    /**
     * 콘텐츠 영역으로 한정된 CSS 리소스 로드 (Extension용 - 개선 버전)
     */
    async loadCSSResourcesScoped(cssLinks, scopeSelector = '#content-area') {
        if (!cssLinks || !Array.isArray(cssLinks)) {
            Logger.warn('No CSS links provided for scoped loading');
            return;
        }

        Logger.log(`CSS Loading ${cssLinks.length} files (scoped to ${scopeSelector})...`, 'info');
        const contentArea = document.querySelector(scopeSelector);
        if (!contentArea) {
            Logger.warn(`Scope selector not found: ${scopeSelector}`);
            return;
        }

        let successCount = 0;
        let failureCount = 0;
        let globalRulesCollected = '';

        return Promise.all(cssLinks.map((css, index) => {
            return new Promise((resolve) => {
                try {
                    fetch(css.href)
                        .then(response => response.text())
                        .then(cssText => {
                            // 1. 글로벌 규칙(@font-face, @import 등) 추출 및 head에 추가
                            const globalRules = this.extractGlobalRules(cssText);
                            if (globalRules) {
                                if (!globalRulesCollected) {
                                    const globalStyle = document.createElement('style');
                                    globalStyle.setAttribute('data-scoped', 'global');
                                    globalStyle.setAttribute('data-source', 'extension-global-css');
                                    document.head.appendChild(globalStyle);
                                }
                                globalRulesCollected += globalRules + '\n';
                                Logger.log(`Extracted ${globalRules.split('\n').length} global rules from CSS ${index + 1}`, 'info');
                            }
                            
                            // 2. 나머지 CSS를 scope로 래핑하여 content-area에 추가
                            const wrappedCss = this.wrapCSSForContentArea(cssText, scopeSelector);
                            
                            const styleEl = document.createElement('style');
                            styleEl.textContent = wrappedCss;
                            styleEl.setAttribute('data-scoped', 'true');
                            styleEl.setAttribute('data-source', 'extension-css');
                            contentArea.insertBefore(styleEl, contentArea.firstChild);
                            
                            Logger.success(`Scoped CSS [${index + 1}/${cssLinks.length}] Loaded: ${css.href.substring(0, 60)}...`);
                            successCount++;
                            resolve();
                        })
                        .catch(err => {
                            Logger.warn(`CSS [${index + 1}/${cssLinks.length}] Failed: ${css.href.substring(0, 60)}...`);
                            failureCount++;
                            resolve();
                        });
                } catch (err) {
                    Logger.warn(`CSS Error: ${err.message}`);
                    failureCount++;
                    resolve();
                }
            });
        })).then(() => {
            // 글로벌 규칙을 head에 추가
            if (globalRulesCollected) {
                const globalStyle = document.querySelector('style[data-scoped="global"]');
                if (globalStyle) {
                    globalStyle.textContent = globalRulesCollected;
                    Logger.success(`Global CSS rules applied to <head>`);
                }
            }
            
            Logger.log(`Scoped CSS Complete - Success: ${successCount}, Failed: ${failureCount}`, successCount > failureCount ? 'success' : 'warning');
        });
    },

    /**
     * 콘텐츠 영역으로 한정된 인라인 스타일 로드 (Extension용 - 개선 버전)
     */
    loadInlineStylesScoped(inlineStyles, scopeSelector = '#content-area') {
        if (!inlineStyles || !Array.isArray(inlineStyles)) {
            Logger.warn('No inline styles provided for scoped loading');
            return;
        }

        Logger.log(`Loading ${inlineStyles.length} inline styles (scoped to ${scopeSelector})...`, 'info');
        const contentArea = document.querySelector(scopeSelector);
        if (!contentArea) {
            Logger.warn(`Scope selector not found: ${scopeSelector}`);
            return;
        }

        let globalStyleElement = null;
        let globalRulesCollected = '';

        inlineStyles.forEach((style, index) => {
            try {
                // 1. 글로벌 규칙 추출 및 head에 추가
                const globalRules = this.extractGlobalRules(style.content);
                if (globalRules) {
                    if (!globalStyleElement) {
                        globalStyleElement = document.createElement('style');
                        globalStyleElement.setAttribute('data-scoped', 'global');
                        globalStyleElement.setAttribute('data-source', 'extension-global-inline');
                        document.head.appendChild(globalStyleElement);
                    }
                    globalRulesCollected += globalRules + '\n';
                    Logger.log(`Extracted global rules from inline style ${index + 1}`, 'info');
                }
                
                // 2. 나머지 CSS를 scope로 래핑하여 content-area에 추가
                const wrappedCss = this.wrapCSSForContentArea(style.content, scopeSelector);
                
                const styleEl = document.createElement('style');
                if (style.id) {
                    styleEl.id = `${style.id}-scoped`;
                }
                styleEl.textContent = wrappedCss;
                styleEl.setAttribute('data-scoped', 'true');
                styleEl.setAttribute('data-source', 'extension-inline');
                
                contentArea.insertBefore(styleEl, contentArea.firstChild);
                Logger.success(`Scoped inline style ${index + 1} added: ${style.id || 'unnamed'} (${style.content.length} bytes)`);
            } catch (err) {
                Logger.warn(`Error loading scoped inline style: ${err.message}`);
            }
        });
        
        // 글로벌 규칙을 head에 최종 적용
        if (globalStyleElement && globalRulesCollected) {
            globalStyleElement.textContent = globalRulesCollected;
            Logger.success(`Global inline CSS rules applied to <head>`);
        }
    },

    /**
     * CSS 텍스트를 특정 선택자로 래핑
     * 예: "body { color: red; }" -> "#content-area body { color: red; }"
     */
    wrapCSSForContentArea(cssText, scopeSelector = '#content-area') {
        if (!cssText) return '';
        
        try {
            let wrappedCss = '';
            let inComment = false;
            let inString = false;
            let stringChar = '';
            let currentRule = '';
            let braceDepth = 0;
            let inAtRule = false;
            let atRuleContent = '';

            for (let i = 0; i < cssText.length; i++) {
                const char = cssText[i];
                const nextChar = cssText[i + 1];

                // 주석 처리
                if (char === '/' && nextChar === '*' && !inString) {
                    inComment = true;
                    wrappedCss += '/*';
                    i++;
                    continue;
                }
                if (char === '*' && nextChar === '/' && inComment && !inString) {
                    inComment = false;
                    wrappedCss += '*/';
                    i++;
                    continue;
                }

                if (inComment) {
                    wrappedCss += char;
                    continue;
                }

                // 문자열 처리
                if ((char === '"' || char === "'" || char === '`') && cssText[i - 1] !== '\\') {
                    if (!inString) {
                        inString = true;
                        stringChar = char;
                    } else if (char === stringChar) {
                        inString = false;
                    }
                }

                if (inString) {
                    currentRule += char;
                    continue;
                }

                currentRule += char;

                // @ 규칙 감지
                if (char === '@' && braceDepth === 0) {
                    inAtRule = true;
                    atRuleContent = '';
                }

                // 규칙 블록 처리
                if (char === '{') {
                    braceDepth++;
                } else if (char === '}') {
                    braceDepth--;

                    if (braceDepth === 0 && inAtRule) {
                        // @규칙 종료
                        inAtRule = false;
                        wrappedCss += currentRule;
                        currentRule = '';
                    } else if (braceDepth === 0 && currentRule.trim()) {
                        // 일반 규칙 종료 - 래핑 처리
                        const rule = currentRule.trim();
                        if (rule && !rule.startsWith('@')) {
                            const parts = rule.split('{');
                            if (parts.length === 2) {
                                let selectors = parts[0].trim();
                                const declarations = parts[1].trim();

                                // 셀렉터 래핑 (각 셀렉터에 scope 프리픅스 추가)
                                const wrappedSelectors = selectors
                                    .split(',')
                                    .map(s => {
                                        s = s.trim();
                                        // root 선택자는 scope 선택자로 변경
                                        if (s === ':root' || s === 'html') {
                                            return scopeSelector;
                                        }
                                        // 이미 scope를 포함하면 그대로
                                        if (s.startsWith(scopeSelector)) {
                                            return s;
                                        }
                                        // 다른 경우 scope 프리픅스 추가
                                        return `${scopeSelector} ${s}`;
                                    })
                                    .join(', ');

                                wrappedCss += `${wrappedSelectors} { ${declarations} }`;
                            } else {
                                wrappedCss += rule;
                            }
                        } else {
                            wrappedCss += rule;
                        }
                        currentRule = '';
                    }
                }
            }

            // 남은 내용 처리
            if (currentRule.trim()) {
                wrappedCss += currentRule;
            }

            return wrappedCss;
        } catch (err) {
            Logger.warn(`Error wrapping CSS: ${err.message}`);
            return cssText;
        }
    },

    /**
     * 스크립트 리소스 로드 (getPreviewData 방식 동일)
     */
    async loadScripts(scripts) {
        if (!scripts || !Array.isArray(scripts)) {
            Logger.warn('No scripts provided');
            return;
        }

        Logger.log(`Loading ${scripts.length} scripts...`, 'info');
        
        // DEBUG: 모든 scripts 출력
        scripts.forEach((script, index) => {
            Logger.log(`Script [${index + 1}] Type: ${script.type}, Src: ${script.src || '(inline)'}`, 'debug');
        });
        
        let successCount = 0;
        let failureCount = 0;
        const scriptPromises = [];

        scripts.forEach((script, index) => {
            try {
                if (script.type === 'external' && script.src) {
                    // 외부 스크립트 로드 - 모든 경로를 proxy-asset으로 래핑
                    const promise = new Promise((resolve) => {
                        const scriptEl = document.createElement('script');
                        
                        // 모든 경로를 proxy-asset으로 래핑
                        // 절대 경로(http/https) 또는 상대 경로(/, ._assets) 모두 처리
                        let proxiedSrc;
                        if (script.src.startsWith('/') || !script.src.startsWith('http')) {
                            // 상대 경로 또는 루트 기준 경로 → 모두 proxy-asset으로 래핑
                            // Notion의 기준에서 절대경로로 변환 후 프록시
                            proxiedSrc = `/proxy-asset?url=${encodeURIComponent(`https://www.notion.so${script.src.startsWith('/') ? script.src : '/' + script.src}`)}`;
                        } else {
                            // 절대 경로(http/https/...) → proxy-asset으로 래핑
                            proxiedSrc = `/proxy-asset?url=${encodeURIComponent(script.src)}`;
                        }
                        
                        scriptEl.src = proxiedSrc;
                        scriptEl.setAttribute('data-external-script', 'true');
                        scriptEl.setAttribute('data-original-src', script.src);
                        scriptEl.setAttribute('data-proxied-src', proxiedSrc);
                        
                        if (script.async) scriptEl.async = true;
                        if (script.defer) scriptEl.defer = true;
                        if (script.crossorigin) scriptEl.setAttribute('crossorigin', script.crossorigin);

                        const onComplete = (success) => {
                            clearTimeout(timeoutId);
                            if (success) {
                                Logger.success(`External script [${index + 1}/${scripts.length}] Loaded: ${script.src.substring(0, 60)}...`);
                                successCount++;
                            } else {
                                Logger.warn(`External script [${index + 1}/${scripts.length}] Failed: ${script.src.substring(0, 60)}...`);
                                Logger.log(`  Original: ${script.src}`, 'debug');
                                Logger.log(`  Proxied: ${proxiedSrc.substring(0, 100)}...`, 'debug');
                                failureCount++;
                            }
                            resolve();
                        };

                        scriptEl.onload = () => onComplete(true);
                        scriptEl.onerror = () => onComplete(false);

                        const timeoutId = setTimeout(() => {
                            onComplete(false);
                        }, 30000); // 30초 타임아웃

                        document.body.appendChild(scriptEl);
                        Logger.log(`External script [${index + 1}/${scripts.length}] Loading: ${script.src.substring(0, 60)}...`, 'debug');
                    });
                    scriptPromises.push(promise);
                } else if (script.type === 'inline' && script.content) {
                    // 인라인 스크립트 실행 (Promise 래프지 하여 동기화)
                    try {
                        const scriptEl = document.createElement('script');
                        scriptEl.textContent = script.content;
                        scriptEl.setAttribute('data-inline-script', 'true');
                        document.body.appendChild(scriptEl);
                        Logger.success(`Inline script [${index + 1}/${scripts.length}] Executed: ${script.contentLength || 0} bytes`);
                        successCount++;
                    } catch (err) {
                        Logger.warn(`Inline script [${index + 1}/${scripts.length}] Error: ${err.message}`);
                        failureCount++;
                    }
                }
            } catch (err) {
                Logger.warn(`Script loading error: ${err.message}`);
                failureCount++;
            }
        });

        // 모든 외부 스크립트 로드 대기
        return Promise.all(scriptPromises).then(() => {
            Logger.log(`Scripts Complete - Success: ${successCount}, Failed: ${failureCount}`, successCount > failureCount ? 'success' : 'warning');
            
            // KaTeX 렌더링 재-실행 (있다면)
            if (window.katex && window.renderMathInElement) {
                try {
                    setTimeout(() => {
                        window.renderMathInElement(document.body, {
                            delimiters: [
                                {left: '$$', right: '$$', display: true},
                                {left: '$', right: '$', display: false}
                            ]
                        });
                        Logger.success('KaTeX re-rendered');
                    }, 1000);
                } catch (err) {
                    Logger.warn(`KaTeX re-render failed: ${err.message}`);
                }
            }
        });
    },

    /**
     * 아이콘 링크 로드
     */
    loadIcons(icons) {
        if (!icons || !Array.isArray(icons)) {
            Logger.warn('No icons provided');
            return;
        }

        Logger.log(`Loading ${icons.length} icons...`, 'info');
        
        icons.forEach((icon, index) => {
            try {
                if (icon.href) {
                    const link = document.createElement('link');
                    link.rel = icon.rel || 'icon';
                    
                    // 절대 경로(http/https)인 경우 proxy-asset으로 래핑
                    const proxiedHref = (icon.href.startsWith('http://') || icon.href.startsWith('https://') || icon.href.startsWith('//'))
                        ? `/proxy-asset?url=${encodeURIComponent(icon.href)}`
                        : icon.href;
                    
                    link.href = proxiedHref;
                    link.setAttribute('data-original-href', icon.href);
                    
                    if (icon.type) link.type = icon.type;
                    if (icon.sizes) link.sizes = icon.sizes;
                    document.head.appendChild(link);
                    Logger.log(`Icon [${index + 1}/${icons.length}] Added: ${icon.rel || 'icon'}`, 'success');
                }
            } catch (err) {
                Logger.warn(`Error loading icon: ${err.message}`);
            }
        });
    },

    /**
     * 웹 폰트 링크 로드
     */
    loadFonts(fonts) {
        if (!fonts || !Array.isArray(fonts)) {
            Logger.warn('No fonts provided');
            return;
        }

        Logger.log(`Loading ${fonts.length} font links...`, 'info');
        
        fonts.forEach((font, index) => {
            try {
                if (font.href) {
                    const link = document.createElement('link');
                    link.rel = font.rel || 'stylesheet';
                    
                    // 절대 경로(http/https)인 경우 proxy-asset으로 래핑
                    const proxiedHref = (font.href.startsWith('http://') || font.href.startsWith('https://') || font.href.startsWith('//'))
                        ? `/proxy-asset?url=${encodeURIComponent(font.href)}`
                        : font.href;
                    
                    link.href = proxiedHref;
                    link.setAttribute('data-original-href', font.href);
                    
                    if (font.as) link.as = font.as;
                    if (font.type) link.type = font.type;
                    if (font.crossorigin) link.crossOrigin = font.crossorigin;
                    
                    document.head.appendChild(link);
                    Logger.log(`Font [${index + 1}/${fonts.length}] Added: ${font.href.substring(0, 50)}...`, 'success');
                }
            } catch (err) {
                Logger.warn(`Error loading font: ${err.message}`);
            }
        });
    },

    /**
     * KaTeX 리소스 로드 - CSS를 inline으로 변환하여 url() 경로 처리
     */
    loadKaTeX(katexResources) {
        if (!katexResources || !Array.isArray(katexResources)) {
            Logger.warn('No KaTeX resources provided');
            return;
        }

        Logger.log(`Loading ${katexResources.length} KaTeX resources...`, 'info');
        
        const linkPromises = [];
        const inlineCssPromises = [];
        
        katexResources.forEach((resource, index) => {
            try {
                if (resource.type === 'link' && resource.href) {
                    // KaTeX CSS 파일을 fetch해서 inline으로 로드 (url() 경로 변환)
                    const promise = new Promise((resolve) => {
                        const proxiedHref = (resource.href.startsWith('http://') || resource.href.startsWith('https://') || resource.href.startsWith('//'))
                            ? `/proxy-asset?url=${encodeURIComponent(resource.href)}`
                            : resource.href;
                        
                        fetch(proxiedHref)
                            .then(response => response.text())
                            .then(cssContent => {
                                // CSS 내의 모든 url() 경로를 proxy-asset으로 변환
                                const updatedCss = cssContent.replace(
                                    /url\s*\(\s*([^)]*)\s*\)/g,
                                    (match, rawPath) => {
                                        let cleanPath = rawPath.trim().replace(/^["']+|["']+$/g, '').trim();
                                        if (!cleanPath) return match;
                                        
                                        // 이미 절대 경로 또는 data URI인 경우
                                        if (cleanPath.startsWith('http') || cleanPath.startsWith('data:') || cleanPath.startsWith('//')) {
                                            return match;
                                        }
                                        
                                        // 상대 경로를 절대 경로로 변환 후 proxy-asset으로 래핑
                                        try {
                                            const baseUrl = resource.href;
                                            const absoluteUrl = new URL(cleanPath, baseUrl).href;
                                            const proxiedUrl = `/proxy-asset?url=${encodeURIComponent(absoluteUrl)}`;
                                            return `url("${proxiedUrl}")`;
                                        } catch (err) {
                                            Logger.warn(`Failed to process URL in KaTeX CSS: ${cleanPath}`);
                                            return match;
                                        }
                                    }
                                );
                                
                                // 변환된 CSS를 inline으로 주입
                                const styleEl = document.createElement('style');
                                styleEl.textContent = updatedCss;
                                styleEl.setAttribute('data-katex-css', 'true');
                                styleEl.setAttribute('data-original-href', resource.href);
                                document.head.appendChild(styleEl);
                                Logger.log(`KaTeX CSS [${index + 1}] Inlined with processed URLs: ${resource.href.substring(0, 50)}...`, 'success');
                                resolve();
                            })
                            .catch(err => {
                                Logger.warn(`KaTeX CSS [${index + 1}] Failed to fetch: ${resource.href.substring(0, 50)}... (${err.message})`);
                                resolve();
                            });
                    });
                    inlineCssPromises.push(promise);
                } else if (resource.type === 'script' && resource.src) {
                    const promise = new Promise((resolve) => {
                        const script = document.createElement('script');
                        
                        // 절대 경로(http/https)인 경우 proxy-asset으로 래핑
                        const proxiedSrc = (resource.src.startsWith('http://') || resource.src.startsWith('https://') || resource.src.startsWith('//'))
                            ? `/proxy-asset?url=${encodeURIComponent(resource.src)}`
                            : resource.src;
                        
                        script.src = proxiedSrc;
                        script.async = true;
                        script.setAttribute('data-original-src', resource.src);
                        
                        script.onload = () => {
                            Logger.log(`KaTeX Script [${index + 1}] Loaded: ${resource.src.substring(0, 50)}...`, 'success');
                            resolve();
                        };
                        script.onerror = () => {
                            Logger.warn(`KaTeX Script [${index + 1}] Failed: ${resource.src.substring(0, 50)}...`);
                            resolve();
                        };
                        
                        document.head.appendChild(script);
                    });
                    linkPromises.push(promise);
                }
            } catch (err) {
                Logger.warn(`Error loading KaTeX resource: ${err.message}`);
            }
        });
        
        // 모든 KaTeX 리소스 로드 대기
        const allPromises = [...inlineCssPromises, ...linkPromises];
        if (allPromises.length > 0) {
            return Promise.all(allPromises);
        }
    },

    /**
     * 블록의 페이지 정보 계산
     */
    getBlockPageInfo(block, pageHeightPx) {
        const blockTop = block.offsetTop;
        const blockHeight = block.offsetHeight;
        const blockBottom = blockTop + blockHeight;

        const startPage = Math.floor(blockTop / pageHeightPx);
        const endPage = Math.floor((blockBottom - 1) / pageHeightPx);

        return {
            startPage,
            endPage,
            top: blockTop,
            bottom: blockBottom,
            spansMultiplePages: startPage !== endPage
        };
    },

    /**
     * 블록 리스트를 HTML 문자열로 변환
     */
    /**
     * 블록 리스트를 HTML 문자열로 변환
     */
    createBreaksListHTML(selectedBreaks, contentArea) {
        if (selectedBreaks.size === 0) {
            return '<p style="font-size: 13px; font-weight: 600; color: var(--text-muted); background: #f8fafc; padding: 16px; border-radius: 12px; text-align: center; border: 1px dashed #cbd5e1;">설정된 분할 지점이 없습니다.</p>';
        }

        const blocks = contentArea.children;

        const breaksList = Array.from(selectedBreaks)
            .sort((a, b) => a - b)
            .map(bIdx => {
                const block = blocks[bIdx];
                // 텍스트가 없는 블록(이미지 등)일 경우를 위한 기본값 설정
                const blockText = block.textContent.substring(0, 40).trim() || `[미디어/빈 블록]`;
                
                return `<li class="break-nav-item" data-block-index="${bIdx}" style="margin-bottom: 0.8rem; padding: 0.8rem; background: #f8fafc; border-radius: 8px; border-left: 3px solid #6366f1; cursor: pointer; transition: all 0.2s;" onmouseenter="this.style.background='#e0e7ff'" onmouseleave="this.style.background='#f8fafc'" title="클릭하여 분할 지점으로 이동">
                    <div style="font-size: 13px; font-weight: 500; color: var(--text-main); word-break: break-word; line-height: 1.4;">"${blockText}..."</div>
                </li>`;
            })
            .join('');

        return `<ul style="list-style: none; padding: 0;">${breaksList}</ul>`;
    }
};
