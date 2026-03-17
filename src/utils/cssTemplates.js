/**
 * PDF 렌더링을 위한 CSS 템플릿 모듈
 * 모든 스타일 정의를 중앙에서 관리합니다.
 */

class CSSTemplates {
    /**
     * 레이아웃 고정 CSS를 생성합니다
     * @param {Array} layoutElements - 레이아웃 요소들
     * @returns {string} CSS 문자열
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
     * 기본 KaTeX 렌더링 CSS
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
     * 기본 레이아웃 CSS
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
     * 코드 블록 CSS
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
     * 동적 레이아웃 CSS를 생성합니다
     * @param {Object} params - 레이아웃 매개변수
     * @returns {string} CSS 문자열
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
     * 완전한 PDF 렌더링 CSS를 생성합니다
     * @param {Object} params - 모든 CSS 유틸 매개변수
     * @returns {string} 완전한 CSS 문자열
     */
    static generateCompletePDFStyles(params) {
        const baseCSS = CSSTemplates.BASE_LAYOUT_CSS;
        const codeCSS = CSSTemplates.CODE_BLOCK_CSS;
        const katexCSS = CSSTemplates.KATEX_RENDERING_CSS;
        const dynamicCSS = CSSTemplates.generateDynamicLayoutCSS(params);

        return `${baseCSS}\n${codeCSS}\n${katexCSS}\n${dynamicCSS}`;
    }
}

module.exports = CSSTemplates;
