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
  if (role === 'doctor') return renderDoctorShell(activePath, user, contentHtml);
  return renderPatientShell(activePath, user, contentHtml);
}

function renderDoctorShell(activePath, user, contentHtml) {
  const nav = [
    { path: '/doctor/dashboard',  label: 'Dashboard',    icon: iconGrid() },
    { path: '/doctor/agenda',     label: 'Agenda',       icon: iconCalendar() },
    { path: '/doctor/patients',   label: 'Pacientes',    icon: iconUsers() },
    { path: '/doctor/expedientes',label: 'Expedientes',  icon: iconFolder() },
    { path: '/doctor/ganancias',  label: 'Ganancias',    icon: iconChart() },
    { path: '/doctor/profile',    label: 'Configuración',icon: iconSettings() },
  ];
  const title = `${user?.profile?.gender==='F'?'Dra.':'Dr.'} ${escHtml((user?.first_name||'')+' '+(user?.last_name||''))}`.trim().replace(/^Dr\. $/,'');
  return `
    <div class="dr-layout">
      <aside class="dr-sidebar" id="dr-sidebar">
        <a class="dr-sidebar__brand" href="#/doctor/dashboard">
          <span class="ln-nav__dot"></span>
          <span class="ln-nav__wordmark">MediLink</span>
        </a>
        <nav class="dr-sidebar__nav">
          ${nav.map(item => `
            <div class="nav-item ${activePath===item.path||activePath.startsWith(item.path+'/')?'active':''}"
                 onclick="Router.navigate('${item.path}')">
              ${item.icon}<span>${item.label}</span>
            </div>`).join('')}
        </nav>
        <div class="dr-sidebar__footer">
          <div class="dr-sidebar__user">
            <div class="dr-user-av">${initials(user?.first_name, user?.last_name)}</div>
            <div>
              <div class="dr-user-name">${title || escHtml((user?.first_name||'')+' '+(user?.last_name||''))}</div>
              <div class="dr-user-role">${escHtml(user?.profile?.specialty||'Médico')}</div>
            </div>
          </div>
          <button class="dr-logout-btn" onclick="logout()">${iconLogout()}&nbsp;Cerrar sesión</button>
        </div>
      </aside>
      <main class="dr-main" id="main-content">
        ${contentHtml}
      </main>
    </div>`;
}

