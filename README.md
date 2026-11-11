# Seb's Symptoms

A private, offline diary for tracking eczema, sinus symptoms and their possible triggers: food, activities, medications and creams, and the products that touch your skin. Built for an iPhone, and installed from Safari to the Home Screen.

- **Check-ins with a body map.** Tap the face, neck, arms, inner elbows, or hands and wrists and score each one from 1 to 10. Itch, dry skin, swelling and sinus get their own scores, as do sleep and stress. A new check-in starts from the previous one, so you only change what's different (sleep and stress always start blank).
- **Weekly eczema score (POEM).** Seven questions once a week give a 0–28 score that dermatologists recognise. The Today screen reminds you when it's due.
- **Food, activity, meds and creams.** Things you've logged before show up as one-tap suggestions. BJJ, Gym and Work (bartending) are always one tap away.
- **Products.** Add detergents, soaps and creams once, with a photo of the ingredients label. They count for every day until you mark them stopped.
- **Photos of symptoms.** Shrunk to save space, with location data removed. They stay inside the app and don't go to your camera roll or iCloud Photos.
- **Trends.** A colour grid of every area, symptom, sleep, stress and humidity over 14, 30 or 90 days, plus POEM history. Inside each day's square, time runs from midnight (left) to midnight (right), and the colour blends between that day's check-ins, so a flare at 5 pm that settled by 9 pm shows as a dark patch fading back to pale.
- **Day details.** Tap any square to see that day as a chart of score against time, a table of every check-in, plus the weather, food, activities and products for that day.
- **Triggers.** After 2 weeks of check-ins, ranks the foods, food groups (dairy, wheat, eggs …, guessed from what you type and correctable), activities and products that line up with flares. Each one shows which symptom or body area it affects, how soon (same day, next day or within 2 days), by how much, and how sure that is. Weather, sleep and stress are checked too. A guide suggests what to cut out first, and **3-week elimination tests** compare before and after and flag slip-ups. See [How the trigger analysis works](#how-the-trigger-analysis-works).
- **Weather (optional).** Daily temperature, humidity, rain, UV and air quality (PM2.5) from Open-Meteo, for the past 2 months onwards.
- **Specialist report.** One document for appointments covering a summary, most affected areas, the day-by-day grid, POEM, possible triggers and elimination tests, products with label photos, meds, activities, foods, weather, notes and photos. Print it, save it as a PDF, or share it as a file.
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
| `tests.csv` | Elimination tests from the Triggers tab, if any. |
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
| `js/insights.js` | The trigger analysis (no DOM; testable on its own) and elimination-test summaries |
| `js/foods.js` | Food-name matching and the food groups (dairy, wheat, eggs …) |
| `js/triggers.js` | The Triggers tab |
| `js/poem.js` | POEM questions and severity bands |
| `js/weather.js` | Open-Meteo weather, air quality and town search |
| `js/report.js`, `css/report.css` | The specialist report |
| `js/db.js` | IndexedDB storage. Reconnects automatically when iOS closes the connection in the background; related changes are saved together or not at all |
| `js/images.js` | Photo compression and metadata stripping |
| `sw.js` | Offline caching |

### Planned
- Importing past paper-diary data (CSV)

## How the trigger analysis works
Everything runs on the phone. For each food, food group, activity and product:

1. **Outcome.** Each day's highest score for every symptom and body area. By default every item is matched with the symptom it lines up with best ("Any symptom"); one symptom can also be chosen.
2. **Timing.** Exposure windows of the same day (only counting things logged before that day's last check-in), by the next day, and within 2 days. The best-fitting window is kept.
3. **Model.** A regression of the score on the exposure alongside a smooth trend (a penalised linear spline with knots every 14 days), so each item is compared with days around the same time and slow changes (season, treatment, a bad month) don't create false links. Products, which are used for weeks at a time, are compared period against period.
4. **Chance check.** The item's dates are slid along the diary (circular shift) and the whole search (every window and symptom) is repeated on each copy. This respects flares that last several days and corrects for picking the best window and symptom. Weekly routines would land back on themselves when slid, so for those the same runs of days are placed at random instead. Beyond the range of the copies, p-values come from a widened exponential tail.
5. **Shrinkage.** Estimates are pulled toward zero (normal prior, sd 0.8 points), more so for things seen on few days. The uncertainty is widened when the copies vary more than theory expects.
6. **Labels.** *Strong* means a Benjamini–Hochberg FDR ≤ 10% across everything compared (weather, sleep and stress included), at least 28 check-in days, and an effect of at least 0.5 points. *Possible* means FDR ≤ 30% within its kind and p ≤ 0.05. *Weak hint* means p ≤ 0.1. *No sign of a problem* means the 90% range stays under +0.5. Products can only reach "possible", because one switch can't separate the product from anything else that changed at the same time.

**Tested on simulated diaries** (about 60 things compared in each):
- **Diaries with no triggers (80 of them):** nothing was ever labelled "strong".
- **Diaries with planted triggers:**
  - A strong same-day reaction (prawns → swelling) was found in every diary within 75 days.
  - Delayed or partial ones took longer: dairy → itch over 2 days, and a weekly bartending shift → hands. These were found in 58–80% of diaries by 75 days and in 93–100% by 180 days.

Meds and creams are left out, because they're used *because* of flares. Patterns are leads, not proof; the elimination test is the check.

POEM (Patient-Oriented Eczema Measure) © The University of Nottingham.
