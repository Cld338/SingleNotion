/**
 * Utility Functions - Common utilities for standard-edit.html
 */

const Utils = {
/**
     * 용지 규격에 따른 페이지 높이 계산
     */
    getPageHeight(format) {
        const formats = {
            'A4': 1123,     // 297mm
            'A3': 1587,     // 420mm
            'ISO_B5': 945,  // 250mm (국제 표준)
            'B5_JIS': 971,  // 257mm (한국/일본 표준)
            'Letter': 1056  // 11in
        };
        return formats[format] || 1123;
    },

    /**
     * 용지 규격에 따른 페이지 너비 계산 (96 DPI 기준)
     */
    getPageWidth(format) {
        const formats = {
            'A4': 794,      // 210mm
            'A3': 1123,     // 297mm
            'ISO_B5': 665,  // 176mm (국제 표준)
            'B5_JIS': 688,  // 182mm (한국/일본 표준)
            'Letter': 816   // 8.5in
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
                if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('//')) {
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
                if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('//')) {
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

            // 스타일 내 모든 URL 속성 변환 (background-image, mask, clip-path, etc)
            contentArea.querySelectorAll('[style]').forEach(el => {
                const style = el.getAttribute('style');
                if (style) {
                    let updatedStyle = style.replace(
                        /url\s*\(\s*([^)]*)\s*\)/g,
                        (match, rawPath) => {
                            try {
                                // 경로에서 공백, 따옴표, 특수 문자 제거
                                let cleanPath = rawPath
                                    .trim()                              // 양쪽 공백 제거
                                    .replace(/^["']+|["']+$/g, '')      // 시작/끝 따옴표 제거 (여러 개)
                                    .replace(/&quot;/g, '')             // HTML 엔티티 따옴표 제거
                                    .replace(/&#34;/g, '')             // 수치 HTML 엔티티 제거
                                    .trim();                            // 다시 한번 공백 제거
                                
                                // 비어있거나 절대 URL인 경우
                                if (!cleanPath) {
                                    return match;
                                }
                                if (cleanPath.startsWith('http') || cleanPath.startsWith('data:') || cleanPath.startsWith('//')) {
                                    return match;
                                }
                                
                                const resolvedUrl = cleanPath.startsWith('/')
                                    ? `${baseOrigin}${cleanPath}`
                                    : new URL(cleanPath, baseUrl).href;
                                fixedCount++;
                                return `url(${resolvedUrl})`;
                            } catch (err) {
                                Logger.warn(`Failed to fix URL: ${rawPath}`, err);
                                return match;
                            }
                        }
                    );
                    el.setAttribute('style', updatedStyle);
                }
            });

            // 1. svg 태그 내부의 image xlink:href 또는 href 처리
            contentArea.querySelectorAll('svg image').forEach(svgImg => {
                const href = svgImg.getAttribute('xlink:href') || svgImg.getAttribute('href');
                if (href && !href.startsWith('http')) {
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
            .notion-code-block { background: #f6f8fa; padding: 12px; border-radius: 4px; overflow-x: auto; }
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
    createBreaksListHTML(selectedBreaks, contentArea) {
        if (selectedBreaks.size === 0) {
            return '<p style="font-size: 14px; color: #94a3b8;">설정된 분할 지점이 없습니다.</p>';
        }

        const blocks = contentArea.children;

        const breaksList = Array.from(selectedBreaks)
            .sort((a, b) => a - b)
            .map(bIdx => {
                const block = blocks[bIdx];
                const blockText = block.textContent.substring(0, 30).trim() || `블록 #${parseInt(bIdx) + 1}`;
                return `<li style="margin-bottom: 0.8rem; padding: 0.75rem; background: #f8fafc; border-radius: 8px; border-left: 3px solid #6366f1;">
                    <div style="font-size: 13px; font-weight: 600; color: var(--text-main);">블록 #${parseInt(bIdx) + 1} 뒤에서 분할</div>
                    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px; word-break: break-word;">"${blockText}..."</div>
                </li>`;
            })
            .join('');

        return `<ul style="list-style: none; padding: 0;">${breaksList}</ul>`;
    }
};
