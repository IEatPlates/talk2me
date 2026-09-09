# talk2me

A calm, private chat workspace for conversations with friends. The app includes username authentication, friend-request acceptance, direct and group chat flows, unread state, and browser notification permission handling.

## Run locally

```bash
npm install
cp .env.example .env.local
npm run dev
```

Without Supabase keys, the app runs in demo mode so the interface and chat flows can be explored locally. Demo messages are held in browser memory.

## Connect Supabase

1. Create a Supabase project.
2. In the Supabase SQL editor, run [`supabase/schema.sql`](supabase/schema.sql).
3. Copy the project URL and anon key into `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

4. In Supabase Auth > Providers > Email, turn off **Confirm email**. Users only enter a username in talk2me; Supabase internally receives a private email-shaped identifier because its password provider requires one.
5. In Supabase Auth, add your local and Vercel URLs to the Site URL / Redirect URLs.

The schema creates profiles from new auth users, friend requests, conversations, memberships, messages, unread notifications, row-level security policies, and realtime publications for messages and notifications.

## Deploy to Vercel

Import the repository into Vercel, add the two `NEXT_PUBLIC_SUPABASE_*` environment variables for Preview and Production, then deploy. The app is a standard Next.js App Router project and requires no custom server.