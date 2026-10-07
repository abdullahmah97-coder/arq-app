# مكتب أرك أب على الويب | ARQ web office — database API

## بالعربي
صفحة «مكتب أرك أب» على الويب (داخل claude.ai) ما تكلّم القاعدة مباشرة: كل طلب يمر من موصّل Supabase (`execute_sql`)
بصلاحية `postgres` وبدون توكن مستخدم. الترحيل `supabase/migrations/20261008000890_office_web.sql` يضيف:
- `office_overview(أيام)`: لقطة وحدة لكل أقسام التطبيق — أعداد وقوائم قصيرة بس، بدون أي بيانات خاصة.
- مخطط `office_admin`: إجراءات المالك من الويب (اعتماد أو رفض اقتراح وكيل، قرار طلب شريك، حالة بلاغ، تشغيل وكيل).
  مخفي عن التطبيق تماماً (لا anon ولا authenticated)، وكل دالة تشتغل «بهوية المالك» فنفس دوال التطبيق وسجل الإجراءات يشتغلون.
- `office_agent_key_ok`: دالة الخادم `office-agent` تتأكد من مفتاح الويب (سر في vault) قبل ما تشغّل وكيل.

مرة وحدة لكل مشروع (SQL Editor): المفتاح `office_agent_key` ينشئه الترحيل، والرابط تضيفه بنفسك:
```sql
select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/office-agent', 'office_agent_url');
```
الأرقام والأشكال تحت بالإنجليزي بالحرف — الصفحة تنبني من هذا الملف.

## English

Everything below is exact: key names, types and error codes are what the SQL returns. The page is built from this file alone.

---

## 1. Transport and conventions

**How to call.** The page sends SQL through the viewer's Supabase connector: MCP tool `execute_sql` with
`{ project_id: "hfplqbnbuskiaeblxpfo", query }`. It runs as the `postgres` role with no JWT, so `auth.uid()` is null and
`current_setting('role')` is `'none'`. That is the only non-admin caller the overview accepts, and the only caller that can
reach `office_admin` at all.

The result is a JSON array of rows. Each call below returns **one row with one column**, so read `rows[0].<alias>`:

```sql
select office_overview(7) as o;                       -- rows[0].o  = the overview object (section 3)
select office_admin.tasks(150) as t;                  -- rows[0].t  = array of office_tasks rows (section 4.3)
select office_admin.apply('<task-uuid>'::uuid, '<final-json>'::jsonb) as r;   -- rows[0].r = {"ok": true}
select office_admin.reject('<task-uuid>'::uuid, 'Not now') as r;               -- rows[0].r = {"ok": true}
select office_admin.review('store', '<item-uuid>'::uuid, 'reject', 'Please add a logo') as r;
select office_admin.report('<report-uuid>'::uuid, 'seen', 'Thanks, we are on it') as r;
select office_admin.run_agent('marketing', 'Ramadan offer for women') as r;    -- rows[0].r = {"queued": true, "request_id": 42}
```

Run the overview and the tasks list as **two separate queries**: if one fails (for example `choose_admin` from `tasks`),
the other still renders.

**Literals.** Build every argument with a strict helper: ids must match the uuid regex and are sent as `'<uuid>'::uuid`;
enums are checked against the allowed lists below; text is a standard string literal with `'` doubled; JSON is
`'<json with ' doubled>'::jsonb`. Never paste raw input into SQL.

