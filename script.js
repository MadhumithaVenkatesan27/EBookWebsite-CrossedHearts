/* ================================================
   CROSSED HEARTS — SHARED JS
   DRM Protection · Auth · Payment · Navigation
   ================================================ */

// ---- STATE ----
let CH_USER = JSON.parse(sessionStorage.getItem("ch_user") || "null");
let CH_LIB = JSON.parse(sessionStorage.getItem("ch_lib") || "{}");
let CH_PENDING = null;

// ================================================
// LICENSER AUTH — STRICTLY INTERNAL
// Credentials stored here. Add/remove licensers below.
// Password is hashed with chHash() — to get a hash, open
// the browser console and run: chHash("yourpassword")
// ================================================
// ── LICENSER CREDENTIALS ─────────────────────────────────────────────────────
// Hashes are pre-computed with chHash() — do NOT use chHash() here directly
// because chHash() is defined later in this file.
//
// To add a new licenser:
//   1. Open browser console on your site
//   2. Run: chHash("yourpassword")
//   3. Copy the result and paste it as the passwordHash below
//
const CH_LICENSERS = {
  "LIC-0001": { name: "Review Access 1", passwordHash: "1f92cee4" }, // password: licenser2025!
  "LIC-0002": { name: "Review Access 2", passwordHash: "f9d13460" }, // password: reviewer#2025
  // "LIC-0003": { name: "Publisher Name", passwordHash: "paste_hash_here" },
};

let CH_LICENSER = JSON.parse(sessionStorage.getItem("ch_licenser") || "null");

function licSignIn(id, pass) {
  const licenser = CH_LICENSERS[id.trim().toUpperCase()];
  if (!licenser) return false;
  if (licenser.passwordHash !== chHash(pass)) return false;
  CH_LICENSER = { id: id.trim().toUpperCase(), name: licenser.name };
  sessionStorage.setItem("ch_licenser", JSON.stringify(CH_LICENSER));
  return true;
}

function licSignOut() {
  CH_LICENSER = null;
  sessionStorage.removeItem("ch_licenser");
  window.location.href = "index.html";
}

function licGuard() {
  // Call this at the top of every licenser page to protect it
  if (!CH_LICENSER) {
    // Not logged in — open licenser modal on index page
    window.location.href = "index.html#licenser";
    return false;
  }
  return true;
}

// ---- CART STATE ----
// Each item: { id, chId, label, price, cover, coverBg }
let CH_CART = JSON.parse(sessionStorage.getItem("ch_cart") || "[]");

function chSaveCart() {
  sessionStorage.setItem("ch_cart", JSON.stringify(CH_CART));
}

function chCartCount() {
  return CH_CART.length;
}

function chIsInCart(id, chId) {
  return CH_CART.some(function (i) {
    return i.id === id && i.chId === chId;
  });
}

function chAddToCart(id, chId, label, price, cover, coverBg) {
  if (!CH_USER) {
    openAuth();
    showToast("Sign in first to add to cart.", "error");
    return false;
  }
  if (isOwned(id, chId) || (chId === "bundle" && hasAnyOwned(id))) {
    showToast("You already own this — check My Library.", "info");
    return false;
  }
  if (chIsInCart(id, chId)) {
    showToast("Already in your cart.", "info");
    return false;
  }
  CH_CART.push({
    id: id,
    chId: chId,
    label: label,
    price: price,
    cover: cover || null,
    coverBg: coverBg || "linear-gradient(145deg,#3d1a2e,#0a0608)",
  });
  chSaveCart();
  chUpdateCartBadge();
  showToast('"' + label + '" added to cart!', "success");
  return true;
}

function chRemoveFromCart(id, chId) {
  CH_CART = CH_CART.filter(function (i) {
    return !(i.id === id && i.chId === chId);
  });
  chSaveCart();
  chUpdateCartBadge();
}

function chCartSubtotal() {
  return CH_CART.reduce(function (s, i) {
    return s + (parseFloat(i.price) || 0);
  }, 0);
}

function chUpdateCartBadge() {
  var n = chCartCount();
  document.querySelectorAll(".ch-cart-badge").forEach(function (b) {
    b.textContent = n;
    b.style.display = n > 0 ? "flex" : "none";
  });
}

// ================================================
// DRM PROTECTION — INIT
// ================================================
(function initDRM() {
  // 1. Block right-click on the entire document
  document.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showToast("Right-click is disabled on this site.", "error");
  });

  // 2. Block keyboard shortcuts
  document.addEventListener("keydown", (e) => {
    const ctrl = e.ctrlKey || e.metaKey;

    // F12 — DevTools
    if (e.key === "F12") {
      e.preventDefault();
      showToast("DevTools access is restricted.", "error");
      return;
    }

    // Ctrl+Shift+I / J / C — DevTools
    if (ctrl && e.shiftKey && ["i", "I", "j", "J", "c", "C"].includes(e.key)) {
      e.preventDefault();
      showToast("DevTools access is restricted.", "error");
      return;
    }

    // Ctrl+P — Print
    if (ctrl && e.key === "p") {
      e.preventDefault();
      showToast("Printing is disabled for licensed content.", "error");
      return;
    }

    // Ctrl+S — Save
    if (ctrl && e.key === "s") {
      e.preventDefault();
      return;
    }

    // Ctrl+U — View source
    if (ctrl && e.key === "u") {
      e.preventDefault();
      return;
    }

    // Ctrl+A — Select all (on reader page)
    if (ctrl && e.key === "a" && isReaderPage()) {
      e.preventDefault();
      return;
    }

    // Ctrl+C — Copy (on reader page)
    if (ctrl && e.key === "c" && isReaderPage()) {
      e.preventDefault();
      showToast("Copying is disabled for licensed content.", "error");
      return;
    }
  });

  // 3. Block drag-start on images / text
  document.addEventListener("dragstart", (e) => e.preventDefault());

  // 4. Block copy event on reader pages
  document.addEventListener("copy", (e) => {
    if (isReaderPage()) {
      e.preventDefault();
      showToast("Copying is disabled for licensed content.", "error");
    }
  });

  // 5. Print block via CSS (already in style.css @media print)

  // 6. DevTools detection — heuristic window size
  let devOpen = false;
  const DT_THRESHOLD = 160;
  setInterval(() => {
    const open =
      window.outerWidth - window.innerWidth > DT_THRESHOLD ||
      window.outerHeight - window.innerHeight > DT_THRESHOLD;

    if (open && !devOpen) {
      devOpen = true;
      if (isReaderPage()) blurReaderContent();
    } else if (!open && devOpen) {
      devOpen = false;
      if (isReaderPage()) unblurReaderContent();
    }
  }, 1200);

  // 7. Screenshot prevention notice (visual deterrent)
  // True 100% prevention is not possible in a browser
  // The watermark + DRM layers serve as deterrents
})();

function isReaderPage() {
  return document.body.classList.contains("reader-active");
}

function blurReaderContent() {
  const rc = document.getElementById("readerPages");
  if (rc) rc.style.filter = "blur(12px)";
  showToast("Content hidden — DevTools detected.", "error");
}

function unblurReaderContent() {
  const rc = document.getElementById("readerPages");
  if (rc) rc.style.filter = "";
}

// ================================================
// MOBILE NAV
// ================================================
function toggleMobileNav() {
  const mn = document.getElementById("mobileNav");
  if (mn) mn.classList.toggle("open");
}

