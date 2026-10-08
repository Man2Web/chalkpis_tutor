# Setup guide (do these once)

## 0. On your Mac
1. **Java (needed for the Firebase emulators):** `brew install openjdk@17`, then `sudo ln -sfn /opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk /Library/Java/JavaVirtualMachines/openjdk-17.jdk`. Check with `java -version`.
2. **Android Studio** (https://developer.android.com/studio) for the emulator, or plug in an Android phone with USB debugging on.
3. Node is already installed (v24). Functions deploy on Node 20 automatically.
4. In this folder run `npm install` then `npm run install:all`.

## 1. Create the Firebase project
1. https://console.firebase.google.com -> **Add project** -> name it (e.g. `tutordesk-prod`). Analytics: on.
2. **Build -> Firestore Database** -> Create -> **Production mode** -> location **asia-south1 (Mumbai)**. (Cannot be changed later.)
3. **Build -> Storage** -> Get started -> same location.
4. **Build -> Authentication** -> Get started -> **Sign-in method** -> enable **Phone**. Add test phone numbers if you want to skip real SMS while developing.
5. Upgrade to the **Blaze** plan (required for Cloud Functions; free quota is generous).
6. **Project settings -> General -> Add app -> Android**:
   - Package name: `in.tutordesk.app` (change in `app/app.json` if you want another; must match).
   - SHA-1: get it with `cd app && npx expo prebuild --platform android` then `cd android && ./gradlew signingReport` (debug key), or from EAS: `eas credentials`. Add both debug and release SHA-1.
   - Download **google-services.json** and put it at `app/google-services.json` (git-ignored).
7. **App Check**: Build -> App Check -> register the Android app with **Play Integrity**. Turn on enforcement for Firestore, Storage and Auth only after testing a release build.
8. Crashlytics and Analytics: enable Crashlytics in the console (Release & Monitor -> Crashlytics).
9. Link the project: `npx firebase login` then `npx firebase use --add` (inside `firebase/` use the project id).

## 1b. Quickest way to try the app on a laptop (browser preview, no Android Studio)
Needs only Node and Java (see step 0). Uses a fake local Firebase project (`demo-tutordesk`); no account needed.
```
npm run emulators      # terminal 1: Auth, Firestore, Functions, Storage (UI at http://localhost:4000)
npm run web            # terminal 2: opens the app at http://localhost:8081
```
Sign in with any 10-digit number. No SMS is sent: the OTP screen shows a yellow "Test mode" box with the code and a "Use this code" button. (Or get it with
`curl -s http://127.0.0.1:9099/emulator/v1/projects/demo-tutordesk/verificationCodes`.) Only the newest code for a number works.
Data is wiped each time you stop the emulators.
Limits of the browser preview: it is not the real Android app. Calling, WhatsApp, contacts import and native share do not work; layout is shown at phone width. Android and production builds are unaffected (Firebase web SDK is used only for the browser).

## 2. Run locally with emulators
```
npm run emulators        # starts Auth, Firestore, Functions, Storage + UI at http://localhost:4000
cd app && cp .env.example .env   # set EXPO_PUBLIC_FIREBASE_EMULATOR=true
npm run android          # builds the dev client and runs it
```
The Android emulator reaches your Mac at `10.0.2.2` (default in `.env.example`). On a real phone use your Mac's LAN IP.

## 3. Deploy backend
```
npm --prefix functions run build
npx firebase deploy --config firebase/firebase.json --only firestore,storage,functions
```

## 4. Release build with EAS
1. `npm i -g eas-cli` then `eas login` (free account at https://expo.dev).
2. `cd app && eas init` (writes the real project id into `app.json`).
3. Upload `google-services.json` as a file secret: `eas secret:create --scope project --type file --name GOOGLE_SERVICES_JSON --value ./google-services.json` and set `"googleServicesFile": "./google-services.json"` stays as is for local; for EAS point it at the env var if needed.
4. `eas build --platform android --profile production` — EAS creates and stores a signing keystore for you (back it up: `eas credentials`).
5. Upload the `.aab` to Play Console. Required: privacy policy URL (set `EXPO_PUBLIC_PRIVACY_POLICY_URL`) and the in-app delete-account flow (Settings).

## Secrets
Nothing secret is committed. Razorpay and WhatsApp keys (Phase 2) go in Firebase Functions secrets: `npx firebase functions:secrets:set RAZORPAY_KEY_SECRET`.
