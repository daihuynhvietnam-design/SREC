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
const storage = firebase.storage();

// Keep session persistent (không out khi reload)
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// ========== STATE ==========
let currentUser = null;
let currentUserData = null;
let activeChatId = null;
let activeChatPartner = null;
let postsUnsub = null;
let messagesUnsub = null;
let reqUnsub = null;
let selectedPostImage = null;
let selectedStoryImage = null;
let viewingProfileId = null; // null = own profile
let authReady = false;

// ========== HELPERS ==========
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

function generatePassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pass = 'SREC';
  for (let i = 0; i < len - 4; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
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

function toast(msg, type = 'success') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function relationLabel(v) {
  const m = { single: 'Độc thân', dating: 'Hẹn hò', engaged: 'Đã đính hôn', married: 'Đã kết hôn', complicated: 'Phức tạp', private: 'Không hiển thị' };
  return m[v] || v || '—';
}

function formatContent(text) {
  // Escape then linkify hashtags
  let t = escapeHtml(text || '');
  t = t.replace(/#([\w\u00C0-\u024F\u1E00-\u1EFF]+)/gi, '<span class="hashtag" data-tag="$1">#$1</span>');
  return t;
}

function escapeHtml(t) {
  const d = document.createElement('div');
  d.textContent = t || '';
  return d.innerHTML;
}

// ========== AUTH UI ==========
const authOverlay = $('#auth-overlay');
const authSlider = $('#auth-slider');

function openAuth(mode = 'login') {
  authOverlay.classList.add('active');
  authSlider.classList.toggle('show-register', mode === 'register');
}
function closeAuth() { authOverlay.classList.remove('active'); }

$('#btn-login-nav').onclick = () => openAuth('login');
$('#btn-register-nav').onclick = () => openAuth('register');
$('#btn-start').onclick = () => openAuth('register');
$('#auth-close').onclick = closeAuth;
$('#switch-to-register').onclick = (e) => { e.preventDefault(); authSlider.classList.add('show-register'); };
$('#switch-to-login').onclick = (e) => { e.preventDefault(); authSlider.classList.remove('show-register'); };
$('#btn-learn').onclick = () => $('#why-srec')?.scrollIntoView({ behavior: 'smooth' });

$$('.toggle-pass').forEach(btn => {
  btn.onclick = () => {
    const input = document.getElementById(btn.dataset.target);
    const icon = btn.querySelector('i');
    if (input.type === 'password') { input.type = 'text'; icon.classList.replace('fa-eye', 'fa-eye-slash'); }
    else { input.type = 'password'; icon.classList.replace('fa-eye-slash', 'fa-eye'); }
  };
});

// ========== REGISTER ==========
$('#register-form').onsubmit = async (e) => {
  e.preventDefault();
  const name = $('#reg-name').value.trim();
  const username = normalize($('#reg-username').value);
  const identifier = $('#reg-identifier').value.trim();
  const password = $('#reg-password').value;
  const password2 = $('#reg-password2').value;

  if (password !== password2) return alert('Mật khẩu xác nhận không khớp!');
  if (password.length < 6) return alert('Mật khẩu tối thiểu 6 ký tự!');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return alert('Username chỉ gồm a-z, 0-9, _ (3-20 ký tự)');
  if (!isEmail(identifier) && !isPhone(identifier)) return alert('Nhập email hoặc SĐT hợp lệ!');

  const unameCheck = await db.collection('users').where('username', '==', username).limit(1).get();
  if (!unameCheck.empty) return alert('Username đã được sử dụng!');

  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true; btn.textContent = 'Đang tạo...';

  try {
    const email = toAuthEmail(identifier);
    const cred = await auth.createUserWithEmailAndPassword(email, password);
    const uid = cred.user.uid;

    // User đầu tiên trong hệ thống → tự động làm Admin
    let userRole = 'user';
    try {
      const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      const anyUser = await db.collection('users').limit(1).get();
      if (admins.empty && anyUser.empty) userRole = 'admin';
    } catch (_) {}

    await db.collection('users').doc(uid).set({
      uid, name, username,
      identifier: normalize(identifier),
      email: isEmail(identifier) ? normalize(identifier) : null,
      phone: isPhone(identifier) ? identifier.replace(/\s/g, '') : null,
      bio: '', avatar: '', cover: '',
      friends: [],
      role: userRole,
      verification: 'none',
      privacy: { story: 'public', note: 'public', post: 'public' },
      language: 'vi',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    await auth.currentUser.updateProfile({ displayName: name });
    closeAuth();
    toast('Đăng ký thành công!');
  } catch (err) {
    console.error(err);
    if (err.code === 'auth/email-already-in-use') alert('Email/SĐT đã được đăng ký!');
    else alert('Lỗi: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Đăng ký';
  }
};

// ========== LOGIN ==========
$('#login-form').onsubmit = async (e) => {
  e.preventDefault();
  let identifier = $('#login-identifier').value.trim();
  const password = $('#login-password').value;
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true; btn.textContent = 'Đang đăng nhập...';

  try {
    if (!isEmail(identifier) && !isPhone(identifier) && !identifier.includes('@')) {
      const snap = await db.collection('users').where('username', '==', normalize(identifier)).limit(1).get();
      if (snap.empty) throw new Error('Không tìm thấy tài khoản');
      identifier = snap.docs[0].data().identifier || snap.docs[0].data().email;
    }

    const email = toAuthEmail(identifier);
    await auth.signInWithEmailAndPassword(email, password);
    closeAuth();
    toast('Đăng nhập thành công!');
  } catch (err) {
    console.error(err);
    alert('Sai thông tin đăng nhập!');
  } finally {
    btn.disabled = false; btn.textContent = 'Đăng nhập';
  }
};

// ========== FORGOT PASSWORD ==========
$('#forgot-password').onclick = (e) => { e.preventDefault(); closeAuth(); $('#forgot-modal').classList.add('active'); $('#forgot-result').style.display = 'none'; };
$('#forgot-close').onclick = () => $('#forgot-modal').classList.remove('active');

$('#forgot-form').onsubmit = async (e) => {
  e.preventDefault();
  const identifier = $('#forgot-identifier').value.trim();
  const btn = e.target.querySelector('[type="submit"]');
  btn.disabled = true; btn.textContent = 'Đang xử lý...';
  try {
    const snap = await db.collection('users').where('identifier', '==', normalize(identifier)).limit(1).get();
    if (snap.empty) { alert('Không tìm thấy tài khoản!'); return; }
    const newPass = generatePassword();
    await db.collection('passwordResets').doc(snap.docs[0].id).set({
      tempPassword: newPass,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    const userData = snap.docs[0].data();
    if (userData.email && isEmail(userData.email)) {
      try { await auth.sendPasswordResetEmail(userData.email); } catch (_) {}
    }
    const result = $('#forgot-result');
    result.style.display = 'block';
    result.innerHTML = '<p>✅ Mật khẩu tạm thời:</p><div class="new-pass">' + newPass + '</div><p style="margin-top:10px;font-size:0.85rem;opacity:0.8">Đăng nhập bằng mật khẩu này. Nếu dùng email thật, kiểm tra hộp thư để reset chính thức.</p>';
  } catch (err) {
    alert('Lỗi: ' + err.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Lấy lại mật khẩu';
  }
};

// ========== AUTH STATE (không out khi reload) ==========
auth.onAuthStateChanged(async (user) => {
  authReady = true;
  $('#app-loader').style.display = 'none';

  if (user) {
    currentUser = user;
    const doc = await db.collection('users').doc(user.uid).get();
    if (doc.exists) {
      currentUserData = { id: doc.id, ...doc.data() };
    } else {
      currentUserData = {
        id: user.uid, uid: user.uid,
        name: user.displayName || 'Người dùng SREC',
        username: 'user' + user.uid.slice(0, 6),
        identifier: user.email, bio: '', avatar: '', cover: '',
        friends: [], verification: 'none',
        privacy: { story: 'public', note: 'public', post: 'public' },
        language: 'vi'
      };
      await db.collection('users').doc(user.uid).set(currentUserData, { merge: true });
    }
    showApp();
  } else {
    currentUser = null;
    currentUserData = null;
    showLanding();
  }
});

function showLanding() {
  $('#landing-page').style.display = 'block';
  $('#app').style.display = 'none';
  if (postsUnsub) { postsUnsub(); postsUnsub = null; }
  if (messagesUnsub) { messagesUnsub(); messagesUnsub = null; }
  if (reqUnsub) { reqUnsub(); reqUnsub = null; }
}

async function showApp() {
  $('#landing-page').style.display = 'none';
  $('#app').style.display = 'block';

  // Nếu chưa có admin nào → tự cấp admin cho user hiện tại (bootstrap)
  try {
    if (currentUserData.role !== 'admin') {
      const admins = await db.collection('users').where('role', '==', 'admin').limit(1).get();
      if (admins.empty) {
        await db.collection('users').doc(currentUser.uid).update({ role: 'admin' });
        currentUserData.role = 'admin';
        console.log('Bootstrap: granted admin to first user');
      }
    }
  } catch (e) { console.warn('admin bootstrap', e); }

  updateUserUI();
  // Hiện menu admin nếu là admin
  const isAdmin = currentUserData.role === 'admin';
  const navAdmin = $('#nav-admin');
  if (navAdmin) navAdmin.style.display = isAdmin ? 'flex' : 'none';
  // Kick nếu bị ban
  if (currentUserData.banned === true) {
    alert('Tài khoản của bạn đã bị khóa bởi Quản trị viên.');
    await auth.signOut();
    return;
  }
  switchView('feed');
  loadFeed();
  loadStories();
  loadSuggestions();
  listenFriendRequests();
}

function updateUserUI() {
  const name = currentUserData.name || 'User';
  const avatar = currentUserData.avatar || defaultAvatar(name);
  const uname = currentUserData.username || '';
  const badge = badgeHTML(currentUserData.verification);

  $('#header-name').textContent = name;
  $('#header-avatar').src = avatar;
  $('#header-badge').innerHTML = badge;
  $('#sidebar-name').textContent = name;
  $('#sidebar-avatar').src = avatar;
  $('#sidebar-username').textContent = '@' + uname;
  $('#create-avatar').src = avatar;
  $('#modal-avatar').src = avatar;
  $('#modal-name').textContent = name;
  $('#profile-name').innerHTML = name + ' ' + badge;
  $('#profile-avatar').src = avatar;
  $('#profile-username').textContent = '@' + uname;
  $('#profile-bio').textContent = currentUserData.bio || 'Chưa có giới thiệu';

  if (currentUserData.cover) {
    $('#profile-cover').style.backgroundImage = 'url(' + currentUserData.cover + ')';
    $('#profile-cover').style.backgroundSize = 'cover';
    $('#profile-cover').style.backgroundPosition = 'center';
  } else {
    $('#profile-cover').style.backgroundImage = '';
    $('#profile-cover').style.background = 'var(--gradient)';
  }
}

// ========== NAVIGATION ==========
$$('.nav-item').forEach(item => {
  item.onclick = (e) => {
    e.preventDefault();
    $$('.nav-item').forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    switchView(item.dataset.view);
  };
});

$('#sidebar-profile').onclick = () => {
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item[data-view="profile"]')?.classList.add('active');
  switchView('profile');
};
$('#menu-profile').onclick = (e) => { e.preventDefault(); $('#user-dropdown').classList.remove('active'); switchView('profile'); };
$('#menu-settings').onclick = (e) => { e.preventDefault(); $('#user-dropdown').classList.remove('active'); switchView('settings'); };
$('#logo-home').onclick = () => {
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item[data-view="feed"]')?.classList.add('active');
  switchView('feed');
};

function switchView(view) {
  $$('.view').forEach(v => v.style.display = 'none');
  const el = $('#view-' + view);
  if (el) el.style.display = 'block';
  if (view === 'feed') { loadFeed(); loadStories(); }
  if (view === 'profile') loadProfile();
  if (view === 'friends') loadFriends();
  if (view === 'messages') loadConversations();
  if (view === 'settings') loadSettings();
  if (view === 'admin') {
    if (currentUserData.role !== 'admin') {
      toast('Bạn không có quyền truy cập!', 'error');
      switchView('feed');
      return;
    }
    loadAdmin();
  }
}

$('.user-menu').onclick = (e) => { e.stopPropagation(); $('#user-dropdown').classList.toggle('active'); };
document.addEventListener('click', () => {
  $('#user-dropdown')?.classList.remove('active');
  $('#friend-req-panel').style.display = 'none';
  $('#notif-panel').style.display = 'none';
});

$('#menu-logout').onclick = async (e) => {
  e.preventDefault();
  await auth.signOut();
  toast('Đã đăng xuất');
};

// ========== SEARCH ==========
let searchTimeout;
const searchInput = $('#search-users');
const searchBox = $('#search-results');

if (searchInput) {
  searchInput.oninput = (e) => {
    clearTimeout(searchTimeout);
    const raw = e.target.value.trim();
    const q = normalize(raw.replace(/^@/, ''));
    if (!q || q.length < 1) {
      searchBox.classList.remove('active');
      searchBox.innerHTML = '';
      return;
    }

    searchTimeout = setTimeout(async () => {
      try {
        searchBox.innerHTML = '<div style="padding:14px;color:var(--text-muted);font-size:0.9rem;">Đang tìm...</div>';
        searchBox.classList.add('active');

        // Lấy users (tăng limit) rồi lọc client-side — ổn định, không cần index
        const all = await db.collection('users').limit(200).get();
        const results = [];
        all.forEach(doc => {
          if (doc.id === currentUser.uid) return;
          const u = doc.data() || {};
          const uname = normalize(u.username || '');
          const name = normalize(u.name || '');
          const ident = normalize(u.identifier || '');
          if (uname.includes(q) || name.includes(q) || ident.includes(q)) {
            results.push({ id: doc.id, ...u });
          }
        });

        // Ưu tiên match username trước
        results.sort((a, b) => {
          const aU = normalize(a.username || '').startsWith(q) ? 0 : 1;
          const bU = normalize(b.username || '').startsWith(q) ? 0 : 1;
          return aU - bU;
        });

        if (!results.length) {
          searchBox.innerHTML = '<div style="padding:16px;color:var(--text-muted);font-size:0.9rem;">Không tìm thấy "' + escapeHtml(raw) + '"</div>';
          return;
        }

        let html = '';
        results.slice(0, 12).forEach(u => {
          const isFriend = (currentUserData.friends || []).includes(u.id);
          html += '<div class="search-item" data-uid="' + u.id + '" data-name="' + escapeHtml(u.name || 'User') + '">' +
            '<img src="' + (u.avatar || defaultAvatar(u.name)) + '" />' +
            '<div style="flex:1;min-width:0;">' +
            '<strong>' + escapeHtml(u.name || 'User') + ' ' + badgeHTML(u.verification) + '</strong>' +
            '<span>@' + (u.username || '—') + (isFriend ? ' · Bạn bè' : '') + '</span></div>' +
            '<button class="search-action-btn" data-uid="' + u.id + '" data-name="' + escapeHtml(u.name || 'User') + '" data-friend="' + isFriend + '" style="padding:6px 12px;border-radius:8px;border:none;background:var(--primary);color:#fff;font-size:0.8rem;font-weight:600;cursor:pointer;flex-shrink:0;">' +
            (isFriend ? 'Nhắn tin' : 'Kết bạn') + '</button></div>';
        });
        searchBox.innerHTML = html;

        searchBox.querySelectorAll('.search-action-btn').forEach(btn => {
          btn.onclick = async (ev) => {
            ev.stopPropagation();
            const uid = btn.dataset.uid;
            const name = btn.dataset.name;
            if (btn.dataset.friend === 'true') {
              searchBox.classList.remove('active');
              searchInput.value = '';
              openChat(uid, name);
            } else {
              await sendFriendRequest(uid, name);
              btn.textContent = 'Đã gửi';
              btn.disabled = true;
            }
          };
        });

        searchBox.querySelectorAll('.search-item').forEach(item => {
          item.onclick = (ev) => {
            if (ev.target.closest('.search-action-btn')) return;
            searchBox.classList.remove('active');
            searchInput.value = '';
            openUserProfile(item.dataset.uid);
          };
        });
      } catch (err) {
        console.error('Search error:', err);
        searchBox.innerHTML = '<div style="padding:16px;color:#f87171;font-size:0.9rem;">Lỗi tìm kiếm. Kiểm tra Firestore rules (cho phép đọc users).</div>';
      }
    }, 250);
  };

  // Ẩn dropdown khi click ra ngoài
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-bar')) {
      searchBox.classList.remove('active');
    }
  });
}

// ========== FRIEND REQUESTS ==========
function listenFriendRequests() {
  if (reqUnsub) reqUnsub();
  reqUnsub = db.collection('friendRequests')
    .where('to', '==', currentUser.uid)
    .where('status', '==', 'pending')
    .onSnapshot(async (snap) => {
      const badge = $('#req-badge');
      if (snap.empty) {
        badge.style.display = 'none';
        $('#friend-req-list').innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;padding:8px 0;">Không có lời mời nào</p>';
        return;
      }
      badge.style.display = 'flex';
      badge.textContent = snap.size;

      let html = '';
      for (const doc of snap.docs) {
        const req = doc.data();
        let name = 'User', avatar = '', username = '';
        try {
          const uDoc = await db.collection('users').doc(req.from).get();
          if (uDoc.exists) { const u = uDoc.data(); name = u.name; avatar = u.avatar; username = u.username || ''; }
        } catch (_) {}
        html += '<div class="req-item"><img src="' + (avatar || defaultAvatar(name)) + '" />' +
          '<div class="req-info"><strong>' + escapeHtml(name) + '</strong><span>@' + username + '</span></div>' +
          '<div class="req-actions">' +
          '<button class="btn-accept" data-id="' + doc.id + '" data-from="' + req.from + '">Chấp nhận</button>' +
          '<button class="btn-decline" data-id="' + doc.id + '">Từ chối</button></div></div>';
      }
      $('#friend-req-list').innerHTML = html;

      $$('#friend-req-list .btn-accept').forEach(btn => {
        btn.onclick = async () => {
          const reqId = btn.dataset.id;
          const fromId = btn.dataset.from;
          await db.collection('friendRequests').doc(reqId).update({ status: 'accepted' });
          await db.collection('users').doc(currentUser.uid).update({ friends: firebase.firestore.FieldValue.arrayUnion(fromId) });
          await db.collection('users').doc(fromId).update({ friends: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
          currentUserData.friends = currentUserData.friends || [];
          if (!currentUserData.friends.includes(fromId)) currentUserData.friends.push(fromId);
          await db.collection('notifications').add({
            to: fromId, from: currentUser.uid, type: 'friend_accepted',
            text: currentUserData.name + ' đã chấp nhận lời mời kết bạn',
            read: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          toast('Đã chấp nhận lời mời kết bạn!');
        };
      });
      $$('#friend-req-list .btn-decline').forEach(btn => {
        btn.onclick = async () => {
          await db.collection('friendRequests').doc(btn.dataset.id).update({ status: 'declined' });
          toast('Đã từ chối');
        };
      });
    });
}

$('#btn-friend-req').onclick = (e) => {
  e.stopPropagation();
  const panel = $('#friend-req-panel');
  panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
  $('#notif-panel').style.display = 'none';
};

async function sendFriendRequest(toUid, toName) {
  if (toUid === currentUser.uid) return;
  if ((currentUserData.friends || []).includes(toUid)) { toast('Đã là bạn bè rồi!', 'error'); return; }
  const existing = await db.collection('friendRequests')
    .where('from', '==', currentUser.uid).where('to', '==', toUid).where('status', '==', 'pending').limit(1).get();
  if (!existing.empty) { toast('Đã gửi lời mời rồi!', 'error'); return; }

  await db.collection('friendRequests').add({
    from: currentUser.uid, to: toUid, status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  await db.collection('notifications').add({
    to: toUid, from: currentUser.uid, type: 'friend_request',
    text: currentUserData.name + ' muốn kết bạn với bạn',
    read: false, createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  toast('Đã gửi lời mời kết bạn đến ' + toName + '!');
}

// ========== FEED ==========
function loadFeed() {
  if (postsUnsub) postsUnsub();
  const feed = $('#posts-feed');
  feed.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i><p>Đang tải...</p></div>';

  postsUnsub = db.collection('posts').orderBy('createdAt', 'desc').limit(50)
    .onSnapshot(async (snap) => {
      if (snap.empty) {
        feed.innerHTML = '<div class="empty-state"><i class="fas fa-newspaper"></i><p>Chưa có bài viết. Hãy đăng bài đầu tiên!</p></div>';
        return;
      }
      let html = '';
      for (const doc of snap.docs) {
        const post = { id: doc.id, ...doc.data() };
        if (post.privacy === 'friends' && post.authorId !== currentUser.uid) {
          if (!(currentUserData.friends || []).includes(post.authorId)) continue;
        }
        html += renderPost(post);
      }
      feed.innerHTML = html || '<div class="empty-state"><p>Không có bài viết phù hợp</p></div>';
      bindPostActions();
    }, (err) => {
      console.error(err);
      feed.innerHTML = '<div class="empty-state"><p>Lỗi tải bảng tin</p></div>';
    });
}

function renderPost(post) {
  const avatar = post.authorAvatar || defaultAvatar(post.authorName);
  const liked = (post.likes || []).includes(currentUser.uid);
  const likeCount = (post.likes || []).length;
  const isNote = post.type === 'note';
  return '<div class="post-card ' + (isNote ? 'note-post' : '') + '" data-id="' + post.id + '">' +
    '<div class="post-header"><img src="' + avatar + '" alt="" class="clickable-avatar" data-uid="' + post.authorId + '" /><div class="post-meta">' +
    '<strong class="clickable-name" data-uid="' + post.authorId + '">' + escapeHtml(post.authorName || 'User') + ' ' + badgeHTML(post.authorVerification) + '</strong>' +
    '<span>' + timeAgo(post.createdAt) + (isNote ? ' · Ghi chú' : '') + '</span></div></div>' +
    '<div class="post-body">' + formatContent(post.content || '') + '</div>' +
    (post.imageUrl ? '<img class="post-image" src="' + post.imageUrl + '" alt="" />' : '') +
    '<div class="post-stats"><span>' + (likeCount > 0 ? '<i class="fas fa-heart" style="color:#ef4444"></i> ' + likeCount : '') + '</span><span></span></div>' +
    '<div class="post-actions-bar">' +
    '<button class="post-btn ' + (liked ? 'liked' : '') + '" data-action="like" data-id="' + post.id + '"><i class="' + (liked ? 'fas' : 'far') + ' fa-heart"></i> Thích</button>' +
    '<button class="post-btn" data-action="message" data-uid="' + post.authorId + '" data-name="' + escapeHtml(post.authorName) + '"><i class="far fa-paper-plane"></i> Nhắn tin</button>' +
    '</div></div>';
}

function bindPostActions() {
  $$('.post-btn[data-action="like"]').forEach(btn => {
    btn.onclick = async () => {
      const ref = db.collection('posts').doc(btn.dataset.id);
      const doc = await ref.get();
      if (!doc.exists) return;
      const likes = doc.data().likes || [];
      if (likes.includes(currentUser.uid)) await ref.update({ likes: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
      else await ref.update({ likes: firebase.firestore.FieldValue.arrayUnion(currentUser.uid) });
    };
  });
  $$('.post-btn[data-action="message"]').forEach(btn => {
    btn.onclick = () => { if (btn.dataset.uid !== currentUser.uid) openChat(btn.dataset.uid, btn.dataset.name); };
  });
  $$('.clickable-name, .clickable-avatar').forEach(el => {
    el.onclick = (e) => {
      e.stopPropagation();
      const uid = el.dataset.uid;
      if (uid) openUserProfile(uid);
    };
  });
  $$('.hashtag').forEach(el => {
    el.onclick = () => {
      toast('Hashtag #' + el.dataset.tag);
    };
  });
}

$('#post-input').onclick = openCreatePost;
$('#btn-create-post').onclick = openCreatePost;
$('#btn-add-photo').onclick = openCreatePost;
function openCreatePost() {
  selectedPostImage = null;
  $('#post-content').value = '';
  $('#post-image-preview').style.display = 'none';
  $('#create-post-modal').classList.add('active');
}
$('#close-post-modal').onclick = () => $('#create-post-modal').classList.remove('active');
$('#btn-attach-image').onclick = () => $('#post-image-input').click();
$('#post-image-input').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedPostImage = file;
  $('#preview-img').src = URL.createObjectURL(file);
  $('#post-image-preview').style.display = 'block';
};
$('#remove-preview').onclick = () => { selectedPostImage = null; $('#post-image-preview').style.display = 'none'; $('#post-image-input').value = ''; };

$('#btn-submit-post').onclick = async () => {
  const content = $('#post-content').value.trim();
  if (!content && !selectedPostImage) return alert('Hãy viết gì đó hoặc thêm ảnh!');
  const btn = $('#btn-submit-post');
  btn.disabled = true; btn.textContent = 'Đang đăng...';
  try {
    let imageUrl = '';
    if (selectedPostImage) {
      const ref = storage.ref('posts/' + currentUser.uid + '/' + Date.now() + '_' + selectedPostImage.name);
      await ref.put(selectedPostImage);
      imageUrl = await ref.getDownloadURL();
    }
    await db.collection('posts').add({
      authorId: currentUser.uid, authorName: currentUserData.name,
      authorAvatar: currentUserData.avatar || '', authorVerification: currentUserData.verification || 'none',
      content, imageUrl, type: 'post', privacy: currentUserData.privacy?.post || 'public',
      likes: [], commentCount: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('#create-post-modal').classList.remove('active');
    toast('Đã đăng bài!');
  } catch (err) { alert('Lỗi: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Đăng'; }
};

// ========== STORIES ==========
function loadStories() {
  const list = $('#stories-list');
  const now = Date.now();
  db.collection('stories').orderBy('createdAt', 'desc').limit(30).get().then(snap => {
    let html = '';
    const seen = new Set();
    snap.forEach(doc => {
      const s = doc.data();
      const created = s.createdAt?.toDate?.()?.getTime() || 0;
      if (now - created > 24 * 3600 * 1000) return;
      if (s.privacy === 'friends' && s.authorId !== currentUser.uid && !(currentUserData.friends || []).includes(s.authorId)) return;
      if (s.privacy === 'only_me' && s.authorId !== currentUser.uid) return;
      if (seen.has(s.authorId)) return;
      seen.add(s.authorId);
      html += '<div class="story-item" data-id="' + doc.id + '"><div class="story-ring"><img src="' + (s.imageUrl || s.authorAvatar || defaultAvatar(s.authorName)) + '" /></div>' +
        '<span>' + (s.authorId === currentUser.uid ? 'Tin của bạn' : (s.authorName || '').split(' ')[0]) + '</span></div>';
    });
    list.innerHTML = html;
    list.querySelectorAll('.story-item').forEach(item => {
      item.onclick = async () => {
        const doc = await db.collection('stories').doc(item.dataset.id).get();
        if (!doc.exists) return;
        const s = doc.data();
        $('#view-story-img').src = s.imageUrl || '';
        $('#view-story-author').textContent = s.authorName || '';
        $('#view-story-text').textContent = s.text || '';
        $('#view-story-modal').classList.add('active');
      };
    });
  }).catch(console.error);
}

$('#btn-add-story').onclick = () => {
  selectedStoryImage = null;
  $('#story-text').value = '';
  $('#story-preview').style.display = 'none';
  $('#story-image-input').value = '';
  $('#story-modal').classList.add('active');
};
$('#close-story-modal').onclick = () => $('#story-modal').classList.remove('active');
$('#close-view-story').onclick = () => $('#view-story-modal').classList.remove('active');
$('#story-image-input').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  selectedStoryImage = file;
  $('#story-preview-img').src = URL.createObjectURL(file);
  $('#story-preview').style.display = 'block';
};

$('#btn-submit-story').onclick = async () => {
  if (!selectedStoryImage && !$('#story-text').value.trim()) return alert('Thêm ảnh hoặc nội dung!');
  const btn = $('#btn-submit-story');
  btn.disabled = true; btn.textContent = 'Đang đăng...';
  try {
    let imageUrl = '';
    if (selectedStoryImage) {
      const ref = storage.ref('stories/' + currentUser.uid + '/' + Date.now());
      await ref.put(selectedStoryImage);
      imageUrl = await ref.getDownloadURL();
    }
    await db.collection('stories').add({
      authorId: currentUser.uid, authorName: currentUserData.name, authorAvatar: currentUserData.avatar || '',
      text: $('#story-text').value.trim(), imageUrl,
      privacy: currentUserData.privacy?.story || 'public',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('#story-modal').classList.remove('active');
    loadStories();
    toast('Đã đăng Story!');
  } catch (err) { alert('Lỗi: ' + err.message); }
  finally { btn.disabled = false; btn.textContent = 'Đăng Story'; }
};

// ========== NOTES ==========
$('#btn-add-note').onclick = () => { $('#note-content').value = ''; $('#note-modal').classList.add('active'); };
$('#close-note-modal').onclick = () => $('#note-modal').classList.remove('active');
$('#btn-submit-note').onclick = async () => {
  const content = $('#note-content').value.trim();
  if (!content) return alert('Viết gì đó đi!');
  try {
    await db.collection('posts').add({
      authorId: currentUser.uid, authorName: currentUserData.name,
      authorAvatar: currentUserData.avatar || '', authorVerification: currentUserData.verification || 'none',
      content, imageUrl: '', type: 'note', privacy: currentUserData.privacy?.note || 'public',
      likes: [], commentCount: 0, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    $('#note-modal').classList.remove('active');
    toast('Đã đăng ghi chú!');
  } catch (err) { alert('Lỗi: ' + err.message); }
};

// ========== PROFILE ==========
function loadProfile() {
  openUserProfile(currentUser.uid);
}

async function openUserProfile(uid) {
  viewingProfileId = uid;
  const isOwn = uid === currentUser.uid;

  $$('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item[data-view="profile"]')?.classList.add('active');
  $$('.view').forEach(v => v.style.display = 'none');
  $('#view-profile').style.display = 'block';

  // Reset tabs
  $$('.ptab').forEach(t => t.classList.remove('active'));
  document.querySelector('.ptab[data-ptab="posts"]')?.classList.add('active');
  $('#ptab-posts').style.display = 'block';
  $('#ptab-friends').style.display = 'none';
  $('#ptab-about').style.display = 'none';

  let data = currentUserData;
  if (!isOwn) {
    try {
      const doc = await db.collection('users').doc(uid).get();
      if (!doc.exists) { toast('Không tìm thấy người dùng', 'error'); return; }
      data = { id: doc.id, ...doc.data() };
      // Blocked check
      if ((currentUserData.blocked || []).includes(uid)) {
        toast('Bạn đã chặn người này', 'error');
        return;
      }
      if ((data.blocked || []).includes(currentUser.uid)) {
        toast('Không thể xem trang này', 'error');
        return;
      }
    } catch (err) {
      toast('Lỗi tải trang cá nhân', 'error');
      return;
    }
  }

  const name = data.name || 'User';
  const avatar = data.avatar || defaultAvatar(name);
  const badge = badgeHTML(data.verification);

  $('#profile-name').innerHTML = escapeHtml(name) + ' ' + badge;
  $('#profile-avatar').src = avatar;
  $('#profile-username').textContent = '@' + (data.username || '');
  $('#profile-bio').textContent = data.bio || 'Chưa có giới thiệu';

  // Location & relation
  const locEl = $('#profile-location');
  const relEl = $('#profile-relation');
  if (data.location) {
    locEl.style.display = 'inline';
    locEl.querySelector('span').textContent = data.location;
  } else locEl.style.display = 'none';
  if (data.relation && data.relation !== 'private') {
    relEl.style.display = 'inline';
    relEl.querySelector('span').textContent = relationLabel(data.relation);
  } else relEl.style.display = 'none';

  if (data.cover) {
    $('#profile-cover').style.backgroundImage = 'url(' + data.cover + ')';
    $('#profile-cover').style.backgroundSize = 'cover';
    $('#profile-cover').style.backgroundPosition = 'center';
  } else {
    $('#profile-cover').style.backgroundImage = '';
    $('#profile-cover').style.background = 'var(--gradient)';
  }

  // Actions visibility
  $('#btn-edit-profile').style.display = isOwn ? 'inline-flex' : 'none';
  $('#btn-change-avatar').style.display = isOwn ? 'flex' : 'none';
  $('#btn-change-cover').style.display = isOwn ? 'flex' : 'none';
  $('#btn-msg-profile').style.display = isOwn ? 'none' : 'inline-flex';
  const isFriend = (currentUserData.friends || []).includes(uid);
  $('#btn-friend-profile').style.display = (!isOwn && !isFriend) ? 'inline-flex' : 'none';
  $('#btn-unfriend-profile').style.display = (!isOwn && isFriend) ? 'inline-flex' : 'none';
  $('#btn-block-profile').style.display = isOwn ? 'none' : 'inline-flex';

  $('#btn-msg-profile').onclick = () => openChat(uid, name);
  $('#btn-friend-profile').onclick = async () => {
    await sendFriendRequest(uid, name);
    $('#btn-friend-profile').textContent = 'Đã gửi';
    $('#btn-friend-profile').disabled = true;
  };
  $('#btn-unfriend-profile').onclick = async () => {
    if (!confirm('Hủy kết bạn với ' + name + '?')) return;
    await db.collection('users').doc(currentUser.uid).update({ friends: firebase.firestore.FieldValue.arrayRemove(uid) });
    await db.collection('users').doc(uid).update({ friends: firebase.firestore.FieldValue.arrayRemove(currentUser.uid) });
    currentUserData.friends = (currentUserData.friends || []).filter(f => f !== uid);
    toast('Đã hủy kết bạn');
    openUserProfile(uid);
  };
  $('#btn-block-profile').onclick = async () => {
    if (!confirm('Chặn ' + name + '? Họ sẽ không liên hệ được bạn.')) return;
    await db.collection('users').doc(currentUser.uid).update({
      blocked: firebase.firestore.FieldValue.arrayUnion(uid),
      friends: firebase.firestore.FieldValue.arrayRemove(uid)
    });
    await db.collection('users').doc(uid).update({
      friends: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
    });
    currentUserData.blocked = currentUserData.blocked || [];
    if (!currentUserData.blocked.includes(uid)) currentUserData.blocked.push(uid);
    currentUserData.friends = (currentUserData.friends || []).filter(f => f !== uid);
    toast('Đã chặn ' + name);
    switchView('feed');
  };

  // Posts
  try {
    const snap = await db.collection('posts').where('authorId', '==', uid).limit(30).get();
    const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    arr.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
    $('#stat-posts').textContent = arr.length;
    let html = '';
    arr.forEach(p => html += renderPost(p));
    $('#profile-posts').innerHTML = html || '<div class="empty-state"><p>Chưa có bài viết</p></div>';
    bindPostActions();
  } catch (err) {
    console.error(err);
    $('#profile-posts').innerHTML = '<div class="empty-state"><p>Lỗi tải bài viết</p></div>';
  }

  const friends = data.friends || [];
  $('#stat-friends').textContent = friends.length;
  loadProfileFriends(friends);

  $('#about-bio').textContent = data.bio || '—';
  $('#about-username').textContent = '@' + (data.username || '');
  $('#about-location').textContent = data.location || '—';
  $('#about-relation').textContent = relationLabel(data.relation);
  const joined = data.createdAt?.toDate?.();
  $('#about-joined').textContent = joined ? joined.toLocaleDateString('vi-VN') : '—';
}

async function loadProfileFriends(friendIds) {
  const grid = $('#profile-friends-grid');
  if (!friendIds.length) { grid.innerHTML = '<div class="empty-state"><p>Chưa có bạn bè</p></div>'; return; }
  let html = '';
  for (const fid of friendIds.slice(0, 20)) {
    try {
      const doc = await db.collection('users').doc(fid).get();
      if (!doc.exists) continue;
      const u = doc.data();
      html += '<div class="friend-card"><img src="' + (u.avatar || defaultAvatar(u.name)) + '" /><strong>' + escapeHtml(u.name) + ' ' + badgeHTML(u.verification) + '</strong>' +
        '<button class="secondary" data-uid="' + fid + '" data-name="' + escapeHtml(u.name) + '">Nhắn tin</button></div>';
    } catch (_) {}
  }
  grid.innerHTML = html || '<div class="empty-state"><p>Chưa có bạn bè</p></div>';
  grid.querySelectorAll('button').forEach(btn => { btn.onclick = () => openChat(btn.dataset.uid, btn.dataset.name); });
}

$$('.ptab').forEach(tab => {
  tab.onclick = () => {
    $$('.ptab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    ['posts', 'friends', 'about'].forEach(p => { $('#ptab-' + p).style.display = tab.dataset.ptab === p ? 'block' : 'none'; });
  };
});

$('#btn-edit-profile').onclick = () => {
  $('#edit-name').value = currentUserData.name || '';
  $('#edit-bio').value = currentUserData.bio || '';
  if ($('#edit-location')) $('#edit-location').value = currentUserData.location || '';
  if ($('#edit-relation')) $('#edit-relation').value = currentUserData.relation || '';
  $('#edit-profile-modal').classList.add('active');
};
$('#close-edit-modal').onclick = () => $('#edit-profile-modal').classList.remove('active');
$('#btn-save-profile').onclick = async () => {
  const name = $('#edit-name').value.trim();
  const bio = $('#edit-bio').value.trim();
  const location = $('#edit-location') ? $('#edit-location').value.trim() : '';
  const relation = $('#edit-relation') ? $('#edit-relation').value : '';
  if (!name) return alert('Tên không được trống');
  await db.collection('users').doc(currentUser.uid).update({ name, bio, location, relation });
  currentUserData.name = name;
  currentUserData.bio = bio;
  currentUserData.location = location;
  currentUserData.relation = relation;
  await auth.currentUser.updateProfile({ displayName: name });
  updateUserUI();
  openUserProfile(currentUser.uid);
  $('#edit-profile-modal').classList.remove('active');
  toast('Đã cập nhật!');
};

$('#btn-change-avatar').onclick = () => {
  if (viewingProfileId && viewingProfileId !== currentUser.uid) return;
  $('#avatar-input').click();
};
$('#avatar-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return alert('Chỉ chọn file ảnh!');
  if (file.size > 5 * 1024 * 1024) return alert('Ảnh tối đa 5MB!');
  toast('Đang tải avatar...');
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const ref = storage.ref('avatars/' + currentUser.uid + '.' + ext);
    await ref.put(file, { contentType: file.type });
    const url = await ref.getDownloadURL();
    await db.collection('users').doc(currentUser.uid).update({ avatar: url });
    currentUserData.avatar = url;
    updateUserUI();
    if (!viewingProfileId || viewingProfileId === currentUser.uid) {
      $('#profile-avatar').src = url;
    }
    toast('Đã đổi avatar!');
  } catch (err) {
    console.error(err);
    alert('Lỗi đổi avatar: ' + err.message + '\n\nKiểm tra Firebase Storage rules cho phép write.');
  }
  e.target.value = '';
};

$('#btn-change-cover').onclick = () => {
  if (viewingProfileId && viewingProfileId !== currentUser.uid) return;
  $('#cover-input').click();
};
$('#cover-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) return alert('Chỉ chọn file ảnh!');
  if (file.size > 8 * 1024 * 1024) return alert('Ảnh tối đa 8MB!');
  toast('Đang tải ảnh bìa...');
  try {
    const ext = file.name.split('.').pop() || 'jpg';
    const ref = storage.ref('covers/' + currentUser.uid + '.' + ext);
    await ref.put(file, { contentType: file.type });
    const url = await ref.getDownloadURL();
    await db.collection('users').doc(currentUser.uid).update({ cover: url });
    currentUserData.cover = url;
    updateUserUI();
    if (!viewingProfileId || viewingProfileId === currentUser.uid) {
      $('#profile-cover').style.backgroundImage = 'url(' + url + ')';
      $('#profile-cover').style.backgroundSize = 'cover';
    }
    toast('Đã đổi ảnh bìa!');
  } catch (err) {
    console.error(err);
    alert('Lỗi đổi ảnh bìa: ' + err.message + '\n\nKiểm tra Firebase Storage rules.');
  }
  e.target.value = '';
};

// ========== FRIENDS VIEW ==========
function loadFriends() {
  const myList = $('#my-friends-list');
  const friends = currentUserData.friends || [];
  if (!friends.length) {
    myList.innerHTML = '<div class="empty-state"><p>Chưa có bạn bè. Hãy kết bạn!</p></div>';
  } else {
    (async () => {
      let html = '';
      for (const fid of friends) {
        try {
          const doc = await db.collection('users').doc(fid).get();
          if (!doc.exists) continue;
          const u = doc.data();
          html += '<div class="friend-card"><img src="' + (u.avatar || defaultAvatar(u.name)) + '" /><strong>' + escapeHtml(u.name) + ' ' + badgeHTML(u.verification) + '</strong>' +
            '<button class="secondary" data-uid="' + fid + '" data-name="' + escapeHtml(u.name) + '">Nhắn tin</button></div>';
        } catch (_) {}
      }
      myList.innerHTML = html;
      myList.querySelectorAll('button').forEach(btn => { btn.onclick = () => openChat(btn.dataset.uid, btn.dataset.name); });
    })();
  }

  const list = $('#friends-list');
  list.innerHTML = '<div class="empty-state"><i class="fas fa-spinner fa-spin"></i></div>';
  db.collection('users').limit(40).get().then(snap => {
    let html = '';
    snap.forEach(doc => {
      if (doc.id === currentUser.uid) return;
      if ((currentUserData.friends || []).includes(doc.id)) return;
      const u = doc.data();
      html += '<div class="friend-card"><img src="' + (u.avatar || defaultAvatar(u.name)) + '" /><strong>' + escapeHtml(u.name || 'User') + ' ' + badgeHTML(u.verification) + '</strong>' +
        '<span style="font-size:0.8rem;color:var(--text-muted);display:block;margin-bottom:8px;">@' + (u.username || '') + '</span>' +
        '<button data-uid="' + doc.id + '" data-name="' + escapeHtml(u.name) + '">Kết bạn</button></div>';
    });
    list.innerHTML = html || '<div class="empty-state"><p>Không có gợi ý</p></div>';
    list.querySelectorAll('button').forEach(btn => {
      btn.onclick = async () => {
        await sendFriendRequest(btn.dataset.uid, btn.dataset.name);
        btn.textContent = 'Đã gửi'; btn.disabled = true;
      };
    });
  });
}

function loadSuggestions() {
  const box = $('#suggestions');
  db.collection('users').limit(10).get().then(snap => {
    let html = '';
    snap.forEach(doc => {
      if (doc.id === currentUser.uid) return;
      if ((currentUserData.friends || []).includes(doc.id)) return;
      const u = doc.data();
      html += '<div class="suggestion-item"><img src="' + (u.avatar || defaultAvatar(u.name)) + '" /><strong>' + escapeHtml(u.name || 'User') + '</strong>' +
        '<button data-uid="' + doc.id + '" data-name="' + escapeHtml(u.name) + '">Kết bạn</button></div>';
    });
    box.innerHTML = html || '<p style="color:var(--text-muted);font-size:0.85rem">Không có gợi ý</p>';
    box.querySelectorAll('button').forEach(btn => {
      btn.onclick = async () => {
        await sendFriendRequest(btn.dataset.uid, btn.dataset.name);
        btn.textContent = 'Đã gửi'; btn.disabled = true;
      };
    });
  });
}

// ========== MESSAGES ==========
function getChatId(a, b) { return [a, b].sort().join('_'); }

function openChat(partnerId, partnerName) {
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  document.querySelector('.nav-item[data-view="messages"]')?.classList.add('active');
  switchView('messages');
  activeChatPartner = { id: partnerId, name: partnerName };
  activeChatId = getChatId(currentUser.uid, partnerId);
  $('#chat-header').innerHTML = '<img src="' + defaultAvatar(partnerName) + '" class="clickable-avatar" data-uid="' + partnerId + '" style="cursor:pointer;" /><span class="clickable-name" data-uid="' + partnerId + '" style="cursor:pointer;">' + escapeHtml(partnerName) + '</span>';
  $('#chat-compose').style.display = 'flex';
  if ($('#chat-toolbar')) $('#chat-toolbar').style.display = 'flex';
  // Bind click name -> profile
  $('#chat-header').querySelectorAll('[data-uid]').forEach(el => {
    el.onclick = () => openUserProfile(el.dataset.uid);
  });
  loadMessages();
  loadStreak();
  applyChatBg();
}

function loadConversations() {
  const box = $('#conversations');
  box.innerHTML = '<div class="empty-state" style="padding:24px"><p>Đang tải...</p></div>';
  db.collection('chats').where('participants', 'array-contains', currentUser.uid).get()
    .then(async (snap) => {
      if (snap.empty) {
        box.innerHTML = '<div class="empty-state" style="padding:24px"><i class="fas fa-comments"></i><p>Chưa có cuộc trò chuyện</p></div>';
        return;
      }
      let html = '';
      for (const doc of snap.docs) {
        const chat = doc.data();
        const partnerId = chat.participants.find(p => p !== currentUser.uid);
        let partnerName = 'User';
        try {
          const uDoc = await db.collection('users').doc(partnerId).get();
          if (uDoc.exists) partnerName = uDoc.data().name;
        } catch (_) {}
        html += '<div class="conv-item" data-uid="' + partnerId + '" data-name="' + escapeHtml(partnerName) + '">' +
          '<img src="' + defaultAvatar(partnerName) + '" /><div><strong>' + escapeHtml(partnerName) + '</strong><span>' + escapeHtml(chat.lastMessage || '') + '</span></div></div>';
      }
      box.innerHTML = html;
      box.querySelectorAll('.conv-item').forEach(item => {
        item.onclick = () => {
          $$('.conv-item').forEach(c => c.classList.remove('active'));
          item.classList.add('active');
          openChat(item.dataset.uid, item.dataset.name);
        };
      });
    }).catch(() => { box.innerHTML = '<div class="empty-state"><p>Lỗi tải tin nhắn</p></div>'; });
}

function loadMessages() {
  if (messagesUnsub) messagesUnsub();
  const box = $('#chat-messages');
  box.innerHTML = '';
  db.collection('chats').doc(activeChatId).set({
    participants: [currentUser.uid, activeChatPartner.id],
    lastMessage: '',
    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  messagesUnsub = db.collection('chats').doc(activeChatId).collection('messages')
    .orderBy('createdAt', 'asc')
    .onSnapshot(snap => {
      let html = '';
      snap.forEach(doc => {
        const msg = doc.data();
        const mine = msg.senderId === currentUser.uid;
        const canDel = mine;
        html += '<div class="chat-msg ' + (mine ? 'mine' : 'theirs') + '" data-mid="' + doc.id + '">' +
          formatContent(msg.text) +
          (canDel ? '<button class="msg-del" data-mid="' + doc.id + '" title="Xóa"><i class="fas fa-times"></i></button>' : '') +
          '<span class="time">' + timeAgo(msg.createdAt) + '</span></div>';
      });
      box.innerHTML = html;
      box.scrollTop = box.scrollHeight;
      box.querySelectorAll('.msg-del').forEach(btn => {
        btn.onclick = async (e) => {
          e.stopPropagation();
          if (!confirm('Xóa tin nhắn này?')) return;
          try {
            await db.collection('chats').doc(activeChatId).collection('messages').doc(btn.dataset.mid).delete();
            toast('Đã xóa tin nhắn');
          } catch (err) { alert('Lỗi xóa: ' + err.message); }
        };
      });
    });
}

async function loadStreak() {
  const el = $('#chat-streak');
  if (!el || !activeChatId) return;
  try {
    const doc = await db.collection('chats').doc(activeChatId).get();
    const streak = doc.exists ? (doc.data().streak || 0) : 0;
    el.querySelector('span').textContent = streak;
  } catch (_) {
    el.querySelector('span').textContent = '0';
  }
}

async function updateStreak() {
  if (!activeChatId) return;
  const ref = db.collection('chats').doc(activeChatId);
  const doc = await ref.get();
  const data = doc.exists ? doc.data() : {};
  const lastStreakDate = data.lastStreakDate || '';
  const today = new Date().toISOString().slice(0, 10);
  let streak = data.streak || 0;
  if (lastStreakDate === today) {
    // already counted today
  } else {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (lastStreakDate === yesterday) streak += 1;
    else streak = 1;
    await ref.set({ streak, lastStreakDate: today }, { merge: true });
  }
  const el = $('#chat-streak');
  if (el) el.querySelector('span').textContent = streak;
}

function applyChatBg() {
  const box = $('#chat-messages');
  if (!box || !activeChatId) return;
  const key = 'chatbg_' + activeChatId;
  const url = localStorage.getItem(key);
  if (url) {
    box.style.backgroundImage = 'url(' + url + ')';
    box.style.backgroundSize = 'cover';
    box.style.backgroundPosition = 'center';
  } else {
    box.style.backgroundImage = '';
  }
}

$('#btn-send-msg').onclick = sendMessage;
$('#chat-input').onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

async function sendMessage() {
  const input = $('#chat-input');
  const text = input.value.trim();
  if (!text || !activeChatId) return;
  // Blocked check
  if ((currentUserData.blocked || []).includes(activeChatPartner.id)) {
    toast('Bạn đã chặn người này', 'error');
    return;
  }
  input.value = '';
  try {
    await db.collection('chats').doc(activeChatId).collection('messages').add({
      senderId: currentUser.uid, text, createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('chats').doc(activeChatId).update({
      lastMessage: text, updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    updateStreak();
  } catch (err) { alert('Lỗi gửi tin'); }
}

// Chat background
if ($('#btn-chat-bg')) {
  $('#btn-chat-bg').onclick = () => $('#chat-bg-input').click();
}
if ($('#chat-bg-input')) {
  $('#chat-bg-input').onchange = (e) => {
    const file = e.target.files[0];
    if (!file || !activeChatId) return;
    const reader = new FileReader();
    reader.onload = () => {
      localStorage.setItem('chatbg_' + activeChatId, reader.result);
      applyChatBg();
      toast('Đã đổi hình nền chat');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };
}

// Video call (getUserMedia local preview — 2 user cần WebRTC signaling server để gọi thật)
let vcStream = null;
if ($('#btn-video-call')) {
  $('#btn-video-call').onclick = async () => {
    if (!activeChatPartner) return;
    $('#vc-title').textContent = 'Video Call — ' + (activeChatPartner.name || '');
    $('#vc-status').textContent = 'Đang bật camera...';
    $('#video-call-modal').classList.add('active');
    try {
      vcStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      $('#vc-local').srcObject = vcStream;
      $('#vc-status').textContent = 'Camera đã bật. (Gọi 2 chiều thật cần thêm server tín hiệu WebRTC — phiên bản này xem trước camera local)';
    } catch (err) {
      $('#vc-status').textContent = 'Không mở được camera: ' + err.message;
    }
  };
}
if ($('#close-vc')) {
  $('#close-vc').onclick = endVideoCall;
}
if ($('#btn-vc-end')) {
  $('#btn-vc-end').onclick = endVideoCall;
}
function endVideoCall() {
  if (vcStream) {
    vcStream.getTracks().forEach(t => t.stop());
    vcStream = null;
  }
  if ($('#vc-local')) $('#vc-local').srcObject = null;
  if ($('#vc-remote')) $('#vc-remote').srcObject = null;
  $('#video-call-modal')?.classList.remove('active');
}

// Search result also open profile on name click - enhance already done
// Make search open profile option: long-term click opens profile


// ========== SETTINGS ==========
function loadSettings() {
  $('#set-name').value = currentUserData.name || '';
  $('#set-username').value = currentUserData.username || '';
  $('#set-bio').value = currentUserData.bio || '';
  $('#set-avatar-preview').src = currentUserData.avatar || defaultAvatar(currentUserData.name);
  $('#set-story-privacy').value = currentUserData.privacy?.story || 'public';
  $('#set-note-privacy').value = currentUserData.privacy?.note || 'public';
  $('#set-post-privacy').value = currentUserData.privacy?.post || 'public';
  $('#set-language').value = currentUserData.language || 'vi';

  const v = currentUserData.verification || 'none';
  const labels = { none: 'Chưa xác minh', white: 'Tick trắng', blue: 'Tick xanh', black: 'Tick đen' };
  $('#current-verify-status').innerHTML = '<p>Trạng thái hiện tại: <strong>' + labels[v] + '</strong> ' + badgeHTML(v) + '</p>';
  loadMyPages();
  loadVerifyHistory();
}

$$('.s-nav').forEach(btn => {
  btn.onclick = () => {
    $$('.s-nav').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    $$('.s-panel').forEach(p => p.classList.remove('active'));
    $('#s-' + btn.dataset.s)?.classList.add('active');
  };
});

$('#btn-save-general').onclick = async () => {
  const name = $('#set-name').value.trim();
  const username = normalize($('#set-username').value);
  const bio = $('#set-bio').value.trim();
  if (!name) return alert('Tên không được trống');
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return alert('Username không hợp lệ');

  if (username !== currentUserData.username) {
    const check = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!check.empty && check.docs[0].id !== currentUser.uid) return alert('Username đã được dùng!');
  }

  await db.collection('users').doc(currentUser.uid).update({ name, username, bio });
  currentUserData.name = name; currentUserData.username = username; currentUserData.bio = bio;
  await auth.currentUser.updateProfile({ displayName: name });
  updateUserUI();
  toast('Đã lưu!');
};

$('#set-change-avatar').onclick = () => $('#avatar-input').click();

$('#btn-save-privacy').onclick = async () => {
  const privacy = {
    story: $('#set-story-privacy').value,
    note: $('#set-note-privacy').value,
    post: $('#set-post-privacy').value
  };
  await db.collection('users').doc(currentUser.uid).update({ privacy });
  currentUserData.privacy = privacy;
  toast('Đã lưu quyền riêng tư!');
};

$('#btn-save-lang').onclick = async () => {
  const language = $('#set-language').value;
  await db.collection('users').doc(currentUser.uid).update({ language });
  currentUserData.language = language;
  toast(language === 'vi' ? 'Đã chuyển sang Tiếng Việt' : 'Switched to English');
};

$('#btn-request-verify').onclick = async () => {
  const type = $('#verify-type').value;
  const reason = $('#verify-reason').value.trim();
  if (!reason) return alert('Hãy ghi lý do!');
  const pending = await db.collection('verificationRequests').where('userId', '==', currentUser.uid).where('status', '==', 'pending').limit(1).get();
  if (!pending.empty) return alert('Bạn đang có yêu cầu chờ duyệt!');

  await db.collection('verificationRequests').add({
    userId: currentUser.uid, userName: currentUserData.name, type, reason,
    status: 'pending', createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  toast('Đã gửi yêu cầu xác minh! Admin sẽ duyệt.');
  $('#verify-reason').value = '';
  loadVerifyHistory();
};

async function loadVerifyHistory() {
  const box = $('#verify-history');
  const snap = await db.collection('verificationRequests').where('userId', '==', currentUser.uid).limit(5).get();
  if (snap.empty) { box.innerHTML = ''; return; }
  let html = '<h4 style="margin-bottom:8px;">Lịch sử yêu cầu</h4>';
  const statusMap = { pending: '⏳ Chờ duyệt', approved: '✅ Đã duyệt', rejected: '❌ Từ chối' };
  snap.forEach(doc => {
    const r = doc.data();
    html += '<div class="term-block" style="margin-bottom:8px;"><p><strong>' + r.type + '</strong> — ' + (statusMap[r.status] || r.status) + '</p>' +
      '<p style="font-size:0.85rem;color:var(--text-muted);">' + escapeHtml(r.reason) + '</p></div>';
  });
  box.innerHTML = html;
}

$('#btn-create-page').onclick = async () => {
  const name = $('#page-name').value.trim();
  const type = $('#page-type').value;
  const desc = $('#page-desc').value.trim();
  if (!name) return alert('Nhập tên trang!');
  await db.collection('pages').add({
    name, type, description: desc, ownerId: currentUser.uid, ownerName: currentUserData.name,
    followers: [], createdAt: firebase.firestore.FieldValue.serverTimestamp()
  });
  toast('Đã tạo trang!');
  $('#page-name').value = ''; $('#page-desc').value = '';
  loadMyPages();
};

async function loadMyPages() {
  const box = $('#my-pages');
  const snap = await db.collection('pages').where('ownerId', '==', currentUser.uid).get();
  if (snap.empty) { box.innerHTML = '<p style="color:var(--text-muted);font-size:0.9rem;">Bạn chưa có trang nào</p>'; return; }
  let html = '<h4 style="margin-bottom:12px;">Trang của bạn</h4>';
  const typeLabel = { personal: 'Cá nhân', business: 'Kinh doanh', community: 'Cộng đồng', brand: 'Thương hiệu' };
  snap.forEach(doc => {
    const p = doc.data();
    html += '<div class="term-block" style="margin-bottom:8px;"><strong>' + escapeHtml(p.name) + '</strong>' +
      '<span style="color:var(--text-muted);font-size:0.85rem;"> — ' + (typeLabel[p.type] || p.type) + '</span>' +
      '<p style="font-size:0.85rem;color:var(--text-muted);margin-top:4px;">' + escapeHtml(p.description || '') + '</p></div>';
  });
  box.innerHTML = html;
}



// ========== ADMIN PANEL ==========
function isAdminUser() {
  return currentUserData && currentUserData.role === 'admin';
}

function loadAdmin() {
  loadAdminStats();
  loadAdminVerifyPending();
  loadAdminVerifyHistory();
  loadAdminUsers();
  loadAdminPosts();
}

// Admin tabs
document.querySelectorAll('.atab').forEach(tab => {
  tab.onclick = () => {
    document.querySelectorAll('.atab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('.atab-panel').forEach(p => p.style.display = 'none');
    const panel = document.getElementById('atab-' + tab.dataset.atab);
    if (panel) panel.style.display = 'block';
  };
});

async function loadAdminStats() {
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
  } catch (err) {
    console.error(err);
  }
}

async function loadAdminVerifyPending() {
  const box = $('#admin-verify-list');
  box.innerHTML = '<p style="color:var(--text-muted)">Đang tải...</p>';
  try {
    const snap = await db.collection('verificationRequests').where('status', '==', 'pending').get();
    if (snap.empty) {
      box.innerHTML = '<p style="color:var(--text-muted);padding:12px 0;">Không có yêu cầu nào đang chờ</p>';
      return;
    }
    // Sort client-side by createdAt desc
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
      html += '<div class="verify-card">' +
        '<img src="' + (avatar || defaultAvatar(r.userName)) + '" />' +
        '<div class="verify-info">' +
        '<strong>' + escapeHtml(r.userName || 'User') + ' ' + badgeHTML(r.type) + '</strong>' +
        '<div class="v-meta">@' + username + ' · Yêu cầu: <strong>' + (typeLabel[r.type] || r.type) + '</strong> · ' + timeAgo(r.createdAt) + '</div>' +
        '<div class="v-reason">' + escapeHtml(r.reason || '') + '</div></div>' +
        '<div class="verify-actions">' +
        '<button class="btn-approve" data-id="' + r.id + '" data-uid="' + r.userId + '" data-type="' + r.type + '">Duyệt</button>' +
        '<button class="btn-reject" data-id="' + r.id + '">Từ chối</button></div></div>';
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
          await db.collection('users').doc(btn.dataset.uid).update({
            verification: btn.dataset.type
          });
          await db.collection('notifications').add({
            to: btn.dataset.uid,
            from: currentUser.uid,
            type: 'verify_approved',
            text: 'Yêu cầu tick ' + btn.dataset.type + ' của bạn đã được duyệt!',
            read: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          toast('Đã duyệt tick!');
          loadAdmin();
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
          if (data && data.userId) {
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
          loadAdmin();
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

async function loadAdminVerifyHistory() {
  const box = $('#admin-verify-history');
  try {
    const snap = await db.collection('verificationRequests').limit(30).get();
    const docs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(r => r.status !== 'pending')
      .sort((a, b) => (b.reviewedAt?.toMillis?.() || b.createdAt?.toMillis?.() || 0) - (a.reviewedAt?.toMillis?.() || a.createdAt?.toMillis?.() || 0))
      .slice(0, 15);
    if (!docs.length) {
      box.innerHTML = '<p style="color:var(--text-muted);padding:8px 0;">Chưa có lịch sử</p>';
      return;
    }
    let html = '';
    docs.forEach(r => {
      const statusMap = { approved: '✅ Đã duyệt', rejected: '❌ Từ chối' };
      html += '<div class="term-block" style="margin-bottom:8px;">' +
        '<p><strong>' + escapeHtml(r.userName || '') + '</strong> — ' + (r.type || '') + ' — ' + (statusMap[r.status] || r.status) + '</p>' +
        '<p style="font-size:0.8rem;color:var(--text-muted);">' + escapeHtml(r.reason || '') + '</p></div>';
    });
    box.innerHTML = html;
  } catch (err) {
    box.innerHTML = '';
  }
}

async function loadAdminUsers(filter = '') {
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

    let html = '<table class="admin-table"><thead><tr>' +
      '<th>Người dùng</th><th>Username</th><th>Tick</th><th>Vai trò</th><th>Thao tác</th></tr></thead><tbody>';
    docs.forEach(u => {
      const banned = u.banned === true;
      html += '<tr>' +
        '<td><div class="user-cell"><img src="' + (u.avatar || defaultAvatar(u.name)) + '" /><span>' + escapeHtml(u.name || 'User') + (banned ? ' <span style="color:#f87171">(banned)</span>' : '') + '</span></div></td>' +
        '<td>@' + (u.username || '') + '</td>' +
        '<td>' + badgeHTML(u.verification) + ' ' + (u.verification || 'none') + '</td>' +
        '<td>' + (u.role === 'admin' ? '<span style="color:#f59e0b;font-weight:700;">Admin</span>' : 'User') + '</td>' +
        '<td><div class="admin-actions">' +
        '<select data-uid="' + u.id + '" class="admin-set-tick">' +
        '<option value="">Đặt tick...</option>' +
        '<option value="none"' + (u.verification === 'none' ? ' selected' : '') + '>Không</option>' +
        '<option value="white"' + (u.verification === 'white' ? ' selected' : '') + '>Trắng</option>' +
        '<option value="blue"' + (u.verification === 'blue' ? ' selected' : '') + '>Xanh</option>' +
        '<option value="black"' + (u.verification === 'black' ? ' selected' : '') + '>Đen</option>' +
        '</select>' +
        (u.id !== currentUser.uid ? (
          (u.role === 'admin'
            ? '<button data-uid="' + u.id + '" class="btn-revoke-admin">Gỡ Admin</button>'
            : '<button data-uid="' + u.id + '" class="btn-make-admin">Cấp Admin</button>') +
          (banned
            ? '<button data-uid="' + u.id + '" class="btn-unban">Mở khóa</button>'
            : '<button data-uid="' + u.id + '" class="btn-ban">Khóa</button>')
        ) : '<span style="font-size:0.8rem;color:var(--text-muted);">Bạn</span>') +
        '</div></td></tr>';
    });
    html += '</tbody></table>';
    box.innerHTML = html;

    box.querySelectorAll('.admin-set-tick').forEach(sel => {
      sel.onchange = async () => {
        const val = sel.value;
        if (!val) return;
        await db.collection('users').doc(sel.dataset.uid).update({ verification: val });
        toast('Đã cập nhật tick!');
        loadAdminUsers($('#admin-user-search')?.value || '');
      };
    });
    box.querySelectorAll('.btn-make-admin').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Cấp quyền Admin cho user này?')) return;
        await db.collection('users').doc(btn.dataset.uid).update({ role: 'admin' });
        toast('Đã cấp Admin!');
        loadAdminUsers($('#admin-user-search')?.value || '');
      };
    });
    box.querySelectorAll('.btn-revoke-admin').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Gỡ quyền Admin?')) return;
        await db.collection('users').doc(btn.dataset.uid).update({ role: 'user' });
        toast('Đã gỡ Admin');
        loadAdminUsers($('#admin-user-search')?.value || '');
      };
    });
    box.querySelectorAll('.btn-ban').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Khóa tài khoản này?')) return;
        await db.collection('users').doc(btn.dataset.uid).update({ banned: true });
        toast('Đã khóa tài khoản');
        loadAdminUsers($('#admin-user-search')?.value || '');
      };
    });
    box.querySelectorAll('.btn-unban').forEach(btn => {
      btn.onclick = async () => {
        await db.collection('users').doc(btn.dataset.uid).update({ banned: false });
        toast('Đã mở khóa');
        loadAdminUsers($('#admin-user-search')?.value || '');
      };
    });
  } catch (err) {
    console.error(err);
    box.innerHTML = '<p style="color:var(--danger)">Lỗi tải users</p>';
  }
}

// Search users in admin
const adminSearchEl = document.getElementById('admin-user-search');
if (adminSearchEl) {
  let adminSearchTimer;
  adminSearchEl.oninput = (e) => {
    clearTimeout(adminSearchTimer);
    adminSearchTimer = setTimeout(() => loadAdminUsers(e.target.value.trim()), 300);
  };
}

async function loadAdminPosts() {
  const box = $('#admin-posts-list');
  box.innerHTML = '<p style="color:var(--text-muted)">Đang tải...</p>';
  try {
    const snap = await db.collection('posts').orderBy('createdAt', 'desc').limit(30).get();
    if (snap.empty) {
      box.innerHTML = '<p style="color:var(--text-muted)">Chưa có bài viết</p>';
      return;
    }
    let html = '';
    snap.forEach(doc => {
      const p = doc.data();
      html += '<div class="admin-post-item">' +
        '<div class="ap-body">' +
        '<strong>' + escapeHtml(p.authorName || 'User') + '</strong>' +
        '<p>' + escapeHtml((p.content || '').slice(0, 150)) + ((p.content || '').length > 150 ? '...' : '') + '</p>' +
        '<div class="ap-meta">' + timeAgo(p.createdAt) + (p.type === 'note' ? ' · Ghi chú' : '') + ' · ' + ((p.likes || []).length) + ' likes</div></div>' +
        '<div class="admin-actions"><button class="btn-ban admin-del-post" data-id="' + doc.id + '">Xóa</button></div></div>';
    });
    box.innerHTML = html;
    box.querySelectorAll('.admin-del-post').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm('Xóa bài viết này?')) return;
        await db.collection('posts').doc(btn.dataset.id).delete();
        toast('Đã xóa bài viết');
        loadAdminPosts();
        loadAdminStats();
      };
    });
  } catch (err) {
    // fallback without orderBy
    try {
      const snap = await db.collection('posts').limit(30).get();
      let html = '';
      snap.forEach(doc => {
        const p = doc.data();
        html += '<div class="admin-post-item"><div class="ap-body"><strong>' + escapeHtml(p.authorName || '') + '</strong><p>' + escapeHtml((p.content || '').slice(0, 120)) + '</p></div>' +
          '<div class="admin-actions"><button class="btn-ban admin-del-post" data-id="' + doc.id + '">Xóa</button></div></div>';
      });
      box.innerHTML = html || '<p style="color:var(--text-muted)">Chưa có bài viết</p>';
      box.querySelectorAll('.admin-del-post').forEach(btn => {
        btn.onclick = async () => {
          if (!confirm('Xóa bài viết này?')) return;
          await db.collection('posts').doc(btn.dataset.id).delete();
          toast('Đã xóa');
          loadAdminPosts();
        };
      });
    } catch (e2) {
      box.innerHTML = '<p style="color:var(--danger)">Lỗi tải bài viết</p>';
    }
  }
}

// Chặn user bị ban khi đăng nhập
const _origOnAuth = auth.onAuthStateChanged;
// Check ban after profile load is already in onAuthStateChanged - add check in showApp path
async function checkBannedAndKick() {
  if (currentUserData && currentUserData.banned === true) {
    alert('Tài khoản của bạn đã bị khóa bởi Quản trị viên.');
    await auth.signOut();
  }
}


console.log('SREC App v2 + Admin loaded ✓');
