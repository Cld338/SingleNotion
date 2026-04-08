/**
 * PDF 렌더링을 위한 CSS 템플릿 모듈
 * 모든 스타일 정의를 중앙에서 관리합니다.
 */

class CSSTemplates {
    /**
     * 동적 레이아웃 요소들의 너비를 고정하는 CSS를 생성합니다
     * 
     * PDF 렌더링 시 Notion의 반응형 레이아웃이 예상과 다르게 변형되는 것을 방지하기 위해,
     * 각 요소의 현재 너비/높이를 고정된 픽셀 값으로 변환합니다.
     * 이미지나 에셋 요소는 높이도 함께 고정되며, 다른 요소는 너비만 고정됩니다.
     * 
     * @param {Array<HTMLElement>} layoutElements - 너비를 고정할 DOM 요소들의 배열
     * @returns {string} 생성된 CSS 문자열
     * 
     * 예시:
     *   - 요소의 dataset에 고유한 data-sn-freeze ID를 할당
     *   - 각 요소마다 width, max-width, min-width를 동일한 값으로 설정
     *   - 이미지/에셋 요소는 height도 함께 고정
     */
    static generateFreezingCSS(layoutElements) {
        let freezeCSS = "";
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
        return freezeCSS;
    }

    /**
     * KaTeX 수학 공식 렌더링을 위한 기본 CSS를 반환합니다
     * 
     * KaTeX는 LaTeX 수식을 웹에서 렌더링하는 라이브러리입니다.
     * 이 CSS는 PDF 출력 시 수식이 올바르게 표시되도록 스타일을 정의합니다.
     * 
     * 주요 기능:
     *   - 인라인/디스플레이 수식의 정렬 및 간격 설정
     *   - 글꼴 부드러움 처리 (antialiasing, font-smoothing)
     *   - MathML과 주석 요소 숨김 (시각적 중복 제거)
     *   - KaTeX 내부 요소들(.base, .strut, .mord 등)의 정확한 배치
     *   - SVG 및 폰트 렌더링 최적화
     * 
     * @returns {string} KaTeX 관련 CSS 문자열
     */
    static get KATEX_RENDERING_CSS() {
        return `
            /* ✅ KaTeX 렌더링 개선 */
            .katex {
                display: inline-block;
                white-space: nowrap;
                font-size: 1em;
                font-feature-settings: "kern" 1;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
            }
            
            .katex-display {
                display: block;
                margin: 0.5em 0 !important;
                padding: 0 !important;
                text-align: center;
                overflow-x: auto;
                overflow-y: hidden;
            }
            
            .katex-html {
                display: inline-block;
                width: auto;
                color: inherit;
            }
            
            .katex-mathml,
            .katex-display .katex-mathml,
            .katex > .katex-mathml,
            .annotation {
                display: none !important;
            }
            
            /* ✅ KaTeX base 요소 명시 */
            .katex.katex-display::after {
                content: "";
            }
            
            /* ✅ 모든 KaTeX 자식 요소 스타일 보존 */
            .katex * {
                border: 0 !important;
                margin: 0;
                padding: 0;
                position: relative;
            }
            
            .katex .base {
                position: relative;
                display: inline-block;
                white-space: nowrap;
                width: min-content;
            }
            
            .katex .strut {
                display: inline-block;
                zoom: 1;
                height: 0;
                width: 0;
            }
            
            .katex .sizing, 
            .katex .fontsize-multiplier {
                display: inline-block;
            }
            
            .katex .mord, .katex .mop, .katex .mbin, .katex .mrel, 
            .katex .mopen, .katex .mclose, .katex .mpunct, .katex .minner {
                position: relative;
                display: inline-block;
            }
            
            /* KaTeX HTML은 반드시 표시 */
            .katex-html {
                display: inline-block;
            }
        `;
    }

