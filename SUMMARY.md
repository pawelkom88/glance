# Glance - Market Research, Pricing, and Marketing Strategy (Calibrated for a Solo Launch)

Date: February 26, 2026

## Executive summary

Glance has a real positioning gap to occupy: a **desktop-native, local-first, keyboard-first teleprompter** for live professional communication (not mobile recording, not AI content generation, not cloud collaboration).

The opportunity is real but niche:

1. The broad app-store audience is huge, but the **paid desktop teleprompter buyer segment is narrow**.
2. A realistic year-1 outcome for a solo launch is **cost coverage + small profitable niche**, not breakout scale.
3. You should price as a premium one-time utility (not cheap commodity, not subscription-level expensive).
4. Mac should be primary in the first release cycle. Microsoft Store should likely be a second-step channel unless Windows build/support overhead is already solved.

---

## Task 1 - Market Assessment

### 1) Total Addressable Market (TAM) estimate

### Evidence anchors

1. App-store distribution surfaces are large:
   - Apple reports **813M+ weekly App Store visitors** (2025 update).
   - Microsoft reports **250M+ monthly Microsoft Store users**.
2. Remote/hybrid work remains structurally persistent:
   - BLS 2024 annual average: **22.8%** of workers teleworked/worked at home for pay.
   - WFH Research (2025): average employee still works from home about **1 day/week**.
3. Remote-capable work is non-trivial:
   - NBER: about **37% of U.S. jobs** can be done at home.
4. Teleprompter category is proven (but fragmented and mostly mobile/cloud):
   - BIGVU listing claims **12M+ users**.
   - Teleprompter.com listing claims **5M+ downloads**.
   - Teleprompter Pro claims **141K+ five-star ratings worldwide**.

### TAM model (reasoned, not precise census)

For **dedicated teleprompter software** (all platforms):

1. Estimated active global teleprompter users at any point in time: **~1.0M to 3.0M**.
2. Estimated annual paid buyer pool (new + upgrades + reactivations): **~200K to 700K**.
3. Implied annual software spend (mix of subscriptions + one-time): **~$20M to $90M**.

For the **adjacent problem market** ("scripted delivery confidence tools" across calls, webinars, demos, coaching), the spend pool is larger, but most of that does not buy dedicated teleprompter products.

### Bottom line

A realistic TAM for dedicated teleprompter software is **tens of millions of dollars annually**, not billions. This is enough for a sustainable niche indie business, but not a default venture-scale market without major horizontal expansion.

---

### 2) Serviceable Market for Glance (SAM)

Glance intentionally excludes mobile, recording suite workflows, cloud collaboration, and hardware-rig workflows. That narrows reach and improves differentiation.

### Realistic serviceable slice

1. Share of dedicated teleprompter demand plausibly addressable by Glance positioning: **~8% to 20%**.
2. Implied addressable annual buyer pool: **~16K to 140K paid buyers/year** globally.
3. Initial reachable market for a solo launch (first 12-24 months, organic channels): **low thousands**, not tens of thousands.

### Primary buyer persona (most likely to pay)

**Persona: "Camera-facing knowledge worker" (sales/demo/coach/marketer)**

1. Day structure:
   - 4-10 calls or recorded segments per week.
   - Repeats core narratives (intro, value proposition, case studies, objection handling, webinar blocks).
2. Current tool behavior:
   - Sticky notes, Google Doc on second monitor, generic mobile/web teleprompter, or memorization.
3. Primary frustrations:
   - Eye contact breaks during high-stakes moments.
   - Losing place when conversation goes non-linear.
   - Mouse interaction interrupts delivery and cognitive flow.
   - Distrust of cloud storage for sensitive scripts.
4. Why Glance is better for this buyer:
   - Keyboard-only operation in live sessions.
   - Heading-based section jumps for non-linear conversations.
   - Local-first scripts (no account, no sync dependency).
   - Script editor + prompter in one focused desktop tool.

This persona values reliability and flow over feature breadth. That aligns directly with Glance.

---

### 3) Success-rate estimate - Mac App Store (2024-2025 reality)

### Market reality

1. App Store is very large, but discovery is competitive even in utilities/productivity.
2. Revenue distribution is highly skewed:
   - RevenueCat benchmarks show a median app around month-12 making **under $50/month**, with sharp winner-take-most dynamics.
   - Top 5% drastically outperform the median.

### Calibrated outcome bands for a solo, well-built paid productivity utility

Assuming one-time pricing around $20-$35 and no paid ads:

1. **3 months post-launch**
   - Floor: 30-120 paid downloads
   - Base: 120-350 paid downloads
   - Strong: 350-900 paid downloads
