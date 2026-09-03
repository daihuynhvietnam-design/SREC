// ========== FIREBASE ==========
const firebaseConfig = {
  apiKey: "AIzaSyDLBCSOYidg2d2OPlTHuM4SQ7XTox3v1RA",
  authDomain: "srecid.firebaseapp.com",
  projectId: "srecid",
  storageBucket: "srecid.firebasestorage.app",
  messagingSenderId: "779687514285",
  appId: "1:779687514285:web:7fca483365fd1578ddb624",
  measurementId: "G-12R6PZFYLN"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

let currentUser = null;
let currentUserData = null;

function $(s) { return document.querySelector(s); }
function $$(s) { return document.querySelectorAll(s); }

function defaultAvatar(name) {
  const colors = ['#6366f1','#a855f7','#ec4899','#f59e0b','#22c55e','#3b82f6'];
  const c = colors[(name || 'U').charCodeAt(0) % colors.length];
  const initial = (name || 'U').charAt(0).toUpperCase();
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect fill="${c}" width="100" height="100"/><text x="50" y="55" font-size="40" fill="white" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-weight="700">${initial}</text></svg>`)}`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return 'Vừa xong';
  if (sec < 3600) return Math.floor(sec / 60) + ' phút';
  if (sec < 86400) return Math.floor(sec / 3600) + ' giờ';
  if (sec < 604800) return Math.floor(sec / 86400) + ' ngày';
  return d.toLocaleDateString('vi-VN');
}

function isEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s); }
function isPhone(s) { return /^0\d{9,10}$/.test(s.replace(/\s/g, '')); }
function normalize(s) { return (s || '').trim().toLowerCase(); }

function toAuthEmail(identifier) {
  const id = normalize(identifier);
  if (isEmail(id)) return id;
  if (isPhone(id)) return id.replace(/\s/g, '') + '@srec.phone';
  return id + '@srec.local';
}

function badgeHTML(level) {
  if (!level || level === 'none') return '';
  const map = {
    black: '<span class="badge-icon black" title="Tick đen"><i class="fas fa-check"></i></span>',
    blue:  '<span class="badge-icon blue" title="Tick xanh"><i class="fas fa-check"></i></span>',
    white: '<span class="badge-icon white" title="Tick trắng"><i class="fas fa-check"></i></span>'
  };
  return map[level] || '';
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t || '';
  return d.innerHTML;
}

function toast(msg, type = 'success') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ========== AUTH ==========
auth.onAuthStateChanged(async (user) => {
  $('#app-loader').style.display = 'none';

  if (!user) {
    currentUser = null;
    currentUserData = null;
    showGate('login');
    return;
  }

  currentUser = user;
  const doc = await db.collection('users').doc(user.uid).get();
  if (!doc.exists) {
    showGate('denied');
    return;
  }

  currentUserData = { id: doc.id, ...doc.data() };

  // Bootstrap: nếu chưa có admin nào → cấp cho user này
  if (currentUserData.role !== 'admin') {
    try {
      const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      if (admins.empty) {
        await db.collection('users').doc(user.uid).update({ role: 'admin' });
        currentUserData.role = 'admin';
      }
    } catch (_) {}
  }

  if (currentUserData.role !== 'admin') {
    showGate('denied');
    return;
  }

  if (currentUserData.banned === true) {
    alert('Tài khoản đã bị khóa.');
    await auth.signOut();
    return;
  }

  showAdminApp();
});

function showGate(mode) {
  $('#admin-app').style.display = 'none';
  $('#admin-gate').style.display = 'block';
  if (mode === 'login') {
    $('#login-box').style.display = 'block';
    $('#denied-box').style.display = 'none';
  } else {
    $('#login-box').style.display = 'none';
    $('#denied-box').style.display = 'block';
  }
}

function showAdminApp() {
  $('#admin-gate').style.display = 'none';
  $('#admin-app').style.display = 'block';
  $('#adm-name').textContent = currentUserData.name || 'Admin';
  $('#adm-avatar').src = currentUserData.avatar || defaultAvatar(currentUserData.name);
  loadDashboard();
}

// Login form
$('#admin-login-form').onsubmit = async (e) => {
  e.preventDefault();
  let identifier = $('#admin-login-id').value.trim();
  const password = $('#admin-login-pass').value;
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Đang đăng nhập...';

  try {
    if (!isEmail(identifier) && !isPhone(identifier) && !identifier.includes('@')) {
      const snap = await db.collection('users').where('username', '==', normalize(identifier)).limit(1).get();
      if (snap.empty) throw new Error('not found');
      identifier = snap.docs[0].data().identifier || snap.docs[0].data().email;
    }
    await auth.signInWithEmailAndPassword(toAuthEmail(identifier), password);
  } catch (err) {
    alert('Sai thông tin đăng nhập!');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Đăng nhập';
  }
};

