module.exports = {
  preset: 'jest-expo',
  // First run after many file changes compiles everything and can pass 5 s on a busy 8 GB Mac.
  testTimeout: 20000,
  setupFiles: ['<rootDir>/jest.setup.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/.expo/'],
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|react-native-svg))',
  ],
};
