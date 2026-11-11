# Whiskey Student — Phase 1 (v1.2)

Personal whiskey tasting journal and content planner that installs on your iPhone or iPad Pro like an app. Everything (entries, photos, field notes, calendar, ideas and strategy) is saved on the device itself. It works offline, which helps at distilleries and in rickhouses with no signal.

One app, one link: the layout adapts to the screen it's on.

## What's new in v1.2: the Plan tab

HQ now lives inside the app. Tap **Plan** (or press `P` on the Magic Keyboard). It has four views:

- **Today**
  - This week, day by day. Each day shows your posting slots (Mon Reel, Thu YouTube, Fri Blind Friday and so on) filled with what's planned, and open slots with a **Fill** button.
  - Your **Instagram goal**: followers toward 1,000 by Jan 31, whether you're on pace, and how many a week you need. Log your Instagram followers and YouTube subscribers on Sundays.
  - The **Whiskey counter** (bottles out of 100), your next shoot with its shot list, and the pipeline (how many posts are planned, shot, edited, posted).
- **Calendar**
  - Month view on iPad, a day-by-day list on iPhone, and a **Board** view by status (Idea → Planned → Scripted → Shot → Edited → Scheduled → Posted).
  - Tap any post to edit it: platform, pillar, series, shoot and post dates, hook, notes, the link once it's live, and which journal entry it's about.
- **Ideas**: all 60 ideas from the strategy, filterable by pillar. **Schedule** puts one on a date. Add your own.
- **Strategy**: the content strategy and the growth plan, readable on any screen and editable (Markdown).

On first open, v1.2 loads the full 12-week calendar (Nov 9 – Jan 31), the distillery shoots, the 2027 tentpoles, all 60 ideas and both strategy documents. Your existing entries, photos and notes aren't touched.

### Journal changes

- **Verdict** now includes your **Channel verdict**: Buy / Bar Pour / Pass.
- **Show on my website**: tick it on any pour to put it in the public tasting log. You can add a short public blurb. Personal notes, "what I learned", pairings, channel notes and photos never go public.
- On any entry, **Log another pour** starts fresh on these fields.

### Publish to your website

**Data → Publish to your website** sends every pour marked *Show on my website*, plus every posted YouTube video, to your website's GitHub repo. GitHub Pages rebuilds the site in about a minute. Publishing again with nothing changed does nothing.

## 1. Update the app (from v1.1)

1. Replace the files in your `whiskey-student` repo with these. **Don't forget the new `seed.js`.**
2. Open the app on each device and tap **Update** when it says a new version is ready.
3. Open **Plan**. The calendar, ideas and strategy are already loaded.

## 2. Set up publishing (once per device, about 5 minutes)

Your website and this app must be **two different repos**. The app already uses `whiskey-student`, so put the website in, say, `whiskey-student-site`.

**Create a token that can only touch the website repo:**

1. GitHub → your photo → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. Name: `Whiskey Student app`. Expiration: 1 year (set a reminder to renew).
3. **Repository access → Only select repositories →** `whiskey-student-site`.
4. **Permissions → Repository permissions → Contents → Read and write.** Leave everything else as "No access".
5. **Generate token** and copy it.

**In the app:** **Data → Publish to your website → GitHub settings**. Enter your username, the website repo name, branch `main`, data folder `src/data`, and paste the token. Tap **Save settings**, then **Publish now**.

The token is stored only on that device and is never put in backups, so enter it once on the iPhone and once on the iPad. If a device is lost, delete the token on GitHub (same page) and make a new one.

## iPhone

- Bottom tab bar: Journal · New pour · Plan · Field notes · Data.
- One-column layouts; the calendar shows as a day-by-day list.

## iPad Pro

- **Sidebar** on the left replaces the bottom tabs.
- **Split view** in landscape (both sizes) and on the 13" in portrait: your journal list on the left, the open entry on the right.
- **Plan → Today**: your goal, counter and next shoot stay on the left while you scroll the week.
- **Plan → Calendar**: a full month grid; the Board shows every status side by side.
- **Plan → Strategy**: the section list stays on the left while you read.
- **Editor**: section index on the left, flavor wheel beside your notes.
- **Split View / Slide Over** next to another app: the iPhone layout takes over automatically.
- **Apple Pencil**: Scribble works in every text field.

### Keyboard shortcuts (Magic Keyboard)

| Key | Action |
|---|---|
| `N` | New pour |
| `P` | Plan |
| `/` | Search the journal |
| `↑` `↓` | Previous / next entry (split view) |
| `E` | Edit the open entry |
| `⌘` `S` | Save the entry you're editing |

## Install (new device)

The app has to be served over HTTPS. It's on GitHub Pages at `https://<your-username>.github.io/whiskey-student/`.

**iPhone / iPad (Safari):** open the URL → **Share** → **Add to Home Screen** → **Add**. Always open it from the home-screen icon. The installed app keeps its own storage, separate from Safari.

## iPhone and iPad keep separate data

Each device stores its own journal and plan; they don't sync. To copy between them:

1. On the device that has the latest: **Data → Back up with photos**, save to **iCloud Drive**.
2. On the other device: **Data → Choose backup file**.

Import merges. New entries, posts and ideas are added. Something already on the device is replaced only if the imported copy was edited more recently. Follower logs are combined.

If you do this often, note it in **Field notes**. It's the main reason to add sync in Phase 2.

## Keep it backed up

Everything lives only on the device. If the device is lost or the app is deleted, the data goes with it. Back up every week or two to iCloud Drive or Google Drive; the app reminds you after two weeks. Backups now include the calendar, ideas, strategy edits and follower log (never the GitHub token).

## Files

| File | Purpose |
|---|---|
| `index.html` | App page |
| `styles.css` | Design (light and dark mode follow your device) |
| `app.js` | All app logic and on-device storage (IndexedDB) |
| `seed.js` | The calendar, ideas and strategy loaded on first run of v1.2 |
| `sw.js` | Offline support |
| `manifest.webmanifest` + `icons/` | Home-screen install, name and icon |

## Updating the app later

When you change any file, also change the `CACHE` name at the top of `sw.js` (e.g. `v1.2.0` → `v1.2.1`) and push.

## Phase 1 → Phase 2

Use **Field notes** whenever something works well, slows you down, or is missing. When you're ready to plan Phase 2, go to **Data → Export field notes** and share the Markdown file with Claude.