    /**
     * PDF 렌더링을 위한 기본 레이아웃 CSS를 반환합니다
     * 
     * 이 CSS는 Notion 페이지를 PDF로 변환할 때 불필요한 요소를 숨기고
     * 페이지의 콘텐츠 영역만 표시하도록 레이아웃을 정리합니다.
     * 
     * 주요 기능:
     *   - 사이드바, 상단 네비게이션 바, 도움말 버튼 등 UI 요소 제거
     *   - 페이지 속성 테이블 숨김
     *   - 스크롤바 제거
     *   - SVG 및 콘텐츠 요소의 불필요한 border 제거
     *   - 높이를 자동으로 조정하여 모든 콘텐츠가 보이도록 설정
     *   - @page 규칙으로 A4 페이지 크기 명시
     * 
     * @returns {string} 기본 레이아웃 CSS 문자열
     */
    static get BASE_LAYOUT_CSS() {
        return `
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

            header {
                display: none !important;
            }
            
            div[role="table"][aria-label="Page properties"] + div,
            div[role="table"][aria-label="페이지 속성"] + div
            { display: none !important; }

            .notion-scroller {
                overflow: hidden !important;
            }

            .notion-selectable-container > .notion-scroller { 
                overflow: visible !important; 
                height: auto !important;
            }

            .notion-app-inner, .notion-cursor-listener { 
                height: auto !important; 
            }
            
            ::-webkit-scrollbar { 
                display: none !important; 
            }

            /* ✅ PDF 렌더링 시 SVG 및 콘텐츠 요소의 불필요한 border 제거 */
            svg, svg * {
                border: 0 !important;
            }
            
            .notion-page-content svg,
            .notion-page-content svg * {
                border: 0 !important;
            }
            
            /* 콘텐츠 영역 기본 요소 border 리셋 */
            #content-area svg,
            #content-area svg * {
                border: 0 !important;
            }
        `;
    }

    /**
     * 코드 블록 표시를 위한 CSS를 반환합니다
     * 
     * Notion 페이지의 코드 블록이 PDF에서 올바르게 표시되도록 스타일을 정의합니다.
     * 긴 코드 라인의 줄바꿈 처리와 들여쓰기 공백 유지가 중요합니다.
     * 
     * 주요 기능:
     *   - 코드 텍스트의 공백과 줄바꿈을 원본 그대로 유지 (pre-wrap)
     *   - 모노스페이스 글꼴 강제 적용 (Consolas, Monaco, Courier New)
     *   - 긴 코드 라인이 자동으로 줄바꿈되도록 설정
     * 
     * @returns {string} 코드 블록 관련 CSS 문자열
     */
    static get CODE_BLOCK_CSS() {
        return `
            /* 코드 텍스트 줄바꿈 강제 및 공백 유지 */
            .notion-code-block, .notion-code-block span {
                white-space: pre-wrap !important;
                font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
            }
        `;
    }

