const puppeteer = require('puppeteer');

async function analyzeKatexStability(url) {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    console.log(`[분석 시작] KaTeX 안정화 검증: ${url}`);

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded' });

        const results = await page.evaluate(async () => {
            const STABILITY_THRESHOLD = 2000; // 2초 동안 변화가 없으면 안정화로 간주
            const startTime = performance.now();
            
            let metrics = {
                firstDetection: null,
                stableTime: null,
                finalCount: 0,
                isTimeout: false
            };

            return new Promise((resolve) => {
                let stabilityTimer;
                let lastCount = 0;

                const checkStability = () => {
                    const currentEquations = document.querySelectorAll('.notion-equation-block, .katex');
                    const currentCount = currentEquations.length;

                    // 첫 번째 수식 감지 시점 기록
                    if (currentCount > 0 && !metrics.firstDetection) {
                        metrics.firstDetection = (performance.now() - startTime).toFixed(2);
                    }

                    // 수식 개수가 변했거나 아직 하나도 발견되지 않았다면 타이머 리셋
                    if (currentCount !== lastCount || currentCount === 0) {
                        lastCount = currentCount;
                        clearTimeout(stabilityTimer);
                        stabilityTimer = setTimeout(finalize, STABILITY_THRESHOLD);
                    }
                };

                const finalize = () => {
                    observer.disconnect();
                    metrics.stableTime = (performance.now() - startTime - STABILITY_THRESHOLD).toFixed(2);
                    metrics.finalCount = lastCount;
                    resolve(metrics);
                };

                // 1. DOM 변화 감지
                const observer = new MutationObserver(() => {
                    checkStability();
                });

                observer.observe(document.body, { childList: true, subtree: true });

                // 2. 초기 체크 실행
                checkStability();

                // 3. 최악의 경우를 대비한 타임아웃 (30초)
                setTimeout(() => {
                    if (!metrics.stableTime) {
                        metrics.isTimeout = true;
                        finalize();
                    }
                }, 30000);
            });
        });

        console.log('\n=== KaTeX 안정화 분석 결과 ===');
        console.log(`- 최종 확인된 수식 개수: ${results.finalCount}개`);
        console.log(`- 첫 수식 등장 시점: ${results.firstDetection}ms`);
        console.log(`- 렌더링 안정화 시점: ${results.stableTime}ms ${results.isTimeout ? '(타임아웃 발생)' : ''}`);
        
        // 현재 서비스 로직과 비교 분석
        console.log('\n=== 서비스 로직 최적화 제안 ===');
        if (parseFloat(results.stableTime) > 10000) {
            console.log(`[주의] 현재 서비스의 대기 시간(10000ms)보다 안정화 시간이 더 깁니다.`);
            console.log(`추천: pdfService.js의 대기 로직을 수식 개수 기반 확인 방식으로 변경하십시오.`);
        } else {
            console.log(`[양호] 현재 서비스의 대기 시간 내에 수식 렌더링이 안정화됩니다.`);
        }

    } catch (error) {
        console.error('분석 중 오류 발생:', error);
    } finally {
        await browser.close();
    }
}

const targetUrl = 'https://cloudier338.notion.site/Representation-Learning-on-Graphs-Methods-and-Applications-217fc609de738093b6d6ddf0c011b089';
analyzeKatexStability(targetUrl);