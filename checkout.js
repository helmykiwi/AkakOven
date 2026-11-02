import { firebaseConfig } from './firebase-config.js';

const $ = selector => document.querySelector(selector);
const money = value => `RM${Number(value || 0).toFixed(2)}`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const params = new URLSearchParams(location.search);
const id = params.get('id');
const token = params.get('token');
const saved = sessionStorage.getItem('akakoven-checkout-summary');
const expected = sessionStorage.getItem('akakoven-checkout-token');
let db, fs;

function fail(message) {
  $('#payNow').disabled = true;
  $('#checkoutStatus').textContent = message;
}

async function init() {
  if (!id || !token || token !== expected || !saved) {
    fail('Checkout ini dah tamat. Kembali ke menu dan cuba semula.');
    return;
  }

  try {
    const { intent } = JSON.parse(saved);
    if (!intent || !Array.isArray(intent.items) || !intent.items.length) throw new Error('Invalid saved checkout');
    const method = intent.deliveryMethod === 'pickup_or_self_arrange'
      ? 'Pickup & self arrange delivery'
      : intent.deliveryMethod === 'akakoven_delivery' ? 'Delivery ke alamat anda' : 'Belum dipilih';
    const itemRows = intent.items.map(item => `<article class="checkout-line"><div class="checkout-product">${item.image ? `<img src="${escapeHtml(item.image)}" alt="" loading="lazy">` : '<span class="checkout-product-placeholder" aria-hidden="true">AO</span>'}<div><strong class="checkout-product-name">${escapeHtml(item.name)}</strong><small class="checkout-product-qty">Kuantiti · ${Number(item.quantity) || 0}</small></div></div><strong class="checkout-line-price">${money(Number(item.price) * Number(item.quantity))}</strong></article>`).join('');
    const deliveryDetails = intent.fulfilment === 'delivery'
      ? `<div class="checkout-detail"><span class="checkout-detail-icon" aria-hidden="true">⌖</span><span><small>Alamat delivery</small><strong>${escapeHtml(intent.address)}</strong></span></div>${intent.driverNote ? `<div class="checkout-detail"><span class="checkout-detail-icon" aria-hidden="true">i</span><span><small>Nota untuk driver</small><strong>${escapeHtml(intent.driverNote)}</strong></span></div>` : ''}`
      : intent.selfDeliveryNote ? `<div class="checkout-detail"><span class="checkout-detail-icon" aria-hidden="true">i</span><span><small>Nota pickup / runner</small><strong>${escapeHtml(intent.selfDeliveryNote)}</strong></span></div>` : '';
    const deliveryCharge = intent.fulfilment === 'delivery' && Number.isFinite(Number(intent.shippingFee)) ? Number(intent.shippingFee) : 0;
    const grandTotal = Number(intent.total) + deliveryCharge;
    $('#checkoutSummary').innerHTML = `<div class="checkout-items-heading"><span>ITEM PESANAN</span><span>JUMLAH</span></div>${itemRows}<div class="checkout-details"><div class="checkout-detail"><span class="checkout-detail-icon" aria-hidden="true">${intent.fulfilment === 'delivery' ? '↗' : '⌂'}</span><span><small>Cara terima</small><strong>${escapeHtml(method)}</strong></span></div>${deliveryDetails}${intent.fulfilment === 'delivery' ? `<div class="checkout-detail"><span class="checkout-detail-icon" aria-hidden="true">15</span><span><small>Kurrier & jarak laluan</small><strong>${escapeHtml(intent.shippingProvider || 'Belum dipilih')} · ${Number(intent.shippingDistanceKm || 0)} km (maksimum 15 km)</strong></span></div>` : ''}</div><div class="checkout-costs"><div class="checkout-cost-row"><span>Jumlah roti</span><strong>${money(intent.total)}</strong></div><div class="checkout-cost-row"><span>Caj delivery</span><strong>${intent.fulfilment === 'delivery' ? money(deliveryCharge) : 'Self-arrange'}</strong></div></div><div class="checkout-total"><span>Jumlah perlu dibayar</span><strong>${money(grandTotal)}</strong></div>`;

    const [{ initializeApp }, firestore] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js')
    ]);
    fs = firestore;
    db = fs.getFirestore(initializeApp(firebaseConfig));
    const snap = await fs.getDoc(fs.doc(db, 'settings', 'commerce'));
    const settings = snap.exists() ? snap.data() : {};
    if (!settings.paymentProvider || settings.paymentProvider === 'Not configured') {
      fail('Payment gateway belum diaktifkan. Tiada bayaran dikenakan dan order belum dihantar. Hubungi kami melalui WhatsApp untuk tempahan.');
      return;
    }
    if (!settings.checkoutEndpoint) {
      fail(`${escapeHtml(settings.paymentProvider)} dipilih tetapi checkout belum disambungkan. Integrasi gateway perlukan endpoint selamat daripada provider.`);
      return;
    }
    $('#payNow').dataset.provider = settings.paymentProvider;
    $('#checkoutStatus').textContent = `Payment melalui ${settings.paymentProvider}.`;
  } catch (error) {
    console.error(error);
    fail('Tak dapat sambung ke checkout. Tiada bayaran dikenakan. Sila cuba lagi atau WhatsApp kami.');
  }
}

$('#payNow').addEventListener('click', async () => {
  const button = $('#payNow');
  if (button.disabled) return;
  button.disabled = true;
  $('#checkoutStatus').textContent = 'Menyambung ke payment provider…';
  try {
    const snap = await fs.getDoc(fs.doc(db, 'settings', 'commerce'));
    const endpoint = snap.data()?.checkoutEndpoint;
    if (!endpoint) throw new Error('No secure checkout endpoint');
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutId: id,
        token,
        successUrl: new URL('./payment-result.html?result=success&id=' + encodeURIComponent(id), location.href).href,
        cancelUrl: new URL('./payment-result.html?result=cancel&id=' + encodeURIComponent(id), location.href).href
      })
    });
    if (!response.ok) throw new Error(`Checkout provider error ${response.status}`);
    const result = await response.json();
    if (!result.checkoutUrl || new URL(result.checkoutUrl).protocol !== 'https:') throw new Error('Invalid secure checkout URL');
    location.assign(result.checkoutUrl);
  } catch (error) {
    console.error(error);
    button.disabled = false;
    $('#checkoutStatus').textContent = 'Payment belum dimulakan dan order belum dihantar. Gateway belum bersambung atau sedang bermasalah. Sila cuba semula kemudian.';
  }
});

init();
