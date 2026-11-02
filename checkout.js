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
    const itemRows = intent.items.map(item => `<span>${escapeHtml(item.name)} × ${Number(item.quantity) || 0}</span><strong>${money(Number(item.price) * Number(item.quantity))}</strong>`).join('');
    const deliveryDetails = intent.fulfilment === 'delivery'
      ? `<div class="summary-items"><span>Alamat delivery</span><strong>${escapeHtml(intent.address)}</strong></div>${intent.driverNote ? `<div class="summary-items"><span>Nota driver</span><strong>${escapeHtml(intent.driverNote)}</strong></div>` : ''}`
      : intent.selfDeliveryNote ? `<div class="summary-items"><span>Nota pickup / runner</span><strong>${escapeHtml(intent.selfDeliveryNote)}</strong></div>` : '';
    $('#checkoutSummary').innerHTML = `<div class="summary-items">${itemRows}</div><div class="summary-items"><span>Cara terima</span><strong>${escapeHtml(method)}</strong></div>${deliveryDetails}${intent.fulfilment === 'delivery' ? '<div class="summary-items"><span>Caj penghantaran</span><strong>Akan disahkan ikut lokasi</strong></div>' : ''}<div class="summary-total"><span>Jumlah roti</span><strong>${money(intent.total)}</strong></div>`;

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
