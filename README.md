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
        ├── cloudinary.js
        ├── onboarding.js
        └── dashboard.js
```

## Pages

- `onboarding/` — service selection and business setup
- `dashboard/` — adaptive dish or mess-plan management

The app currently stores partner data in browser `localStorage`. Business location is captured with the browser Geolocation API and converted into an address through reverse geocoding.

Dish images are converted to WebP and intelligently compressed in the browser before being uploaded to Cloudinary. The optimizer targets 30–50 KB while retaining the highest quality it can under the 50 KB ceiling. Uploads use the unsigned `hapycure_dishes` preset, and the Cloudinary API secret is never included in frontend code.
