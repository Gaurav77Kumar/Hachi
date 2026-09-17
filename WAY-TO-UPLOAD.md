# 📤 WAY TO UPLOAD — Ads → Art, step by step

Follow top to bottom. Nothing else is needed. (~40 min + review wait)

---

## STEP 0 — One-time checks (do these first)

1. Open the project folder and confirm `lib/config`... (skip — this extension has no config file).
2. Make sure you have tested the unpacked extension on real ad-heavy sites
   (news sites) and seen no false positives.
3. Your 5 screenshots exist at **1280×800 px** (PNG or JPG).
   - If your screenshots are a different size: open them in any image editor
     (even Paint), set canvas to 1280×800, export.
4. ZIP is already built: `dist/ads-art-v1.2.1.zip` ✅
   (If you changed code since: run `python tools/package.py` again — it reads
   the version from manifest.json and builds a fresh zip.)

---

## STEP 1 — Create the developer account (one-time, $5)

1. Go to: **https://chrome.google.com/webstore/devconsole**
2. Sign in with your Google account.
3. Pay the **one-time $5 registration fee** (card/UPI as offered).
4. You land on the developer dashboard. Done — you now have a developer
   account forever.

---

## STEP 2 — Upload the zip (2 min)

1. On the dashboard, click the **＋ New item** button (top right).
2. In the upload dialog, drag or browse to:
   `viral-machine/dist/ads-art-v1.2.1.zip`
3. Wait for the upload to finish → you're now on the item's **edit page**.
4. **Copy the item's store URL** from the browser address bar and save it in
   your notes (you'll use it for Reddit/X posts later).

---

## STEP 3 — Fill the Store listing tab (10 min)

Open `LISTING.md` in this folder side-by-side and copy-paste:

1. **Store listing** tab → **Product details**:
   - Name: `Ads → Art: Replace Ads with Masterpieces`
   - Short description: the Summary line from LISTING.md
   - Detailed description: the Description from LISTING.md
2. **Category**: `Productivity` · **Language**: `English (United States)`
3. Scroll to **Images**:
   - Upload the 5 screenshots (1280×800). First one = the before/after hero shot.
4. Nothing else on this tab is required. Click **Save draft**.

---

## STEP 4 — Privacy tab (5 min)

1. Open the **Privacy** tab of the item.
2. **Privacy practices** section:
   - Data usage: select **"Single purpose"** and describe: *"Replaces ad slots
     on web pages with public-domain artwork images."*
   - Under "Does this item collect user data?" → check
     **"Does not collect user data"**.
3. **Privacy policy** section:
   - Paste the URL of PRIVACY.md hosted on GitHub
     (open PRIVACY.md in your GitHub repo → copy the browser URL → paste it
     into the field).
4. **Permission justification** section:
   - Paste the "Permission justification" paragraph from LISTING.md.
5. Click **Save draft**.

---

## STEP 5 — Push the code to GitHub (if not done yet, 3 min)

```bash
git add -A
git commit -m "Ads→Art v1.2.1 — production hardening + launch kit"
git push
```
(Create the empty repo on github.com first if it doesn't exist yet — no
README/gitignore in the wizard.)

The PRIVACY.md link from Step 4 only works after this push.

---

## STEP 6 — Submit for review (1 min)

1. On the item page, click **Submit for review** (top right).
2. Confirm. Status becomes "Pending review".
3. **Wait 1–4 weeks.** Broad-host extensions (this one runs on all sites) get
   a deeper, sometimes manual review. Do NOT resubmit while waiting — if the
   reviewer needs something, they message you in the item's email/review tab.

---

## STEP 7 — After approval

1. You get an email; status = "Published".
2. Open the store link in a **fresh Chrome profile** and install it — verify
   it works from the store, not just unpacked.
3. Now run the launch posts (Reddit/X/HN plan) with the live store link.
4. Check the dashboard's **Statistics** tab weekly; reply to every review.

---

## Future updates (30 seconds each)

1. Edit code → bump `version` in `manifest.json` (e.g. 1.2.1 → 1.2.2)
2. `python tools/package.py`
3. Dev console → your item → **Package** → upload new zip → **Submit for review**

---

*Note: MediumStreak (the other extension in this workspace) has the same
process with its own checklist — see `../LAUNCH.md` and `../LISTING.md`.*
