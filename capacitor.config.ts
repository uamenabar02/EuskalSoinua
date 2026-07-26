import type { CapacitorConfig } from "@capacitor/cli";

/**
 * EuskalSoinua — Capacitor Android wrapper configuration
 *
 * This turns the Next.js PWA into a native Android app (.apk / .aab).
 * The app loads the LIVE hosted URL, so every update you push to Vercel is
 * instantly reflected — NO need to rebuild or reinstall the APK.
 *
 * BUILD STEPS (on your machine with Android Studio installed):
 *   1. npm install
 *   2. npx cap add android
 *   3. npx cap sync
 *   4. npx cap open android        (opens Android Studio)
 *   5. Build → Build APK in Android Studio
 *   6. Transfer the .apk to your phone and install it
 *
 * UPDATE THE URL BELOW to your Vercel deployment URL before building!
 */
const config: CapacitorConfig = {
  appId: "com.euskalsoinua.app",
  appName: "EuskalSoinua",
  // ↓↓↓ CHANGE THIS to your deployed URL (e.g. https://euskalsoinua.vercel.app)
  webDir: "www",
  // The server block makes Capacitor load the LIVE web app instead of a bundled
  // static copy. This is what enables zero-reinstall updates.
  server: {
    androidScheme: "https",
    // Set your live deployed app URL below (or Vercel / Cloud Run URL):
    url: "https://ais-pre-r3eerdyzgjz3fsukpoikp4-542506682728.europe-west2.run.app",
    allowNavigation: [
      "ais-pre-r3eerdyzgjz3fsukpoikp4-542506682728.europe-west2.run.app",
      "*.europe-west2.run.app",
      "*.run.app",
      "*.vercel.app",
      "*"
    ],
  },
  android: {
    backgroundColor: "#0a0a0f",
    allowMixedContent: true, // radio streams use HTTP
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: "#0a0a0f",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0a0a0f",
    },
  },
};

export default config;
