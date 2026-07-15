# 📱 Deploy EuskalSoinua to Android

This guide walks you through turning EuskalSoinua into a **native Android app**
that you can install directly on your phone, while keeping the ability to push
updates that appear instantly (no reinstall needed).

---

## Architecture (how it works)

```
┌─────────────────────────────────────────────────────┐
│  Your Computer (code edits)                          │
│         │ git push                                   │
│         ▼                                            │
│  GitHub ──────────► Vercel (auto-deploys)            │
│                         │                            │
│                    Live web app                       │
│                    (https://yourapp.vercel.app)       │
│                         │                            │
│    ┌────────────────────┘                            │
│    ▼                                                 │
│  Android App (Capacitor)                             │
│  ─ Thin native shell (APK)                           │
│  ─ Loads the live Vercel URL                         │
│  ─ Native media controls, background playback        │
│  ─ Updates appear instantly (no reinstall!)          │
└─────────────────────────────────────────────────────┘
```

---

## Step 1: Set up a Database (5 min)

The app needs a PostgreSQL database. Use a free cloud database:

### Option A: Neon (recommended — fastest)
1. Go to [neon.tech](https://neon.tech) → Sign up (free)
2. Create a project → Copy the **connection string**
3. It looks like: `postgresql://user:pass@ep-xxx.neon.tech/dbname`

### Option B: Supabase
1. Go to [supabase.com](https://supabase.com) → New project (free)
2. Settings → Database → Connection string → Copy URI

---

## Step 2: Deploy to Vercel (5 min)

1. Push your code to a **GitHub repository**:
   ```bash
   git init
   git add .
   git commit -m "EuskalSoinua"
   git remote add origin https://github.com/YOUR_USERNAME/euskalsoinua.git
   git push -u origin main
   ```

2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import your repo

3. Add **Environment Variables**:
   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | *(your Neon/Supabase connection string from Step 1)* |
   | `PIPED_API_URLS` | *(optional — see below)* |

4. Click **Deploy** → Wait ~1 min → You get a URL like:
   `https://euskalsoinua-xxx.vercel.app`

5. **Initialize the database** — run this once after deploying:
   ```bash
   # Set DATABASE_URL in your terminal to match Vercel, then:
   npx drizzle-kit push
   ```

✅ Your web app is now live! You can already use it in a browser.

---

## Step 3: Update the Capacitor config (1 min)

Edit `capacitor.config.ts` — set your Vercel URL:

```typescript
server: {
  androidScheme: "https",
  url: "https://euskalsoinua-xxx.vercel.app",  // ← YOUR URL HERE
},
```

Uncomment the `url` line and paste your Vercel URL.

---

## Step 4: Build the Android APK (15 min — one time only)

You need a computer with [Android Studio](https://developer.android.com/studio) installed.

```bash
# 1. Install Capacitor Android platform
npx cap add android

# 2. Sync the configuration
npx cap sync

# 3. Open in Android Studio
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync to finish
2. Menu: **Build → Build Bundle(s)/APK(s) → Build APK(s)**
3. Click **"locate"** when done — find `app-release.apk`

> **No Android Studio?** Alternative: use the command line:
> ```bash
> cd android
> ./gradlew assembleDebug
> ```
> The APK will be at `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Step 5: Install on your phone

### Transfer the APK:
- **Option A**: Upload to Google Drive → Download on phone → Open → Install
- **Option B**: Connect phone via USB → Copy the `.apk` file → Open file manager → Tap to install
- **Option C**: Send via WhatsApp/Telegram to yourself → Download → Install

### Enable installation:
Android will ask you to **"Allow installing apps from this source"** — allow it.

### Done! 🎉
EuskalSoinua is now on your phone with:
- ✅ Home screen icon
- ✅ Full-screen native app (no browser bar)
- ✅ Background playback with media controls
- ✅ Lock-screen controls (play/pause/next/previous)
- ✅ Notification tray media controls

---

## Step 6: Making updates (ongoing)

This is the beauty of the architecture — **you never need to rebuild the APK**:

```bash
# Edit your code...
# Then just push:
git add .
git commit -m "Added new feature"
git push
```

Vercel auto-deploys in ~30 seconds. The next time you open the app on your
phone, it loads the updated version. **That's it.**

> **When to rebuild the APK:**
> Only if you change the Capacitor config (app name, icon, URL) or add native
> plugins. Regular code changes are live-instant.

---

## Optional: Custom App Icon

1. Replace `public/icon-512.png` with your custom icon (512×512px)
2. After `npx cap add android`:
   ```bash
   npm install -D @capacitor/assets
   npx capacitor-assets generate --android
   ```
3. Rebuild the APK

---

## Optional: Publish to Google Play

If you want it on the Play Store:
1. Build an **AAB** (App Bundle) instead of APK:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
2. Sign it with a keystore
3. Upload to [Google Play Console](https://play.google.com/console)
   (one-time $25 registration fee)

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "White screen" on phone | Check the `server.url` in `capacitor.config.ts` matches your Vercel URL |
| Radio won't play | Ensure `allowMixedContent: true` is in the config (it is by default) |
| Songs don't load full version | Set `PIPED_API_URLS` env var on Vercel with a working instance |
| Database errors | Verify `DATABASE_URL` is set in Vercel env vars + run `drizzle-kit push` |
| App icon missing | Run `npx capacitor-assets generate --android` |

---

## Quick reference — file locations

| File | Purpose |
|------|---------|
| `capacitor.config.ts` | Capacitor config (set your URL here) |
| `public/icon-512.png` | App icon |
| `public/manifest.json` | PWA manifest |
| `public/native-bridge.js` | Native back-button handling |
| `.env` | Local database URL (for development) |
