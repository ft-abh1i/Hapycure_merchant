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
        ├── onboarding.js
        └── dashboard.js
```

## Pages

- `onboarding/` — service selection and business setup
- `dashboard/` — adaptive dish or mess-plan management

The app currently stores partner data in browser `localStorage`. Business location is captured with the browser Geolocation API and converted into an address through reverse geocoding.
