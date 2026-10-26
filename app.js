import { firebaseConfig } from './firebase-config.js';

const packages = Array.from({ length: 10 }, (_, index) => ({ id: `r${(index + 1) * 100}`, amount: (index + 1) * 100, price: Number(((index + 1) * 3.85).toFixed(2)), stock: 10 }));
let activePackages = [...packages];
let selectedId = null;
let foundProfile = null;
let firebase = null;
const profileLookupEndpoint = 'https://tfpovaymjiopqxgwibck.supabase.co/functions/v1/roblox-profile';

const $ = (selector) => document.querySelector(selector);
const money = (amount) => `RM${amount.toFixed(2)}`;
const selectedPackage = () => activePackages.find((item) => item.id === selectedId) || null;
const customPackage = () => {
  const amount = Number($('#custom-robux')?.value || 0);
  return selectedId === 'other' && amount >= 100 && amount <= 5000 ? { id: 'other', amount, price: Number((amount * 3.85 / 100).toFixed(2)), stock: 1 } : null;
};
const code = () => `SB-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
const recentOrderCache = () => JSON.parse(localStorage.getItem('sealy-recent-orders') || '[]');
function rememberRecentOrder(order) {
  const cutoff = Date.now() - 2 * 60 * 60 * 1000;
  const next = [order, ...recentOrderCache().filter((item) => item.code !== order.code && new Date(item.createdAt).getTime() > cutoff)];
  localStorage.setItem('sealy-recent-orders', JSON.stringify(next));
}
async function uploadReceipt(orderCode, file) {
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
  const base64 = String(dataUrl).split(',')[1] || '';
  const chunkSize = 450000;
  const chunkCount = Math.ceil(base64.length / chunkSize);
  for (let index = 0; index < chunkCount; index += 1) {
    await firebase.firestore.setDoc(firebase.firestore.doc(firebase.db, 'receipts', orderCode, 'chunks', String(index).padStart(3, '0')), { data: base64.slice(index * chunkSize, (index + 1) * chunkSize), index, mime: file.type, name: file.name });
  }
  await firebase.firestore.updateDoc(firebase.firestore.doc(firebase.db, 'orders', orderCode), { receiptChunkCount: chunkCount, receiptMime: file.type });
}

function renderPackages() {
  const storefrontGrid = $('#package-grid'); if (storefrontGrid) storefrontGrid.innerHTML = activePackages.map((item) => `<button class="package-card ${item.id === selectedId ? 'selected' : ''}" type="button" data-package="${item.id}" ${item.stock < 1 ? 'disabled' : ''}><b>${item.amount}R</b><span>${money(item.price)}</span><small>${item.stock > 0 ? `${item.stock} in stock` : 'Sold out'}</small></button>`).join('');
  const other = `<button class="order-package-option other-package ${selectedId === 'other' ? 'selected' : ''}" type="button" role="radio" aria-checked="${selectedId === 'other'}" data-order-package="other"><b>Other amount</b><small>100–5000R</small></button>`;
  $('#order-package-grid').innerHTML = activePackages.map((item) => `<button class="order-package-option ${item.id === selectedId ? 'selected' : ''}" type="button" role="radio" aria-checked="${item.id === selectedId}" data-order-package="${item.id}" ${item.stock < 1 ? 'disabled' : ''}><b>${item.amount}R</b><small>${money(item.price)}</small></button>`).join('') + other;
  updateTotal();
}

function updateTotal() {
  const item = selectedPackage() || customPackage();
  $('#order-total').textContent = item ? money(item.price) : '';
  $('#package-select').value = item?.id || '';
  $('#custom-amount').hidden = selectedId !== 'other';
  if (selectedId === 'other') $('#custom-price').textContent = item ? money(item.price) : 'RM0.00';
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
  const packageCollection = firestore.collection(firebase.db, 'packages');
  const syncPackages = (snapshot) => {
    if (snapshot.empty) return;
    activePackages = packages.map((item) => ({ ...item, ...(snapshot.docs.find((doc) => doc.id === item.id)?.data() || {}) }));
    renderPackages();
  };
  syncPackages(await firestore.getDocs(packageCollection));
  firestore.onSnapshot(packageCollection, syncPackages);
}

async function findProfile() {
  const username = $('#roblox-username').value.trim().replace(/^@/, '');
  const help = $('#profile-help');
  if (!username) { help.textContent = 'Enter a Roblox username first.'; return; }
  help.textContent = 'Looking for this profile...';
  try {
    const res = await fetch(`${profileLookupEndpoint}?username=${encodeURIComponent(username)}`);
    const user = await res.json();
    if (!res.ok) throw new Error(user.error || 'not found');
    foundProfile = { id: user.id, name: user.displayName, username: user.username, avatar: user.avatar || '' };
    $('#profile-avatar').src = foundProfile.avatar; $('#profile-avatar').alt = `${foundProfile.name}'s Roblox avatar`;
    $('#profile-name').textContent = foundProfile.name; $('#profile-handle').textContent = `@${foundProfile.username}`; $('#profile-link').href = user.profileUrl; $('#profile-preview').hidden = false; help.textContent = 'This is the account that will receive Robux.';
  } catch { foundProfile = null; $('#profile-preview').hidden = true; help.textContent = 'We could not find that username. Check the spelling and try again.'; }
}