$('#btn-back-home').onclick = () => { window.location.href = 'index.html'; };
$('#btn-admin-logout').onclick = () => auth.signOut();
$('#btn-logout-admin').onclick = () => auth.signOut();

// ========== SIDEBAR NAV ==========
$$('.as-item').forEach(item => {
  item.onclick = () => {
    $$('.as-item').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    $$('.adm-panel').forEach(p => p.style.display = 'none');
    const panel = $('#panel-' + item.dataset.panel);
    if (panel) panel.style.display = 'block';

    const p = item.dataset.panel;
    if (p === 'dashboard') loadDashboard();
    if (p === 'verify') { loadVerifyPending(); loadVerifyHistory(); }
    if (p === 'users') loadUsers();
    if (p === 'posts') loadPosts();
    if (p === 'pages') loadPages();
  };
});

// ========== DASHBOARD ==========
async function loadDashboard() {
  try {
    const [users, posts, pending, pages] = await Promise.all([
      db.collection('users').get(),
      db.collection('posts').get(),
      db.collection('verificationRequests').where('status', '==', 'pending').get(),
      db.collection('pages').get()
    ]);
    $('#stat-users').textContent = users.size;
    $('#stat-posts-all').textContent = posts.size;
    $('#stat-pending-verify').textContent = pending.size;
    $('#stat-pages').textContent = pages.size;

    // Recent activity from verify requests
    const recent = await db.collection('verificationRequests').limit(10).get();
    const items = recent.docs.map(d => d.data())
      .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0))
      .slice(0, 8);

    if (!items.length) {
      $('#recent-activity').innerHTML = '<p style="color:var(--text-muted);">Chưa có hoạt động</p>';
      return;
    }
    let html = '';
    items.forEach(r => {
      const st = { pending: '⏳ chờ duyệt', approved: '✅ đã duyệt', rejected: '❌ từ chối' };
      html += `<div class="term-block" style="margin-bottom:8px;">
        <p><strong>${escapeHtml(r.userName || '')}</strong> yêu cầu <strong>${r.type}</strong> — ${st[r.status] || r.status}</p>
        <p style="font-size:0.8rem;color:var(--text-muted);">${timeAgo(r.createdAt)}</p>
      </div>`;
    });
    $('#recent-activity').innerHTML = html;
  } catch (err) {
    console.error(err);
  }
}

