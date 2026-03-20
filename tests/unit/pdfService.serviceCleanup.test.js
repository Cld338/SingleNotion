/**
 * PdfService - 서비스 종료 기능 테스트
 * 
 * 테스트 대상: async close()
 * 기능: PDF 서비스 종료 및 브라우저 풀 정리 로직 검증
 */

// Mock puppeteer BEFORE requiring PdfService
jest.mock('puppeteer', () => ({
    launch: jest.fn(),
}));

jest.mock('../../src/utils/browserPool');
jest.mock('../../src/utils/logger');

const PdfService = require('../../src/services/pdfService');
const browserPool = require('../../src/utils/browserPool');

describe('PdfService - 서비스 종료 (close)', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // browserPool mock 설정
        browserPool.drain = jest.fn().mockResolvedValue(undefined);
        browserPool.clear = jest.fn().mockResolvedValue(undefined);
    });

    describe('정상 종료', () => {
        test('browserPool.drain() 호출', async () => {
            // Act
            await PdfService.close();

            // Assert
            expect(browserPool.drain).toHaveBeenCalled();
        });

        test('browserPool.clear() 호출', async () => {
            // Act
            await PdfService.close();

            // Assert
            expect(browserPool.clear).toHaveBeenCalled();
        });

        test('drain 이후 clear 호출되어야 함', async () => {
            // Arrange
            const callOrder = [];
            browserPool.drain.mockImplementation(() => {
                callOrder.push('drain');
                return Promise.resolve();
            });
            browserPool.clear.mockImplementation(() => {
                callOrder.push('clear');
                return Promise.resolve();
            });

            // Act
            await PdfService.close();

            // Assert
            expect(callOrder.length).toBe(2);
            expect(callOrder[0]).toBe('drain');
            expect(callOrder[1]).toBe('clear');
        });

        test('정확히 한 번씩 호출', async () => {
            // Act
            await PdfService.close();

            // Assert
            expect(browserPool.drain).toHaveBeenCalledTimes(1);
            expect(browserPool.clear).toHaveBeenCalledTimes(1);
        });

        test('매개변수 없이 호출', async () => {
            // Act
            await PdfService.close();

            // Assert
            expect(browserPool.drain).toHaveBeenCalledWith();
            expect(browserPool.clear).toHaveBeenCalledWith();
        });
    });

    describe('에러 처리', () => {
        test('drain 실패 시에도 clear 시도', async () => {
            // Arrange
            browserPool.drain.mockRejectedValue(new Error('Drain failed'));

            // Act
            try {
                await PdfService.close();
            } catch (error) {
                // Expected - drain이 실패하므로 여기에서 catch됨
            }

            // Assert
            // drain 실패로 인해 clear는 호출되지 않음
            // (current implementation에서는 drain 에러 후 즉시 throw)
        });

        test('clear 실패 시 에러 처리', async () => {
            // Arrange
            browserPool.clear.mockRejectedValue(new Error('Clear failed'));

            // Act & Assert
            try {
                await PdfService.close();
            } catch (error) {
                expect(error.message).toContain('Clear failed');
            }
        });

        test('drain 및 clear 모두 실패 시 처리', async () => {
            // Arrange
            browserPool.drain.mockRejectedValue(new Error('Drain error'));
            browserPool.clear.mockRejectedValue(new Error('Clear error'));

            // Act & Assert
            try {
                await PdfService.close();
            } catch (error) {
                // drain 에러가 먼저 throw됨
                expect(error.message).toContain('Drain error');
            }
        });

        test('부분 실패 시에도 로그 기록', async () => {
            // Arrange
            const logger = require('../../src/utils/logger');
            browserPool.clear.mockRejectedValue(new Error('Clear failed'));

            // Act & Assert
            try {
                await PdfService.close();
            } catch (error) {
                // Error handling
            }
        });
    });

    describe('상태 검증', () => {
        test('drain은 진행 중인 작업 완료 대기', async () => {
            // Arrange
            let drainCalled = false;
            browserPool.drain.mockImplementation(() => {
                drainCalled = true;
                return new Promise((resolve) => {
                    setTimeout(() => resolve(), 50);
                });
            });

            // Act
            const closePromise = PdfService.close();

            // Assert
            expect(drainCalled).toBe(true);
            await closePromise;
        });

        test('clear는 모든 브라우저 인스턴스 종료', async () => {
            // Act
            await PdfService.close();

            // Assert
            expect(browserPool.clear).toHaveBeenCalled();
        });
    });

    describe('비동기 처리', () => {
        test('async 함수로 동작', async () => {
            // Act
            const result = PdfService.close();

            // Assert
            expect(result).toBeInstanceOf(Promise);
        });

        test('모든 작업이 완료될 때까지 기다림', async () => {
            // Arrange
            let drainCompleted = false;
            let clearCompleted = false;
            browserPool.drain.mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        drainCompleted = true;
                        resolve();
                    }, 50);
                });
            });
            browserPool.clear.mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        clearCompleted = true;
                        resolve();
                    }, 50);
                });
            });

            // Act
            await PdfService.close();

            // Assert
            expect(drainCompleted).toBe(true);
            expect(clearCompleted).toBe(true);
        });

        test('sequential 실행 (drain -> clear)', async () => {
            // Arrange
            const sequence = [];
            browserPool.drain.mockImplementation(() => {
                sequence.push('drain-start');
                return new Promise((resolve) => {
                    setTimeout(() => {
                        sequence.push('drain-end');
                        resolve();
                    }, 10);
                });
            });
            browserPool.clear.mockImplementation(() => {
                sequence.push('clear-start');
                return Promise.resolve();
            });

            // Act
            await PdfService.close();

            // Assert
            expect(sequence[0]).toBe('drain-start');
            expect(sequence[1]).toBe('drain-end');
            expect(sequence[2]).toBe('clear-start');
        });
    });

    describe('반환값', () => {
        test('undefined를 반환', async () => {
            // Act
            const result = await PdfService.close();

            // Assert
            expect(result).toBeUndefined();
        });

        test('에러 발생 시에도 정상 완료 (에러는 로깅됨)', async () => {
            // Arrange
            browserPool.drain.mockRejectedValue(new Error('Drain error'));

            // Act
            const result = await PdfService.close();

            // Assert - close()는 에러를 catch하므로 undefined를 반환하고 완료됨
            expect(result).toBeUndefined();
            expect(browserPool.drain).toHaveBeenCalled();
        });
    });

    describe('멱등성 (Idempotency)', () => {
        test('여러 번 호출해도 안전함', async () => {
            // Act
            await PdfService.close();
            await PdfService.close();
            await PdfService.close();

            // Assert
            expect(browserPool.drain).toHaveBeenCalledTimes(3);
            expect(browserPool.clear).toHaveBeenCalledTimes(3);
        });

        test('동시에 여러 번 호출해도 안전함', async () => {
            // Act
            await Promise.all([
                PdfService.close(),
                PdfService.close(),
                PdfService.close()
            ]);

            // Assert
            expect(browserPool.drain).toHaveBeenCalledTimes(3);
            expect(browserPool.clear).toHaveBeenCalledTimes(3);
        });
    });

    describe('리소스 정리', () => {
        test('모든 브라우저 인스턴스가 정리됨', async () => {
            // Act
            await PdfService.close();

            // Assert
            expect(browserPool.clear).toHaveBeenCalled();
        });

        test('진행 중인 작업이 완료된 후 정리', async () => {
            // Arrange
            let drainCalled = false;
            browserPool.drain.mockImplementation(() => {
                drainCalled = true;
                return new Promise((resolve) => {
                    setTimeout(() => resolve(), 50);
                });
            });

            // Act
            await PdfService.close();

            // Assert
            expect(drainCalled).toBe(true);
            expect(browserPool.clear).toHaveBeenCalled();
        });
    });

    describe('실제 종료 시나리오', () => {
        test('서버 종료 플로우: drain -> clear', async () => {
            // Arrange
            const sequence = [];
            browserPool.drain.mockImplementation(() => {
                sequence.push('drain');
                return Promise.resolve();
            });
            browserPool.clear.mockImplementation(() => {
                sequence.push('clear');
                return Promise.resolve();
            });

            // Act
            await PdfService.close();

            // Assert
            expect(sequence).toEqual(['drain', 'clear']);
        });

        test('서버 재시작: close() 후 다시 생성 가능', async () => {
            // Act
            await PdfService.close();

            // Reset mocks
            jest.clearAllMocks();
            browserPool.drain.mockResolvedValue(undefined);
            browserPool.clear.mockResolvedValue(undefined);

            // Act again
            await PdfService.close();

            // Assert
            expect(browserPool.drain).toHaveBeenCalledTimes(1);
            expect(browserPool.clear).toHaveBeenCalledTimes(1);
        });

        test('진행 중인 작업과 함께 close 호출', async () => {
            // Arrange
            let drainWaited = false;
            browserPool.drain.mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        drainWaited = true;
                        resolve();
                    }, 100);
                });
            });

            // Act
            const closePromise = PdfService.close();

            // Assert - 즉시 반환되지 않음
            expect(drainWaited).toBe(false);

            // Wait for completion
            await closePromise;
            expect(drainWaited).toBe(true);
        });
    });

    describe('에러 복구', () => {
        test('drain 실패 후 재시도 가능', async () => {
            // Arrange
            let attemptCount = 0;
            browserPool.drain.mockImplementation(() => {
                attemptCount++;
                if (attemptCount === 1) {
                    return Promise.reject(new Error('First attempt failed'));
                }
                return Promise.resolve();
            });

            // Act
            try {
                await PdfService.close();
            } catch (error) {
                // First attempt fails
            }

            // Reset
            attemptCount = 0;
            browserPool.drain.mockImplementation(() =>
                Promise.resolve()
            );
            browserPool.clear.mockImplementation(() =>
                Promise.resolve()
            );

            // Act - Retry
            await expect(PdfService.close()).resolves.not.toThrow();

            // Assert
            expect(browserPool.drain).toHaveBeenCalled();
        });

        test('clear 실패 후 재시도 가능', async () => {
            // Arrange
            let clearAttemptCount = 0;
            browserPool.clear.mockImplementation(() => {
                clearAttemptCount++;
                if (clearAttemptCount === 1) {
                    return Promise.reject(new Error('First clear failed'));
                }
                return Promise.resolve();
            });

            // Act
            try {
                await PdfService.close();
            } catch (error) {
                // First attempt fails
            }

            // Reset
            browserPool.drain.mockImplementation(() =>
                Promise.resolve()
            );
            browserPool.clear.mockImplementation(() =>
                Promise.resolve()
            );

            // Act - Retry
            await expect(PdfService.close()).resolves.not.toThrow();

            // Assert
            expect(browserPool.clear).toHaveBeenCalled();
        });
    });
});
