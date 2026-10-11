# "Post to outofbreathed" iOS Shortcut

Posts photos and videos to outofbreathed.com only. Unrelated to the family app at family.outofbreathed.com.

Built by hand in the Shortcuts app; Shortcuts can't be generated from code. Posting the same photo
twice is harmless: the site recognises the `source_ref` and skips it. So if a run fails halfway on a
weak connection, just run it again.

The site reads the date and location from what the Shortcut sends. It still strips all location data
from the copies people view.

## Before you start

You need the service token's **Client Secret**, saved from the Zero Trust dashboard.
The Client ID is `78bdc8e5d24427384911194c0c6e0c02.access`.

## Shortcut settings

1. Shortcuts app → **+** → name it **Post to outofbreathed**.
2. Tap the **ⓘ** (details) button:
   - Turn on **Show in Share Sheet**.
   - Set the Share Sheet types to **Images** and **Media** only.
3. The first block now reads **Receive Images and Media from Share Sheet**. Set "If there's no
   input" to **Ask For → Photos** so it also works when run from the home screen.

## Actions, in order

Add each action with the search bar at the bottom. "→ Variable X" means add a **Set Variable**
action right after it, named X.

### Ask once for the whole batch

1. **List** with the items `misc`, `family`, `travel`, `moto`, `food`.
2. **Choose from List** (prompt: `Category`, **Select Multiple off**) → Variable **Category** (set to *Chosen Item*).
3. **If** *Category* **is** `food`
   - **Choose from List** on a **List** of `home`, `out` (prompt: `Made at home or ate out?`) → Variable **FoodType**.
   - **Otherwise**: **Text** (leave it empty) → Variable **FoodType**.
   - **End If**
4. **Ask for Input**: Text, prompt `Caption (optional)` → Variable **Caption**.
5. **If** *Category* **is** `family`
   - **Text** `1` → Variable **Private**.
   - **Otherwise**: **Choose from Menu** with prompt `Private?` and options **No** / **Yes**.
     - Under **No**: **Text** `0` → Variable **Private**.
     - Under **Yes**: **Text** `1` → Variable **Private**.
     - **End Menu**
   - **End If**

### Then once per photo or video

6. **Repeat with Each** item in **Shortcut Input**. Everything below goes inside the repeat:
   1. **Get Details of Images**: **Date Taken** of *Repeat Item* → **Format Date**: Date Format **ISO 8601**, **Include ISO 8601 Time** on → Variable **TakenAt**.
   2. **Get Details of Images**: **Location** of *Repeat Item* → Variable **Loc**.
   3. **Get Details of Locations**: **Latitude** of *Loc* → Variable **Lat**.
   4. **Get Details of Locations**: **Longitude** of *Loc* → Variable **Lng**.
   5. **Get Details of Images**: **Name** of *Repeat Item* → Variable **Name**.
   6. **If** *Repeat Item* › **Media Type** **is** **Video** (tap *Repeat Item* in the If, then pick the Media Type property)
      - **Encode Media** *Repeat Item*, Size **1280×720** → Variable **File**.
      - **Otherwise**: **Convert Image** *Repeat Item* to **JPEG** (quality around 85%) → **Resize Image** by **Longest Edge** `2400` → Variable **File**.
      - **End If**
   7. **Text** `shortcut:` *Name* `:` *TakenAt* → Variable **Ref**.
   8. **Get Contents of URL** `https://outofbreathed.jimshobe.workers.dev/api/moments`
      - Method: **POST**
      - Headers:
        - `CF-Access-Client-Id`: `78bdc8e5d24427384911194c0c6e0c02.access`
        - `CF-Access-Client-Secret`: *(paste the secret)*
      - Request Body: **Form**, with these fields (type **Text** unless noted):

        | Key | Value |
        | --- | --- |
        | `file` | *File* (type **File**) |
        | `category` | *Category* |
        | `food_type` | *FoodType* |
        | `caption` | *Caption* |
        | `private` | *Private* |
        | `taken_at` | *TakenAt* |
        | `lat` | *Lat* |
        | `lng` | *Lng* |
        | `source_ref` | *Ref* |
   9. **Get Dictionary Value** for key `error` in *Contents of URL*.
   10. **If** *Dictionary Value* **has any value** → **Show Notification** *Name*`: `*Dictionary Value* → **End If**.
7. **End Repeat**, then **Show Notification** `Posted to outofbreathed.com`.

## Using it

Photos → select one or more → **Share** → **Post to outofbreathed**. Pick a category, add a caption
(or leave it blank), and the photos appear on the timeline within seconds.

## Limits

- Videos must be **under 50 MB** after encoding; a 720p clip of about 2 minutes is fine. For longer
  moto rides, upload to YouTube as **Unlisted** and paste the link on the `/post` page.
- Private moments can't be YouTube links; the site refuses them.
