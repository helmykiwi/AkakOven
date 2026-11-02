const crypto = require('node:crypto');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');

initializeApp();
const db = getFirestore();
const LALAMOVE_API_KEY = defineSecret('LALAMOVE_API_KEY');
const LALAMOVE_API_SECRET = defineSecret('LALAMOVE_API_SECRET');

const REGION = 'asia-southeast1';
const MAX_DELIVERY_METERS = 15000;
const VALID_BASE_URLS = new Set([
  'https://rest.sandbox.lalamove.com',
  'https://rest.lalamove.com'
]);

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new HttpsError('failed-precondition', `Shipping setting ${name} belum disediakan.`);
  return value;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const radians = degrees => degrees * Math.PI / 180;
  const deltaLat = radians(lat2 - lat1);
  const deltaLng = radians(lng2 - lng1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(a));
}

function signedHeaders(method, path, body, apiKey, apiSecret, market) {
  const timestamp = Date.now().toString();
  const raw = `${timestamp}\r\n${method}\r\n${path}\r\n\r\n${body}`;
  const signature = crypto.createHmac('sha256', apiSecret).update(raw).digest('hex');
  return {
    Authorization: `hmac ${apiKey}:${timestamp}:${signature}`,
    'Content-Type': 'application/json',
    Market: market,
    'Request-ID': crypto.randomUUID()
  };
}

async function lalamoveRequest(path, method, data, apiKey, apiSecret, baseUrl, market) {
  const body = data === undefined ? '' : JSON.stringify({ data });
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: signedHeaders(method, path, body, apiKey, apiSecret, market),
    ...(body ? { body } : {})
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.error('Lalamove API rejected request', response.status, result?.message || result?.errors?.message);
    if (response.status === 422 && /OUT_OF_SERVICE_AREA/i.test(JSON.stringify(result))) {
      throw new HttpsError('out-of-range', 'Alamat ini di luar kawasan penghantaran Lalamove.');
    }
    throw new HttpsError('unavailable', 'Lalamove belum dapat memberikan quotation. Sila cuba lagi.');
  }
  return result.data || {};
}

async function limitQuoteRequests(request) {
  const ip = request.rawRequest?.ip || 'unknown';
  const key = crypto.createHash('sha256').update(ip).digest('hex').slice(0, 32);
  const ref = db.collection('shippingRateLimits').doc(key);
  const now = Date.now();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const windowStart = Number(data.windowStart || 0);
    const count = windowStart > now - 10 * 60 * 1000 ? Number(data.count || 0) : 0;
    if (count >= 8) throw new HttpsError('resource-exhausted', 'Terlalu banyak semakan alamat. Cuba semula dalam beberapa minit.');
    tx.set(ref, { windowStart: count ? windowStart : now, count: count + 1, updatedAt: FieldValue.serverTimestamp() });
  });
}