2. **6 months post-launch**
   - Floor: 80-250 cumulative paid downloads
   - Base: 250-700 cumulative paid downloads
   - Strong: 700-1,800 cumulative paid downloads
3. **12 months post-launch**
   - Floor: 150-500 cumulative paid downloads
   - Base: 500-1,500 cumulative paid downloads
   - Strong: 1,500-4,000 cumulative paid downloads

### Revenue interpretation

At $29.99 gross / ~$25.49 net after 15% commission:

1. 500 paid units/year ~ **$12.7K net**
2. 1,500 paid units/year ~ **$38.2K net**
3. 4,000 paid units/year ~ **$102K net**

### Probability of "sustainable" revenue

Define sustainable for this product as roughly **$1K+/month net** (about 40 paid sales/month at $29.99).

Practical estimate for new solo productivity launches: **~5% to 15%** reach that by month 12.

This is an inference from benchmark distributions and category behavior, not an official store metric.

---

### 4) Success-rate estimate - Microsoft Store

### Channel facts

1. Microsoft Store has scale (**250M+ monthly users**) and reduced publishing friction.
2. Windows is dominant on desktop share, but users have many software acquisition paths outside the Store.
3. Paid utility pricing on Microsoft Store is generally more price-sensitive and often lower than Mac expectations.

### What this means for Glance

For a professional, keyboard-first paid app:

1. Year-1 Microsoft Store contribution is likely **15% to 35% of Mac revenue** if launched with similar quality.
2. Discoverability can be weaker for niche paid productivity tools versus broad free utilities.

### Should a solo developer launch simultaneously?

**Usually no** unless Windows QA/support is already production-ready.

Recommended sequencing:

1. Launch Mac first.
2. Use first 6-10 weeks to validate positioning, pricing, and onboarding.
3. Launch Windows after fixing top 3 onboarding/UX/support issues seen in Mac reviews.

If Glance already has a stable Windows build and packaging pipeline, simultaneous launch can still be done, but expect lower ROI per support hour from Windows in year one.

---

### 5) Competitive risk assessment

## Risk 1: Incumbent adds keyboard-first + section-jump workflow

1. Likelihood: **Medium (30%-45%)**
2. Impact: **High**
3. Why it matters: this is Glance's strongest differentiation.
4. Mitigation:
   - Ship superior execution depth (custom shortcuts, heading map quality, speed controls).
   - Build brand association around "live non-linear call flow" before incumbents copy.

## Risk 2: Platform-level "speaker notes / teleprompter overlay" in Zoom/Teams/OS

1. Likelihood: **Low to medium (15%-25%)**
2. Impact: **Very high**
3. Why it matters: core job could be partially commoditized.
4. Mitigation:
   - Focus on script-workspace + jump workflow + keyboard precision, not only scrolling text.
   - Target power users needing advanced control beyond default platform overlays.

## Risk 3: Low-price clone pressure (new indie desktop apps)

1. Likelihood: **High (50%-70%)**
2. Impact: **Medium to high**
3. Why it matters: category is easy to clone superficially; cheap one-time competitors already exist.
4. Mitigation:
   - Sell reliability and workflow outcomes, not feature checklist.
   - Strong onboarding and "first successful live call" activation.
   - Keep quality bar visibly above commodity alternatives.

---

## Task 2 - Pricing Recommendation

### Recommended prices (one-time, per platform)

1. **Mac App Store: $29.99**
2. **Microsoft Store: $24.99**

### Why these exact numbers

1. They sit far below heavy subscription alternatives (often $90/year+), avoiding subscription backlash.
2. They sit above low-end commodity one-time tools ($6.99-$9.99), signaling professional positioning.
3. They are still low-friction for professionals who see this as a work expense rather than a major purchase decision.
4. Mac can support a higher anchor due to stronger paid-app behavior in Apple ecosystems.

---

### Trial/free tier recommendation

Best option for conversion confidence:

1. Ship as a free download with a **time-limited full-feature trial** (or strongly limited free mode) and a one-time unlock.

If implementing timed trial logic creates too much launch overhead, fallback:

1. Launch paid upfront with an intro price and compensate with clear demo assets (video + GIF + use-case screenshots).

For this category, some form of try-before-buy is strongly advisable because teleprompter usefulness is highly experiential.

---

### Sales needed to cover $500/year direct expenses

Assumptions:

1. Apple/Microsoft commission: 15%
2. Expense target: $500/year

Calculations:

1. At $29.99: net per sale ~ $25.49 -> **20 sales** to cover $500
2. At $24.99: net per sale ~ $21.24 -> **24 sales** to cover $500

