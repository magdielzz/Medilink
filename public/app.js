/* global fetch, localStorage, location, history, document, window */
'use strict';

// ============================================================
// STATE
// ============================================================
const State = (() => {
  const TOKEN_KEY = 'ml_token';
  let _user = null;
  let _token = (() => {
    const t = localStorage.getItem(TOKEN_KEY);
    if (!t) return null;
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      if (payload.exp * 1000 < Date.now()) { localStorage.removeItem(TOKEN_KEY); return null; }
      return t;
    } catch { localStorage.removeItem(TOKEN_KEY); return null; }
  })();

  return {
    getToken()           { return _token; },
    getUser()            { return _user; },
    setUser(u)           { _user = u; },
    isLoggedIn()         { return !!_token; },
    setAuth(token, user) { _token = token; _user = user; localStorage.setItem(TOKEN_KEY, token); },
    clearAuth()          { _token = null; _user = null; localStorage.removeItem(TOKEN_KEY); },
  };
})();

// ============================================================
// API CLIENT
// ============================================================
const API = (() => {
  async function req(method, path, body, auth = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (auth && State.getToken()) headers['Authorization'] = `Bearer ${State.getToken()}`;
    const res = await fetch('/api' + path, {
      method, headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return {};
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.error || `Error ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }
  return {
    get:        (p)    => req('GET',    p),
    post:       (p, b) => req('POST',   p, b),
    put:        (p, b) => req('PUT',    p, b),
    del:        (p)    => req('DELETE', p),
    postPublic: (p, b) => req('POST',   p, b, false),
  };
})();

// ============================================================
// TOAST
// ============================================================
const Toast = (() => {
  const icons = { success: '✓', error: '✕', warning: '!', info: 'i' };
  function show(message, type = 'info', ms = 4500) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const id = 'toast-' + Date.now();
    const el = document.createElement('div');
    el.id = id;
    el.className = `toast toast-${type}`;
    el.innerHTML = `<span class="toast__icon">${icons[type]||icons.info}</span><span class="toast__message">${escHtml(message)}</span><button class="toast__close" aria-label="Cerrar" onclick="document.getElementById('${id}').remove()">✕</button>`;
    container.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('visible')));
    setTimeout(() => { el.classList.remove('visible'); setTimeout(() => el.remove(), 350); }, ms);
  }
  return {
    show,
    success: (m, ms) => show(m, 'success', ms),
    error:   (m, ms) => show(m, 'error',   ms),
    warning: (m, ms) => show(m, 'warning', ms),
    info:    (m, ms) => show(m, 'info',    ms),
  };
})();

// ============================================================
// LOADING
// ============================================================
const Loading = {
  show() { document.getElementById('loading-overlay')?.classList.add('active'); },
  hide() { document.getElementById('loading-overlay')?.classList.remove('active'); },
};

// ============================================================
// MODAL
// ============================================================
const Modal = (() => {
  function open(html, opts = {}) {
    const c = document.getElementById('modal-container');
    c.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal ${opts.size ? 'modal-'+opts.size : ''}">
          ${html}
        </div>
      </div>`;
    document.getElementById('modal-backdrop')
      .addEventListener('click', e => { if (e.target.id === 'modal-backdrop' && !opts.persistent) close(); });
  }
  function close() {
    const c = document.getElementById('modal-container');
    if (c) c.innerHTML = '';
  }
  function html(title, body, footer = '') {
    return `
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button class="modal-close" onclick="Modal.close()" aria-label="Cerrar">✕</button>
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-footer">${footer}</div>` : ''}`;
  }
  return { open, close, html };
})();
window.Modal = Modal;

// ============================================================
// UTILITIES
// ============================================================
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function formatDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('es-MX', { year:'numeric', month:'short', day:'numeric' });
}

function formatDateTime(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleString('es-MX', { year:'numeric', month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}

function initials(firstName, lastName) {
  return ((firstName?.[0]||'') + (lastName?.[0]||'')).toUpperCase() || '?';
}

function severityBadge(s) {
  const map = { mild:'badge-green', moderate:'badge-yellow', severe:'badge-red' };
  const labels = { mild:'Leve', moderate:'Moderada', severe:'Grave' };
  return `<span class="badge ${map[s]||'badge-gray'}">${labels[s]||s||'—'}</span>`;
}

function statusBadge(s) {
  const map = { active:'badge-blue', resolved:'badge-green', managed:'badge-yellow', pending:'badge-yellow', completed:'badge-green', cancelled:'badge-gray' };
  const labels = { active:'Activo', resolved:'Resuelto', managed:'Controlado', pending:'Pendiente', completed:'Completado', cancelled:'Cancelado' };
  return `<span class="badge ${map[s]||'badge-gray'}">${labels[s]||s||'—'}</span>`;
}

function bloodTypeBadge(bt) {
  if (!bt) return '<span class="text-muted">—</span>';
  return `<span class="badge badge-red">${escHtml(bt)}</span>`;
}

// ============================================================
// ROUTER
// ============================================================
const Router = (() => {
  const routes = {};

  function navigate(path) {
    window.location.hash = path;
  }

  function current() {
    return window.location.hash.slice(1) || '/';
  }

  function on(path, fn) { routes[path] = fn; }

  function resolve() {
    const path = current();
    const publicPaths = ['/', '/login', '/register', '/forgot-password', '/reset-password'];

    if (!State.isLoggedIn() && !publicPaths.includes(path)) {
      return navigate('/login');
    }
    if (State.isLoggedIn() && publicPaths.includes(path)) {
      const u = State.getUser();
      return navigate(u?.role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard');
    }

    // Exact match first
    if (routes[path]) return routes[path]();

    // Prefix match for dynamic segments
    for (const [pattern, fn] of Object.entries(routes)) {
      if (pattern.includes(':')) {
        const regex = new RegExp('^' + pattern.replace(/:[^/]+/g, '([^/]+)') + '$');
        const m = path.match(regex);
        if (m) return fn(...m.slice(1));
      }
    }

    // 404
    render404();
  }

  window.addEventListener('hashchange', resolve);

  return { on, navigate, resolve, current };
})();

// ============================================================
// RENDER HELPERS
// ============================================================
function setContent(html) {
  document.getElementById('app').innerHTML = html;
}

function renderShell(activePath, role, user, contentHtml) {
  const patientNav = `
    <div class="nav-section">
      <div class="nav-label">Mi Salud</div>
      <div class="nav-item ${activePath==='/patient/dashboard'?'active':''}" onclick="Router.navigate('/patient/dashboard')">
        ${iconGrid()} <span>Inicio</span>
      </div>
      <div class="nav-item ${activePath==='/patient/record'?'active':''}" onclick="Router.navigate('/patient/record')">
        ${iconFile()} <span>Mi Expediente</span>
      </div>
    </div>
    <div class="nav-section">
      <div class="nav-label">Cuenta</div>
      <div class="nav-item ${activePath==='/patient/profile'?'active':''}" onclick="Router.navigate('/patient/profile')">
        ${iconUser()} <span>Perfil</span>
      </div>
      <div class="nav-item" onclick="logout()">
        ${iconLogout()} <span>Cerrar sesión</span>
      </div>
    </div>`;

  const doctorNav = `
    <div class="nav-section">
      <div class="nav-label">Panel</div>
      <div class="nav-item ${activePath==='/doctor/dashboard'?'active':''}" onclick="Router.navigate('/doctor/dashboard')">
        ${iconGrid()} <span>Inicio</span>
      </div>
      <div class="nav-item ${activePath==='/doctor/patients'?'active':''}" onclick="Router.navigate('/doctor/patients')">
        ${iconUsers()} <span>Pacientes</span>
      </div>
    </div>
    <div class="nav-section">
      <div class="nav-label">Cuenta</div>
      <div class="nav-item ${activePath==='/doctor/profile'?'active':''}" onclick="Router.navigate('/doctor/profile')">
        ${iconUser()} <span>Perfil</span>
      </div>
      <div class="nav-item" onclick="logout()">
        ${iconLogout()} <span>Cerrar sesión</span>
      </div>
    </div>`;

  return `
    <div class="app-layout">
      <header class="app-header">
        <a class="app-header__brand" href="#${role==='doctor'?'/doctor/dashboard':'/patient/dashboard'}">
          <div class="brand-logo"><div class="brand-logo__ring"></div><div class="brand-logo__circle"></div></div>
          <span class="brand-wordmark">MediLink</span>
        </a>
        <div class="app-header__spacer"></div>
        <div class="app-header__user">
          <div class="header-avatar">${initials(user?.first_name, user?.last_name)}</div>
          <div class="header-user-info">
            <div class="header-user-name">${escHtml((user?.first_name||'')+' '+(user?.last_name||''))}</div>
            <div class="header-user-role">${role==='doctor'?'Médico':'Paciente'}</div>
          </div>
        </div>
      </header>
      <aside class="app-sidebar" id="app-sidebar">
        ${role === 'doctor' ? doctorNav : patientNav}
      </aside>
      <main class="app-main" id="main-content">
        ${contentHtml}
      </main>
    </div>`;
}

// ============================================================
// ICONS (inline SVG)
// ============================================================
const svgI = (p) => `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${p}</svg>`;
const iconGrid    = () => svgI('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>');
const iconFile    = () => svgI('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>');
const iconUsers   = () => svgI('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>');
const iconUser    = () => svgI('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
const iconLogout  = () => svgI('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>');
const iconPlus    = () => svgI('<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>');
const iconSearch  = () => svgI('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>');
const iconTrash   = () => svgI('<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>');
const iconEdit    = () => svgI('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>');
const iconChevron = (d='down') => svgI(`<polyline points="${d==='down'?'6 9 12 15 18 9':'6 15 12 9 18 15'}"/>`);

// ============================================================
// PAGES — LANDING
// ============================================================
function renderLanding() {
  setContent(`
    <div class="landing-page">
      <nav class="landing-nav">
        <a class="landing-nav__brand" href="#">
          <div class="brand-logo"><div class="brand-logo__ring"></div><div class="brand-logo__circle"></div></div>
          <span class="brand-wordmark">MediLink</span>
        </a>
        <div class="landing-nav__spacer"></div>
        <div class="landing-nav__links">
          <span class="landing-nav__link" onclick="Router.navigate('/login')">Iniciar sesión</span>
          <button class="btn btn-primary btn-sm" onclick="Router.navigate('/register')">Registrarse</button>
        </div>
      </nav>

      <section class="hero">
        <div class="hero__eyebrow">🏥 Plataforma Médica Digital</div>
        <h1>Tu salud, digitalizada y segura</h1>
        <p>MediLink conecta pacientes y médicos en una plataforma unificada con expedientes clínicos electrónicos, consultas, recetas y más.</p>
        <div class="hero__cta">
          <button class="btn btn-primary btn-lg" onclick="Router.navigate('/register')">Crear cuenta gratuita</button>
          <button class="btn btn-secondary btn-lg" onclick="Router.navigate('/login')">Iniciar sesión</button>
        </div>
        <div class="hero-visual">
          <div class="hero-visual__bar">
            <div class="hero-dot hero-dot-r"></div>
            <div class="hero-dot hero-dot-y"></div>
            <div class="hero-dot hero-dot-g"></div>
          </div>
          <div class="hero-visual__content">
            <div class="hero-visual__sidebar">
              <div class="hero-visual__sidebar-item active"></div>
              <div class="hero-visual__sidebar-item"></div>
              <div class="hero-visual__sidebar-item"></div>
              <div class="hero-visual__sidebar-item"></div>
            </div>
            <div class="hero-visual__main">
              <div class="hero-visual__stat"><div class="hero-visual__stat-n"></div><div class="hero-visual__stat-l"></div></div>
              <div class="hero-visual__stat"><div class="hero-visual__stat-n"></div><div class="hero-visual__stat-l"></div></div>
              <div class="hero-visual__stat"><div class="hero-visual__stat-n"></div><div class="hero-visual__stat-l"></div></div>
              <div class="hero-visual__stat"><div class="hero-visual__stat-n"></div><div class="hero-visual__stat-l"></div></div>
            </div>
          </div>
        </div>
      </section>

      <section class="features">
        <div class="features__header">
          <div class="features__eyebrow">Funcionalidades</div>
          <h2>Todo lo que necesitas en un solo lugar</h2>
        </div>
        <div class="features__grid">
          <div class="feature-card">
            <div class="feature-card__icon">📋</div>
            <h4>Expediente Clínico Digital</h4>
            <p>Cada paciente tiene un expediente único creado automáticamente con historial completo, accesible en todo momento.</p>
          </div>
          <div class="feature-card">
            <div class="feature-card__icon">💊</div>
            <h4>Recetas y Medicamentos</h4>
            <p>Genera recetas digitales durante la consulta y lleva control de los medicamentos activos del paciente.</p>
          </div>
          <div class="feature-card">
            <div class="feature-card__icon">🔬</div>
            <h4>Estudios y Análisis</h4>
            <p>Solicita y registra resultados de estudios de laboratorio e imagen directamente en el expediente.</p>
          </div>
          <div class="feature-card">
            <div class="feature-card__icon">⚠️</div>
            <h4>Alergias y Condiciones</h4>
            <p>Registra alergias con severidad y enfermedades crónicas para que estén siempre visibles al momento de atender.</p>
          </div>
          <div class="feature-card">
            <div class="feature-card__icon">🔒</div>
            <h4>Seguridad y Privacidad</h4>
            <p>Autenticación segura con JWT, contraseñas cifradas y control de acceso por roles para proteger los datos.</p>
          </div>
          <div class="feature-card">
            <div class="feature-card__icon">📱</div>
            <h4>Diseño Responsivo</h4>
            <p>Accede desde cualquier dispositivo — computadora, tablet o celular — con una interfaz optimizada.</p>
          </div>
        </div>
      </section>

      <!-- ── El Problema ─────────────────────────────────── -->
      <section class="problem-section">
        <div class="problem-inner">
          <div class="problem-text">
            <div class="features__eyebrow">El Problema</div>
            <h2>La atención médica fragmentada tiene un costo real</h2>
            <p>
              Durante <strong>6 meses de consulta e investigación</strong> con médicos generales, especialistas y pacientes crónicos,
              identificamos un patrón alarmante: la información clínica vive dispersa entre papeles, fotos de WhatsApp,
              libretas y sistemas incompatibles.
            </p>
            <p style="margin-top:.875rem">
              Cada vez que un paciente cambia de médico o visita urgencias, el nuevo profesional de salud
              atiende <em>sin contexto</em>: sin saber las alergias, los medicamentos actuales ni el historial de diagnósticos.
              Esto genera errores, duplicación de estudios costosos y decisiones clínicas incompletas.
            </p>
            <ul class="problem-list">
              <li>📄 Expedientes físicos que se pierden o deterioran</li>
              <li>💬 Historial compartido por foto o de memoria</li>
              <li>🔁 Estudios repetidos por falta de acceso a resultados previos</li>
              <li>⚠️ Alergias desconocidas al momento de prescribir</li>
            </ul>
          </div>
          <div class="problem-quote">
            <blockquote>
              "En 6 meses de consultas observamos que más del 70% de los pacientes no tienen acceso
               inmediato a su historial médico cuando más lo necesitan."
            </blockquote>
            <div class="problem-quote__author">— Observación clínica, base del proyecto MediLink</div>
            <div class="problem-stats">
              <div class="problem-stat">
                <div class="problem-stat__n">6 meses</div>
                <div class="problem-stat__l">de investigación de campo</div>
              </div>
              <div class="problem-stat">
                <div class="problem-stat__n">+40</div>
                <div class="problem-stat__l">entrevistas con pacientes y médicos</div>
              </div>
              <div class="problem-stat">
                <div class="problem-stat__n">1 solución</div>
                <div class="problem-stat__l">expediente clínico digital unificado</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ── Objetivo del Proyecto ──────────────────────── -->
      <section class="objetivo-section">
        <div class="objetivo-inner">
          <div class="features__eyebrow" style="text-align:center">Objetivo del Proyecto</div>
          <h2 style="text-align:center;margin-bottom:1rem">¿Para qué existe MediLink?</h2>
          <p style="text-align:center;max-width:640px;margin:0 auto 3rem;color:var(--color-text-3);font-size:1.0625rem;line-height:1.7">
            MediLink nació para eliminar la barrera entre el paciente y su propia información médica,
            y entre el médico y el contexto completo de quien atiende. Es un expediente clínico electrónico
            accesible, seguro y pensado para la realidad de la práctica médica en México.
          </p>
          <div class="objetivo-grid">
            <div class="objetivo-card objetivo-card--patient">
              <div class="objetivo-card__icon">🧑‍⚕️</div>
              <h4>Para el Paciente</h4>
              <p>Accede a toda tu historia clínica desde cualquier dispositivo. Comparte tu expediente con cualquier médico al instante. Nunca más digas "no recuerdo qué medicamento tomaba".</p>
            </div>
            <div class="objetivo-card objetivo-card--doctor">
              <div class="objetivo-card__icon">👨‍⚕️</div>
              <h4>Para el Médico</h4>
              <p>Atiende con el contexto completo del paciente. Registra consultas, recetas y estudios en segundos. Reduce errores por información incompleta o desactualizada.</p>
            </div>
            <div class="objetivo-card objetivo-card--system">
              <div class="objetivo-card__icon">🏥</div>
              <h4>Para el Sistema de Salud</h4>
              <p>Menos estudios duplicados, menos errores por alergias desconocidas, mejor continuidad de la atención entre diferentes proveedores de salud.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="cta-section">
        <h2>¿Listo para empezar?</h2>
        <p>Únete a MediLink hoy y moderniza la gestión de salud para ti y tus pacientes.</p>
        <div class="hero__cta">
          <button class="btn btn-lg" style="background:white;color:var(--color-primary-dark);font-weight:700;" onclick="Router.navigate('/register')">Registrar como Paciente</button>
          <button class="btn btn-lg" style="background:rgba(255,255,255,0.15);color:white;border:1.5px solid rgba(255,255,255,0.5);" onclick="Router.navigate('/register')">Registrar como Médico</button>
        </div>
      </section>

      <footer class="landing-footer">
        <p>© ${new Date().getFullYear()} MediLink. Todos los derechos reservados.</p>
      </footer>
    </div>`);
}

// ============================================================
// PAGES — AUTH
// ============================================================
function renderLogin() {
  setContent(`
    <div class="auth-page">
      <nav class="auth-page__nav">
        <a class="app-header__brand" href="#/" style="text-decoration:none;display:flex;align-items:center;gap:.75rem;">
          <div class="brand-logo"><div class="brand-logo__ring"></div><div class="brand-logo__circle"></div></div>
          <span class="brand-wordmark">MediLink</span>
        </a>
            <p class="auth-card__sub">Ingresa tus credenciales para continuar</p>
          </div>
          <div class="auth-card__body">
            <div id="login-alert"></div>
            <form id="login-form" novalidate>
              <div class="form-group">
                <label class="label label-required" for="login-email">Correo electrónico</label>
                <input class="input" type="email" id="login-email" placeholder="correo@ejemplo.com" required autocomplete="email">
              </div>
              <div class="form-group">
                <label class="label label-required" for="login-password">Contraseña</label>
                <input class="input" type="password" id="login-password" placeholder="••••••••" required autocomplete="current-password">
                <div style="text-align:right;margin-top:.375rem">
                  <a href="#/forgot-password" style="font-size:.8125rem;color:var(--color-primary);font-weight:500;">¿Olvidaste tu contraseña?</a>
                </div>
              </div>
              <button type="submit" class="btn btn-primary btn-full btn-lg" id="login-btn">Iniciar sesión</button>
            </form>
            <div class="auth-footer">¿No tienes cuenta? <a onclick="Router.navigate('/register')">Regístrate gratis</a></div>
          </div>
        </div>
      </div>
    </div>`);

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const alertEl = document.getElementById('login-alert');
    alertEl.innerHTML = '';

    if (!email || !password) {
      alertEl.innerHTML = `<div class="alert alert-error">Por favor ingresa tu correo y contraseña.</div>`;
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="inline-spinner"></span> Iniciando sesión…`;

    try {
      const data = await API.postPublic('/auth/login', { email, password });
      State.setAuth(data.token, { first_name: data.firstName, last_name: data.lastName, role: data.role });
      Toast.success(`Bienvenido, ${data.firstName}`);
      Router.navigate(data.role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard');
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
      btn.disabled = false;
      btn.innerHTML = 'Iniciar sesión';
    }
  });
}

function renderRegister() {
  setContent(`
    <div class="auth-page">
      <nav class="auth-page__nav">
        <a class="app-header__brand" href="#/" style="text-decoration:none;display:flex;align-items:center;gap:.75rem;">
          <div class="brand-logo"><div class="brand-logo__ring"></div><div class="brand-logo__circle"></div></div>
          <span class="brand-wordmark">MediLink</span>
        </a>
      </nav>
      <div class="auth-page__body">
        <div class="auth-card" style="max-width:520px">
          <div class="auth-card__header">
            <h1 class="auth-card__title">Crear cuenta</h1>
            <p class="auth-card__sub">Completa tus datos para registrarte</p>
          </div>
          <div class="auth-card__body">
            <div id="reg-alert"></div>

            <div class="form-group">
              <label class="label label-required">Tipo de cuenta</label>
              <div class="role-selector">
                <label class="role-option selected" id="role-patient">
                  <input type="radio" name="role" value="patient" checked>
                  <div class="role-option__icon">👤</div>
                  <div class="role-option__label">Paciente</div>
                  <div class="role-option__sub">Accede a tu expediente</div>
                </label>
                <label class="role-option" id="role-doctor">
                  <input type="radio" name="role" value="doctor">
                  <div class="role-option__icon">🩺</div>
                  <div class="role-option__label">Médico</div>
                  <div class="role-option__sub">Administra pacientes</div>
                </label>
              </div>
            </div>

            <form id="reg-form" novalidate>
              <div class="form-row">
                <div class="form-group">
                  <label class="label label-required" for="reg-fname">Nombre</label>
                  <input class="input" type="text" id="reg-fname" placeholder="Juan" required autocomplete="given-name">
                </div>
                <div class="form-group">
                  <label class="label label-required" for="reg-lname">Apellido</label>
                  <input class="input" type="text" id="reg-lname" placeholder="García" required autocomplete="family-name">
                </div>
              </div>
              <div class="form-group">
                <label class="label label-required" for="reg-email">Correo electrónico</label>
                <input class="input" type="email" id="reg-email" placeholder="correo@ejemplo.com" required autocomplete="email">
              </div>
              <div class="form-group">
                <label class="label label-required" for="reg-password">Contraseña</label>
                <input class="input" type="password" id="reg-password" placeholder="Mínimo 8 caracteres" required autocomplete="new-password">
                <span class="field-hint">Al menos 8 caracteres</span>
              </div>

              <!-- Patient fields -->
              <div id="patient-fields">
                <div class="form-row">
                  <div class="form-group">
                    <label class="label" for="reg-dob">Fecha de nacimiento</label>
                    <input class="input" type="date" id="reg-dob" autocomplete="bday">
                  </div>
                  <div class="form-group">
                    <label class="label" for="reg-blood">Tipo de sangre</label>
                    <select class="select" id="reg-blood">
                      <option value="">Seleccionar…</option>
                      <option>A+</option><option>A-</option><option>B+</option><option>B-</option>
                      <option>AB+</option><option>AB-</option><option>O+</option><option>O-</option>
                    </select>
                  </div>
                </div>
                <div class="form-group">
                  <label class="label" for="reg-phone-p">Teléfono</label>
                  <input class="input" type="tel" id="reg-phone-p" placeholder="55 1234 5678" autocomplete="tel">
                </div>
              </div>

              <!-- Doctor fields (hidden by default) -->
              <div id="doctor-fields" style="display:none">
                <div class="form-group">
                  <label class="label label-required" for="reg-specialty">Especialidad</label>
                  <select class="select" id="reg-specialty">
                    <option value="">Seleccionar especialidad…</option>
                    <option>Medicina General</option><option>Pediatría</option><option>Cardiología</option>
                    <option>Dermatología</option><option>Ginecología</option><option>Neurología</option>
                    <option>Oftalmología</option><option>Ortopedia</option><option>Psiquiatría</option>
                    <option>Radiología</option><option>Oncología</option><option>Endocrinología</option>
                    <option>Gastroenterología</option><option>Nefrología</option><option>Neumología</option>
                    <option>Reumatología</option><option>Urología</option><option>Otra</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="label label-required" for="reg-license">Cédula profesional</label>
                  <input class="input" type="text" id="reg-license" placeholder="12345678">
                </div>
                <div class="form-row">
                  <div class="form-group">
                    <label class="label" for="reg-phone-d">Teléfono</label>
                    <input class="input" type="tel" id="reg-phone-d" placeholder="55 1234 5678">
                  </div>
                  <div class="form-group">
                    <label class="label" for="reg-hospital">Hospital / Clínica</label>
                    <input class="input" type="text" id="reg-hospital" placeholder="Hospital General">
                  </div>
                </div>
              </div>

              <button type="submit" class="btn btn-primary btn-full btn-lg" id="reg-btn" style="margin-top:.5rem">Crear cuenta</button>
            </form>
            <div class="auth-footer">¿Ya tienes cuenta? <a onclick="Router.navigate('/login')">Inicia sesión</a></div>
          </div>
        </div>
      </div>
    </div>`);

  // Role toggle
  document.querySelectorAll('input[name="role"]').forEach(radio => {
    radio.closest('.role-option').addEventListener('click', () => {
      document.querySelectorAll('.role-option').forEach(o => o.classList.remove('selected'));
      radio.closest('.role-option').classList.add('selected');
      radio.checked = true;
      const isDoctor = radio.value === 'doctor';
      document.getElementById('patient-fields').style.display = isDoctor ? 'none' : '';
      document.getElementById('doctor-fields').style.display  = isDoctor ? '' : 'none';
    });
  });

  document.getElementById('reg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertEl = document.getElementById('reg-alert');
    alertEl.innerHTML = '';
    const role = document.querySelector('input[name="role"]:checked')?.value || 'patient';
    const btn  = document.getElementById('reg-btn');

    const body = {
      role,
      firstName: document.getElementById('reg-fname').value.trim(),
      lastName:  document.getElementById('reg-lname').value.trim(),
      email:     document.getElementById('reg-email').value.trim(),
      password:  document.getElementById('reg-password').value,
    };

    if (role === 'patient') {
      body.dateOfBirth = document.getElementById('reg-dob').value || null;
      body.bloodType   = document.getElementById('reg-blood').value || null;
      body.phone       = document.getElementById('reg-phone-p').value || null;
    } else {
      body.specialty     = document.getElementById('reg-specialty').value;
      body.licenseNumber = document.getElementById('reg-license').value.trim();
      body.phone         = document.getElementById('reg-phone-d').value || null;
      body.hospital      = document.getElementById('reg-hospital').value || null;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="inline-spinner"></span> Creando cuenta…`;

    try {
      const data = await API.postPublic('/auth/register', body);
      State.setAuth(data.token, { first_name: data.firstName, last_name: data.lastName, role: data.role });
      Toast.success('¡Cuenta creada exitosamente!');
      Router.navigate(data.role === 'doctor' ? '/doctor/dashboard' : '/patient/dashboard');
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
      btn.disabled = false;
      btn.innerHTML = 'Crear cuenta';
    }
  });
}

function renderForgotPassword() {
  setContent(`
    <div class="auth-page">
      <nav class="auth-page__nav">
        <a class="app-header__brand" href="#/" style="text-decoration:none;display:flex;align-items:center;gap:.75rem;">
          <div class="brand-logo"><div class="brand-logo__ring"></div><div class="brand-logo__circle"></div></div>
          <span class="brand-wordmark">MediLink</span>
        </a>
      </nav>
      <div class="auth-page__body">
        <div class="auth-card">
          <div class="auth-card__header">
            <h1 class="auth-card__title">Recuperar contraseña</h1>
            <p class="auth-card__sub">Ingresa tu correo y te enviaremos instrucciones</p>
          </div>
          <div class="auth-card__body">
            <div id="fp-alert"></div>
            <form id="fp-form" novalidate>
              <div class="form-group">
                <label class="label label-required" for="fp-email">Correo electrónico</label>
                <input class="input" type="email" id="fp-email" placeholder="correo@ejemplo.com" required>
              </div>
              <button type="submit" class="btn btn-primary btn-full" id="fp-btn">Enviar instrucciones</button>
            </form>
            <div class="auth-footer"><a onclick="Router.navigate('/login')">← Volver al inicio de sesión</a></div>
          </div>
        </div>
      </div>
    </div>`);

  document.getElementById('fp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email   = document.getElementById('fp-email').value.trim();
    const alertEl = document.getElementById('fp-alert');
    const btn     = document.getElementById('fp-btn');
    alertEl.innerHTML = '';

    if (!email) { alertEl.innerHTML = `<div class="alert alert-error">Ingresa tu correo.</div>`; return; }

    btn.disabled = true;
    btn.innerHTML = `<span class="inline-spinner"></span> Enviando…`;

    try {
      const data = await API.postPublic('/auth/forgot-password', { email });
      alertEl.innerHTML = `<div class="alert alert-success">${escHtml(data.message)}</div>`;
      if (data._devResetToken) {
        alertEl.innerHTML += `<div class="alert alert-warning" style="margin-top:.5rem"><strong>Modo desarrollo:</strong> Token de recuperación:<br><code class="font-mono" style="font-size:.75rem;word-break:break-all">${escHtml(data._devResetToken)}</code><br><a href="#/reset-password" onclick="document.getElementById('reset-token-prefill').value='${escHtml(data._devResetToken)}'" style="margin-top:.5rem;display:inline-block">→ Ir a restablecer contraseña</a></div>`;
      }
      btn.textContent = 'Enviado';
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = 'Enviar instrucciones';
    }
  });
}

function renderResetPassword() {
  setContent(`
    <div class="auth-page">
      <nav class="auth-page__nav">
        <a class="app-header__brand" href="#/" style="text-decoration:none;display:flex;align-items:center;gap:.75rem;">
          <div class="brand-logo"><div class="brand-logo__ring"></div><div class="brand-logo__circle"></div></div>
          <span class="brand-wordmark">MediLink</span>
        </a>
      </nav>
      <div class="auth-page__body">
        <div class="auth-card">
          <div class="auth-card__header">
            <h1 class="auth-card__title">Nueva contraseña</h1>
            <p class="auth-card__sub">Ingresa el token recibido y tu nueva contraseña</p>
          </div>
          <div class="auth-card__body">
            <div id="rp-alert"></div>
            <form id="rp-form" novalidate>
              <div class="form-group">
                <label class="label label-required" for="reset-token-prefill">Token de recuperación</label>
                <input class="input font-mono" type="text" id="reset-token-prefill" placeholder="Token recibido por correo" required style="font-size:.8125rem">
              </div>
              <div class="form-group">
                <label class="label label-required" for="rp-password">Nueva contraseña</label>
                <input class="input" type="password" id="rp-password" placeholder="Mínimo 8 caracteres" required>
              </div>
              <button type="submit" class="btn btn-primary btn-full" id="rp-btn">Restablecer contraseña</button>
            </form>
            <div class="auth-footer"><a onclick="Router.navigate('/login')">← Volver al inicio de sesión</a></div>
          </div>
        </div>
      </div>
    </div>`);

  document.getElementById('rp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const token    = document.getElementById('reset-token-prefill').value.trim();
    const password = document.getElementById('rp-password').value;
    const alertEl  = document.getElementById('rp-alert');
    const btn      = document.getElementById('rp-btn');
    alertEl.innerHTML = '';

    if (!token || !password) { alertEl.innerHTML = `<div class="alert alert-error">Completa todos los campos.</div>`; return; }

    btn.disabled = true;
    btn.innerHTML = `<span class="inline-spinner"></span> Restableciendo…`;

    try {
      const data = await API.postPublic('/auth/reset-password', { token, password });
      alertEl.innerHTML = `<div class="alert alert-success">${escHtml(data.message)}</div>`;
      btn.textContent = 'Listo';
      setTimeout(() => Router.navigate('/login'), 2000);
    } catch (err) {
      alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
      btn.disabled = false;
      btn.textContent = 'Restablecer contraseña';
    }
  });
}

// ============================================================
// PAGES — PATIENT
// ============================================================
async function renderPatientDashboard() {
  Loading.show();
  try {
    const [me, stats] = await Promise.all([API.get('/auth/me'), API.get('/dashboard/patient')]);
    State.setUser(me);

    const lastC = stats.lastConsultation;

    setContent(renderShell('/patient/dashboard', 'patient', me, `
      <div class="page-header">
        <h2 class="page-title">Bienvenido, ${escHtml(me.first_name)}</h2>
        <p class="page-subtitle">Tu resumen de salud actualizado</p>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card__icon">📋</div>
          <div class="stat-card__label">Expediente</div>
          <div class="stat-card__value" style="font-size:1rem;font-family:var(--font-mono)">${escHtml(stats.recordNumber)}</div>
          <div class="stat-card__sub">Número de expediente</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon">🩺</div>
          <div class="stat-card__label">Consultas</div>
          <div class="stat-card__value">${stats.totalConsultations}</div>
          <div class="stat-card__sub">Total registradas</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon">💊</div>
          <div class="stat-card__label">Medicamentos</div>
          <div class="stat-card__value">${stats.activeMedications}</div>
          <div class="stat-card__sub">Activos actualmente</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon">⚠️</div>
          <div class="stat-card__label">Alergias</div>
          <div class="stat-card__value">${stats.allergyCount}</div>
          <div class="stat-card__sub">Registradas</div>
        </div>
        ${stats.pendingStudies > 0 ? `
        <div class="stat-card" style="border-color:var(--color-warning);background:var(--color-warning-bg)">
          <div class="stat-card__icon">🔬</div>
          <div class="stat-card__label">Estudios pendientes</div>
          <div class="stat-card__value">${stats.pendingStudies}</div>
          <div class="stat-card__sub">Por completar</div>
        </div>` : ''}
      </div>

      ${lastC ? `
      <div class="card" style="margin-bottom:1.5rem">
        <div class="card-header">
          <span class="card-title">Última consulta</span>
          <button class="btn btn-secondary btn-sm" onclick="Router.navigate('/patient/record')">Ver expediente completo</button>
        </div>
        <div class="card-body">
          <div style="display:flex;gap:1.5rem;flex-wrap:wrap">
            <div><div class="text-xs text-muted" style="margin-bottom:.25rem">FECHA</div><div class="text-sm font-semibold">${formatDateTime(lastC.date)}</div></div>
            <div><div class="text-xs text-muted" style="margin-bottom:.25rem">MÉDICO</div><div class="text-sm font-semibold">Dr. ${escHtml(lastC.doctor_first_name)} ${escHtml(lastC.doctor_last_name)}</div><div class="text-xs text-muted">${escHtml(lastC.specialty)}</div></div>
            <div><div class="text-xs text-muted" style="margin-bottom:.25rem">MOTIVO</div><div class="text-sm">${escHtml(lastC.reason)}</div></div>
            ${lastC.diagnosis ? `<div><div class="text-xs text-muted" style="margin-bottom:.25rem">DIAGNÓSTICO</div><div class="text-sm">${escHtml(lastC.diagnosis)}</div></div>` : ''}
          </div>
        </div>
      </div>` : `
      <div class="card" style="margin-bottom:1.5rem">
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state__icon">🩺</div>
            <div class="empty-state__title">Sin consultas aún</div>
            <div class="empty-state__text">Cuando un médico registre una consulta, aparecerá aquí.</div>
          </div>
        </div>
      </div>`}

      <div style="display:flex;gap:.75rem;flex-wrap:wrap">
        <button class="btn btn-primary" onclick="Router.navigate('/patient/record')">Ver mi expediente completo</button>
        <button class="btn btn-secondary" onclick="Router.navigate('/patient/profile')">Editar perfil</button>
      </div>`));
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
    Toast.error('Error al cargar el panel: ' + err.message);
  } finally {
    Loading.hide();
  }
}

async function renderPatientRecord() {
  Loading.show();
  try {
    const [me, data] = await Promise.all([API.get('/auth/me'), API.get('/my-record')]);
    State.setUser(me);
    const { record, consultations, studies, allergies, conditions, medications } = data;

    setContent(renderShell('/patient/record', 'patient', me, `
      <div class="page-header flex justify-between items-center">
        <div>
          <h2 class="page-title">Mi Expediente Clínico</h2>
          <p class="page-subtitle">Historial médico completo</p>
        </div>
      </div>

      <div class="record-header">
        <div class="record-avatar">${initials(record.first_name, record.last_name)}</div>
        <div class="record-info">
          <div class="record-name">${escHtml(record.first_name)} ${escHtml(record.last_name)}</div>
          <div class="record-meta">
            ${record.date_of_birth ? `Nacimiento: ${formatDate(record.date_of_birth)}` : ''}
            ${record.blood_type ? ` · ${bloodTypeBadge(record.blood_type)}` : ''}
            ${record.phone ? ` · ${escHtml(record.phone)}` : ''}
          </div>
          <div class="record-number">Expediente: ${escHtml(record.record_number)}</div>
        </div>
        ${(record.emergency_contact_name) ? `
        <div style="border-left:1px solid var(--color-border);padding-left:1.25rem;flex-shrink:0">
          <div class="text-xs text-muted" style="margin-bottom:.25rem">CONTACTO DE EMERGENCIA</div>
          <div class="text-sm font-semibold">${escHtml(record.emergency_contact_name)}</div>
          <div class="text-xs text-muted">${escHtml(record.emergency_contact_phone||'')}</div>
        </div>` : ''}
      </div>

      <div class="tabs" id="record-tabs">
        <div class="tab active" data-tab="consultations">Consultas (${consultations.length})</div>
        <div class="tab" data-tab="medications">Medicamentos (${medications.length})</div>
        <div class="tab" data-tab="studies">Estudios (${studies.length})</div>
        <div class="tab" data-tab="allergies">Alergias (${allergies.length})</div>
        <div class="tab" data-tab="conditions">Condiciones (${conditions.length})</div>
      </div>

      <div class="tab-content active" id="tab-consultations">
        ${renderConsultationsList(consultations)}
      </div>
      <div class="tab-content" id="tab-medications">
        ${renderMedicationsView(medications)}
      </div>
      <div class="tab-content" id="tab-studies">
        ${renderStudiesView(studies)}
      </div>
      <div class="tab-content" id="tab-allergies">
        ${renderAllergiesView(allergies, null, true)}
      </div>
      <div class="tab-content" id="tab-conditions">
        ${renderConditionsView(conditions, null, true)}
      </div>`));

    initTabs();
    initConsultationToggles();
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
    Toast.error('Error al cargar el expediente: ' + err.message);
  } finally {
    Loading.hide();
  }
}

async function renderPatientProfile() {
  Loading.show();
  try {
    const me = await API.get('/auth/me');
    State.setUser(me);
    const p = me.profile || {};

    setContent(renderShell('/patient/profile', 'patient', me, `
      <div class="page-header">
        <h2 class="page-title">Mi Perfil</h2>
        <p class="page-subtitle">Información personal y de contacto</p>
      </div>
      <div class="profile-section">
        <div class="profile-header-card">
          <div class="profile-avatar-lg">${initials(me.first_name, me.last_name)}</div>
          <div>
            <div class="profile-name">${escHtml(me.first_name)} ${escHtml(me.last_name)}</div>
            <div class="profile-email">${escHtml(me.email)}</div>
            <div class="text-xs text-muted" style="margin-top:.25rem">Miembro desde ${formatDate(me.created_at)}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Datos personales</span></div>
          <div class="card-body">
            <div id="profile-alert"></div>
            <form id="profile-form" novalidate>
              <div class="form-row">
                <div class="form-group">
                  <label class="label label-required" for="pf-fname">Nombre</label>
                  <input class="input" type="text" id="pf-fname" value="${escHtml(me.first_name)}" required>
                </div>
                <div class="form-group">
                  <label class="label label-required" for="pf-lname">Apellido</label>
                  <input class="input" type="text" id="pf-lname" value="${escHtml(me.last_name)}" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="label" for="pf-dob">Fecha de nacimiento</label>
                  <input class="input" type="date" id="pf-dob" value="${escHtml(p.date_of_birth||'')}">
                </div>
                <div class="form-group">
                  <label class="label" for="pf-phone">Teléfono</label>
                  <input class="input" type="tel" id="pf-phone" value="${escHtml(p.phone||'')}">
                </div>
              </div>
              <div class="form-group">
                <label class="label" for="pf-address">Dirección</label>
                <input class="input" type="text" id="pf-address" value="${escHtml(p.address||'')}">
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="label" for="pf-ec-name">Contacto de emergencia</label>
                  <input class="input" type="text" id="pf-ec-name" value="${escHtml(p.emergency_contact_name||'')}" placeholder="Nombre">
                </div>
                <div class="form-group">
                  <label class="label" for="pf-ec-phone">Teléfono de emergencia</label>
                  <input class="input" type="tel" id="pf-ec-phone" value="${escHtml(p.emergency_contact_phone||'')}">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="label" for="pf-ins-p">Aseguradora</label>
                  <input class="input" type="text" id="pf-ins-p" value="${escHtml(p.insurance_provider||'')}">
                </div>
                <div class="form-group">
                  <label class="label" for="pf-ins-n">Número de póliza</label>
                  <input class="input" type="text" id="pf-ins-n" value="${escHtml(p.insurance_number||'')}">
                </div>
              </div>
              <button type="submit" class="btn btn-primary" id="pf-btn">Guardar cambios</button>
            </form>
          </div>
        </div>
      </div>`));

    document.getElementById('profile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('profile-alert');
      const btn     = document.getElementById('pf-btn');
      alertEl.innerHTML = '';
      btn.disabled = true;
      btn.innerHTML = `<span class="inline-spinner"></span> Guardando…`;

      try {
        await API.put('/auth/profile', {
          firstName:              document.getElementById('pf-fname').value.trim(),
          lastName:               document.getElementById('pf-lname').value.trim(),
          dateOfBirth:            document.getElementById('pf-dob').value || null,
          phone:                  document.getElementById('pf-phone').value || null,
          address:                document.getElementById('pf-address').value || null,
          emergencyContactName:   document.getElementById('pf-ec-name').value || null,
          emergencyContactPhone:  document.getElementById('pf-ec-phone').value || null,
        });
        Toast.success('Perfil actualizado correctamente');
        btn.disabled = false; btn.textContent = 'Guardar cambios';
      } catch (err) {
        alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'Guardar cambios';
      }
    });
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
  } finally { Loading.hide(); }
}

// ============================================================
// PAGES — DOCTOR
// ============================================================
async function renderDoctorDashboard() {
  Loading.show();
  try {
    const [me, stats] = await Promise.all([API.get('/auth/me'), API.get('/dashboard/doctor')]);
    State.setUser(me);

    setContent(renderShell('/doctor/dashboard', 'doctor', me, `
      <div class="page-header flex justify-between items-center">
        <div>
          <h2 class="page-title">Panel Médico</h2>
          <p class="page-subtitle">Dr. ${escHtml(me.first_name)} ${escHtml(me.last_name)} · ${escHtml(me.profile?.specialty||'')}</p>
        </div>
        <button class="btn btn-primary" onclick="Router.navigate('/doctor/patients')">${iconUsers()} Ver pacientes</button>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-card__icon">👥</div>
          <div class="stat-card__label">Total pacientes</div>
          <div class="stat-card__value">${stats.totalPatients}</div>
          <div class="stat-card__sub">Registrados en el sistema</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon">🩺</div>
          <div class="stat-card__label">Mis consultas</div>
          <div class="stat-card__value">${stats.totalConsultations}</div>
          <div class="stat-card__sub">Registradas por mí</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__icon">📅</div>
          <div class="stat-card__label">Consultas hoy</div>
          <div class="stat-card__value">${stats.todayConsultations}</div>
          <div class="stat-card__sub">${new Date().toLocaleDateString('es-MX',{weekday:'long'})}</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <span class="card-title">Consultas recientes</span>
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/doctor/patients')">Ver todos los pacientes →</button>
        </div>
        ${stats.recentConsultations.length > 0 ? `
        <div class="table-wrapper" style="border:none;border-radius:0">
          <table class="table">
            <thead><tr>
              <th>Paciente</th><th>Fecha</th><th>Motivo</th><th>Diagnóstico</th><th></th>
            </tr></thead>
            <tbody>
              ${stats.recentConsultations.map(c => `
              <tr>
                <td><div class="font-semibold text-sm">${escHtml(c.first_name)} ${escHtml(c.last_name)}</div><div class="text-xs text-muted font-mono">${escHtml(c.record_number)}</div></td>
                <td class="text-sm text-muted">${formatDateTime(c.date)}</td>
                <td class="text-sm">${escHtml(c.reason)}</td>
                <td class="text-sm text-muted">${escHtml(c.diagnosis||'—')}</td>
                <td><button class="btn btn-ghost btn-sm" onclick="Router.navigate('/doctor/patient/${c.patient_id}')">Ver expediente</button></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>` : `
        <div class="card-body">
          <div class="empty-state">
            <div class="empty-state__icon">📋</div>
            <div class="empty-state__title">Sin consultas aún</div>
            <div class="empty-state__text">Cuando registres una consulta aparecerá aquí.</div>
          </div>
        </div>`}
      </div>`));
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
    Toast.error('Error al cargar el panel: ' + err.message);
  } finally { Loading.hide(); }
}

async function renderDoctorPatients() {
  Loading.show();
  try {
    const [me, patients] = await Promise.all([API.get('/auth/me'), API.get('/patients')]);
    State.setUser(me);

    setContent(renderShell('/doctor/patients', 'doctor', me, `
      <div class="page-header flex justify-between items-center">
        <div>
          <h2 class="page-title">Pacientes</h2>
          <p class="page-subtitle">${patients.length} paciente${patients.length!==1?'s':''} registrado${patients.length!==1?'s':''}</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <div class="search-wrapper" style="flex:1;max-width:380px">
            <span class="search-icon">${iconSearch()}</span>
            <input class="input" type="search" id="patient-search" placeholder="Buscar por nombre, correo o expediente…" oninput="filterPatients(this.value)">
          </div>
        </div>
        <div id="patients-table">
          ${renderPatientsTable(patients)}
        </div>
      </div>`));

    window._allPatients = patients;
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
    Toast.error(err.message);
  } finally { Loading.hide(); }
}

function renderPatientsTable(patients) {
  if (!patients.length) return `<div class="card-body"><div class="empty-state"><div class="empty-state__icon">👥</div><div class="empty-state__title">Sin resultados</div></div></div>`;
  return `
    <div class="table-wrapper" style="border:none;border-radius:0">
      <table class="table">
        <thead><tr>
          <th>Paciente</th><th>Expediente</th><th>Tipo de sangre</th><th>Consultas</th><th>Última consulta</th><th></th>
        </tr></thead>
        <tbody>
          ${patients.map(p => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:.625rem">
                <div class="header-avatar" style="width:32px;height:32px;font-size:.6875rem">${initials(p.first_name, p.last_name)}</div>
                <div>
                  <div class="font-semibold text-sm">${escHtml(p.first_name)} ${escHtml(p.last_name)}</div>
                  <div class="text-xs text-muted">${escHtml(p.email)}</div>
                </div>
              </div>
            </td>
            <td><span class="font-mono text-xs">${escHtml(p.record_number||'—')}</span></td>
            <td>${bloodTypeBadge(p.blood_type)}</td>
            <td class="text-sm">${p.consultation_count}</td>
            <td class="text-sm text-muted">${p.last_consultation ? formatDate(p.last_consultation) : '—'}</td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="Router.navigate('/doctor/patient/${p.id}')">Ver expediente</button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

window.filterPatients = function(q) {
  const all = window._allPatients || [];
  const lq = q.toLowerCase();
  const filtered = lq ? all.filter(p =>
    `${p.first_name} ${p.last_name}`.toLowerCase().includes(lq) ||
    (p.email||'').toLowerCase().includes(lq) ||
    (p.record_number||'').toLowerCase().includes(lq)
  ) : all;
  document.getElementById('patients-table').innerHTML = renderPatientsTable(filtered);
};

async function renderDoctorPatientDetail(patientId) {
  Loading.show();
  try {
    const [me, data, patient] = await Promise.all([
      API.get('/auth/me'),
      API.get(`/patients/${patientId}/record`),
      API.get(`/patients/${patientId}`),
    ]);
    State.setUser(me);
    const { record, consultations, studies, allergies, conditions, medications } = data;

    setContent(renderShell('/doctor/patients', 'doctor', me, `
      <div class="page-header">
        <div style="display:flex;align-items:center;gap:.75rem;margin-bottom:.5rem">
          <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/doctor/patients')">&larr; Pacientes</button>
        </div>
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap">
          <div>
            <h2 class="page-title">${escHtml(record.first_name)} ${escHtml(record.last_name)}</h2>
            <p class="page-subtitle">Expediente ${escHtml(record.record_number)}</p>
          </div>
          <button class="btn btn-primary" onclick="openNewConsultationModal(${patientId})">${iconPlus()} Nueva consulta</button>
        </div>
      </div>

      <div class="record-header">
        <div class="record-avatar">${initials(record.first_name, record.last_name)}</div>
        <div class="record-info">
          <div class="record-name">${escHtml(record.first_name)} ${escHtml(record.last_name)}</div>
          <div class="record-meta">
            ${record.date_of_birth ? `Nac: ${formatDate(record.date_of_birth)}` : ''}
            ${record.blood_type ? ` · ${bloodTypeBadge(record.blood_type)}` : ''}
            ${record.phone ? ` · ${escHtml(record.phone)}` : ''}
          </div>
          <div class="record-number">${escHtml(record.record_number)}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:.5rem;flex-shrink:0">
          <button class="btn btn-secondary btn-sm" onclick="openAddAllergyModal(${patientId})">${iconPlus()} Alergia</button>
          <button class="btn btn-secondary btn-sm" onclick="openAddConditionModal(${patientId})">${iconPlus()} Condición</button>
          <button class="btn btn-secondary btn-sm" onclick="openAddMedicationModal(${patientId})">${iconPlus()} Medicamento</button>
          <button class="btn btn-secondary btn-sm" onclick="openAddStudyModal(${patientId})">${iconPlus()} Estudio</button>
        </div>
      </div>

      <div class="tabs" id="record-tabs">
        <div class="tab active" data-tab="consultations">Consultas (${consultations.length})</div>
        <div class="tab" data-tab="medications">Medicamentos (${medications.length})</div>
        <div class="tab" data-tab="studies">Estudios (${studies.length})</div>
        <div class="tab" data-tab="allergies">Alergias (${allergies.length})</div>
        <div class="tab" data-tab="conditions">Condiciones (${conditions.length})</div>
      </div>

      <div class="tab-content active" id="tab-consultations">${renderConsultationsList(consultations)}</div>
      <div class="tab-content" id="tab-medications">${renderMedicationsView(medications, patientId)}</div>
      <div class="tab-content" id="tab-studies">${renderStudiesView(studies, patientId)}</div>
      <div class="tab-content" id="tab-allergies">${renderAllergiesView(allergies, patientId, false)}</div>
      <div class="tab-content" id="tab-conditions">${renderConditionsView(conditions, patientId, false)}</div>`));

    initTabs();
    initConsultationToggles();
    window._currentPatientId = patientId;
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
    Toast.error('Error al cargar el expediente: ' + err.message);
  } finally { Loading.hide(); }
}

async function renderDoctorProfile() {
  Loading.show();
  try {
    const me = await API.get('/auth/me');
    State.setUser(me);
    const p = me.profile || {};

    setContent(renderShell('/doctor/profile', 'doctor', me, `
      <div class="page-header">
        <h2 class="page-title">Mi Perfil</h2>
        <p class="page-subtitle">Datos del médico</p>
      </div>
      <div class="profile-section">
        <div class="profile-header-card">
          <div class="profile-avatar-lg">${initials(me.first_name, me.last_name)}</div>
          <div>
            <div class="profile-name">Dr. ${escHtml(me.first_name)} ${escHtml(me.last_name)}</div>
            <div class="profile-email">${escHtml(me.email)}</div>
            <div class="text-xs text-muted" style="margin-top:.25rem">${escHtml(p.specialty||'')} · Cédula: ${escHtml(p.license_number||'')}</div>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span class="card-title">Datos de contacto</span></div>
          <div class="card-body">
            <div id="drprofile-alert"></div>
            <form id="drprofile-form">
              <div class="form-row">
                <div class="form-group">
                  <label class="label label-required" for="dp-fname">Nombre</label>
                  <input class="input" id="dp-fname" type="text" value="${escHtml(me.first_name)}" required>
                </div>
                <div class="form-group">
                  <label class="label label-required" for="dp-lname">Apellido</label>
                  <input class="input" id="dp-lname" type="text" value="${escHtml(me.last_name)}" required>
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="label" for="dp-phone">Teléfono</label>
                  <input class="input" id="dp-phone" type="tel" value="${escHtml(p.phone||'')}">
                </div>
                <div class="form-group">
                  <label class="label" for="dp-hospital">Hospital / Clínica</label>
                  <input class="input" id="dp-hospital" type="text" value="${escHtml(p.hospital||'')}">
                </div>
              </div>
              <button type="submit" class="btn btn-primary" id="dp-btn">Guardar cambios</button>
            </form>
          </div>
        </div>
      </div>`));

    document.getElementById('drprofile-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const alertEl = document.getElementById('drprofile-alert');
      const btn     = document.getElementById('dp-btn');
      btn.disabled  = true;
      btn.innerHTML = `<span class="inline-spinner"></span> Guardando…`;
      try {
        await API.put('/auth/profile', {
          firstName: document.getElementById('dp-fname').value.trim(),
          lastName:  document.getElementById('dp-lname').value.trim(),
          phone:     document.getElementById('dp-phone').value || null,
          hospital:  document.getElementById('dp-hospital').value || null,
        });
        Toast.success('Perfil actualizado');
        btn.disabled = false; btn.textContent = 'Guardar cambios';
      } catch (err) {
        alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
        btn.disabled = false; btn.textContent = 'Guardar cambios';
      }
    });
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
  } finally { Loading.hide(); }
}

// ============================================================
// SHARED RECORD RENDERERS
// ============================================================
function renderConsultationsList(consultations) {
  if (!consultations.length) return `<div class="empty-state"><div class="empty-state__icon">📋</div><div class="empty-state__title">Sin consultas registradas</div></div>`;

  return consultations.map((c, i) => `
    <div class="consultation-item">
      <div class="consultation-item__header" onclick="toggleConsultation('consult-${i}')">
        <div>
          <div class="consultation-item__date">${formatDateTime(c.date)}</div>
          <div class="consultation-item__reason">${escHtml(c.reason)}</div>
        </div>
        <div class="consultation-item__doctor text-sm">Dr. ${escHtml(c.doctor_first_name||'')} ${escHtml(c.doctor_last_name||'')} · ${escHtml(c.specialty||'')}</div>
        ${c.diagnosis ? `<span class="badge badge-blue" style="flex-shrink:0">${escHtml(c.diagnosis)}</span>` : ''}
        ${iconChevron('down')}
      </div>
      <div class="consultation-item__body" id="consult-${i}">
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:1rem;margin-top:1rem">
          ${c.diagnosis ? `<div class="consultation-detail"><label>Diagnóstico</label><p>${escHtml(c.diagnosis)}</p></div>` : ''}
          ${c.treatment_plan ? `<div class="consultation-detail"><label>Plan de tratamiento</label><p>${escHtml(c.treatment_plan)}</p></div>` : ''}
          ${c.notes ? `<div class="consultation-detail"><label>Notas</label><p>${escHtml(c.notes)}</p></div>` : ''}
          ${c.blood_pressure||c.heart_rate||c.temperature||c.weight ? `
          <div class="consultation-detail"><label>Signos vitales</label>
            <p>
              ${c.blood_pressure ? `PA: ${escHtml(c.blood_pressure)}<br>` : ''}
              ${c.heart_rate ? `FC: ${c.heart_rate} lpm<br>` : ''}
              ${c.temperature ? `Temp: ${c.temperature}°C<br>` : ''}
              ${c.weight ? `Peso: ${c.weight} kg` : ''}
              ${c.height ? ` · Talla: ${c.height} cm` : ''}
            </p>
          </div>` : ''}
        </div>
        ${c.prescriptions && c.prescriptions.length ? `
        <div style="margin-top:1rem"><label class="label" style="margin-bottom:.5rem">Recetas</label>
          <div class="rx-list">
            ${c.prescriptions.map(rx => `
            <div class="rx-item">
              <div class="rx-item__name">💊 ${escHtml(rx.medication)}</div>
              <div class="rx-item__detail">${escHtml(rx.dosage)} · ${escHtml(rx.frequency)}${rx.duration ? ` · ${escHtml(rx.duration)}` : ''}${rx.instructions ? `<br><em>${escHtml(rx.instructions)}</em>` : ''}</div>
            </div>`).join('')}
          </div>
        </div>` : ''}
      </div>
    </div>`).join('');
}

function renderMedicationsView(meds, patientId = null) {
  const active   = meds.filter(m => m.active);
  const inactive = meds.filter(m => !m.active);

  if (!meds.length) return `<div class="empty-state"><div class="empty-state__icon">💊</div><div class="empty-state__title">Sin medicamentos registrados</div>${patientId ? `<button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="openAddMedicationModal(${patientId})">${iconPlus()} Agregar medicamento</button>` : ''}</div>`;

  const renderRow = (m) => `
    <tr>
      <td><div class="font-semibold text-sm">${escHtml(m.name)}</div></td>
      <td class="text-sm">${escHtml(m.dosage)}</td>
      <td class="text-sm">${escHtml(m.frequency)}</td>
      <td class="text-sm text-muted">${m.start_date ? formatDate(m.start_date) : '—'}</td>
      <td>${statusBadge(m.active ? 'active' : 'resolved')}</td>
      ${patientId ? `<td>${m.active ? `<button class="btn btn-ghost btn-sm" onclick="toggleMedication(${m.id},false,${patientId})" title="Marcar inactivo">${iconEdit()}</button>` : ''}</td>` : '<td></td>'}
    </tr>`;

  return `
    ${active.length ? `
    <div style="margin-bottom:.5rem"><span class="badge badge-green">Activos</span></div>
    <div class="table-wrapper" style="margin-bottom:1.5rem">
      <table class="table"><thead><tr><th>Medicamento</th><th>Dosis</th><th>Frecuencia</th><th>Inicio</th><th>Estado</th><th></th></tr></thead>
      <tbody>${active.map(renderRow).join('')}</tbody></table>
    </div>` : ''}
    ${inactive.length ? `
    <div style="margin-bottom:.5rem"><span class="badge badge-gray">Historial</span></div>
    <div class="table-wrapper">
      <table class="table"><thead><tr><th>Medicamento</th><th>Dosis</th><th>Frecuencia</th><th>Inicio</th><th>Estado</th><th></th></tr></thead>
      <tbody>${inactive.map(renderRow).join('')}</tbody></table>
    </div>` : ''}`;
}

function renderStudiesView(studies, patientId = null) {
  if (!studies.length) return `<div class="empty-state"><div class="empty-state__icon">🔬</div><div class="empty-state__title">Sin estudios registrados</div>${patientId ? `<button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="openAddStudyModal(${patientId})">${iconPlus()} Solicitar estudio</button>` : ''}</div>`;
  return `
    <div class="table-wrapper">
      <table class="table">
        <thead><tr><th>Estudio</th><th>Tipo</th><th>Fecha</th><th>Estado</th><th>Resultado</th>${patientId?'<th></th>':''}</tr></thead>
        <tbody>
          ${studies.map(s => `
          <tr>
            <td><div class="font-semibold text-sm">${escHtml(s.name)}</div>${s.doctor_first_name?`<div class="text-xs text-muted">Dr. ${escHtml(s.doctor_first_name)} ${escHtml(s.doctor_last_name||'')}</div>`:''}</td>
            <td class="text-sm text-muted">${escHtml(s.type)}</td>
            <td class="text-sm text-muted">${s.date ? formatDate(s.date) : '—'}</td>
            <td>${statusBadge(s.status)}</td>
            <td class="text-sm">${escHtml(s.result||'—')}</td>
            ${patientId ? `<td><button class="btn btn-ghost btn-sm" onclick="openUpdateStudyModal(${s.id},${patientId})">${iconEdit()}</button></td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderAllergiesView(allergies, patientId = null, readOnly = false) {
  if (!allergies.length) return `<div class="empty-state"><div class="empty-state__icon">⚠️</div><div class="empty-state__title">Sin alergias registradas</div></div>`;
  return `
    <div class="table-wrapper">
      <table class="table">
        <thead><tr><th>Alérgeno</th><th>Reacción</th><th>Severidad</th>${!readOnly?'<th></th>':''}</tr></thead>
        <tbody>
          ${allergies.map(a => `
          <tr>
            <td class="font-semibold text-sm">${escHtml(a.allergen)}</td>
            <td class="text-sm text-muted">${escHtml(a.reaction||'—')}</td>
            <td>${severityBadge(a.severity)}</td>
            ${!readOnly ? `<td><button class="btn btn-ghost btn-sm" style="color:var(--color-error)" onclick="deleteAllergy(${a.id},${patientId})" title="Eliminar">${iconTrash()}</button></td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

function renderConditionsView(conditions, patientId = null, readOnly = false) {
  if (!conditions.length) return `<div class="empty-state"><div class="empty-state__icon">🏥</div><div class="empty-state__title">Sin condiciones registradas</div></div>`;
  return `
    <div class="table-wrapper">
      <table class="table">
        <thead><tr><th>Condición</th><th>Diagnóstico</th><th>Estado</th><th>Tratamiento</th>${!readOnly?'<th></th>':''}</tr></thead>
        <tbody>
          ${conditions.map(c => `
          <tr>
            <td class="font-semibold text-sm">${escHtml(c.condition_name)}</td>
            <td class="text-sm text-muted">${c.diagnosed_date ? formatDate(c.diagnosed_date) : '—'}</td>
            <td>${statusBadge(c.status)}</td>
            <td class="text-sm text-muted">${escHtml(c.treatment||'—')}</td>
            ${!readOnly ? `<td><button class="btn btn-ghost btn-sm" onclick="openUpdateConditionModal(${c.id},'${escHtml(c.status)}',${patientId})">${iconEdit()}</button></td>` : ''}
          </tr>`).join('')}
        </tbody>
      </table>
    </div>`;
}

// ============================================================
// DOCTOR MODALS
// ============================================================
window.openNewConsultationModal = function(patientId) {
  let rxCount = 0;
  function rxItem(i) {
    return `<div class="rx-builder__item" id="rx-item-${i}">
      <button type="button" class="rx-builder__remove" onclick="document.getElementById('rx-item-${i}').remove()">✕</button>
      <div class="form-row" style="margin-bottom:.5rem">
        <div class="form-group" style="margin-bottom:0"><input class="input" placeholder="Medicamento *" name="rx-med-${i}" required></div>
        <div class="form-group" style="margin-bottom:0"><input class="input" placeholder="Dosis *" name="rx-dose-${i}" required></div>
      </div>
      <div class="form-row">
        <div class="form-group" style="margin-bottom:0"><input class="input" placeholder="Frecuencia *" name="rx-freq-${i}" required></div>
        <div class="form-group" style="margin-bottom:0"><input class="input" placeholder="Duración (ej. 7 días)" name="rx-dur-${i}"></div>
      </div>
      <div class="form-group" style="margin-bottom:0;margin-top:.5rem"><input class="input" placeholder="Instrucciones adicionales" name="rx-inst-${i}"></div>
    </div>`;
  }

  Modal.open(Modal.html('Nueva Consulta', `
    <div id="nc-alert"></div>
    <form id="new-consult-form" novalidate>
      <div class="form-group">
        <label class="label label-required">Motivo de consulta</label>
        <input class="input" id="nc-reason" placeholder="Describe el motivo de la visita" required>
      </div>
      <div class="form-group">
        <label class="label">Diagnóstico</label>
        <input class="input" id="nc-diagnosis" placeholder="Diagnóstico">
      </div>
      <div class="form-group">
        <label class="label">Plan de tratamiento</label>
        <textarea class="textarea" id="nc-treatment" placeholder="Indicaciones y plan de tratamiento" style="min-height:70px"></textarea>
      </div>

      <div class="form-row-3">
        <div class="form-group">
          <label class="label">Presión arterial</label>
          <input class="input" id="nc-bp" placeholder="120/80">
        </div>
        <div class="form-group">
          <label class="label">FC (lpm)</label>
          <input class="input" type="number" id="nc-hr" placeholder="72">
        </div>
        <div class="form-group">
          <label class="label">Temperatura (°C)</label>
          <input class="input" type="number" step="0.1" id="nc-temp" placeholder="37.0">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="label">Peso (kg)</label>
          <input class="input" type="number" step="0.1" id="nc-weight" placeholder="70">
        </div>
        <div class="form-group">
          <label class="label">Talla (cm)</label>
          <input class="input" type="number" id="nc-height" placeholder="170">
        </div>
      </div>

      <div class="form-group">
        <label class="label">Notas adicionales</label>
        <textarea class="textarea" id="nc-notes" placeholder="Observaciones" style="min-height:60px"></textarea>
      </div>

      <div class="form-group">
        <label class="label">Recetas</label>
        <div class="rx-builder" id="rx-builder"></div>
        <button type="button" class="btn btn-ghost btn-sm" style="margin-top:.5rem" onclick="addRxItem()">
          ${iconPlus()} Agregar medicamento
        </button>
      </div>
    </form>`,
    `<button type="button" class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button type="button" class="btn btn-primary" id="submit-consult-btn" onclick="submitConsultation(${patientId})">Registrar consulta</button>`
  ), { size: 'lg' });

  window.addRxItem = function() {
    document.getElementById('rx-builder').insertAdjacentHTML('beforeend', rxItem(rxCount++));
  };
};

window.submitConsultation = async function(patientId) {
  const alertEl = document.getElementById('nc-alert');
  const btn     = document.getElementById('submit-consult-btn');
  alertEl.innerHTML = '';

  const reason = document.getElementById('nc-reason').value.trim();
  if (!reason) { alertEl.innerHTML = `<div class="alert alert-error">El motivo de consulta es requerido.</div>`; return; }

  // Collect prescriptions
  const rxItems = document.querySelectorAll('.rx-builder__item');
  const prescriptions = [];
  for (const item of rxItems) {
    const i   = item.id.split('-').pop();
    const med = item.querySelector(`[name="rx-med-${i}"]`)?.value?.trim();
    const dose= item.querySelector(`[name="rx-dose-${i}"]`)?.value?.trim();
    const freq= item.querySelector(`[name="rx-freq-${i}"]`)?.value?.trim();
    if (!med || !dose || !freq) { alertEl.innerHTML = `<div class="alert alert-error">Completa todos los campos de cada receta.</div>`; return; }
    prescriptions.push({ medication: med, dosage: dose, frequency: freq,
      duration:     item.querySelector(`[name="rx-dur-${i}"]`)?.value || null,
      instructions: item.querySelector(`[name="rx-inst-${i}"]`)?.value || null,
    });
  }

  btn.disabled = true; btn.innerHTML = `<span class="inline-spinner"></span> Guardando…`;

  try {
    await API.post('/consultations', {
      patientId,
      reason,
      diagnosis:     document.getElementById('nc-diagnosis').value.trim() || null,
      treatmentPlan: document.getElementById('nc-treatment').value.trim() || null,
      bloodPressure: document.getElementById('nc-bp').value.trim() || null,
      heartRate:     document.getElementById('nc-hr').value || null,
      temperature:   document.getElementById('nc-temp').value || null,
      weight:        document.getElementById('nc-weight').value || null,
      height:        document.getElementById('nc-height').value || null,
      notes:         document.getElementById('nc-notes').value.trim() || null,
      prescriptions,
    });
    Modal.close();
    Toast.success('Consulta registrada exitosamente');
    renderDoctorPatientDetail(patientId);
  } catch (err) {
    alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`;
    btn.disabled = false; btn.textContent = 'Registrar consulta';
  }
};

window.openAddAllergyModal = function(patientId) {
  Modal.open(Modal.html('Registrar Alergia', `
    <div id="allergy-alert"></div>
    <div class="form-group"><label class="label label-required">Alérgeno</label><input class="input" id="al-allergen" placeholder="Penicilina, Mariscos, etc." required></div>
    <div class="form-group"><label class="label">Reacción</label><input class="input" id="al-reaction" placeholder="Describe la reacción alérgica"></div>
    <div class="form-group"><label class="label">Severidad</label>
      <select class="select" id="al-severity">
        <option value="">Seleccionar…</option>
        <option value="mild">Leve</option><option value="moderate">Moderada</option><option value="severe">Grave</option>
      </select>
    </div>`,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button class="btn btn-primary" onclick="submitAllergy(${patientId})">Registrar</button>`));
};

window.submitAllergy = async function(patientId) {
  const alertEl = document.getElementById('allergy-alert');
  const allergen = document.getElementById('al-allergen').value.trim();
  if (!allergen) { alertEl.innerHTML = `<div class="alert alert-error">El alérgeno es requerido.</div>`; return; }
  try {
    await API.post('/allergies', { patientId, allergen, reaction: document.getElementById('al-reaction').value.trim()||null, severity: document.getElementById('al-severity').value||null });
    Modal.close(); Toast.success('Alergia registrada');
    renderDoctorPatientDetail(patientId);
  } catch (err) { alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`; }
};

window.deleteAllergy = async function(allergyId, patientId) {
  if (!confirm('¿Eliminar esta alergia?')) return;
  try { await API.del(`/allergies/${allergyId}`); Toast.success('Alergia eliminada'); renderDoctorPatientDetail(patientId); }
  catch (err) { Toast.error(err.message); }
};

window.openAddConditionModal = function(patientId) {
  Modal.open(Modal.html('Registrar Condición', `
    <div id="cond-alert"></div>
    <div class="form-group"><label class="label label-required">Condición / Enfermedad</label><input class="input" id="cond-name" placeholder="Diabetes tipo 2, Hipertensión, etc." required></div>
    <div class="form-row">
      <div class="form-group"><label class="label">Fecha de diagnóstico</label><input class="input" type="date" id="cond-date"></div>
      <div class="form-group"><label class="label">Estado</label>
        <select class="select" id="cond-status">
          <option value="active">Activo</option><option value="managed">Controlado</option><option value="resolved">Resuelto</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="label">Tratamiento</label><input class="input" id="cond-treatment" placeholder="Descripción del tratamiento"></div>
    <div class="form-group"><label class="label">Notas</label><textarea class="textarea" id="cond-notes" placeholder="Observaciones" style="min-height:60px"></textarea></div>`,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button class="btn btn-primary" onclick="submitCondition(${patientId})">Registrar</button>`));
};

window.submitCondition = async function(patientId) {
  const alertEl = document.getElementById('cond-alert');
  const name = document.getElementById('cond-name').value.trim();
  if (!name) { alertEl.innerHTML = `<div class="alert alert-error">El nombre de la condición es requerido.</div>`; return; }
  try {
    await API.post('/conditions', { patientId, conditionName: name, diagnosedDate: document.getElementById('cond-date').value||null, status: document.getElementById('cond-status').value, treatment: document.getElementById('cond-treatment').value.trim()||null, notes: document.getElementById('cond-notes').value.trim()||null });
    Modal.close(); Toast.success('Condición registrada'); renderDoctorPatientDetail(patientId);
  } catch (err) { alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`; }
};

window.openUpdateConditionModal = function(condId, currentStatus, patientId) {
  Modal.open(Modal.html('Actualizar Condición', `
    <div class="form-group"><label class="label">Estado</label>
      <select class="select" id="upd-cond-status">
        <option value="active" ${currentStatus==='active'?'selected':''}>Activo</option>
        <option value="managed" ${currentStatus==='managed'?'selected':''}>Controlado</option>
        <option value="resolved" ${currentStatus==='resolved'?'selected':''}>Resuelto</option>
      </select>
    </div>
    <div class="form-group"><label class="label">Tratamiento</label><input class="input" id="upd-cond-treat" placeholder="Tratamiento actual"></div>`,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button class="btn btn-primary" onclick="submitUpdateCondition(${condId},${patientId})">Actualizar</button>`));
};

window.submitUpdateCondition = async function(condId, patientId) {
  try {
    await API.put(`/conditions/${condId}`, { status: document.getElementById('upd-cond-status').value, treatment: document.getElementById('upd-cond-treat').value.trim()||null });
    Modal.close(); Toast.success('Condición actualizada'); renderDoctorPatientDetail(patientId);
  } catch (err) { Toast.error(err.message); }
};

window.openAddMedicationModal = function(patientId) {
  Modal.open(Modal.html('Agregar Medicamento', `
    <div id="med-alert"></div>
    <div class="form-row">
      <div class="form-group"><label class="label label-required">Medicamento</label><input class="input" id="med-name" placeholder="Nombre del medicamento" required></div>
      <div class="form-group"><label class="label label-required">Dosis</label><input class="input" id="med-dose" placeholder="500 mg" required></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="label label-required">Frecuencia</label><input class="input" id="med-freq" placeholder="Cada 8 horas" required></div>
      <div class="form-group"><label class="label">Fecha de inicio</label><input class="input" type="date" id="med-start"></div>
    </div>
    <div class="form-group"><label class="label">Notas</label><input class="input" id="med-notes" placeholder="Instrucciones adicionales"></div>`,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button class="btn btn-primary" onclick="submitMedication(${patientId})">Agregar</button>`));
};

window.submitMedication = async function(patientId) {
  const alertEl = document.getElementById('med-alert');
  const name = document.getElementById('med-name').value.trim();
  const dose = document.getElementById('med-dose').value.trim();
  const freq = document.getElementById('med-freq').value.trim();
  if (!name || !dose || !freq) { alertEl.innerHTML = `<div class="alert alert-error">Nombre, dosis y frecuencia son requeridos.</div>`; return; }
  try {
    await API.post('/medications', { patientId, name, dosage: dose, frequency: freq, startDate: document.getElementById('med-start').value||null, notes: document.getElementById('med-notes').value.trim()||null });
    Modal.close(); Toast.success('Medicamento agregado'); renderDoctorPatientDetail(patientId);
  } catch (err) { alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`; }
};

window.toggleMedication = async function(medId, active, patientId) {
  try {
    await API.put(`/medications/${medId}`, { active });
    Toast.success('Medicamento actualizado');
    renderDoctorPatientDetail(patientId);
  } catch (err) { Toast.error(err.message); }
};

window.openAddStudyModal = function(patientId) {
  Modal.open(Modal.html('Solicitar Estudio', `
    <div id="study-alert"></div>
    <div class="form-row">
      <div class="form-group"><label class="label label-required">Tipo</label>
        <select class="select" id="st-type" required>
          <option value="">Seleccionar…</option>
          <option>Laboratorio</option><option>Imagen</option><option>Radiografía</option>
          <option>Electrocardiograma</option><option>Ultrasonido</option><option>Endoscopia</option><option>Otro</option>
        </select>
      </div>
      <div class="form-group"><label class="label label-required">Nombre del estudio</label><input class="input" id="st-name" placeholder="Biometría hemática, etc." required></div>
    </div>
    <div class="form-row">
      <div class="form-group"><label class="label">Fecha</label><input class="input" type="date" id="st-date"></div>
      <div class="form-group"><label class="label">Estado</label>
        <select class="select" id="st-status">
          <option value="pending">Pendiente</option><option value="completed">Completado</option>
        </select>
      </div>
    </div>
    <div class="form-group"><label class="label">Resultado</label><textarea class="textarea" id="st-result" placeholder="Resultado del estudio" style="min-height:70px"></textarea></div>`,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button class="btn btn-primary" onclick="submitStudy(${patientId})">Registrar</button>`));
};

window.submitStudy = async function(patientId) {
  const alertEl = document.getElementById('study-alert');
  const type = document.getElementById('st-type').value;
  const name = document.getElementById('st-name').value.trim();
  if (!type || !name) { alertEl.innerHTML = `<div class="alert alert-error">Tipo y nombre son requeridos.</div>`; return; }
  try {
    await API.post('/studies', { patientId, type, name, date: document.getElementById('st-date').value||null, result: document.getElementById('st-result').value.trim()||null, status: document.getElementById('st-status').value });
    Modal.close(); Toast.success('Estudio registrado'); renderDoctorPatientDetail(patientId);
  } catch (err) { alertEl.innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`; }
};

window.openUpdateStudyModal = function(studyId, patientId) {
  Modal.open(Modal.html('Actualizar Estudio', `
    <div class="form-group"><label class="label">Estado</label>
      <select class="select" id="upd-st-status">
        <option value="pending">Pendiente</option><option value="completed">Completado</option><option value="cancelled">Cancelado</option>
      </select>
    </div>
    <div class="form-group"><label class="label">Resultado</label><textarea class="textarea" id="upd-st-result" placeholder="Resultado del estudio" style="min-height:80px"></textarea></div>`,
    `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button>
     <button class="btn btn-primary" onclick="submitUpdateStudy(${studyId},${patientId})">Actualizar</button>`));
};

window.submitUpdateStudy = async function(studyId, patientId) {
  try {
    await API.put(`/studies/${studyId}`, { status: document.getElementById('upd-st-status').value, result: document.getElementById('upd-st-result').value.trim()||null });
    Modal.close(); Toast.success('Estudio actualizado'); renderDoctorPatientDetail(patientId);
  } catch (err) { Toast.error(err.message); }
};

// ============================================================
// MISC HELPERS
// ============================================================
function initTabs() {
  const tabs = document.querySelectorAll('.tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      const content = document.getElementById('tab-' + tab.dataset.tab);
      if (content) content.classList.add('active');
    });
  });
}

function initConsultationToggles() {
  document.querySelectorAll('.consultation-item__header').forEach(h => {
    h.addEventListener('click', () => {
      const body = h.nextElementSibling;
      if (body) body.classList.toggle('open');
    });
  });
}

window.toggleConsultation = function(id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle('open');
};

function render404() {
  setContent(`
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:2rem">
      <div>
        <div style="font-size:4rem;margin-bottom:1rem">404</div>
        <h2 style="margin-bottom:.75rem">Página no encontrada</h2>
        <p class="text-muted" style="margin-bottom:1.5rem">La página que buscas no existe.</p>
        <button class="btn btn-primary" onclick="Router.navigate('/')">Ir al inicio</button>
      </div>
    </div>`);
}

function logout() {
  State.clearAuth();
  Toast.info('Sesión cerrada');
  Router.navigate('/');
}
window.logout = logout;
window.Router = Router;

// ============================================================
// ROUTES
// ============================================================
Router.on('/',                    renderLanding);
Router.on('/login',               renderLogin);
Router.on('/register',            renderRegister);
Router.on('/forgot-password',     renderForgotPassword);
Router.on('/reset-password',      renderResetPassword);
Router.on('/patient/dashboard',   renderPatientDashboard);
Router.on('/patient/record',      renderPatientRecord);
Router.on('/patient/profile',     renderPatientProfile);
Router.on('/doctor/dashboard',    renderDoctorDashboard);
Router.on('/doctor/patients',     renderDoctorPatients);
Router.on('/doctor/patient/:id',  (id) => renderDoctorPatientDetail(parseInt(id)));
Router.on('/doctor/profile',      renderDoctorProfile);

// ============================================================
// BOOT
// ============================================================
async function boot() {
  if (State.isLoggedIn()) {
    try {
      const me = await API.get('/auth/me');
      State.setUser(me);
    } catch {
      State.clearAuth();
    }
  }
  Router.resolve();
}

boot();