exports.quoteDelivery = onCall({
  region: REGION,
  secrets: [LALAMOVE_API_KEY, LALAMOVE_API_SECRET]
}, async request => {
  const address = String(request.data?.address || '').trim();
  if (address.length < 10 || address.length > 500) {
    throw new HttpsError('invalid-argument', 'Masukkan alamat penghantaran yang lengkap.');
  }
  const destinationLat = Number(request.data?.destinationLat);
  const destinationLng = Number(request.data?.destinationLng);
  if (!Number.isFinite(destinationLat) || destinationLat < -90 || destinationLat > 90 || !Number.isFinite(destinationLng) || destinationLng < -180 || destinationLng > 180) {
    throw new HttpsError('invalid-argument', 'Letakkan pin penghantaran pada peta sebelum semak caj delivery.');
  }
  const commerce = await db.collection('settings').doc('commerce').get();
  if (!commerce.exists || commerce.data()?.deliveryEnabled !== true) {
    throw new HttpsError('failed-precondition', 'Delivery online belum diaktifkan oleh AkakOven.');
  }
  await limitQuoteRequests(request);

  const baseUrl = requiredEnv('LALAMOVE_BASE_URL').replace(/\/$/, '');
  if (!VALID_BASE_URLS.has(baseUrl)) throw new HttpsError('failed-precondition', 'Alamat API Lalamove tidak sah.');
  const market = process.env.LALAMOVE_MARKET?.trim() || 'MY';
  const language = process.env.LALAMOVE_LANGUAGE?.trim() || 'ms_MY';
  const serviceType = process.env.LALAMOVE_SERVICE_TYPE?.trim() || 'MOTORCYCLE';
  const pickupAddress = requiredEnv('LALAMOVE_PICKUP_ADDRESS');
  const pickupLat = Number(requiredEnv('LALAMOVE_PICKUP_LAT'));
  const pickupLng = Number(requiredEnv('LALAMOVE_PICKUP_LNG'));
  if (!Number.isFinite(pickupLat) || pickupLat < -90 || pickupLat > 90 || !Number.isFinite(pickupLng) || pickupLng < -180 || pickupLng > 180) {
    throw new HttpsError('failed-precondition', 'Pin pickup bakery belum ditetapkan dengan betul.');
  }
  if (haversineMeters(pickupLat, pickupLng, destinationLat, destinationLng) > MAX_DELIVERY_METERS) {
    throw new HttpsError('out-of-range', 'Pin ini melebihi kawasan delivery AkakOven, iaitu maksimum 15 km dari bakery.');
  }

  const destination = { address, lat: destinationLat, lng: destinationLng };
  const quote = await lalamoveRequest('/v3/quotations', 'POST', {
    serviceType,
    language,
    stops: [
      { coordinates: { lat: String(pickupLat), lng: String(pickupLng) }, address: pickupAddress },
      { coordinates: { lat: String(destination.lat), lng: String(destination.lng) }, address: destination.address }
    ],
    item: { weight: 'LESS_THAN_3_KG', categories: ['FOOD_DELIVERY'] }
  }, LALAMOVE_API_KEY.value(), LALAMOVE_API_SECRET.value(), baseUrl, market);

  const distance = Number(quote.distance?.value);
  const distanceMeters = quote.distance?.unit === 'mi' ? distance * 1609.344 : distance;
  if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
    throw new HttpsError('unavailable', 'Jarak laluan belum dapat disahkan. Sila cuba lagi.');
  }
  if (distanceMeters > MAX_DELIVERY_METERS) {
    throw new HttpsError('out-of-range', 'Buat masa ini delivery AkakOven hanya dalam jarak maksimum 15 km dari bakery.');
  }

  const amount = Number(quote.priceBreakdown?.total);
  if (!quote.quotationId || !Number.isFinite(amount) || amount < 0) {
    throw new HttpsError('unavailable', 'Lalamove tidak memulangkan quotation yang sah.');
  }
  const expiresAt = quote.expiresAt || new Date(Date.now() + 5 * 60 * 1000).toISOString();
  await db.collection('deliveryQuotes').doc(quote.quotationId).set({
    provider: 'Lalamove',
    quotationId: quote.quotationId,
    fulfillment: 'delivery',
    pickupAddress,
    pickupLat,
    pickupLng,
    destinationAddress: destination.address,
    destinationLat: destination.lat,
    destinationLng: destination.lng,
    distanceMeters: Math.ceil(distanceMeters),
    deliveryFee: amount,
    currency: quote.priceBreakdown?.currency || 'MYR',
    expiresAt: new Date(expiresAt),
    state: 'quoted',
    createdAt: FieldValue.serverTimestamp()
  });

  return {
    provider: 'Lalamove',
    quotationId: quote.quotationId,
    deliveryFee: amount,
    currency: quote.priceBreakdown?.currency || 'MYR',
    distanceKm: Math.round((distanceMeters / 1000) * 10) / 10,
    expiresAt,
    address: destination.address,
    latitude: destination.lat,
    longitude: destination.lng
  };
});
