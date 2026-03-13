/**
 * KaTeX Font Loader - Handles KaTeX font initialization and monitoring
 */

(function() {
    Logger.log('KATEX FONTS Initializing font load monitoring...', 'error');

    // 폰트 파일 URL 목록
    const fontUrls = [
        '/katex/fonts/KaTeX_AMS-Regular.66c67820.woff2',
        '/katex/fonts/KaTeX_Main-Regular.f8a7f19f.woff2',
        '/katex/fonts/KaTeX_Main-Italic.65297062.woff2',
        '/katex/fonts/KaTeX_Math-Italic.d8b7a801.woff2',
        '/katex/fonts/KaTeX_Caligraphic-Regular.08d95d99.woff2',
        '/katex/fonts/KaTeX_Size1-Regular.82ef26dc.woff2',
        '/katex/fonts/KaTeX_Size2-Regular.95a1da91.woff2'
    ];

    // 폰트 URL 테스트
    Logger.log('KATEX FONTS Testing font URLs:', 'error');
    fontUrls.forEach(url => {
        fetch(url, { method: 'HEAD' })
            .then(response => {
                const status = response.status;
                const contentType = response.headers.get('content-type');
                const marker = status === 200 ? '✓' : '✗';
                Logger.log(
                    `${marker} ${url.split('/').pop()} [${status}] Type: ${contentType}`,
                    status === 200 ? 'success' : 'error'
                );
            })
            .catch(err => {
                Logger.error(`${url} - ${err.message}`);
            });
    });

    // 폰트 로드 상태 확인
    if ('fonts' in document) {
        Promise.all([
            document.fonts.load('12px KaTeX_AMS'), // 추가됨
            document.fonts.load('12px KaTeX_Main'),
            document.fonts.load('12px KaTeX_Math'),
            document.fonts.load('12px KaTeX_Caligraphic'),
            document.fonts.load('12px KaTeX_Size1'),
            document.fonts.load('12px KaTeX_Size2')
        ]).then(() => {
            Logger.log('KATEX FONTS All fonts loaded successfully', 'success');
            Logger.logFontStatuses();
        }).catch(err => {
            Logger.error('KATEX FONTS Some fonts failed to load', err);
            Logger.logFontStatuses();
        });

        document.fonts.ready.then(() => {
            Logger.log('KATEX FONTS document.fonts.ready resolved', 'success');
        }).catch(err => {
            Logger.error('KATEX FONTS document.fonts.ready error', err);
        });
    }

    // 문서 로드 후 폰트 상태 확인
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkFontStatusAfterLoad);
    } else {
        checkFontStatusAfterLoad();
    }

    function checkFontStatusAfterLoad() {
        setTimeout(() => {
            Logger.log('KATEX FONTS Font status after DOM load:', 'error');
            Logger.logFontStatuses();
        }, 500);
    }
})();