async function saveOrder(event) {
  event.preventDefault();
  const status = $('#order-status'); const item = selectedPackage() || customPackage(); const receipt = $('#receipt').files[0];
  if (!item) { status.textContent = 'Choose a Robux package before submitting.'; return; }
  if (!foundProfile) { status.textContent = 'Find and verify the Roblox profile before submitting.'; return; }
  if (!receipt) { status.textContent = 'Please upload your payment receipt.'; return; }
  const orderCode = code(); status.textContent = 'Creating your order...';
  const order = { code: orderCode, username: foundProfile.username, robloxUserId: foundProfile.id, profileName: foundProfile.name, packageId: item.id, amount: item.amount, total: item.price, whatsapp: $('#whatsapp').value.trim(), note: $('#note').value.trim(), status: 'Pending review', createdAt: new Date().toISOString(), receiptName: receipt.name };
  try {
    if (firebase) {
      await firebase.firestore.runTransaction(firebase.db, async (transaction) => {
        if (item.id !== 'other') {
          const packageRef = firebase.firestore.doc(firebase.db, 'packages', item.id);
          const packageDoc = await transaction.get(packageRef);
          if (!packageDoc.exists() || Number(packageDoc.data().stock) < 1) throw new Error('This package is sold out. Please choose another amount.');
          transaction.update(packageRef, { stock: Number(packageDoc.data().stock) - 1 });
        }
        transaction.set(firebase.firestore.doc(firebase.db, 'orders', orderCode), order);
      });
      await firebase.firestore.setDoc(firebase.firestore.doc(firebase.db, 'tracking', orderCode), { code: orderCode, username: order.username, usernameLower: order.username.toLowerCase(), packageId: item.id, amount: item.amount, total: item.price, status: order.status, createdAt: order.createdAt });
      status.textContent = 'Order saved. Uploading your receipt securely...';
      await uploadReceipt(orderCode, receipt);
    } else {
      const orders = JSON.parse(localStorage.getItem('sealy-orders') || '[]'); orders.unshift(order); localStorage.setItem('sealy-orders', JSON.stringify(orders));
    }
    rememberRecentOrder({ code: order.code, username: order.username, usernameLower: order.username.toLowerCase(), amount: order.amount, total: order.total, status: order.status, createdAt: order.createdAt });
    status.textContent = 'Order successfully sent! We will review your receipt shortly.';
    event.target.reset(); foundProfile = null; $('#profile-preview').hidden = true;
    window.setTimeout(() => { feedbackRating = 0; $('#feedback-form').reset(); $('#feedback-status').textContent = ''; document.querySelectorAll('[data-rating]').forEach((star) => star.classList.remove('selected')); $('#feedback-form').dataset.orderCode = orderCode; $('#review-dialog').showModal(); }, 1600);
  } catch (error) { status.textContent = `We could not submit the order: ${error.message}. Please try again.`; }
}

async function trackOrder(event) {
  event.preventDefault(); const username = $('#tracking-code').value.trim().replace(/^@/, ''); const usernameLower = username.toLowerCase(); const result = $('#tracking-result'); result.hidden = false; result.textContent = 'Finding your latest order...';
  try {
    let orders = recentOrderCache().filter((item) => item.usernameLower === usernameLower && new Date(item.createdAt).getTime() > Date.now() - 2 * 60 * 60 * 1000);
    if (firebase) {
      try {
        const tracking = firebase.firestore.collection(firebase.db, 'tracking');
        const cutoff = firebase.firestore.Timestamp.fromMillis(Date.now() - 2 * 60 * 60 * 1000);
        const [pending, recentlyUpdated, legacyPending] = await Promise.all([
          firebase.firestore.getDocs(firebase.firestore.query(tracking, firebase.firestore.where('usernameLower', '==', usernameLower), firebase.firestore.where('status', '==', 'Pending review'))),
          firebase.firestore.getDocs(firebase.firestore.query(tracking, firebase.firestore.where('usernameLower', '==', usernameLower), firebase.firestore.where('statusUpdatedAt', '>', cutoff))),
          firebase.firestore.getDocs(firebase.firestore.query(tracking, firebase.firestore.where('username', '==', username), firebase.firestore.where('status', '==', 'Pending review')))
        ]);
        orders = [...orders, ...pending.docs, ...recentlyUpdated.docs, ...legacyPending.docs].reduce((unique, item) => {
          const order = typeof item.data === 'function' ? item.data() : item;
          return unique.some((saved) => saved.code === order.code) ? unique : [...unique, order];
        }, []);
      } catch { /* The just-submitted browser cache remains available while Firebase retries. */ }
    }
    else orders = [...orders, ...JSON.parse(localStorage.getItem('sealy-orders') || '[]').filter((item) => item.username.toLowerCase() === username.toLowerCase() && (item.status === 'Pending review' || (item.statusUpdatedAt && Date.now() - new Date(item.statusUpdatedAt).getTime() < 2 * 60 * 60 * 1000)))].reduce((unique, order) => unique.some((saved) => saved.code === order.code) ? unique : [...unique, order], []);
    if (!orders.length) throw new Error('not found');
    result.innerHTML = orders.map((order) => `<strong>${order.amount} Robux · ${money(Number(order.total))}</strong><br /><span class="status-chip">${order.status}</span>`).join('<hr>');
  } catch { result.textContent = 'We could not find a recent order for that username yet.'; }
}