    /**
     * PDF 인쇄(headless Chromium)용 @media print CSS를 반환합니다
     * 
     * Puppeteer의 headless Chromium은 @media print 쿼리를 활성화하여 PDF를 생성합니다.
     * 이 CSS는 standard-edit-app.js의 @media print 규칙과 동일한 스타일을 정의하므로,
     * PDF 렌더링이 웹 미리보기와 동일한 레이아웃을 유지합니다.
     * 
     * 주요 기능:
     *   - 배경색/이미지 정확도 보존 (print-color-adjust: exact)
     *   - UI 요소 완전 제거 (navbar, sidebar, loading 오버레이)
     *   - 색상 선택 보존 및 불필요한 효과 제거
     *   - 블록 선택 UI 제거 (outline, border, box-shadow)
     *   - KaTeX 수식 중복 렌더링 방지 (MathML, annotation 숨김)
     *   - 코드 블록 줄바꿈 보존 (white-space: pre-wrap)
     * 
     * @returns {string} @media print 관련 CSS 문자열
     */
    static get PRINT_MEDIA_CSS() {
        return `
            @media print {
                /* ✅ 배경색과 블록 배경 이미지를 정확하게 표시 */
                body {
                    margin: 0;
                    padding: 0;
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                }

                /* ✅ 불필요한 UI 요소 완전 제거 */
                .navbar, .sidebar, .loading-overlay,
                .page-break-marker, .page-break-line, .page-number-label,
                .notion-topbar, .notion-topbar-mobile,
                .notion-help-button, header,
                .notion-history-container,
                .floating-table-of-contents {
                    display: none !important;
                }

                /* ✅ 블록 선택 시 나타나는 UI 효과 제거 */
                .notion-selectable-block, .selected-break, .block-has-break {
                    outline: none !important;
                    border: none !important;
                    box-shadow: none !important;
                    background: transparent !important;
                }

                /* ✅ 텍스트 선택 효과 및 기타 상호작용 제거 */
                *::selection,
                *::-moz-selection {
                    background: transparent !important;
                }

                /* ✅ KaTeX 수식 중복 렌더링 방지 */
                .katex-mathml,
                .katex-display .katex-mathml,
                .katex > .katex-mathml,
                .annotation,
                .MathJax_Preview {
                    display: none !important;
                }

                /* ✅ 링크 기본 스타일 유지 */
                a {
                    color: inherit !important;
                    text-decoration: inherit !important;
                }

                /* ✅ 비활성 요소 스타일 제거 */
                .notion-disabled,
                [disabled] {
                    opacity: 1 !important;
                    pointer-events: auto !important;
                }

                /* ✅ 스크롤바 제거 */
                ::-webkit-scrollbar {
                    display: none !important;
                }

                /* ✅ 브라우저 기본 스타일 오버라이드 방지 */
                img {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    max-width: 100% !important;
                    height: auto !important;
                }

                table {
                    border-collapse: collapse !important;
                }

                table, tbody, tr, td, th {
                    page-break-inside: avoid !important;
                }

                h1, h2, h3, h4, h5, h6,
                p {
                    page-break-after: avoid !important;
                    page-break-inside: avoid !important;
                }

                /* ✅ 코드 블록 스타일 유지 */
                .notion-code-block {
                    white-space: pre-wrap !important;
                    font-family: 'Consolas', 'Monaco', 'Courier New', monospace !important;
                    page-break-inside: avoid !important;
                }
            }
        `;
    }

