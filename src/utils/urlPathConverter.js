const logger = require('./logger');

/**
 * URL 경로 변환 유틸리티
 * 상대 경로를 절대 경로로 변환하는 기능을 제공합니다.
 */
class URLPathConverter {
    /**
     * 원시 경로에서 따옴표 정보를 추출합니다
     * @param {string} rawPath - 원시 경로
     * @returns {Object} { hasQuote: boolean, quoteFormat: string|null, cleanPath: string }
     */
    static extractQuoteInfo(rawPath) {
        let hasQuote = false;
        let quoteFormat = null;
        const trimmedRaw = rawPath.trim();

        if (trimmedRaw.startsWith('"')) {
            hasQuote = true;
            quoteFormat = '"';
        } else if (trimmedRaw.startsWith("'")) {
            hasQuote = true;
            quoteFormat = "'";
        } else if (trimmedRaw.startsWith('&quot;')) {
            hasQuote = true;
            quoteFormat = '&quot;';
        }

        const cleanPath = rawPath
            .trim()
            .replace(/^["']+|["']+$/g, '')       // 시작/끝 따옴표 제거 (여러 개)
            .replace(/&quot;/g, '')              // HTML 엔티티 따옴표 제거
            .replace(/&#34;/g, '')               // 수치 HTML 엔티티 제거
            .trim();

        return { hasQuote, quoteFormat, cleanPath };
    }

    /**
     * 경로가 처리 대상인지 검증합니다
     * (이미 절대 경로이거나 데이터 URI인 경우 false 반환)
     * @param {string} cleanPath - 정리된 경로
     * @returns {boolean}
     */
    static shouldProcessPath(cleanPath) {
        if (!cleanPath) return false;
        return !(cleanPath.startsWith('http') || cleanPath.startsWith('data:') || cleanPath.startsWith('//'));
    }

    /**
     * 상대 경로를 절대 경로로 변환합니다
     * @param {string} cleanPath - 정리된 경로
     * @param {string} baseUrl - 기본 URL
     * @param {string} baseOrigin - 기본 origin (선택사항)
     * @returns {string|null} 변환된 URL 또는 null
     */
    static resolveUrl(cleanPath, baseUrl, baseOrigin = null) {
        try {
            const origin = baseOrigin || new URL(baseUrl).origin;
            
            if (cleanPath.startsWith('/')) {
                return `${origin}${cleanPath}`;
            } else {
                return new URL(cleanPath, baseUrl).href;
            }
        } catch (err) {
            logger.debug(`Failed to resolve URL: ${cleanPath} - ${err.message}`);
            return null;
        }
    }

    /**
     * 따옴표 형식에 따라 경로를 복원합니다
     * @param {string} resolvedUrl - 해결된 URL
     * @param {boolean} hasQuote - 따옴표 있음 여부
     * @param {string|null} quoteFormat - 따옴표 형식
     * @returns {string} 따옴표가 복원된 경로
     */
    static restoreQuoteFormat(resolvedUrl, hasQuote, quoteFormat) {
        if (!hasQuote) return resolvedUrl;
        
        if (quoteFormat === '&quot;') {
            return `&quot;${resolvedUrl}&quot;`;
        } else {
            return `${quoteFormat}${resolvedUrl}${quoteFormat}`;
        }
    }

    /**
     * src/href 속성의 경로를 변환합니다
     * @param {string} html - HTML 문자열
     * @param {string} baseUrl - 기본 URL
     * @returns {string} 변환된 HTML
     */
    static convertSrcHrefPaths(html, baseUrl) {
        const baseOrigin = new URL(baseUrl).origin;

        return html.replace(
            /(?:src|href)=["'](?!(?:http|https|data:|\/\/))([^"']+)["']/gi,
            (match, path) => {
                try {
                    const resolvedUrl = URLPathConverter.resolveUrl(path, baseUrl, baseOrigin);
                    if (!resolvedUrl) return match;
                    return match.replace(path, resolvedUrl);
                } catch (err) {
                    logger.warn(`Failed to convert path: ${path}, error: ${err.message}`);
                    return match;
                }
            }
        );
    }

    /**
     * background-image URL을 변환합니다
     * @param {string} html - HTML 문자열
     * @param {string} baseUrl - 기본 URL
     * @returns {string} 변환된 HTML
     */
    static convertBackgroundImageUrls(html, baseUrl) {
        const baseOrigin = new URL(baseUrl).origin;

        return html.replace(
            /background-image\s*:\s*url\s*\(\s*([^)]*)\s*\)/gi,
            (match, rawPath) => {
                try {
                    const { hasQuote, quoteFormat, cleanPath } = URLPathConverter.extractQuoteInfo(rawPath);

                    if (!URLPathConverter.shouldProcessPath(cleanPath)) {
                        return match;
                    }

                    const resolvedUrl = URLPathConverter.resolveUrl(cleanPath, baseUrl, baseOrigin);
                    if (!resolvedUrl) return match;

                    const restoreQuotedUrl = URLPathConverter.restoreQuoteFormat(resolvedUrl, hasQuote, quoteFormat);
                    
                    if (quoteFormat === '&quot;') {
                        return `background-image: url(&quot;${resolvedUrl}&quot;)`;
                    } else {
                        return `background-image: url(${restoreQuotedUrl})`;
                    }
                } catch (err) {
                    logger.warn(`Failed to convert background URL: ${rawPath}`);
                    return match;
                }
            }
        );
    }

    /**
     * style 속성 내의 url()을 변환합니다
     * @param {string} html - HTML 문자열
     * @param {string} baseUrl - 기본 URL
     * @returns {string} 변환된 HTML
     */
    static convertStyleUrls(html, baseUrl) {
        const baseOrigin = new URL(baseUrl).origin;

        return html.replace(
            /style=["']([^"']*)["']/gi,
            (match, styleContent) => {
                let updatedStyle = styleContent.replace(
                    /url\s*\(\s*([^)]*)\s*\)/g,
                    (urlMatch, rawPath) => {
                        try {
                            const { hasQuote, quoteFormat, cleanPath } = URLPathConverter.extractQuoteInfo(rawPath);

                            if (!URLPathConverter.shouldProcessPath(cleanPath)) {
                                return urlMatch;
                            }

                            const resolvedUrl = URLPathConverter.resolveUrl(cleanPath, baseUrl, baseOrigin);
                            if (!resolvedUrl) return urlMatch;

                            const restoreQuotedUrl = URLPathConverter.restoreQuoteFormat(resolvedUrl, hasQuote, quoteFormat);
                            
                            if (quoteFormat === '&quot;') {
                                return `url(&quot;${resolvedUrl}&quot;)`;
                            } else {
                                return `url(${restoreQuotedUrl})`;
                            }
                        } catch (err) {
                            logger.warn(`Failed to convert style URL: ${rawPath}`);
                            return urlMatch;
                        }
                    }
                );
                return `style="${updatedStyle}"`;
            }
        );
    }

    /**
     * 모든 상대 경로를 절대 경로로 변환합니다
     * @param {string} html - HTML 문자열
     * @param {string} baseUrl - 기본 URL
     * @returns {string} 변환된 HTML
     */
    static convertAll(html, baseUrl) {
        try {
            let processedHtml = html;
            processedHtml = URLPathConverter.convertSrcHrefPaths(processedHtml, baseUrl);
            processedHtml = URLPathConverter.convertBackgroundImageUrls(processedHtml, baseUrl);
            processedHtml = URLPathConverter.convertStyleUrls(processedHtml, baseUrl);
            return processedHtml;
        } catch (err) {
            logger.warn(`Error converting relative paths: ${err.message}`);
            return html;
        }
    }
}

module.exports = URLPathConverter;
