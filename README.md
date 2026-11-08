# Seb's Symptoms

A private, offline diary for tracking eczema, sinus symptoms and their possible triggers: food, activities, medications and creams, and the products that touch your skin. Built for an iPhone, and installed from Safari to the Home Screen.

- **Check-ins with a body map.** Tap the face, neck, arms, inner elbows, or hands and wrists and score each one from 1 to 10. Itch, dry skin, swelling and sinus get their own scores. A new check-in starts from the previous one, so you only change what's different.
- **Food, activity, meds and creams.** Things you've logged before show up as one-tap suggestions.
- **Products.** Add detergents, soaps and creams once, with a photo of the ingredients label. They count for every day until you mark them stopped.
- **Photos of symptoms.** Shrunk to save space, with location data removed. They stay inside the app and don't go to your camera roll or iCloud Photos.
- **Trends.** A heatmap of every area and symptom over 14, 30 or 90 days.
- **Encrypted backups.** Two taps a day sends an AES-256 encrypted file to Google Drive.

## Privacy model

| | |
|---|---|
| Where data lives | Only in the app's storage on your iPhone (IndexedDB). No account, server, analytics or tracking. |
| Network | A Content-Security-Policy stops the app from contacting any server other than its own host. The only thing ever downloaded is the app's own code. |
| Backups | Encrypted on the phone before sharing: AES-256-GCM with a key derived from your passphrase (PBKDF2-SHA256, 600k iterations). Google stores only scrambled bytes. |
| Code hosting | GitHub Pages serves the code. Your data is never uploaded there. `.gitignore` blocks backup files from being committed. |
| On the phone | Protected by the iPhone's own encryption, so keep a passcode or Face ID on. |

## One-time setup

### 1. Publish the app (GitHub Pages)
1. Push this repo to GitHub.
2. On GitHub go to **Settings → Pages**. Under **Source** choose **Deploy from a branch**, then **main** and **/ (root)**, and save.
3. After a minute the app is live at `https://<your-username>.github.io/SebsSymptoms/`.

GitHub Pages is free for public repos. A public repo means people can see the *code*, never your data. A private repo needs a paid GitHub plan for Pages.

### 2. Install on the iPhone
1. Open that URL in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. **Always open the app from the Home Screen icon.** Safari and the Home Screen app keep separate copies of the data.

### 3. Turn on backups
1. Install the **Google Drive** app and sign in.
2. In the app go to **Settings → Set backup passphrase**. Save the passphrase in the iPhone **Passwords** app. There is no recovery if it's lost.
3. Each day the Today screen shows a backup banner. Tap **Back up**, then **Save to Google Drive**, then choose **Drive** and pick a folder (e.g. "SebsSymptoms backups").

### 4. Daily reminders
iPhone web apps can't schedule their own notifications without a server, so use the **Reminders** app instead. Create "Fill in symptom diary", set a time, and set Repeat to Daily.

## Restoring
On a new phone or after reinstalling, go to **Settings → Restore from a backup**, choose the `.ssbk` file from Drive, and enter the passphrase.

## Opening a backup on a computer
```bash
pip install cryptography
python3 tools/decrypt_backup.py SebsSymptoms-2026-11-08-2100.ssbk
```
This writes `data.json` (all entries and products) and a `photos/` folder. The output is **not** encrypted, so keep it private and out of this repo.

## Warnings
- Deleting the Home Screen icon deletes the app's data. Back up first.
- Backup files are only as safe as your passphrase. Use four or more random words.

## Development
Plain HTML, CSS and JavaScript modules, with no build step and no dependencies.

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

**When you change any file, bump `VERSION` in `sw.js`.** Otherwise installed phones keep the cached copy. The app shows an "Update ready" banner once the new version has downloaded.

| File | What it does |
|---|---|
| `js/app.js` | Screens and flows |
| `js/body.js` | The body-map figure and symptom list |
| `js/backup.js` | Encrypted backup format (also documented in `tools/decrypt_backup.py`) |
| `js/db.js` | IndexedDB storage |
| `js/images.js` | Photo compression and metadata stripping |
| `sw.js` | Offline caching |

### Planned
- Importing past paper-diary data (CSV)
- Correlation analysis: which foods, products and activities line up with flare-ups, allowing for delayed reactions
- A printable report for specialist appointments
