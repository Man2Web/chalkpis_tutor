// Native keyboard handling has no JS implementation under Jest; use the library's own mock.
jest.mock('react-native-keyboard-controller', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-keyboard-controller/jest'),
);