**Errors.** Every failure is a Postgres exception whose message is a short code (`not_waiting`, `bad_input`, …). The
connector reports it as a tool error with that text inside (for example `ERROR: not_waiting`). Match the code with
`/\b(code)\b/` against the error text. Two messages are not codes from this API: `permission denied …` (the connector is
not running as `postgres`) and `… read-only transaction` (the connector is in read-only mode, so actions can't run).

**Transactions.** One `execute_sql` call is one transaction. Each action is all-or-nothing: any error rolls back
everything that call did. Actions need a connector that is **not read-only** (a read-only connector can still read the
overview).

**Value conventions.**
| Kind | JSON form |
|---|---|
| count | integer ≥ 0 (never null) |
| money | number in SAR (may have decimals, e.g. `199.5`). There are **no payments in the app**: every SAR figure is a booked value or a list price, never revenue. |
| date | string `YYYY-MM-DD`, a Riyadh calendar day |
| timestamp | ISO 8601 string with an offset, e.g. `2026-10-07T03:35:47.826+00:00` (use `Date.parse`) |
| id | uuid string |
| percent | integer 0–100 |
| list | JSON array, already sorted and capped; `[]` when empty (never null) |
| object/number/string marked “or null” | explicitly `null` when there is nothing |

JSON object keys come back in Postgres `jsonb` order (shorter keys first), not in the order shown here. Read by name.

**Windows.** `p_days` is clamped to 1–90 (`null` → 7). With `D` = today in Riyadh (`app_today()`):
- **today**: from Riyadh midnight of `D` until now.
- **cur** (current period): the last `p_days` Riyadh days **including today**: days `D-(p_days-1)` … `D`.
- **prev** (previous period): the `p_days` days before that: days `D-(2·p_days-1)` … `D-p_days`.
- **daily series**: one entry per day of **cur**, oldest first (`p_days` entries); the last entry is today.
  Each series sums to the matching `cur` count (except `active_users.daily`, which counts distinct users per day).
- **cur/prev on `*_7d`, `*_over_*h`, `upcoming`, `present_now`**: these are relative to *now* (e.g. next 7×24 hours).
- `prev` for “by event date” metrics (offer/ad/nudge events) uses the event's Riyadh `day`.

The current period includes today so far, so the last day of `cur` is partial while `prev` is full: show deltas with that in
mind.

**Admins.** Accounts in `app_admins` (the owner) are **excluded** from user metrics: everything in `activity` except
`errors`, the counts in `community` (posts, comments, reactions, follows, friend requests, chats), and `store.rewards`.
They are **included** in `activity.errors` (crashes on the owner's phone are real bugs), `ai.usage` (`office` is the owner's own
agent usage) and all business counts (bookings, stores, partners, reports, marketing).

---

## 2. Desks

The web office has 13 desks. Agent desks can run `office_admin.run_agent`; the others return `agent_unavailable`.

| desk id | Agent | Main overview data |
|---|---|---|
| `lead` | yes (`daily_brief`) | `office`, everything |
| `clubs` | yes (`review_partner`, club) | `partners` (kind `club`) |
| `stores` | yes (`review_partner`, store) | `partners` (kind `store`), `store` |
| `coaches` | yes (`review_partner`, coach) | `partners` (kind `coach`), `bookings.coaching` |
| `care` | yes (`review_partner`, center / venue) | `partners` (kinds `center`, `venue`), `bookings.recovery`, `bookings.venue_bookings` |
| `reports` | yes (`triage_report`) | `reports` |
| `marketing` | yes (`draft_nudge`; takes a brief) | `marketing` |
| `ai` | yes (`review_ai_limits`) | `ai` |
| `users` | no | `activity.users`, `activity.partner_intent` |
| `activity` | no (web only) | `activity` |
| `bookings` | no (web only) | `bookings` |
| `orders` | no (web only) | `store` |
| `community` | no (web only) | `community` |

`office_tasks.desk` only ever holds `lead`, `clubs`, `stores`, `coaches`, `care`, `reports`, `marketing`, `ai` or `users`.

---

## 3. `public.office_overview(p_days integer default 7) returns jsonb`

**Who may call it:** an app admin (`is_admin()`, JWT session), or a database session with no user token whose role is
`none`, `postgres` or `service_role` (the Supabase connector, the SQL editor, the server). Anyone else gets
`not_allowed`. `anon` has no execute grant at all (`permission denied`).

**Errors:** `not_allowed`.

**Never returned:** message, chat, comment, post or tip text; captions; any note or free-text field (booking, membership,
coach, center, meal-subscription, review, flag notes); phone numbers; emails; coordinates or distances; health values
(weights, InBody, kcal, steps, sleep, heart data); payment data (there is none); documents and file paths; discount codes;
member names or contacts; who chats with whom. The only free text is the first 140 characters of **tester reports**
(`reports.latest_new[].message`), which the owner already reads in the app.

### 3.0 Top level — exactly these 10 keys, each an object

```
{ meta, activity, bookings, store, community, partners, reports, marketing, ai, office }
```

### 3.1 `meta`
| key | type | meaning |
|---|---|---|
| `generated_at` | timestamp | when the snapshot was computed (DB `now()`) |
| `days` | int | the clamped `p_days` |
| `today` | date | Riyadh today (`D`) |
| `cur_from` | date | first day of the current period (`D-(days-1)`); `cur` runs to `today` |
| `prev_from` | date | first day of the previous period |
| `prev_to` | date | last day of the previous period (`cur_from - 1`) |
| `timezone` | string | always `"Asia/Riyadh"` |

### 3.2 `activity` (admins excluded except in `errors`)
| key | type | meaning |
|---|---|---|
| `users.total` | int | all accounts |
| `users.trainees` | int | `account_type = 'trainee'` (includes people who chose a partner kind but are not approved yet) |
| `users.partners` | int | `account_type <> 'trainee'` (approved partners) |
| `users.by_account_type` | object | `{trainee, club, coach, store, restaurant, center, venue}`: int each |
| `signups.today` / `.cur` / `.prev` | int | new accounts (profile created) |
| `signups.daily` | `[{day: date, n: int}]` | sign-ups per Riyadh day of cur |
| `active_users.today` / `.cur` / `.prev` | int | distinct users with any activity in the window (**a lower bound**: there is no "app opened" event). Signals: check-ins, workouts, completed plan days, food logs, non-demo health syncs, posts (incl. the automatic morning post), reactions, comments, follows, sent chats, AI use (not `office`), AI coach chat, weight logs, InBody uploads, app events, push-token refresh at app start, sign-ins |
| `active_users.daily` | `[{day, n}]` | distinct active users per day |
| `checkins.today` / `.cur` / `.prev` | int | gym check-ins |
| `checkins.users_cur` | int | distinct people who checked in during cur |
| `checkins.present_now` | int | people with an open visit that started < 6 h ago (same rule as the app) |
| `checkins.daily` | `[{day, n}]` | check-ins per day |
| `top_gyms` | `[{id, name, name_en, n, users}]` | ≤ 10 gyms by check-ins in cur (`n`), `users` = distinct people; `name_en` may be null |
| `workouts.today` / `.cur` / `.prev` | int | workout sessions started |
| `workouts.users_cur` | int | distinct people with a session in cur |
| `workouts.finished_cur` | int | sessions started in cur that were finished |
| `workouts.plan_days_cur` / `.plan_days_prev` | int | plan days marked complete |
| `errors.today` / `.cur` / `.prev` | int | app error events (kinds containing `error`, `fatal`, `crashed` or `fail`), **all users incl. admins** |
| `errors.users_cur` | int | distinct users who hit one in cur |
| `errors.top` | `[{kind: string, n: int, users: int}]` | ≤ 5 error kinds in cur, most frequent first (e.g. `screen_error`, `js_fatal`, `js_fatal_prev`, `checkin_locate_fail`, `office3d_error`). One crash usually logs both `js_fatal` and `js_fatal_prev`. |
| `partner_intent.total` | int | people who chose a partner kind at sign-up and are still waiting: **nothing of theirs is approved** — no approved club request, no approved or suspended store, coach profile, center or venue, and not a verified coach (`is_coach`). Approvals don't always clear `partner_intent` (a coach approval only sets `is_coach`, a store approval only its status), so this filter is what keeps approved partners out. A rejected or pending submission still counts. |
| `partner_intent.no_submission` | int | …of those, how many never submitted anything (no club request, store, coach profile, center or venue) |
| `partner_intent.by_kind` | object | `{club, store, coach, center, venue}`: int each, same people as `total` |

### 3.3 `bookings` (no payments: `*_sar` = booked value)
**`venue_bookings`** — courts and classes booked at partner venues (`venue_bookings`):
| key | type | meaning |
|---|---|---|
| `created.today` / `.cur` / `.prev` | int | bookings made |
| `courts_cur` / `classes_cur` | int | made in cur, split court vs venue class |
| `by_status_cur` | object | bookings made in cur by their **current** status: `{pending, confirmed, declined, cancelled, done, no_show}` int each |
| `today.total` | int | bookings that start today (pending, confirmed, done or no-show) |
| `today.pending` | int | …still waiting for the venue |
| `upcoming_7d` | int | pending or confirmed, starting in the next 7 days |
| `awaiting_venue` | int | pending with a future start (the venue has not answered) |
| `cancelled.cur` / `.prev` | int | cancelled (by status change time) |
| `declined_cur` | int | declined by the venue in cur |
| `value_sar.cur` / `.prev` | number | sum of booking prices for confirmed/done bookings that started in the period (pay-at-venue, not ARQ revenue) |
| `stale_pending` | int | pending bookings whose start time has passed (nothing expires them) |
| `unclosed` | int | confirmed bookings that ended > 1 day ago and were never marked done/no-show |
| `venues.in_app` | int | approved partner venues (`listed_by = 'owner'`) |
| `venues.directory` | int | approved ARQ-listed venues (not bookable in the app) |
| `venues.pending` | int | venues waiting for review |
| `venues.hidden` | int | rejected or suspended venues |

**`gym_classes`** — group classes at gyms (`class_bookings`):
| key | type | meaning |
|---|---|---|
| `created.today` / `.cur` / `.prev` | int | seats booked in the period (incl. waitlist; any current status) |
| `today.booked` / `today.waitlist` | int | seats for today's classes |
| `upcoming_7d.booked` / `.waitlist` | int | seats for today + the next 6 days |
| `cancelled.cur` / `.prev` | int | cancelled seats |
| `active_classes` | int | active class slots in gym timetables |

**`memberships`** — gym memberships and passes (state computed like the app):
| key | type | meaning |
|---|---|---|
| `live` | int | active + frozen today |
| `active` / `frozen` / `upcoming` | int | by state today |
| `new.today` / `.cur` / `.prev` | int | memberships added by gyms (incl. imports) |
| `expiring_7d` | int | live memberships (not day passes) whose last day is within the next 7 days |
| `expired.cur` / `.prev` | int | memberships that ran out in the period |
| `requests_pending` | int | freeze/transfer requests waiting for the gym |
| `requests_over_48h` | int | …waiting more than 48 h |

**`coaching`**:
| key | type | meaning |
|---|---|---|
| `coaches_approved` | int | approved coach profiles |
| `clients_active` | int | active coach–client links |
| `link_requests.pending` | int | open coaching requests |
| `link_requests.pending_over_72h` | int | …older than 72 h |
| `link_requests.cur` / `.prev` | int | requests created |
| `sessions.today` | int | sessions starting today (booked, done or no-show) |
| `sessions.upcoming_7d` | int | booked sessions in the next 7 days |
| `sessions.done.cur` / `.prev` | int | sessions marked done, by start time |
| `sessions.cancelled_cur` / `sessions.no_show_cur` | int | by start time in cur |
| `sessions.stale_booked` | int | still "booked" more than 1 day after their start |

**`recovery`** — recovery-center appointments:
| key | type | meaning |
|---|---|---|
| `requests.today` / `.cur` / `.prev` | int | appointment requests made |
| `open_requests` | int | waiting for the center |
| `requests_over_24h` | int | …older than 24 h |
| `today` | int | confirmed/done appointments starting today |
| `upcoming_7d` | int | confirmed, next 7 days |
| `done_cur` / `declined_cur` | int | by status change time |
| `cancelled.cur` / `.prev` | int | cancelled by either side |
| `unclosed` | int | confirmed, started > 1 day ago, never closed |

**`meal_subscriptions`** — restaurant meal plans:
| key | type | meaning |
|---|---|---|
| `active` | int | active subscriptions |
| `subscribers` | int | distinct people with an active subscription |
| `restaurants` | int | restaurants with at least one active subscriber |
| `requests.today` / `.cur` / `.prev` | int | subscription requests made |
| `open_requests` | int | waiting for the restaurant |
| `requests_over_48h` | int | …older than 48 h |
| `ended.cur` / `.prev` | int | subscriptions ended |
| `declined_cur` | int | declined by the restaurant |
| `meals_today` | int | meals scheduled today for active subscriptions |
| `active_without_meals_3d` | int | active subscriptions with no meal scheduled today … today+2 |

**`attention`** — `[{priority, kind, target, id, name, n, since}]`, ≤ 20, sorted by `priority` then `since` (oldest first).
Names are businesses or coaches only, never members.
| field | type | meaning |
|---|---|---|
| `priority` | int | 1 = act now, 2 = soon, 3 = housekeeping |
| `kind` | string | one of the kinds below |
| `target` | string | `venue` \| `gym` \| `chain` \| `coach` \| `center` \| `store` |
| `id` | uuid | that venue/gym/chain/coach user/center/brand id |
| `name` | string | its name (coach: full name or username) |
| `n` | int | how many items |
| `since` | timestamp | the oldest item's time (request time; for `venue_expired_requests` and `coach_sessions_unclosed` the start time) |

| kind | priority | meaning |
|---|---|---|
| `venue_unanswered_bookings` | 1 | pending court/class bookings with a future start, made > 6 h ago |
| `gym_requests_waiting` | 1 | membership freeze/transfer requests pending > 48 h |
| `center_requests_waiting` | 1 | recovery appointment requests pending > 24 h |
| `restaurant_requests_waiting` | 1 | meal subscription requests pending > 48 h |
| `venue_expired_requests` | 2 | pending bookings whose start passed (in prev or cur) |
| `coach_requests_waiting` | 2 | client coaching requests pending > 72 h |
| `restaurant_no_meals_planned` | 2 | active subscriptions with no meals scheduled for the next 3 days |
| `coach_sessions_unclosed` | 3 | sessions still "booked" > 1 day after start |

### 3.4 `store` (catalogue only)
| key | type | meaning |
|---|---|---|
| `orders_enabled` | boolean | always `false`: there are no orders, carts or payments in the app. Show "Orders: not live yet", not zeros. |
| `redemption_enabled` | boolean | always `false`: points can't be spent yet |
| `brands.live` | int | approved stores and restaurants |
| `brands.live_partner` | int | …run by their owner (`listed_by = 'owner'`) |
| `brands.live_unclaimed` | int | …ARQ-listed with no owner |
| `brands.live_restaurants` | int | …category `restaurant` |
| `brands.pending` / `.rejected` / `.suspended` | int | by status |
| `brands.new.today` / `.cur` / `.prev` | int | stores created |
| `products.live` | int | active products in approved stores |
| `products.new.cur` / `.prev` | int | products added |
| `products.sold_out` | int | live products with stock 0 |
| `products.low_stock` | int | live products with stock 1–5 |
| `products.stock_untracked` | int | live products without stock tracking |
| `products.no_price` | int | live products without a price |
| `products.avg_price_sar` | number or null | average listed price of live products (null when there are none) |
| `products.low_stock_items` | `[{product_id, product, brand_id, brand, stock}]` | ≤ 10 live products with stock ≤ 5, lowest stock first (`stock` int; 0 = sold out) |
| `offers.live` | int | active, unexpired offers of approved stores |
| `offers.ending_3d` | int | live offers ending within 3 days |
| `offers.expired_still_active` | int | past their end date but still marked active (housekeeping) |
| `offers.views.today` / `.cur` / `.prev` | int | offer views (person-days) |
| `offers.reveals.cur` / `.prev` | int | "show code" taps (person-days) |
| `offers.visits.cur` / `.prev` | int | taps through to the store's site (person-days) |
| `offers.people.cur` / `.prev` | int | distinct people who interacted with offers |
| `followers.total` | int | store follows |
| `followers.new.cur` / `.prev` | int | new follows |
| `top_brands` | `[{id, name, category, city, engagement, followers, followers_new, offer_views, code_reveals, site_visits, active_subs, live_products}]` | ≤ 5 approved stores by `engagement` = distinct people who used their offers in cur + new followers in cur + active meal subscriptions (ties: followers, then name; can include 0). `category` = `restaurant`\|`apparel`\|`supplements`\|`equipment`\|`accessories`\|`nutrition`\|`other`; `city` may be null; counts are int; `offer_views`/`code_reveals`/`site_visits` are person-days in cur |
| `top_products` | `[{product_id, product, brand_id, brand, price_sar, meals}]` | ≤ 5 dishes most scheduled for meal subscribers in cur (the only per-product demand signal); `price_sar` number or null |
| `rewards.points.today` / `.cur` / `.prev` | int | points awarded |
| `rewards.earners_cur` | int | distinct people who earned points in cur |
| `rewards.outstanding` | int | points currently held by all users |
| `rewards.holders` | int | people holding > 0 points |

### 3.5 `community` (counts only)
| key | type | meaning |
|---|---|---|
| `posts.today` / `.cur` / `.prev` | int | user posts (kind `post`) |
| `posts.posters_cur` | int | distinct posters in cur |
| `posts.with_photo_cur` / `posts.public_cur` | int | posts in cur with a photo / public |
| `posts.wake_cur` | int | automatic "good morning" posts in cur (rough proxy for morning app opens) |
| `comments.today` / `.cur` / `.prev` | int | comments on posts + on check-ins |
| `reactions.today` / `.cur` / `.prev` | int | reactions on posts + on check-ins |
| `follows.cur` / `.prev` | int | new follows |
| `friend_requests.cur` / `.prev` | int | friend requests sent (still existing; declined ones are deleted) |
| `friend_requests.pending` | int | open friend requests |
| `friend_requests.pending_over_7d` | int | …older than 7 days |
| `challenges.created_cur` / `.created_prev` | int | challenges created |
| `challenges.running` | int | running today |
| `challenges.ended_unsettled` | int | ended but nobody settled them (winners didn't get their points) |
| `challenges.joins_cur` | int | members who joined in cur |
| `tips.cur` / `.prev` / `.total` | int | published tips |
| `programs.cur` / `.prev` / `.total` | int | published training programs |
| `programs.adopts_cur` / `.adopts_prev` | int | program adoptions |
| `daily` | `[{day, posts, comments, reactions}]` | per day of cur, ints |
| `moderation.reports_supported` | string[] | content types users can report today: `["gym_review"]` |
| `moderation.user_report_block` | boolean | always `false`: there is no report/block for posts, comments, chats or users yet (App Store guideline 1.2 risk — show as a standing item) |
| `moderation.reported.open` | int | reports waiting for review (`status = 'new'`) |
| `moderation.reported.cur` / `.prev` | int | reports made |
| `moderation.kept` / `moderation.removed` | int | reports decided: content kept / removed (hidden) |
| `moderation.latest` | `[{id, kind, target_id, target_name, author_username, reason, status, created_at}]` | ≤ 10 newest reports: `id` = report id, `kind` = `"gym_review"`, `target_id`/`target_name` = the gym, `author_username` = who wrote the reported review (public), `reason` = `fake`\|`offensive`\|`spam`\|`other`, `status` = `new`\|`kept`\|`removed`. No review text, no reporter. |
| `chats.messages.today` / `.cur` / `.prev` | int | messages sent |
| `chats.senders.cur` / `.prev` | int | distinct senders |
| `chats.conversations.cur` / `.prev` | int | active conversations (distinct pairs with a message) |
| `chats.media.cur` / `.prev` | int | photo/video messages |
| `chats.media_pct_cur` | percent | media share of messages in cur |
| `chats.unread_over_24h` | int | messages unread for more than 24 h (sent in the last 90 days) |
| `chats.daily` | `[{day, n}]` | messages per day |

### 3.6 `partners`
| key | type | meaning |
|---|---|---|
| `pending.club` / `.store` / `.coach` / `.center` / `.venue` | int | items waiting for review (same numbers as the app's partner overview; `center` counts every pending center, while `items` lists the partner-submitted ones like the desks do) |
| `pending_total` | int | sum of the five |
| `pending_covered` | object | `{club, store, coach, center, venue}`: int each — of `pending.<kind>`, how many have an open agent task (`kind = 'review_partner'`, same `target_kind`, status `scheduled`, `in_progress` or `waiting_approval`). Counted over **every** pending item, not just the 25 in `items`; always ≤ `pending.<kind>`. `pending.<kind> - pending_covered.<kind>` = items no agent is on yet. |
| `items` | array | ≤ 25 pending items across all kinds, **oldest first** — the same items the office desks show |

`items[]`:
| field | type | meaning |
|---|---|---|
| `kind` | string | `club` \| `store` \| `coach` \| `center` \| `venue` (use it as `p_kind` in `office_admin.review`) |
| `id` | uuid | club request id / brand id / coach **user** id / center id / venue id (use it as `p_id`) |
| `name` | string | club: chain or gym name, else the requested club name; coach: full name or `@username`; others: their name |
| `created_at` | timestamp | when it was submitted (coach: `submitted_at`) |
| `city` | string or null | the city given (center: its first city) |
| `username` | string or null | the requester's / owner's username |
| `agent_task` | `{id: uuid, status: string}` or null | the open agent task for this item (`scheduled`, `in_progress` or `waiting_approval`), if any |

### 3.7 `reports` (tester reports)
| key | type | meaning |
|---|---|---|
| `by_status.new` / `.seen` / `.fixed` / `.wontfix` | int | all reports by status |
| `new_covered` | int | of `by_status.new`, how many have an open agent task (`target_kind = 'report'`, status `scheduled`, `in_progress` or `waiting_approval`). Counted over **every** new report, not just the 20 in `latest_new`; always ≤ `by_status.new`. |
| `received.today` / `.cur` / `.prev` | int | reports sent |
| `latest_new` | array | ≤ 20 newest reports with status `new`, newest first |

`latest_new[]`: `id` (uuid), `category` (`bug`\|`idea`\|`design`\|`other`), `message` (string, whitespace collapsed, ≤ 140
characters), `created_at` (timestamp), `username` (string or null), `agent_task` (`{id, status}` or null, as in partners).

### 3.8 `marketing`
| key | type | meaning |
|---|---|---|
| `live_ad` | `{id, title, kind, starts_at, ends_at}` or null | the launch ad shown now (highest priority, then newest). `kind` = `ad` (marketing) \| `awareness` \| `occasion`; `starts_at`/`ends_at` timestamp or null |
| `ads.live` / `.scheduled` / `.ended` / `.off` | int | launch ads by state (same rule as the app) |
| `ads.live_marketing` | int | live ads of kind `ad` (0 = "no live marketing ad") |
| `ad_stats.cur` / `ad_stats.prev` | `{views, reach, clicks, closes}` | launch-ad events by Riyadh day: `views`/`clicks`/`closes` are person-days, `reach` = distinct viewers |
| `events.active` | int | active local events |
| `events.past_still_active` | int | active events whose last day has passed (housekeeping) |
| `events.upcoming` | `[{id, title, title_en, starts_on, ends_on, city, category}]` | ≤ 10 active dated events that haven't ended (running or future), by start date. `title_en`, `ends_on`, `city` may be null; dates are `YYYY-MM-DD` |
| `nudges.today` / `.cur` / `.prev` | int | motivation nudges sent |
| `nudges.by_category_cur` | object | `{gym, friend, streak, workout, meal}`: int each |
| `nudges.templates_active` / `.templates_paused` | int | nudge templates (agent drafts are saved paused) |

### 3.9 `ai`
| key | type | meaning |
|---|---|---|
| `limits.barcode_per_day` | int | current per-user daily cap (default 2) |
| `limits.meal_photos_per_day` | int | current per-user daily cap (default 25) |
| `fixed_caps.plan` / `.office` | int | fixed caps: 8 AI plans a day per user, 80 office agent tasks a day per admin |
| `usage.<kind>` for `meal_photo`, `barcode`, `plan`, `office` | `{uses_today, uses_cur, uses_prev, users_cur}` | AI calls by kind (all four keys always present); `users_cur` = distinct users in cur. `office` is the owner's agents. |
| `office_tasks_today` | int | agent tasks created today |

### 3.10 `office`
| key | type | meaning |
|---|---|---|
| `by_status` | object | `{scheduled, in_progress, waiting_approval, done, failed}`: all-time task counts |
| `by_desk` | object | `{lead, clubs, stores, coaches, care, reports, marketing, users, ai}` → each the same 5-status object |
| `waiting_total` | int | tasks waiting for your approval |
| `working_total` | int | scheduled + in progress |
| `oldest_waiting_at` | timestamp or null | creation time of the oldest waiting task |

A real result from the test run (fake data) is in the web-office scratch folder as `overview.sample.json`; run
`OFFICE_WEB_SAMPLE=<file> node supabase/tests/office_web.test.cjs` to produce a fresh one.

---

## 4. Schema `office_admin` (owner actions from the web)

Not exposed by the API and not granted to `anon`, `authenticated` or `PUBLIC`. Only `postgres` (the connector) and
`service_role` can call it. Every public function first runs `office_admin._as_admin()`, so the rest of the call runs **as
the owner**: the app's own review functions run unchanged, and `admin_log` records the owner as the actor.

**Errors shared by every function below** (raised by `_as_admin`):
| code | when |
|---|---|
| `choose_admin` | `app_admins` doesn't have exactly one row. With several admins, pick one in the same query first: `select set_config('office.admin_id', '<admin-uuid>', true);` (also `choose_admin` if that id isn't an admin) |
| `not_allowed` | the session carries another user's token, or runs as `anon`/`authenticated` |

### 4.1 `office_admin.admin_id() returns uuid`
The admin the web office acts as: `office.admin_id` if set (must be an admin), else the only row of `app_admins`.
Errors: `choose_admin`.

### 4.2 `office_admin._as_admin() returns uuid`
Sets `request.jwt.claims = {"sub": <admin>, "role": "authenticated"}` and `request.jwt.claim.sub = <admin>` for the rest
of the **transaction** (`auth.uid()` and `is_admin()` then answer for the owner) and returns the admin id. Called by every
function below; the page never needs to call it. Errors: `choose_admin`, `not_allowed`.

### 4.3 `office_admin.tasks(p_limit integer default 150) returns jsonb`
All open agent tasks (`scheduled`, `in_progress`, `waiting_approval`; up to 1000) plus the latest `p_limit` closed ones
(`done`, `failed`; clamped 0–500), newest first (`created_at` desc). Returns a JSON array (`[]` when empty) of full
`office_tasks` rows:

| field | type | meaning |
|---|---|---|
| `id` | uuid | task id |
| `desk` | string | `lead` \| `clubs` \| `stores` \| `coaches` \| `care` \| `reports` \| `marketing` \| `users` \| `ai` |
| `kind` | string | `triage_report` \| `review_partner` \| `draft_nudge` \| `review_ai_limits` \| `daily_brief` |
| `target_kind` | string or null | `report` \| `club` \| `store` \| `coach` \| `center` \| `venue` (null for nudge/limits/brief) |
| `target_id` | uuid or null | the report / request / brand / coach user / center / venue |
| `title` | string or null | short title (≤ 120) |
| `status` | string | `scheduled` \| `in_progress` (agent working) \| `waiting_approval` (your turn) \| `done` \| `failed` |
| `input` | object | what the agent was given (see below) |
| `output` | object or null | the agent's proposal (see below); always present when `waiting_approval` |
| `error` | string or null | failure code: `ai_failed` \| `ai_bad_output` \| `ai_refused` \| `timeout` \| `stale` |
| `model` | string or null | model id used |
| `request_id` | string or null | the run's request id |
| `decision` | string or null | `approved` \| `rejected` (only on `done` tasks you decided) |
| `decision_note` | string or null | your rejection note (≤ 300) |
| `final` | object or null | what was actually applied on approval (cleaned, see 4.4) |
| `decided_by` / `created_by` | uuid or null | admin ids |
| `decided_at`, `created_at`, `updated_at`, `finished_at` | timestamp (or null) | lifecycle times |

`daily_brief` tasks are stored directly as `done` (informational). An `in_progress` task older than ~15 minutes is stuck
(the next agent run marks it `failed` with error `stale`).

**`input` by kind:** `triage_report`, `review_partner`: `{locale: "ar"|"en"}` (the tester's / partner's language);
`draft_nudge`: `{brief: string|null}`; `review_ai_limits`: `{current: {barcode_per_day, meal_photos_per_day}, usage: {...}}`;
`daily_brief`: `{}`.

**`output` by kind** (bilingual text `Bi` = `{ar: string, en: string}`):
- `triage_report`: `{summary: Bi, severity: "critical"|"high"|"medium"|"low", category_guess: "bug"|"idea"|"design"|"other", status: "seen"|"wontfix", reply: string, reply_locale: "ar"|"en"}`
- `review_partner`: `{summary: Bi, checks: [{label: Bi, ok: boolean}] (≤8), missing: Bi[] (≤6), recommendation: "approve"|"reject", note: string (message to the partner, in note_locale), note_locale: "ar"|"en", confidence: "high"|"medium"|"low"}`
- `draft_nudge`: `{why: Bi, template: {category: "gym"|"friend"|"streak"|"workout"|"meal", gender: "all"|"male"|"female", locale: "ar"|"en", title: string, body: string}}`
- `review_ai_limits`: `{why: Bi, barcode_per_day: int 0–100, meal_photos_per_day: int 0–200}`
- `daily_brief`: `{headline: Bi, points: Bi[] (≤6), priorities: [{desk: desk id, text: Bi}] (≤4)}`

Treat every string in `input`/`output` as untrusted text (render with `textContent`).

Errors: `choose_admin`, `not_allowed`.

### 4.4 `office_admin.apply(p_task uuid, p_final jsonb) returns jsonb`
Approves an agent proposal (after your edits) in **one transaction**: lock the task → it must be `waiting_approval` →
validate `p_final` → check the item is still undecided → apply it with the app's own functions → record the decision with
`office_decide(p_task, 'approved', <cleaned final>)` (sets `status = 'done'`, `decision = 'approved'`, `final`,
`decided_by`, `decided_at`, and writes `admin_log`). Returns `{"ok": true}`.

`p_final` by task kind (start from the proposal; extra keys are ignored):
| kind | `p_final` | applied as |
|---|---|---|
| `triage_report` | `{"status": "seen"\|"fixed"\|"wontfix", "reply": string}` — `reply` optional, trimmed, ≤ 1000; it is the tester-visible reply | `beta_feedback.status = status`, `admin_note = reply` (empty → null). Stored final: `{status, reply}` |
| `review_partner` | `{"decision": "approve"\|"reject", "note": string}` — `note` trimmed and cut to 300; **reject needs ≥ 3 characters**; on approve the note is dropped (the partner gets the standard approval notice) | club → `review_club_request(id, 'approved'\|'rejected', note)`; store / coach / center / venue → `admin_partner_action(kind, id, 'approve'\|'reject', note)`. Stored final: `{decision, note}` (note `""` on approve) |
| `draft_nudge` | `{"template": {"category", "gender", "locale", "title", "body"}}` — enums as in the output shape; title 1–80 and body 3–240 characters after trimming; `{placeholders}` allowed per category: gym `{name} {gym}`, friend `{name} {friend} {gym}`, streak `{name} {streak} {gym}`, workout `{name} {workout}`, meal `{name}`; any other `{…}` or stray brace fails | inserts a **paused** nudge template (`active = false`, `friend_gender = 'all'`); the owner activates/sends it from the app. Stored final: `{template: {...trimmed}}` |
| `review_ai_limits` | `{"barcode_per_day": number, "meal_photos_per_day": number}` — numbers or digit strings (Arabic digits ok), rounded and clamped to 0–100 / 0–200 | upserts `app_settings.ai_limits`. Stored final: `{barcode_per_day, meal_photos_per_day}` (ints) |
| `daily_brief` | — | never waiting → `not_waiting` |

Errors (in check order):
| code | when |
|---|---|
| `choose_admin`, `not_allowed` | see above |
| `not_waiting` | unknown task id, task not `waiting_approval` (agent still working, already decided, failed), or a `daily_brief` |
| `bad_input` | `p_final` not an object; bad enum; wrong JSON type; reply > 1000; nudge `template` missing or not text; limits not numbers |
| `note_required` | `review_partner` reject with a note shorter than 3 characters |
| `bad_nudge` | nudge title/body length or placeholders not allowed |
| `already_decided` | the item was decided meanwhile: report no longer `new`, partner item no longer `pending` (or deleted), or the AI limits changed since the agent read them (`input.current` ≠ current settings) |
| others | errors from the app functions themselves are passed through (rare: e.g. `request_not_found`) |

On any error nothing changes (the task stays `waiting_approval`).

### 4.5 `office_admin.reject(p_task uuid, p_note text default null) returns jsonb`
Rejects an agent proposal: records `office_decide(p_task, 'rejected', null, p_note)` — `status = 'done'`,
`decision = 'rejected'`, `decision_note` = trimmed note (≤ 300, empty → null). Nothing in the app changes. Returns
`{"ok": true}`.
Errors: `choose_admin`, `not_allowed`, `not_waiting` (unknown task or not waiting).

### 4.6 `office_admin.review(p_kind text, p_id uuid, p_decision text, p_note text default null) returns jsonb`
Your own decision on a pending partner item (no agent involved), through the same functions as the app's management panel:
club → `review_club_request`; store / coach / center / venue → `admin_partner_action`. The partner is notified as usual
(with your note on rejection). Returns `{"ok": true}`.
- `p_kind`: `club` \| `store` \| `coach` \| `center` \| `venue`; `p_id`: the `partners.items[].id`.
- `p_decision`: `approve` \| `reject`.
- `p_note`: trimmed and cut to 300; required (≥ 3 characters) to reject; ignored on approve.

If an agent task was open for that item, it stays `waiting_approval`; approving it later returns `already_decided`, so
reject it (`office_admin.reject`) to clear it.

Errors (in order): `choose_admin`, `not_allowed`, `bad_input` (unknown kind or null id), `bad_status` (decision not
approve/reject), `note_required`, `request_not_found` (no such item), `already_decided` (not pending anymore).

### 4.7 `office_admin.report(p_id uuid, p_status text, p_note text default null) returns jsonb`
Sets a tester report's status and, optionally, your reply (shown to the tester under their report).
- `p_status`: `new` \| `seen` \| `fixed` \| `wontfix`.
- `p_note`: `null` keeps the current reply; a string replaces it (trimmed; empty string clears it); ≤ 1000 characters.

Returns `{"ok": true}`. Errors: `choose_admin`, `not_allowed`, `bad_status`, `bad_input` (note > 1000), `report_not_found`.

### 4.8 `office_admin.run_agent(p_desk text, p_brief text default null) returns jsonb`
Asks the `office-agent` edge function to run the desk's agent. It queues an asynchronous HTTP request with `pg_net`
(sent after the transaction commits) and returns at once: `{"queued": true, "request_id": <int>}` (the pg_net request
id). The agent's tasks then appear in `office_admin.tasks()` as `in_progress`, then `waiting_approval` (or `done` for the
brief); poll `tasks()` every few seconds for ~2 minutes. If the function fails (e.g. AI not configured), no tasks appear —
the page should say "no new tasks yet" after the polling window.

Request sent: `POST <office_agent_url>` with headers `Content-Type: application/json` and `x-office-key: <office_agent_key>`,
body `{"desk": p_desk, "brief": <cleaned brief or null>, "admin_id": <admin uuid>}`, timeout 1000 ms.
- `p_desk`: `lead` \| `clubs` \| `stores` \| `coaches` \| `care` \| `reports` \| `marketing` \| `ai`.
- `p_brief`: optional note (used by `marketing`): control characters and `<` `>` become spaces, whitespace is collapsed,
  cut to 300 characters; empty → null.

Errors (in order):
| code | when |
|---|---|
| `choose_admin`, `not_allowed` | see above |
| `agent_unavailable` | desk without an agent: `users`, `activity`, `bookings`, `orders`, `community` |
| `bad_input` | unknown desk |
| `agent_not_configured` | vault secret `office_agent_url` (http(s) URL) or `office_agent_key` missing, vault or pg_net not available |
| `rate_limited` | the admin already has ≥ 80 agent tasks created in the last 24 h (the function's own daily limit) |

---

## 5. `public.office_agent_key_ok(p_key text) returns boolean`

For the `office-agent` edge function (web mode, header `x-office-key`): `true` only when `p_key` equals the vault secret
`office_agent_key`. Compared via SHA-256 digests. Answers only for the service role (JWT claims role `service_role`, or
database role `service_role`/`postgres`); anyone else gets `false`. Executable by `service_role` only. `false` when the
secret is missing, the key is empty or longer than 500 characters.

## 6. Setup (once per project)

1. Apply the migration (`npx supabase db push`, or run `supabase/setup_all.sql` / the migration in the SQL editor).
   It creates the vault secret `office_agent_key` (64 hex characters) if it doesn't exist. If the migration log shows the
   notice `vault not available: office_agent_key not created`, create it by hand:
   ```sql
   select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'office_agent_key', 'ARQ web office → office-agent');
   ```
2. Add the function URL for this project (it differs per project, so the migration doesn't create it):
   ```sql
   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/office-agent', 'office_agent_url');
   ```
   To change it later: `select vault.update_secret((select id from vault.secrets where name = 'office_agent_url'), '<new url>');`
3. Deploy `office-agent` with JWT verification off (it checks the user's token or the web key itself) — see README.
4. The Supabase connector used by the page must run as `postgres` and not in read-only mode for actions.

---

## 7. App tab — change requests, content and settings (`20261008000900_office_app.sql`)

### بالعربي
تبويب «التطبيق» في المكتب: (١) طلبات التعديل — المالك يكتب طلب، الصفحة تفتح جلسة Claude Code تشتغل على فرع جديد
وتفتح طلب دمج للمراجعة (ولا شي يوصل للناس لين المالك يدمج بنفسه)، والطلب ينحفظ في `office_change_requests` وتتابع
الصفحة حالته؛ (٢) المحتوى والإعدادات — إعلان البداية، الفعاليات، تنبيهات التحفيز، الإعدادات، الشركاء، المتدربين.
كل الدوال في `office_admin` (نفس قواعد القسم ٤: مقفولة على التطبيق، وتشتغل «بهوية المالك»)، فحرّاس الجداول ودوال
التطبيق وسجل الإجراءات يشتغلون مثل ما هم. قائمة المتدربين ما فيها إيميلات ولا أوقات دخول.

### 7.0 Conventions for this section
- Same transport, literals, transactions and shared errors as sections 1 and 4 (`choose_admin`, `not_allowed` from
  `_as_admin`; any other unexpected error text → show a generic message). One call = one row, one column:
  ```sql
  select office_admin.requests(50) as r;                                    -- rows[0].r = array
  select office_admin.add_request('Coach filter', 'Add a city filter…', 'coaches', 'session_01Ab…', null) as r;  -- the saved row
  select office_admin.update_request('<uuid>'::uuid, 'review', 'https://github.com/…/pull/42') as r;
  select office_admin.content() as r;                                       -- rows[0].r = {ads, events, nudges, settings}
  select office_admin.save_event(null, '{"title":"…","starts_on":"2026-12-01"}'::jsonb) as r;
  select office_admin.set_event_active('<uuid>'::uuid, false) as r;          -- {"ok": true}
  select office_admin.partners('store', 'fit') as r;
  select office_admin.users(null, 'all', 50, 0) as r;
  ```
- **Edit objects (`p jsonb`)** for `save_ad`, `save_event`, `save_nudge`: a key that is **absent keeps the current value**
  (on insert: the default); strings are trimmed (spaces and new lines at both ends); for nullable text fields `null` or a
  blank string clears the field. Wrong JSON type, unknown enum value, out-of-range number or too-long text → error
  **`bad_value: <field>`** (message is the code, a colon, a space and the JSON key, e.g. `bad_value: title`), so match
  `/\bbad_value\b/` and show the field from the text after it. `p` that is not a JSON object → `bad_input`.
- Numbers in `p` may be JSON numbers or digit strings (Arabic digits accepted); they must be whole numbers.
- Writers return `{"ok": true}` or the saved row (stated per function). On any error nothing changes.

**Error codes used in this section** (map these to friendly text; anything else = generic):
| code | meaning |
|---|---|
| `bad_value` (`bad_value: <field>`) | a field value isn't allowed (also raised by the `app_settings` guard, then without a field) |
| `bad_nudge` | nudge title/body length or `{placeholders}` not allowed for the category |
| `bad_input` | malformed call: `p` not an object, unknown setting key, null where a boolean is needed, bad request fields (7.3) |
| `bad_status` | unknown request status (7.4); partner kind/action not allowed here (7.13, 7.14) |
| `not_found` | unknown request / ad / event / nudge id (and `save_ad` with a null id) |
| `request_not_found` | unknown partner item |
| `user_not_found`, `username_taken`, `bad_username`, `name_too_long` | from `admin_update_user` / `set_verified` |
| `note_required` | reserved by `admin_partner_action` for rejections (not reachable from 7.14) |

### 7.1 Table `public.office_change_requests`
Read by admins from the app (RLS `is_admin()`); **no write policy** — writes only through `office_admin`.
| column | type | meaning |
|---|---|---|
| `id` | uuid | request id |
| `title` | string | 2–120 characters (whitespace collapsed to single spaces) |
| `request` | string | the owner's details, 3–4000 characters (trimmed; inner new lines kept) |
| `area` | string or null | `app` (the app in general) \| `lead` \| `clubs` \| `stores` \| `coaches` \| `care` \| `reports` \| `marketing` \| `users` \| `ai` \| `activity` \| `bookings` \| `orders` \| `community` |
| `session_id` | string or null | Claude Code session id, `^session_[A-Za-z0-9]{8,80}$`; unique (one request per session) |
| `session_url` | string or null | `https://claude.ai/code/<session_id>` |
| `pr_url` | string or null | pull request link, `^https://github\.com/[^\s]{3,200}$` |
| `status` | string | `sent` (saved without a session) \| `working` \| `needs_you` (the session waits for the owner) \| `review` (PR ready) \| `done` \| `failed` \| `cancelled` (marked by the owner — the session is **not** stopped) |
| `created_by` | uuid or null | the admin |
| `created_at`, `updated_at` | timestamp | `updated_at` changes on every update |

### 7.2 `office_admin.requests(p_limit integer default 50) returns jsonb`
Array of the latest `p_limit` requests (clamped 1–200, `null` → 50), **newest first**, each with every column of 7.1.
Errors: shared only.

### 7.3 `office_admin.add_request(p_title text, p_request text, p_area text, p_session_id text, p_session_url text) returns jsonb`
Saves a request after the page started (or failed to start) a Claude Code session. Returns the saved row (7.1).
- `p_title`: whitespace collapsed, 2–120. `p_request`: trimmed, 3–4000. `p_area`: one of the areas above, or null/blank → null.
- `p_session_id`: null/blank → no session (`status = 'sent'`); otherwise `status = 'working'`.
- `p_session_url`: null/blank with a session id → built as `https://claude.ai/code/<session_id>`.
- **Same session id again → returns the existing request unchanged** (safe to retry after a network error).
Errors: `bad_input` (any field out of range / bad format, including a session link outside `https://claude.ai/code/`).

### 7.4 `office_admin.update_request(p_id uuid, p_status text, p_pr_url text default null) returns jsonb`
Sets the status (any of the seven) and, optionally, the PR link. `p_pr_url` null or blank **keeps** the current link.
Returns the updated row (7.1). The page maps the session's `status_bucket` like this: working → `working`,
blocked → `needs_you`, review_ready → `review`, completed → `done`, failed → `failed`; «إلغاء» saves `cancelled`.
Only refresh requests that are still open (`sent`, `working`, `needs_you`, `review`).
Errors (in order): `bad_status` (unknown or null status), `bad_input` (PR link not `https://github.com/…`), `not_found`.

### 7.5 `office_admin.content() returns jsonb`
`{ "ads": [...], "events": [...], "nudges": [...], "settings": {...} }` — read only.

**`ads`** — every launch ad, newest first (`created_at` desc):
| key | type | meaning |
|---|---|---|
| `id` | uuid | ad id |
| `kind` | string | `ad` (marketing, labelled «إعلان») \| `awareness` \| `occasion` |
| `title` | string | 2–80 |
| `media_path`, `media_type` | string | storage path in the public bucket `ads`; `image` \| `gif` \| `video` (not editable here) |
| `link` | string or null | in-app path (`/store/<id>`, `/clubs/chain/<id>`, `/coaches/<id>`, `/recovery/centers?focus=<id>`, …) or `https://…` |
| `cta` | string or null | button text ≤ 30 |
| `audience` | string | `all` \| `men` \| `women` |
| `starts_at`, `ends_at` | timestamp or null | null = no limit |
| `active` | boolean | switched on |
| `frequency` | string | `every_open` \| `daily` \| `once` |
| `auto_close` | int | seconds 0–30 (0 = stays until skipped) |
| `priority` | int | 0–100 (highest shown first, then newest) |
| `created_at`, `updated_at` | timestamp | |
| `state` | string | `off` (not active) \| `ended` (`ends_at` ≤ now) \| `scheduled` (`starts_at` > now) \| `live` — same rule as the app's `adState` |

**`events`** — up to 80 local events ordered by `coalesce(starts_on, Riyadh day of created_at)` desc, every column of
`local_events`: `id`, `category` (`running` \| `horse_racing` \| `hiking` \| `shooting` \| `boxing` \| `motorsport` \|
`cycling` \| `football` \| `other`), `title` (2–90), `title_en` (≤ 90), `city` / `city_en` (≤ 40), `venue` / `venue_en`
(≤ 90), `starts_on` / `ends_on` (`YYYY-MM-DD` or null), `date_note` / `date_note_en` (≤ 80, shown instead of the date when
it is approximate), `summary` / `summary_en` (≤ 500), `url` (`https://…` ≤ 300), `image_path` (bucket `events`, or null),
`featured`, `active` (boolean), `created_by`, `created_at`, `updated_at`. Text fields other than `title` may be null.

**`nudges`** — up to 300 motivation nudge templates (the newest 300), ordered by `category`, `gender`, oldest first:
`id`, `category` (`gym` \| `friend` \| `streak` \| `workout` \| `meal`), `gender` (`all` \| `male` \| `female`),
`friend_gender` (same values; only meaningful for `friend`, otherwise `all`), `locale` (`ar` \| `en`), `title` (1–80),
`body` (3–240), `active`, `updated_at`, `last_broadcast_at` (timestamp or null), `last_broadcast_n` (int or null).
Placeholders allowed per category: gym `{name} {gym}`; friend `{name} {friend} {gym}`; streak `{name} {streak} {gym}`;
workout `{name} {workout}`; meal `{name}`.

**`settings`** (defaults when not saved):
| key | type | meaning |
|---|---|---|
| `ai_limits.barcode_per_day` | int | AI barcode lookups per user per day, 0–100 (default 2) |
| `ai_limits.meal_photos_per_day` | int | meal-photo analyses per user per day, 0–200 (default 25) |
| `calorie_alert.enabled` | boolean | the "N kcal left" alert is on |
| `calorie_alert.threshold` | int | alert when ≤ this many kcal are left, 50–500 (default 200) |
| `calorie_alert.title_ar` / `.body_ar` | string | Arabic title (2–80) / text (2–200) — required |
| `calorie_alert.title_en` / `.body_en` | string or null | English title (≤ 80) / text (≤ 200); null → the app falls back to Arabic |
Calorie alert placeholders: `{n}` kcal left, `{eaten}` eaten today, `{goal}` daily target.

### 7.6 `office_admin.save_ad(p_id uuid, p jsonb) returns jsonb`
Edits an **existing** launch ad (new ads need an image/video and are added from the mobile app). Returns the ad as in 7.5
(with `state`). Editable keys in `p`:
| key | rule |
|---|---|
| `title` | string 2–80 (required, can't be cleared) |
| `kind` | `ad` \| `awareness` \| `occasion` |
| `link` | null/blank clears; else `/path` with only `A-Z a-z 0-9 _ - / ? = & . % [ ]`, or `https://…` without spaces; ≤ 300 |
| `cta` | null/blank clears; ≤ 30 |
| `audience` | `all` \| `men` \| `women` |
| `starts_at` | null/blank clears; `YYYY-MM-DD` → **start** of that Riyadh day; `YYYY-MM-DDTHH:MM[:SS[.ffffff]]` → Riyadh time; with `Z` or `±HH[:MM]` → as given |
| `ends_at` | same, but `YYYY-MM-DD` → **end** of that Riyadh day (next midnight), like the app; must be after `starts_at` |
| `active` | boolean |
| `frequency` | `every_open` \| `daily` \| `once` |
| `auto_close` | int 0–30 |
| `priority` | int 0–100 |
Other keys are ignored (`media_*` can't change here). The table's trigger logs `admin_log` (`kind 'ad'`, action `edit`, or
`show`/`hide` when `active` changed).
Errors: `bad_input` (`p` not an object), `not_found` (null or unknown id), `bad_value: <field>`.

### 7.7 `office_admin.set_ad_active(p_id uuid, p_active boolean) returns jsonb`
Switches an ad on/off → `{"ok": true}`. Logged by the table trigger (`show` / `hide`).
Errors: `bad_input` (null `p_active`), `not_found`.

### 7.8 `office_admin.save_event(p_id uuid, p jsonb) returns jsonb`
`p_id` null → **adds** an event; otherwise edits it. Returns the saved row (every column, as in 7.5). Keys in `p`:
`category` (enum, default `other`), `title` (required, 2–90), `title_en` (≤ 90), `city` / `city_en` (≤ 40), `venue` /
`venue_en` (≤ 90), `starts_on` / `ends_on` (`YYYY-MM-DD`, a real date; `ends_on` ≥ `starts_on`), `date_note` /
`date_note_en` (≤ 80), `summary` / `summary_en` (≤ 500, new lines kept), `url` (`https://…` without spaces, ≤ 300),
`featured` (boolean, default false), `active` (boolean, default **true**). `image_path` is never changed here.
Logged by the table trigger (`kind 'event'`: `create`, `edit`, or `show`/`hide`).
Errors: `bad_input`, `not_found` (unknown id), `bad_value: <field>` (a table check that still fails →
`bad_value: <constraint name>`).

### 7.9 `office_admin.set_event_active(p_id uuid, p_active boolean) returns jsonb`
→ `{"ok": true}`; logged (`show` / `hide`). Errors: `bad_input`, `not_found`.

### 7.10 `office_admin.save_nudge(p_id uuid, p jsonb) returns jsonb`
`p_id` null → **adds** a template, **paused** unless `p.active` is `true`; otherwise edits `category`, `gender`,
`friend_gender`, `locale`, `title`, `body` (`active` is ignored on edit — use 7.11). Defaults on add: `gender 'all'`,
`locale 'ar'`; `category`, `title` and `body` are required. `friend_gender` is kept only for `friend` (otherwise forced to
`all`). Title 1–80 and body 3–240 after trimming, and every `{…}` must be a placeholder allowed for the category (7.5), no
stray braces — same rule as the app's `validNudgeText`. Returns the template as in 7.5. Writes `admin_log`
(`kind 'nudge'`, `create` / `edit`, note = title).
Errors: `bad_input`, `not_found`, `bad_value: category|gender|friend_gender|locale|title|body` (wrong type/enum),
`bad_nudge` (length or placeholders).

### 7.11 `office_admin.set_nudge_active(p_id uuid, p_active boolean) returns jsonb`
→ `{"ok": true}`; writes `admin_log` (`kind 'nudge'`, `show` / `hide`). Errors: `bad_input`, `not_found`.

### 7.12 `office_admin.save_setting(p_key text, p_value jsonb) returns jsonb`
Saves (upserts) one setting: `p_key` = `ai_limits` \| `calorie_alert`; `p_value` = the whole object as in 7.5
(`ai_limits`: `{barcode_per_day: 0–100, meal_photos_per_day: 0–200}` whole numbers; `calorie_alert`: `{enabled,
threshold, title_ar, body_ar, title_en, body_en}`). The `app_settings` guard validates, keeps only the known keys
(blank English → null) and writes `admin_log` (`kind 'setting'`, target = key, `edit`). Calorie-alert texts may only use
`{n}`, `{eaten}`, `{goal}`. Returns `{"ok": true, "key": <key>, "value": <saved, cleaned value>}`.
Errors: `bad_input` (other key), `bad_value` (value not an object, or rejected by the guard), `bad_value: <text key>`
(unknown placeholder or stray brace in a calorie-alert text).

### 7.13 `office_admin.partners(p_kind text, p_q text default null) returns jsonb`
The app's partner management list (`admin_partner_list`) for one kind, same order, at most 200 rows.
`p_kind`: `club` (gym chains) \| `store` \| `coach` \| `center` \| `venue`. `p_q`: search (name, English name or owner
username, depending on kind), trimmed, ≤ 80; null/blank = all.
| key | type | meaning |
|---|---|---|
| `id` | uuid | chain / brand / coach **user** / center / venue id (use it for 7.14) |
| `name` | string | display name |
| `subtitle` | string | English name or tagline/headline (`""` when none) |
| `status` | string | club: `approved` (partner) \| `listed` \| `suspended` (hidden); others: `pending` \| `approved` \| `rejected` \| `suspended` (hidden) |
| `logo_path` | string or null | logo/image storage path |
| `avatar_url` | string or null | coach avatar |
| `owner_id`, `owner_username` | uuid / string or null | owner account (clubs: managers' usernames, `، `-separated) |
| `listed_by` | string | `owner` (signed up) \| `arq` (added by ARQ) |
| `partner` | boolean | partner flag (clubs: `gym_chains.partner`; coaches: approved; others: owner-listed and approved) |
| `meta` | object | per kind: club `{audience, branches, managers, offers}`; store `{category, city, products}`; coach `{city, specialties, clients}`; center `{kind, cities}` (licence number removed); venue `{sports, city, booking_url, courts, classes, upcoming}` |
| `created_at` | timestamp | |
Errors: `bad_status` (unknown kind).

### 7.14 `office_admin.partner_action(p_kind text, p_id uuid, p_action text, p_note text default null) returns jsonb`
`p_action`: `hide` \| `show` \| `partner_on` \| `partner_off` only (no approve/reject/delete here) → `admin_partner_action`,
which notifies the partner as in the app and writes `admin_log` (`kind = p_kind`, `action = p_action`, note).
`p_note` (trimmed, ≤ 300, optional) is the hide reason shown to the partner.
- clubs: `hide`/`show` switch the chain off/on; `partner_on`/`partner_off` set the partner flag.
- store / coach / center / venue: `hide` only an `approved` item (→ `suspended`), `show` only a `suspended` one
  (→ `approved`) — so «إظهار» never approves a pending or rejected request. `partner_on`/`partner_off` → `bad_status`
  (the flag exists for clubs only).
Returns `{"ok": true}`. Errors: `bad_status` (action/kind not allowed, or item in the wrong state), `request_not_found`.

### 7.15 `office_admin.users(p_q text default null, p_kind text default 'all', p_limit integer default 50, p_offset integer default 0) returns jsonb`
The app's user list (`admin_user_list`) **without `email` and `last_sign_in_at`**, newest accounts first.
`p_q`: search by username or full name (it also matches an email you type, but emails are never returned), ≤ 80.
`p_kind`: `all` \| `trainee` \| `partner` (account type other than trainee). `p_limit` clamped 1–200, `p_offset` ≥ 0.
Each row:
| key | type | meaning |
|---|---|---|
| `id` | uuid | user id |
| `username` | string | |
| `full_name`, `avatar_url` | string or null | |
| `account_type` | string | `trainee` \| `club` \| `coach` \| `store` \| `restaurant` \| `center` \| `venue` |
| `gender` | string or null | from the health profile |
| `created_at` | timestamp | sign-up time |
| `email_confirmed` | boolean | |
| `points` | int | |
| `gym_name`, `gym_name_en` | string or null | home gym |
| `is_admin` | boolean | |
| `partner_intent` | string or null | partner kind chosen at sign-up and not yet approved |
| `is_coach` | boolean | verified ✓ (toggle with 7.17) |
| `total` | int | number of matching users (same on every row; use it for paging) |
An offset past the end returns `[]`. Errors: `bad_input` (unknown kind).

### 7.16 `office_admin.update_user(p_user uuid, p_full_name text, p_username text) returns jsonb`
→ `admin_update_user`: full name trimmed (blank → null, ≤ 60), username trimmed and lower-cased (`^[a-z0-9_.]{3,24}$`,
unique). Writes `admin_log` (`kind 'user'`, `edit`, "old → new"). Returns `{"ok": true, "id", "username", "full_name"}`.
Errors: `user_not_found`, `bad_username`, `name_too_long`, `username_taken`.

### 7.17 `office_admin.set_verified(p_user uuid, p_value boolean) returns jsonb`
Verified ✓ → `set_coach`: sets `profiles.is_coach`; a coach profile follows (on → `approved`, off → `suspended`).
Writes `admin_log` (`kind 'coach'`, `verify` / `unverify`). Returns `{"ok": true, "is_coach": boolean}`.
Errors: `bad_input` (null value), `user_not_found`.

### 7.18 What lands in `admin_log` (actor = the owner)
| call | kind | action | written by |
|---|---|---|---|
| `save_ad`, `set_ad_active` | `ad` | `edit` / `show` / `hide` | `launch_ads` trigger |
| `save_event`, `set_event_active` | `event` | `create` / `edit` / `show` / `hide` | `local_events` trigger |
| `save_nudge`, `set_nudge_active` | `nudge` | `create` / `edit` / `show` / `hide` | `office_admin` |
| `save_setting` | `setting` | `edit` | `app_settings` trigger |
| `partner_action` | `club` \| `store` \| `coach` \| `center` \| `venue` | the action | `admin_partner_action` |
| `update_user` | `user` | `edit` | `admin_update_user` |
| `set_verified` | `coach` | `verify` / `unverify` | `office_admin` |
Change requests are not logged (the table is the record).
