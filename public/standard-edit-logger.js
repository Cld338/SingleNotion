/**
 * Logger Utility - Console logging helpers for standard-edit.html
 */

const Logger = (() => {
    const colors = {
        title: 'color: #6366f1; font-weight: bold; font-size: 14px',
        success: 'color: #10b981',
        error: 'color: #ef4444',
        warning: 'color: #f97316',
        info: 'color: #0ea5e9',
        debug: 'color: #8b5cf6',
        muted: 'color: #94a3b8; font-size: 11px'
    };

    return {
        logSection(title, type = 'title') {
            console.log(`%c=== ${title} ===`, colors[type] || colors.title);
        },

        log(message, type = 'info', data = null) {
            if (type === 'title') {
                this.logSection(message);
            } else {
                const style = colors[type] || colors.info;
                console.log(`%c[${message}]`, style, data || '');
            }
        },

        success(message, data = null) {
            console.log(`%c✓ ${message}`, colors.success, data || '');
        },

        error(message, err = null) {
            console.error(`%c✗ ${message}`, colors.error, err);
        },

        warn(message, data = null) {
            console.warn(`%c⚠ ${message}`, colors.warning, data || '');
        },

        // 리소스 로킹
        logResources(resources) {
            if (!resources) return;

            this.logSection('로드된 CSS 파일', 'title');
            if (resources.cssLinks?.length) {
                resources.cssLinks.forEach((css, idx) => {
                    console.log(`[${idx + 1}] ${css.media ? `[${css.media}] ` : ''}${css.href}`);
                });
            } else {
                console.log('CSS 파일 없음');
            }

            this.logSection('로드된 인라인 스타일', 'title');
            if (resources.inlineStyles?.length) {
                resources.inlineStyles.forEach((style, idx) => {
                    console.log(`[${idx + 1}] ID: ${style.id || '(unnamed)'} | Size: ${style.content.length}B`);
                });
            } else {
                console.log('인라인 스타일 없음');
            }

            this.logSection('로드된 이미지', 'title');
            if (resources.images?.length) {
                resources.images.forEach((img, idx) => {
                    console.log(`[${idx + 1}] ${img.src}${img.alt ? ` (alt: ${img.alt})` : ''}`);
                });
            } else {
                console.log('이미지 없음');
            }

            this.logSection('로드된 아이콘', 'title');
            if (resources.icons?.length) {
                resources.icons.forEach((icon, idx) => {
                    console.log(`[${idx + 1}] ${icon.rel}: ${icon.href}`);
                });
            } else {
                console.log('아이콘 없음');
            }

            this.logSection('로드된 폰트', 'title');
            if (resources.fonts?.length) {
                resources.fonts.forEach((font, idx) => {
                    console.log(`[${idx + 1}] ${font.href}`);
                });
            } else {
                console.log('폰트 없음');
            }

            this.logSection('로드된 스크립트', 'title');
            if (resources.scripts?.length) {
                const external = resources.scripts.filter(s => s.type === 'external');
                const inline = resources.scripts.filter(s => s.type === 'inline');

                if (external.length) {
                    console.log('외부 스크립트:');
                    external.forEach((script, idx) => {
                        console.log(`  [${idx + 1}] ${script.src}`);
                    });
                }

                if (inline.length) {
                    console.log(`인라인 스크립트: ${inline.length}개 (총 ${inline.reduce((s, sc) => s + sc.contentLength, 0)}B)`);
                }
            } else {
                console.log('스크립트 없음');
            }

            this.logSection('로드된 KaTeX 리소스', 'title');
            if (resources.katexResources?.length) {
                resources.katexResources.forEach((katex, idx) => {
                    const url = katex.src || katex.href;
                    console.log(`[${idx + 1}] ${katex.type}: ${url}`);
                });
            } else {
                console.log('KaTeX 리소스 없음');
            }

            this.logSection('로드된 비디오/미디어', 'title');
            if (resources.videos?.length) {
                resources.videos.forEach((video, idx) => {
                    console.log(`[${idx + 1}] <${video.tag}> ${video.src}${video.type ? ` (type: ${video.type})` : ''}`);
                });
            } else {
                console.log('비디오/미디어 없음');
            }

            this.logSection('기타 Assets', 'title');
            if (resources.otherAssets?.length) {
                resources.otherAssets.forEach((asset, idx) => {
                    console.log(`[${idx + 1}] <${asset.type}> ${asset.url}`);
                });
            } else {
                console.log('기타 assets 없음');
            }
        },

        // 현재 DOM 의 리소스 상태
        logDomStatus() {
            this.logSection('현재 DOM의 모든 stylesheet', 'title');
            document.querySelectorAll('link[rel="stylesheet"]').forEach((link, idx) => {
                console.log(`[${idx + 1}] <link> ${link.href}`);
            });

            this.logSection('현재 DOM의 모든 style 태그', 'title');
            document.querySelectorAll('style').forEach((style, idx) => {
                const id = style.id ? ` id="${style.id}"` : '';
                const size = style.textContent.length;
                const preview = style.textContent.substring(0, 60).replace(/\n/g, ' ').trim();
                console.log(`[${idx + 1}]<style${id}> Size: ${size}B | Preview: ${preview}...`);
            });

            this.logSection('현재 DOM의 모든 script 태그', 'title');
            document.querySelectorAll('script').forEach((script, idx) => {
                if (script.src) {
                    console.log(`[${idx + 1}] <script src> ${script.src}`);
                } else {
                    const size = script.textContent.length;
                    const preview = script.textContent.substring(0, 60).replace(/\n/g, ' ').trim();
                    console.log(`[${idx + 1}] <script> Inline | Size: ${size}B | Preview: ${preview}...`);
                }
            });

            const cssLinks = document.querySelectorAll('link[rel="stylesheet"]');
            const styles = document.querySelectorAll('style');
            const scripts = document.querySelectorAll('script');
            this.logSection('리소스 요약', 'title');
            console.log(`✓ CSS 파일: ${cssLinks.length}개`);
            console.log(`✓ Style 태그: ${styles.length}개 (총 ${Array.from(styles).reduce((sum, s) => sum + s.textContent.length, 0)}B)`);
            console.log(`✓ Script 태그: ${scripts.length}개`);
        },

        // KaTeX 폰트 상태
        logFontStatuses() {
            const fonts = ['KaTeX_Main', 'KaTeX_Math', 'KaTeX_Caligraphic', 'KaTeX_Size1', 'KaTeX_Size2'];
            fonts.forEach(fontName => {
                try {
                    const status = document.fonts.check('12px ' + fontName);
                    const color = status ? colors.success : colors.error;
                    const marker = status ? '✓' : '✗';
                    console.log(`%c${marker} ${fontName}: ${status ? 'LOADED' : 'NOT LOADED'}`, color);
                } catch (e) {
                    this.error(`Error checking ${fontName}`, e);
                }
            });
        }
    };
})();
