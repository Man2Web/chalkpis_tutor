// Native keyboard handling has no JS implementation under Jest; use the library's own mock.
jest.mock('react-native-keyboard-controller', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-keyboard-controller/jest'),
);

// PanelUI's gestures and Reanimated animations run through their official Jest setups.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('react-native-gesture-handler/jestSetup');
jest.mock('react-native-worklets', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('react-native-worklets/lib/module/mock'),
);
jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mock = require('react-native-reanimated/mock');
  return {
    ...mock,
    // Shared values with Reanimated 4's modify(), which the mock's lack.
    useSharedValue: (initial: unknown) => {
      const sv = mock.useSharedValue(initial);
      return new Proxy(sv, {
        get: (target, key) =>
          key === 'modify'
            ? (fn: (v: unknown) => unknown) => {
                target.value = fn(target.value);
              }
            : target[key],
      });
    },
    // Hooks PanelUI uses that Reanimated's mock leaves out.
    useReducedMotion: () => true,
    useComposedEventHandler: (handlers: (((e: unknown) => void) | null)[]) => (e: unknown) =>
      handlers.forEach((h) => h?.(e)),
    useFrameCallback: () => ({ setActive: () => {}, isActive: false, callbackId: 0 }),
    // Reanimated 4 refs are callable (PanelUI's sheets call them); the mock's are plain objects.
    useAnimatedRef: () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const holder = require('react').useRef(null);
      if (!holder.current) {
        const ref = Object.assign(
          (node: unknown) => ((ref as { current: unknown }).current = node),
          {
            current: null as unknown,
          },
        );
        holder.current = ref;
      }
      return holder.current;
    },
  };
});

// Jest has no compiled Tailwind stylesheet, so Uniwind cannot resolve theme variables there; that is expected.
const warn = console.warn;
console.warn = (...args: unknown[]) => {
  if (typeof args[0] === 'string' && args[0].startsWith("Uniwind - We couldn't find your variable"))
    return;
  warn(...args);
};

// Safe-area insets (PanelUI overlays read them) come from the library's own mock: zero insets, a 390×844 frame.
jest.mock(
  'react-native-safe-area-context',
  () =>
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('react-native-safe-area-context/jest/mock').default,
);

// Every screen runs inside PanelUIProvider in the app (overlay portals, toasts), so tests render inside it too.
jest.mock('@testing-library/react-native', () => {
  const actual = jest.requireActual('@testing-library/react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const React = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PanelUIProvider } = require('panelui-native/provider');
  const wrapper = ({ children }: { children: unknown }) =>
    React.createElement(PanelUIProvider, null, children);
  const render = (ui: unknown, options: Record<string, unknown> = {}) =>
    actual.render(ui, { wrapper, ...options });
  // Getters, not a copy: `screen` is replaced on every render, so it has to be read live.
  return new Proxy(actual, { get: (target, key) => (key === 'render' ? render : target[key]) });
});

// The RevenueCat store SDK has no native side under Jest; tests that buy mock src/lib/purchases instead.
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    isConfigured: jest.fn(async () => false),
    configure: jest.fn(),
    logIn: jest.fn(async () => ({})),
    logOut: jest.fn(async () => ({})),
    getOfferings: jest.fn(async () => ({ current: null })),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(async () => ({})),
    showManageSubscriptions: jest.fn(async () => undefined),
    getCustomerInfo: jest.fn(async () => ({ managementURL: null })),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(async () => ({})),
  },
  INTRO_ELIGIBILITY_STATUS: { INTRO_ELIGIBILITY_STATUS_ELIGIBLE: 2 },
  PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1', PAYMENT_PENDING_ERROR: '20' },
  STORE_REPLACEMENT_MODE: { WITH_TIME_PRORATION: 'WITH_TIME_PRORATION', DEFERRED: 'DEFERRED' },
}));
