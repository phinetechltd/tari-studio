# Deploying Tari Studio

Two processes share one Postgres database:

| Process | Command | What it does |
|---|---|---|
| web | `npm run start` (port 3400) | Console, landing page, API, webhooks, tracked links |
| worker | `npm run worker` | Publishing, automations, image/video generation, plan renewals and monthly credits, housekeeping |

**The worker must always run.** Without it nothing is published, no automation replies, no generation finishes, and no plan renews or gets its monthly credits. `/api/health` reports `degraded` when queued jobs are more than five minutes overdue.

## 1. Server prerequisites

- Node.js 20 or newer, and Postgres 15 or newer.
- A domain with **HTTPS**. Meta and Safaricom refuse plain-HTTP webhooks and callbacks.
- Pin the database to UTC once: `ALTER DATABASE agency SET timezone TO 'UTC';` (Prisma stores naive UTC; any other zone shifts every schedule).

## 2. Environment

Copy `.env.example` to `.env` on the server and fill it in there. Never copy `.env` between machines.

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | the production database |
| `AUTH_SECRET` | `openssl rand -base64 48` |
| `CREDENTIALS_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **Back this up.** Losing it makes every stored channel token unreadable. |
| `APP_BASE_URL` | `https://your-domain` (OAuth redirects, webhooks, tracked links and media links are built from it) |
| `REQUIRE_TOTP` | `true` |
| `AI_PROVIDER` / `ANTHROPIC_API_KEY` | `anthropic` and your key |
| `META_PROVIDER` / `META_APP_ID` / `META_APP_SECRET` / `META_WEBHOOK_VERIFY_TOKEN` | `graph` and your Meta app's values |
| `PAYMENT_PROVIDER` + `MPESA_*` | `daraja` with production Daraja credentials |
| `PAYSTACK_PROVIDER` / `PAYSTACK_SECRET_KEY` | `paystack` and your `sk_live_…` key, or `off` to offer M-Pesa only |
| `NEXT_PUBLIC_PRODUCT_NAME` | `Tari Studio` (read at build time) |
| `GENERATION_PROVIDER` / `HF_CREDENTIALS` | `higgsfield` and your key |
| `EMAIL_PROVIDER` | `smtp` |

Production refuses to start a stand-in: `simulator`, `fixtures` or `console` providers throw on first use when `NODE_ENV=production`.

Every provider key except the database, `AUTH_SECRET`, `CREDENTIALS_KEY` and `APP_BASE_URL` can instead be set by a platform admin in the console (*Platform admin → Settings → Deployment keys*), including Paystack.

## 3. Build and migrate

```bash
npm ci
npx prisma migrate deploy
npm run build
npm run check:providers
```

`check:providers` makes one cheap live call to each configured provider (an AI reply, a Meta app token, a Daraja OAuth token, a Paystack transaction list) and exits non-zero if any fails. Never run `prisma migrate reset` or `npm run db:seed` against production.

## 4. Services (systemd)

`/etc/systemd/system/agency-web.service`:

