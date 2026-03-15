/**
 * 페이지 평가(evaluate) 스크립트 모듈
 * 브라우저 컨텍스트에서 실행되는 복잡한 JS 코드를 관리합니다.
 */

class PageEvaluationScripts {
    /**
     * KaTeX CSS 로드 스크립트
     */
    static getLoadKaTeXCSSScript() {
        return `
            const loadKaTeXCSS = async () => {
                return new Promise((resolve) => {
                    // KaTeX CSS가 이미 있는지 확인
                    const existingKaTeX = document.querySelector('link[href*="katex"]');
                    if (existingKaTeX) {
                        console.log('[KaTeX] CSS already loaded from CDN');
                        resolve();
                        return;
                    }
                    
                    // 없으면 CDN에서 로드
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
                        resolve();  // 에러나도 계속 진행
                    };
                    
                    // 3초 타임아웃
                    setTimeout(resolve, 3000);
                    
                    document.head.appendChild(link);
                });
            };
            
            await loadKaTeXCSS();
        `;
    }

    /**
     * 시각적 완성 대기 스크립트
     */
    static getWaitForVisualCompleteScript() {
        return `
            async function waitForVisualComplete() {
                console.time("VisualComplete");

                // 1. 웹 폰트 로딩 대기 (타임아웃 추가)
                try {
                    await Promise.race([
                        document.fonts.ready,
                        new Promise(resolve => setTimeout(resolve, 5000))  // ✅ 5초 타임아웃
                    ]);
                } catch (err) {
                    console.warn(\`Font loading timeout/error: \${err.message}\`);
                }

                // 2. ✅ 이미지 선별적 디코딩 (메모리 최적화)
                const visibleImages = Array.from(document.querySelectorAll('img'))
                    .filter(img => {
                        // 보이는 이미지만 필터링
                        if (!img.src) return false;
                        const rect = img.getBoundingClientRect();
                        return rect.width > 0 && rect.height > 0;  // 실제 크기가 있는 이미지만
                    })
                    .slice(0, 50);  // ✅ 최대 50개로 제한
                
                const imagePromises = visibleImages.map(img => {
                    // 각 이미지마다 1초 타임아웃 적용
                    return Promise.race([
                        img.decode().catch(err => {
                            console.warn(\`이미지 디코딩 실패: \${img.src}\`, err);
                        }),
                        new Promise(resolve => setTimeout(resolve, 1000))  // ✅ 1초 타임아웃
                    ]);
                });
                
                await Promise.all(imagePromises);

                // 3. ✅ KaTeX/MathJax 렌더링 완료 대기
                try {
                    // KaTeX 렌더링 완료 감지
                    const hasKaTeX = document.querySelectorAll('.katex').length > 0;
                    if (hasKaTeX) {
                        console.log(\`[KaTeX] Found \${document.querySelectorAll('.katex').length} KaTeX elements\`);
                        // KaTeX 렌더링 완료 감지: DOM 안정화 확인
                        await new Promise((resolve) => {
                            let isStable = false;
                            let checkCount = 0;
                            const maxChecks = 10;  // 최대 10번 확인 (5초)
                            
                            const checkKaTeXReady = () => {
                                checkCount++;
                                const currentKaTeXCount = document.querySelectorAll('.katex').length;
                                console.log(\`[KaTeX] Check \${checkCount}: \${currentKaTeXCount} elements\`);
                                
                                // 이전 확인과 KaTeX 개수가 같으면 안정화됨
                                if (isStable || checkCount >= maxChecks) {
                                    console.log(\`[KaTeX] Rendering stable at check \${checkCount}\`);
                                    resolve();
                                } else {
                                    if (checkCount > 1 && currentKaTeXCount === 
                                        (window._previousKaTeXCount || 0)) {
                                        isStable = true;
                                        console.log(\`[KaTeX] Rendering complete\`);
                                        resolve();
                                    }
                                    window._previousKaTeXCount = currentKaTeXCount;
                                    setTimeout(checkKaTeXReady, 500);  // 500ms 간격 확인
                                }
                            };
                            
                            checkKaTeXReady();
                        });
                    }
                    
                    // MathJax 렌더링 완료 감지
                    if (window.MathJax && window.MathJax.typesetPromise) {
                        console.log(\`[MathJax] Found, waiting for typeset...\`);
                        try {
                            await Promise.race([
                                window.MathJax.typesetPromise(),
                                new Promise(resolve => setTimeout(resolve, 3000))  // 3초 타임아웃
                            ]);
                            console.log(\`[MathJax] Typeset complete\`);
                        } catch (err) {
                            console.warn(\`MathJax typeset error: \${err.message}\`);
                        }
                    }
                } catch (err) {
                    console.warn(\`KaTeX/MathJax check failed: \${err.message}\`);
                }

                // 4. 브라우저 페인팅 사이클 대기
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
        `;
    }

    /**
     * KaTeX 검증 스크립트
     */
    static getKaTeXValidationScript() {
        return `
            const katexElements = document.querySelectorAll('.katex');
            const katexCount = katexElements.length;
            
            if (katexCount === 0) {
                return { count: 0, status: 'no-katex', hasCSS: !!document.querySelector('link[href*="katex"]') };
            }
            
            // 첫 번째 KaTeX 요소 검증
            const firstKatex = katexElements[0];
            const computedStyle = window.getComputedStyle(firstKatex);
            const fontFamily = computedStyle.fontFamily;
            
            console.log(\`[KaTeX Validation] Count: \${katexCount}, Font: \${fontFamily}\`);
            
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
        `;
    }

