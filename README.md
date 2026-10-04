# Subscription Platform

A backend for selling subscriptions. People create an account, pick a monthly or yearly plan, pay for it, and can cancel or renew later. It's a JSON API with no frontend, so it's meant to sit behind a web or mobile app. Built with Next.js route handlers, Prisma and PostgreSQL.

## What it does

- Accounts: sign up, log in with a cookie session, change your password, log out of every device.
- Plans: an admin creates and edits plans (name, price, currency, monthly or yearly). Anyone can list the active ones.
- Subscriptions: each user has at most one live subscription. Cancelling keeps access until the paid period ends, or ends it immediately if asked. A scheduled cancellation can be undone.
- Payments: every subscription has payments, and a payment is only marked as paid when the payment provider says so through a signed webhook. Retrying a failed payment or renewing creates a new one.
- Operations: rate limits on the sensitive routes, JSON logs with request ids, and a maintenance script that closes lapsed subscriptions and lists payments that need a manual refund.

No real payment provider is connected yet. `npm run webhook:send` plays the provider for local testing.

## Running it

Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `PAYMENT_WEBHOOK_SECRET`. Then:

```
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

The seed adds three plans. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` first if you want an admin account too. `npm test` runs the unit tests, and `npm run test:integration` runs the ones that need the database.

## API

```
POST  /api/auth/register
POST  /api/auth/login
POST  /api/auth/logout
POST  /api/auth/logout-all
POST  /api/auth/password
GET   /api/auth/me

GET   /api/plans
GET   /api/plans/:id
POST  /api/plans                  admin
PATCH /api/plans/:id              admin

GET   /api/subscriptions
POST  /api/subscriptions          { planId }
GET   /api/subscriptions/me
POST  /api/subscriptions/cancel   { immediate? }
POST  /api/subscriptions/resume

GET   /api/payments
POST  /api/payments
GET   /api/payments/:id
GET   /api/payments/:id/events

POST  /api/webhooks/payments      called by the payment provider
GET   /api/health
```

Errors come back as `{ "error": "...", "details": { ... } }`.

## Payment webhook

The provider signs each request with `PAYMENT_WEBHOOK_SECRET`. The `x-webhook-signature` header is `t=<unix time>,v1=<hmac sha256 of "t.body">`, and the body looks like this:

```
{ "id": "evt_1", "type": "payment.succeeded",
  "data": { "paymentId": "<uuid>", "amount": "9.99", "currency": "GBP" } }
```

`type` is `payment.succeeded`, `payment.failed` or `payment.refunded`. The amount and currency must match the payment, otherwise the event is rejected and the payment is flagged for a manual refund. Old signatures and repeated event ids are ignored. To rotate the secret, put the old one in `PAYMENT_WEBHOOK_SECRET_PREVIOUS` until the provider has switched over.

## Deploying

Set `TRUSTED_PROXY_HOPS` to the number of reverse proxies in front of the app (0 if there are none). Without it login and register return 500, because the rate limiter can't tell clients apart. Run `npm run maintenance` every hour or so.

There's no email verification or password reset yet.
