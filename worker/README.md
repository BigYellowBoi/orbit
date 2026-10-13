# Orbit sync helper

A small Cloudflare Worker (free plan) that fills Orbit's day data in by itself:

- **WHOOP**: recovery, HRV, resting HR, sleep, strain, calories, steps and workouts through the WHOOP API. WHOOP pings the helper when something changes, and it also checks every 3 hours. Today's steps and strain (which WHOOP doesn't ping about) are refreshed every 30 minutes. Your WHOOP history fills in a month or two every 10 minutes after you connect.
- **Apple Health**: MacroFactor's calories and macros, scale weight, iPhone steps and headphone levels, posted by an iPhone Shortcut.

Everything lands in `orbit/dy/YYYY-MM.json` in your private `orbit-data` repo, and Orbit (the home-screen app) picks it up on its next sync. The claude.ai artifact keeps its own data and isn't touched.

Keys and tokens live only in Cloudflare's encrypted settings. Nothing secret goes in this repo.

## 1. GitHub token for the helper

GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.

- Repository access: **Only select repositories → orbit-data**
- Permissions: **Contents: Read and write** (nothing else)
- Expiry: as long as you like. When it expires the status page will say so.

## 2. Create the Worker

1. Cloudflare dashboard → **Workers & Pages → Create → Create Worker**. Name it `orbit-sync`, then **Deploy**.
2. **Edit code**, replace everything with the contents of `orbit-sync.js`, then **Deploy**.
3. **Storage & Databases → KV → Create** a namespace called `orbit`.
4. Back in the Worker: **Settings → Bindings → Add → KV namespace**. Variable name `ORBIT_KV`, namespace `orbit`.
5. **Settings → Variables and Secrets → Add**:

   | Name | Type | Value |
   |---|---|---|
   | `WHOOP_CLIENT_ID` | Text | from the WHOOP developer dashboard |
   | `GH_REPO` | Text | `BigYellowBoi/orbit-data` |
   | `TZ_OFFSET` | Text | `+10:00` |
   | `BACKFILL_FROM` | Text | first month you wore WHOOP, e.g. `2024-11` |
   | `WHOOP_CLIENT_SECRET` | Secret | from the WHOOP developer dashboard |
   | `GH_TOKEN` | Secret | the token from step 1 |
   | `SYNC_KEY` | Secret | make up a long random password (letters and numbers only) |

6. **Settings → Trigger Events → Add → Cron Triggers**: `*/10 * * * *`.

Your helper's address is shown on the Worker's page, like `https://orbit-sync.yourname.workers.dev`.

## 3. WHOOP developer app

In the WHOOP developer dashboard, edit your app:

- **Redirect URL**: `https://orbit-sync.yourname.workers.dev/callback`
- **Scopes**: read:recovery, read:cycles, read:sleep, read:workout (and offline if it's listed)
- **Webhook URL**: `https://orbit-sync.yourname.workers.dev/webhook`, model version **v2**

## 4. Connect

1. If you want your artifact data in the home-screen app, restore that backup in the home-screen app **first** and let it sync. A restore replaces whole months, so doing it after the helper starts would overwrite what it added (the fix is `/backfill`, below).
2. Open `https://orbit-sync.yourname.workers.dev/auth?key=YOUR_SYNC_KEY`, sign in to WHOOP and allow access.
3. You'll see "WHOOP connected". The last few days arrive within a minute; history takes a few hours.

The status page is the bare address: `https://orbit-sync.yourname.workers.dev`.

## 5. Apple Health Shortcut

In Shortcuts, create a shortcut called **Orbit Health**:

1. **Find Health Samples** where Type is *Steps* and Start Date is *today*. Then **Calculate Statistics**: *Sum*. Rename the result `Steps`.
2. The same for *Dietary Energy* (`Energy`), *Protein* (`Protein`), *Carbohydrates* (`Carbs`) and *Total Fat* (`Fat`).
3. **Find Health Samples** where Type is *Weight* and Start Date is *today*, sorted by *Start Date*, *Latest First*, limit *1*. Rename it `Weight`.
4. **Find Health Samples** where Type is *Headphone Audio Levels* and Start Date is *today*.
5. **Repeat with Each** item in those samples, containing one **Text** action:
   `Value,Start Date,End Date`
   using the Repeat Item's *Value*, *Start Date* and *End Date* (tap each date and set Date Format to **ISO 8601**, with time).
6. **Get Contents of URL**: `https://orbit-sync.yourname.workers.dev/health?key=YOUR_SYNC_KEY`, Method **POST**, Request Body **JSON** with:

   | Key | Type | Value |
   |---|---|---|
   | `stpi` | Number | Steps |
   | `kj` | Number | Energy (use the key `kcal` instead if Health shows your energy in Cal) |
   | `p` | Number | Protein |
   | `c` | Number | Carbs |
   | `f` | Number | Fat |
   | `wt` | Number | Weight |
   | `hpraw` | Text | Repeat Results |

Then in **Automation**, add two personal automations, each set to **Run Immediately**:

- **Time of Day**, 11:55 pm, daily → Orbit Health (finishes each day).
- **App → MacroFactor → Is Closed** → Orbit Health (keeps today current while you log).

Run the shortcut once by hand; the response should be `{"ok": true, "days": 1}`.

## 5b. Or: Health Auto Export (instead of the Shortcut)

In Health Auto Export, open **Automations**, add a **REST API** automation and set:

- **URL**: `https://orbit-sync.yourname.workers.dev/health`
- **Headers**: add `x-sync-key` with your SYNC_KEY as the value (or put `?key=YOUR_SYNC_KEY` on the end of the URL instead).
- **Data Type**: Health Metrics. **Metrics**: Step Count, Dietary Energy, Protein, Carbohydrates, Total Fat, Weight & Body Mass, Headphone Audio Exposure.
- **Export Format**: JSON, **Export Version** 2.
- **Summarize Data**: on, **Time Grouping**: Day.
- **Date Range**: Default (yesterday and today, so each day gets finished off the next morning).
- **Batch Requests**: off.
- **Sync Cadence**: every 1 hour.

Add the Automations widget to your home screen so runs aren't skipped in the background. iOS only lets apps read Health while the phone is unlocked, so a run waits until you next use it. The Data screen's Automatic sync card shows when Apple Health last came in.

Headphone minutes listened aren't part of this format, so only the level updates automatically; a full Health export (see `tools/health-to-orbit.py`) fills the minutes in.

## Addresses

| Address | What it does |
|---|---|
| `/` | Status: connected, last sync, history progress, last problem |
| `/status.json` | The same as JSON; Orbit's Data screen reads it |
| `/auth?key=…` | Connect or reconnect WHOOP |
| `/sync?key=…` | Sync the last few days now |
| `/backfill?key=…&from=2024-11` | Fetch WHOOP history again from a month |
| `/health?key=…` | Apple Health numbers (POST, JSON) |

## Limits

Cloudflare's free plan allows 50 outside requests per run, so each run budgets 45, syncs the last 4 days and fills history with what's left. KV writes only happen when something changed. WHOOP allows 100 requests a minute and 10,000 a day; the helper uses a few hundred a day at most.

WHOOP's journal (alcohol) isn't in the API. A WHOOP export imported on the Data screen still brings it in.

## Testing

`node test/worker.mjs` runs the helper against a fake WHOOP, a fake GitHub and an in-memory KV.