function renderPatientShell(activePath, user, contentHtml) {
  const tabs = [
    { path: '/patient/search',    label: 'Buscar' },
    { path: '/patient/citas',     label: 'Mis citas' },
    { path: '/patient/record',    label: 'Expediente' },
    { path: '/patient/favoritos', label: 'Favoritos' },
  ];
  return `
    <div class="pt-layout">
      <nav class="pt-topnav">
        <a class="pt-topnav__brand" href="#/patient/dashboard">
          <span class="ln-nav__dot"></span>
          <span class="ln-nav__wordmark">MediLink</span>
        </a>
        <div class="pt-tabs">
          ${tabs.map(t => `<span class="pt-tab ${activePath===t.path?'active':''}" onclick="Router.navigate('${t.path}')">${t.label}</span>`).join('')}
        </div>
        <div class="pt-topnav__right">
          <button class="pt-bell" title="Notificaciones">${iconBell()}</button>
          <button class="pt-user-btn" onclick="Router.navigate('/patient/profile')">
            <div class="pt-user-av">${initials(user?.first_name, user?.last_name)}</div>
            <span class="pt-user-label">Paciente</span>
          </button>
          <button class="btn btn-ghost btn-sm" onclick="logout()" title="Cerrar sesión" style="display:flex;align-items:center;gap:.375rem;padding:.375rem .75rem;font-size:.8125rem;color:var(--color-text-3)">${iconLogout()}<span style="display:none;display:inline">Salir</span></button>
        </div>
      </nav>
      <main class="pt-main" id="main-content">
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
const iconCalendar= () => svgI('<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>');
const iconChart   = () => svgI('<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>');
const iconSettings= () => svgI('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>');
const iconBell    = () => svgI('<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>');
const iconFolder  = () => svgI('<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>');
const iconDownload= () => svgI('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>');

// ============================================================
// PAGES — LANDING
// ============================================================
function renderLanding() {
  setContent(`
    <div class="landing-page">

      <!-- NAV -->
      <nav class="ln-nav">
        <a class="ln-nav__brand" href="#">
          <span class="ln-nav__dot"></span>
          <span class="ln-nav__wordmark">MediLink</span>
        </a>
        <div class="ln-nav__spacer"></div>
        <span class="ln-nav__link" onclick="Router.navigate('/login')">Iniciar sesión</span>
        <button class="ln-nav__cta" onclick="Router.navigate('/register')">Registrarse gratis</button>
      </nav>

      <!-- HERO -->
      <section class="ln-hero">
        <div class="ln-hero__left">
          <div class="ln-eyebrow">
            <span class="ln-eyebrow__dot"></span>
            Plataforma de salud unificada · México
          </div>
          <h1 class="ln-h1">El médico correcto,<br><span class="ln-h1__accent">sin meses</span> de espera.</h1>
          <p class="ln-sub">Describe tus síntomas, encuentra al especialista adecuado y lleva tu expediente médico digital contigo. Pacientes y médicos, en la misma infraestructura.</p>
          <div class="ln-ctas">
            <button class="ln-btn-primary" onclick="Router.navigate('/register')">Soy paciente &nbsp;→</button>
            <button class="ln-btn-outline" onclick="Router.navigate('/register')">Soy médico</button>
          </div>
          <div class="ln-avatars">
            <div class="ln-avatars__row">
              <div class="ln-av" style="background:#157A62;color:#fff">NR</div>
              <div class="ln-av" style="background:#6B4C3B;color:#fff">CM</div>
              <div class="ln-av" style="background:#2B6CB0;color:#fff">AO</div>
              <div class="ln-av" style="background:#276749;color:#fff">PG</div>
            </div>
            <span class="ln-avatars__label">+240 profesionales de salud ya en la plataforma</span>
          </div>
        </div>

        <div class="ln-hero__right">
          <div class="ln-ai-card">
            <div class="ln-ai-card__header">
              <span class="ln-ai-card__label">MEDILINK IA</span>
              <span class="ln-ai-card__title">¿Qué síntomas tienes?</span>
            </div>
            <div class="ln-ai-card__body">
              <div class="ln-ai-input">Dolor de cabeza intenso, mareos frecuentes</div>
              <div class="ln-ai-section-label">ESPECIALISTAS RECOMENDADOS</div>
              <div class="ln-ai-doc">
                <div class="ln-ai-doc__av" style="background:#157A62">NR</div>
                <div class="ln-ai-doc__info">
                  <div class="ln-ai-doc__name">Dra. Nora Ramírez</div>
                  <div class="ln-ai-doc__meta">Neurología · UNAM &nbsp;★ 4.9</div>
                </div>
                <div class="ln-ai-doc__tag ln-ai-doc__tag--today">Hoy</div>
              </div>
              <div class="ln-ai-doc">
                <div class="ln-ai-doc__av" style="background:#6B4C3B">CM</div>
                <div class="ln-ai-doc__info">
                  <div class="ln-ai-doc__name">Dr. Carlos Mendoza</div>
                  <div class="ln-ai-doc__meta">Medicina Interna &nbsp;★ 4.8</div>
                </div>
                <div class="ln-ai-doc__tag">Mañana</div>
              </div>
              <div class="ln-ai-suggestion">
                <span class="ln-ai-suggestion__label">IA sugiere:</span>
                compatible con cefalea tensional o migraña. Agenda con neurología antes de 7 días.
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- STATS DARK BAR -->
      <section class="ln-stats">
        <div class="ln-stats__inner">
          <div class="ln-stat">
            <div class="ln-stat__n">6 meses</div>
            <div class="ln-stat__l">de espera promedio para un especialista en el IMSS</div>
          </div>
          <div class="ln-stat">
            <div class="ln-stat__n">68%</div>
            <div class="ln-stat__l">de los expedientes médicos siguen en papel en México</div>
          </div>
          <div class="ln-stat">
            <div class="ln-stat__n">3.4x</div>
            <div class="ln-stat__l">más rápido llegar al especialista correcto con orientación por IA</div>
          </div>
          <div class="ln-stat">
            <div class="ln-stat__n">$0</div>
            <div class="ln-stat__l">para el paciente que busca y agenda a su especialista</div>
          </div>
        </div>
      </section>

      <!-- FEATURES -->
      <section class="features" style="background:var(--color-surface)">
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

      <!-- EL PROBLEMA -->
      <section class="problem-section">
        <div class="problem-v2">
          <div class="problem-v2__top">
            <div class="problem-v2__eyebrow">El Problema</div>
            <h2 class="problem-v2__h2">El sistema de salud está <span class="accent">fragmentado</span>.</h2>
            <p class="problem-v2__sub">Pacientes sin historia clínica accesible. Médicos sin herramientas. Esperas que enferman más.</p>
          </div>

          <div class="problem-cards">
            <div class="problem-card problem-card--light">
              <div class="problem-card__tag">Situación actual</div>
              <div class="problem-card__title">Así se vive hoy en México</div>
              <ul class="problem-card__list">
                <li class="problem-card__item"><span class="problem-item-icon problem-item-icon--x">✕</span>Esperas de 3 a 6 meses para ver a un especialista en el sistema público</li>
                <li class="problem-card__item"><span class="problem-item-icon problem-item-icon--x">✕</span>Historial médico disperso en papel entre hospitales y clínicas</li>
                <li class="problem-card__item"><span class="problem-item-icon problem-item-icon--x">✕</span>Estudios repetidos porque no hay acceso al historial previo</li>
                <li class="problem-card__item"><span class="problem-item-icon problem-item-icon--x">✕</span>Médicos sin herramientas digitales para su agenda y pacientes</li>
                <li class="problem-card__item"><span class="problem-item-icon problem-item-icon--x">✕</span>Enfermedades que escalan de leves a graves durante la espera</li>
              </ul>
            </div>
            <div class="problem-card problem-card--dark">
              <div class="problem-card__tag">Con MediLink</div>
              <div class="problem-card__title">Lo que hacemos posible</div>
              <ul class="problem-card__list">
                <li class="problem-card__item"><span class="problem-item-icon problem-item-icon--check">✓</span>Cita con el especialista correcto en horas, no meses, según tus síntomas</li>
                <li class="problem-card__item"><span class="problem-item-icon problem-item-icon--check">✓</span>Expediente digital centralizado: estudios, diagnósticos, recetas y alergias</li>
                <li class="problem-card__item"><span class="problem-item-icon problem-item-icon--check">✓</span>IA que orienta hacia el especialista adecuado — nunca diagnostica</li>
                <li class="problem-card__item"><span class="problem-item-icon problem-item-icon--check">✓</span>Agenda inteligente para médicos con recordatorios y confirmaciones</li>
                <li class="problem-card__item"><span class="problem-item-icon problem-item-icon--check">✓</span>Infraestructura lista para IMSS, ISSSTE y estándares HL7/FHIR</li>
              </ul>
            </div>
          </div>

          <div class="problem-dark-strip">
            <h2 class="problem-dark-strip__h2">La salud no puede esperar <span class="accent">6 meses</span>.</h2>
            <div class="problem-dark-strip__row">
              <div class="pds-av" style="background:#157A62">NR</div>
              <div class="pds-av" style="background:#2B6CB0">CM</div>
              <div class="pds-av" style="background:#6B4C3B">AO</div>
              <div class="pds-av" style="background:#276749">PG</div>
              <div class="pds-av" style="background:#553c9a">LH</div>
              <span class="pds-text">+240 profesionales ya en la plataforma</span>
            </div>
          </div>
        </div>
      </section>

      <!-- OBJETIVO -->
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

      <!-- CTA FINAL -->
      <section class="cta-section">
        <h2>¿Listo para empezar?</h2>
        <p>Únete a MediLink hoy y moderniza la gestión de salud para ti y tus pacientes.</p>
        <div style="display:flex;gap:.875rem;justify-content:center;flex-wrap:wrap;margin-top:2rem">
          <button class="ln-btn-primary" style="font-size:1rem;padding:.875rem 2rem" onclick="Router.navigate('/register')">Soy paciente &nbsp;→</button>
          <button class="ln-btn-outline" style="font-size:1rem;padding:.875rem 2rem;border-color:rgba(255,255,255,0.5);color:white" onclick="Router.navigate('/register')">Soy médico</button>
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
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.75rem;gap:1rem;flex-wrap:wrap">
        <div>
          <h2 class="page-title">Bienvenido, ${escHtml(me.first_name)}</h2>
          <p class="page-subtitle">Tu resumen de salud actualizado</p>
        </div>
        <button class="btn btn-primary" onclick="Router.navigate('/patient/record')">${iconFile()} Ver expediente</button>
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
    window._myPatientId = data.patientId;

    // Build timeline from all events sorted by date
    const timeline = [];
    consultations.forEach(c => timeline.push({ type:'consulta', date: c.date, data: c }));
    studies.forEach(s => timeline.push({ type: s.type==='Laboratorio'?'laboratorio': s.type==='Imagenología'?'imagen':'laboratorio', date: s.date, data: s }));
    timeline.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));

    const lastConsult = consultations[0];
    const activeM = medications.filter(m => m.active);

    // Build age if DOB exists
    let age = '';
    if (record.date_of_birth) {
      const dob = new Date(record.date_of_birth);
      const now = new Date();
      age = Math.floor((now - dob) / (1000*60*60*24*365.25)) + ' años';
    }

    const timelineIcons = {
      consulta:    { icon:'🩺', bg:'#dbeafe' },
      laboratorio: { icon:'🔬', bg:'#e9d8fd' },
      imagen:      { icon:'🏥', bg:'#fef3c7' },
      receta:      { icon:'💊', bg:'#dcfce7' },
      diagnostico: { icon:'📋', bg:'#fce7f3' },
    };

    function renderTimeline(items) {
      if (!items.length) return `<div class="empty-state"><div class="empty-state__icon">📅</div><div class="empty-state__title">Sin eventos registrados</div></div>`;
      return items.map((ev, idx) => {
        const ico = timelineIcons[ev.type] || timelineIcons.consulta;
        let title='', desc='', badge='';
        if (ev.type==='consulta') {
          title = ev.data.reason;
          desc = `Dr. ${escHtml(ev.data.doctor_first_name||'')} ${escHtml(ev.data.doctor_last_name||'')}${ev.data.specialty?` · ${escHtml(ev.data.specialty)}`:''}${ev.data.diagnosis?`. ${escHtml(ev.data.diagnosis)}`:''}.`;
          badge = `<span class="pr-event__badge pr-event__badge--consulta">Consulta</span>`;
        } else {
          title = ev.data.name;
          desc = statusBadge(ev.data.status)+(ev.data.result?` · ${escHtml(ev.data.result)}`:'');
          badge = `<span class="pr-event__badge pr-event__badge--${ev.type}">${ev.type==='imagen'?'Imagenología':ev.type==='laboratorio'?'Laboratorio':ev.type}</span>`;
        }
        return `
          <div class="pr-event">
            <div class="pr-event__icon-col">
              <div class="pr-event__icon" style="background:${ico.bg}">${ico.icon}</div>
              ${idx < items.length-1 ? '<div class="pr-event__line"></div>' : ''}
            </div>
            <div class="pr-event__content">
              <div class="pr-event__meta">
                <span class="pr-event__date">${formatDate(ev.date)}</span>
                ${badge}
              </div>
              <div class="pr-event__title">${escHtml(title)}</div>
              <div class="pr-event__desc">${desc}</div>
            </div>
          </div>`;
      }).join('');
    }

    setContent(renderShell('/patient/record', 'patient', me, `

      <!-- Patient record header -->
      <div class="pr-header">
        <div class="pr-avatar">${initials(record.first_name, record.last_name)}</div>
        <div class="pr-info">
          <div class="pr-name-row">
            <span class="pr-name">${escHtml(record.first_name)} ${escHtml(record.last_name)}</span>
            <span class="pr-badge">Expediente #${escHtml(record.record_number)}</span>
          </div>
          <div class="pr-meta">
            ${age ? `${age} · ` : ''}${record.gender==='F'?'Femenino':'Masculino'} &nbsp;
            ${record.blood_type ? `Tipo de sangre <strong>${escHtml(record.blood_type)}</strong>` : ''}
            ${record.curp ? ` &nbsp; CURP ${escHtml(record.curp.slice(0,8))}…` : ''}
            <span style="margin-left:1rem;color:var(--color-text-4)">Última actualización: ${formatDate(record.updated_at||record.created_at)}</span>
          </div>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;align-items:center">
          <button class="btn btn-secondary btn-sm" onclick="openMyAdd('allergy')">${iconPlus()} Alergia</button>
          <button class="btn btn-secondary btn-sm" onclick="openMyAdd('condition')">${iconPlus()} Condición</button>
          <button class="btn btn-secondary btn-sm" onclick="openMyAdd('medication')">${iconPlus()} Medicamento</button>
          <button class="btn btn-secondary btn-sm" onclick="openMyAdd('study')">${iconPlus()} Estudio</button>
          <button class="pr-export-btn" onclick="Toast.info('Función de exportar próximamente')">${iconDownload()} Exportar PDF</button>
        </div>
      </div>

      <!-- Two-column body -->
      <div class="pr-body">

        <!-- LEFT: vitals + allergies + meds -->
        <div class="pr-left">
          ${lastConsult && (lastConsult.blood_pressure||lastConsult.heart_rate||lastConsult.temperature||lastConsult.weight) ? `
          <div class="pr-vitals">
            <div class="pr-vitals__header">
              <span class="pr-vitals__title">Signos vitales</span>
              <span class="pr-vitals__date">${formatDate(lastConsult.date)}</span>
            </div>
            <div class="pr-vitals-grid">
              ${lastConsult.blood_pressure ? `<div class="pr-vital"><div class="pr-vital__label">Presión arterial</div><div class="pr-vital__val">${escHtml(lastConsult.blood_pressure)}<span class="pr-vital__unit">mmHg</span></div><div class="pr-vital__tag pr-vital__tag--warn">↑ Vigilar</div></div>` : ''}
              ${lastConsult.heart_rate ? `<div class="pr-vital"><div class="pr-vital__label">Frecuencia cardíaca</div><div class="pr-vital__val">${lastConsult.heart_rate}<span class="pr-vital__unit">lpm</span></div><div class="pr-vital__tag pr-vital__tag--ok">Normal</div></div>` : ''}
              ${lastConsult.temperature ? `<div class="pr-vital"><div class="pr-vital__label">Temperatura</div><div class="pr-vital__val">${lastConsult.temperature}<span class="pr-vital__unit">°C</span></div><div class="pr-vital__tag pr-vital__tag--ok">Normal</div></div>` : ''}
              ${lastConsult.weight ? `<div class="pr-vital"><div class="pr-vital__label">Peso</div><div class="pr-vital__val">${lastConsult.weight}<span class="pr-vital__unit">kg</span></div>${lastConsult.height?`<div class="pr-vital__tag">IMC ${(lastConsult.weight/((lastConsult.height/100)**2)).toFixed(1)}</div>`:''}</div>` : ''}
            </div>
          </div>` : ''}

          ${allergies.length ? `
          <div class="pr-allergies">
            <div class="pr-allergies__header">
              <span class="pr-allergies__icon">⚠️</span>
              <span class="pr-allergies__title">Alergias</span>
            </div>
            <div class="pr-allergy-tags">
              ${allergies.map(a => `<span class="pr-allergy-tag">${escHtml(a.allergen)}</span>`).join('')}
            </div>
          </div>` : ''}

          ${activeM.length ? `
          <div class="pr-meds">
            <div class="pr-meds__title">Medicamentos actuales</div>
            ${activeM.map(m => `
            <div class="pr-med-item">
              <div class="pr-med-dot"></div>
              <div>
                <div class="pr-med-name">${escHtml(m.name)} ${escHtml(m.dosage)}</div>
                <div class="pr-med-sub">${escHtml(m.frequency)}</div>
              </div>
            </div>`).join('')}
          </div>` : `
          <div class="pr-meds">
            <div class="pr-meds__title">Medicamentos actuales</div>
            <div style="font-size:.8125rem;color:var(--color-text-4);padding:.5rem 0">Sin medicamentos activos registrados</div>
          </div>`}
        </div>

        <!-- RIGHT: clinical timeline -->
        <div class="pr-right">
          <div class="pr-timeline">
            <div class="pr-timeline__header">
              <div class="pr-timeline__title">Línea del tiempo clínica</div>
              <div class="pr-timeline__filters">
                <button class="pr-filter active" onclick="filterTimeline(this,'todos')">Todos</button>
                <button class="pr-filter" onclick="filterTimeline(this,'consulta')">Consultas</button>
                <button class="pr-filter" onclick="filterTimeline(this,'laboratorio')">Estudios</button>
                <button class="pr-filter" onclick="filterTimeline(this,'receta')">Recetas</button>
              </div>
            </div>
            <div class="pr-timeline__body" id="pr-timeline-body">
              ${renderTimeline(timeline)}
            </div>
          </div>
        </div>
      </div>`));

    window._prTimeline = timeline;
    window.filterTimeline = function(btn, type) {
      document.querySelectorAll('.pr-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filtered = type==='todos' ? window._prTimeline : window._prTimeline.filter(e => e.type===type||e.type.startsWith(type));
      document.getElementById('pr-timeline-body').innerHTML = renderTimeline(filtered);
    };
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
          insuranceProvider:      document.getElementById('pf-ins-p').value || null,
          insuranceNumber:        document.getElementById('pf-ins-n').value || null,
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
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.75rem;gap:1rem;flex-wrap:wrap">
        <div>
          <h2 class="page-title">Dashboard</h2>
          <p class="page-subtitle">${new Date().toLocaleDateString('es-MX',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</p>
        </div>
        <button class="ln-btn-primary" style="font-size:.875rem;padding:.5625rem 1.25rem" onclick="Router.navigate('/doctor/patients')">${iconPlus()}&nbsp; Nueva cita</button>
      </div>

      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:1.5rem">
        <div class="stat-card">
          <div class="stat-card__label">Pacientes este mes</div>
          <div class="stat-card__value">${stats.totalPatients}</div>
          <div class="stat-card__delta">Total registrados</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Mis consultas</div>
          <div class="stat-card__value">${stats.totalConsultations}</div>
          <div class="stat-card__delta">Registradas en total</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Consultas hoy</div>
          <div class="stat-card__value">${stats.todayConsultations}</div>
          <div class="stat-card__delta">${new Date().toLocaleDateString('es-MX',{weekday:'long'})}</div>
        </div>
        <div class="stat-card stat-card--dark">
          <div class="stat-card__label">Ocupación de agenda</div>
          <div class="stat-card__value">${stats.todayConsultations > 0 ? Math.min(100, stats.todayConsultations * 12) + '%' : '—'}</div>
          <div class="stat-progress"><div class="stat-progress__bar" style="width:${Math.min(100, stats.todayConsultations * 12)}%"></div></div>
        </div>
      </div>

      <div class="dr-dash-grid">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Consultas recientes · ${new Date().toLocaleDateString('es-MX',{day:'numeric',month:'short'})}</span>
            <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/doctor/patients')">Ver pacientes →</button>
          </div>
          ${stats.recentConsultations.length > 0 ? `
          <div style="padding:0 1.5rem">
            ${stats.recentConsultations.slice(0,5).map(c => `
            <div class="appt-item">
              <div class="appt-info" style="flex:1">
                <div class="appt-name">${escHtml(c.first_name)} ${escHtml(c.last_name)}</div>
                <div class="appt-sub">${escHtml(c.reason)}</div>
              </div>
              <span class="badge badge-green" style="flex-shrink:0">${formatDate(c.date)}</span>
              <button class="btn btn-ghost btn-sm" onclick="Router.navigate('/doctor/patient/${c.patient_id}')" style="flex-shrink:0">Ver</button>
            </div>`).join('')}
          </div>` : `
          <div class="card-body">
            <div class="empty-state">
              <div class="empty-state__icon">📋</div>
              <div class="empty-state__title">Sin consultas aún</div>
              <div class="empty-state__text">Cuando registres una consulta aparecerá aquí.</div>
            </div>
          </div>`}
        </div>

        <div>
          <div class="card" style="margin-bottom:1rem">
            <div class="card-header"><span class="card-title">Motivos más frecuentes</span></div>
            <div class="card-body">
              <div class="motive-item">
                <div class="motive-label"><span class="motive-name">Consulta general</span><span class="motive-pct">42%</span></div>
                <div class="motive-bar-bg"><div class="motive-bar" style="width:42%"></div></div>
              </div>
              <div class="motive-item">
                <div class="motive-label"><span class="motive-name">Seguimiento</span><span class="motive-pct">31%</span></div>
                <div class="motive-bar-bg"><div class="motive-bar" style="width:31%"></div></div>
              </div>
              <div class="motive-item" style="margin-bottom:0">
                <div class="motive-label"><span class="motive-name">Primera valoración</span><span class="motive-pct">27%</span></div>
                <div class="motive-bar-bg"><div class="motive-bar" style="width:27%"></div></div>
              </div>
            </div>
          </div>
          <div class="stat-card stat-card--dark" style="padding:1.5rem">
            <div class="stat-card__label">Pacientes recurrentes</div>
            <div class="stat-card__value" style="font-size:2.5rem;line-height:1;margin:0.5rem 0">64%</div>
            <div class="stat-card__sub">de tus pacientes regresan para seguimiento</div>
          </div>
        </div>
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
// PAGES — PATIENT EXTRA (Search / Citas / Favoritos)
// ============================================================
async function renderPatientSearch() {
  Loading.show();
  try {
    const [me, doctors] = await Promise.all([API.get('/auth/me'), API.get('/doctors')]);
    State.setUser(me);
    window._myInsurer = (me.profile && me.profile.insurance_provider) || '';
    window._insurerOnly = false;

    setContent(renderShell('/patient/search', 'patient', me, `
      <div class="page-header">
        <h2 class="page-title">Buscar médico</h2>
        <p class="page-subtitle">Describe tus síntomas y deja que la IA te oriente al especialista correcto</p>
      </div>

      <div class="card" style="margin-bottom:1.5rem;border:1px solid var(--color-primary)">
        <div class="card-body">
          <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.625rem">
            <span class="badge badge-blue">✨ Búsqueda inteligente con IA</span>
          </div>
          <textarea class="input" id="ai-symptoms" rows="2" placeholder="Ej. Tengo dolor de cabeza intenso y mareos frecuentes desde hace días…"></textarea>
          <div style="display:flex;gap:.5rem;margin-top:.625rem;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" id="ai-btn" onclick="aiSearch()">✨ Buscar con IA</button>
            <button class="btn btn-ghost btn-sm" onclick="clearAiSearch()">Limpiar</button>
          </div>
          <div id="ai-result" style="margin-top:1rem"></div>
        </div>
      </div>

      <div class="card" style="margin-bottom:1.5rem">
        <div class="card-body" style="display:flex;gap:.75rem;flex-wrap:wrap;align-items:center">
          <div class="search-wrapper" style="flex:1;min-width:220px">
            <span class="search-icon">${iconSearch()}</span>
            <input class="input" type="search" id="doctor-search-q" placeholder="Buscar por nombre o especialidad…" oninput="filterDoctors(this.value)">
          </div>
          ${window._myInsurer ? `<label style="display:flex;align-items:center;gap:.4rem;font-size:.8125rem;white-space:nowrap"><input type="checkbox" onchange="toggleInsurerFilter(this.checked)"> Solo los que aceptan mi seguro (${escHtml(window._myInsurer)})</label>` : `<span class="text-xs text-muted">Agrega tu aseguradora en tu perfil para ver coberturas</span>`}
        </div>
      </div>

      <div id="doctors-list">
        ${renderDoctorCards(doctors)}
      </div>`));

    window._allDoctors = doctors;
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
    Toast.error('Error al cargar médicos: ' + err.message);
  } finally { Loading.hide(); }
}

const AI_SPECIALTIES = ['Medicina General','Pediatría','Cardiología','Dermatología','Ginecología','Neurología','Oftalmología','Ortopedia','Psiquiatría','Radiología','Oncología','Endocrinología','Gastroenterología','Nefrología','Neumología','Reumatología','Urología','Medicina Interna'];

window.aiSearch = async function () {
  const q = document.getElementById('ai-symptoms').value.trim();
  if (!q) { Toast.warning('Describe tus síntomas primero'); return; }
  const btn = document.getElementById('ai-btn'); btn.disabled = true; btn.innerHTML = `<span class="inline-spinner"></span> Analizando…`;
  const res = document.getElementById('ai-result'); res.innerHTML = '';
  try {
    const data = await API.post('/ai/triage', { symptoms: q });
    if (!data || !data.specialty) { res.innerHTML = `<div class="alert alert-warning">No pude interpretar los síntomas. Intenta describirlos de otra forma.</div>`; return; }
    const matches = (window._allDoctors || []).filter(d => d.specialty === data.specialty);
    const urgcls = { alta: 'badge-red', media: 'badge-yellow', baja: 'badge-green' }[data.urgency] || 'badge-gray';
    res.innerHTML = `
      <div style="border:1px solid var(--color-primary);border-radius:12px;padding:1rem;background:rgba(21,122,98,.05)">
        <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.5rem;flex-wrap:wrap">
          <span class="badge badge-blue">IA · Orientación</span>
          <span class="badge ${urgcls}">Urgencia ${escHtml(data.urgency || '—')}</span>
        </div>
        <div style="font-weight:600;margin-bottom:.25rem">Especialidad sugerida: ${escHtml(data.specialty)}</div>
        <div class="text-sm text-muted">${escHtml(data.reason || '')}</div>
        <div class="text-xs text-muted" style="margin-top:.5rem">⚠️ La IA solo orienta hacia un especialista; no realiza diagnósticos. Ante una urgencia llama al 911.</div>
      </div>`;
    document.getElementById('doctors-list').innerHTML = matches.length
      ? `<div class="text-sm text-muted" style="margin-bottom:.75rem">${matches.length} especialista${matches.length !== 1 ? 's' : ''} en ${escHtml(data.specialty)}</div>` + renderDoctorCards(matches)
      : `<div class="empty-state"><div class="empty-state__icon">🔎</div><div class="empty-state__title">No hay médicos de ${escHtml(data.specialty)} disponibles</div><div class="empty-state__text">Muestra todos los médicos con "Limpiar".</div></div>`;
  } catch (err) {
    res.innerHTML = `<div class="alert alert-error">No se pudo procesar la búsqueda: ${escHtml(err.message || String(err))}</div>`;
  } finally { btn.disabled = false; btn.innerHTML = '✨ Buscar con IA'; }
};
window.clearAiSearch = function () {
  const s = document.getElementById('ai-symptoms'); if (s) s.value = '';
  const r = document.getElementById('ai-result'); if (r) r.innerHTML = '';
  document.getElementById('doctors-list').innerHTML = renderDoctorCards(window._allDoctors || []);
};
window.toggleInsurerFilter = function (on) { window._insurerOnly = on; filterDoctors((document.getElementById('doctor-search-q') || {}).value || ''); };

function renderDoctorCards(doctors) {
  if (!doctors.length) return `
    <div class="empty-state">
      <div class="empty-state__icon">🩺</div>
      <div class="empty-state__title">No se encontraron médicos</div>
      <div class="empty-state__text">Intenta con otro término de búsqueda.</div>
    </div>`;

  return `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">
    ${doctors.map(d => `
    <div class="card" style="padding:1.5rem;display:flex;flex-direction:column;gap:.75rem">
      <div style="display:flex;align-items:center;gap:.75rem">
        <div class="dr-user-av" style="width:48px;height:48px;font-size:1.125rem;flex-shrink:0">${initials(d.first_name, d.last_name)}</div>
        <div>
          <div style="font-weight:600;font-size:.9375rem">Dr. ${escHtml(d.first_name)} ${escHtml(d.last_name)}</div>
          <div class="text-sm text-muted">${escHtml(d.specialty)}</div>
        </div>
      </div>
      ${d.hospital ? `<div class="text-sm text-muted" style="display:flex;align-items:center;gap:.375rem">🏥 ${escHtml(d.hospital)}</div>` : ''}
      ${d.phone    ? `<div class="text-sm text-muted" style="display:flex;align-items:center;gap:.375rem">📞 ${escHtml(d.phone)}</div>` : ''}
      <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">
        <span class="badge badge-blue">${escHtml(d.specialty)}</span>
        ${d.rating ? `<span class="ml-stars" title="${d.rating} de 5">${starDisplay(d.rating)}<span class="text-xs text-muted" style="margin-left:.25rem">${d.rating} (${d.review_count})</span></span>` : `<span class="text-xs text-muted">Sin reseñas</span>`}
      </div>
      <div style="display:flex;align-items:center;gap:.375rem;flex-wrap:wrap">
        ${(d.accepted_insurers && d.accepted_insurers.length) ? `<span class="text-xs text-muted">Seguros: ${d.accepted_insurers.map(escHtml).join(', ')}</span>` : `<span class="text-xs text-muted">Sin convenios de seguro</span>`}
      </div>
      ${(window._myInsurer && (d.accepted_insurers || []).includes(window._myInsurer)) ? `
      <div style="display:flex;align-items:flex-end;justify-content:space-between;gap:.5rem;margin-top:.25rem">
        <div>
          <div style="font-weight:700;font-size:1.0625rem">$${Math.round((d.consultation_price || 0) * 0.2).toLocaleString('es-MX')}<span class="text-xs text-muted" style="font-weight:400"> tu copago</span></div>
          <div class="text-xs" style="text-decoration:line-through;color:var(--color-text-4)">$${(d.consultation_price || 0).toLocaleString('es-MX')}</div>
        </div>
        <span class="badge badge-green">✓ Cubre ${escHtml(window._myInsurer)}</span>
      </div>` : `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem;margin-top:.25rem">
        <div style="font-weight:700;font-size:1.0625rem">$${(d.consultation_price || 0).toLocaleString('es-MX')}<span class="text-xs text-muted" style="font-weight:400"> /consulta</span></div>
      </div>`}
      <button class="btn btn-primary btn-sm" style="margin-top:.25rem" onclick="openBookingModal(${d.id})">${iconCalendar()} Agendar cita</button>
    </div>`).join('')}
  </div>`;
}

window.filterDoctors = function(q) {
  const all = window._allDoctors || [];
  const lq = q.toLowerCase();
  let filtered = lq ? all.filter(d =>
    `${d.first_name} ${d.last_name}`.toLowerCase().includes(lq) ||
    (d.specialty||'').toLowerCase().includes(lq) ||
    (d.hospital||'').toLowerCase().includes(lq)
  ) : all;
  if (window._insurerOnly && window._myInsurer) filtered = filtered.filter(d => (d.accepted_insurers||[]).includes(window._myInsurer));
  document.getElementById('doctors-list').innerHTML = renderDoctorCards(filtered);
};

const APPT_STATUS = {
  pending:   { label: 'Pendiente',  cls: 'badge-yellow' },
  confirmed: { label: 'Confirmada', cls: 'badge-blue' },
  completed: { label: 'Completada', cls: 'badge-green' },
  cancelled: { label: 'Cancelada',  cls: 'badge-gray' },
  rejected:  { label: 'Rechazada',  cls: 'badge-red' },
};

async function renderPatientCitas() {
  Loading.show();
  try {
    const [me, appts] = await Promise.all([API.get('/auth/me'), API.get('/appointments')]);
    State.setUser(me);
    const now = Date.now();
    const upcoming = appts.filter(a => ['pending','confirmed'].includes(a.status) && new Date(a.datetime) >= now - 36e5);
    const past = appts.filter(a => !upcoming.includes(a)).sort((a,b) => new Date(b.datetime) - new Date(a.datetime));

    const apptCard = (a) => {
      const st = APPT_STATUS[a.status] || APPT_STATUS.pending;
      const soon = new Date(a.datetime) - now < 864e5 && new Date(a.datetime) > now;
      return `
      <div class="card" style="padding:1.25rem;border:1px solid var(--color-border)">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap">
          <div style="display:flex;gap:.75rem;align-items:center">
            <div class="dr-user-av" style="width:44px;height:44px;font-size:1rem;flex-shrink:0">${initials(a.doctor_first_name, a.doctor_last_name)}</div>
            <div>
              <div style="font-weight:600">Dr. ${escHtml(a.doctor_first_name)} ${escHtml(a.doctor_last_name)}</div>
              <div class="text-sm text-muted">${escHtml(a.specialty||'')}${a.hospital?` · ${escHtml(a.hospital)}`:''}</div>
              <div class="text-sm" style="margin-top:.25rem">📅 ${formatDateTime(a.datetime)}${soon?` <span class="badge badge-yellow" style="margin-left:.25rem">Pronto</span>`:''}</div>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0">
            <span class="badge ${st.cls}">${st.label}</span>
            <div class="text-sm font-semibold" style="margin-top:.375rem">$${(a.price||0).toLocaleString('es-MX')}</div>
            <div class="text-xs ${a.paid ? '' : 'text-muted'}" style="color:${a.paid ? 'var(--color-success,#16a34a)' : ''}">${a.paid ? '✓ Pagada' : 'Sin pagar'}</div>
            ${a.insurer ? `<div class="text-xs" style="color:#16a34a">🛡️ ${escHtml(a.insurer)} cubrió $${(a.covered || 0).toLocaleString('es-MX')}</div>` : ''}
          </div>
        </div>
        <div class="text-sm text-muted" style="margin-top:.5rem"><strong>Motivo:</strong> ${escHtml(a.reason||'—')}</div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.75rem;padding-top:.75rem;border-top:1px solid var(--color-border)">
          ${!a.paid && ['pending','confirmed'].includes(a.status) ? `<button class="btn btn-primary btn-sm" onclick="openPayModal(${a.id},${a.price||0})">💳 Pagar consulta</button>` : ''}
          ${['pending','confirmed'].includes(a.status) ? `<button class="btn btn-secondary btn-sm" onclick="cancelAppointment(${a.id})">Cancelar</button>` : ''}
          ${a.status==='completed' && !a.hasReview ? `<button class="btn btn-primary btn-sm" onclick="openReviewModal(${a.id},'${escHtml(a.doctor_first_name)} ${escHtml(a.doctor_last_name)}')">⭐ Calificar médico</button>` : ''}
          ${a.status==='completed' && a.hasReview ? `<span class="text-sm text-muted">✓ Ya calificaste esta consulta</span>` : ''}
        </div>
      </div>`;
    };

    setContent(renderShell('/patient/citas', 'patient', me, `
      <div class="page-header flex justify-between items-center" style="flex-wrap:wrap;gap:1rem">
        <div>
          <h2 class="page-title">Mis citas</h2>
          <p class="page-subtitle">${upcoming.length} próxima${upcoming.length!==1?'s':''} · ${past.length} en historial</p>
        </div>
        <button class="btn btn-primary btn-sm" onclick="Router.navigate('/patient/search')">${iconPlus()} Agendar nueva cita</button>
      </div>

      <div style="margin-bottom:.75rem"><span class="card-title">Próximas citas</span></div>
      ${upcoming.length ? `<div style="display:flex;flex-direction:column;gap:.75rem;margin-bottom:2rem">${upcoming.map(apptCard).join('')}</div>` : `
        <div class="empty-state" style="margin-bottom:2rem">
          <div class="empty-state__icon">📅</div>
          <div class="empty-state__title">No tienes citas próximas</div>
          <div class="empty-state__text">Busca un médico y agenda tu consulta.</div>
          <button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="Router.navigate('/patient/search')">Buscar un médico</button>
        </div>`}

      ${past.length ? `<div style="margin-bottom:.75rem"><span class="card-title">Historial</span></div>
      <div style="display:flex;flex-direction:column;gap:.75rem">${past.map(apptCard).join('')}</div>` : ''}
    `));
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
    Toast.error('Error al cargar citas: ' + err.message);
  } finally { Loading.hide(); }
}

async function renderPatientFavoritos() {
  Loading.show();
  try {
    const me = await API.get('/auth/me');
    State.setUser(me);

    setContent(renderShell('/patient/favoritos', 'patient', me, `
      <div class="page-header">
        <h2 class="page-title">Favoritos</h2>
        <p class="page-subtitle">Tus médicos y servicios guardados</p>
      </div>
      <div class="empty-state" style="margin-top:3rem">
        <div class="empty-state__icon">⭐</div>
        <div class="empty-state__title">Aún no tienes favoritos</div>
        <div class="empty-state__text">Guarda médicos de tu confianza para acceder rápidamente.</div>
        <button class="btn btn-primary btn-sm" style="margin-top:1rem" onclick="Router.navigate('/patient/search')">Buscar médicos</button>
      </div>`));
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
  } finally { Loading.hide(); }
}

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
// NUEVO — Estrellas, agendar, pagar, calificar, agenda, ganancias
// ============================================================
function starDisplay(rating) {
  const full = Math.round(rating || 0);
  let s = '';
  for (let i = 1; i <= 5; i++) s += `<span style="color:${i <= full ? '#f59e0b' : '#d1d5db'}">★</span>`;
  return `<span style="letter-spacing:1px">${s}</span>`;
}

// Modal genérico de formulario -----------------------------------------------
function simpleFormModal(title, fields, onSubmit, submitLabel = 'Guardar') {
  const body = fields.map(f => {
    if (f.type === 'select') return `<div class="form-group"><label class="label ${f.required ? 'label-required' : ''}">${f.label}</label><select class="select" id="sf-${f.id}">${f.options.map(o => `<option value="${o.v}"${o.v === (f.value || '') ? ' selected' : ''}>${o.t}</option>`).join('')}</select></div>`;
    if (f.type === 'textarea') return `<div class="form-group"><label class="label ${f.required ? 'label-required' : ''}">${f.label}</label><textarea class="input" id="sf-${f.id}" rows="2" placeholder="${f.placeholder || ''}">${f.value || ''}</textarea></div>`;
    return `<div class="form-group"><label class="label ${f.required ? 'label-required' : ''}">${f.label}</label><input class="input" id="sf-${f.id}" type="${f.type || 'text'}" value="${f.value || ''}" placeholder="${f.placeholder || ''}"></div>`;
  }).join('');
  Modal.open(Modal.html(title, `<div id="sf-alert"></div>${body}`, `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button><button class="btn btn-primary" id="sf-submit">${submitLabel}</button>`));
  document.getElementById('sf-submit').addEventListener('click', async () => {
    const v = {}; fields.forEach(f => { const el = document.getElementById('sf-' + f.id); v[f.id] = typeof el.value === 'string' ? el.value.trim() : el.value; });
    const missing = fields.find(f => f.required && !v[f.id]);
    if (missing) { document.getElementById('sf-alert').innerHTML = `<div class="alert alert-error">Completa: ${missing.label.replace(' *', '')}</div>`; return; }
    const btn = document.getElementById('sf-submit'); btn.disabled = true; btn.innerHTML = `<span class="inline-spinner"></span> Guardando…`;
    try { await onSubmit(v); Modal.close(); } catch (err) { document.getElementById('sf-alert').innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`; btn.disabled = false; btn.textContent = submitLabel; }
  });
}

// Paciente edita su propio expediente ----------------------------------------
window.openMyAdd = function (kind) {
  const pid = window._myPatientId;
  const refresh = () => renderPatientRecord();
  if (kind === 'allergy') return simpleFormModal('Agregar alergia', [
    { id: 'allergen', label: 'Alérgeno *', required: true, placeholder: 'Ej. Penicilina' },
    { id: 'reaction', label: 'Reacción', placeholder: 'Ej. Urticaria' },
    { id: 'severity', label: 'Severidad', type: 'select', options: [{ v: '', t: 'Seleccionar…' }, { v: 'mild', t: 'Leve' }, { v: 'moderate', t: 'Moderada' }, { v: 'severe', t: 'Grave' }] },
  ], async v => { await API.post('/allergies', { patientId: pid, allergen: v.allergen, reaction: v.reaction, severity: v.severity }); Toast.success('Alergia registrada'); refresh(); });
  if (kind === 'condition') return simpleFormModal('Agregar condición', [
    { id: 'conditionName', label: 'Condición *', required: true, placeholder: 'Ej. Asma' },
    { id: 'diagnosedDate', label: 'Fecha de diagnóstico', type: 'date' },
    { id: 'status', label: 'Estado', type: 'select', options: [{ v: 'active', t: 'Activo' }, { v: 'managed', t: 'Controlado' }, { v: 'resolved', t: 'Resuelto' }] },
    { id: 'treatment', label: 'Tratamiento', placeholder: 'Ej. Inhalador' },
  ], async v => { await API.post('/conditions', { patientId: pid, conditionName: v.conditionName, diagnosedDate: v.diagnosedDate, status: v.status, treatment: v.treatment }); Toast.success('Condición registrada'); refresh(); });
  if (kind === 'medication') return simpleFormModal('Agregar medicamento', [
    { id: 'name', label: 'Medicamento *', required: true },
    { id: 'dosage', label: 'Dosis *', required: true, placeholder: 'Ej. 50 mg' },
    { id: 'frequency', label: 'Frecuencia *', required: true, placeholder: 'Ej. Cada 24 h' },
    { id: 'startDate', label: 'Inicio', type: 'date' },
  ], async v => { await API.post('/medications', { patientId: pid, name: v.name, dosage: v.dosage, frequency: v.frequency, startDate: v.startDate }); Toast.success('Medicamento registrado'); refresh(); });
  if (kind === 'study') return simpleFormModal('Registrar estudio', [
    { id: 'type', label: 'Tipo *', type: 'select', required: true, options: [{ v: 'Laboratorio', t: 'Laboratorio' }, { v: 'Imagenología', t: 'Imagenología' }, { v: 'Otro', t: 'Otro' }] },
    { id: 'name', label: 'Nombre del estudio *', required: true, placeholder: 'Ej. Biometría hemática' },
    { id: 'date', label: 'Fecha', type: 'date' },
    { id: 'result', label: 'Resultado', type: 'textarea' },
  ], async v => { await API.post('/studies', { patientId: pid, type: v.type, name: v.name, date: v.date, result: v.result, status: v.result ? 'completed' : 'pending' }); Toast.success('Estudio registrado'); refresh(); });
};

// Agendar cita ---------------------------------------------------------------
window.openBookingModal = async function (doctorId) {
  Loading.show();
  try {
    const d = await API.get('/doctors/' + doctorId);
    Loading.hide();
    window._booking = { doctorId, days: d.slots, selected: null };
    const daysHtml = d.slots.length
      ? d.slots.map((day, i) => `<button type="button" class="bk-day" data-i="${i}" onclick="bkPickDay(${i})" style="padding:.5rem .75rem;border:1px solid var(--color-border);border-radius:8px;background:#fff;cursor:pointer;font-size:.8125rem;white-space:nowrap">${new Date(day.date).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}</button>`).join('')
      : `<div class="text-sm text-muted">Este médico no tiene horarios disponibles configurados.</div>`;
    const revs = (d.reviews || []).slice(0, 2);
    Modal.open(Modal.html(`Agendar con Dr. ${escHtml(d.first_name)} ${escHtml(d.last_name)}`, `
      <div id="bk-alert"></div>
      <div style="display:flex;gap:.75rem;align-items:center;margin-bottom:1rem;padding-bottom:1rem;border-bottom:1px solid var(--color-border)">
        <div class="dr-user-av" style="width:48px;height:48px;font-size:1.125rem">${initials(d.first_name, d.last_name)}</div>
        <div style="flex:1">
          <div style="font-weight:600">Dr. ${escHtml(d.first_name)} ${escHtml(d.last_name)}</div>
          <div class="text-sm text-muted">${escHtml(d.specialty)}${d.hospital ? ` · ${escHtml(d.hospital)}` : ''}</div>
          <div style="margin-top:.25rem">${d.rating ? `${starDisplay(d.rating)} <span class="text-xs text-muted">${d.rating} (${d.review_count})</span>` : '<span class="text-xs text-muted">Sin reseñas</span>'}</div>
        </div>
        <div style="text-align:right">
          ${(window._myInsurer && (d.accepted_insurers || []).includes(window._myInsurer)) ? `
            <div style="font-weight:700;font-size:1.25rem">$${Math.round((d.consultation_price || 0) * 0.2).toLocaleString('es-MX')}</div>
            <div class="text-xs" style="text-decoration:line-through;color:var(--color-text-4)">$${(d.consultation_price || 0).toLocaleString('es-MX')}</div>
            <div class="text-xs" style="color:#16a34a">✓ ${escHtml(window._myInsurer)} cubre 80%</div>
          ` : `
            <div style="font-weight:700;font-size:1.25rem">$${(d.consultation_price || 0).toLocaleString('es-MX')}</div>
            <div class="text-xs text-muted">por consulta</div>
          `}
        </div>
      </div>
      ${revs.length ? `<div style="margin-bottom:1rem">${revs.map(r => `<div class="text-sm" style="margin-bottom:.375rem">${starDisplay(r.rating)} <span class="text-muted">"${escHtml(r.comment || '')}" — ${escHtml(r.patient_first_name || 'Paciente')}</span></div>`).join('')}</div>` : ''}
      <label class="label">Elige un día</label>
      <div style="display:flex;gap:.5rem;overflow-x:auto;padding-bottom:.5rem;margin-bottom:1rem">${daysHtml}</div>
      <div id="bk-slots" style="margin-bottom:1rem"></div>
      <div class="form-group"><label class="label">Motivo de la consulta</label><textarea class="input" id="bk-reason" rows="2" placeholder="Describe brevemente el motivo"></textarea></div>
    `, `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button><button class="btn btn-primary" id="bk-submit" disabled onclick="bkSubmit()">Solicitar cita</button>`), { size: 'lg' });
    if (d.slots.length) bkPickDay(0);
  } catch (err) { Loading.hide(); Toast.error(err.message); }
};
window.bkPickDay = function (i) {
  document.querySelectorAll('.bk-day').forEach(b => { b.style.background = '#fff'; b.style.color = ''; b.style.borderColor = 'var(--color-border)'; });
  const active = document.querySelector(`.bk-day[data-i="${i}"]`);
  if (active) { active.style.background = 'var(--color-primary)'; active.style.color = '#fff'; active.style.borderColor = 'var(--color-primary)'; }
  const day = window._booking.days[i];
  window._booking.selected = null; document.getElementById('bk-submit').disabled = true;
  document.getElementById('bk-slots').innerHTML = `<label class="label">Horarios disponibles</label><div style="display:flex;flex-wrap:wrap;gap:.5rem">${day.slots.map(s => `<button type="button" class="bk-slot" data-iso="${s}" onclick="bkPickSlot('${s}')" style="padding:.4375rem .75rem;border:1px solid var(--color-border);border-radius:8px;background:#fff;cursor:pointer;font-size:.8125rem">${new Date(s).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</button>`).join('')}</div>`;
};
window.bkPickSlot = function (iso) {
  window._booking.selected = iso;
  document.querySelectorAll('.bk-slot').forEach(b => { b.style.background = '#fff'; b.style.color = ''; b.style.borderColor = 'var(--color-border)'; });
  const el = document.querySelector(`.bk-slot[data-iso="${iso}"]`);
  if (el) { el.style.background = 'var(--color-primary)'; el.style.color = '#fff'; el.style.borderColor = 'var(--color-primary)'; }
  document.getElementById('bk-submit').disabled = false;
};
window.bkSubmit = async function () {
  const b = window._booking; if (!b.selected) return;
  const btn = document.getElementById('bk-submit'); btn.disabled = true; btn.innerHTML = `<span class="inline-spinner"></span> Solicitando…`;
  try {
    await API.post('/appointments', { doctorId: b.doctorId, datetime: b.selected, reason: document.getElementById('bk-reason').value.trim() || 'Consulta' });
    Modal.close(); Toast.success('¡Cita solicitada! Revisa "Mis citas" para pagarla.');
    Router.navigate('/patient/citas');
  } catch (err) { document.getElementById('bk-alert').innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`; btn.disabled = false; btn.textContent = 'Solicitar cita'; }
};

// Pagar (simulado) -----------------------------------------------------------
window.openPayModal = function (apptId, price) {
  Modal.open(Modal.html('Pago de consulta', `
    <div id="pay-alert"></div>
    <div style="text-align:center;margin-bottom:1rem"><div class="text-sm text-muted">Total a pagar</div><div style="font-size:2rem;font-weight:800">$${(price || 0).toLocaleString('es-MX')}</div></div>
    <div class="form-group"><label class="label">Número de tarjeta</label><input class="input" id="pay-card" placeholder="4242 4242 4242 4242" value="4242 4242 4242 4242"></div>
    <div class="form-row">
      <div class="form-group"><label class="label">Vencimiento</label><input class="input" id="pay-exp" placeholder="MM/AA" value="12/28"></div>
      <div class="form-group"><label class="label">CVV</label><input class="input" id="pay-cvv" placeholder="123" value="123"></div>
    </div>
    <div class="text-xs text-muted" style="text-align:center">🔒 Pago simulado — no se realiza ningún cargo real.</div>
  `, `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button><button class="btn btn-primary" id="pay-btn" onclick="doPay(${apptId})">Pagar $${(price || 0).toLocaleString('es-MX')}</button>`));
};
window.doPay = async function (apptId) {
  const btn = document.getElementById('pay-btn'); btn.disabled = true; btn.innerHTML = `<span class="inline-spinner"></span> Procesando…`;
  try { await API.post(`/appointments/${apptId}/pay`, {}); Modal.close(); Toast.success('✓ Pago realizado con éxito'); renderPatientCitas(); }
  catch (err) { document.getElementById('pay-alert').innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`; btn.disabled = false; btn.textContent = 'Pagar'; }
};
window.cancelAppointment = async function (apptId) {
  if (!confirm('¿Cancelar esta cita?')) return;
  try { await API.put(`/appointments/${apptId}`, { status: 'cancelled' }); Toast.info('Cita cancelada'); renderPatientCitas(); }
  catch (err) { Toast.error(err.message); }
};

// Calificar médico -----------------------------------------------------------
window.openReviewModal = function (apptId, doctorName) {
  window._review = { rating: 5 };
  Modal.open(Modal.html('Calificar a ' + doctorName, `
    <div id="rv-alert"></div>
    <div style="text-align:center;margin-bottom:1rem">
      <div class="text-sm text-muted" style="margin-bottom:.5rem">Tu calificación</div>
      <div id="rv-stars" style="font-size:2.25rem;letter-spacing:.25rem;cursor:pointer">${[1, 2, 3, 4, 5].map(n => `<span data-n="${n}" onclick="rvSet(${n})" style="color:#f59e0b">★</span>`).join('')}</div>
    </div>
    <div class="form-group"><label class="label">Comentario</label><textarea class="input" id="rv-comment" rows="3" placeholder="¿Cómo fue tu experiencia?"></textarea></div>
  `, `<button class="btn btn-secondary" onclick="Modal.close()">Cancelar</button><button class="btn btn-primary" id="rv-btn" onclick="submitReview(${apptId})">Enviar calificación</button>`));
};
window.rvSet = function (n) {
  window._review.rating = n;
  document.querySelectorAll('#rv-stars span').forEach(s => { s.style.color = +s.dataset.n <= n ? '#f59e0b' : '#d1d5db'; });
};
window.submitReview = async function (apptId) {
  const btn = document.getElementById('rv-btn'); btn.disabled = true; btn.innerHTML = `<span class="inline-spinner"></span> Enviando…`;
  try { await API.post('/reviews', { appointmentId: apptId, rating: window._review.rating, comment: document.getElementById('rv-comment').value.trim() }); Modal.close(); Toast.success('¡Gracias por tu calificación!'); renderPatientCitas(); }
  catch (err) { document.getElementById('rv-alert').innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`; btn.disabled = false; btn.textContent = 'Enviar calificación'; }
};

// Doctor: acciones de citas ---------------------------------------------------
window.setApptStatus = async function (id, status) {
  try { await API.put(`/appointments/${id}`, { status }); Toast.success('Cita actualizada'); renderDoctorAgenda(); }
  catch (err) { Toast.error(err.message); }
};

// ============================================================
// PAGE — DOCTOR AGENDA
// ============================================================
async function renderDoctorAgenda() {
  Loading.show();
  try {
    const [me, appts] = await Promise.all([API.get('/auth/me'), API.get('/appointments')]);
    State.setUser(me);
    const av = (me.profile && me.profile.availability) || { days: [1, 2, 3, 4, 5], start: '09:00', end: '14:00', slotMin: 30 };
    const price = (me.profile && me.profile.consultation_price) || 0;
    const myInsurers = (me.profile && me.profile.accepted_insurers) || [];
    const ALL_INSURERS = ['GNP', 'AXA', 'MetLife', 'Seguros Monterrey', 'IMSS', 'ISSSTE'];
    const pending = appts.filter(a => a.status === 'pending');
    const confirmed = appts.filter(a => a.status === 'confirmed').filter(a => new Date(a.datetime) >= Date.now() - 36e5);
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const row = (a, actions) => `
      <div class="card" style="padding:1rem 1.25rem;border:1px solid var(--color-border);display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap">
        <div style="display:flex;gap:.75rem;align-items:center">
          <div class="header-avatar" style="width:38px;height:38px;font-size:.75rem">${initials(a.patient_first_name, a.patient_last_name)}</div>
          <div>
            <div class="font-semibold text-sm">${escHtml(a.patient_first_name)} ${escHtml(a.patient_last_name)}</div>
            <div class="text-xs text-muted">${escHtml(a.record_number || '')} · ${escHtml(a.reason || '')}</div>
            <div class="text-sm" style="margin-top:.125rem">📅 ${formatDateTime(a.datetime)} · <span class="${a.paid ? '' : 'text-muted'}">${a.paid ? '✓ Pagada' : 'Sin pagar'}</span></div>
          </div>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">${actions}</div>
      </div>`;

    setContent(renderShell('/doctor/agenda', 'doctor', me, `
      <div class="page-header">
        <h2 class="page-title">Agenda</h2>
        <p class="page-subtitle">Solicitudes de cita, horarios y precio de tu consulta</p>
      </div>

      <div class="card" style="margin-bottom:1.5rem">
        <div class="card-header"><span class="card-title">Solicitudes pendientes ${pending.length ? `<span class="badge badge-yellow">${pending.length}</span>` : ''}</span></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:.75rem">
          ${pending.length ? pending.map(a => row(a, `
            <button class="btn btn-primary btn-sm" onclick="setApptStatus(${a.id},'confirmed')">Confirmar</button>
            <button class="btn btn-secondary btn-sm" onclick="setApptStatus(${a.id},'rejected')">Rechazar</button>`)).join('')
        : `<div class="text-sm text-muted">No hay solicitudes pendientes.</div>`}
        </div>
      </div>

      <div class="card" style="margin-bottom:1.5rem">
        <div class="card-header"><span class="card-title">Próximas citas confirmadas</span></div>
        <div class="card-body" style="display:flex;flex-direction:column;gap:.75rem">
          ${confirmed.length ? confirmed.map(a => row(a, `
            <button class="btn btn-primary btn-sm" onclick="setApptStatus(${a.id},'completed')">Marcar completada</button>
            <button class="btn btn-secondary btn-sm" onclick="setApptStatus(${a.id},'cancelled')">Cancelar</button>`)).join('')
        : `<div class="text-sm text-muted">No tienes citas confirmadas próximas.</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Mis horarios y precio</span></div>
        <div class="card-body">
          <div id="ag-alert"></div>
          <label class="label">Días que atiendo</label>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
            ${dayNames.map((n, i) => `<label style="display:flex;align-items:center;gap:.375rem;padding:.4375rem .75rem;border:1px solid var(--color-border);border-radius:8px;cursor:pointer"><input type="checkbox" class="ag-day" value="${i}" ${av.days.includes(i) ? 'checked' : ''}>${n}</label>`).join('')}
          </div>
          <div class="form-row">
            <div class="form-group"><label class="label">Hora inicio</label><input class="input" type="time" id="ag-start" value="${av.start}"></div>
            <div class="form-group"><label class="label">Hora fin</label><input class="input" type="time" id="ag-end" value="${av.end}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="label">Duración por cita</label>
              <select class="select" id="ag-slot">${[15, 20, 30, 45, 60].map(x => `<option value="${x}"${x === av.slotMin ? ' selected' : ''}>${x} min</option>`).join('')}</select>
            </div>
            <div class="form-group"><label class="label">Precio de consulta (MXN)</label><input class="input" type="number" id="ag-price" min="0" step="50" value="${price}"></div>
          </div>
          <label class="label">Seguros que acepto</label>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:1rem">
            ${ALL_INSURERS.map(name => `<label style="display:flex;align-items:center;gap:.375rem;padding:.4375rem .75rem;border:1px solid var(--color-border);border-radius:8px;cursor:pointer"><input type="checkbox" class="ag-ins" value="${escHtml(name)}" ${myInsurers.includes(name) ? 'checked' : ''}>${escHtml(name)}</label>`).join('')}
          </div>
          <button class="btn btn-primary" id="ag-save" onclick="saveAgenda()">Guardar configuración</button>
        </div>
      </div>`));
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
    Toast.error(err.message);
  } finally { Loading.hide(); }
}
window.saveAgenda = async function () {
  const days = Array.from(document.querySelectorAll('.ag-day:checked')).map(c => +c.value);
  const acceptedInsurers = Array.from(document.querySelectorAll('.ag-ins:checked')).map(c => c.value);
  const btn = document.getElementById('ag-save'); btn.disabled = true; btn.innerHTML = `<span class="inline-spinner"></span> Guardando…`;
  try {
    await API.put('/doctor/settings', {
      consultationPrice: +document.getElementById('ag-price').value || 0,
      availability: { days, start: document.getElementById('ag-start').value, end: document.getElementById('ag-end').value, slotMin: +document.getElementById('ag-slot').value },
      acceptedInsurers,
    });
    Toast.success('Configuración guardada'); renderDoctorAgenda();
  } catch (err) { document.getElementById('ag-alert').innerHTML = `<div class="alert alert-error">${escHtml(err.message)}</div>`; btn.disabled = false; btn.textContent = 'Guardar configuración'; }
};

// ============================================================
// PAGE — DOCTOR GANANCIAS
// ============================================================
async function renderDoctorGanancias() {
  Loading.show();
  try {
    const [me, e] = await Promise.all([API.get('/auth/me'), API.get('/dashboard/doctor/earnings')]);
    State.setUser(me);
    const max = Math.max(1, ...e.byMonth.map(m => m.total));
    const money = (n) => '$' + (n || 0).toLocaleString('es-MX');

    setContent(renderShell('/doctor/ganancias', 'doctor', me, `
      <div class="page-header">
        <h2 class="page-title">Ganancias</h2>
        <p class="page-subtitle">Ingresos por consultas pagadas</p>
      </div>

      <div class="stats-grid" style="grid-template-columns:repeat(4,1fr);margin-bottom:1.5rem">
        <div class="stat-card"><div class="stat-card__label">Total acumulado</div><div class="stat-card__value">${money(e.total)}</div><div class="stat-card__delta">${e.paidCount} consultas pagadas</div></div>
        <div class="stat-card"><div class="stat-card__label">Este mes</div><div class="stat-card__value">${money(e.thisMonth)}</div></div>
        <div class="stat-card"><div class="stat-card__label">Esta semana</div><div class="stat-card__value">${money(e.thisWeek)}</div></div>
        <div class="stat-card stat-card--dark"><div class="stat-card__label">Precio actual</div><div class="stat-card__value">${money(e.consultationPrice)}</div><div class="stat-card__delta"><a onclick="Router.navigate('/doctor/agenda')" style="color:inherit;text-decoration:underline;cursor:pointer">Cambiar precio</a></div></div>
      </div>

      <div class="card" style="margin-bottom:1.5rem">
        <div class="card-header"><span class="card-title">Ingresos últimos 6 meses</span></div>
        <div class="card-body">
          <div style="display:flex;align-items:flex-end;gap:1rem;height:180px;padding-top:1rem">
            ${e.byMonth.map(m => `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:.5rem;height:100%;justify-content:flex-end">
                <div class="text-xs font-semibold">${m.total ? money(m.total) : ''}</div>
                <div style="width:100%;max-width:48px;background:var(--color-primary);border-radius:6px 6px 0 0;height:${Math.max(2, (m.total / max) * 130)}px"></div>
                <div class="text-xs text-muted" style="text-transform:capitalize">${m.label}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><span class="card-title">Consultas cobradas</span></div>
        ${e.recent.length ? `<div class="table-wrapper" style="border:none">
          <table class="table"><thead><tr><th>Fecha</th><th>Paciente</th><th>Motivo</th><th style="text-align:right">Monto</th></tr></thead>
          <tbody>${e.recent.map(r => `<tr><td class="text-sm text-muted">${formatDate(r.datetime)}</td><td class="text-sm font-semibold">${escHtml(r.patient_first_name)} ${escHtml(r.patient_last_name)}</td><td class="text-sm text-muted">${escHtml(r.reason || '')}</td><td class="text-sm font-semibold" style="text-align:right">${money(r.price)}</td></tr>`).join('')}</tbody></table>
        </div>` : `<div class="card-body"><div class="text-sm text-muted">Aún no hay consultas cobradas.</div></div>`}
      </div>`));
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
    Toast.error(err.message);
  } finally { Loading.hide(); }
}

// ============================================================
// PAGE — DOCTOR EXPEDIENTES (lista de pacientes con expediente)
// ============================================================
async function renderDoctorExpedientes() {
  Loading.show();
  try {
    const [me, patients] = await Promise.all([API.get('/auth/me'), API.get('/patients')]);
    State.setUser(me);
    setContent(renderShell('/doctor/expedientes', 'doctor', me, `
      <div class="page-header">
        <h2 class="page-title">Expedientes</h2>
        <p class="page-subtitle">${patients.length} expediente${patients.length !== 1 ? 's' : ''} clínico${patients.length !== 1 ? 's' : ''}</p>
      </div>
      <div class="card">
        <div class="card-header">
          <div class="search-wrapper" style="flex:1;max-width:380px">
            <span class="search-icon">${iconSearch()}</span>
            <input class="input" type="search" placeholder="Buscar por nombre, correo o expediente…" oninput="filterPatients(this.value)">
          </div>
        </div>
        <div id="patients-table">${renderPatientsTable(patients)}</div>
      </div>`));
    window._allPatients = patients;
  } catch (err) {
    Loading.hide();
    if (err.status === 401) { State.clearAuth(); Router.navigate('/login'); return; }
    Toast.error(err.message);
  } finally { Loading.hide(); }
}

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
Router.on('/patient/search',      renderPatientSearch);
Router.on('/patient/citas',       renderPatientCitas);
Router.on('/patient/favoritos',   renderPatientFavoritos);
Router.on('/doctor/dashboard',    renderDoctorDashboard);
Router.on('/doctor/agenda',       renderDoctorAgenda);
Router.on('/doctor/ganancias',    renderDoctorGanancias);
Router.on('/doctor/expedientes',  renderDoctorExpedientes);
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
