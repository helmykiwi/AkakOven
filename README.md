# AkakOven

Sourdough pre-order storefront built with Firebase Hosting, Firestore and Firebase Authentication.

## Customer flow

Browse the menu, add loaves to the basket, choose pickup or self-arranged delivery, and send an order. Orders are stored in Firestore; the site falls back to local browser storage while Firebase is not connected.

## Admin setup

1. Enable Email/Password in Firebase Authentication.
2. Create the intended admin user.
3. Add a Firestore document at `admins/<user-uid>` so the user can access `admin.html`.
4. Deploy rules and Hosting with `firebase deploy`.

Firebase project: `akakoven`.

## Delivery quotation setup

Delivery quotations run through the `asia-southeast1` Firebase Functions backend. Checkout accepts delivery only when the server has created a Lalamove quote and its road route is 15 km or less. Provider secrets must never be put in storefront JavaScript, Firestore settings, or Git.

1. The bakery pickup address and coordinates are set in `functions/.env.akakoven.example`.
2. Add the Lalamove Sandbox `LALAMOVE_API_KEY` and `LALAMOVE_API_SECRET` as Firebase Functions secrets. No Google Geocoding API key is needed: checkout asks the customer to place a pin on an OpenStreetMap map and sends its coordinates with the typed address.
3. Keep the Sandbox endpoint until the flow has been checked and approved for production. The real environment file is ignored by Git.
4. Deploy Functions and Firestore rules before enabling delivery. Firebase Functions requires a billing-enabled Firebase project.

The current quote flow uses Lalamove only. It retrieves a price and route distance from Sandbox; it does not create a paid order or automatically book a driver after payment.
