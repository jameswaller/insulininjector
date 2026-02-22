# Insulin Tracker PWA

A minimal, free progressive web app to track which side to inject insulin each night.

## How it works

- Uses **day of year** (not day of month) to determine the injection side, so it works correctly across leap years and months with different lengths
- Timezone-aware: calculated in **America/Chicago (CST/CDT)** automatically
- Odd day of year → **Left**, Even day of year → **Right**
- Persists today's "done" state in `localStorage`
- Optional 9 PM CST push notification reminder (requires adding to Home Screen on iOS 16.4+)

## Deploy to GitHub Pages (free)

1. Create a new **public** GitHub repository
2. Upload all files in this folder to the repo root:
   - `index.html`
   - `sw.js`
   - `manifest.json`
   - `icon-192.png`
   - `icon-512.png`
3. Go to repo **Settings → Pages**
4. Set source to **main branch, / (root)**
5. Your app will be live at `https://yourusername.github.io/repo-name`

## Add to iPhone Home Screen

1. Open the URL in **Safari** (must be Safari, not Chrome)
2. Tap the **Share** button (box with arrow)
3. Scroll down and tap **"Add to Home Screen"**
4. Name it "Insulin" and tap Add

The app will now behave like a native app with no browser chrome.

## Enable Notifications

- After adding to Home Screen, open the app and tap **"Enable notifications"**
- iOS will prompt for permission
- You'll receive a reminder at 9 PM CST each night
- Requires iOS 16.4 or later

## Notes on notification scheduling

The service worker schedules notifications using `setTimeout` inside the SW context. iOS can occasionally kill background SWs, but will reschedule when you next open the app. For maximum reliability, open the app briefly each day (which you'd do anyway to log your dose).
