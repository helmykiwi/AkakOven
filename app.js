import { firebaseConfig } from './firebase-config.js';

const packages = Array.from({ length: 10 }, (_, index) => ({ id: `r${(index + 1) * 100}`, amount: (index + 1) * 100, price: Number(((index + 1) * 3.85).toFixed(2)), stock: 10 }));
let activePackages = [...packages];
let selectedId = null;
let foundProfile = null;
let firebase = null;

const $ = (selector) => document.querySelector(selector);
const money = (amount) => `RM${amount.toFixed(2)}`;
const selectedPackage = () => activePackages.find((item) => item.id === selectedId) || null;
const code = () => `SB-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

function renderPackages() {
  $('#package-grid').innerHTML = activePackages.map((item) => `<button class="package-card ${item.id === selectedId ? 'selected' : ''}" type="button" data-package="${item.id}" ${item.stock < 1 ? 'disabled' : ''}><b>${item.amount}R</b><span>${money(item.price)}</span><small>${item.stock > 0 ? `${item.stock} in stock` : 'Sold out'}</small></button>`).join('');
  $('#order-package-grid').innerHTML = activePackages.map((item) => `<button class="order-package-option ${item.id === selectedId ? 'selected' : ''}" type="button" role="radio" aria-checked="${item.id === selectedId}" data-order-package="${item.id}" ${item.stock < 1 ? 'disabled' : ''}><b>${item.amount}R</b><small>${money(item.price)}</small></button>`).join('');
  updateTotal();
}

function updateTotal() {
  const item = selectedPackage();
  $('#order-total').textContent = item ? money(item.price) : 'Select package';
  $('#package-select').value = item?.id || '';
}

async function setupFirebase() {
  if (!firebaseConfig.apiKey) return;
  const [{ initializeApp }, firestore, auth, storage] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js')
  ]);
  const app = initializeApp(firebaseConfig);
  firebase = { db: firestore.getFirestore(app), auth: auth.getAuth(app), store: storage.getStorage(app), firestore, authApi: auth, storageApi: storage };
  const snapshot = await firestore.getDocs(firestore.collection(firebase.db, 'packages'));
  if (!snapshot.empty) { activePackages = packages.map((item) => ({ ...item, ...(snapshot.docs.find((doc) => doc.id === item.id)?.data() || {}) })); renderPackages(); }
}

async function findProfile() {
  const username = $('#roblox-username').value.trim().replace(/^@/, '');
  const help = $('#profile-help');
  if (!username) { help.textContent = 'Enter a Roblox username first.'; return; }
  help.textContent = 'Looking for this profile...';
  try {
    const res = await fetch(`/api/roblox-profile?username=${encodeURIComponent(username)}`);
    const user = await res.json();
    if (!res.ok) throw new Error(user.error || 'not found');
    foundProfile = { id: user.id, name: user.displayName, username: user.username, avatar: user.avatar || '' };
    $('#profile-avatar').src = foundProfile.avatar; $('#profile-avatar').alt = `${foundProfile.name}'s Roblox avatar`;
    $('#profile-name').textContent = foundProfile.name; $('#profile-handle').textContent = `@${foundProfile.username}`; $('#profile-link').href = user.profileUrl; $('#profile-preview').hidden = false; help.textContent = 'This is the account that will receive Robux.';
  } catch { foundProfile = null; $('#profile-preview').hidden = true; help.textContent = 'We could not find that username. Check the spelling and try again.'; }
}

