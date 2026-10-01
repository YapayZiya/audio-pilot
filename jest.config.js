/** Jest configuration for Expo SDK 57 (uses the jest-expo preset). */
module.exports = {
  preset: 'jest-expo',
  collectCoverageFrom: ['src/**/*.{ts,tsx}'],
  // Never let Jest pick up build output or downloaded artifacts.
  modulePathIgnorePatterns: ['<rootDir>/android/', '<rootDir>/ios/'],
};