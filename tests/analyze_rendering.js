const puppeteer = require('puppeteer');
const path = require('path');

async function analyzeNotionRendering(url) {
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();
    
    // 분석 결과를 담을 객체
    const metrics = {
        navigationStart: 0,
        elements: []
    };

    // 브라우저 내부 로그를 터미널로 전달
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    try {
        console.log(`분석 시작: ${url}`);
        
        await page.goto(url, { waitUntil: 'domcontentloaded' });
        metrics.navigationStart = Date.now();

        // 브라우저 컨텍스트 내에서 성능 측정 실행
        const elementMetrics = await page.evaluate(async () => {
            const results = [];
            const startTime = performance.now();

            // 측정 대상 셀렉터 정의
            const targetSelectors = {
                '이미지 블록': '.notion-image-block',
                '코드 블록': '.notion-code-block',
                '수식(KaTeX)': '.notion-equation-block',
                '데이터베이스': '.notion-collection_view-block',
                '전체 컨텐츠': '.notion-page-content'
            };

            const observer = new MutationObserver((mutations) => {
                for (const [name, selector] of Object.entries(targetSelectors)) {
                    const el = document.querySelector(selector);
                    // 요소가 발견되었고 아직 기록되지 않은 경우
                    if (el && !results.find(r => r.name === name)) {
                        results.push({
                            name: name,
                            renderTime: (performance.now() - startTime).toFixed(2),
                            timestamp: new Date().toISOString()
                        });
                    }
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            // 렌더링이 안정화될 때까지 대기 (최대 10초)
            await new Promise(resolve => setTimeout(resolve, 10000));
            observer.disconnect();

            return results;
        });

        metrics.elements = elementMetrics;

        // 리소스별 로딩 시간 분석 (이미지, 스크립트 등)
        const resourceMetrics = await page.evaluate(() => {
            return performance.getEntriesByType('resource')
                .filter(r => r.initiatorType === 'img')
                .map(r => ({
                    name: r.name.split('/').pop().split('?')[0], // 파일명만 추출
                    duration: r.duration.toFixed(2),
                    size: (r.transferSize / 1024).toFixed(2) + ' KB'
                }))
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 10); // 가장 오래 걸린 10개만
        });

        console.log('\n=== 요소별 렌더링 완료 시간 (ms) ===');
        console.table(metrics.elements);

        console.log('\n=== 상위 10개 무거운 리소스 로딩 시간 (ms) ===');
        console.table(resourceMetrics);

    } catch (error) {
        console.error('분석 중 오류 발생:', error);
    } finally {
        await browser.close();
    }
}

// 테스트 실행 (분석하고 싶은 노션 URL 입력)
const targetUrl = 'https://cloudier338.notion.site/Representation-Learning-on-Graphs-Methods-and-Applications-217fc609de738093b6d6ddf0c011b089';
analyzeNotionRendering(targetUrl);