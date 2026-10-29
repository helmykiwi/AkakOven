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
