/**
 * Jest 설정 파일
 * 
 * PdfService 테스트를 위한 Jest 설정
 */

module.exports = {
    // 테스트 환경
    testEnvironment: 'node',

    // 테스트 파일 패턴
    testMatch: [
        '<rootDir>/tests/unit/**/*.test.js',
        '<rootDir>/tests/unit/**/*.spec.js'
    ],

    // 커버리지 수집 대상
    collectCoverageFrom: [
        'src/**/*.js',
        '!src/app.js',
        '!src/worker.js',
        '!src/config/**',
        '!src/routes/**'
    ],

    // 커버리지 임계값
    coverageThreshold: {
        'src/services/pdfService.js': {
            branches: 75,
            functions: 90,
            lines: 85,
            statements: 85
        }
    },

    // 타임아웃 (긴 비동기 작업 때문에 증가)
    testTimeout: 30000,

    // 테스트 경로 설정
    rootDir: '.',

    // 모듈 경로 매핑
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
        '^@tests/(.*)$': '<rootDir>/tests/$1'
    },

    // 테스트 전후 처리
    setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

    // 자동 Mock 추가 경로
    automock: false,

    // 상세 테스트 결과 출력
    verbose: true,

    // 에러 메시지 정보 팩토리
    errorOnDeprecated: false
};