Cost coverage threshold is very low. The hard part is not breakeven; it is consistent discoverability and review velocity.

---

### Launch pricing strategy (first 90 days)

1. Mac intro price: **$19.99** for 90 days, then **$29.99**.
2. Windows intro price: **$17.99** for 90 days, then **$24.99**.

Why:

1. Increases early conversion while you have no ratings density.
2. Creates urgency for early adopters.
3. Helps seed reviews and social proof before full-price phase.

---

### "Lifetime" vs "per-platform" licensing

Recommendation: **per-platform pricing**.

Rationale:

1. Store ecosystems are separate and local-first architecture usually means no universal account layer.
2. Operationally simpler for a solo developer.
3. Avoids support complexity from cross-store entitlement disputes.

If you later build your own licensing backend, you can offer an optional cross-platform "creator license" outside stores. Do not block initial launch on this.

---

## Task 3 - Marketing Strategy (Solo, No Paid Ads)

## Strategic principle

Do not market "teleprompter app."
Market: **"stay on message on live calls without breaking eye contact."**

That outcome is what your target buyer pays for.

---

### Phase 1 - Pre-launch (8 weeks)

### Week 1-2: Foundations

1. Landing page with one core promise:
   - "The local-first, keyboard-first teleprompter for live calls."
2. Waitlist capture with one qualifying question:
   - "What do you use it for? (sales demos / webinars / coaching / interviews / presentations)."
3. Produce 3 short assets (10-20 sec each):
   - Keyboard-only flow.
   - Section-jump in a non-linear call.
   - Local-first/offline proof.

### Week 3-4: Community seeding (value-first posts, not launch spam)

Target subreddits (post tactical workflows, not links first):

1. `r/publicspeaking`
2. `r/sales`
3. `r/Entrepreneur`
4. `r/youtubers`
5. `r/contentcreators`

Target communities/Slack groups:

1. RevGenius (sales/revenue community)
2. Product Marketing Alliance community
3. Superpath (content marketers)
4. Pavilion (if member access)

LinkedIn audience targets:

1. Account executives / solutions consultants
2. Sales enablement managers
3. B2B marketers running webinars
4. Coaches/trainers delivering live sessions

YouTube intent keywords to target in title/description of short demos:

1. "teleprompter for zoom meetings"
2. "teleprompter for microsoft teams"
3. "how to keep eye contact on video calls"
4. "sales demo script without sounding scripted"
5. "markdown teleprompter for presentations"

### Week 5-8: Build launch proof

1. Recruit 20-40 beta users from waitlist.
2. Target at least 10 written testimonials tied to concrete outcomes.
3. Publish 2 case-style posts:
   - "How I handled non-linear Q&A with section jumps."
   - "Why local-first matters for client-sensitive scripts."

Goal before launch: small but credible social proof, not vanity audience size.

---

### Phase 2 - Launch week (7-day sequence)

## Day 1

1. Publish Mac App Store listing.
2. Launch post on LinkedIn + X + relevant communities where rules allow.
3. Email waitlist with intro-price expiry date.

## Day 2

1. Publish "keyboard-first demo" video.
2. Ask beta users for first wave of App Store reviews.

## Day 3

1. Product Hunt launch (maker comment should focus on why local-first + keyboard-first exists).
2. Expectation: useful awareness and backlinks, not guaranteed large install volume.

## Day 4

1. Post teardown: "5-step call flow setup" with screenshots.
2. Respond to every public comment/review.

## Day 5

1. Publish use-case focused post for sales teams.
2. Publish separate one for coaches/educators.

## Day 6

1. Ship first quality update based on launch feedback.
2. Announce "we ship fast" with changelog screenshot.

## Day 7

1. Recap post with learnings + roadmap snapshot.
2. Second review prompt only for users who completed multiple sessions successfully.

---

### App Store page that converts (critical)

### Screenshot sequence (recommended order)

1. "Run your script without touching the mouse."
2. "Jump between sections instantly during live Q&A."
3. "Write and prompt in one markdown workspace."
4. "Your scripts stay local. No account. No cloud."
5. "Built for Zoom, Teams, Meet, webinars, and demos."

### Preview video focus

1. First 5 seconds: pain point (eye contact break + mouse scrambling).
2. Next 10 seconds: keyboard flow and section jumps.
3. Final 10 seconds: local-first trust + call-ready setup.

---

### Phase 3 - Ongoing (months 2-6)

Focus on only three highest-leverage loops:

1. **ASO iteration loop (monthly)**
   - Update keywords, subtitle, screenshots by best-converting use case.
   - Keep one screenshot dedicated to section-jump differentiation.
