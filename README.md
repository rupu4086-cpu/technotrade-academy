# TechnoTrade Academy

English trading education for Stock, Crypto and Forex: structured courses,
risk-first teaching, and secure Razorpay checkout. Education only — not
investment advice. No certificates.

## What is live here

Public site (Next.js 14, App Router, TypeScript, Tailwind, Astra design —
deep navy, off-white, teal, Inter):

- Home, Courses (filters All / Stock / Crypto / Forex / Psychology / Advanced),
  Course Detail (curriculum, free preview, Buy Now), About, Contact, Pricing
  (Basic ₹999 / Pro ₹1,999 / Elite ₹4,999), Community, My Learning, Account,
  Checkout, Sign Up, Log in.
- Sign Up (name, email, password) and Log in (email + password, plus an
  email-code alternative) both work and create/use real rows in the Supabase
  `users` table. Passwords are stored as salted scrypt hashes, never plain.
- The public site contains NO admin UI, link or route. Admin lives in the
  separate `admin-app/` folder, deployed as its own Vercel project.

## Data

All data lives in Supabase PostgreSQL, using the 15 tables already created
in the owner's project (users, courses, course_modules, course_lessons,
enrollments, lesson_progress, orders, payments, promo_codes,
promo_redemptions, webhook_events, enquiries, settings, ads,
community_posts). The site reads them through Supabase PostgREST
(`src/lib/supabase.ts`). No Prisma migrations are run against Supabase.
An empty catalog honestly shows "Courses coming soon".

## Checkout rule (critical)

A paid course creates a PENDING order first. Promo discounts are calculated
server-side only from `promo_codes`. Access is granted ONLY after a Razorpay
payment is verified: signature check, then the payment is re-read from
Razorpay and must be status `captured`, unrefunded, for the exact order
amount. Free / Rs 0 totals unlock instantly. Promo usage counts exactly
once, at payment. Prices include 18% GST at checkout.

## Environment variables (placeholders in .env.example — never commit real values)

- NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY (server only, never in the browser)
- DATABASE_URL (only used by Prisma generate at build time; the site itself
  uses Supabase PostgREST, not Prisma, at runtime)
- RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, RAZORPAY_WEBHOOK_SECRET
- NEXT_PUBLIC_RAZORPAY_KEY_ID (public key id for the checkout widget)
- ADMIN_EMAIL, SESSION_SECRET
- APP_URL

## Before going live

- Set the env vars above in Vercel (public project AND the separate
  admin-app project — service-role key only in the admin project).
- Row Level Security is OFF on the Supabase tables (pre-existing state).
  Add RLS policies in Supabase before trusting the live deployment with
  real user data.
- Save Razorpay keys (test mode first) and run a real test payment.
- Add courses from the admin app; the public catalog starts empty.

## Develop

```bash
npm install
npm run build   # prisma generate + next build
npm start
```