// ================================================
// PARTICLES (home hero only)
// ================================================
function initParticles() {
  const canvas = document.getElementById("particles");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let W,
    H,
    pts = [];

  function resize() {
    W = canvas.width = canvas.offsetWidth;
    H = canvas.height = canvas.offsetHeight;
  }

  function spawnPt() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      r: Math.random() * 1.2 + 0.3,
      a: Math.random() * Math.PI * 2,
      s: (Math.random() - 0.5) * 0.3,
      op: Math.random() * 0.35 + 0.05,
      da: (Math.random() - 0.5) * 0.008,
    };
  }

  resize();
  pts = Array.from({ length: 60 }, spawnPt);
  window.addEventListener("resize", resize);

  (function draw() {
    ctx.clearRect(0, 0, W, H);
    pts.forEach((p) => {
      p.a += p.da;
      p.x += Math.cos(p.a) * p.s;
      p.y += Math.sin(p.a) * p.s * 0.5;
      if (p.x < 0) p.x = W;
      if (p.x > W) p.x = 0;
      if (p.y < 0) p.y = H;
      if (p.y > H) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(201,168,76,${p.op})`;
      ctx.fill();
    });
    requestAnimationFrame(draw);
  })();
}

// ================================================
// AUTH — Account Registry (localStorage, persists across sessions)
// ================================================

// CH_ACCOUNTS: { email -> { name, email, passwordHash, dob, createdAt } }
function chGetAccounts() {
  try {
    return JSON.parse(localStorage.getItem("ch_accounts") || "{}");
  } catch (e) {
    return {};
  }
}
function chSaveAccounts(acc) {
  localStorage.setItem("ch_accounts", JSON.stringify(acc));
}

// Simple deterministic hash (good enough for client-side demo; replace with bcrypt on a real backend)
function chHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// ── Auth helpers ────────────────────────────────────────────────────────────
function chFieldError(id, msg) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = "var(--rose)";
  let errEl = el.parentNode.querySelector(".ch-field-err");
  if (!errEl) {
    errEl = document.createElement("div");
    errEl.className = "ch-field-err";
    errEl.style.cssText = "font-size:11px;color:var(--rose);margin-top:5px;";
    el.parentNode.appendChild(errEl);
  }
  errEl.textContent = msg;
}
function chClearError(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.borderColor = "";
  const errEl = el.parentNode.querySelector(".ch-field-err");
  if (errEl) errEl.remove();
}
function chClearAllErrors() {
  document.querySelectorAll(".ch-field-err").forEach((e) => e.remove());
  document
    .querySelectorAll("#authBody .form-input")
    .forEach((e) => (e.style.borderColor = ""));
}

// ── Open / close ────────────────────────────────────────────────────────────
function openAuth(tab) {
  const ov = document.getElementById("authOverlay");
  if (ov) {
    ov.classList.add("open");
    // Show licenser tab only when explicitly triggered
    if (tab === "licenser") {
      renderLicenserTab();
    } else {
      renderAuthForm(tab || "in");
    }
  }
}

// Open licenser login specifically (called from hidden footer link or #licenser hash)
function openLicenserAuth() {
  const ov = document.getElementById("authOverlay");
  if (ov) {
    ov.classList.add("open");
    renderLicenserTab();
  }
}

function renderLicenserTab() {
  const authOv = document.getElementById("authOverlay");
  if (!authOv) return;
  // Swap out the modal title/sub
  const titleEl = authOv.querySelector(".modal-title");
  const subEl = authOv.querySelector(".modal-sub");
  const tabsEl = authOv.querySelector(".auth-tabs");
  if (titleEl) titleEl.textContent = "Licenser Access";
  if (subEl)
    subEl.textContent = "Authorised licensers only — access is logged.";
  // Hide normal tabs
  if (tabsEl) tabsEl.style.display = "none";

  const body = document.getElementById("authBody");
  if (!body) return;
  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;background:rgba(201,168,76,0.06);border:1px solid rgba(201,168,76,0.2);border-radius:var(--r);padding:10px 14px;margin-bottom:20px;font-size:11px;color:var(--muted);">
      <span style="color:var(--gold);font-size:13px;flex-shrink:0">🔒</span>
      <span>This portal is restricted to authorised licensers. All sessions are watermarked and logged.</span>
    </div>
    <div class="form-group">
      <label class="form-label">Licenser ID</label>
      <input type="text" class="form-input" id="lic_id" placeholder="e.g. LIC-0001"
        autocomplete="off" spellcheck="false"
        oninput="chClearError('lic_id')"
        onkeydown="if(event.key==='Enter')document.getElementById('lic_pass').focus()">
    </div>
    <div class="form-group">
      <label class="form-label">Password</label>
      <div style="position:relative;">
        <input type="password" class="form-input" id="lic_pass" placeholder="••••••••"
          oninput="chClearError('lic_pass')"
          onkeydown="if(event.key==='Enter')doLicSignIn()"
          style="padding-right:42px;">
        <button type="button" onclick="chTogglePw('lic_pass',this)"
          style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:4px;">
          Show
        </button>
      </div>
    </div>
    <button class="btn-pay" id="licSignInBtn" onclick="doLicSignIn()" style="background:var(--gold);color:var(--ink);">
      Enter Licenser Portal →
    </button>
    <div style="text-align:center;margin-top:16px;">
      <a href="#" style="font-size:11px;color:var(--muted);"
        onclick="event.preventDefault();restoreNormalAuthModal()">
        ← Back to regular sign in
      </a>
    </div>
  `;
}

function restoreNormalAuthModal() {
  const authOv = document.getElementById("authOverlay");
  if (!authOv) return;
  const titleEl = authOv.querySelector(".modal-title");
  const subEl = authOv.querySelector(".modal-sub");
  const tabsEl = authOv.querySelector(".auth-tabs");
  if (titleEl) titleEl.textContent = "Welcome Back";
  if (subEl) subEl.textContent = "Sign in to access your digital library";
  if (tabsEl) tabsEl.style.display = "";
  renderAuthForm("in");
}

function doLicSignIn() {
  chClearAllErrors();
  const id = (document.getElementById("lic_id")?.value || "").trim();
  const pass = document.getElementById("lic_pass")?.value || "";
  let valid = true;

  if (!id) {
    chFieldError("lic_id", "Licenser ID is required.");
    valid = false;
  }
  if (!pass) {
    chFieldError("lic_pass", "Password is required.");
    valid = false;
  }
  if (!valid) return;

  const btn = document.getElementById("licSignInBtn");
  if (btn) {
    btn.innerHTML = '<span class="spinner"></span> Verifying…';
    btn.disabled = true;
  }

  setTimeout(() => {
    const ok = licSignIn(id, pass);
    if (ok) {
      closeAuth();
      showToast(
        "Welcome, " + CH_LICENSER.name + "! Redirecting to portal…",
        "success",
      );
      setTimeout(() => {
        window.location.href = "licenser-portal.html";
      }, 800);
    } else {
      if (btn) {
        btn.innerHTML = "Enter Licenser Portal →";
        btn.disabled = false;
      }
      chFieldError("lic_id", "Invalid Licenser ID or password.");
    }
  }, 700);
}
function closeAuth() {
  const ov = document.getElementById("authOverlay");
  if (ov) ov.classList.remove("open");
  chClearAllErrors();
  // Always restore normal modal state when closing
  const authOv = document.getElementById("authOverlay");
  if (authOv) {
    const titleEl = authOv.querySelector(".modal-title");
    const subEl = authOv.querySelector(".modal-sub");
    const tabsEl = authOv.querySelector(".auth-tabs");
    if (titleEl) titleEl.textContent = "Welcome Back";
    if (subEl) subEl.textContent = "Sign in to access your digital library";
    if (tabsEl) tabsEl.style.display = "";
  }
}
function closeAuthIfBg(e) {
  if (e.target === e.currentTarget) closeAuth();
}
function switchAuth(tab, el) {
  document
    .querySelectorAll(".atab")
    .forEach((t) => t.classList.remove("active"));
  el.classList.add("active");
  chClearAllErrors();
  renderAuthForm(tab);
}

// ── SIGN IN form ─────────────────────────────────────────────────────────────
function renderAuthForm(tab) {
  const body = document.getElementById("authBody");
  if (!body) return;

  if (tab === "in") {
    body.innerHTML = `
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input type="email" class="form-input" id="ai_email" placeholder="your@email.com"
          oninput="chClearError('ai_email')"
          onkeydown="if(event.key==='Enter')document.getElementById('ai_pass').focus()">
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <div style="position:relative;">
          <input type="password" class="form-input" id="ai_pass" placeholder="••••••••"
            oninput="chClearError('ai_pass')"
            onkeydown="if(event.key==='Enter')doSignIn()"
            style="padding-right:42px;">
          <button type="button" onclick="chTogglePw('ai_pass',this)"
            style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:4px;">
            Show
          </button>
        </div>
      </div>
      <button class="btn-pay" id="signInBtn" onclick="doSignIn()">Sign In to Library</button>
      <div style="text-align:center;margin-top:14px;">
        <span style="font-size:12px;color:var(--muted);">No account? </span>
        <a href="#" style="font-size:12px;color:var(--gold);"
          onclick="event.preventDefault();switchAuth('up',document.querySelectorAll('.atab')[1])">
          Create one →
        </a>
      </div>`;
  } else {
    body.innerHTML = `
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">First Name</label>
          <input type="text" class="form-input" id="au_fname" placeholder="First name"
            oninput="chClearError('au_fname')">
        </div>
        <div class="form-group">
          <label class="form-label">Last Name</label>
          <input type="text" class="form-input" id="au_lname" placeholder="Last name"
            oninput="chClearError('au_lname')">
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Email Address</label>
        <input type="email" class="form-input" id="au_email" placeholder="your@email.com"
          oninput="chClearError('au_email');chCheckEmailLive(this.value)">
        <div id="au_email_confirm" style="font-size:11px;margin-top:5px;display:none;"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Date of Birth</label>
        <input type="date" class="form-input" id="au_dob"
          oninput="chClearError('au_dob')" max="">
        <div style="font-size:10px;color:var(--muted);margin-top:5px;">You must be 13 or older to create an account.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Password</label>
        <div style="position:relative;">
          <input type="password" class="form-input" id="au_pass" placeholder="Min. 8 characters"
            oninput="chClearError('au_pass');chPasswordStrength(this.value)"
            style="padding-right:42px;">
          <button type="button" onclick="chTogglePw('au_pass',this)"
            style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:4px;">
            Show
          </button>
        </div>
        <div id="au_pw_strength" style="height:3px;border-radius:2px;margin-top:6px;background:var(--border-s);overflow:hidden;">
          <div id="au_pw_bar" style="height:100%;width:0%;transition:width 0.3s,background 0.3s;border-radius:2px;"></div>
        </div>
        <div id="au_pw_hint" style="font-size:10px;color:var(--muted);margin-top:4px;"></div>
      </div>
      <div class="form-group">
        <label class="form-label">Confirm Password</label>
        <div style="position:relative;">
          <input type="password" class="form-input" id="au_conf" placeholder="Re-enter password"
            oninput="chClearError('au_conf')"
            style="padding-right:42px;">
          <button type="button" onclick="chTogglePw('au_conf',this)"
            style="position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--muted);cursor:pointer;font-size:13px;padding:4px;">
            Show
          </button>
        </div>
      </div>
      <div class="form-group" style="display:flex;align-items:flex-start;gap:10px;">
        <input type="checkbox" id="au_terms" style="margin-top:3px;accent-color:var(--gold);flex-shrink:0;">
        <label for="au_terms" style="font-size:12px;color:var(--muted);cursor:pointer;line-height:1.5;">
          I agree to the <a href="#" style="color:var(--gold);">Terms of Service</a> and
          <a href="#" style="color:var(--gold);">Privacy Policy</a>
        </label>
      </div>
      <button class="btn-pay" id="signUpBtn" onclick="doSignUp()">Create Account &amp; Start Reading</button>
      <div style="text-align:center;margin-top:14px;">
        <span style="font-size:12px;color:var(--muted);">Already have an account? </span>
        <a href="#" style="font-size:12px;color:var(--gold);"
          onclick="event.preventDefault();switchAuth('in',document.querySelectorAll('.atab')[0])">
          Sign in →
        </a>
      </div>`;

    // Set max date for DOB (today)
    const today = new Date().toISOString().split("T")[0];
    const dobEl = document.getElementById("au_dob");
    if (dobEl) dobEl.max = today;
  }
}

// ── Live helpers ─────────────────────────────────────────────────────────────
function chTogglePw(inputId, btn) {
  const el = document.getElementById(inputId);
  if (!el) return;
  const isHidden = el.type === "password";
  el.type = isHidden ? "text" : "password";
  btn.textContent = isHidden ? "Hide" : "Show";
}

function chCheckEmailLive(val) {
  const conf = document.getElementById("au_email_confirm");
  if (!conf) return;
  const email = val.trim().toLowerCase();
  if (!email) {
    conf.style.display = "none";
    return;
  }
  const accounts = chGetAccounts();
  conf.style.display = "block";
  if (accounts[email]) {
    conf.style.color = "var(--rose)";
    conf.textContent = "✕ This email already has an account — try signing in.";
  } else if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    conf.style.color = "#4caf76";
    conf.textContent = "✓ Email is available.";
  } else {
    conf.style.color = "var(--rose)";
    conf.textContent = "Please enter a valid email address.";
  }
}

function chPasswordStrength(val) {
  const bar = document.getElementById("au_pw_bar");
  const hint = document.getElementById("au_pw_hint");
  if (!bar || !hint) return;
  let score = 0;
  if (val.length >= 8) score++;
  if (val.length >= 12) score++;
  if (/[A-Z]/.test(val)) score++;
  if (/[0-9]/.test(val)) score++;
  if (/[^A-Za-z0-9]/.test(val)) score++;
  const levels = [
    { w: "0%", bg: "var(--border-s)", label: "" },
    { w: "25%", bg: "var(--rose)", label: "Weak" },
    { w: "50%", bg: "#e88b00", label: "Fair" },
    { w: "75%", bg: "#c9a84c", label: "Good" },
    { w: "100%", bg: "#4caf76", label: "Strong" },
  ];
  const lvl = levels[Math.min(score, 4)];
  bar.style.width = lvl.w;
  bar.style.background = lvl.bg;
  hint.textContent = lvl.label;
  hint.style.color = lvl.bg;
}

// ── SIGN IN ──────────────────────────────────────────────────────────────────
function doSignIn() {
  chClearAllErrors();
  const email = (document.getElementById("ai_email")?.value || "")
    .trim()
    .toLowerCase();
  const pass = document.getElementById("ai_pass")?.value || "";
  let valid = true;

  if (!email) {
    chFieldError("ai_email", "Email is required.");
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    chFieldError("ai_email", "Enter a valid email address.");
    valid = false;
  }
  if (!pass) {
    chFieldError("ai_pass", "Password is required.");
    valid = false;
  }
  if (!valid) return;

  const btn = document.getElementById("signInBtn");
  if (btn) {
    btn.innerHTML = '<span class="spinner"></span> Signing in…';
    btn.disabled = true;
  }

  setTimeout(() => {
    const accounts = chGetAccounts();
    const account = accounts[email];

    if (!account) {
      if (btn) {
        btn.innerHTML = "Sign In to Library";
        btn.disabled = false;
      }
      chFieldError("ai_email", "No account found with this email.");
      return;
    }
    if (account.passwordHash !== chHash(pass)) {
      if (btn) {
        btn.innerHTML = "Sign In to Library";
        btn.disabled = false;
      }
      chFieldError("ai_pass", "Incorrect password. Please try again.");
      return;
    }

    // Success
    CH_USER = { name: account.name, email: account.email };
    // Restore this user's library from localStorage
    const savedLib = localStorage.getItem("ch_lib_" + email);
    if (savedLib) {
      try {
        CH_LIB = JSON.parse(savedLib);
        sessionStorage.setItem("ch_lib", savedLib);
      } catch (e) {}
    }
    sessionStorage.setItem("ch_user", JSON.stringify(CH_USER));
    updateNavAuth();
    closeAuth();
    showToast("Welcome back, " + account.name + "! 👋", "success");
    if (typeof onAuthChange === "function") onAuthChange();
  }, 900);
}

// ── SIGN UP ──────────────────────────────────────────────────────────────────
function doSignUp() {
  chClearAllErrors();
  const fname = (document.getElementById("au_fname")?.value || "").trim();
  const lname = (document.getElementById("au_lname")?.value || "").trim();
  const email = (document.getElementById("au_email")?.value || "")
    .trim()
    .toLowerCase();
  const dob = document.getElementById("au_dob")?.value || "";
  const pass = document.getElementById("au_pass")?.value || "";
  const conf = document.getElementById("au_conf")?.value || "";
  const terms = document.getElementById("au_terms")?.checked;
  let valid = true;

  // Name validation
  if (!fname) {
    chFieldError("au_fname", "First name is required.");
    valid = false;
  }
  if (!lname) {
    chFieldError("au_lname", "Last name is required.");
    valid = false;
  }

  // Email validation
  if (!email) {
    chFieldError("au_email", "Email is required.");
    valid = false;
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    chFieldError("au_email", "Enter a valid email address.");
    valid = false;
  } else {
    const accounts = chGetAccounts();
    if (accounts[email]) {
      chFieldError(
        "au_email",
        "An account with this email already exists. Please sign in.",
      );
      valid = false;
    }
  }

  // Age validation — must be 13+
  if (!dob) {
    chFieldError("au_dob", "Date of birth is required.");
    valid = false;
  } else {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    if (age < 13) {
      chFieldError(
        "au_dob",
        "You must be at least 13 years old to create an account.",
      );
      valid = false;
    }
    if (birthDate > today) {
      chFieldError("au_dob", "Date of birth cannot be in the future.");
      valid = false;
    }
  }

  // Password validation
  if (!pass) {
    chFieldError("au_pass", "Password is required.");
    valid = false;
  } else if (pass.length < 8) {
    chFieldError("au_pass", "Password must be at least 8 characters.");
    valid = false;
  }

  // Confirm password
  if (!conf) {
    chFieldError("au_conf", "Please confirm your password.");
    valid = false;
  } else if (pass && conf !== pass) {
    chFieldError("au_conf", "Passwords do not match.");
    valid = false;
  }

  // Terms
  if (!terms) {
    showToast("Please accept the Terms of Service to continue.", "error");
    valid = false;
  }

  if (!valid) return;

  const btn = document.getElementById("signUpBtn");
  if (btn) {
    btn.innerHTML = '<span class="spinner"></span> Creating account…';
    btn.disabled = true;
  }

  // Simulate email confirmation step (in production: send verification email)
  setTimeout(() => {
    const accounts = chGetAccounts();

    // Double-check email not taken (race condition safety)
    if (accounts[email]) {
      if (btn) {
        btn.innerHTML = "Create Account & Start Reading";
        btn.disabled = false;
      }
      chFieldError("au_email", "An account with this email already exists.");
      return;
    }

    // Save account
    accounts[email] = {
      name: fname,
      fullName: fname + " " + lname,
      email: email,
      passwordHash: chHash(pass),
      dob: dob,
      createdAt: new Date().toISOString(),
      emailVerified: true, // In production: false until email link clicked
    };
    chSaveAccounts(accounts);

    // Sign in immediately
    CH_USER = { name: fname, email: email };
    sessionStorage.setItem("ch_user", JSON.stringify(CH_USER));
    updateNavAuth();
    closeAuth();

    console.log(
      "EMAIL TRIGGER: Welcome email →",
      email,
      "| Name:",
      fname + " " + lname,
    );
    showToast("Welcome to Crossed Hearts, " + fname + "! ✨", "success");
    if (typeof onAuthChange === "function") onAuthChange();
  }, 1000);
}

function signOut() {
  // Save this user's library to localStorage before signing out
  if (CH_USER && CH_USER.email) {
    localStorage.setItem("ch_lib_" + CH_USER.email, JSON.stringify(CH_LIB));
  }
  CH_USER = null;
  CH_LIB = {};
  sessionStorage.removeItem("ch_user");
  sessionStorage.removeItem("ch_lib");
  updateNavAuth();
  showToast("You have been signed out.");
  window.location.href = "index.html";
}

function updateNavAuth() {
  const si = document.getElementById("navSignIn");
  const so = document.getElementById("navSignOut");
  const ml = document.getElementById("navMyLib");
  if (CH_USER) {
    if (si) si.style.display = "none";
    if (so) so.style.display = "";
    if (ml) ml.style.display = "";
  } else {
    if (si) si.style.display = "";
    if (so) so.style.display = "none";
    if (ml) ml.style.display = "none";
  }
}

// ================================================
// PAYMENT FLOW
// ================================================
function initPurchase(titleId, chId, chLabel, price, cover, coverBg) {
  if (!CH_USER) {
    openAuth();
    return;
  }

  // Full-volume buys go to cart
  if (chId === "bundle") {
    var added = chAddToCart(titleId, chId, chLabel, price, cover, coverBg);
    if (added) {
      setTimeout(function () {
        window.location.href = "cart.html";
      }, 380);
    } else if (chIsInCart(titleId, chId)) {
      window.location.href = "cart.html";
    }
    return;
  }

  // Single chapter: existing modal flow
  CH_PENDING = { titleId, chId, chLabel, price };
  const overlay = document.getElementById("payOverlay");
  const body = document.getElementById("payBody");
  if (!overlay || !body) return;
  overlay.classList.add("open");
  body.innerHTML = renderPayBody(chLabel, price);
}

function renderPayBody(label, price) {
  if (price === 0) {
    return `
      <div class="order-box">
        <div class="order-row"><span class="ol">${label}</span><span class="or" style="color:var(--rose)">FREE</span></div>
        <div class="order-row"><span class="ol">Digital license</span><span class="or" style="color:var(--muted)">Online read-only</span></div>
      </div>
      <button class="btn-pay" onclick="completePurchase()">✓ Unlock Free Chapter</button>
    `;
  }

  return `
    <div class="order-box">
      <div class="order-row"><span class="ol">${label}</span><span class="or">$${price.toFixed(2)}</span></div>
      <div class="order-row"><span class="ol">Digital reading license</span><span class="or" style="color:var(--muted)">Online access · no download</span></div>
      <div class="order-total"><span>Total</span><span>$${price.toFixed(2)}</span></div>
    </div>

    <div class="pay-tabs">
      <div class="ptab active" onclick="switchPayTab(this,'card')">💳 Card</div>
      <div class="ptab" onclick="switchPayTab(this,'paypal')">🅿️ PayPal</div>
    </div>

    <div id="cardSection">
      <div class="form-group">
        <label class="form-label">Name on Card</label>
        <input type="text" class="form-input" id="p_name" placeholder="Full name">
      </div>
      <div class="form-group">
        <label class="form-label">Card Number</label>
        <input type="text" class="form-input" id="p_num" placeholder="1234  5678  9012  3456" maxlength="19" oninput="fmtCard(this)">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Expiry</label>
          <input type="text" class="form-input" id="p_exp" placeholder="MM / YY" maxlength="7" oninput="fmtExp(this)">
        </div>
        <div class="form-group">
          <label class="form-label">CVV</label>
          <input type="text" class="form-input" id="p_cvv" placeholder="•••" maxlength="4">
        </div>
      </div>
      <button class="btn-pay" id="payBtn" onclick="processCard($${price.toFixed(2)})">
        Pay $${price.toFixed(2)} — Unlock Now
      </button>
    </div>

    <div id="paypalSection" style="display:none;text-align:center;padding:24px 0">
      <p style="font-family:var(--font-s);font-size:16px;color:var(--muted);margin-bottom:20px">You will be redirected to PayPal to complete your purchase securely.</p>
      <button class="btn-pay" style="background:#0070ba;color:white" onclick="processCard($${price.toFixed(2)})">Continue with PayPal</button>
    </div>

    <div class="secure-line">🔒 256-bit SSL · Secured Payment</div>
  `;
}

function switchPayTab(el, type) {
  document
    .querySelectorAll(".ptab")
    .forEach((t) => t.classList.remove("active"));
  el.classList.add("active");
  const card = document.getElementById("cardSection");
  const paypal = document.getElementById("paypalSection");
  if (card) card.style.display = type === "card" ? "" : "none";
  if (paypal) paypal.style.display = type === "paypal" ? "" : "none";
}

function fmtCard(el) {
  let v = el.value.replace(/\D/g, "").substring(0, 16);
  el.value = v.replace(/(.{4})/g, "$1 ").trim();
}

function fmtExp(el) {
  let v = el.value.replace(/\D/g, "").substring(0, 4);
  if (v.length > 2) v = v.substring(0, 2) + " / " + v.substring(2);
  el.value = v;
}

function processCard(display_price) {
  const name = document.getElementById("p_name")?.value?.trim();
  const num = document.getElementById("p_num")?.value;
  const exp = document.getElementById("p_exp")?.value;
  const cvv = document.getElementById("p_cvv")?.value;

  if (!name || !num || num.replace(/\s/g, "").length < 16 || !exp || !cvv) {
    showToast("Please fill in all card details.", "error");
    return;
  }

  const btn = document.getElementById("payBtn");
  if (btn) {
    btn.innerHTML = '<span class="spinner"></span>  Processing…';
    btn.disabled = true;
  }

  setTimeout(() => completePurchase(), 1800);
}

function completePurchase() {
  if (!CH_PENDING) return;
  const { titleId, chId } = CH_PENDING;

  if (!CH_LIB[titleId]) CH_LIB[titleId] = [];
  if (!CH_LIB[titleId].includes(chId)) CH_LIB[titleId].push(chId);
  sessionStorage.setItem("ch_lib", JSON.stringify(CH_LIB));
  // Persist library to localStorage so it survives sign-out/sign-in
  if (CH_USER && CH_USER.email) {
    localStorage.setItem("ch_lib_" + CH_USER.email, JSON.stringify(CH_LIB));
  }

  closePayModal();
  showSuccessModal(CH_PENDING);

  // Simulate purchase confirmation email trigger
  console.log(
    "EMAIL TRIGGER: Purchase confirm →",
    CH_USER?.email,
    "| Title:",
    titleId,
    "| Chapter:",
    chId,
  );

  CH_PENDING = null;
}

function showSuccessModal(p) {
  const overlay = document.getElementById("payOverlay");
  const body = document.getElementById("payBody");
  if (!body) return;

  const titleEl = document.getElementById("payModalTitle");
  const subEl = document.getElementById("payModalSub");
  if (titleEl) titleEl.textContent = "Purchase Complete!";
  if (subEl) subEl.textContent = "";

  body.innerHTML = `
    <div class="success-wrap">
      <div class="success-icon">✓</div>
      <h3>You're all set!</h3>
      <p><strong>${p.chLabel}</strong> has been added to your library.<br>
      A confirmation has been sent to ${CH_USER?.email || "your email"}.</p>
      <button class="btn-pay" onclick="closePayModal();window.location.href='my-library.html'">
        Go to My Library
      </button>
    </div>
  `;

  if (overlay) overlay.classList.add("open");
}

function closePayModal() {
  const ov = document.getElementById("payOverlay");
  if (ov) ov.classList.remove("open");
}

// ================================================
// NEWSLETTER
// ================================================
function handleNewsletter(e) {
  e.preventDefault();
  const inp = e.target.querySelector('input[type="email"]');
  if (!inp || !inp.value) return;
  console.log("EMAIL TRIGGER: Newsletter signup →", inp.value);
  showToast(`✓ ${inp.value} added to the Collector's Circle!`, "success");
  inp.value = "";
}

// ================================================
// TOAST
// ================================================
function showToast(msg, type = "") {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = `toast ${type} show`;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove("show"), 3400);
}

// ================================================
// LIBRARY HELPERS
// ================================================
function isOwned(titleId, chId) {
  return (CH_LIB[titleId] || []).includes(chId);
}

function hasAnyOwned(titleId) {
  return (CH_LIB[titleId] || []).length > 0;
}

// ================================================
// CATALOG (used by search)
// ================================================
window.CH_CATALOG = [
  {
    title: "You're Way Too Cheeky, Chigaya-kun! Vol.1",
    genre: "Romance · School Life · Shoujo",
    category: "Manga",
    synopsis:
      "A swoony school romance — Chigaya is the most effortlessly charming boy in class and Kana just wants to survive high school quietly.",
    keywords: "romance school tsundere comedy slice-of-life shoujo chigaya",
    cover: "Images/you'reway-vol1.png",
    url: "title-chigaya-v1.html",
    price: "$7.99",
  },
  {
    title: "You're Way Too Cheeky, Chigaya-kun! Vol.2",
    genre: "Romance · School Life · Shoujo",
    category: "Manga",
    synopsis:
      "The romance deepens as Kana and Chigaya navigate feelings neither is ready to admit.",
    keywords: "romance school tsundere comedy chigaya vol2",
    cover: "Images/you'reway-vol2.jpg",
    url: "title-chigaya-v2.html",
    price: "$7.99",
  },
  {
    title: "The Executioner of Grenimal Vol.1",
    genre: "Action · Fantasy · Mystery",
    category: "Manga",
    synopsis:
      "In a kingdom of shadows, one executioner knows more secrets than anyone dares to speak aloud.",
    keywords: "action fantasy mystery dark executioner grenimal",
    cover: "Images/executioner-vol1.jpg",
    url: "title-grenimal-v1.html",
    price: "$7.99",
  },
  {
    title: "The Executioner of Grenimal Vol.2",
    genre: "Action · Fantasy · Mystery",
    category: "Manga",
    synopsis:
      "Secrets unravel as the executioner faces a conspiracy that could topple the kingdom.",
    keywords: "action fantasy mystery dark executioner grenimal vol2",
    cover: "Images/executioner-vol2.jpg",
    url: "title-grenimal-v2.html",
    price: "$7.99",
  },
  {
    title: "The Matchmaker's Fiancé Vol.1",
    genre: "Romance · Fantasy · Comedy",
    category: "Manga",
    synopsis:
      "She arranges love for everyone else — so why is she now engaged to the most infuriating man at court?",
    keywords: "romance fantasy comedy matchmaker engaged court",
    cover: "Images/matchmaker-vol1.jpg",
    url: "title-matchmaker-v1.html",
    price: "$6.99",
  },
  {
    title: "All-Rounder Maid Connie Ville Vol.1",
    genre: "Romance · Fantasy · Josei",
    category: "Manga",
    synopsis:
      "She can cook, fight, and spy — but falling for the lord of the manor was never in the job description.",
    keywords: "romance fantasy josei maid connie ville servant",
    cover: "Images/allrounder-vol1.jpg",
    url: "title-connie-v1.html",
    price: "$6.99",
  },
  {
    title: "All-Rounder Maid Connie Ville Vol.2",
    genre: "Romance · Fantasy · Josei",
    category: "Manga",
    synopsis:
      "Connie's feelings grow more complicated as danger arrives at the manor gates.",
    keywords: "romance fantasy josei maid connie ville vol2",
    cover: "Images/allrounder-vol2.jpg",
    url: "title-connie-v2.html",
    price: "$6.99",
  },
  {
    title: "Borrowing Your Textbook",
    genre: "Slice-of-Life · Romance",
    category: "Manga",
    synopsis:
      "A quiet library, a borrowed textbook, and the start of something neither expected.",
    keywords: "slice of life romance library textbook school quiet",
    cover: null,
    url: "title-borrowing.html",
    price: "$6.99",
  },
  {
    title: "Time is a Closet",
    genre: "Fantasy · Yuri · Mystery",
    category: "Glam Beat",
    synopsis:
      "A closet that opens to another era — and a girl who falls through time into a world of secrets.",
    keywords: "fantasy yuri mystery time travel closet",
    cover: "Images/time-ch1.png",
    url: "title-timecloset.html",
    price: "$6.99",
  },
  {
    title: "Afternoon Tea for Two",
    genre: "Slice-of-Life · Yuri",
    category: "Glam Beat",
    synopsis:
      "Two women, one tea shop, and the slow warmth of finding someone who feels like home.",
    keywords: "slice of life yuri tea cozy romance",
    cover: "Images/afternoon-ch1.jpg",
    url: "title-afternoontea.html",
    price: "$6.99",
  },
  {
    title: "The Abandoned Villainess Became a Zombie Vol.1",
    genre: "Fantasy · Comedy · Horror",
    category: "Novel",
    synopsis:
      "Betrayed and left for dead, she came back — just not quite the way anyone expected.",
    keywords: "fantasy comedy horror villainess zombie isekai reincarnation",
    cover: "Images/theabondoned-vol1.jpg",
    url: "title-zombie-v1.html",
    price: "From $9.99",
  },
  {
    title: "The Abandoned Villainess Became a Zombie Vol.2",
    genre: "Fantasy · Comedy · Horror",
    category: "Novel",
    synopsis:
      "The zombie villainess continues her unlikely quest, making unlikely allies along the way.",
    keywords: "fantasy comedy horror villainess zombie vol2",
    cover: "Images/theabondoned-vol2.jpg",
    url: "title-zombie-v2.html",
    price: "From $9.99",
  },
  {
    title: "Why Raeliana Ended Up at the Duke's Mansion Vol.1",
    genre: "Romance · Fantasy",
    category: "Novel",
    synopsis:
      "She reincarnated as a character who dies in chapter one — her only escape is to fake an engagement with the story's coldest duke.",
    keywords:
      "romance fantasy isekai reincarnation duke mansion novel raeliana",
    cover: "Images/whyraeliana-vol1.jpg",
    url: "title-raeliana-v1.html",
    price: "From $9.99",
  },
  {
    title: "Why Raeliana Ended Up at the Duke's Mansion Vol.2",
    genre: "Romance · Fantasy",
    category: "Novel",
    synopsis:
      "The fake engagement grows dangerously real as Raeliana uncovers the truth behind her own story.",
    keywords: "romance fantasy isekai duke mansion raeliana vol2",
    cover: "Images/whyraeliana-vol2.jpg",
    url: "title-raeliana-v2.html",
    price: "From $9.99",
  },
  // BLUSH CLUB — BL / Yaoi
  {
    title: "Until We Fall in Love",
    genre: "Romance · Supernatural · BL · Yaoi",
    category: "Blush Club",
    synopsis:
      "Aito is a Cupid who can see the shape of love in everyone — except himself. That changes the moment he meets Kokowa, whose heart burns with a light Aito can't ignore. But there is one absolute law: a Cupid must never fall for a human.",
    keywords:
      "bl yaoi boys love romance supernatural cupid high school slow burn aito kokowa blush club",
    cover: "Images/until-vol1.jpg",
    url: "until.html",
    price: "$6.99",
  },
  {
    title: "The King of Owls and His Troubled Servant",
    genre: "Fantasy BL · Historical · Yaoi",
    category: "Blush Club",
    synopsis:
      "In the frigid Northern Reach of the Underworld, Madara rules as King of the Bird Tribe. His loyal guard Sasou has spent a lifetime burying his own heart — until Madara stops looking for a Queen and starts looking for Sasou.",
    keywords:
      "bl yaoi boys love fantasy historical royal court servant master king owls madara sasou blush club",
    cover: "Images/theking-vol1.jpg",
    url: "theking.html",
    price: "$6.99",
  },
  {
    title: "Roommate Vol.1",
    genre: "Drama · BL · Yaoi · Boarding School",
    category: "Blush Club",
    synopsis:
      "Elite boarding school, one goal: the Scholar mark. But Noah's path is blocked by his reckless roommate Kai. After a shared secret neither expected, the boy who was always absent begins to show up.",
    keywords:
      "bl yaoi boys love drama boarding school roommate opposites attract noah kai vol1 blush club",
    cover: "Images/roommate-vol1.jpg",
    url: "room-vol1.html",
    price: "$6.99",
  },
  {
    title: "Roommate Vol.2",
    genre: "Drama · BL · Yaoi · Boarding School",
    category: "Blush Club",
    synopsis:
      "Noah hides his feelings to stay Kai's closest friend. At a social party he falls ill and accidentally confesses — and Kai, whose feelings have been growing, leans in and kisses him.",
    keywords:
      "bl yaoi boys love drama boarding school roommate confession kiss noah kai vol2 blush club",
    cover: "Images/roommate-vol2.jpg",
    url: "room-vol2.html",
    price: "$6.99",
  },
  {
    title: "The Bird in the Cage Dreams",
    genre: "BL · Historical · Tragedy · Yaoi",
    category: "Blush Club",
    synopsis:
      "Tsad, a retired warrior secretly confined as a comforter, is visited by Ziz — the man closest to becoming chief of the tribe. A historical BL of loyalty, confinement, and the lengths one man will go to set another free.",
    keywords:
      "bl yaoi boys love historical tragedy loyalty cage warrior tribe ziz tsad blush club",
    cover: "Images/thebird-vol1.jpg",
    url: "thebird.html",
    price: "$6.99",
  },
  {
    title: "A Gaze Like Lightning",
    genre: "Drama · BL · Yaoi · School Life",
    category: "Blush Club",
    synopsis:
      "Hiyori is secretly in love with campus heartthrob Ryou. Tasked with finding out if Ryou is taken, he starts 'investigating' — only to realize Ryou might have been looking right back all along.",
    keywords:
      "bl yaoi boys love drama school college hiyori ryou oblivious romance slice of life blush club",
    cover: "Images/gaze-vol1.jpg",
    url: "gaze.html",
    price: "$6.99",
  },
  // PRINT EDITIONS
  {
    title: "You're Way Too Cheeky, Chigaya-kun! Vol.1 (Print)",
    genre: "Romance · School Life · Shoujo",
    category: "Print",
    synopsis:
      "The swoony school romance — now in a beautiful physical edition with limited cover variant available.",
    keywords: "print physical edition chigaya romance school shoujo manga",
    cover: "Images/you'reway-vol1.png",
    url: "print.html",
    price: "$12.99",
  },
  {
    title: "The Executioner of Grenimal Vol.1 (Print)",
    genre: "Action · Dark Fantasy · Mystery",
    category: "Print",
    synopsis:
      "The kingdom of shadows executioner story, now available as a collectible print edition.",
    keywords:
      "print physical edition executioner grenimal action fantasy mystery manga",
    cover: "Images/executioner-vol1.jpg",
    url: "print.html",
    price: "$12.99",
  },
  {
    title: "The Abandoned Villainess Became a Zombie Vol.1 (Print)",
    genre: "Fantasy · Comedy · Horror",
    category: "Print",
    synopsis:
      "The beloved zombie villainess novel in a premium print format for collectors.",
    keywords:
      "print physical edition villainess zombie fantasy comedy horror novel",
    cover: "Images/theabondoned-vol1.jpg",
    url: "print.html",
    price: "$19.99",
  },
  {
    title: "Why Raeliana Ended Up at the Duke's Mansion Vol.1 (Print)",
    genre: "Romance · Historical Fantasy",
    category: "Print",
    synopsis:
      "The isekai romance novel about a fake engagement with the coldest duke, now in print.",
    keywords:
      "print physical edition raeliana duke mansion romance fantasy isekai novel",
    cover: "Images/whyraelianan-vol1.jpg",
    url: "print.html",
    price: "$19.99",
  },
];

// ================================================
// SPOTLIGHT SLIDER
// ================================================
let spotlightIndex = 0;
let spotlightTimer = null;
const SPOTLIGHT_INTERVAL = 3000;

function initSpotlightSlider() {
  const slides = document.querySelectorAll(".spotlight-slide");
  const total = slides.length;
  if (!total) return;

  const totalEl = document.getElementById("spotlightTotal");
  if (totalEl) totalEl.textContent = total;

  spotlightGoTo(0);
  spotlightTimer = setInterval(() => spotlightMove(1), SPOTLIGHT_INTERVAL);

  // Pause on hover
  const slider = document.getElementById("spotlightSlider");
  if (slider) {
    slider.addEventListener("mouseenter", () => clearInterval(spotlightTimer));
    slider.addEventListener("mouseleave", () => {
      clearInterval(spotlightTimer);
      spotlightTimer = setInterval(() => spotlightMove(1), SPOTLIGHT_INTERVAL);
    });
  }
}

function spotlightMove(dir) {
  const slides = document.querySelectorAll(".spotlight-slide");
  spotlightGoTo((spotlightIndex + dir + slides.length) % slides.length);
}

function spotlightGoTo(idx) {
  const slides = document.querySelectorAll(".spotlight-slide");
  const dots = document.querySelectorAll(".sdot");
  if (!slides.length) return;

  slides.forEach((s, i) => s.classList.toggle("active", i === idx));
  dots.forEach((d, i) => d.classList.toggle("active", i === idx));
  spotlightIndex = idx;

  const cur = document.getElementById("spotlightCurrent");
  if (cur) cur.textContent = idx + 1;
}

// ================================================
// SEARCH — live suggestions
// ================================================
// function liveSearchSuggest(val) {
//   const box = document.getElementById("searchSuggestions");
//   const clear = document.getElementById("searchClear");
//   if (!box) return;

//   if (clear) clear.style.display = val ? "" : "none";

//   const q = val.trim().toLowerCase();
//   if (!q) {
//     box.classList.remove("open");
//     return;
//   }

//   const matches = (window.CH_CATALOG || [])
//     .filter((item) => {
//       const text = [item.title, item.genre, item.keywords, item.synopsis]
//         .join(" ")
//         .toLowerCase();
//       return text.includes(q);
//     })
//     .slice(0, 6);

//   if (!matches.length) {
//     box.innerHTML = `<div class="suggestion-no-results">No results for "${val}" — press Search to explore</div>`;
//     box.classList.add("open");
//     return;
//   }

//   box.innerHTML = matches
//     .map(
//       (item) => `
//     <a href="${item.url}" class="suggestion-item">
//       <div class="suggestion-thumb">
//         ${item.cover ? `<img src="${item.cover}" alt="" />` : "📖"}
//       </div>
//       <div class="suggestion-text">
//         <div class="suggestion-title">${item.title}</div>
//         <div class="suggestion-genre">${item.genre}</div>
//       </div>
//       <div class="suggestion-price">${item.price}</div>
//     </a>
//   `,
//     )
//     .join("");
//   box.classList.add("open");
// }

// function doSearch() {
//   const val = document.getElementById("siteSearchInput")?.value?.trim();
//   if (!val) return;
//   window.location.href = `search.html?q=${encodeURIComponent(val)}`;
// }

// function clearSearch() {
//   const inp = document.getElementById("siteSearchInput");
//   const box = document.getElementById("searchSuggestions");
//   const cl = document.getElementById("searchClear");
//   if (inp) inp.value = "";
//   if (box) box.classList.remove("open");
//   if (cl) cl.style.display = "none";
//   inp?.focus();
// }

// // Close suggestions when clicking outside
// document.addEventListener("click", (e) => {
//   const bar = document.getElementById("siteSearchBar");
//   if (bar && !bar.contains(e.target)) {
//     const box = document.getElementById("searchSuggestions");
//     if (box) box.classList.remove("open");
//   }
// });

function openNavSearch() {
  document.getElementById("navSearchOverlay").classList.add("open");
  setTimeout(function () {
    document.getElementById("navSearchInput").focus();
  }, 80);
}

function closeNavSearch() {
  document.getElementById("navSearchOverlay").classList.remove("open");
  navClearSearch();
}

function closeNavSearchIfBg(e) {
  if (e.target === e.currentTarget) closeNavSearch();
}

/* ── Navigate to search results page ── */
function navDoSearch() {
  var val = document.getElementById("navSearchInput").value.trim();
  if (val) {
    window.location.href = "search.html?q=" + encodeURIComponent(val);
  }
}

/* ── Clear input & suggestions ── */
function navClearSearch() {
  var inp = document.getElementById("navSearchInput");
  var box = document.getElementById("navSearchSuggestions");
  var cl = document.getElementById("navSearchClear");
  if (inp) inp.value = "";
  if (box) {
    box.innerHTML = "";
    box.classList.remove("open");
  }
  if (cl) cl.style.display = "none";
  if (inp) inp.focus();
}

/* ── Live suggestions while typing ── */
function navLiveSearch(val) {
  var box = document.getElementById("navSearchSuggestions");
  var cl = document.getElementById("navSearchClear");
  if (!box) return;

  if (cl) cl.style.display = val ? "" : "none";

  var q = val.trim().toLowerCase();
  if (!q) {
    box.innerHTML = "";
    box.classList.remove("open");
    return;
  }

  var catalog = window.CH_CATALOG || [];
  var matches = catalog
    .filter(function (item) {
      var text = [item.title, item.genre, item.keywords, item.synopsis]
        .join(" ")
        .toLowerCase();
      return text.indexOf(q) !== -1;
    })
    .slice(0, 6);

  if (!matches.length) {
    box.innerHTML =
      '<div class="nav-suggestion-empty">No results \u2014 press Search to explore</div>';
    box.classList.add("open");
    return;
  }

  box.innerHTML = matches
    .map(function (item) {
      var thumb = item.cover
        ? '<img src="' + item.cover + '" alt="" />'
        : "\uD83D\uDCD6"; /* 📖 */
      return (
        '<a href="' +
        item.url +
        '" class="nav-suggestion-item">' +
        '<div class="nav-suggestion-thumb">' +
        thumb +
        "</div>" +
        '<div class="nav-suggestion-text">' +
        '<div class="nav-suggestion-title">' +
        item.title +
        "</div>" +
        '<div class="nav-suggestion-genre">' +
        item.genre +
        "</div>" +
        "</div>" +
        '<div class="nav-suggestion-price">' +
        item.price +
        "</div>" +
        "</a>"
      );
    })
    .join("");

  box.classList.add("open");
}

/* ── Close overlay on Escape key ── */
document.addEventListener("keydown", function (e) {
  if (e.key === "Escape") closeNavSearch();
});

/* ── Close suggestions when clicking outside the modal ── */
document.addEventListener("click", function (e) {
  var bar = document.getElementById("navSiteSearchBar");
  var box = document.getElementById("navSearchSuggestions");
  if (bar && box && !bar.contains(e.target)) {
    box.classList.remove("open");
  }
});

(function () {
  /* ── Config ── */
  // Selector for the card grid container(s) on this page.
  // If your page has multiple .card-grid sections, they all get filtered.
  var CARD_SELECTOR = ".title-card";
  var GRID_SELECTOR = ".card-grid";

  /* ── State ── */
  var activeGenre = "all";

  /* ── Init on DOM ready ── */
  document.addEventListener("DOMContentLoaded", function () {
    bindTags();
    updateCount();
  });
  // Also run immediately in case DOM is already parsed
  if (document.readyState !== "loading") {
    bindTags();
    updateCount();
  }

  function bindTags() {
    var tags = document.querySelectorAll(".gf-tag");
    tags.forEach(function (tag) {
      tag.addEventListener("click", function () {
        var genre = tag.getAttribute("data-genre");
        var category = tag.getAttribute("data-category");
        if (category) {
          setFilterByCategory(category);
        } else {
          setFilter(genre);
        }
      });
    });
  }

  function setFilter(genre) {
    activeGenre = genre;

    // Update active state on buttons
    document.querySelectorAll(".gf-tag").forEach(function (tag) {
      tag.classList.toggle(
        "gf-active",
        tag.getAttribute("data-genre") === genre,
      );
    });

    // Show / hide cards
    var cards = document.querySelectorAll(CARD_SELECTOR);
    var visible = 0;

    cards.forEach(function (card) {
      var genres = (card.getAttribute("data-genres") || "").toLowerCase();
      var show = genre === "all" || genres.indexOf(genre) !== -1;

      if (show) {
        card.style.display = "";
        // Subtle re-entry animation
        card.style.opacity = "0";
        card.style.transform = "translateY(8px)";
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            card.style.transition = "opacity 0.28s ease, transform 0.28s ease";
            card.style.opacity = "1";
            card.style.transform = "";
          });
        });
        visible++;
      } else {
        card.style.display = "none";
        card.style.transition = "";
      }
    });

    updateCount(visible);
    toggleEmptyState(visible);
  }

  function setFilterByCategory(category) {
    activeGenre = "category:" + category;

    // Update active state on buttons
    document.querySelectorAll(".gf-tag").forEach(function (tag) {
      var tagCat = tag.getAttribute("data-category");
      tag.classList.toggle("gf-active", tagCat === category);
    });

    // Show / hide cards based on data-category attribute
    var cards = document.querySelectorAll(CARD_SELECTOR);
    var visible = 0;

    cards.forEach(function (card) {
      var cardCat = (card.getAttribute("data-category") || "").toLowerCase();
      var show = cardCat === category.toLowerCase();

      if (show) {
        card.style.display = "";
        card.style.opacity = "0";
        card.style.transform = "translateY(8px)";
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            card.style.transition = "opacity 0.28s ease, transform 0.28s ease";
            card.style.opacity = "1";
            card.style.transform = "";
          });
        });
        visible++;
      } else {
        card.style.display = "none";
        card.style.transition = "";
      }
    });

    updateCount(visible);
    toggleEmptyState(visible);
  }

  function updateCount(n) {
    var numEl = document.getElementById("gfNum");
    if (!numEl) return;
    if (n === undefined) {
      // Count currently visible cards on init
      n = document.querySelectorAll(CARD_SELECTOR).length;
    }
    numEl.textContent = n;
  }

  function toggleEmptyState(visible) {
    // Inject a "no results" message into each grid if all cards are hidden
    document.querySelectorAll(GRID_SELECTOR).forEach(function (grid) {
      var existing = grid.querySelector(".gf-empty");
      if (visible === 0) {
        if (!existing) {
          var el = document.createElement("div");
          el.className = "gf-empty visible";
          el.innerHTML =
            '<div class="gf-empty-icon">📚</div>' +
            "<h3>No titles in this genre</h3>" +
            "<p>Try a different filter or browse all titles.</p>";
          grid.appendChild(el);
        } else {
          existing.classList.add("visible");
        }
      } else {
        if (existing) existing.classList.remove("visible");
      }
    });
  }
})();

