# Whiskey Student — Phase 1 (v1.1)

Personal whiskey tasting journal that installs on your iPhone or iPad Pro like an app. Everything (entries, photos, field notes) is saved on the device itself. It works offline, which helps at distilleries and in rickhouses with no signal.

One app, one link: the layout adapts to the screen it's on.

## iPhone

- Bottom tab bar, one-column journal.
- Tap an entry to open it; the back arrow returns to the list.

## iPad Pro

- **Sidebar** on the left replaces the bottom tabs.
- **Split view** in landscape (both sizes) and on the 13" in portrait: your journal list on the left, the open entry on the right. Tap any pour to switch without losing your place in the list.
- **11" in portrait**: sidebar plus one wide pane; entries open full width.
- **Wider pages**: entries show tasting notes beside the flavor profile, and the distillery beside the pour.
- **Editor**: a section index stays on the left, the flavor wheel sits beside your notes, and the flavor chart sits beside its sliders.
- **Field notes**: the note box stays on the left while you scroll the list.
- **Split View / Slide Over** next to another app: the iPhone layout takes over automatically.
- **Apple Pencil**: Scribble works in every text field, so you can handwrite notes and they turn into text.

### Keyboard shortcuts (Magic Keyboard)

| Key | Action |
|---|---|
| `N` | New pour |
| `/` | Search the journal |
| `↑` `↓` | Previous / next entry (split view) |
| `E` | Edit the open entry |
| `⌘` `S` | Save the entry you're editing |

## Features (both devices)

- **Journal**: search by whiskey, distillery or flavor tag; filter by category; sort by date, score or name.
- **New pour**: 8 sections in tasting order: bottle, photos, distillery, pour and color, nose/palate/finish with the flavor wheel, flavor profile radar, verdict, personal and channel notes. ABV converts to US proof automatically.
- **Photos**: take them with the camera or pick from your library, up to 6 per entry. They're resized to save space, and the first photo becomes the list thumbnail.
- **Log another pour**: on any entry, starts a new tasting of the same bottle with the bottle and distillery details already filled in.
- **Field notes**: your Phase 1 log. Tag each note as Idea, Improvement, Bug, Feature or Observation, and by part of the app.
- **Data**: back up with or without photos, import a backup, export field notes as Markdown.

## 1. Put it online (GitHub Pages, free)

The app has to be served over HTTPS for install and offline mode to work.

1. On GitHub, create a repository, e.g. `whiskey-student`. Public is fine: only the app code is there, never your entries.
2. Upload every file and the `icons` folder to the repository root.
3. Go to **Settings → Pages**. Choose **Deploy from a branch**, branch `main`, folder `/ (root)`, then **Save**.
4. After a minute or two it's live at `https://<your-username>.github.io/whiskey-student/`.

**Already set up from v1.0?** Replace the files in the repo with these. The next time you open the app on each device, tap **Update** when it says a new version is ready. Your entries aren't touched.

## 2. Install it

**iPhone / iPad (Safari):** open the URL → **Share** → **Add to Home Screen** → **Add**.

Always open it from the home-screen icon. The installed app keeps its own storage, separate from Safari.

## 3. iPhone and iPad keep separate journals

Each device stores its own entries; they don't sync. To move or copy entries between them:

1. On the device that has the entries: **Data → Back up with photos**, save to **iCloud Drive**.
2. On the other device: **Data → Choose backup file**, pick it from iCloud Drive.

Import merges: new entries are added, and an entry already on the device is replaced only if the imported copy was edited more recently.

A simple routine: log on whichever device is in your hand, then run a backup and import whenever you switch. If you find yourself doing this often, note it in **Field notes**. It's the main reason to add sync later (for example through your homelab).

## 4. Bring over entries from the claude.ai journal (optional)

In the claude.ai journal tap **Export backup**, save the file to iCloud Drive, then in the app go to **Data → Choose backup file**. The Redbreast example entry is skipped automatically.

## 5. Keep it backed up

Your journal lives only on the device. If the device is lost or the app is deleted, the data goes with it. Back up every week or two to iCloud Drive or Google Drive. The app reminds you after two weeks.

## Updating the app later

When you change any file, also change the `CACHE` name at the top of `sw.js` (e.g. `v1.1.0` → `v1.1.1`) and push.

## Phase 1 → Phase 2

Use **Field notes** whenever something works well, slows you down, or is missing. When you're ready to plan Phase 2, go to **Data → Export field notes** and share the Markdown file with Claude.
