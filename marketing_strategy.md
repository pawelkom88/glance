# Glance: Market Validation & Go-to-Market Strategy

Before spending engineering hours building a licensing system, it is critical to validate that people will actually pay $10 for this. Here is a breakdown of the market, how Glance stands out, and how to promote it.

---

## 1. Is there room for this app? (Market Validation)
**Yes, but it is a niche utility market.** The teleprompter software market is currently divided into two frustrating extremes for users:

1. **The Overpriced Enterprises:** Tools like PromptSmart or Teleprompter Premium charge $40 to $100+ per year (subscriptions). They are loaded with features the average person doesn't need (AI voice tracking, script cloud syncing, iPad companion apps).
2. **The Clunky Web Apps:** Free browser-based prompters. They look terrible, you can't control them with global shortcuts while focusing on another window, and they aren't "Always on Top" of your Zoom/Teams window.

### Your Target Audience
*   **Indie Hackers & Founders:** Recording pitches, Loom videos, or YouTube product demos.
*   **Sales Professionals:** Reading scripts during live Zoom calls without breaking eye contact.
*   **Content Creators:** YouTubers and course creators who need a simple, offline script reader.

---

## 2. How do we stand out? (Unique Value Proposition)
Glance stands out by doing exactly **one thing perfectly, for a fair price.**

1. **The $10 One-Time Pricing (The Golden Hook):** This is your biggest weapon. Consumers are deeply fatigued by subscriptions. "Buy it once, own it forever" is a massive selling point right now against your competitors.
2. **Native & Offline (Privacy):** Many corporate users cannot upload their confidential sales scripts or meeting notes to a random cloud teleprompter. Glance runs entirely on-device.
3. **Frictionless UI:** It doesn't look like a dashboard from 2005. The transparent blur, Markdown parsing, and clean typography make it feel native to macOS/Windows 11.
4. **Global Shortcuts:** The ability to pause or rewind the text *while* the Zoom window is in focus is a killer feature that web apps physically cannot do.

---

## 3. How do we promote the app? (Go-to-Market)

You don't need a massive marketing budget. You need to get the app in front of communities who use video.

### Phase 1: The "Build in Public" Launch (Weeks 1-2)
*   **X (Twitter):** Post a short, 30-second Loom video showing *only* the problem and the solution. Example: Show yourself looking down at notes (bad eye contact), then show Glance hovering right under your webcam (perfect eye contact). Mention the $10 one-time price.
*   **ProductHunt:** Launch on a Tuesday or Wednesday. Emphasize "No Subscriptions" in the tagline. E.g., *"Glance - The beautiful, always-on-top teleprompter. Pay once."*
*   **HackerNews (Show HN):** Developers love native apps written in Rust/Tauri that don't use electron or charge monthly. Frame it technically: *"Show HN: I built a fast, entirely offline teleprompter in Tauri to replace $50/yr electron apps."*

### Phase 2: Niche Communities (Weeks 3-4)
*   **Reddit:** Do not spam. Post genuinely helpful setups in subreddits like `r/Sales`, `r/macapps`, `r/youtubers`, or `r/contentcreators`. E.g., *"How I stopped breaking eye contact during remote sales pitches."*
*   **IndieHackers / X:** Give away 10 free license keys to early users in exchange for genuine testimonials to put on the landing page.

### Phase 3: SEO Play (Long Term)
*   You already have the landing page. We need to add a `/blog` eventually and write highly targeted articles like *"Best Teleprompter for Zoom Meetings in 2026"* or *"How to read a script while looking at the camera."*

---

## Summary Decision
Before you build the 7-day trial backend, my recommendation is:
1. Finish the app to a "v1.0" stable state.
2. Add a simple **Gumroad** or **Lemon Squeezy** "Buy me a coffee / Support development" link on the landing page *first*.
3. Share the free app. If people actually download it and use it, *then* invest the time into locking it down with a 7-day trial and license keys. If no one downloads it for free, you saved yourself hours of backend Rust work.