    /**
     * 치수 계산 스크립트를 반환합니다
     * @param {Object} params - 계산 매개변수
     * @returns {string} JavaScript 함수 문자열
     */
    static getDimensionCalculationScript(params) {
        const { includeBanner, includeTitle, includeTags, includeDiscussion, marginTop, marginBottom, marginLeft, marginRight, pageWidth } = params;

        return `
            (async (opts) => {
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

                // ✅ KaTeX CSS 명시적 로드
                ${PageEvaluationScripts.getLoadKaTeXCSSScript()}

                // 시각적 완성 대기
                ${PageEvaluationScripts.getWaitForVisualCompleteScript()}

                // C. 레이아웃 요소 크기 고정 (Freeze)
                let freezeCSS = "";
                const layoutElements = document.querySelectorAll('.notion-image-block, .notion-asset-wrapper, div[data-block-id][style*="width"]');
                layoutElements.forEach((el, index) => {
                    const id = \`sn-freeze-\${index}\`;
                    el.dataset.snFreeze = id;
                    const rect = el.getBoundingClientRect();
                    freezeCSS += \`
                        [data-sn-freeze="\${id}"] {
                            width: \${rect.width}px !important;
                            max-width: \${rect.width}px !important;
                            min-width: \${rect.width}px !important;
                            \${(el.classList.contains('notion-image-block') || el.classList.contains('notion-asset-wrapper')) ? \`height: \${rect.height}px !important;\` : ''}
                        }\\n\`;
                });

                // D. 동적 스타일 주입 (감지된 너비 사용)
                const padTopIdx = includeBanner ? 3 : (includeTags ? 4 : 5);
                const totalLayoutWidth = detectedWidth + padLeft + padRight;
                let dynamicStyles = \`
                    .notion-page-content {
                        width: \${detectedWidth}px !important;
                        max-width: \${detectedWidth}px !important;
                        min-width: \${detectedWidth}px !important;
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

                    .layout > .layout-content:nth-child(\${padTopIdx}) { padding-top: \${padTop}px !important; }

                    .whenContentEditable, .layout, .layout-content {
                        width: \${totalLayoutWidth}px !important;
                        max-width: \${totalLayoutWidth}px !important;
                        min-width: \${totalLayoutWidth}px !important;
                    }

                    .layout {
                        padding-bottom: \${padBottom}px !important;
                        --margin-width: 0px !important;
                    }

                    .layout-content { 
                        padding-left: \${padLeft}px !important; 
                        padding-right: \${padRight}px !important;
                    }
                \`;

                if (!includeTitle) dynamicStyles += \`h1, .notion-page-block:has(h1) { display: none !important; }\`;
                if (!includeBanner) dynamicStyles += \`.layout-full .notion-page-cover-wrapper, .layout-content .notion-record-icon, .notion-page-controls { display: none !important; }\`;
                if (!includeTags) dynamicStyles += \`[aria-label="페이지 속성"], [aria-label="Page properties"] { display: none !important; }\`;
                if (!includeDiscussion) dynamicStyles += \`.layout-content-with-divider:has(.notion-page-view-discussion) { display: none !important;}\`;

                const styleTag = document.createElement('style');
                styleTag.id = 'sn-pdf-style';
                styleTag.innerHTML = dynamicStyles + freezeCSS; 
                document.head.appendChild(styleTag);

                // E. 공백 및 개행 처리
                const spans = document.querySelectorAll('span[data-token-index="0"]');
                spans.forEach(span => {
                    let text = span.textContent;
                    if (text.includes(" ")) text = text.replace(/ /g, '\\u00A0');
                    if (text.includes("\\t")) text = text.replace(/\\t/g, '\\u00A0\\u00A0\\u00A0\\u00A0');
                    span.textContent = text;
                });

                window.dispatchEvent(new Event('resize'));
                
                // ✅ 페이지 복잡도에 따른 동적 대기 시간
                const elementCount = document.querySelectorAll('*').length;
                const hasKaTeX = document.querySelectorAll('.katex').length > 0;
                const hasMathJax = !!window.MathJax;
                
                let waitTime = 2000;
                
                if (hasKaTeX || hasMathJax) {
                    waitTime = Math.max(2500, waitTime);
                    console.log(\`KaTeX/MathJax detected, increasing wait time to \${waitTime}ms\`);
                }
                
                if (elementCount > 5000) waitTime = Math.max(3000, waitTime);
                else if (elementCount > 1000) waitTime = Math.max(2500, waitTime);
                else waitTime = Math.max(1500, waitTime);
                
                await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, waitTime)));

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
                    scale: scale
                };
            })(opts)
        `;
    }

    /**
     * 바운딩 박스 계산 스크립트
     */
    static getBoundingBoxCalculationScript() {
        return `
            const elements = Array.from(document.querySelectorAll('.layout-content, .layout-full'));
            if (elements.length === 0) return null;

            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;

            elements.forEach(el => {
                const rect = el.getBoundingClientRect();
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
        `;
    }
}

module.exports = PageEvaluationScripts;
