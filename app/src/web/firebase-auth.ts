// Browser-preview shim for '@react-native-firebase/auth'. Phone sign-in needs a verifier on the web;
// against the Auth emulator the check is disabled, so no real reCAPTCHA or SMS is involved.
import {
  RecaptchaVerifier,
  connectAuthEmulator as webConnectAuthEmulator,
  signInWithPhoneNumber as webSignInWithPhoneNumber,
  type Auth,
} from 'firebase/auth';

export * from 'firebase/auth';

export function connectAuthEmulator(auth: Auth, url: string) {
  webConnectAuthEmulator(auth, url, { disableWarnings: true });
  auth.settings.appVerificationDisabledForTesting = true;
}

export function signInWithPhoneNumber(auth: Auth, phoneNumber: string) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return webSignInWithPhoneNumber(
    auth,
    phoneNumber,
    new RecaptchaVerifier(auth, el, { size: 'invisible' }),
  );
}
