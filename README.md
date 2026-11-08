# Seb's Symptoms

A private, offline diary for tracking eczema, sinus symptoms and their possible triggers: food, activities, medications and creams, and the products that touch your skin. Built for an iPhone, and installed from Safari to the Home Screen.

- **Check-ins with a body map.** Tap the face, neck, arms, inner elbows, or hands and wrists and score each one from 1 to 10. Itch, dry skin, swelling and sinus get their own scores, as do sleep and stress. A new check-in starts from the previous one, so you only change what's different (sleep and stress always start blank).
- **Weekly eczema score (POEM).** Seven questions once a week give a 0–28 score that dermatologists recognise. The Today screen reminds you when it's due.
- **Food, activity, meds and creams.** Things you've logged before show up as one-tap suggestions. BJJ, Gym and Work (bartending) are always one tap away.
- **Products.** Add detergents, soaps and creams once, with a photo of the ingredients label. They count for every day until you mark them stopped.
- **Photos of symptoms.** Shrunk to save space, with location data removed. They stay inside the app and don't go to your camera roll or iCloud Photos.
- **Trends.** A colour grid of every area, symptom, sleep, stress and humidity over 14, 30 or 90 days, plus POEM history.
- **Weather (optional).** Daily temperature, humidity, rain, UV and air quality (PM2.5) from Open-Meteo, for the past 2 months onwards.
- **Specialist report.** One document for appointments covering a summary, most affected areas, the day-by-day grid, POEM, products with label photos, meds, activities, foods, weather, notes and photos. Print it, save it as a PDF, or share it as a file.
- **Backups to Google Drive.** Two taps a day saves a normal .zip file containing spreadsheets and photos.

## Privacy model

| | |
|---|---|
| Where data lives | Only in the app's storage on your iPhone (IndexedDB). No account, server, analytics or tracking. |
| Network | A Content-Security-Policy stops the app from contacting any server except its own host and, if weather is turned on, Open-Meteo. Open-Meteo receives only a location rounded to about 10 km. |
| Backups | Plain, readable .zip files saved to your Google Drive. Anyone who can get into your Google account can open them, so keep 2-step verification on. |
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

### 3. Back up daily
1. Install the **Google Drive** app and sign in.
2. Each day the Today screen shows a backup banner. Tap **Back up**, then **Save to Google Drive**, then choose **Drive** and pick a folder (e.g. "SebsSymptoms backups").

### 4. Daily reminders
iPhone web apps can't schedule their own notifications without a server, so use the **Reminders** app instead. Create "Fill in symptom diary", set a time, and set Repeat to Daily.

## Restoring
On a new phone or after reinstalling, go to **Settings → Restore from a backup** and choose a backup `.zip` from Drive. Older encrypted `.ssbk` backups from version 1.0 also work; the app asks for that file's passphrase.

## What's in a backup
A backup is an ordinary `.zip` file. Double-click it on a computer, or tap it in the iPhone Files app.

| File | Contents |
|---|---|
| `entries.csv` | One row per entry. Check-ins have a 0–10 column for every symptom and body area (0 = none). Opens in Excel, Numbers or Google Sheets. |
| `products.csv` | Detergents, soaps and creams, with start and stop dates. |
| `weather.csv` | Daily weather, if weather is turned on. |
| `photos/` | Symptom photos, named `date_time_area`. |
| `labels/` | Ingredient-label photos. |
| `data.json` | Everything in one file. The app restores from this. |
| `README.txt` | A short guide to the files. |

`tools/decrypt_backup.py` is only for old encrypted `.ssbk` backups made by version 1.0.

## Warnings
- Deleting the Home Screen icon deletes the app's data. Back up first.

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
| `js/backup.js` | Builds and reads backup zips (CSV + JSON + photos) |
| `js/zip.js` | Minimal zip writer and reader |
| `js/legacy-backup.js` | Restores old encrypted `.ssbk` backups |
| `js/heat.js` | The day-by-day colour grid (Trends and report) |
| `js/poem.js` | POEM questions and severity bands |
| `js/weather.js` | Open-Meteo weather, air quality and town search |
| `js/report.js`, `css/report.css` | The specialist report |
| `js/db.js` | IndexedDB storage |
| `js/images.js` | Photo compression and metadata stripping |
| `sw.js` | Offline caching |

### Planned
- Importing past paper-diary data (CSV)
- Correlation analysis: which foods, products, activities and weather line up with flare-ups, allowing for delayed reactions

POEM (Patient-Oriented Eczema Measure) © The University of Nottingham.
