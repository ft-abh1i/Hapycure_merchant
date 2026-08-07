# Hapycure Merchant

A mobile-first partner portal for restaurants, home kitchens, and mess providers.

## Structure

```text
.
├── index.html
├── onboarding/
│   └── index.html
├── dashboard/
│   └── index.html
└── assets/
    ├── css/
    │   └── styles.css
    └── js/
        ├── shared.js
        ├── firebase-sync.js
        ├── cloudinary.js
        ├── onboarding.js
        └── dashboard.js
```

## Pages

- `onboarding/` — service selection and business setup
- `dashboard/` — adaptive dish or mess-plan management

The app stores a local fallback in browser `localStorage` and publishes partner profiles, dishes, and mess plans to the same Firebase project used by the Hapycure customer app. Business location is captured with the browser Geolocation API and converted into an address through reverse geocoding.

Dish images are converted to WebP and intelligently compressed in the browser before being uploaded to Cloudinary. The optimizer targets 30–50 KB while retaining the highest quality it can under the 50 KB ceiling. Uploads use the unsigned `hapycure_dishes` preset, and the Cloudinary API secret is never included in frontend code.

## Firebase setup

1. In Firebase Console, open project `nutrilious-ceebd`.
2. Go to **Authentication → Sign-in method** and enable **Google**. Partner data is scoped to the signed-in Google account UID.
3. In **Firestore Database → Rules**, replace the editor contents with the complete rules from `firestore-merchant.rules.snippet`.
4. Publish the rules.
5. Add the deployed merchant website domain under **Authentication → Settings → Authorized domains**.

The rules cover both Hapycure apps: customer accounts and support tickets, plus partner profiles, dishes, and mess plans. The customer app listens to `restaurants`, `dishes`, and `messPlans` in real time. Active dishes and mess plans from an open partner appear automatically without copying data between repositories.
