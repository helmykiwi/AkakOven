import { firebaseConfig } from './firebase-config.js';

const $ = (selector) => document.querySelector(selector);
const money = (value) => `RM${Number(value || 0).toFixed(2)}`;
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
let fb; let orders = []; let items = [];

async function setup() {
  if (!firebaseConfig.apiKey) { $('#login-status').textContent = 'Firebase belum disambungkan.'; return; }
  const [{ initializeApp }, fs, auth] = await Promise.all([
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js')
  ]);
  fb = { fs, auth, authApi: auth.getAuth(initializeApp(firebaseConfig)) };
}

async function load() {
  const db = fb.fs.getFirestore();
  const [orderDocs, productDocs] = await Promise.all([
    fb.fs.getDocs(fb.fs.query(fb.fs.collection(db, 'orders'), fb.fs.orderBy('createdAt', 'desc'))),
    fb.fs.getDocs(fb.fs.collection(db, 'products'))
  ]);
  orders = orderDocs.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  items = productDocs.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  render();
}

function render() {
  const paid = orders.filter((order) => order.paymentStatus === 'Paid' || order.status === 'Completed');
  const sales = paid.reduce((sum, order) => sum + Number(order.total || 0), 0);
  const profit = paid.reduce((sum, order) => sum + Number(order.profit || 0), 0);
  const pending = orders.filter((order) => order.status === 'New request').length;
  $('#stats').innerHTML = `<div class="stat"><b>${money(sales)}</b><span>Jualan diterima</span></div><div class="stat"><b>${money(profit)}</b><span>Anggaran keuntungan</span></div><div class="stat"><b>${orders.length}</b><span>Semua tempahan</span></div><div class="stat"><b>${pending}</b><span>Perlu semakan</span></div>`;
  $('#orders').innerHTML = orders.length ? orders.slice(0, 12).map((order) => `<article><div><strong>${escapeHtml(order.customerName)} · ${escapeHtml(order.product)}</strong><small>${Number(order.quantity) || 0} unit · ${escapeHtml(order.eventDate || 'Tarikh belum diberi')}<br>${order.signingOff ? `Signing off: ${escapeHtml(order.signingOff)}` : ''}</small></div><small>${escapeHtml(order.whatsapp)}<br>${order.cardSize === 'other' ? 'Saiz custom diminta' : ''}</small><select data-id="${escapeHtml(order.id)}">${['New request', 'Quoted', 'Confirmed', 'In progress', 'Completed', 'Cancelled'].map((status) => `<option ${order.status === status ? 'selected' : ''}>${status}</option>`).join('')}</select></article>`).join('') : '<p>Belum ada tempahan.</p>';
  const low = items.filter((product) => Number(product.stock) <= Number(product.lowStockAt || 5));
  $('#low-stock').innerHTML = low.length ? low.map((product) => `<div class="stock-row low"><span>${escapeHtml(product.name)}</span><b>${Number(product.stock)} left</b></div>`).join('') : '<p>Semua stok berada pada paras baik.</p>';
}

$('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const user = (await fb.auth.signInWithEmailAndPassword(fb.authApi, $('#email').value, $('#password').value)).user;
    const admin = await fb.fs.getDoc(fb.fs.doc(fb.fs.getFirestore(), 'admins', user.uid));
    if (!admin.exists()) throw Error('Akaun ini bukan owner yang diluluskan.');
    $('#locked').hidden = true; $('#dashboard').hidden = false; await load();
  } catch (error) { $('#login-status').textContent = error.message; }
});
$('#orders').addEventListener('change', async (event) => { if (event.target.dataset.id) { await fb.fs.updateDoc(fb.fs.doc(fb.fs.getFirestore(), 'orders', event.target.dataset.id), { status: event.target.value }); await load(); } });
$('#refresh').addEventListener('click', load);
$('#signout').addEventListener('click', async () => { await fb.auth.signOut(fb.authApi); $('#dashboard').hidden = true; $('#locked').hidden = false; });
$('#product-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const data = new FormData(event.currentTarget); const price = Number(data.get('price')); const cost = Number(data.get('cost'));
  try { await fb.fs.addDoc(fb.fs.collection(fb.fs.getFirestore(), 'products'), { name: data.get('name').trim(), price, cost, stock: Number(data.get('stock')), lowStockAt: 5, createdAt: new Date().toISOString() }); event.currentTarget.reset(); $('#product-status').textContent = 'Produk disimpan.'; await load(); } catch { $('#product-status').textContent = 'Tidak dapat simpan produk.'; }
});
setup();
