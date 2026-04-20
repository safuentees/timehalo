# Officehours Project: How to Start Building

This is not a step-by-step tutorial. It is a guide for how to approach
building Officehours from scratch — how to think before coding, what to
plan, what NOT to plan, and how to use Cal.com as a reference without
copying from it.

The roadmap next to this file is the technical plan. This file is the
human version. When you sit down to build and the roadmap starts feeling
like a wall of acronyms, come here instead.

---

## Table of Contents

1. [The Approach](#1-the-approach)
2. [Before Writing Any Code](#2-before-writing-any-code)
3. [User Stories](#3-user-stories)
4. [Page Sketches](#4-page-sketches)
5. [Data Shape](#5-data-shape)
6. [The Build Cycle](#6-the-build-cycle)
7. [Phase Map](#7-phase-map)
8. [What NOT to Plan Yet](#8-what-not-to-plan-yet)
9. [How to Use Cal.com as a Reference](#9-how-to-use-calcom-as-a-reference)
10. [A Note on Scope](#10-a-note-on-scope)
11. [If You Get Stuck](#11-if-you-get-stuck)

---

## 1. The Approach

The generic approach (step 1: schema, step 2: API, step 3: UI — here is
all the code) treats building like following a recipe. It teaches you to
copy, not to think.

Instead: **one user story at a time, end to end.** Pick the simplest
thing a host or visitor can do, build it from database to UI, get it
working, then pick the next story. The system grows organically, driven
by what the user needs — not by a pre-planned architecture diagram.

A host signing up, drawing a weekly window, and a visitor booking a
slot — that is the product. Everything else is decoration on top of
that loop.

---

## 2. Before Writing Any Code

Experienced developers do not start with code. They start with three
things on paper (literally paper, a whiteboard, or a plain text file):

1. **User stories** — what does the host and the visitor actually do?
2. **Page sketches** — what does each of them see?
3. **Data shape** — what needs to be stored?

That is it. No architecture diagrams. No package structure. No tech
decisions beyond "Next.js + Prisma + TypeScript" (which you already
know).

---

## 3. User Stories

Not features. Not technical specs. Plain sentences written from the
user's perspective:

### MVP (build these first)

- A host signs up with an email and password and lands on an empty
  dashboard
- A host picks a handle like `alex` that becomes their public URL
- A host draws a weekly window — Mondays 2pm–5pm, Wednesdays 10am–noon —
  and saves it
- A host publishes their office hours page and shares the URL with
  students
- A visitor opens `officehours.app/h/alex` and sees Alex's name, a short
  bio, and a list of upcoming 15-minute slots
- A visitor taps an open slot and sees it marked as "holding for you"
- A visitor fills in their name, email, and one-sentence question and
  hits book
- A visitor sees a confirmation page with the slot time and a note that
  Alex will confirm shortly
- A host logs into their dashboard and sees the new booking waiting for
  them
- A host taps "confirm" and the booking moves from pending to confirmed

### Phase 2 (build these after MVP works)

- A host adds a one-off blackout day because they are on vacation next
  Tuesday
- A host adds an extra window on a specific date for a one-time event
- A visitor opening the page sees the queue update live as others grab
  slots ahead of them
- A host keeps a dashboard tab open and watches new bookings appear
  without refreshing
- A visitor can cancel a slot they booked by clicking the link in their
  confirmation email
- A host can cancel a booking from the dashboard and the visitor is
  notified
- A host can reschedule a booking by dragging it to a new open slot
- A visitor on Tokyo time sees slots in Tokyo time even though the host
  is in New York
- A host reorders the FAQ cards on their profile by dragging them
- A host sees a count badge on their dashboard showing how many
  bookings are waiting for confirmation

### Phase 3 (build these when Phase 2 is solid)

- A host invites a co-host by email so someone else can help confirm
  bookings
- A co-host accepts the invite and can confirm bookings but cannot
  change the schedule
- A host registers a webhook URL and every new booking gets POSTed to it
- A host tests their webhook from a button in the dashboard and sees a
  sample payload arrive
- A visitor who books repeatedly is recognized and their name is
  pre-filled
- A host can mark a past booking as "no-show" so their analytics aren't
  skewed
- A visitor gets a reminder email an hour before their slot
- A host sees a simple log of which webhooks fired and which failed

### Phase 4 — Stretch (only if earlier phases feel easy)

- A visitor joins a group slot where three people can book the same
  time together
- A host sets up a recurring slot that repeats every other week
- A visitor who missed a slot because it filled up gets added to a
  waitlist
- A host sees a simple weekly chart of bookings across their windows
- A host sets the intake form per window — one asks for a project link,
  another asks for a topic
- A visitor books a paid slot and pays with a card before confirmation

Each story is a self-contained unit of work. You know you are done with
a story when you can do the thing described in the sentence.

---

## 4. Page Sketches

Not wireframes. Not Figma. Just enough to know what pages exist, what
data each page needs, and what actions the user can take.

```
PUBLIC HOST PAGE:  officehours.app/h/alex
+------------------------------------------+
|  Alex Chen                                |
|  TA office hours, 15-min drop-ins.        |
+------------------------------------------+
|  Queue: 2 people holding                  |
|  Next free slot: 2:45pm                   |
+------------------------------------------+
|  Monday 2:00pm   [open]                   |
|  Monday 2:15pm   [held by someone]        |
|  Monday 2:30pm   [open]   <-- clickable   |
|  Monday 2:45pm   [open]                   |
|  Wednesday 10:00am [open]                 |
+------------------------------------------+
|  FAQ:                                      |
|  - Bring your code, not just a question   |
|  - Be ready to share your screen          |
+------------------------------------------+

VISITOR INTAKE PAGE (after tapping a slot):
+------------------------------------------+
|  You're holding Monday 2:30pm             |
|  (Slot releases in 9:47)                  |
+------------------------------------------+
|  Name:      [_____________]                |
|  Email:     [_____________]                |
|  Question:  [_____________]                |
|             [_____________]                |
|                                            |
|             [Cancel hold] [Book this slot] |
+------------------------------------------+

VISITOR CONFIRMATION PAGE:
+------------------------------------------+
|  You're booked!                            |
|                                            |
|  Monday Nov 4, 2:30pm with Alex Chen       |
|                                            |
|  Alex will confirm shortly. We'll email    |
|  you when they do.                         |
|                                            |
|  [Cancel this booking]                     |
+------------------------------------------+

HOST DASHBOARD:  officehours.app/dashboard
+------------------------------------------+
|  Alex's office hours           [Settings] |
+------------------------------------------+
|  [Pending (3)] [Confirmed] [Past]         |
+------------------------------------------+
|  Monday 2:30pm  | Maya   | "Help with    |
|                           Redux state"    |
|                           [confirm] [x]   |
|  Monday 2:45pm  | Jordan | "Code review  |
|                           my PR"          |
|                           [confirm] [x]   |
+------------------------------------------+
|  LIVE QUEUE                                |
|  - Maya just held 2:30pm (3 min ago)      |
|  - Jordan just booked 2:45pm (1 min ago)  |
+------------------------------------------+

HOST SCHEDULE EDITOR:  officehours.app/schedule
+------------------------------------------+
|  Weekly availability                       |
+------------------------------------------+
|  Monday    [on]  2:00pm - 5:00pm [x] [+]  |
|  Tuesday   [off]                          |
|  Wednesday [on]  10:00am - 12:00pm [x][+] |
|  Thursday  [off]                          |
|  Friday    [off]                          |
|                                            |
|  Slot length:   [15 minutes]              |
|  Buffer:        [0 minutes]               |
|  Queue size:    [3]                       |
|                                            |
|  [Copy Monday to: Wed Fri]                |
|                                            |
|  Overrides:                                |
|  - Tue Nov 12  [blackout]   [x]           |
|  - Sat Nov 16  2pm - 4pm    [x]           |
|                                            |
|                                [Save]      |
+------------------------------------------+

HOST FAQ EDITOR:
+------------------------------------------+
|  Profile cards         [+ Add card]       |
+------------------------------------------+
|  ::  Bring your code                       |
|      Show up with something to show...    |
|      [edit] [delete]                       |
|  ::  Be ready to share                     |
|      Screen share works best...            |
|      [edit] [delete]                       |
+------------------------------------------+
```

These sketches tell you what pages exist, what each page displays, and
what the user can do on each one. That is enough to start.

---

## 5. Data Shape

One question: "what do I need to save so that my user stories work?"

A host has a profile with a name, a handle (the URL slug), a short bio,
and a timezone. A host has availability windows — a weekly rule like
"Mondays 2pm to 5pm, Wednesdays 10am to noon." A host has date
overrides — specific dates where normal availability does not apply,
either because they are blacking out the day or adding an extra window.

A visitor who taps a slot creates a hold, which is a temporary
reservation tied to a cookie in their browser. A hold expires after
ten minutes if the visitor walks away.

A visitor who fills in the intake form and submits creates a booking,
which is a confirmed visit tied to a specific host and a specific time
range. A booking starts as pending until the host confirms it.

A host has FAQ cards (short titles and bodies) that show up on their
public page.

Later, a host can have co-hosts — other users allowed to confirm
bookings on their behalf. Later, a host can register webhook URLs
that fire whenever a booking is created or confirmed.

Do NOT write the Prisma schema yet. This is just a sketch of what data
exists in the world. The actual schema comes when you sit down to build
story one.

---

## 6. The Build Cycle

For each user story:

```
Pick the smallest story you can think of
    |
    v
Ask: what do I need for this to work?
    - A database table or field?
    - An API route?
    - A UI page or component?
    |
    v
Build the minimum for this story to work end to end
    |
    v
Get stuck?
    - "How did Cal.com do this?" -> check the specific file, not the whole codebase
    - "How does this library work?" -> check docs (Context7)
    - "I have no idea" -> research, experiment, break things
    |
    v
Story works end-to-end? -> move to the next one
```

**The key rule: do not build anything that a current story does not
require.** No live queue until a story demands it. No webhooks until a
story demands it. No co-hosts until a story demands it.

---

## 7. Phase Map

### Foundation

Set up the project. Next.js app, database connected, auth working. Get
`pnpm dev` to show a page where you can log in. Nothing else.

### Core loop: one host, one visitor, one booking

This is the minimum viable product. A host signs up, picks a handle,
draws one weekly window, and publishes their page. A visitor opens the
page, sees slots, taps one, fills in the intake, and books. The host
sees the booking and confirms it. That is the entire loop.

At this point you have a working Officehours. Test it. Use it. Book a
slot yourself. Feel where it is awkward.

### Live feel

The public page updates live as other visitors grab slots. The host
dashboard updates live as new bookings come in. The queue on the
public page shows "2 people ahead of you" in real time. This is what
makes the product feel alive.

### Richer scheduling

Date overrides. Cancel. Reschedule. Timezone display for visitors in
different zones. Reminder emails an hour before the slot. The schedule
editor gets nicer: drag ranges, copy one day to others, a preview of
the next two weeks.

### Serious product

Co-hosts. Webhook registration. A role system where co-hosts can
confirm but not edit windows. A simple log of which webhooks fired.
This is where the product graduates from toy to tool.

### Stretch

Group slots, recurring events, waitlists, per-window intake forms,
paid bookings. Only touch these if the earlier phases feel easy. None
of them are required for the product to be useful.

---

## 8. What NOT to Plan Yet

Do not think about these until a user story forces you to:

- The notification system — you don't need it until someone books
- Webhook signing — you don't need it until the first webhook exists
- Timezone math — you don't need it until the first booking is stored
- The host analytics page — you don't need it until there are five
  real bookings to analyze
- The co-host permission model — you don't need it until two people
  share a page
- The intake form template system — one hardcoded intake form is fine
  until a host asks for a second shape
- The retry strategy for failed webhooks — you don't need it until a
  webhook has failed
- Caching the public page — you don't need it until the page feels slow
- Rate limiting — you don't need it until a bot hits you
- Deployment, CI/CD, monitoring — you don't need any of this until the
  app works on your laptop

These are all real things you will eventually need. But planning them
before a visitor can book a single slot is premature. You will make
better decisions about caching after you have felt the page being slow.
You will make better decisions about the notification system after you
have watched a real booking happen and noticed the silence.

**Let the pain guide the architecture.** Build the simple thing. Feel
what is wrong with it. Fix that. That is how real systems evolve.

---

## 9. How to Use Cal.com as a Reference

Cal.com is on your disk. It is a real production scheduler with seven
years of engineering in it. That is useful — and dangerous.

The useful part: when you are building something specific and you get
stuck, Cal.com has almost certainly solved the exact problem you are
stuck on. The dangerous part: Cal.com is huge, and reading it front to
back before you start will drown you in details that don't apply yet.

The rule: **Cal.com shows you HOW a thing is built, not WHAT to build.
Read it when stuck. Not before starting.**

When you are building the schedule editor and wondering how to let a
host copy Monday's hours to Wednesday and Friday, go read Cal.com's
schedule component. When you are building the slot hold and wondering
how to prevent two visitors from grabbing the same slot at once, go
read the part of Cal.com where they book a seat inside a transaction.
When you are building webhooks and wondering how to sign the payload,
go read the one function in Cal.com that does that.

Not before. After. Try your own version first. Then read Cal.com's,
notice what they worried about that you didn't, and update yours.

The difference between copying and referencing: copying is "let me
grab Cal.com's exact code and paste it in." Referencing is "Cal.com
stores time ranges as minute-integers instead of Date objects because
dates break across daylight saving — let me do the same." One gives
you code that you don't understand. The other gives you the idea,
which you can implement yourself.

Beware the "read the whole thing first" trap. Cal.com has thousands
of files. You will not read them all before building. You will read
the specific file that answers your specific question, take a couple
of notes, and close the tab. That is the pattern.

---

## 10. A Note on Scope

This is a learning project. It does not need to be a product. It
does not need to launch. It does not need users. It needs to teach
you how to build.

The goal is skill, not a launch. A small, coherent Officehours that
one host and one visitor can use end-to-end is worth more than an
ambitious half-finished Officehours with twelve features that mostly
don't work.

Ship the small version first. Use it yourself. Book a fake slot with
a fake email. Confirm it from the dashboard. Feel the loop close.
That feeling — that is what you are chasing. Everything else is
extra.

Cal.com took years. Officehours can take weeks because Officehours
is one-tenth of Cal.com. Respect the smallness. It is a feature, not
a limitation.

---

## 11. If You Get Stuck

A story feels too big. What do you do?

Break it smaller. Always smaller. The smallest buildable version of
a story is always smaller than you think.

"A visitor books a slot" feels big. Break it: a visitor sees one
hardcoded slot. That is the first story. Then: a visitor taps the
slot and sees their name echo back. Then: a visitor types their name
and it gets saved somewhere — anywhere, even `console.log`. Then:
the host sees that name on their dashboard. Each of those is a day
of work, not a week.

If you are staring at a blank file and don't know where to start, the
story is too big. Cut it in half. If it is still too big, cut it in
half again. There is always a smaller version.

If you are staring at Cal.com trying to understand a 2000-line
booking handler, the file is too big. You do not need all of it. You
need the one idea that applies to your story. Read until you find
that idea, close the tab, write your own 50 lines.

If you are stuck on a tool — the database, a library, a config —
stop, look up the docs, run a tiny test in isolation. Do not try to
debug it inside the half-built feature. Pull the question out, answer
it in a one-file sandbox, then bring the answer back.

The gap between "I understand it when I read it" and "I can build it
myself" is only closed by writing code, getting stuck, and solving
problems. You have studied enough. You have the roadmap. You have
Cal.com as a reference.

Start with one story: "A host signs up and lands on an empty
dashboard." Build it. Get stuck. Look things up. Solve it. That is
the learning.