    /**
     * 감지된 페이지 크기와 패딩을 바탕으로 동적 레이아웃 CSS를 생성합니다
     * 
     * PDF의 실제 너비(detectedWidth)에 맞추어 Notion 요소들의 너비와 패딩을 조정합니다.
     * 각 매개변수는 페이지 분석 단계에서 계산되며, 이 함수는 해당 값들을 CSS로 변환합니다.
     * 또한 사용자 선택사항에 따라 제목, 배너, 태그, 댓글 등의 표시 여부를 조절합니다.
     * 
     * 주요 기능:
     *   - 콘텐츠 영역의 너비를 PDF 페이지 너비에 맞춤
     *   - 상단/하단/좌측/우측 패딩 값을 적용
     *   - 특정 인덱스의 레이아웃 요소에만 패딩 적용
     *   - 제목, 배너, 태그, 댓글 표시 여부에 따라 display 속성 조절
     * 
     * @param {Object} params - 레이아웃 매개변수 객체
     * @param {number} params.detectedWidth - 감지된 PDF 페이지 콘텐츠 너비 (픽셀)
     * @param {number} params.padTop - 상단 패딩 (픽셀)
     * @param {number} params.padBottom - 하단 패딩 (픽셀)
     * @param {number} params.padLeft - 좌측 패딩 (픽셀)
     * @param {number} params.padRight - 우측 패딩 (픽셀)
     * @param {number} params.padTopIdx - 패딩을 적용할 레이아웃 요소의 인덱스
     * @param {number} params.totalLayoutWidth - 전체 레이아웃의 총 너비 (픽셀)
     * @param {boolean} params.includeTitle - 페이지 제목 포함 여부
     * @param {boolean} params.includeBanner - 페이지 배너 포함 여부
     * @param {boolean} params.includeTags - 페이지 태그 포함 여부
     * @param {boolean} params.includeDiscussion - 댓글 섹션 포함 여부
     * @returns {string} 생성된 동적 CSS 문자열
     */
    static generateDynamicLayoutCSS({
        detectedWidth,
        padTop,
        padBottom,
        padLeft,
        padRight,
        padTopIdx,
        totalLayoutWidth,
        includeTitle,
        includeBanner,
        includeTags,
        includeDiscussion
    }) {
        let dynamicStyles = `
            .notion-page-content {
                width: ${detectedWidth}px !important;
                max-width: ${detectedWidth}px !important;
                min-width: ${detectedWidth}px !important;
            }

            .layout > .layout-content:nth-child(${padTopIdx}) { 
                padding-top: ${padTop}px !important; 
            }

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
        `;

        if (!includeTitle) {
            dynamicStyles += `h1, .notion-page-block:has(h1) { display: none !important; }`;
        }
        
        if (!includeBanner) {
            dynamicStyles += `.layout-full .notion-page-cover-wrapper, .layout-content .notion-record-icon, .notion-page-controls { display: none !important; }`;
        }
        
        if (!includeTags) {
            dynamicStyles += `[aria-label="페이지 속성"], [aria-label="Page properties"] { display: none !important; }`;
        }
        
        if (!includeDiscussion) {
            dynamicStyles += `.layout-content-with-divider:has(.notion-page-view-discussion) { display: none !important;}`;
        }

        return dynamicStyles;
    }

    /**
     * 모든 CSS 템플릿을 조합하여 완전한 PDF 렌더링용 CSS를 생성합니다
     * 
     * 이 함수는 기본 레이아웃, 코드 블록, KaTeX 렌더링, print media, 동적 레이아웃 CSS를
     * 순서대로 결합하여 최종 CSS 문자열을 생성합니다.
     * 이렇게 생성된 CSS는 HTML의 <style> 태그에 직접 삽입되어 PDF 렌더링을 제어합니다.
     * 
     * 실행 순서:
     *   1. 기본 레이아웃 CSS (BASE_LAYOUT_CSS) - UI 요소 제거
     *   2. 코드 블록 CSS (CODE_BLOCK_CSS) - 코드 표시 형식
     *   3. KaTeX 렌더링 CSS (KATEX_RENDERING_CSS) - 수식 렌더링
     *   4. Print Media CSS (PRINT_MEDIA_CSS) - @media print 규칙 (배경색 보존, 코드 줄바꿈, KaTeX 최적화)
     *   5. 동적 레이아웃 CSS (generateDynamicLayoutCSS) - 페이지별 커스텀 레이아웃
     * 
     * @param {Object} params - 동적 레이아웃 생성을 위한 모든 매개변수
     *                         (generateDynamicLayoutCSS 함수의 params와 동일)
     * @returns {string} 모든 스타일이 포함된 완전한 CSS 문자열
     * 
     * 예시 사용:
     *   const cssString = CSSTemplates.generateCompletePDFStyles({
     *     detectedWidth: 750,
     *     padTop: 20,
     *     // ... 다른 매개변수들
     *   });
     */
    static generateCompletePDFStyles(params) {
        const baseCSS = CSSTemplates.BASE_LAYOUT_CSS;
        const codeCSS = CSSTemplates.CODE_BLOCK_CSS;
        const katexCSS = CSSTemplates.KATEX_RENDERING_CSS;
        const printMediaCSS = CSSTemplates.PRINT_MEDIA_CSS;
        const dynamicCSS = CSSTemplates.generateDynamicLayoutCSS(params);

        return `${baseCSS}\n${codeCSS}\n${katexCSS}\n${printMediaCSS}\n${dynamicCSS}`;
    }
}

module.exports = CSSTemplates;