async function saveOrder(event) {
  event.preventDefault();
  const status = $('#order-status'); const item = selectedPackage(); const receipt = $('#receipt').files[0];
  if (!item) { status.textContent = 'Choose a Robux package before submitting.'; return; }
  if (!foundProfile) { status.textContent = 'Find and verify the Roblox profile before submitting.'; return; }
  if (!receipt) { status.textContent = 'Please upload your payment receipt.'; return; }
  const orderCode = code(); status.textContent = 'Creating your order...';
  const order = { code: orderCode, username: foundProfile.username, robloxUserId: foundProfile.id, profileName: foundProfile.name, packageId: item.id, amount: item.amount, total: item.price, whatsapp: $('#whatsapp').value.trim(), note: $('#note').value.trim(), status: 'Pending review', createdAt: new Date().toISOString(), receiptName: receipt.name };
  try {
    if (firebase) {
      const path = `receipts/${orderCode}-${receipt.name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
      const receiptRef = firebase.storageApi.ref(firebase.store, path);
      await firebase.storageApi.uploadBytes(receiptRef, receipt, { contentType: receipt.type });
      order.receiptPath = path;
      await firebase.firestore.setDoc(firebase.firestore.doc(firebase.db, 'orders', orderCode), order);
      await firebase.firestore.setDoc(firebase.firestore.doc(firebase.db, 'tracking', orderCode), { code: orderCode, packageId: item.id, amount: item.amount, total: item.price, status: order.status, createdAt: order.createdAt });
    } else {
      const orders = JSON.parse(localStorage.getItem('sealy-orders') || '[]'); orders.unshift(order); localStorage.setItem('sealy-orders', JSON.stringify(orders));
    }
    status.innerHTML = `Order received. Your tracking code is <strong>${orderCode}</strong>. Save it, then wait for manual receipt approval.`;
    event.target.reset(); foundProfile = null; $('#profile-preview').hidden = true;
  } catch (error) { status.textContent = `We could not submit the order: ${error.message}. Please try again.`; }
}

async function trackOrder(event) {
  event.preventDefault(); const orderCode = $('#tracking-code').value.trim().toUpperCase(); const result = $('#tracking-result'); result.hidden = false; result.textContent = 'Finding your order...';
  try {
    let order;
    if (firebase) { const snap = await firebase.firestore.getDoc(firebase.firestore.doc(firebase.db, 'tracking', orderCode)); order = snap.exists() ? snap.data() : null; }
    else order = JSON.parse(localStorage.getItem('sealy-orders') || '[]').find((item) => item.code === orderCode);
    if (!order) throw new Error('not found');
    result.innerHTML = `<strong>${order.code}</strong> · ${order.amount} Robux · ${money(Number(order.total))}<br /><span class="status-chip">${order.status}</span>`;
  } catch { result.textContent = 'We could not find that order code. Check it and try again.'; }
}

function localAdmin() { return JSON.parse(localStorage.getItem('sealy-orders') || '[]'); }
function showAdmin(orders) {
  $('#admin-login').hidden = true; $('#admin-panel').hidden = false;
  $('#admin-stats').innerHTML = `<div class="stat"><strong>${orders.length}</strong><span>Orders</span></div><div class="stat"><strong>${orders.filter((order) => order.status === 'Pending review').length}</strong><span>Awaiting review</span></div><div class="stat"><strong>${money(orders.reduce((total, order) => total + Number(order.total || 0), 0))}</strong><span>Total value</span></div>`;
  $('#stock-editor').innerHTML = activePackages.map((item) => `<label>${item.amount}R<input data-stock="${item.id}" type="number" min="0" value="${item.stock}" /></label>`).join('');
  $('#orders-admin').innerHTML = orders.length ? orders.map((order) => `<article class="order-row"><div><strong>${order.code}</strong><span>@${order.username} · ${order.amount}R · ${money(Number(order.total))}</span></div><div><small>${order.whatsapp || 'No phone'} · ${new Date(order.createdAt).toLocaleString()}</small>${order.receiptPath ? `<a class="receipt-link" data-receipt="${order.receiptPath}" href="#">Open receipt</a>` : `<small>${order.receiptName || 'No receipt'}</small>`}</div><select data-order-status="${order.code}">${['Pending review','Payment approved','Processing','Completed','Rejected'].map((status) => `<option ${order.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></article>`).join('') : '<p>No orders yet.</p>';
}

async function loginAdmin() {
  if (!firebase) { showAdmin(localAdmin()); return; }
  try { const provider = new firebase.authApi.GoogleAuthProvider(); const user = (await firebase.authApi.signInWithPopup(firebase.auth, provider)).user; const admin = await firebase.firestore.getDoc(firebase.firestore.doc(firebase.db, 'admins', user.uid)); if (!admin.exists()) throw new Error('This Google account is not listed as an admin.'); const orders = (await firebase.firestore.getDocs(firebase.firestore.query(firebase.firestore.collection(firebase.db, 'orders'), firebase.firestore.orderBy('createdAt', 'desc')))).docs.map((doc) => doc.data()); showAdmin(orders); } catch (error) { $('#admin-login-status').textContent = error.message; }
}

async function saveAdminChanges() {
  activePackages = activePackages.map((item) => ({ ...item, stock: Number(document.querySelector(`[data-stock="${item.id}"]`).value) })); renderPackages();
  if (firebase) for (const item of activePackages) await firebase.firestore.setDoc(firebase.firestore.doc(firebase.db, 'packages', item.id), item);
  document.querySelectorAll('[data-order-status]').forEach(async (select) => { const id = select.dataset.orderStatus; if (firebase) { await firebase.firestore.updateDoc(firebase.firestore.doc(firebase.db, 'orders', id), { status: select.value }); await firebase.firestore.updateDoc(firebase.firestore.doc(firebase.db, 'tracking', id), { status: select.value }); } else { const list = localAdmin().map((order) => order.code === id ? { ...order, status: select.value } : order); localStorage.setItem('sealy-orders', JSON.stringify(list)); } });
  showAdmin(firebase ? (await firebase.firestore.getDocs(firebase.firestore.query(firebase.firestore.collection(firebase.db, 'orders'), firebase.firestore.orderBy('createdAt', 'desc')))).docs.map((doc) => doc.data()) : localAdmin());
}

$('#package-grid').addEventListener('click', (event) => { const id = event.target.closest('[data-package]')?.dataset.package; if (id) { selectedId = id; renderPackages(); } });
$('#order-package-grid').addEventListener('click', (event) => { const id = event.target.closest('[data-order-package]')?.dataset.orderPackage; if (id) { selectedId = id; renderPackages(); } });
let lookupTimer;
$('#roblox-username').addEventListener('input', () => { clearTimeout(lookupTimer); $('#profile-preview').hidden = true; foundProfile = null; const username = $('#roblox-username').value.trim(); if (username.length < 3) { $('#profile-help').textContent = 'Type a username and we will find the account automatically.'; return; } lookupTimer = setTimeout(findProfile, 550); });
$('#receipt').addEventListener('change', (event) => { $('#receipt-name').textContent = event.target.files[0]?.name || 'Choose file'; });
$('#lookup-button').addEventListener('click', findProfile); $('#order-form').addEventListener('submit', saveOrder); $('#tracking-form').addEventListener('submit', trackOrder);
$('#admin-login-button')?.addEventListener('click', loginAdmin); $('#save-stock')?.addEventListener('click', saveAdminChanges);
$('#admin-signout')?.addEventListener('click', async () => { if (firebase) await firebase.authApi.signOut(firebase.auth); $('#admin-panel').hidden = true; $('#admin-login').hidden = false; });
$('#orders-admin')?.addEventListener('click', async (event) => { const path = event.target.dataset.receipt; if (!path || !firebase) return; event.preventDefault(); const url = await firebase.storageApi.getDownloadURL(firebase.storageApi.ref(firebase.store, path)); window.open(url, '_blank', 'noopener'); });
renderPackages(); setupFirebase().catch((error) => console.warn('Firebase is not configured:', error));
