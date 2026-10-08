module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/src/**/*.test.ts'],
  // Emulator-backed tests do real network I/O; several files run in parallel, so 5 s is too tight.
  testTimeout: 30000,
};
