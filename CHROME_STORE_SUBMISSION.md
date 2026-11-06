# Chrome Web Store Submission Guide for ReelCoach

This guide provides copy-paste ready text, checklist items, and exact values to fill out the **Chrome Web Store Developer Dashboard** for publishing **ReelCoach**.

---

## 1. Package File

* **Upload File**: [`ReelCoach-v1.4.0.zip`](ReelCoach-v1.4.0.zip) (located in project root)
* **Manifest Version**: 3
* **Extension Version**: 1.4.0
* **Permissions Requested**: `storage` (minimal privilege)

---

## 2. Store Listing Information

### Extension Name
```text
ReelCoach
```

### Summary (Short Description)
*(Must be ≤ 132 characters — this one is exactly 115 characters)*
```text
Rewind, scrub, loop, slow down and mirror videos on Instagram, Facebook and TikTok. Built for dancers and learners.
```

### Detailed Description
*(Copy and paste directly into the Store Description box)*
```text
ReelCoach is a free, privacy-friendly Chrome extension built specifically for dancers, performers, and movement learners. It adds essential video playback controls to short-form videos on Instagram, Facebook, and TikTok.

When you're trying to learn choreography or analyze movements, standard social media players fall short: you can't scrub backward 5 seconds, you can't step frame-by-frame, and you can't repeat the eight counts you're stuck on. ReelCoach adds all of that directly on top of the videos you watch!

⚡ KEY FEATURES

• Precision Timeline: Click and drag anywhere on the timeline to scrub forward or backward. Hover to see the exact timestamp.
• Frame-by-Frame Stepping: Catch subtle footwork, transitions, and hand placements with one-click frame stepping (< and >).
• A–B Combo Looper: Mark point A where a combo begins and point B where it ends. Drill that section continuously until it becomes muscle memory.
• Pitch-Preserved Slow Motion: Slow down playback between 0.25× and 2.0× without distorting the music pitch or audio.
• Studio Mirror Mode: Flip any video horizontally with a single click or hotkey (M) so the video mirrors your movements in the studio.
• Auto-Hiding Controls: The control bar appears smoothly when you hover over a video and auto-hides when you move your cursor away, keeping your view completely unobstructed.

⌨️ KEYBOARD SHORTCUTS

• ← / → : Skip backward / forward 5 seconds
• Shift + ← / → : Fine-skip backward / forward 1 second
• , / . : Previous / next frame
• K : Play / pause
• A / B : Set loop start (A) / loop end (B)
• L / X : Toggle loop on/off / clear loop
• S / D / R : Slower / faster / reset to 1.0× normal speed
• M : Toggle mirror mode

🔒 PRIVACY & SECURITY FIRST

• 100% Local & Client-Side: ReelCoach makes ZERO network requests.
• No Tracking & No Analytics: No accounts, no cookies, no third-party scripts.
• Minimal Permissions: Requests only "storage" to remember your preferred skip duration and mirror preferences across tabs.

DISCLAIMER
ReelCoach is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Instagram, Meta, Facebook, or TikTok.
```

### Category
* **Primary Category**: `Photos & Video` (or `Productivity`)

---

## 3. Privacy & Review Justifications

Under the **Privacy** tab on the Developer Console, Google asks for specific justifications for permissions and data usage:

### Single Purpose Description
```text
Provides specialized playback controls (scrubbing, A-B looping, slow motion, frame stepping, and mirror mode) over HTML5 videos on Instagram, Facebook, and TikTok to help dancers and learners analyze video choreography.
```

### Permission Justification: `storage`
```text
Required to persist user preferences locally, including custom skip intervals (e.g. 5 seconds vs 1 second fine-skip), auto-hide delay, and mirror mode state.
```

### Host Permissions Justification (`instagram.com`, `facebook.com`, `tiktok.com`)
```text
ReelCoach injects an isolated content script overlay solely on supported video pages (Instagram, Facebook Reels/Stories, and TikTok) to attach custom player controls to standard HTML video elements. No data is extracted or transmitted.
```

### Data Usage Declarations
Select **"No"** to all data collection types:
* Personally Identifiable Information: **No**
* Health Information: **No**
* Financial Information: **No**
* Authentication / Login Information: **No**
* Personal Communications: **No**
* Location Information: **No**
* Web History / Activity: **No**
* User Content: **No**

Check the certification box stating that you comply with Chrome Web Store Developer Program Policies.

---

## 4. Graphic Assets Checklist

All images are pre-generated with exact pixel dimensions in the [`store-assets/`](store-assets/) folder:

| Asset | Required Size | File to Upload |
|---|---|---|
| **Store Icon** | 128 × 128 px | [`icons/icon128.png`](icons/icon128.png) |
| **Screenshot 1** | 1280 × 800 px | [`store-assets/screenshot-1-controls-1280x800.png`](store-assets/screenshot-1-controls-1280x800.png) |
| **Screenshot 2** | 1280 × 800 px | [`store-assets/screenshot-2-loop-1280x800.png`](store-assets/screenshot-2-loop-1280x800.png) |
| **Screenshot 3** | 1280 × 800 px | [`store-assets/screenshot-3-speed-mirror-1280x800.png`](store-assets/screenshot-3-speed-mirror-1280x800.png) |
| **Small Promo Tile** | 440 × 280 px | [`store-assets/promo-tile-440x280.png`](store-assets/promo-tile-440x280.png) |
| **Marquee Banner** | 1400 × 560 px | [`store-assets/marquee-1400x560.png`](store-assets/marquee-1400x560.png) |

---

## 5. Step-by-Step Submission Process

1. **Sign In**: Go to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole).
2. **Developer Registration**: If this is your first time publishing, pay Google's one-time $5 developer registration fee.
3. **Upload Package**: Click **Add new item** → Drag & drop [`ReelCoach-v1.4.0.zip`](ReelCoach-v1.4.0.zip).
4. **Fill Store Listing**:
   - Paste the Description and Summary from Section 2 above.
   - Upload the 3 screenshots and promotional tiles from `store-assets/`.
   - Select Category: **Photos & Video**.
5. **Fill Privacy Tab**:
   - Paste the Single Purpose and Permission Justifications from Section 3 above.
   - Confirm that the extension does not collect or sell user data.
6. **Submit for Review**: Click **Submit for Review**.
   - Because ReelCoach only requests `storage` and has zero external network calls, approval typically takes between 24 and 48 hours.
