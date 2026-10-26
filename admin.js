import { firebaseConfig } from "./firebase-config.js";
const $ = (s) => document.querySelector(s),
  money = (n) => `RM${Number(n).toFixed(2)}`;
const defaults = Array.from({ length: 10 }, (_, i) => ({
  id: `r${(i + 1) * 100}`,
  amount: (i + 1) * 100,
  stock: 10,
}));
let fb;
let stopLiveOrders;
let stopLiveFeedback;
let refreshTimer;
let orderPage = 0;
let feedbackPage = 0;
const pageSize = 5;
async function setup() {
  if (!firebaseConfig.apiKey) return;
  const [{ initializeApp }, fs, auth, storage] = await Promise.all([
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js"),
    import("https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js"),
  ]);
  const app = initializeApp(firebaseConfig);
  fb = {
    db: fs.getFirestore(app),
    fs,
    auth: auth.getAuth(app),
    authApi: auth,
    store: storage.getStorage(app),
    storeApi: storage,
  };
}
function pager(kind, page, total) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return `<nav class="pager" aria-label="${kind} pages"><button type="button" data-${kind}-page="previous" ${page === 0 ? "disabled" : ""}>Previous</button><span>Page ${page + 1} of ${pages}</span><button type="button" data-${kind}-page="next" ${page >= pages - 1 ? "disabled" : ""}>Next</button></nav>`;
}
function draw(orders, items, feedback) {
  orderPage = Math.min(orderPage, Math.max(0, Math.ceil(orders.length / pageSize) - 1));
  feedbackPage = Math.min(feedbackPage, Math.max(0, Math.ceil(feedback.length / pageSize) - 1));
  const visibleOrders = orders.slice(orderPage * pageSize, (orderPage + 1) * pageSize);
  const visibleFeedback = feedback.slice(feedbackPage * pageSize, (feedbackPage + 1) * pageSize);
  $("#stats").innerHTML =
    `<div class="stat"><b>${orders.length}</b><span>Total orders</span></div><div class="stat"><b>${orders.filter((o) => o.status === "Pending review").length}</b><span>Need review</span></div><div class="stat"><b>${money(orders.reduce((x, o) => x + Number(o.total || 0), 0))}</b><span>Order value</span></div>`;
  $("#order-list").innerHTML = orders.length
    ? visibleOrders
        .map(
          (o) =>
            `<article class="row"><div><b>${o.code}</b><span>@${o.username} · ${o.amount}R · ${money(o.total)}</span></div><div><small>${o.whatsapp || ""}</small>${o.receiptChunkCount || o.receiptName ? `<a href="#" data-receipt-chunks="${o.code}" data-receipt-name="${o.receiptName || 'receipt'}">Open receipt</a>` : o.receiptPath ? `<a href="#" data-receipt="${o.receiptPath}">Open receipt</a>` : `<small>No receipt uploaded</small>`}</div><select data-status="${o.code}">${["Pending review", "Payment approved", "Processing", "Completed", "Rejected"].map((s) => `<option ${o.status === s ? "selected" : ""}>${s}</option>`).join("")}</select><button class="delete-order" type="button" data-delete="${o.code}">Delete</button></article>`,
        )
        .join("") + pager("order", orderPage, orders.length)
    : "<p>No orders yet.</p>";
  $("#feedback-list").innerHTML = feedback.length
    ? visibleFeedback
        .map(
          (item) =>
            `<article class="row review-row"><div><b class="stars" aria-label="${item.rating} out of 5 stars">${"★".repeat(Number(item.rating) || 0)}${"☆".repeat(5 - (Number(item.rating) || 0))}</b><span>${item.note || "No written feedback"}</span></div><small>${item.orderCode || ""} · ${item.createdAt ? new Date(item.createdAt).toLocaleString() : ""}</small><button class="delete-order" type="button" data-delete-feedback="${item.id}">Delete</button></article>`,
        )
        .join("") + pager("feedback", feedbackPage, feedback.length)
    : "<p>No ratings yet.</p>";
  $("#stock-list").innerHTML = items
    .map(
      (x) =>
        `<label>${x.amount}R<input data-stock="${x.id}" value="${x.stock}" type="number" min="0"></label>`,
    )
    .join("");
}
async function load() {
  const orders = (
    await fb.fs.getDocs(
      fb.fs.query(
        fb.fs.collection(fb.db, "orders"),
        fb.fs.orderBy("createdAt", "desc"),
      ),
    )
  ).docs.map((d) => ({ id: d.id, ...d.data() }));
  const packages = (
    await fb.fs.getDocs(fb.fs.query(fb.fs.collection(fb.db, "packages"), fb.fs.orderBy("amount", "asc")))
  ).docs.map((d) => d.data());
  const feedback = (
    await fb.fs.getDocs(
      fb.fs.query(
        fb.fs.collection(fb.db, "feedback"),
        fb.fs.orderBy("createdAt", "desc"),
      ),
    )
  ).docs.map((d) => ({ id: d.id, ...d.data() }));
  draw(orders, packages.length ? packages : defaults, feedback);
  $("#locked").hidden = true;
  $("#dashboard").hidden = false;
  $("#signout").hidden = false;
}
function startLiveUpdates() {
  const refresh = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(() => load().catch(() => {}), 180); };
  stopLiveOrders?.(); stopLiveFeedback?.();
  stopLiveOrders = fb.fs.onSnapshot(fb.fs.collection(fb.db, "orders"), refresh);
  stopLiveFeedback = fb.fs.onSnapshot(fb.fs.collection(fb.db, "feedback"), refresh);
}
$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!fb) {
    $("#login-status").textContent = "Firebase is not connected yet.";
    return;
  }
  try {
    const email = $("#admin-email").value.trim(),
      password = $("#admin-password").value;
    const user = (
      await fb.authApi.signInWithEmailAndPassword(fb.auth, email, password)
    ).user;
    const adminRef = fb.fs.doc(fb.db, "admins", user.uid);
    let admin = await fb.fs.getDoc(adminRef);
    if (!admin.exists() && user.email === "bettygrv3@gmail.com") {
      await fb.fs.setDoc(adminRef, { email: user.email, role: "admin" });
      admin = await fb.fs.getDoc(adminRef);
    }
    if (!admin.exists())
      throw Error("This account is not approved as an admin.");
    await load();
    startLiveUpdates();
  } catch (err) {
    $("#login-status").textContent = err.message;
  }
});
$("#signout").addEventListener("click", async () => {
  if (fb) await fb.authApi.signOut(fb.auth);
  stopLiveOrders?.(); stopLiveFeedback?.(); stopLiveOrders = undefined; stopLiveFeedback = undefined;
  $("#dashboard").hidden = true;
  $("#locked").hidden = false;
  $("#signout").hidden = true;
});
$("#save-order-status").addEventListener("click", async () => {
  const button = $("#save-order-status"); button.textContent = "Saving..."; button.disabled = true;
  try { for (const select of document.querySelectorAll("[data-status]")) { const id = select.dataset.status; await fb.fs.updateDoc(fb.fs.doc(fb.db, "orders", id), { status: select.value }); await fb.fs.updateDoc(fb.fs.doc(fb.db, "tracking", id), { status: select.value }); } button.textContent = "Saved"; setTimeout(() => { button.textContent = "Save order updates"; button.disabled = false; }, 1400); } catch { button.textContent = "Try again"; button.disabled = false; }
});
$("#order-list").addEventListener("click", async (e) => {
  const page = e.target.dataset.orderPage;
  if (page) { orderPage += page === "next" ? 1 : -1; await load(); return; }
  const orderCode = e.target.dataset.delete;
  if (orderCode && fb) {
    if (!window.confirm(`Delete order ${orderCode}? This cannot be undone.`)) return;
    try {
      const chunks = await fb.fs.getDocs(fb.fs.collection(fb.db, "receipts", orderCode, "chunks"));
      await Promise.all(chunks.docs.map((chunk) => fb.fs.deleteDoc(chunk.ref)));
      await fb.fs.deleteDoc(fb.fs.doc(fb.db, "orders", orderCode));
      await fb.fs.deleteDoc(fb.fs.doc(fb.db, "tracking", orderCode));
      await load();
    } catch {
      window.alert("Could not delete this order. Please try again.");
    }
    return;
  }
  const receiptOrder = e.target.dataset.receiptChunks;
  if (receiptOrder && fb) {
    e.preventDefault();
    const preview = window.open("", "_blank");
    try {
      const chunks = (await fb.fs.getDocs(fb.fs.query(fb.fs.collection(fb.db, "receipts", receiptOrder, "chunks"), fb.fs.orderBy("index", "asc")))).docs.map((doc) => doc.data());
      const base64 = chunks.map((chunk) => chunk.data).join("");
      const binary = atob(base64); const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes], { type: chunks[0]?.mime || "application/octet-stream" }));
      if (!preview) throw new Error("Preview window was blocked");
      preview.opener = null;
      preview.location.replace(url);
    } catch { if (preview) preview.close(); window.alert("Could not open this receipt. Please try again."); }
    return;
  }
  const path = e.target.dataset.receipt;
  if (!path || !fb) return;
  e.preventDefault();
  window.open(
    await fb.storeApi.getDownloadURL(fb.storeApi.ref(fb.store, path)),
    "_blank",
    "noopener",
  );
});
$("#feedback-list").addEventListener("click", async (e) => {
  const page = e.target.dataset.feedbackPage;
  if (page) { feedbackPage += page === "next" ? 1 : -1; await load(); return; }
  const feedbackId = e.target.dataset.deleteFeedback;
  if (!feedbackId || !fb) return;
  if (!window.confirm("Delete this customer rating? This cannot be undone.")) return;
  try { await fb.fs.deleteDoc(fb.fs.doc(fb.db, "feedback", feedbackId)); await load(); }
  catch { window.alert("Could not delete this rating. Please try again."); }
});
$("#save-stock").addEventListener("click", async () => {
  if (!fb) return;
  for (const input of document.querySelectorAll("[data-stock]"))
    await fb.fs.setDoc(fb.fs.doc(fb.db, "packages", input.dataset.stock), {
      id: input.dataset.stock,
      amount: Number(input.dataset.stock.slice(1)),
      stock: Number(input.value),
    });
  await load();
});
setup();