function filterCatalog(query) {
  const q = query.trim().toLowerCase();

  if (!q) return [];

  return (window.CH_CATALOG || []).filter((item) =>
    [item.title, item.genre, item.keywords, item.synopsis]
      .join(" ")
      .toLowerCase()
      .includes(q),
  );
}

// ---- CART BADGE INIT (runs on every page load) ----
(function () {
  // Delay so DOM is ready
  document.addEventListener("DOMContentLoaded", function () {
    chUpdateCartBadge();
  });
  if (document.readyState !== "loading") chUpdateCartBadge();
})();

function handleNavAuth() {
  if (CH_USER) {
    signOut();
  } else {
    openAuth();
  }
}

function updateNavAuthBtn() {
  const btn = document.getElementById("navAuthBtn");
  if (!btn) return;
  if (CH_USER) {
    btn.textContent = "Sign Out";
  } else {
    btn.textContent = "Sign In";
  }
}

// Run on load
updateNavAuthBtn();

// Hook into your existing onAuthChange so it updates when login state changes
const _origOnAuthChange =
  typeof onAuthChange === "function" ? onAuthChange : null;
function onAuthChange() {
  if (_origOnAuthChange) _origOnAuthChange();
  renderLib();
  updateNavAuthBtn();
}

function handleNavAuth() {
  if (CH_USER) signOut();
  else openAuth();
}

function updateNavAuthBtn() {
  const btn = document.getElementById("navAuthBtn");
  if (!btn) return;
  btn.textContent = CH_USER ? "Sign Out" : "Sign In";
}

updateNavAuthBtn();