// ========== VERIFY ==========
async function loadVerifyPending() {
  const box = $('#admin-verify-list');
  box.innerHTML = '<p style="color:var(--text-muted)">Đang tải...</p>';
  try {
    const snap = await db.collection('verificationRequests').where('status', '==', 'pending').get();
    if (snap.empty) {
      box.innerHTML = '<p style="color:var(--text-muted);padding:12px 0;">Không có yêu cầu nào đang chờ</p>';
      return;
    }
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    docs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    let html = '';
    for (const r of docs) {
      let avatar = '', username = '';
      try {
        const uDoc = await db.collection('users').doc(r.userId).get();
        if (uDoc.exists) {
          avatar = uDoc.data().avatar || '';
          username = uDoc.data().username || '';
        }
      } catch (_) {}
      const typeLabel = { white: 'Tick trắng', blue: 'Tick xanh', black: 'Tick đen' };
      html += `<div class="verify-card">
        <img src="${avatar || defaultAvatar(r.userName)}" />
        <div class="verify-info">
          <strong>${escapeHtml(r.userName || 'User')} ${badgeHTML(r.type)}</strong>
          <div class="v-meta">@${username} · Yêu cầu: <strong>${typeLabel[r.type] || r.type}</strong> · ${timeAgo(r.createdAt)}</div>
          <div class="v-reason">${escapeHtml(r.reason || '')}</div>
        </div>
        <div class="verify-actions">
          <button class="btn-approve" data-id="${r.id}" data-uid="${r.userId}" data-type="${r.type}">Duyệt</button>
          <button class="btn-reject" data-id="${r.id}">Từ chối</button>
        </div>
      </div>`;
    }
    box.innerHTML = html;

    box.querySelectorAll('.btn-approve').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Duyệt tick ' + btn.dataset.type + ' cho user này?')) return;
        btn.disabled = true;
        try {
          await db.collection('verificationRequests').doc(btn.dataset.id).update({
            status: 'approved',
            reviewedBy: currentUser.uid,
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          await db.collection('users').doc(btn.dataset.uid).update({ verification: btn.dataset.type });
          await db.collection('notifications').add({
            to: btn.dataset.uid,
            from: currentUser.uid,
            type: 'verify_approved',
            text: 'Yêu cầu tick ' + btn.dataset.type + ' của bạn đã được duyệt!',
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          toast('Đã duyệt tick!');
          loadVerifyPending();
          loadVerifyHistory();
          loadDashboard();
        } catch (err) {
          alert('Lỗi: ' + err.message);
          btn.disabled = false;
        }
      };
    });

    box.querySelectorAll('.btn-reject').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Từ chối yêu cầu này?')) return;
        btn.disabled = true;
        try {
          const doc = await db.collection('verificationRequests').doc(btn.dataset.id).get();
          const data = doc.data();
          await db.collection('verificationRequests').doc(btn.dataset.id).update({
            status: 'rejected',
            reviewedBy: currentUser.uid,
            reviewedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          if (data?.userId) {
            await db.collection('notifications').add({
              to: data.userId,
              from: currentUser.uid,
              type: 'verify_rejected',
              text: 'Yêu cầu tick của bạn đã bị từ chối.',
              read: false,
              createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
          }
          toast('Đã từ chối');
          loadVerifyPending();
          loadVerifyHistory();
        } catch (err) {
          alert('Lỗi: ' + err.message);
          btn.disabled = false;
        }
      };
    });
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p style="color:var(--danger)">Lỗi tải dữ liệu</p>';
  }
}

async function loadVerifyHistory() {
  const box = $('#admin-verify-history');
  try {
    const snap = await db.collection('verificationRequests').limit(40).get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.status !== 'pending')
      .sort((a, b) => (b.reviewedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) - (a.reviewedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0))
      .slice(0, 15);

    if (!docs.length) {
      box.innerHTML = '<p style="color:var(--text-muted);padding:8px 0;">Chưa có lịch sử</p>';
      return;
    }
    const statusMap = { approved: '✅ Đã duyệt', rejected: '❌ Từ chối' };
    let html = '';
    docs.forEach(r => {
      html += `<div class="term-block" style="margin-bottom:8px;">
        <p><strong>${escapeHtml(r.userName || '')}</strong> — ${r.type || ''} — ${statusMap[r.status] || r.status}</p>
        <p style="font-size:0.8rem;color:var(--text-muted);">${escapeHtml(r.reason || '')}</p>
      </div>`;
    });
    box.innerHTML = html;
  } catch (_) {
    box.innerHTML = '';
  }
}

// ========== USERS ==========
async function loadUsers(filter = '') {
  const box = $('#admin-users-list');
  box.innerHTML = '<p style="color:var(--text-muted)">Đang tải...</p>';
  try {
    const snap = await db.collection('users').limit(100).get();
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (filter) {
      const q = filter.toLowerCase();
      docs = docs.filter(u =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.username && u.username.includes(q))
      );
    }
    docs.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

    let html = `<table class="admin-table"><thead><tr>
      <th>Người dùng</th><th>Username</th><th>Tick</th><th>Vai trò</th><th>Thao tác</th>
    </tr></thead><tbody>`;

    docs.forEach(u => {
      const banned = u.banned === true;
      html += `<tr>
        <td><div class="user-cell">
          <img src="${u.avatar || defaultAvatar(u.name)}" />
          <span>${escapeHtml(u.name || 'User')}${banned ? ' <span style="color:#f87171">(banned)</span>' : ''}</span>
        </div></td>
        <td>@${u.username || ''}</td>
        <td>${badgeHTML(u.verification)} ${u.verification || 'none'}</td>
        <td>${u.role === 'admin' ? '<span style="color:#f59e0b;font-weight:700;">Admin</span>' : 'User'}</td>
        <td><div class="admin-actions">
          <select data-uid="${u.id}" class="admin-set-tick">
            <option value="">Đặt tick...</option>
            <option value="none"${u.verification === 'none' ? ' selected' : ''}>Không</option>
            <option value="white"${u.verification === 'white' ? ' selected' : ''}>Trắng</option>
            <option value="blue"${u.verification === 'blue' ? ' selected' : ''}>Xanh</option>
            <option value="black"${u.verification === 'black' ? ' selected' : ''}>Đen</option>
          </select>
          ${u.id !== currentUser.uid ? (
            (u.role === 'admin'
              ? `<button data-uid="${u.id}" class="btn-revoke-admin">Gỡ Admin</button>`
              : `<button data-uid="${u.id}" class="btn-make-admin">Cấp Admin</button>`) +
            (banned
              ? `<button data-uid="${u.id}" class="btn-unban">Mở khóa</button>`
              : `<button data-uid="${u.id}" class="btn-ban">Khóa</button>`)
          ) : '<span style="font-size:0.8rem;color:var(--text-muted);">Bạn</span>'}
        </div></td>
      </tr>`;
    });
    html += '</tbody></table>';
    box.innerHTML = html;

    box.querySelectorAll('.admin-set-tick').forEach(sel => {
      sel.onchange = async () => {
        if (!sel.value) return;
        await db.collection('users').doc(sel.dataset.uid).update({ verification: sel.value });
        toast('Đã cập nhật tick!');
        loadUsers($('#admin-user-search')?.value || '');
      };
    });
    box.querySelectorAll('.btn-make-admin').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Cấp quyền Admin?')) return;
        await db.collection('users').doc(btn.dataset.uid).update({ role: 'admin' });
        toast('Đã cấp Admin!');
        loadUsers($('#admin-user-search')?.value || '');
      };
    });
    box.querySelectorAll('.btn-revoke-admin').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Gỡ quyền Admin?')) return;
        await db.collection('users').doc(btn.dataset.uid).update({ role: 'user' });
        toast('Đã gỡ Admin');
        loadUsers($('#admin-user-search')?.value || '');
      };
    });
    box.querySelectorAll('.btn-ban').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Khóa tài khoản này?')) return;
        await db.collection('users').doc(btn.dataset.uid).update({ banned: true });
        toast('Đã khóa tài khoản');
        loadUsers($('#admin-user-search')?.value || '');
      };
    });
    box.querySelectorAll('.btn-unban').forEach(btn => {
      btn.onclick = async () => {
        await db.collection('users').doc(btn.dataset.uid).update({ banned: false });
        toast('Đã mở khóa');
        loadUsers($('#admin-user-search')?.value || '');
      };
    });
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p style="color:var(--danger)">Lỗi tải users</p>';
  }
}

