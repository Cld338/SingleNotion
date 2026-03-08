// tests/visual/pdf-visual.test.js
const fs = require('fs');
const path = require('path');
const { fromPath } = require('pdf2pic');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch');
const { PDFDocument } = require('pdf-lib'); // PDF 크기 측정을 위해 추가
const pdfService = require('../../src/services/pdfService');
const pages = require('./pages.json');

const OUTPUT_DIR = path.join(__dirname, 'output');

// 디렉토리 초기화
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// 이미지 크기 맞춤 헬퍼 함수
function alignImageSizes(img1, img2) {
    const width = Math.max(img1.width, img2.width);
    const height = Math.max(img1.height, img2.height);

    const createAligned = (img) => {
        if (img.width === width && img.height === height) return img;
        const aligned = new PNG({ width, height });
        img.bitblt(aligned, 0, 0, img.width, img.height, 0, 0);
        return aligned;
    };

    return { 
        alignedImg1: createAligned(img1), 
        alignedImg2: createAligned(img2), 
        width, 
        height 
    };
}

describe('PDF vs Web Screenshot Visual Regression', () => {
    afterAll(async () => {
        await pdfService.close();
    });

    test.each(pages)('Visual Check for $id', async (pageData) => {
        const { id, url } = pageData;
        
        const pdfPath = path.join(OUTPUT_DIR, `${id}.pdf`);
        const screenshotPath = path.join(OUTPUT_DIR, `${id}-screen.png`);
        const diffPath = path.join(OUTPUT_DIR, `${id}-diff.png`);
        
        const options = {
            marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0,
            includeBanner: true, includeTitle: true, includeTags: true, includeDiscussion: false,
            screenshotPath: screenshotPath // 스크린샷 저장 지시
        };

        // 1. PDF 및 스크린샷 동시 생성
        const result = await pdfService.generatePdf(url, options);
        const fileStream = fs.createWriteStream(pdfPath);
        result.stream.pipe(fileStream);
        
        await new Promise((resolve, reject) => {
            fileStream.on('finish', resolve);
            fileStream.on('error', reject);
        });

        // 2. 생성된 PDF의 원본 크기 측정 (단위: Point, 72 DPI 기준)
        const pdfBytes = fs.readFileSync(pdfPath);
        const pdfDoc = await PDFDocument.load(pdfBytes);
        const { width: pdfPointWidth, height: pdfPointHeight } = pdfDoc.getPage(0).getSize();

        // 72 DPI를 96 DPI 픽셀 단위로 변환
        const targetDpi = 96;
        const pdfPixelWidth = Math.round((pdfPointWidth / 72) * targetDpi);
        const pdfPixelHeight = Math.round((pdfPointHeight / 72) * targetDpi);

        // 3. 두 이미지 픽셀 크기를 정확히 맞추기 위해 스크린샷 로드
        const screenPng = PNG.sync.read(fs.readFileSync(screenshotPath));

        // 4. PDF를 PNG로 변환 (계산된 PDF 픽셀 크기 명시)
        const convert = fromPath(pdfPath, {
            density: targetDpi,
            saveFilename: `${id}-pdf`,
            savePath: OUTPUT_DIR,
            format: "png",
            width: pdfPixelWidth,   // PDF 원본 크기 기반 너비 명시
            height: pdfPixelHeight  // PDF 원본 크기 기반 높이 명시
        });
        
        const pdfImageResult = await convert(1);
        const pdfImagePath = pdfImageResult.path;

        // 5. 두 이미지 픽셀 비교
        const pdfPng = PNG.sync.read(fs.readFileSync(pdfImagePath));

        const { alignedImg1, alignedImg2, width, height } = alignImageSizes(screenPng, pdfPng);
        const diffPng = new PNG({ width, height });

        const numDiffPixels = pixelmatch(
            alignedImg1.data, 
            alignedImg2.data, 
            diffPng.data, 
            width, 
            height,
            { threshold: 0.2, includeAA: true }
        );

        fs.writeFileSync(diffPath, PNG.sync.write(diffPng));

        // 6. 불일치 비율 계산 및 검증
        const totalPixels = width * height;
        const diffRatio = (numDiffPixels / totalPixels) * 100;

        console.log(`[${id}] Mismatch: ${diffRatio.toFixed(2)}% (${numDiffPixels} pixels)`);
        
        expect(diffRatio).toBeLessThan(5.0); 

    }, 120000);
});