```ini
[Unit]
Description=Agency platform web
After=network.target postgresql.service

[Service]
WorkingDirectory=/var/www/agency-platform/platform
EnvironmentFile=/var/www/agency-platform/platform/.env
ExecStart=/usr/bin/npm run start
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

`agency-worker.service` is the same with `ExecStart=/usr/bin/npm run worker` and `KillSignal=SIGTERM` (the worker finishes the job in hand before exiting, so a deploy never abandons a post half-published).

## 5. nginx

```nginx
server {
  server_name your-domain;
  client_max_body_size 10m;
  location / {
    proxy_pass http://127.0.0.1:3400;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
  # certbot adds listen 443 ssl and the certificate lines
}
```

## 6. Meta app (Facebook, Instagram, WhatsApp)

1. In developers.facebook.com, create a **Business** app and add **Facebook Login for Business** and **WhatsApp**.
2. Facebook Login → valid OAuth redirect URI: `https://your-domain/api/channels/meta/callback`.
3. Permissions used: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`. Your own Pages work in Development mode. Serving other businesses' Pages needs **Business Verification** and **App Review** for these permissions.
4. WhatsApp → Configuration → Webhook: callback `https://your-domain/api/webhooks/whatsapp`, verify token = `META_WEBHOOK_VERIFY_TOKEN`, then subscribe to **messages**. Every delivery is checked against `META_APP_SECRET`.
5. For each WhatsApp number: in Business Settings create a **System User** with `whatsapp_business_messaging` and `whatsapp_business_management`, generate a permanent token, then paste the **Phone number ID** and that token into *Social → Connect → WhatsApp* in the console. The token is tested before it is stored, and encrypted at rest.
6. **An agency can bring its own Meta app** instead: an Owner saves its app ID, app secret and a verify token under *Settings → Gateways → Social media*. Facebook Login, publishing and WhatsApp sends then run under that app (each channel remembers which app issued its token), and the agency registers the same webhook URL in its own app with its own verify token. A webhook delivery is accepted only if it is signed by the deployment's app or by the own app of the organisation that owns the number it names.

## 7. Paystack (cards, M-Pesa and Apple Pay; plan renewals)

1. In the Paystack dashboard (Settings → API Keys & Webhooks), copy the **secret key** into `PAYSTACK_SECRET_KEY` (or Deployment keys), and set `PAYSTACK_PROVIDER=paystack`.
2. Set the **webhook URL** to `https://your-domain/api/webhooks/paystack`. Every delivery is checked against the secret key (`x-paystack-signature`), and even then only triggers a verify by reference: nothing is marked paid on the webhook's word.
3. Customers come back from Paystack to `/billing` (plans, top-ups) or their order page; both verify the payment immediately, so a payment confirms even if its webhook is lost. The worker also re-verifies checkouts nobody came back from, every minute, and gives up after two hours.
4. Plans paid by card store Paystack's reusable authorization, sealed with `CREDENTIALS_KEY`, and renew by `charge_authorization` when the period ends; a declined card is retried daily three times. Plans paid by M-Pesa never renew themselves; owners get a reminder three days before the end.
5. Prices are set by a platform admin in *Platform admin → Pricing*: plan prices and monthly credits, credits per image and per 5 seconds of video, generations at once, and top-up packs (the smallest sets the pay-as-you-go rate). Saving needs two-factor sign-in and is audited. Until something is saved the defaults in `src/lib/pricing.ts` apply (Higgsfield's plans in shillings: USD × 130 × 1.3, rounded up to KES 50). New prices apply to new purchases; existing subscriptions renew at the price they were bought at until they change plan.

## 8. Email and SMS notifications

1. **Email**: in *Platform admin → Settings → Deployment keys → Email (SMTP)* set Mode = Live (SMTP), the host, port (587, or 465 with "TLS from the start"), username, password (an app password where offered) and the From address. Production refuses the console stand-in, so invitations and notifications fail loudly until this is set.
2. **SMS**: under *SMS (Bonga)* set Mode = Live, the API client ID, key, secret and service ID from the Bonga portal. Only `status: 222` in Bonga's reply counts as sent. `SMS_DAILY_CAP` (default 300 a day, platform-wide) stops a runaway loop draining the Bonga balance; texts past it are logged as "Not sent". Set Mode = Off to send no SMS at all.
3. *Platform admin → Notifications*: send yourself a test email and SMS, and choose which channels each event uses. By default SMS goes only to urgent events (renewal failed, plan ending, credits used up, AI credits low or exhausted). People choose their own email/SMS for ordinary events in *Profile*; essential ones cannot be switched off. Every message, sent or not, is in the delivery log with the reason.
4. Emails and SMS are sent by the **worker** (`notify.deliver` jobs), so it must be running. Failures are retried three times, then shown as Failed with a Retry button.

## 9. AI credits and models

1. Higgsfield has no balance API. After buying credits on console.higgsfield.ai, record the top-up in *Platform admin → AI & credits* (credits, US$ paid, purchase date: credits expire a year after purchase). Each finished render subtracts what Higgsfield's estimate endpoint said it would cost; failed, blocked and cancelled renders cost nothing. Use **Match the Higgsfield console** now and then to correct drift.
2. Set the **low balance** alert and, optionally, monthly budgets for Higgsfield credits and text AI (US$). They only alert (in the app, by email, and SMS for low credits); customers are never stopped by a budget, only by Higgsfield itself refusing (which also alerts, once a day).
3. **Models**: Soul 2 (images) and Seedance 2.5 (video) are on by default at the price list's rates. Kling 3.0 and Hailuo 2.3 are in the catalogue switched off: set their price per started 5 seconds, then switch them on. Each mode has one default; image and video always keep at least one enabled model. Changing models or prices needs two-factor sign-in and is audited.
4. Each organisation's plan sets a monthly **AI writing allowance** (captions, replies, briefs; `aiCreditsMicros` in *Organisation → Limits*). Reaching it tells the owners once and refuses further AI writing until the 1st. An organisation that saved its own AI or Higgsfield key in its Settings pays its provider directly and is not limited or counted.

## 10. Launch checklist

The *Organisations* page shows a **Ready for customers?** card until each item is true: HTTPS `APP_BASE_URL`, `CREDENTIALS_KEY` set, live payments, live generation, live AI, SMTP email, Bonga SMS (or SMS off), a Higgsfield top-up recorded and a low-credit alert set. Before going live also:

- `npm run verify` (typecheck, unit tests, encoding, brand, permissions, **links**, integration) passes.
- `npm run crawl -- http://localhost:3400` against a seeded copy reports no broken pages or files.
- `npm run build` succeeds on the build machine.

## 11. After deploying

- `curl https://your-domain/api/health` should return `"status":"ok"`, with the worker reported ok.
- Platform admin → Settings → Deployment keys → **Test connections** (AI, Meta, M-Pesa, Paystack, email, SMS, image & video).
- Platform admin → Notifications → send a test email and SMS.
- Social → Test connection on each channel.
- Back up the database nightly (`pg_dump`) and the `STORAGE_DIR` folder, which holds generated media.

## 12. Accounts, sign-in and recovery

People create their own accounts at `/signup` and confirm their email with a 6-digit code or the emailed button before they can sign in. A new account has no team until it creates one (`/welcome`) or accepts an invitation. Passwords are recovered at `/forgot-password` by an emailed code or link, or by a text to a phone the person has confirmed in their profile. Codes live 15 minutes, allow five tries and work once; they are stored only as hashes.

1. **Email is required for all of this.** Without live SMTP, nobody can sign up or recover a password (production refuses the console stand-in). Set it under *Platform admin → Settings → Email (SMTP)*, or in `.env`. For a Gmail sender: host `smtp.gmail.com`, port `465`, "TLS from the start" on, username the full Gmail address, **an app password** (Google Account → Security → 2-Step Verification → App passwords; never the normal password), From name `Tari Studio`, From address and reply-to the same Gmail address. The password is sealed at rest, shown only as `••••last4`, and must never be committed. If it was ever pasted into a chat or a ticket, create a new one and revoke the old.
2. **SMS codes** use the same Bonga setup as notifications and reach Kenyan numbers only. They are rate-limited per person and per number, but each one costs money, so watch the Bonga balance and `SMS_DAILY_CAP` does **not** apply to codes.
3. **Google sign-in** (optional): in Google Cloud Console create an OAuth client of type *Web application*, add the authorised redirect URI `https://your-domain/api/auth/google/callback`, then paste the client ID and secret into *Platform admin → Settings → Google sign-in*. The Google buttons on the sign-in and sign-up pages appear only once both are saved. A Google email that matches an existing account links to it; anyone with an authenticator app set up must still sign in with password and code.
4. **Roles**: Owners manage members under *Team* (role, extra permissions, suspend, remove); every person sees all of their teams under *My teams* and can leave one. A team always keeps one active Owner.
5. Legal pages `/privacy` and `/cookies` are drafts written for the Kenya Data Protection Act: have a lawyer review them before launch and keep them in step with what the platform really does.

## 13. Operating notes

- `GET /api/health` is public and reports only up/down, the database and the job queue. Send the header `x-health-token: <HEALTH_TOKEN>` (set `HEALTH_TOKEN`) to see which providers are live.
- The server validates its configuration at start (`src/instrumentation.ts`); a bad `AUTH_SECRET` or `DATABASE_URL` stops the deploy instead of failing on the first request.
- nginx: turn on `gzip on;` for text, JSON and SVG; serve `/_next/static/` with `Cache-Control: public, max-age=31536000, immutable` (Next sets it; do not strip it); allow `client_max_body_size 12m;` for image uploads; keep TLS and HSTS in the server block (certbot). The app sets its own security headers and a Content-Security-Policy.
- Backups: `pg_dump` nightly and a copy of `STORAGE_DIR`; keep at least 14 days. To restore: stop the web and worker services, `createdb` a fresh database, `psql` the dump into it, restore `STORAGE_DIR`, run `npx prisma migrate deploy`, start the services, then check `/api/health`. Test a restore before you need one.
- Logs go to the service output (`journalctl -u agency-web -u agency-worker`); rotate them with the journal's size limit (`SystemMaxUse=`).
