# Subscription Platform

Backend API for subscription billing. Next.js route handlers, Prisma 7 and PostgreSQL.

## Setup

Copy `.env.example` to `.env` and set `DATABASE_URL` and `PAYMENT_WEBHOOK_SECRET`, then:

```
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

`npm install` also generates the Prisma client. To create an admin user while seeding, set `ADMIN_EMAIL` and `ADMIN_PASSWORD`.

Other scripts: `npm test`, `npm run test:integration` (needs the database), `npm run typecheck`, `npm run lint`, `npm run format`, `npm run maintenance`, and `npm run webhook:send -- <paymentId> <succeeded|failed|refunded>` to play the payment provider locally.

## How billing works

Subscribing creates a pending subscription and a pending payment. The payment provider confirms the payment by calling `POST /api/webhooks/payments`, and that is the only thing that changes a payment's status. A successful payment activates the subscription, or extends it on renewal. A refund cancels it. A failed first payment leaves the subscription pending so the user can retry with `POST /api/payments`.

Cancelling an active subscription keeps access until the paid period ends. `{"immediate": true}` cancels straight away, and `POST /api/subscriptions/resume` undoes a scheduled cancellation. Lapsed subscriptions are reported as expired on read and saved as expired by the next write or by `npm run maintenance`.

The webhook expects:

```
x-webhook-signature: t=<unix seconds>,v1=<hex hmac-sha256 of "<t>.<raw body>">

{ "id": "evt_1", "type": "payment.succeeded",
  "data": { "paymentId": "<uuid>", "amount": "9.99", "currency": "GBP" } }
```

Event types are `payment.succeeded`, `payment.failed` and `payment.refunded`. Signatures older than five minutes are rejected, repeated event ids are ignored, and an amount or currency that doesn't match the payment is rejected and the payment is flagged `requiresRefund`. To rotate the secret, put the old one in `PAYMENT_WEBHOOK_SECRET_PREVIOUS` until the provider has switched.

## API

Errors look like `{ "error": "...", "details": { ... } }`.

- Auth: `POST /api/auth/register`, `login`, `logout`, `logout-all`, `password`; `GET /api/auth/me`
- Plans: `GET /api/plans`, `GET /api/plans/:id`; admin only: `POST /api/plans`, `PATCH /api/plans/:id`
- Subscriptions: `GET /api/subscriptions`, `POST /api/subscriptions`, `GET /api/subscriptions/me`, `POST /api/subscriptions/cancel`, `POST /api/subscriptions/resume`
- Payments: `GET /api/payments`, `POST /api/payments`, `GET /api/payments/:id`, `GET /api/payments/:id/events`
- `POST /api/webhooks/payments`, `GET /api/health`

## Running in production

- Set `TRUSTED_PROXY_HOPS` to the number of reverse proxies in front of the app (0 if none). Rate-limited routes return 500 without it, because the client IP can't be trusted otherwise.
- Run `npm run maintenance` on a schedule, for example hourly. It closes lapsed subscriptions, deletes expired sessions and rate-limit rows, and lists payments that need a manual refund (it exits with code 2 if there are any).
- Logs are one JSON object per line with an `event` name, and every response has an `x-request-id`. Worth alerting on: `billing.refund_required`, `billing.amount_mismatch` and `http.unhandled_error`.
- Rate limits are stored in Postgres: 5 login attempts per 15 minutes per IP and email, 10 signups per hour per IP, and 20 writes per minute per user.
- Browser write requests from other origins get a 403. Add trusted frontends to `ALLOWED_ORIGINS`.
- New passwords are checked against Have I Been Pwned. Set `PASSWORD_BREACH_CHECK=off` to skip that.

## Not done

There is no email verification or password reset, so signup still says when an email is already registered. Payments are simulated: there is no real provider integration.