let searchTimer;
$('#admin-user-search').oninput = (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadUsers(e.target.value.trim()), 300);
};

// ========== POSTS ==========
async function loadPosts() {
  const box = $('#admin-posts-list');
  box.innerHTML = '<p style="color:var(--text-muted)">Đang tải...</p>';
  try {
    let snap;
    try {
      snap = await db.collection('posts').orderBy('createdAt', 'desc').limit(40).get();
    } catch (_) {
      snap = await db.collection('posts').limit(40).get();
    }
    if (snap.empty) {
      box.innerHTML = '<p style="color:var(--text-muted)">Chưa có bài viết</p>';
      return;
    }
    let html = '';
    snap.forEach(doc => {
      const p = doc.data();
      html += `<div class="admin-post-item">
        <div class="ap-body">
          <strong>${escapeHtml(p.authorName || 'User')}</strong>
          <p>${escapeHtml((p.content || '').slice(0, 180))}${(p.content || '').length > 180 ? '...' : ''}</p>
          <div class="ap-meta">${timeAgo(p.createdAt)}${p.type === 'note' ? ' · Ghi chú' : ''} · ${(p.likes || []).length} likes</div>
        </div>
        <div class="admin-actions">
          <button class="btn-ban admin-del-post" data-id="${doc.id}">Xóa</button>
        </div>
      </div>`;
    });
    box.innerHTML = html;
    box.querySelectorAll('.admin-del-post').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Xóa bài viết này?')) return;
        await db.collection('posts').doc(btn.dataset.id).delete();
        toast('Đã xóa bài viết');
        loadPosts();
        loadDashboard();
      };
    });
  } catch (err) {
    box.innerHTML = '<p style="color:var(--danger)">Lỗi tải bài viết</p>';
  }
}

// ========== PAGES ==========
async function loadPages() {
  const box = $('#admin-pages-list');
  box.innerHTML = '<p style="color:var(--text-muted)">Đang tải...</p>';
  try {
    const snap = await db.collection('pages').limit(50).get();
    if (snap.empty) {
      box.innerHTML = '<p style="color:var(--text-muted)">Chưa có page nào</p>';
      return;
    }
    const typeLabel = { personal: 'Cá nhân', business: 'Kinh doanh', community: 'Cộng đồng', brand: 'Thương hiệu' };
    let html = '';
    snap.forEach(doc => {
      const p = doc.data();
      html += `<div class="admin-post-item">
        <div class="ap-body">
          <strong>${escapeHtml(p.name)}</strong>
          <p>${escapeHtml(p.description || '')}</p>
          <div class="ap-meta">${typeLabel[p.type] || p.type} · Chủ: ${escapeHtml(p.ownerName || '')} · ${timeAgo(p.createdAt)}</div>
        </div>
        <div class="admin-actions">
          <button class="btn-ban admin-del-page" data-id="${doc.id}">Xóa</button>
        </div>
      </div>`;
    });
    box.innerHTML = html;
    box.querySelectorAll('.admin-del-page').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Xóa page này?')) return;
        await db.collection('pages').doc(btn.dataset.id).delete();
        toast('Đã xóa page');
        loadPages();
        loadDashboard();
      };
    });
  } catch (err) {
    box.innerHTML = '<p style="color:var(--danger)">Lỗi tải pages</p>';
  }
}

console.log('SREC Admin panel loaded ✓');
