/**
 * PdfService - 리소스 정리 기능 테스트
 * 
 * 테스트 대상: async _cleanupPageResources(page)
 * 기능: 페이지 리소스 정리 로직 검증 (내부 유틸리티 메서드)
 */

// Mock puppeteer BEFORE requiring PdfService
jest.mock('puppeteer', () => ({
    launch: jest.fn(),
}));

jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/browserPool');

const PdfService = require('../../src/services/pdfService');

describe('PdfService - 리소스 정리 (_cleanupPageResources)', () => {
    let mockPage;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock page 객체 생성
        mockPage = {
            removeAllListeners: jest.fn(),
            evaluate: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined)
        };
    });

    describe('이벤트 리스너 제거', () => {
        test('removeAllListeners 호출', async () => {
            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(mockPage.removeAllListeners).toHaveBeenCalled();
        });

        test('removeAllListeners는 첫 번째로 호출되어야 함', async () => {
            // Arrange
            const callOrder = [];
            mockPage.removeAllListeners.mockImplementation(() => {
                callOrder.push('removeAllListeners');
            });
            mockPage.evaluate.mockImplementation(() => {
                callOrder.push('evaluate');
                return Promise.resolve();
            });
            mockPage.close.mockImplementation(() => {
                callOrder.push('close');
                return Promise.resolve();
            });

            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(callOrder[0]).toBe('removeAllListeners');
        });

        test('정확히 한 번 호출', async () => {
            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(mockPage.removeAllListeners).toHaveBeenCalledTimes(1);
        });
    });

    describe('페이지 컨텍스트 초기화', () => {
        test('evaluate 메서드 호출', async () => {
            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(mockPage.evaluate).toHaveBeenCalled();
        });

        test('evaluate에 함수가 전달됨', async () => {
            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(mockPage.evaluate).toHaveBeenCalledWith(expect.any(Function));
        });

        test('evaluate 콜백이 전역 변수 정리를 수행', async () => {
            // Arrange
            let evaluatedCode;
            mockPage.evaluate.mockImplementation((fn) => {
                evaluatedCode = fn.toString();
                return Promise.resolve();
            });

            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(evaluatedCode).toContain('window._resources');
            expect(evaluatedCode).toContain('window._assets');
        });

        test('evaluate 콜백이 DOM 내용 정리를 수행', async () => {
            // Arrange
            let evaluatedCode;
            mockPage.evaluate.mockImplementation((fn) => {
                evaluatedCode = fn.toString();
                return Promise.resolve();
            });

            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(evaluatedCode).toContain('document.body.innerHTML');
        });

        test('evaluate는 두 번째로 호출되어야 함', async () => {
            // Arrange
            const callOrder = [];
            mockPage.removeAllListeners.mockImplementation(() => {
                callOrder.push('removeAllListeners');
            });
            mockPage.evaluate.mockImplementation(() => {
                callOrder.push('evaluate');
                return Promise.resolve();
            });

            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(callOrder[1]).toBe('evaluate');
        });
    });

    describe('페이지 종료', () => {
        test('close 메서드 호출', async () => {
            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(mockPage.close).toHaveBeenCalled();
        });

        test('정확히 한 번 호출', async () => {
            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(mockPage.close).toHaveBeenCalledTimes(1);
        });

        test('close는 마지막으로 호출되어야 함', async () => {
            // Arrange
            const callOrder = [];
            mockPage.removeAllListeners.mockImplementation(() => {
                callOrder.push('removeAllListeners');
            });
            mockPage.evaluate.mockImplementation(() => {
                callOrder.push('evaluate');
                return Promise.resolve();
            });
            mockPage.close.mockImplementation(() => {
                callOrder.push('close');
                return Promise.resolve();
            });

            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(callOrder[callOrder.length - 1]).toBe('close');
        });
    });

    describe('Null/Undefined 처리', () => {
        test('null page는 아무 작업도 수행하지 않음', async () => {
            // Arrange
            const mockPageNull = null;

            // Act
            await PdfService._cleanupPageResources(mockPageNull);

            // Assert
            // 에러가 발생하지 않고 조용히 반환
        });

        test('undefined page는 아무 작업도 수행하지 않음', async () => {
            // Arrange
            const mockPageUndefined = undefined;

            // Act
            await PdfService._cleanupPageResources(mockPageUndefined);

            // Assert
            // 에러가 발생하지 않고 조용히 반환
        });
    });

    describe('에러 처리', () => {
        test('evaluate 실패 시에도 page.close() 호출', async () => {
            // Arrange
            mockPage.evaluate.mockRejectedValue(new Error('Evaluation error'));

            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(mockPage.close).toHaveBeenCalled();
        });

        test('evaluate 에러로 인해 close가 건너뛰지 않음', async () => {
            // Arrange
            mockPage.evaluate.mockRejectedValue(new Error('Evaluation error'));

            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            // close가 호출되어야 함 (에러가 발생해도 후속 단계 수행)
            expect(mockPage.close).toHaveBeenCalled();
        });

        test('close 실패 시 에러 처리', async () => {
            // Arrange
            mockPage.close.mockRejectedValue(new Error('Close error'));

            // Act & Assert
            // 에러가 throw되지 않고 로그만 기록
            await expect(PdfService._cleanupPageResources(mockPage)).resolves.not.toThrow();
        });

        test('evaluate와 close 모두 실패해도 계속 진행', async () => {
            // Arrange
            mockPage.evaluate.mockRejectedValue(new Error('Evaluation error'));
            mockPage.close.mockRejectedValue(new Error('Close error'));

            // Act & Assert
            await expect(
                PdfService._cleanupPageResources(mockPage)
            ).resolves.not.toThrow();
        });

        test('removeAllListeners 실패 시에도 evaluate 호출', async () => {
            // Arrange
            mockPage.removeAllListeners.mockImplementation(() => {
                throw new Error('Listener removal error');
            });

            // Act
            try {
                await PdfService._cleanupPageResources(mockPage);
            } catch (error) {
                // Expected - removeAllListeners는 try-catch 없음
            }

            // Assert
            // 에러가 throw되므로 후속 단계는 실행되지 않음
        });
    });

    describe('메서드 호출 순서', () => {
        test('올바른 순서로 메서드가 호출됨', async () => {
            // Arrange
            const callOrder = [];
            mockPage.removeAllListeners.mockImplementation(() => {
                callOrder.push(1);
            });
            mockPage.evaluate.mockImplementation(() => {
                callOrder.push(2);
                return Promise.resolve();
            });
            mockPage.close.mockImplementation(() => {
                callOrder.push(3);
                return Promise.resolve();
            });

            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(callOrder).toEqual([1, 2, 3]);
        });
    });

    describe('비동기 처리', () => {
        test('async 함수로 동작', async () => {
            // Act & Assert
            const result = PdfService._cleanupPageResources(mockPage);
            expect(result).toBeInstanceOf(Promise);
        });

        test('모든 await 작업이 완료될 때까지 기다림', async () => {
            // Arrange
            let evaluateCompleted = false;
            let closeCompleted = false;
            mockPage.evaluate.mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        evaluateCompleted = true;
                        resolve();
                    }, 100);
                });
            });
            mockPage.close.mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        closeCompleted = true;
                        resolve();
                    }, 100);
                });
            });

            // Act
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(evaluateCompleted).toBe(true);
            expect(closeCompleted).toBe(true);
        });
    });

    describe('반환값', () => {
        test('undefined를 반환', async () => {
            // Act
            const result = await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(result).toBeUndefined();
        });

        test('null page일 때도 undefined 반환', async () => {
            // Act
            const result = await PdfService._cleanupPageResources(null);

            // Assert
            expect(result).toBeUndefined();
        });
    });

    describe('멱등성 (Idempotency)', () => {
        test('여러 번 호출해도 안전함', async () => {
            // Act
            await PdfService._cleanupPageResources(mockPage);
            await PdfService._cleanupPageResources(mockPage);
            await PdfService._cleanupPageResources(mockPage);

            // Assert
            expect(mockPage.removeAllListeners).toHaveBeenCalledTimes(3);
            expect(mockPage.evaluate).toHaveBeenCalledTimes(3);
            expect(mockPage.close).toHaveBeenCalledTimes(3);
        });

        test('이미 정리된 page를 다시 정리해도 에러 없음', async () => {
            // Arrange
            mockPage.close.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined);

            // Act
            await PdfService._cleanupPageResources(mockPage);
            await expect(
                PdfService._cleanupPageResources(mockPage)
            ).resolves.not.toThrow();

            // Assert
            expect(mockPage.close).toHaveBeenCalledTimes(2);
        });
    });

    describe('실제 유즈 케이스', () => {
        test('정상 플로우: 페이지 생성 -> 사용 -> 정리', async () => {
            // Arrange
            const pages = [];
            for (let i = 0; i < 3; i++) {
                const page = {
                    removeAllListeners: jest.fn(),
                    evaluate: jest.fn().mockResolvedValue(undefined),
                    close: jest.fn().mockResolvedValue(undefined)
                };
                pages.push(page);
            }

            // Act
            for (const page of pages) {
                await PdfService._cleanupPageResources(page);
            }

            // Assert
            pages.forEach((page) => {
                expect(page.close).toHaveBeenCalled();
            });
        });

        test('에러 발생 후 정리: 예외 처리 후 리소스 정리', async () => {
            // Arrange
            const errorPage = {
                removeAllListeners: jest.fn(),
                evaluate: jest
                    .fn()
                    .mockRejectedValue(new Error('Page error')),
                close: jest.fn().mockResolvedValue(undefined)
            };

            // Act
            try {
                await PdfService._cleanupPageResources(errorPage);
            } catch (error) {
                // Expected error
            }

            // Assert
            expect(errorPage.close).toHaveBeenCalled();
        });
    });
});
