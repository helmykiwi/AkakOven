# Sealy Blox Shop

Static storefront for Robux via username. The frontend uses Firebase Authentication and Cloud Firestore when `firebase-config.js` is configured.

## Firebase setup

1. In Firebase Console, create a Web app inside the `sealybloxshop` project.
2. Copy its config object into `firebase-config.js`.
3. Enable Google Authentication, Cloud Firestore, and Firebase Storage.
4. Add your own account to the `admins` collection with a document ID equal to your Firebase Auth UID and `{ active: true }`.
5. Publish both `firestore.rules` and `storage.rules`, then deploy this folder to Netlify.

## Firestore rules

Use the supplied `firestore.rules` after replacing the first admin UID with your own Firebase Auth UID.
