// Browser-preview shim for '@react-native-firebase/app' (see metro.config.js). Dev/testing only.
import { getApp as webGetApp, getApps, initializeApp } from 'firebase/app';

export function getApp() {
  if (!getApps().length) {
    initializeApp({
      apiKey: 'demo-local-api-key',
      authDomain: 'localhost',
      projectId: 'demo-tutordesk',
      storageBucket: 'demo-tutordesk.appspot.com',
      appId: '1:000000000000:web:0000000000000000',
    });
  }
  return webGetApp();
}
