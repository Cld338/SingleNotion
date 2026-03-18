const logger = require('./logger');

/**
 * URL 경로 변환 유틸리티
 * 상대 경로를 절대 경로로 변환하는 기능을 제공합니다.
 */
class URLPathConverter {
    /**
     * 원시 경로에서 따옴표 정보를 추출합니다
     * HTML 엔티티도 함께 디코딩합니다
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

        let cleanPath = rawPath
            .trim()
            .replace(/^["']+|["']+$/g, '')       // 시작/끝 따옴표 제거 (여러 개)
            .replace(/&quot;/g, '')              // HTML 엔티티 따옴표 제거
            .replace(/&#34;/g, '')               // 수치 HTML 엔티티 제거
            .trim();
        
        // HTML 엔티티 디코딩 (특히 &amp; → &, &lt; → <, &gt; → >)
        // 이는 URL 파라미터가 HTML 엔티티로 인코딩된 경우를 처리
        cleanPath = cleanPath
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&apos;/g, "'");

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
     * 외부 URL을 proxy-asset으로 변환합니다
     * (data: URI와 이미 /proxy-asset인 것은 제외)
     * 상대 경로는 baseOrigin을 사용해 절대 경로로 변환한 후 proxy-asset으로 변환
     * @param {string} url - URL
     * @param {string} baseOrigin - 기본 origin (상대 경로 처리용)
     * @returns {string} proxy-asset 형태의 URL 또는 원본 URL
     */
    static convertToProxyAsset(url, baseOrigin = null) {
        if (!url) return url;
        
        // 이미 proxy-asset이거나 data URI인 경우 그대로 반환
        if (url.includes('/proxy-asset') || url.startsWith('data:')) {
            return url;
        }
        
        // 외부 URL (http/https)인 경우 proxy-asset으로 변환
        if (url.startsWith('http://') || url.startsWith('https://')) {
            return `/proxy-asset?url=${encodeURIComponent(url)}`;
        }
        
        // 상대 경로인 경우 baseOrigin을 사용해 절대 경로로 변환 후 proxy-asset으로 변환
        if (baseOrigin && (url.startsWith('/') || url.startsWith('./'))) {
            const absoluteUrl = url.startsWith('/') 
                ? `${baseOrigin}${url}`
                : `${baseOrigin}/${url}`;
            return `/proxy-asset?url=${encodeURIComponent(absoluteUrl)}`;
        }
        
        // 상대 경로인데 baseOrigin이 없으면 그대로 반환 (나중에 처리될 것으로 예상)
        return url;
    }

    /**
     * src/href 속성의 모든 URL을 proxy-asset으로 변환합니다
     * HTML 엔티티(&amp;, &lt;, &gt; 등)를 먼저 디코딩합니다
     * @param {string} html - HTML 문자열
     * @param {string} baseOrigin - 기본 origin
     * @returns {string} 변환된 HTML
     */
    static convertSrcHrefToProxyAsset(html, baseOrigin = null) {
        return html.replace(
            /(?:src|href)=["']([^"']+)["']/gi,
            (match, url) => {
                // HTML 엔티티 디코딩
                let decodedUrl = url
                    .replace(/&amp;/g, '&')
                    .replace(/&lt;/g, '<')
                    .replace(/&gt;/g, '>')
                    .replace(/&apos;/g, "'")
                    .replace(/&quot;/g, '"');
                
                const proxiedUrl = URLPathConverter.convertToProxyAsset(decodedUrl, baseOrigin);
                return match.replace(url, proxiedUrl);
            }
        );
    }

    /**
     * style 속성 내의 url()을 proxy-asset으로 변환합니다
     * @param {string} html - HTML 문자열
     * @param {string} baseOrigin - 기본 origin
     * @returns {string} 변환된 HTML
     */
    static convertStyleUrlsToProxyAsset(html, baseOrigin = null) {
        return html.replace(
            /style=["']([^"']*)["']/gi,
            (match, styleContent) => {
                let updatedStyle = styleContent.replace(
                    /url\s*\(\s*([^)]*)\s*\)/g,
                    (urlMatch, rawPath) => {
                        try {
                            const { hasQuote, quoteFormat, cleanPath } = URLPathConverter.extractQuoteInfo(rawPath);
                            const proxiedUrl = URLPathConverter.convertToProxyAsset(cleanPath, baseOrigin);
                            const restoreQuotedUrl = URLPathConverter.restoreQuoteFormat(proxiedUrl, hasQuote, quoteFormat);
                            
                            if (quoteFormat === '&quot;') {
                                return `url(&quot;${proxiedUrl}&quot;)`;
                            } else {
                                return `url(${restoreQuotedUrl})`;
                            }
                        } catch (err) {
                            logger.warn(`Failed to convert style URL to proxy-asset: ${rawPath}`);
                            return urlMatch;
                        }
                    }
                );
                return `style="${updatedStyle}"`;
            }
        );
    }

    /**
     * background-image의 url()을 proxy-asset으로 변환합니다
     * @param {string} html - HTML 문자열
     * @param {string} baseOrigin - 기본 origin
     * @returns {string} 변환된 HTML
     */
    static convertBackgroundImageUrlsToProxyAsset(html, baseOrigin = null) {
        return html.replace(
            /background-image\s*:\s*url\s*\(\s*([^)]*)\s*\)/gi,
            (match, rawPath) => {
                try {
                    const { hasQuote, quoteFormat, cleanPath } = URLPathConverter.extractQuoteInfo(rawPath);
                    const proxiedUrl = URLPathConverter.convertToProxyAsset(cleanPath, baseOrigin);
                    const restoreQuotedUrl = URLPathConverter.restoreQuoteFormat(proxiedUrl, hasQuote, quoteFormat);
                    
                    if (quoteFormat === '&quot;') {
                        return `background-image: url(&quot;${proxiedUrl}&quot;)`;
                    } else {
                        return `background-image: url(${restoreQuotedUrl})`;
                    }
                } catch (err) {
                    logger.warn(`Failed to convert background-image URL to proxy-asset: ${rawPath}`);
                    return match;
                }
            }
        );
    }

    /**
     * 모든 외부 URL을 proxy-asset으로 변환합니다
     * (상대 경로와 절대 경로 모두 처리)
     * @param {string} html - HTML 문자열
     * @param {string} baseUrl - 기본 URL (상대 경로 처리용)
     * @returns {string} 변환된 HTML
     */
    static convertAllToProxyAsset(html, baseUrl = null) {
        try {
            const baseOrigin = baseUrl ? new URL(baseUrl).origin : null;
            let processedHtml = html;
            processedHtml = URLPathConverter.convertSrcHrefToProxyAsset(processedHtml, baseOrigin);
            processedHtml = URLPathConverter.convertBackgroundImageUrlsToProxyAsset(processedHtml, baseOrigin);
            processedHtml = URLPathConverter.convertStyleUrlsToProxyAsset(processedHtml, baseOrigin);
            return processedHtml;
        } catch (err) {
            logger.warn(`Error converting URLs to proxy-asset: ${err.message}`);
            return html;
        }
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
