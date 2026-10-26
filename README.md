# Stand Firm

A panic button for Christian men fighting sexual temptation. Hold the button and
everyone in your accountability circle gets a notification asking them to pray
for you and reach out. They can tap **Pray** (you're notified that they're
praying) or text/call you straight from the app.

It runs two ways from the same code:

- **Web app**: open a link in Safari and Add to Home Screen. No App Store and no
  Apple Developer account, and it gets notifications on iOS 16.4+.
- **Native app** for iOS and Android, built with Expo.

> “If a man prevails against one who is alone, two shall withstand him; and a
> threefold cord is not quickly broken.” — Ecclesiastes 4:12

![Home screen](docs/screenshots/home.png)

## Features

- **Hold-to-send panic button** (1.5 s hold, so it can't go off by accident).
- **Circles**: create a group, share its 6-letter invite code, join others'. You
  choose which circles to alert (all by default). Anyone you trust can be in a
  circle; for a small group, just make one circle for everyone.
- **Discreet notifications**: the lock-screen text only says the person "needs
  backup" and is asking for prayer. The optional note is only visible in the app.
- **Prayer requests feed**: see who is asking, pray, text or call them.
- **"Way of escape" screen** after sending, with practical next steps and a live
  list of who is praying for you. Tap **I made it through** when it's over.
- **Rotating scripture** on the home screen (29 verses, World English Bible,
  public domain). Edit `src/lib/verses.ts` to change them.

## How it's built

| Part | Tech |
| --- | --- |
| App (web, iOS, Android) | Expo SDK 58, Expo Router, React Native Web, TypeScript |
| Accounts, database | Supabase (Postgres with row level security) |
| Push notifications | Supabase Edge Functions send to both Expo push (native) and Web Push (web app) |

```
src/app/                screens (Expo Router)
  (tabs)/index.tsx      home: verses + panic button
  (tabs)/alerts.tsx     prayer request feed
  (tabs)/circles.tsx    create / join / invite
  (tabs)/profile.tsx    name, phone, sign out
  sent.tsx              shown after you send an alert
  alert/[id].tsx        opened when you tap a notification
  sign-in.tsx
src/components/         hold button, verse carousel, alert card, UI kit
src/lib/                Supabase client, auth, notifications, data helpers
                        (*.web.ts files are the web versions)
public/                 web app shell: index.html, manifest, service worker, icons
supabase/migrations/    database schema + security rules
supabase/functions/     send-alert, send-prayer (push notifications)
```

## Setup

You need a free account at [supabase.com](https://supabase.com) and Node.js 20+.

### 1. Supabase (the backend)

1. Create a new Supabase project.
2. Make a key pair for web notifications (VAPID keys). Keep the private key secret:
   ```sh
   npx web-push generate-vapid-keys
   ```
3. Install the CLI (`npm i -g supabase`), then from this folder:
   ```sh
   supabase login
   supabase link --project-ref <your-project-ref>
   supabase db push                 # creates the tables and security rules
   supabase secrets set VAPID_PUBLIC_KEY=<public key> VAPID_PRIVATE_KEY=<private key> \
     VAPID_SUBJECT=mailto:<your email>
   supabase functions deploy send-alert
   supabase functions deploy send-prayer
   ```
   `VAPID_SUBJECT` must be a real `mailto:` address, or Apple rejects the notifications.
4. Optional, for easier testing: in **Authentication → Sign In / Providers →
   Email**, turn off **Confirm email**. Otherwise new users must click the link
   in their confirmation email before signing in.

Then copy the environment file and fill it in:

```sh
npm install
cp .env.example .env.local   # Supabase URL + anon key, and the VAPID *public* key
```

### 2a. Web app (iPhone Home Screen), no App Store needed

```sh
npm run build:web            # writes the site to dist/
```

Put `dist/` on any HTTPS host. The easiest is **Netlify Drop**: go to
<https://app.netlify.com/drop> and drag the `dist` folder onto the page. You
get a link like `https://stand-firm-123.netlify.app`. (`dist/_redirects`
makes links like `/alert/<id>` work there. `vercel.json` does the same for
Vercel.) Run `npm run build:web` and upload again whenever you change the app.

**On each iPhone** (iOS 16.4 or newer):

1. Open the link in **Safari** and sign up.
2. Tap the **Share** button, then **Add to Home Screen**.
3. Open **Stand Firm from the Home Screen icon** (not Safari) and tap **Turn on
   notifications**, then **Allow**.

The app shows these steps itself if someone opens it in a Safari tab.
Notifications only arrive in the Home Screen version. That's an iOS rule. On
Android and desktop, Chrome can get notifications without installing.

### 2b. Native app (optional)

```sh
npx eas-cli@latest init      # links an Expo project; needed for push tokens
npx eas-cli@latest build --profile development --platform android   # or ios
npx expo start
```

Push notifications need a real device and a development build. Expo Go can't
receive remote notifications on Android. For iOS you also need an Apple Developer
account, and `eas build` walks you through creating the push key. Change
`ios.bundleIdentifier` and `android.package` in `app.json` from
`com.example.standfirm` to your own first.

### 3. Try it

Sign up on two phones, create a circle on one, join it with the code on the
other, then hold the button. Web and native users can be in the same circle.

## Before you release

- Proofread the verses in `src/lib/verses.ts` against a printed WEB Bible.
- The name "Life Alert" is a registered trademark of an emergency-response
  company, which is why the app is called Stand Firm here. Rename it in
  `app.json` if you like.
- The web app has an icon (`public/icons/`). For the native app, add an icon and
  splash image in `assets/images/`.

## Development

```sh
npx tsc --noEmit                                                  # typecheck the app
npx deno check --node-modules-dir=none supabase/functions/*/index.ts  # typecheck functions
npx expo start --web                                              # run the web app locally
```
