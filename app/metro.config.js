const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Browser preview only: swap React Native Firebase (native) for the Firebase web SDK.
// Android/iOS builds are unaffected because this applies only when platform === 'web'.
const webAliases = {
  '@react-native-firebase/app': path.resolve(__dirname, 'src/web/firebase-app.ts'),
  '@react-native-firebase/auth': path.resolve(__dirname, 'src/web/firebase-auth.ts'),
  '@react-native-firebase/storage': path.resolve(__dirname, 'src/web/firebase-storage.ts'),
  '@react-native-firebase/analytics': path.resolve(__dirname, 'src/web/noop-analytics.ts'),
  '@react-native-firebase/crashlytics': path.resolve(__dirname, 'src/web/noop-crashlytics.ts'),
};
const webPackageAliases = {
  '@react-native-firebase/firestore': 'firebase/firestore',
  '@react-native-firebase/functions': 'firebase/functions',
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web') {
    if (webAliases[moduleName]) return { type: 'sourceFile', filePath: webAliases[moduleName] };
    if (webPackageAliases[moduleName])
      return context.resolveRequest(context, webPackageAliases[moduleName], platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
