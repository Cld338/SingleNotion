/**
 * Jest Setup File
 * 
 * This file runs before each test suite.
 * Use it to configure global test settings, mock implementations, or custom matchers.
 */

// Set a longer timeout for all tests (especially for async operations)
jest.setTimeout(30000);

// Suppress console output during tests unless explicitly tested
const originalError = console.error;
const originalWarn = console.warn;

beforeAll(() => {
    // Optionally suppress console errors/warnings during tests
    // Uncomment to use:
    // console.error = jest.fn();
    // console.warn = jest.fn();
});

afterAll(() => {
    // Restore console functions
    console.error = originalError;
    console.warn = originalWarn;
});

// Global test utilities (add as needed)
global.testUtils = {
    /**
     * Wait for a specific amount of time
     * @param {number} ms Milliseconds to wait
     * @returns {Promise<void>}
     */
    wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
