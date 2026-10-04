# subscription-platform

Subscription billing API. Next.js route handlers, Prisma, Postgres.

## Running it

Copy `.env.example` to `.env` and fill in `DATABASE_URL` and `PAYMENT_WEBHOOK_SECRET`.

```
npm install
npm run db:deploy
npm run db:seed
npm run dev
```

The seed adds three plans. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` first if you want an admin account.

`npm test` runs the unit tests. `npm run test:integration` needs the database.

## Endpoints

```
POST  /api/auth/register
POST  /api/auth/login
POST  /api/auth/logout
POST  /api/auth/logout-all
POST  /api/auth/password
GET   /api/auth/me

GET   /api/plans
GET   /api/plans/:id
POST  /api/plans              admin
PATCH /api/plans/:id          admin

GET   /api/subscriptions
POST  /api/subscriptions      { planId }
GET   /api/subscriptions/me
POST  /api/subscriptions/cancel
POST  /api/subscriptions/resume

GET   /api/payments
POST  /api/payments
GET   /api/payments/:id
GET   /api/payments/:id/events

POST  /api/webhooks/payments
GET   /api/health
```

## Payments

There's no real payment provider hooked up yet. Subscribing creates a pending subscription and a pending payment. A webhook call marks the payment as paid, and that activates the subscription. To fake it locally:

```
npm run webhook:send -- <paymentId> succeeded
```

The webhook is signed with `PAYMENT_WEBHOOK_SECRET`: the `x-webhook-signature` header is `t=<unix time>,v1=<hmac sha256 of "t.body">`. The body is `{ id, type, data: { paymentId, amount, currency } }`, where type is `payment.succeeded`, `payment.failed` or `payment.refunded`. The amount and currency have to match the payment or it gets rejected and flagged for a manual refund.

Cancelling keeps access until the end of the period. Send `{ "immediate": true }` to end it now, or call `/resume` to undo it.

## Production

- Set `TRUSTED_PROXY_HOPS` to the number of proxies in front of the app (0 if none). Without it login and register return 500.
- Run `npm run maintenance` every hour or so.
- There's no email verification or password reset yet.
