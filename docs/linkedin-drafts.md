# LinkedIn drafts

Drafts only. Nothing has been posted or sent. Replace the screenshot/video attachment with the matching artifact before publishing.

Suggested first post: draft 1 with the 42-second walkthrough. Intended audience: food-truck/mobile-kitchen operators and equipment-service teams.

## 1 — The staff workflow

A maintenance dashboard only helps when the person doing the work can keep it up to date.

For VanLog, I built a short mobile workflow: open an equipment QR link, enter the cumulative hours, review the increase, and save. When a task is due, staff can confirm the service and its cost from the same record.

The owner sees the resulting maintenance queue, history and cost report.

This is a self-initiated ConsoleLog Studio portfolio project with fictional food-truck data. It explores the workflow; it is not a claim of preventing a real equipment failure.

Try both roles: https://vanlog-consolelog.pages.dev

If your team tracks equipment maintenance, which part still happens on paper?

Attachment: `assets/equipment-mobile.png` or `assets/walkthrough.webm`.

## 2 — The less visible part

What happens if a staff member taps Save, the database commits, and the response never reaches their phone?

In VanLog, the form keeps the entered values and retries the same request identity. The server returns the original result instead of creating another service record or counting the same cost twice.

Competing readings also carry the version the person reviewed. One succeeds; the other asks for a refresh and confirmation. Those cases are covered by hosted database and browser checks, alongside a backup restore rehearsal.

VanLog is a self-initiated ConsoleLog Studio project: Next.js, Cloudflare Pages Functions and hosted Supabase. The dataset is fictional and shared.

Source and verification notes: https://github.com/shawalkabirchy/vanlog

Attachment: walkthrough clip showing the staff flow, or a small request/retry diagram from the README.

## 3 — The owner view

I wanted VanLog's owner view to answer three practical questions:

What is overdue? What needs attention next? What did maintenance cost?

The dashboard orders tasks by urgency. Equipment pages retain readings and service history. The cost report groups completed work by equipment and supports CSV export and browser Print/Save PDF.

There is also a staff role with a smaller set of actions. Hiding controls is only the interface; the backend enforces the same permissions on direct requests.

This is a ConsoleLog Studio portfolio concept built with synthetic food-truck data, not a commissioned client result. It is ready to explore here: https://vanlog-consolelog.pages.dev

Attachment: `assets/dashboard-desktop.png`.