2. **Review engine loop (weekly)**
   - Trigger rating prompt after successful sessions, not at first launch.
   - Reply to all critical reviews within 24-48h.
3. **Proof asset loop (biweekly)**
   - Convert user feedback into short clips/GIFs for landing and store page.
   - Build a small, compounding testimonial library.

This is enough for a solo founder; do not over-expand into high-frequency content schedules.

---

## Specific guidance requested

### ASO keyword strategy (realistic ranking targets)

Do not center on broad "teleprompter" initially.
Start with intent-rich long-tail terms:

1. teleprompter for zoom
2. teleprompter for teams
3. video call teleprompter
4. presentation teleprompter
5. markdown teleprompter
6. speaker notes teleprompter
7. teleprompter for webinars
8. teleprompter for sales demos

Use product subtitle to combine outcome + context (example):

"Keyboard-first teleprompter for Zoom, Teams, and webinars."

### Privacy/local-first message

Message outcome, not ideology:

1. "Your scripts stay on your device."
2. "No account required."
3. "Works offline when your network is unstable."

Avoid framing that sounds anti-cloud in general; frame as reliability + confidentiality in live professional work.

### Keyboard-first demonstration

Best medium: short video + GIF loop.

1. Side-by-side: mouse workflow vs shortcut workflow.
2. Overlay keystrokes on screen so non-keyboard users see speed benefit instantly.
3. Include one clip where section jump saves a real non-linear conversation.

### Apple editorial featuring

Yes, pursue it, but treat as upside, not core plan.

1. Submit featuring nominations through App Store Connect for launch and major updates.
2. Pitch clear story angle: "desktop, local-first speaking utility for modern hybrid work."
3. Keep expectations low; editorial is high-variance.

---

## Honest constraint: what organic discovery can achieve in 2025/2026

With no paid ads and no external PR support:

1. **Floor (common)**: 100-400 paid downloads in year 1.
2. **Base (good execution)**: 500-1,500 paid downloads in year 1.
3. **Ceiling (excellent execution + community traction)**: 1,500-4,000 paid downloads in year 1.

Thousands in week one are unlikely without pre-existing audience leverage.

For Glance, organic can absolutely cover costs and build a durable niche product business. It is unlikely to create immediate large-scale growth without additional distribution leverage.

---

## Sources

1. Apple App Store weekly visitors (813M): https://www.apple.com/newsroom/2025/05/the-app-store-prevented-more-than-9-billion-usd-in-fraudulent-transactions/
2. Microsoft Store monthly users (250M): https://blogs.windows.com/windowsdeveloper/2025/06/05/leveling-up-your-microsoft-store-on-windows-experience/
3. BLS telework annual average (22.8%, 2024): https://www.bls.gov/lau/state-telework-table-2024.htm
4. WFH Research persistence data (around 1 WFH day/week): https://wfhresearch.com/wp-content/uploads/2025/10/Tapping-Business-and-Household-Surveys-to-Sharpen-Our-View-of-Work-from-Home-22-September-2025.pdf
5. NBER work-from-home feasibility (37% U.S. jobs): https://www.nber.org/papers/w26948
6. Microsoft Teams MAU reference (320M): https://www.microsoft.com/en-us/investor/events/fy-2024/earnings-fy-2024-q1
7. Teleprompter Pro pricing ($59.99/year, $159.99 lifetime): https://teleprompterpro.com/pricing
8. Teleprompter app listing evidence (ratings + IAP pricing): https://apps.apple.com/us/app/teleprompter/id941620509
9. Teleprompter.com pricing: https://www.teleprompter.com/pricing
10. BIGVU listing evidence (12M+ users): https://apps.apple.com/us/app/bigvu-teleprompter-captions-ai/id1124958568
11. VODIUM pricing: https://vodium.com/pricing
12. Virtual Teleprompter Pro Mac one-time price ($6.99): https://apps.apple.com/us/app/virtual-teleprompter-pro/id1591588588
13. RevenueCat subscription benchmark distributions: https://www.revenuecat.com/state-of-subscription-apps-2024/
14. App Store featuring nomination flow: https://developer.apple.com/help/app-store-connect/manage-featuring-nominations/nominate-your-app-for-featuring

---

## Assumptions and confidence notes

1. Store-level success-rate estimates are directional because Apple and Microsoft do not publish conversion/survival metrics for new indie productivity launches.
2. RevenueCat data is subscription-heavy and mobile-inclusive; it is used as a conservative benchmark for market skew, not a perfect proxy for one-time desktop utilities.
3. TAM/SAM values are modeled estimates based on channel scale, remote-work persistence, and competitor adoption signals; treat as planning ranges, not audited market sizes.