function renderPublicReviews(items) {
  const list = $('#public-feedback');
  if (!list) return;
  list.innerHTML = items.length ? items.slice(0, 6).map((item) => `<article><div class="public-stars" aria-label="${Number(item.rating) || 0} out of 5 stars">${'★'.repeat(Number(item.rating) || 0)}${'☆'.repeat(5 - (Number(item.rating) || 0))}</div><p>${String(item.note || 'Great service!').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]))}</p></article>`).join('') : '<p class="review-empty">Customer reviews will appear here.</p>';
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

$('#package-grid')?.addEventListener('click', (event) => { const id = event.target.closest('[data-package]')?.dataset.package; if (id) { selectedId = id; renderPackages(); } });
$('#order-package-grid').addEventListener('click', (event) => { const id = event.target.closest('[data-order-package]')?.dataset.orderPackage; if (id) { selectedId = id; renderPackages(); } });
$('#custom-robux').addEventListener('input', updateTotal);
let lookupTimer;
$('#roblox-username').addEventListener('input', () => { clearTimeout(lookupTimer); $('#profile-preview').hidden = true; foundProfile = null; const username = $('#roblox-username').value.trim(); if (username.length < 3) { $('#profile-help').textContent = 'Type a username and we will find the account automatically.'; return; } lookupTimer = setTimeout(findProfile, 550); });
$('#receipt').addEventListener('change', (event) => { $('#receipt-name').textContent = event.target.files[0]?.name || 'Choose file'; });
$('#lookup-button').addEventListener('click', findProfile); $('#order-form').addEventListener('submit', saveOrder); $('#tracking-form').addEventListener('submit', trackOrder);
$('#admin-login-button')?.addEventListener('click', loginAdmin); $('#save-stock')?.addEventListener('click', saveAdminChanges);
$('#admin-signout')?.addEventListener('click', async () => { if (firebase) await firebase.authApi.signOut(firebase.auth); $('#admin-panel').hidden = true; $('#admin-login').hidden = false; });
$('#orders-admin')?.addEventListener('click', async (event) => { const path = event.target.dataset.receipt; if (!path || !firebase) return; event.preventDefault(); const url = await firebase.storageApi.getDownloadURL(firebase.storageApi.ref(firebase.store, path)); window.open(url, '_blank', 'noopener'); });
let feedbackRating = 0;
$('#review-close').addEventListener('click', () => $('#review-dialog').close());
document.querySelectorAll('[data-rating]').forEach((button) => button.addEventListener('click', () => { feedbackRating = Number(button.dataset.rating); document.querySelectorAll('[data-rating]').forEach((star) => star.classList.toggle('selected', Number(star.dataset.rating) <= feedbackRating)); }));
$('#feedback-form').addEventListener('submit', async (event) => { event.preventDefault(); if (!feedbackRating) { $('#feedback-status').textContent = 'Choose a star rating first.'; return; } const payload = { orderCode: event.currentTarget.dataset.orderCode, rating: feedbackRating, note: $('#feedback-note').value.trim(), createdAt: new Date().toISOString() }; try { if (firebase) await firebase.firestore.setDoc(firebase.firestore.doc(firebase.db, 'feedback', `${payload.orderCode}-${Date.now()}`), payload); else localStorage.setItem(`sealy-feedback-${payload.orderCode}`, JSON.stringify(payload)); $('#feedback-status').textContent = 'Thank you for your feedback!'; setTimeout(() => $('#review-dialog').close(), 900); } catch { $('#feedback-status').textContent = 'Could not send feedback. Please try again.'; } });
renderPackages(); setupFirebase().then(() => { if (firebase) firebase.firestore.onSnapshot(firebase.firestore.query(firebase.firestore.collection(firebase.db, 'feedback'), firebase.firestore.orderBy('createdAt', 'desc')), (snapshot) => renderPublicReviews(snapshot.docs.map((doc) => doc.data())), () => renderPublicReviews([])); }).catch((error) => console.warn('Firebase is not configured:', error));
