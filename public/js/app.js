/* ============================================================
   CultuRézo — JavaScript Frontend (version LAMP)
   Remplace le localStorage par des appels API REST PHP
============================================================ */

'use strict';

// ── Configuration ────────────────────────────────────────
const BASE = '/culturezo'; // Sous-dossier de l'application
const API  = BASE + '/api';

// ── Données dynamiques (périodes) ────────────────────────
let PERIODS = [];

async function loadPeriods() {
  const svcId = currentServiceId && !['admin','compte'].includes(currentServiceId) ? currentServiceId : '';
  const r = await apiGet('/periods.php?action=list' + (svcId ? `&service_id=${svcId}` : ''));
  if (r.ok) {
    PERIODS = r.periods || [];
    EXERCICES = r.exercices || [];
    const latestId = EXERCICES.length ? EXERCICES[EXERCICES.length - 1].id : null;
    // Si l'exercice actuellement sélectionné n'existe plus dans le scope (changement de service,
    // suppression…), bascule sur le plus récent (dernier de la liste triée par label).
    if (!EXERCICES.find(e => e.id === currentExerciceId)) {
      currentExerciceId = latestId;
    }
    // Si le service masque les exercices précédents, on force le retour au plus récent.
    // Sans ça, en revenant sur un service après navigation dans un autre, on pourrait rester
    // sur un exercice antérieur (les IDs d'exercice sont globaux et partagés entre services).
    if (currentService && parseInt(currentService.show_previous_exercices ?? 0) === 0
        && currentExerciceId !== latestId) {
      currentExerciceId = latestId;
    }
  }
}

const ALL_DAYS  = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const ALL_DKEYS = ['lun','mar','mer','jeu','ven','sam','dim'];

// ── État global ───────────────────────────────────────────
let currentUser        = null;
let authToken          = null;
let SERVICES           = [];
let EXERCICES          = [];   // [{id,label,created_at}], trié par label asc
let currentExerciceId  = null;
let NIVEAUX            = [];
let DEMANDEURS         = [];
let currentServiceId   = null;
let currentService     = null;
let SLOTS_REC          = [];   // tableau plat (tous créneaux récurrents, toutes périodes) — pour les lookups
let SLOTS_REC_MAP      = {};   // { periodId: [...slots] } — pour l'édition et le planning par période
let SLOTS_UNIQ         = [];
// Versions "complètes" (actif + desactive + archive) — utilisées uniquement par les vues planning
// admin pour permettre la consultation des exercices passés. Peuplées par loadAdminData.
let SLOTS_REC_FULL     = [];
let SLOTS_REC_MAP_FULL = {};
let SLOTS_UNIQ_FULL    = [];
let ACTIVE_DKEYS       = ['lun','mar','mer','jeu','ven'];
let DKEYS              = ['lun','mar','mer','jeu','ven'];
let DAYS               = ['Lundi','Mardi','Mercredi','Jeudi','Vendredi'];
let openOnHolidays    = false;
let recurringMode      = true;
let _activePlanningTabId = 'planning';
let debugMode             = false;
let schoolZone            = 'A';
let validationMode        = false;
let validationBloquante   = false;
let _currentDemSettings = []; // rows from service_demandeur_settings for current service
let themeMode          = false;
let _currentServiceThemesMode = 'libre'; // 'libre' | 'liste' — mode thèmes du service courant
let _currentServiceThemesList = [];      // liste des thèmes (strings) si mode 'liste'
let maxReservations    = 1;
let maxReservationsPeriod= 1;
let bookingDelay       = 0;
let autoValidationDelay = 0;
let ponctDuration      = 60; // minutes
let recurDuration      = 60; // minutes
let defaultCapacity    = 1;
let gaugeEnabled       = false;
let morningStart       = '09:00';
let morningEnd         = '12:00';
let afternoonStart     = '14:00';
let afternoonEnd       = '18:00';
let activePeriodIdx      = 0;
let _planningPeriodUserPicked = false; // l'utilisateur a-t-il manuellement choisi une période sur Planning récurrent ?
let _capPeriodUserPicked      = false; // idem pour Créneaux récurrents (Paramètres)
let _agendaPeriodUserPicked   = false; // idem pour l'Agenda (mode modele)
let schedulePage       = 1;
let pendingSelection   = {}; // { '1': [{slotId,day,dayLabel,slotLabel,themeLabel}...] } (clé = String(period.id))
let cancelledBookings  = []; // réservations supprimées en session (déjà annulées côté serveur)
let initialThemes      = {}; // bookingId → themeLabel au chargement (pour détecter les modifs)
let initialCounts      = {}; // bookingId → {enfants, accompagnants} au chargement (pour détecter les modifs jauge)
let _gaugeSnapshot     = {}; // snapshot 'slotId|dayKey' → {enfants,accompagnants} figé à l'affichage de la confirmation
let _userDragData      = null; // { bk, periodId, type } — drag en cours sur l'onglet réservation
let _userDragTabTimer  = null; // minuterie bascule de période par drag utilisateur
let _slotClipboard     = null; // { type, periodId, sl, dk, di, bookingId, themeLabel, isCut } — copier/couper
let pendingCancellations = []; // { id, type } — annulations en attente de confirmation (Couper sans coller)
let allBookings        = []; // admin: toutes les réservations
let allBookingsUnique  = [];
let serverCounts       = {}; // comptage serveur des places prises
let serverGaugeSums    = {}; // somme enfants+accompagnants par créneau (mode jauge)
let _lastServiceTab    = 'reservation';
let _lastCreneauxTab   = 'rec'; // sous-onglet actif dans Créneaux : 'rec' ou 'uniq'
let _lastAdminTab      = 'services';
let _lastRealServiceId = null;
let planningPeriodIdx    = 0;
let planningUniqPage   = 0;
let planningHideEmpty      = false;
let agendaHideEmptyHours   = false; // case "Masquer les horaires sans réservation" (onglet Agenda)
let userAgendaShowEmptySlots = false; // case "Afficher les horaires sans créneau" (onglet Réservations) — décochée par défaut (vue compactée)
// Agenda hebdomadaire (vue graphique type Google Agenda)
let agendaPeriodIdx      = 0;
let agendaMode           = 'model';  // 'model' (motif récurrent d'une période) | 'realweek' (semaine calendaire réelle)
let agendaWeekAnchor     = null;     // ISO yyyy-mm-dd du lundi de la semaine affichée (mode realweek)
let agendaWeekAB         = 'A';      // 'A' | 'B' — filtre semaine A/B en mode modèle (ignoré si abMode désactivé)
// Agenda utilisateur (sous le tableau de réservations) — état indépendant
let userAgendaPeriodIdx  = null;     // null = sera initialisé sur activePeriodIdx au premier rendu
let userAgendaWeekAnchor = null;     // null = sera initialisé sur le lundi courant au premier rendu
let userAgendaWeekAB     = 'A';      // 'A' | 'B' — filtre semaine A/B en mode modèle (si demandeur AB)
let planningQuickValidate  = false;
let planningQuickPointage  = false;
let printBW                = false;
let capPeriodIdx         = 0;
let adminSortKey       = 'nom';
let adminSortAsc       = true;
let adminPage          = 0;
const ADMIN_PAGE_SIZE  = 20;
// Onglet actif de la "Liste des réservations" (Editions) : 'rec' | 'uniq' | 'all'.
let _adminResTab       = 'rec';
// Onglet + filtres actifs de l'onglet Statistiques.
let _statsType         = 'all';   // 'rec' | 'uniq' | 'all'
let _statsPeriodId     = '';      // '' = toutes périodes
let _statsDateFrom     = '';
let _statsDateTo       = '';
let ucSortKey          = 'default';
let ucPage             = 0;
const UC_PAGE_SIZE     = 20;
let selectedRows       = new Set();
let _editUserId        = null;
let _ctxCutData        = null; // badge coupé en attente de colle
let _undoBookingsCount = 0;    // nb de réservations qui seraient supprimées par undo_cycle (utilisé par la modale de confirmation)
let _ctxCellData       = null; // cellule cible { periodId, slotId, dayKey }
let _ctxPasteTarget    = null;
let _ctxDeleteTarget   = null;
let _ctxBookingId      = null;
let _ctxBookingType    = null;
let _detailBookingId   = null; // fiche réservation ouverte
let _detailBookingType = null;
let _bdetInitEnfants       = 0; // valeurs participants à l'ouverture (pour détection dirty)
let _bdetInitAccompagnants = 0;
let _bdetInitTheme         = ''; // valeur thème à l'ouverture (pour détection dirty)
let _bdetThemeShown        = false; // le champ thème est-il visible pour cette résa ?
let _dragData          = null; // badge en cours de glisser-déplacer
let _dragTabTimer      = null; // minuterie bascule de période au survol
let _dragPageCooldown  = 0;   // timestamp dernier changement de page par drag
let _chartInstances    = {};
let _slotDelSelectionRec  = new Set();
// Enum local pour les slots en cours d'édition (params)
let _editSlotsRec         = [];
let _editSlotsRecMap      = {}; // stash des éditions en cours par période
let _slotPageRec          = 0;
let _editSlotsUniq        = [];
let _slotPageUniq         = 0;
let _slotDelSelectionUniq = new Set();
let _slotPageMir          = 0;
let _slotDelSelectionMir  = new Set();
const SLOT_PAGE_SIZE   = 10;

// ── Utilitaires API ───────────────────────────────────────
async function apiFetch(endpoint, opts = {}) {
  const hadToken = !!authToken;
  const headers = { 'Content-Type': 'application/json' };
  if (authToken) headers['Authorization'] = 'Bearer ' + authToken;
  try {
    const res = await fetch(API + endpoint, { headers, ...opts });
    let data;
    try { data = await res.json(); } catch { data = { ok: false, error: 'Réponse invalide' }; }
    if (res.status === 401 && hadToken) {
      handleSessionExpired();
    }
    return data;
  } catch (e) {
    console.error('apiFetch error', e);
    return { ok: false, error: 'Erreur réseau' };
  }
}
async function apiGet(endpoint)        { return apiFetch(endpoint, { method: 'GET' }); }
async function apiPost(endpoint, data) { return apiFetch(endpoint, { method: 'POST', body: JSON.stringify(data) }); }

// ── Session expirée (401 reçu alors qu'un token était présent) ──
function _clearLocalSession() {
  authToken = null; currentUser = null;
  sessionStorage.removeItem('rc_token');
  document.cookie = 'rc_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=' + BASE + '/';
  SERVICES = []; currentServiceId = null; currentService = null;
  pendingSelection = {}; cancelledBookings = []; initialThemes = {}; initialCounts = {}; allBookings = []; allBookingsUnique = [];
  userAgendaPeriodIdx = null; userAgendaWeekAnchor = null; userAgendaWeekAB = 'A';
  const userMenu = document.getElementById('user-menu');
  if (userMenu) userMenu.classList.remove('open');
}
let _sessionExpiredHandled = false;
function handleSessionExpired() {
  if (_sessionExpiredHandled) return;
  _sessionExpiredHandled = true;
  _clearLocalSession();
  showAuthUI();
  showToast('Session expirée — veuillez vous reconnecter', 4000, { warn: true });
  setTimeout(() => { _sessionExpiredHandled = false; }, 1500);
}

// ── Vérification délai de réservation ────────────────────
function _workingDaysBetween(from, toDate) {
  // ALL_DKEYS = ['lun','mar','mer','jeu','ven','sam','dim'] → getDay() : 0=dim,1=lun…6=sam
  const dayKeyOf = d => ALL_DKEYS[[6,0,1,2,3,4,5][d.getDay()]];
  let count = 0;
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  const end = new Date(toDate);
  end.setHours(0, 0, 0, 0);
  while (d < end) {
    if (ACTIVE_DKEYS.includes(dayKeyOf(d))) count++;
    d.setDate(d.getDate() + 1);
  }
  return count;
}
function _checkBookingDelay(slot) {
  if (!slot.slot_date || !slot.start_time) return true;
  // Refuser une séance déjà passée, même quand "Aucun délai" est sélectionné.
  const slotDt = new Date(`${slot.slot_date}T${slot.start_time}`);
  if (slotDt <= Date.now()) {
    showToast('Cette séance est déjà passée', 3500, { error: true });
    return false;
  }
  if (!bookingDelay) return true;
  let ok;
  if (bookingDelay >= 1000) {
    // Encodage 1000+N : N jours calendaires entre aujourd'hui (minuit) et la date du créneau.
    const days  = bookingDelay - 1000;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const slotDay = new Date(slot.slot_date + 'T00:00:00');
    ok = (slotDay - today) / 86400000 >= days;
  } else if (bookingDelay < 0) {
    const required = Math.abs(bookingDelay);
    ok = _workingDaysBetween(new Date(), new Date(slot.slot_date + 'T00:00:00')) >= required;
  } else {
    ok = (slotDt - Date.now()) / 60000 >= bookingDelay;
  }
  if (!ok) { showToast('Le délai est trop court pour réserver', 3500, { error: true }); return false; }
  return true;
}

// ── Textarea auto-resize ──────────────────────────────────
function autoResizeTextarea(el) {
  el.style.height = '0';
  el.style.height = el.scrollHeight + 'px';
}

// ── Toast ─────────────────────────────────────────────────
function showToast(msg, duration = 2800, opts = {}) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (opts.error ? ' toast--error' : opts.warn ? ' toast--warn' : '') + (opts.top ? ' toast--top' : '');
  t.classList.add('show');
  clearTimeout(t._tid);
  t._tid = setTimeout(() => t.classList.remove('show'), duration);
}

// ── Thème ─────────────────────────────────────────────────
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light');
  localStorage.setItem('rc_theme', isLight ? 'light' : 'dark');
  document.querySelectorAll('.btn-theme').forEach(b => b.textContent = isLight ? '☀️' : '🌙');
}
(function() {
  if (localStorage.getItem('rc_theme') === 'light') {
    document.documentElement.classList.add('light');
    document.querySelectorAll('.btn-theme').forEach(b => b.textContent = '☀️');
  }
})();

// ── Init ──────────────────────────────────────────────────
function updateHeaderHeight() {
  const h = document.querySelector('header');
  if (h) document.documentElement.style.setProperty('--header-h', h.getBoundingClientRect().height + 'px');
}
window.addEventListener('resize', updateHeaderHeight);
// Le header change de hauteur lors des transitions login/logout (logo + tagline
// affichés/masqués). Sans ça, la sidebar garde une mauvaise dimension jusqu'au refresh.
(function _observeHeaderResize() {
  const h = document.querySelector('header');
  if (h && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(updateHeaderHeight).observe(h);
  }
})();
window.addEventListener('DOMContentLoaded', async () => {
  updateHeaderHeight();
  // Restaurer token depuis cookie ou sessionStorage
  authToken = sessionStorage.getItem('rc_token') || getCookie('rc_token') || null;
  if (authToken) {
    const r = await apiGet('/auth.php?action=me');
    if (r.ok) {
      currentUser = r.user;
      debugMode = r.config?.debug_mode === '1';
      schoolZone = ['A','B','C'].includes(r.config?.school_zone) ? r.config.school_zone : 'A';
      await onLoginSuccess();
      return;
    } else {
      authToken = null; sessionStorage.removeItem('rc_token');
    }
  }
  showAuthUI();
});

// ── Auto-refresh des vues admin (Agenda / Éditions / Stats) ─────────────
// Quand le cron auto-validation tourne en background, le client n'a pas de signal.
// On rafraîchit (1) toutes les 60s tant que l'onglet est visible, (2) à chaque retour
// de focus (visibilitychange). Refresh silencieux : pas de spinner, pas de toast.
async function _maybeRefreshAdminView() {
  if (document.hidden) return;
  if (!currentServiceId || currentServiceId === 'admin' || currentServiceId === 'compte') return;
  if (typeof isManagerUser === 'function' && !isManagerUser()) return;
  if (!['agenda', 'editions', 'stats'].includes(_lastServiceTab)) return;
  try {
    await loadAdminData();
    if (_lastServiceTab === 'agenda')   renderAgendaWeekly();
    if (_lastServiceTab === 'editions') renderAdminTable(false);
    if (_lastServiceTab === 'stats')    await renderStatsTab();
  } catch (e) {
    // Refresh silencieux : on n'embête pas l'utilisateur avec un toast d'erreur.
    console.warn('[admin auto-refresh] échec :', e);
  }
}
setInterval(_maybeRefreshAdminView, 60000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) _maybeRefreshAdminView();
});

function getCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '=([^;]+)');
  return m ? m[2] : null;
}

// ── Auth UI ───────────────────────────────────────────────
function showAuthUI() {
  document.getElementById('user-bar').classList.add('hidden');
  document.getElementById('theme-bar-guest').style.display = '';
  document.getElementById('service-sidebar-wrap').style.display = 'none';
  document.getElementById('tabs-nav-service').classList.add('hidden');
  document.getElementById('tabs-nav-admin').classList.add('hidden');
  document.getElementById('tabs-nav-compte').classList.remove('hidden');
  switchTab('compte');
  document.getElementById('form-profile').classList.add('hidden');
  document.getElementById('mode-toggle').classList.remove('hidden');
  document.getElementById('form-create').classList.add('hidden');
  document.getElementById('form-login').classList.remove('hidden');
  document.getElementById('header-logo').classList.remove('hidden');
  document.getElementById('header-tagline').classList.remove('hidden');
  setAuthMode('login');
}

async function setAuthMode(mode) {
  const emailSent = mode === 'email-sent';
  const isLogin   = mode === 'login';
  document.getElementById('form-create').classList.toggle('hidden', isLogin || emailSent);
  document.getElementById('form-login').classList.toggle('hidden', !isLogin);
  document.getElementById('form-email-sent').classList.toggle('hidden', !emailSent);
  document.getElementById('mode-toggle').classList.toggle('hidden', emailSent);
  if (!emailSent) {
    const mt = document.getElementById('mode-toggle');
    mt.innerHTML = isLogin
      ? 'Pas encore de compte ? <button onclick="setAuthMode(\'create\')">Créer un compte</button>'
      : 'Déjà inscrit ? <button onclick="setAuthMode(\'login\')">Se connecter</button>';
  }
  if (mode === 'create') {
    if (NIVEAUX.length === 0) {
      const rn = await apiGet('/niveaux.php');
      if (rn.ok) NIVEAUX = rn.niveaux || [];
    }
    _setNiveauField('c-niveau');
    if (DEMANDEURS.length === 0) {
      const rc = await apiGet('/demandeurs.php');
      if (rc.ok) DEMANDEURS = rc.demandeurs || [];
    }
    document.getElementById('c-demandeur').innerHTML = _demandeurOptions('');
    document.getElementById('c-structure').innerHTML = '<option value="">— Sélectionner d\'abord une catégorie —</option>';
  }
}

// ── Politique de mot de passe ─────────────────────────────
function _pwdValid(pwd) {
  if (pwd.length < 12)            return '12 caractères minimum';
  if (!/[A-Z]/.test(pwd))         return '1 majuscule obligatoire';
  if (!/[a-z]/.test(pwd))         return '1 minuscule obligatoire';
  if (!/[0-9]/.test(pwd))         return '1 chiffre obligatoire';
  if (!/[^A-Za-z0-9]/.test(pwd))  return '1 caractère spécial obligatoire';
  return '';
}

function updatePwdChecklist(input) {
  if (!input) return;
  let list = null, el = input;
  while (el && !list) {
    let sib = el.nextElementSibling;
    while (sib && !(sib.classList && sib.classList.contains('pwd-checklist'))) sib = sib.nextElementSibling;
    if (sib) { list = sib; break; }
    el = el.parentElement;
    if (el && (el.tagName === 'FORM' || el.tagName === 'BODY')) break;
  }
  if (!list) return;
  const pwd = input.value || '';
  const rules = {
    length: pwd.length >= 12,
    upper: /[A-Z]/.test(pwd),
    lower: /[a-z]/.test(pwd),
    digit: /[0-9]/.test(pwd),
    special: /[^A-Za-z0-9]/.test(pwd)
  };
  list.querySelectorAll('li[data-rule]').forEach(li => {
    li.classList.toggle('ok', !!rules[li.dataset.rule]);
  });
}

// ── Validation des formulaires ────────────────────────────
function validateCreate() {
  const prenom = document.getElementById('c-prenom').value.trim();
  const nom    = document.getElementById('c-nom').value.trim();
  const email  = document.getElementById('c-email').value.trim();
  const pwd    = document.getElementById('c-pwd').value;
  const pwd2   = document.getElementById('c-pwd2').value;
  const rgpd   = document.getElementById('rgpd-1').checked;
  const policyErr = pwd ? _pwdValid(pwd) : '';
  const mismatch  = pwd && pwd2 && pwd !== pwd2;
  const policyEl  = document.getElementById('c-pwd-policy-error');
  const matchEl   = document.getElementById('pwd-error');
  if (policyEl) { policyEl.textContent = policyErr; policyEl.style.display = policyErr ? 'block' : 'none'; }
  if (matchEl)  matchEl.style.display = mismatch ? 'block' : 'none';
  document.getElementById('btn-create').disabled =
    !(prenom && nom && email && !_pwdValid(pwd) && pwd === pwd2 && rgpd);
}

function validateLogin() {
  const email = document.getElementById('l-email').value.trim();
  const pwd   = document.getElementById('l-pwd').value;
  document.getElementById('btn-login').disabled = !(email && pwd);
}

// ── Créer un compte ───────────────────────────────────────
async function createAccount() {
  const btn = document.getElementById('btn-create');
  btn.disabled = true;
  btn.textContent = '⏳ Création…';
  const data = {
    prenom:       document.getElementById('c-prenom').value.trim(),
    nom:          document.getElementById('c-nom').value.trim(),
    email:        document.getElementById('c-email').value.trim(),
    tel:          document.getElementById('c-tel').value.trim(),
    demandeur_id: document.getElementById('c-demandeur').value || '',
    structure_id:  document.getElementById('c-structure').value  || '',
    niveau:        document.getElementById('c-niveau').value.trim(),
    enfants:       document.getElementById('c-enfants').value       || 0,
    accompagnants: document.getElementById('c-accompagnants').value || 0,
    password:      document.getElementById('c-pwd').value,
    rgpd_ok:       1,
  };
  const r = await apiPost('/auth.php?action=register', data);
  if (!r.ok) {
    showToast('⚠️ ' + (r.error || 'Erreur'));
    btn.disabled = false;
    btn.textContent = 'Créer mon compte →';
    return;
  }
  if (r.email_confirmation_sent) {
    setAuthMode('email-sent');
  } else {
    showToast('✅ Compte créé ! Connexion en cours…');
    await loginWith(data.email, data.password);
  }
}

// ── Connexion ─────────────────────────────────────────────
async function login() {
  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.textContent = '⏳ Connexion…';
  const email = document.getElementById('l-email').value.trim();
  const pwd   = document.getElementById('l-pwd').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  await loginWith(email, pwd);
  btn.disabled = false;
  btn.textContent = 'Connexion →';
}

async function loginWith(email, password) {
  const r = await apiPost('/auth.php?action=login', { email, password });
  if (!r.ok) {
    const errEl = document.getElementById('login-error');
    // Si l'erreur commence par "Trop de tentatives" (rate limit serveur), on l'affiche
    // telle quelle. Sinon on garde le message générique pour ne pas révéler quel
    // champ est faux (email vs password).
    if (r.error === 'email_not_confirmed') {
      errEl.textContent = 'Votre compte n\'est pas encore confirmé. Vérifiez votre boîte mail.';
    } else if (typeof r.error === 'string' && r.error.startsWith('Trop de tentatives')) {
      errEl.textContent = r.error;
    } else {
      errEl.textContent = 'E-mail ou mot de passe incorrect.';
    }
    errEl.style.display = 'block';
    return;
  }
  authToken = r.token;
  currentUser = r.user;
  debugMode = r.config?.debug_mode === '1';
  schoolZone = ['A','B','C'].includes(r.config?.school_zone) ? r.config.school_zone : 'A';
  sessionStorage.setItem('rc_token', authToken);
  await onLoginSuccess();
}

// Le champ Niveau est un combobox custom : <input> + bouton ▾ + liste flottante.
// L'utilisateur peut taper librement (saisie libre) OU choisir un niveau dans la liste.
// La liste est filtree en direct selon ce qui est tape.
// applyTextFilter=true : filtre aussi par ce qui est tape dans l'input (appel depuis oninput).
// applyTextFilter=false (defaut) : on retourne la liste pour le demandeur (ouverture par focus / clic).
// Fallback : si le filtre par demandeur donne 0 niveau mais que NIVEAUX en contient,
// on retombe sur la liste complete pour ne jamais afficher un menu vide.
function _niveauFilteredList(inputId, demandeurId = '', applyTextFilter = false) {
  let base = demandeurId
    ? NIVEAUX.filter(n => n.demandeur_id == null || String(n.demandeur_id) === String(demandeurId))
    : NIVEAUX;
  if (!base.length && NIVEAUX.length) base = NIVEAUX;
  if (!applyTextFilter) return base;
  const inp = document.getElementById(inputId);
  const q = (inp ? inp.value : '').trim().toLowerCase();
  return q ? base.filter(n => (n.label || '').toLowerCase().includes(q)) : base;
}
function _niveauListHtml(inputId, demandeurId = '', applyTextFilter = false) {
  const list = _niveauFilteredList(inputId, demandeurId, applyTextFilter);
  let html = list.length
    ? list.map(n => {
        const safe = String(n.label || '').replace(/"/g, '&quot;');
        return `<div class="niveau-combo-list-item" data-niveau-for="${inputId}" data-niveau-val="${safe}">${safe}</div>`;
      }).join('')
    : '<div class="niveau-combo-empty">Aucun niveau predefini - tapez librement</div>';
  // Ligne "+ Ajouter" : on la propose seulement pendant la frappe (applyTextFilter), si
  // la saisie n'est pas vide et qu'aucun niveau existant n'a exactement ce label
  // (comparaison case-insensitive trim, coherente avec la dedup serveur).
  if (applyTextFilter) {
    const inp = document.getElementById(inputId);
    const typed = (inp ? inp.value : '').trim();
    if (typed) {
      const typedLow = typed.toLowerCase();
      const exactExists = NIVEAUX.some(n => (n.label || '').trim().toLowerCase() === typedLow);
      if (!exactExists) {
        const safe = typed.replace(/"/g, '&quot;');
        html += `<div class="niveau-combo-list-create" data-niveau-create-for="${inputId}" data-niveau-create-label="${safe}">+ Ajouter &quot;${safe}&quot; comme nouveau niveau</div>`;
      }
    }
  }
  return html;
}
// POST l'enrichissement de la liste : cree le niveau en base (dedup case-insensitive cote serveur),
// l'ajoute a NIVEAUX en memoire, le selectionne dans l'input puis ferme la liste.
async function _createNiveau(inputId, label) {
  label = (label || '').trim();
  if (!label) return;
  const demandeurId = _niveauDemId[inputId] || null;
  const r = await apiPost('/niveaux.php?action=create', { label, demandeur_id: demandeurId });
  if (!r || !r.ok) {
    showToast('⚠️ ' + ((r && r.error) || 'Impossible de creer le niveau'), 2800, { warn: true });
    return;
  }
  if (!NIVEAUX.some(n => n.id === r.niveau.id)) NIVEAUX.push(r.niveau);
  _pickNiveau(inputId, r.niveau.label);
  if (r.created) showToast('Niveau « ' + r.niveau.label + ' » ajoute');
}
// Stocke le demandeur courant par champ pour pouvoir filtrer/rafraichir sans le repasser a chaque fois.
const _niveauDemId = {};
function _setNiveauField(inputId, current = '', demandeurId = '') {
  const inp = document.getElementById(inputId);
  if (!inp) return;
  inp.value = current || '';
  _niveauDemId[inputId] = demandeurId || '';
  const list = document.getElementById(inputId + '-list');
  if (list) list.innerHTML = _niveauListHtml(inputId, demandeurId);
}
function _populateNiveauSelects(current = '') {
  ['p-niveau','c-niveau','uc-edit-niveau'].forEach(id => _setNiveauField(id, current));
}
// Ouverture / fermeture de la liste flottante.
// A l'ouverture (focus / clic chevron) on montre la liste COMPLETE (sans filtre par la valeur courante)
// pour avoir le comportement d'un select classique.
// Position calculee a chaque ouverture : la liste est en position:fixed (cf. CSS) pour ne pas
// etre clippee par un parent overflow:hidden (ex le form-grid du profil).
function _positionNiveauList(inputId) {
  const inp  = document.getElementById(inputId);
  const list = document.getElementById(inputId + '-list');
  if (!inp || !list) return;
  const r = inp.getBoundingClientRect();
  list.style.top   = (r.bottom + 2) + 'px';
  list.style.left  = r.left + 'px';
  list.style.width = r.width + 'px';
}
function openNiveauList(inputId) {
  const list = document.getElementById(inputId + '-list');
  if (!list) return;
  list.innerHTML = _niveauListHtml(inputId, _niveauDemId[inputId] || '', false);
  _positionNiveauList(inputId);
  list.classList.add('open');
}
function closeNiveauList(inputId) {
  const list = document.getElementById(inputId + '-list');
  if (list) list.classList.remove('open');
}
function toggleNiveauList(inputId) {
  const list = document.getElementById(inputId + '-list');
  if (!list) return;
  if (list.classList.contains('open')) {
    list.classList.remove('open');
  } else {
    const inp = document.getElementById(inputId);
    if (inp) inp.focus();
    openNiveauList(inputId);
  }
}
function _pickNiveau(inputId, label) {
  const inp = document.getElementById(inputId);
  if (inp) inp.value = label;
  closeNiveauList(inputId);
}
// Saisie clavier : on filtre la liste par le texte tape (comportement type autocomplete).
function _onNiveauInput(inputId) {
  const list = document.getElementById(inputId + '-list');
  if (!list) return;
  list.innerHTML = _niveauListHtml(inputId, _niveauDemId[inputId] || '', true);
  _positionNiveauList(inputId);
  list.classList.add('open');
}
// Delegation : clic sur un item ou sur la ligne "+ Ajouter".
// (mousedown plutot que click pour devancer le focus loss qui fermerait la liste.)
document.addEventListener('mousedown', e => {
  const createBtn = e.target.closest && e.target.closest('.niveau-combo-list-create');
  if (createBtn) {
    e.preventDefault();
    const inputId = createBtn.getAttribute('data-niveau-create-for');
    const label   = createBtn.getAttribute('data-niveau-create-label');
    if (inputId) _createNiveau(inputId, label);
    return;
  }
  const item = e.target.closest && e.target.closest('.niveau-combo-list-item');
  if (item) {
    e.preventDefault();
    const inputId = item.getAttribute('data-niveau-for');
    const val     = item.getAttribute('data-niveau-val');
    if (inputId) _pickNiveau(inputId, val || '');
    return;
  }
  // Clic en dehors d'un combo ouvert : fermeture.
  ['p-niveau','c-niveau','uc-edit-niveau'].forEach(id => {
    const list = document.getElementById(id + '-list');
    if (!list || !list.classList.contains('open')) return;
    const combo = list.closest('.niveau-combo');
    if (combo && !combo.contains(e.target)) list.classList.remove('open');
  });
});
// La liste etant en position:fixed, on doit la repositionner si la page scrolle / le viewport change.
function _repositionOpenNiveauLists() {
  ['p-niveau','c-niveau','uc-edit-niveau'].forEach(id => {
    const list = document.getElementById(id + '-list');
    if (list && list.classList.contains('open')) _positionNiveauList(id);
  });
}
window.addEventListener('scroll',  _repositionOpenNiveauLists, true);
window.addEventListener('resize',  _repositionOpenNiveauLists);

function _demandeurOptions(currentId = '') {
  const blank = `<option value="">— Catégorie —</option>`;
  return blank + DEMANDEURS.map(c =>
    `<option value="${c.id}"${String(c.id) === String(currentId) ? ' selected' : ''}>${c.label}</option>`
  ).join('');
}

function _structureOptions(list, currentId = '') {
  const blank = `<option value="">— Structure —</option>`;
  return blank + list.map(s =>
    `<option value="${s.id}"${String(s.id) === String(currentId) ? ' selected' : ''}>${s.label}</option>`
  ).join('');
}

const _structuresCache = {};

async function _fetchStructures(demandeurId) {
  if (!demandeurId) return [];
  if (_structuresCache[demandeurId]) return _structuresCache[demandeurId];
  const r = await apiGet('/structures.php?demandeur_id=' + demandeurId);
  _structuresCache[demandeurId] = r.ok ? (r.structures || []) : [];
  return _structuresCache[demandeurId];
}

async function _loadStructuresInto(selId, demandeurId, currentStructureId = '') {
  const el = document.getElementById(selId);
  if (!el) return;
  if (!demandeurId) {
    el.innerHTML = '<option value="">— Sélectionner d\'abord une catégorie —</option>';
    return;
  }
  const list = await _fetchStructures(demandeurId);
  el.innerHTML = _structureOptions(list, currentStructureId);
}

function _getDemandeurLabel(demId) {
  if (!demId) return '—';
  const d = DEMANDEURS.find(x => String(x.id) === String(demId));
  return d ? d.label : '—';
}

function _getStructureLabel(demId, strId) {
  if (!demId || !strId) return '—';
  const list = _structuresCache[demId] || [];
  const s = list.find(x => String(x.id) === String(strId));
  return s ? s.label : '—';
}

// Rafraîchit le champ niveau (input + suggestions) en fonction du demandeur courant.
// - Si la valeur est un niveau connu mais plus applicable au demandeur : on efface.
// - Si c'est du texte libre (non present dans NIVEAUX) : on conserve.
// - Si c'est un niveau encore valide : on conserve.
function _refreshNiveauForDemandeur(niveauInpId, demId) {
  const inp = document.getElementById(niveauInpId);
  if (!inp) return;
  const currentLabel = inp.value;
  const wasKnown = NIVEAUX.some(n => n.label === currentLabel);
  const stillValid = NIVEAUX.some(n =>
    n.label === currentLabel && (!demId || n.demandeur_id == null || String(n.demandeur_id) === String(demId)));
  const keep = !wasKnown || stillValid;
  _setNiveauField(niveauInpId, keep ? currentLabel : '', demId);
}

async function onCreateDemandeurChange() {
  const demId = document.getElementById('c-demandeur').value;
  await _loadStructuresInto('c-structure', demId);
  _refreshNiveauForDemandeur('c-niveau', demId);
}

async function onAdminDemandeurChange() {
  const demId = document.getElementById('uc-edit-demandeur').value;
  await _loadStructuresInto('uc-edit-structure', demId);
  _refreshNiveauForDemandeur('uc-edit-niveau', demId);
}

async function onProfileDemandeurChange() {
  const demId = document.getElementById('p-demandeur').value;
  await _loadStructuresInto('p-structure', demId);
  _refreshNiveauForDemandeur('p-niveau', demId);
}

async function onLoginSuccess() {
  // Charger les services, niveaux et catégories
  const [r, rn, rc] = await Promise.all([
    apiGet('/services.php?action=list'),
    apiGet('/niveaux.php'),
    apiGet('/demandeurs.php'),
  ]);
  if (r.ok)  SERVICES   = r.services   || [];
  if (rn.ok) NIVEAUX    = rn.niveaux   || [];
  if (rc.ok) DEMANDEURS = rc.demandeurs || [];
  // Migration localStorage → DB (une seule fois par service sans icône en base)
  for (const svc of SERVICES) {
    const local = localStorage.getItem('svc_icon_' + svc.id);
    if (local && !svc.icon) {
      svc.icon = local;
      apiPost('/services.php?action=update', { id: svc.id, icon: local });
      localStorage.removeItem('svc_icon_' + svc.id);
    }
  }
  _populateNiveauSelects();

  // Afficher UI connectée
  const uBar = document.getElementById('user-bar');
  uBar.classList.remove('hidden');
  document.getElementById('theme-bar-guest').style.display = 'none';
  document.getElementById('header-logo').classList.add('hidden');
  document.getElementById('header-tagline').classList.add('hidden');
  document.getElementById('user-display-name').textContent =
    (currentUser.prenom + ' ' + currentUser.nom).trim() || currentUser.email;
  const initials = ((currentUser.prenom ? currentUser.prenom[0] : '') + (currentUser.nom ? currentUser.nom[0] : '') || '?').toUpperCase();
  document.getElementById('avatar-initials').textContent = initials;

  const isAdmin = isAdminUser();
  if (SERVICES.length > 0) {
    document.getElementById('service-sidebar-wrap').style.display = 'flex';
    document.getElementById('service-sidebar-wrap').style.flexDirection = 'column';
    renderServiceSidebar();
    _applyServiceSidebarCollapsed();
    // Activer le premier service
    if (SERVICES.length > 0) {
      await switchParent(isAdmin ? 'admin' : SERVICES[0].id);
    }
  } else {
    // Pas de services : afficher compte
    switchToCompteView();
  }
}

function isAdminUser() {
  return currentUser && (currentUser.role === 'administrateur');
}
function isManagerUser() {
  return currentUser && (currentUser.role === 'gestionnaire' || currentUser.role === 'administrateur');
}

// ── Déconnexion ───────────────────────────────────────────
async function logout() {
  await apiPost('/auth.php?action=logout', {});
  _clearLocalSession();
  showAuthUI();
}

function toggleUserMenu() {
  document.getElementById('user-menu').classList.toggle('open');
}
document.addEventListener('click', e => {
  if (!e.target.closest('.user-pill-wrap')) {
    document.getElementById('user-menu').classList.remove('open');
  }
});

// ── Sidebar services ──────────────────────────────────────
const _ICON_CATEGORIES = [
  { label: 'Sport & Mouvement',    icons: ['🏃','🏋️','🤸','🚴','⛹️','🧘','💃','🕺','🏊','🤽','⚽','🏀','🎾','🏸','🎿','🏄','🤾','🏐'] },
  { label: 'Musique',              icons: ['🎵','🎶','🎼','🎸','🎹','🎺','🎻','🥁','🎤','🎙️','🎧','🪗','🪘','🪕'] },
  { label: 'Arts & Création',      icons: ['🎨','🖌️','✏️','🖊️','🖼️','🗿','🏺','✂️','📐','🧵','🪡','🧶','🖶'] },
  { label: 'Scène & Spectacle',    icons: ['🎭','🎬','🎪','🎠','🤹','🎟️','🎞️'] },
  { label: 'Cuisine',              icons: ['🍳','👨‍🍳','🥐','🍰','🧁','🫕','🥘','🍽️','🧑‍🍳'] },
  { label: 'Photo & Vidéo',        icons: ['📷','📸','🤳','🎥','🎞️','📹'] },
  { label: 'Numérique',            icons: ['💻','🖥️','⌨️','🖱️','🤖','⚙️','📱'] },
  { label: 'Langues & Lecture',    icons: ['📖','📚','📕','🔖','🌍','🗣️','✍️','📝'] },
  { label: 'Nature & Jardin',      icons: ['🌱','🌻','🪴','🌿','🌳','🍃','♻️','🌸','🌺','🦋'] },
  { label: 'Culture & Patrimoine', icons: ['🏛️','🗺️','🎫','🔭','🏺','⛪','🏰','🗽'] },
  { label: 'Sciences & Atelier',   icons: ['🔬','🧪','⚗️','🔧','🛠️','🧰','💡','🧲','🔩'] },
  { label: 'Enfance',              icons: ['🧸','🪀','🪁','🎠','🎡','🎢','🎪','🎈','🎉','🪄','🧩','🎮','🪆','🏰','🌈','🧁','🍭','🦄','🐣','🐥'] },
  { label: 'Bâtiments',           icons: ['🏛️','🏰','🏯','⛪','🕌','🕍','🛕','🏗️','🏢','🏬','🏪','🏫','🏩','🏥','🏦','🏨','🏤','🏣','🏟️','🗼','🗽','🗿','⛩️','🏠','🏡','🏚️'] },
  { label: 'Divers',               icons: ['📌','🎯','⭐','🔷','🏷️','📋','🎗️','🧩','🔑','🌈','🎁','🏆','🥇','❤️','✨','🔔'] },
];

function svcIcon(label, id) {
  if (id) { const svc = SERVICES.find(s => s.id === id); if (svc?.icon) return svc.icon; }
  const l = (label || '').toLowerCase();
  const h = (id || label || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const pick = arr => arr[h % arr.length];
  if (/natation|piscine|aqua/.test(l))                              return pick(['🏊','🌊','🤽']);
  if (/foot|football|soccer/.test(l))                               return pick(['⚽','🥅','👟']);
  if (/basket/.test(l))                                             return pick(['🏀','🏟️']);
  if (/tennis|badminton|ping/.test(l))                              return pick(['🎾','🏸']);
  if (/yoga|méditat|relaxat/.test(l))                               return pick(['🧘','☮️','🌸']);
  if (/danse|ballet|hip.?hop/.test(l))                              return pick(['💃','🕺','🩰']);
  if (/gym|fitness|muscul|sport/.test(l))                           return pick(['🏃','🏋️','🤸','🚴','⛹️']);
  if (/guitare/.test(l))                                            return pick(['🎸','🎶']);
  if (/piano/.test(l))                                              return pick(['🎹','🎼']);
  if (/chant|chorale|choeur/.test(l))                               return pick(['🎤','🎶','🎙️']);
  if (/orchestre|instrument/.test(l))                               return pick(['🎺','🎻','🥁']);
  if (/musique/.test(l))                                            return pick(['🎵','🎶','🎼','🎸','🎹']);
  if (/aquarelle/.test(l))                                          return pick(['🖌️','🎨']);
  if (/sculpture|poterie|céramique/.test(l))                        return pick(['🗿','🏺','🖶']);
  if (/dessin|illustration/.test(l))                                return pick(['✏️','🖊️','📐']);
  if (/peinture|art|créat/.test(l))                                 return pick(['🎨','🖼️','🖌️','✏️']);
  if (/cirque|jonglage|acrobat/.test(l))                            return pick(['🎪','🤹','🎠']);
  if (/théâtre|comédie|scène|spectacle/.test(l))                    return pick(['🎭','🎬','🎟️']);
  if (/patisserie|boulangerie/.test(l))                             return pick(['🥐','🍰','🧁']);
  if (/cuisine|gastro|culinaire/.test(l))                           return pick(['🍳','👨‍🍳','🫕','🥘']);
  if (/photo/.test(l))                                              return pick(['📷','📸','🤳']);
  if (/vidéo|cinéma|film/.test(l))                                  return pick(['🎥','🎞️','🎬']);
  if (/robot/.test(l))                                              return pick(['🤖','⚙️']);
  if (/informatique|code|numérique|digital/.test(l))                return pick(['💻','🖥️','⌨️','🖱️']);
  if (/anglais/.test(l))                                            return pick(['🇬🇧','📚']);
  if (/espagnol/.test(l))                                           return pick(['🇪🇸','📚']);
  if (/allemand/.test(l))                                           return pick(['🇩🇪','📚']);
  if (/langue|français/.test(l))                                    return pick(['🌍','🗣️','📖']);
  if (/conte|lecture/.test(l))                                      return pick(['📖','📕','🔖']);
  if (/ludo|médiat|mediath|biblioth|livre/.test(l))                 return pick(['📚','📖','🏫']);
  if (/jardin|plante/.test(l))                                      return pick(['🌱','🌻','🪴','🌿']);
  if (/nature|environnement|écolog/.test(l))                        return pick(['🌳','♻️','🌍','🍃']);
  if (/musée|museum/.test(l))                                       return pick(['🏛️','🏺','🗿']);
  if (/visite|guidée/.test(l))                                      return pick(['🗺️','🎫','🔭']);
  if (/atelier/.test(l))                                            return pick(['🔧','🛠️','⚗️','🧪','🔬']);
  return pick(['📌','🎯','⭐','🔷','🏷️','📋','🎗️','💡','🧩','🔑']);
}

function renderServiceSidebar() {
  const sidebar = document.getElementById('service-sidebar');
  const allowed = currentUser?.services?.length
    ? SERVICES.filter(s => currentUser.services.includes(s.id))
    : SERVICES;

  let extra = '';
  if (isAdminUser()) {
    extra += `<div style="height:1px;background:var(--border);margin:.75rem .1rem"></div>`;
    extra += `<button id="sidebar-admin-btn" class="sidebar-admin-btn ${currentServiceId === 'admin' ? 'active' : ''}"
      onclick="switchParent('admin')" title="Administration"><span class="sb-icon">⚙️</span><span class="sb-label">Administration</span></button>`;
  }
  extra += `<div style="height:1px;background:var(--border);margin:.75rem .1rem"></div>`;
  extra += `<button class="sidebar-compte-btn ${currentServiceId === 'compte' ? 'active' : ''}"
    onclick="switchParent('compte')" title="Mon compte"><span class="sb-icon">👤</span><span class="sb-label">Mon compte</span></button>`;

  sidebar.innerHTML = allowed.map(s => `
    <button id="sidebar-svc-${s.id}" onclick="switchParent('${s.id}')"
      class="${s.id === currentServiceId ? 'active' : ''}" title="${s.label}">
      <span class="sb-icon">${svcIcon(s.label, s.id)}</span><span class="sb-label">${s.label}</span>
    </button>`).join('') + extra;
}

function toggleServiceSidebar() {
  const wrap = document.getElementById('service-sidebar-wrap');
  if (!wrap) return;
  const collapsed = wrap.classList.toggle('collapsed');
  localStorage.setItem('rc_sidebar_collapsed', collapsed ? '1' : '0');
}
function _applyServiceSidebarCollapsed() {
  const wrap = document.getElementById('service-sidebar-wrap');
  if (!wrap) return;
  const collapsed = localStorage.getItem('rc_sidebar_collapsed') === '1';
  wrap.classList.toggle('collapsed', collapsed);
}

// ── Naviguation principale ────────────────────────────────
async function switchParent(id) {
  currentServiceId = id;
  renderServiceSidebar();

  const allTabContents = ['compte','reservation','admin','agenda','stats','creneaux','params','editions'];
  allTabContents.forEach(t => document.getElementById(`tab-content-${t}`)?.classList.add('hidden'));

  ['tabs-nav-service','tabs-nav-admin','tabs-nav-compte'].forEach(navId => {
    document.getElementById(navId)?.classList.add('hidden');
  });

  if (id === 'compte') {
    switchToCompteView();
  } else if (id === 'admin') {
    document.getElementById('tabs-nav-admin').classList.remove('hidden');
    document.getElementById('tab-content-admin').classList.remove('hidden');
    await loadAdminData();
    if (!authToken) return;
    switchAdminTab(_lastAdminTab);
  } else {
    // Service réel
    _lastRealServiceId = id;
    currentService = SERVICES.find(s => s.id === id);
    _syncShowPreviousFromService();
    if (currentService) {
      recurringMode       = false; // computed below from service_demandeur_settings
      validationMode      = false; // computed below from service_demandeur_settings
      validationBloquante = !!currentService.validation_bloquante;
      themeMode           = false; // computed below from service_demandeur_settings
      maxReservations     = currentService.max_reservations || 3;
      maxReservationsPeriod = currentService.max_reservations_period || 1;
      ponctDuration       = currentService.ponct_duration  || 60;
      recurDuration       = currentService.recur_duration  || 60;
      defaultCapacity     = currentService.ponct_capacity != null ? +currentService.ponct_capacity : 1;
      // Mode jauge : dérivé des paramètres demandeurs (jauge=1 sur au moins un demandeur ponctuel).
      // Le flag service-wide ponct_gauge_enabled a été supprimé.
      gaugeEnabled        = _currentDemSettings.some(function(r) { return !r.recurrent && r.jauge; });
      morningStart        = currentService.morning_start    || '09:00';
      morningEnd          = currentService.morning_end      || '12:00';
      afternoonStart      = currentService.afternoon_start  || '14:00';
      afternoonEnd        = currentService.afternoon_end    || '18:00';
      bookingDelay        = currentService.booking_delay != null ? +currentService.booking_delay : 0;
      autoValidationDelay = currentService.auto_validation_delay != null ? +currentService.auto_validation_delay : 0;
      ACTIVE_DKEYS        = currentService.active_days || ['lun','mar','mer','jeu','ven'];
      DKEYS = ALL_DKEYS.filter(k => ACTIVE_DKEYS.includes(k));
      DAYS  = DKEYS.map(k => ALL_DAYS[ALL_DKEYS.indexOf(k)]);
      renderRecurDaysFilter();
      openOnHolidays     = !!currentService.open_on_holidays;
      SLOTS_REC  = currentService.slots_recurring || [];
      SLOTS_REC_MAP = _buildSlotsMap(SLOTS_REC);
      SLOTS_UNIQ = currentService.slots_unique    || [];
      const [_dr, _tr] = await Promise.all([
        apiGet('/service_demandeur_settings.php?service_id=' + encodeURIComponent(id)),
        apiGet('/service_themes.php?service_id=' + encodeURIComponent(id)),
      ]);
      if (!authToken) return;
      _currentDemSettings = _dr.ok ? _dr.settings : [];
      recurringMode  = _currentDemSettings.some(function(r) { return r.recurrent; });
      validationMode = _currentDemSettings.some(function(r) { return r.validation; });
      themeMode      = _currentDemSettings.some(function(r) { return r.themes; });
      _currentServiceThemesMode = (_tr && _tr.ok && _tr.mode === 'liste') ? 'liste' : 'libre';
      _currentServiceThemesList = (_tr && _tr.ok && Array.isArray(_tr.themes))
        ? _tr.themes.map(function(t) { return String(t.label || ''); }).filter(Boolean)
        : [];
      loadParamsDemandeurs();
      loadParamsThemes();
      // Rafraîchir Paramètres > RGPD si le pane est actuellement actif
      // (la liste dépend de _currentDemSettings qui vient de changer).
      if (document.querySelector('.params-pane.active')?.id === 'pane-rgpd') {
        loadParamsRgpd();
      }
      renderAdminDemInfo();
    }
    if (!authToken) return;
    document.getElementById('tabs-nav-service').classList.remove('hidden');

    // Affichage des onglets selon le rôle
    // gestionnaire + administrateur → Planning, Éditions, Statistiques, Paramètres
    // utilisateur → Réservations (confirmation gérée par modale)
    const managerView = isManagerUser();
    document.getElementById('tab-reservation')?.classList.toggle('hidden', managerView);
    ['tab-agenda','tab-editions','tab-stats','tab-creneaux','tab-params'].forEach(t => {
      document.getElementById(t)?.classList.toggle('hidden', !managerView);
    });
    _applyRecurringMode();
    // Plus de "Planning récurrent" / "Planning" : par défaut le manager arrive sur Agenda.
    if (managerView && _lastServiceTab === 'reservation') {
      _lastServiceTab = 'agenda';
    }
    if (!managerView && _lastServiceTab !== 'reservation') {
      _lastServiceTab = 'reservation';
    }

    pendingSelection = {}; cancelledBookings = []; initialThemes = {}; initialCounts = {};
    userAgendaPeriodIdx = null; userAgendaWeekAnchor = null; userAgendaWeekAB = 'A';
    _editSlotsRec = []; _editSlotsRecMap = {}; _editSlotsUniq = [];
    planningUniqPage = 0;
    _planningPeriodUserPicked = false;
    _capPeriodUserPicked = false;
    _agendaPeriodUserPicked = false;
    await loadPeriods();
    if (!authToken) return;
    renderPeriodFilter();
    await loadUserBookings();
    if (!authToken) return;
    await loadServerCounts();
    if (!authToken) return;
    if (isManagerUser()) await loadAdminData();
    if (!authToken) return;
    switchTab(_lastServiceTab);
  }
}

function _applyRecurringMode() {
  const managerView = isManagerUser();
  document.getElementById('tab-planning-rec')?.classList.toggle('hidden', !managerView || !recurringMode);
  const sec = document.getElementById('section-creneaux-recurrents');
  if (sec) sec.style.display = recurringMode ? '' : 'none';
  // Sous-onglet "Créneaux récurrents" : masqué si le mode récurrent est désactivé pour le service.
  const crTabRec = document.getElementById('cren-tab-rec');
  if (crTabRec) crTabRec.classList.toggle('hidden', !recurringMode);
  if (!recurringMode && _lastCreneauxTab === 'rec') {
    _lastCreneauxTab = 'uniq';
    // Si la pane récurrents est actuellement visible, basculer sur ponctuels.
    if (document.getElementById('pane-cren-rec')?.classList.contains('active')) {
      switchCreneauxTab('uniq');
    }
  }
}

function switchToCompteView() {
  document.getElementById('tabs-nav-compte').classList.remove('hidden');
  document.getElementById('tab-content-compte').classList.remove('hidden');
  document.getElementById('form-profile').classList.remove('hidden');
  document.getElementById('mode-toggle').classList.add('hidden');
  document.getElementById('form-create').classList.add('hidden');
  document.getElementById('form-login').classList.add('hidden');
  renderProfileRead();
}

function switchTab(tab) {
  const allTabs = ['compte','reservation','admin','agenda','stats','creneaux','params','editions'];
  allTabs.forEach(t => {
    document.getElementById(`tab-content-${t}`)?.classList.add('hidden');
    document.getElementById(`tab-${t}`)?.classList.remove('active');
  });
  document.getElementById(`tab-content-${tab}`)?.classList.remove('hidden');
  document.getElementById(`tab-${tab}`)?.classList.add('active');

  if (['reservation','agenda','stats','creneaux','params','editions'].includes(tab)) {
    _lastServiceTab = tab;
  }
  requestAnimationFrame(async () => {
    if (tab === 'reservation') { await refreshDebugMode(); schedulePage = 1; setDefaultSchedulePosition(); await loadServerCounts(); if (_userDem() && !_userDem().open_on_school_holidays) await _loadSchoolHolidaysIfNeeded(); renderSchedule(); }
    if (tab === 'stats')    await renderStatsTab();
    if (tab === 'agenda')   { await refreshDebugMode(); await loadAdminData(); renderAgendaWeekly(); }
    if (tab === 'editions') { await loadAdminData(); renderAdminTable(); }
    if (tab === 'creneaux') { _editSlotsRec = []; _editSlotsRecMap = {}; _editSlotsUniq = []; if (isManagerUser()) await loadAdminData(); _applyRecurringMode(); renderModeToggles(); renderCapTabs(); renderCapEditor(); renderDefaultDurationDisplay(); switchCreneauxTab(_lastCreneauxTab); }
    if (tab === 'params')   { renderDaysCheckboxes(); renderMaxResDisplays(); renderTimeRanges(); renderBookingDelay(); renderValidationBloquante(); renderAutoValidationDelay(); renderPeriodsEditor(); if (!document.querySelector('.params-pane.active')) switchParamTab('periodes'); else if (document.getElementById('pane-demandeurs')?.classList.contains('active')) loadParamsDemandeurs(); else if (document.getElementById('pane-themes')?.classList.contains('active')) loadParamsThemes(); else if (document.getElementById('pane-exercice')?.classList.contains('active')) renderExercicePane(); }
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function switchCreneauxTab(pane) {
  // pane attendu : 'rec' ou 'uniq'.
  // Si le mode récurrent est désactivé pour le service courant, on force 'uniq'.
  if (pane === 'rec' && !recurringMode) pane = 'uniq';
  _lastCreneauxTab = pane;
  document.querySelectorAll('#tab-content-creneaux .cren-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('#tab-content-creneaux .cren-tab').forEach(el => el.classList.remove('active'));
  const p = document.getElementById('pane-cren-' + pane);
  if (p) p.classList.add('active');
  const b = document.getElementById('cren-tab-' + pane);
  if (b) b.classList.add('active');
}

function switchParamTab(pane) {
  document.querySelectorAll('.params-pane').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.params-tab').forEach(btn => btn.classList.remove('active'));
  const p = document.getElementById('pane-' + pane);
  if (p) p.classList.add('active');
  const b = document.querySelector(`.params-tab[data-pane="${pane}"]`);
  if (b) b.classList.add('active');
  if (pane === 'demandeurs') loadParamsDemandeurs();
  if (pane === 'themes')     loadParamsThemes();
  if (pane === 'exercice')   renderExercicePane();
  if (pane === 'rgpd')       loadParamsRgpd();
  _applyExerciceLockToParamPanes();
}

// Verrouille (pointer-events:none + opacity) les sous-onglets quand on consulte un exercice ancien.
// Sur Périodes, le verrou est posé sur des éléments ciblés pour ne PAS toucher la nav (.exercice-nav)
// — un parent grisé (filter/opacity) ne se réinitialise pas correctement sur ses enfants.
function _applyExerciceLockToParamPanes() {
  const locked = !_isOnLatestExercice();
  ['reservations', 'demandeurs'].forEach(name => {
    const p = document.getElementById('pane-' + name);
    if (p) p.classList.toggle('exercice-locked', locked);
  });
  // L'onglet Créneaux est désormais de premier niveau : verrouiller le contenu des panes sans masquer la nav.
  document.querySelectorAll('#tab-content-creneaux .cren-pane').forEach(el => {
    el.classList.toggle('exercice-locked', locked);
  });
  // Sur le pane-exercice, on verrouille un wrapper interne pour préserver la case
  // "Afficher les exercices précédents" qui doit rester active.
  ['periods-editor', 'days-panel', 'exercice-lockable'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('exercice-locked', locked);
  });
  const prAdd = document.querySelector('#pane-periodes .pr-add');
  if (prAdd) prAdd.classList.toggle('exercice-locked', locked);
}

function switchAdminTab(tab) {
  _lastAdminTab = tab;
  ['services','comptes','demandeurs','config','divers','rgpd'].forEach(t => {
    document.getElementById(`tab-content-admin-${t}`)?.classList.add('hidden');
    document.getElementById(`tab-admin-${t}`)?.classList.remove('active');
  });
  document.getElementById(`tab-content-admin-${tab}`)?.classList.remove('hidden');
  document.getElementById(`tab-admin-${tab}`)?.classList.add('active');
  if (tab === 'services')   { renderServicesConfigTable(); }
  if (tab === 'comptes')    renderUserAccountsAdmin();
  if (tab === 'demandeurs') renderDemandeursAdmin();
  if (tab === 'config')     loadMailConfig();
  if (tab === 'divers')     loadDebugConfig();
  if (tab === 'rgpd')       loadAdminRgpd();
}

// ── Onglet Administration > Demandeurs ─────────────────────
// Édition du référentiel global des typologies de demandeur
// (table demandeurs : label + open_on_school_holidays).
let _demandeursAdminRows  = [];   // état affiché (édité)
let _demandeursAdminOrig  = [];   // snapshot serveur pour Annuler / diff
let _demandeursAdminDeleted = []; // ids supprimés à confirmer côté serveur
async function renderDemandeursAdmin() {
  const r = await apiGet('/demandeurs.php?action=list');
  const list = (r.ok ? r.demandeurs : []) || [];
  _demandeursAdminOrig    = list.map(d => ({ ...d }));
  _demandeursAdminRows    = list.map(d => ({ ...d }));
  _demandeursAdminDeleted = [];
  _renderDemandeursAdminTable();
}
function _renderDemandeursAdminTable() {
  const tb = document.getElementById('dem-tbody-admin');
  const empty = document.getElementById('dem-empty-admin');
  if (!tb) return;
  tb.innerHTML = '';
  if (!_demandeursAdminRows.length) {
    empty?.classList.remove('hidden');
  } else {
    empty?.classList.add('hidden');
    _demandeursAdminRows.forEach((row, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML =
        `<td style="text-align:left">
           <input type="text" value="${escHtml(row.label || '')}" oninput="_onDemandeurAdminInput(${idx},'label',this.value)"
             style="width:100%;padding:.2rem .4rem;background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad-sm);color:var(--text);font-size:.82rem">
         </td>
         <td style="text-align:center">
           <input type="checkbox" ${row.open_on_school_holidays ? 'checked' : ''}
             onchange="_onDemandeurAdminInput(${idx},'open_on_school_holidays',this.checked?1:0)"
             title="Coché = Ouvert pendant les vacances scolaires"
             style="accent-color:var(--accent);width:14px;height:14px;cursor:pointer">
         </td>
         <td style="text-align:center">
           <button class="btn btn-ghost" onclick="_deleteDemandeurAdminRow(${idx})"
             style="border-color:rgba(220,80,80,.4);color:#e05555;font-size:.65rem;padding:.15rem .5rem">🗑️</button>
         </td>`;
      tb.appendChild(tr);
    });
  }
  _refreshDemandeursAdminCancelBtn();
}
function _onDemandeurAdminInput(idx, field, value) {
  if (!_demandeursAdminRows[idx]) return;
  _demandeursAdminRows[idx][field] = value;
  _refreshDemandeursAdminCancelBtn();
}
function _deleteDemandeurAdminRow(idx) {
  const row = _demandeursAdminRows[idx];
  if (!row) return;
  if (row.id) _demandeursAdminDeleted.push(row.id);
  _demandeursAdminRows.splice(idx, 1);
  _renderDemandeursAdminTable();
}
function addDemandeurAdmin() {
  _demandeursAdminRows.push({ id: 0, label: '', open_on_school_holidays: 1 });
  _renderDemandeursAdminTable();
}
function cancelDemandeursAdmin() {
  _demandeursAdminRows    = _demandeursAdminOrig.map(d => ({ ...d }));
  _demandeursAdminDeleted = [];
  _renderDemandeursAdminTable();
}
function _isDemandeursAdminDirty() {
  if (_demandeursAdminDeleted.length) return true;
  if (_demandeursAdminRows.length !== _demandeursAdminOrig.length) return true;
  for (let i = 0; i < _demandeursAdminRows.length; i++) {
    const cur = _demandeursAdminRows[i];
    const orig = _demandeursAdminOrig.find(o => o.id === cur.id);
    if (!orig) return true;
    if (cur.label !== orig.label) return true;
    if ((cur.open_on_school_holidays ? 1 : 0) !== (orig.open_on_school_holidays ? 1 : 0)) return true;
  }
  return false;
}
function _refreshDemandeursAdminCancelBtn() {
  const btn = document.getElementById('btn-cancel-demandeurs-admin');
  if (btn) btn.style.display = _isDemandeursAdminDirty() ? '' : 'none';
}
async function saveDemandeursAdmin() {
  // Suppressions
  for (const id of _demandeursAdminDeleted) {
    const r = await apiPost('/demandeurs.php?action=delete', { id });
    if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur suppression')); return; }
  }
  // Créations / mises à jour
  for (const row of _demandeursAdminRows) {
    const label = String(row.label || '').trim();
    if (!label) { showToast('⚠️ Libellé manquant'); return; }
    const open = row.open_on_school_holidays ? 1 : 0;
    if (!row.id) {
      const r = await apiPost('/demandeurs.php?action=create', { label, open_on_school_holidays: open });
      if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur création')); return; }
    } else {
      const orig = _demandeursAdminOrig.find(o => o.id === row.id);
      const changed = !orig || orig.label !== label || (orig.open_on_school_holidays ? 1 : 0) !== open;
      if (changed) {
        const r = await apiPost('/demandeurs.php?action=update', { id: row.id, label, open_on_school_holidays: open });
        if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur mise à jour')); return; }
      }
    }
  }
  showToast('✅ Demandeurs enregistrés');
  await renderDemandeursAdmin();
}

async function setDebugMode(on) {
  debugMode = !!on;
  applyDebugMode();
  await apiPost('/settings.php?action=save', { action: 'save', debug_mode: debugMode ? '1' : '0' });
}
function applyDebugMode() {
  const di = document.getElementById('dem-info');
  if (di) di.style.display = (debugMode && di.innerHTML.trim()) ? 'flex' : 'none';
  ['dem-info-rec','dem-info-planning','dem-info-agenda','dem-info-editions','dem-info-stats','dem-info-params'].forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = (debugMode && el.innerHTML.trim()) ? 'flex' : 'none';
  });
}

// Construit le HTML du bandeau dem-info admin (liste de tous les demandeurs du service)
// Layout en grille : libellés alignés à droite, le caractère "|" et les flags alignés verticalement
function _buildAdminDemInfoHtml() {
  const rows = (_currentDemSettings || []).filter(function(r) { return r.demandeur_id; });
  if (!rows.length) return '';
  const f = function(v, label) { return `<span style="opacity:${v?1:.35}">${label} <strong>${v?'✓':'—'}</strong></span>`; };
  const items = rows.map(function(r) {
    return `<div style="color:var(--text);font-weight:600;text-align:right">${r.label||''}</div>`
      + `<div style="display:flex;align-items:center;gap:.6rem;flex-wrap:wrap">`
        + `<span style="color:var(--border)">|</span>`
        + f(r.recurrent,  'Récurrent')
        + f(r.semaine_ab, 'Sem. A/B')
        + f(r.validation, 'Validation')
        + f(r.themes,     'Thèmes')
        + f(r.jauge,      'Jauge')
      + `</div>`;
  }).join('');
  return `<div style="display:grid;grid-template-columns:auto 1fr;column-gap:.6rem;row-gap:.3rem;align-items:center">${items}</div>`;
}
// Met à jour les bandeaux dem-info des onglets admin (Planning, Éditions, Stats, Paramètres + Planning récurrent)
function renderAdminDemInfo() {
  const html = _buildAdminDemInfoHtml();
  ['dem-info-rec','dem-info-planning','dem-info-agenda','dem-info-editions','dem-info-stats','dem-info-params'].forEach(function(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.innerHTML = html;
    el.style.display = (debugMode && html) ? 'flex' : 'none';
  });
}
async function refreshDebugMode() {
  const r = await apiGet('/auth.php?action=me&_=' + Date.now());
  if (r && r.ok) {
    debugMode = r.config?.debug_mode === '1';
    schoolZone = ['A','B','C'].includes(r.config?.school_zone) ? r.config.school_zone : 'A';
  }
}
async function loadDebugConfig() {
  await refreshDebugMode();
  const cb = document.getElementById('cfg-debug-mode');
  if (cb) cb.checked = debugMode;
  const sel = document.getElementById('cfg-school-zone');
  if (sel) sel.value = schoolZone;
}
async function setSchoolZone(zone) {
  zone = ['A','B','C'].includes(zone) ? zone : 'A';
  schoolZone = zone;
  await apiPost('/settings.php?action=save', { action: 'save', school_zone: zone });
  showToast('✅ Zone enregistrée');
}
async function refreshSchoolHolidays() {
  const info = document.getElementById('cfg-school-info');
  if (info) info.textContent = '⏳ Récupération…';
  const r = await apiPost('/holidays.php?action=refresh_school', { action: 'refresh_school', zone: schoolZone });
  if (!r.ok) {
    showToast('⚠️ ' + (r.error || 'Erreur'));
    if (info) info.textContent = '⚠️ ' + (r.error || 'Erreur');
    return;
  }
  _schoolHolidaysCache = null; _schoolHolidaysCacheZone = null;
  showToast(`✅ ${r.count} période(s) importées (zone ${r.zone})`);
  if (info) info.textContent = `✅ ${r.count} période(s) — zone ${r.zone}`;
}
// ─── Modale « Demandeurs autorisés » ──────────────────────
// Cible courante : { kind: 'rec'|'uniq', slotId } — ligne unique sélectionnée.
let _demModalTarget = null;
function _findSlotById(slotId) {
  return _editSlotsRec.find(s => String(s.id) === String(slotId))
      || _editSlotsUniq.find(s => String(s.id) === String(slotId));
}
function openDemandeursModal(kind, slotId) {
  const slot = _findSlotById(slotId);
  if (!slot) return;
  _demModalTarget = { kind, slotId };
  // Liste : demandeurs rattachés au service courant (via service_demandeur_settings).
  const demRows  = (_currentDemSettings || []).filter(r => r.demandeur_id);
  const selected = new Set((slot.demandeur_ids || []).map(Number));
  const listEl   = document.getElementById('demandeurs-modal-list');
  if (listEl) {
    listEl.innerHTML = demRows.length
      ? demRows.map(r => `
        <label style="display:flex;align-items:center;gap:.35rem;cursor:pointer;font-size:.68rem;padding:.02rem 0;line-height:1.2">
          <input type="checkbox" class="admin-cb dem-modal-cb" data-dem-id="${r.demandeur_id}"${selected.has(Number(r.demandeur_id)) ? ' checked' : ''} style="accent-color:var(--accent);width:10px;height:10px">
          ${r.label || ('Demandeur #' + r.demandeur_id)}
        </label>`).join('')
      : '<p style="font-size:.78rem;color:var(--muted);font-style:italic">Aucun demandeur n\'est rattaché à ce service. Configurez-les dans Paramètres &gt; Demandeurs.</p>';
  }
  document.getElementById('demandeurs-modal')?.classList.add('open');
}
function closeDemandeursModal() {
  document.getElementById('demandeurs-modal')?.classList.remove('open');
  _demModalTarget = null;
}
async function saveDemandeursModal() {
  if (!_demModalTarget) return;
  const { kind, slotId } = _demModalTarget;
  const ids = [...document.querySelectorAll('#demandeurs-modal-list .dem-modal-cb:checked')]
    .map(cb => parseInt(cb.dataset.demId, 10))
    .filter(n => !isNaN(n));
  // Créneau déjà en base : on persiste immédiatement (sinon l'écriture sera embarquée
  // dans le prochain enregistrement de l'éditeur, cf. slots.php?action=save).
  const savedRecIds  = new Set(Object.values(SLOTS_REC_MAP || {}).flat().map(s => String(s.id)));
  const savedUniqIds = new Set((SLOTS_UNIQ || []).map(s => String(s.id)));
  const isSaved = savedRecIds.has(String(slotId)) || savedUniqIds.has(String(slotId));
  if (isSaved) {
    const r = await apiPost('/slots.php?action=set_demandeurs', { slot_id: slotId, demandeur_ids: ids });
    if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  }
  // Mettre à jour le buffer local pour refléter immédiatement le changement.
  const slot = _findSlotById(slotId);
  if (slot) slot.demandeur_ids = ids.slice();
  // Si le slot modifié est un récurrent → propager aux miroirs en mémoire (ils héritent).
  if (kind === 'rec') {
    _editSlotsUniq.forEach(s => {
      if (String(s.parent_slot_id) === String(slotId)) s.demandeur_ids = ids.slice();
    });
  }
  closeDemandeursModal();
  showToast(isSaved ? '✅ Demandeurs mis à jour' : '✅ Demandeurs définis — à enregistrer avec le créneau');
  if (kind === 'rec') renderCapEditorRec(); else renderCapEditorUniq();
}

// Section « Dates correspondantes » : sa visibilité est désormais pilotée par la sélection
// dans le tableau des récurrents (cf. renderCapEditorMir). Aucune préférence persistée.

// ── Chargement des réservations de l'utilisateur ──────────
async function loadUserBookings() {
  if (!currentUser || !currentServiceId || currentServiceId === 'admin' || currentServiceId === 'compte') return;
  const r = await apiGet(`/bookings.php?action=list&service_id=${currentServiceId}`);
  if (!r.ok) return;
  // Convertir au format pendingSelection
  pendingSelection = {}; cancelledBookings = []; initialThemes = {}; initialCounts = {};
  const _udRec = !!_userDem()?.recurrent;
  if (_udRec) {
    r.bookings.forEach(b => {
      const pKey = String(b.period_id);
      if (!pendingSelection[pKey]) pendingSelection[pKey] = [];
      pendingSelection[pKey].push({
        slotId: b.slot_id, slotLabel: slotLabel(_getUserSlots().find(s=>s.id===b.slot_id)||{id:b.slot_id}),
        day: b.day_key, dayLabel: DAYS[DKEYS.indexOf(b.day_key)] || b.day_key,
        week: b.week || '',
        themeLabel: b.theme_label || '', enfants: b.enfants ?? 0, accompagnants: b.accompagnants ?? 0,
        validated: b.validated, bookingId: b.id,
      });
      initialThemes[b.id] = b.theme_label || '';
      initialCounts[b.id] = { enfants: b.enfants ?? 0, accompagnants: b.accompagnants ?? 0 };
    });
  } else {
    pendingSelection['unique'] = r.bookings_unique.map(b => ({
      slotId: b.slot_id, slotLabel: slotLabel(SLOTS_UNIQ.find(s=>s.id===b.slot_id)||{id:b.slot_id}),
      dayLabel: '—', themeLabel: b.theme_label || '', enfants: b.enfants ?? 0, accompagnants: b.accompagnants ?? 0,
      validated: b.validated, bookingId: b.id, recurringBookingId: b.recurring_booking_id || null,
    }));
    r.bookings_unique.forEach(b => {
      initialThemes[b.id] = b.theme_label || '';
      initialCounts[b.id] = { enfants: b.enfants ?? 0, accompagnants: b.accompagnants ?? 0 };
    });
  }
}

// ── Chargement du comptage serveur ────────────────────────
async function loadServerCounts() {
  serverCounts = {}; // réinitialiser pour éviter des données obsolètes
  serverGaugeSums = {};
  if (!currentServiceId || currentServiceId === 'admin' || currentServiceId === 'compte') return;
  const r = await apiGet(`/bookings.php?action=count&service_id=${currentServiceId}`);
  if (r.ok) { serverCounts = r.counts || {}; serverGaugeSums = r.gauge_sums || {}; }
}

// ── Getters de créneaux ───────────────────────────────────
function _buildSlotsMap(slots) {
  const map = {};
  for (const sl of slots) {
    if (sl.caps && !sl.cap) {
      sl.cap = {};
      for (const c of sl.caps.split('|')) {
        const [day, cap] = c.split(':');
        if (day) sl.cap[day] = parseInt(cap) || 0;
      }
    } else if (!sl.cap) {
      sl.cap = {};
    }
    const pid = String(sl.period_id ?? '');
    if (pid) {
      if (!map[pid]) map[pid] = [];
      map[pid].push(sl);
    }
  }
  return map;
}
function getSlots() {
  if (recurringMode) {
    const pid = String(PERIODS[activePeriodIdx]?.id ?? '');
    return SLOTS_REC_MAP[pid] || [];
  }
  return SLOTS_UNIQ;
}
function _userDem() {
  const demId = +(currentUser?.demandeur_id ?? 0);
  return _currentDemSettings.find(function(r) { return r.demandeur_id === demId; }) || null;
}
function _getUserSlots() {
  const dem = _userDem();
  if (dem?.recurrent) {
    const pid = String(PERIODS[activePeriodIdx]?.id ?? '');
    return SLOTS_REC_MAP[pid] || [];
  }
  return SLOTS_UNIQ;
}

function slotLabel(sl) {
  if (!sl) return '—';
  const s = displayTime(sl.start_time || '');
  const e = displayTime(sl.end_time   || '');
  return s && e ? `${s} – ${e}` : 'Journée entière';
}
function displayTime(val) { return val ? val.slice(0, 5) : ''; }
// Normalise une chaîne pour recherche insensible aux accents et à la casse :
// "École Élève" → "ecole eleve". À utiliser des deux côtés (terme recherché +
// valeurs à comparer) pour que "ele" matche "Élève".
function _normSearch(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
function parseTime(val)   { if (!val) return ''; const m = val.trim().replace('h',':').match(/^(\d{1,2}):?(\d{2})$/); return m ? m[1].padStart(2,'0')+':'+m[2] : ''; }

// Incrément/décrément de 15 minutes sur un champ heure (texte HH:MM).
// Récupère l'input par ID, ajuste la valeur, déclenche l'événement `input` pour notifier les listeners.
function timeStep(inputId, delta) {
  const el = document.getElementById(inputId);
  if (!el || el.disabled || el.readOnly) return;
  const v = (el.value || '').trim().replace('h', ':');
  let h = 9, m = 0;
  const match = v.match(/^(\d{1,2}):(\d{1,2})$/);
  if (match) { h = parseInt(match[1], 10); m = parseInt(match[2], 10); }
  let total = h * 60 + m + delta;
  total = ((total % 1440) + 1440) % 1440; // wrap [0..1439]
  const nh = String(Math.floor(total / 60)).padStart(2, '0');
  const nm = String(total % 60).padStart(2, '0');
  el.value = `${nh}:${nm}`;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
// Clic maintenu sur les flèches : 1er tick immédiat, puis répétition après 400 ms toutes les 80 ms.
let _timeStepHoldTimer = null;
let _timeStepHoldInterval = null;
function _startTimeStepHold(inputId, delta, ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  _stopTimeStepHold();
  timeStep(inputId, delta);
  _timeStepHoldTimer = setTimeout(() => {
    _timeStepHoldInterval = setInterval(() => timeStep(inputId, delta), 80);
  }, 400);
}
function _stopTimeStepHold() {
  if (_timeStepHoldTimer)    { clearTimeout(_timeStepHoldTimer);     _timeStepHoldTimer    = null; }
  if (_timeStepHoldInterval) { clearInterval(_timeStepHoldInterval); _timeStepHoldInterval = null; }
}
// Filet de sécurité : si la souris est relâchée hors d'un bouton, on stoppe quand même la répétition.
if (typeof window !== 'undefined' && !window._timeStepHoldGlobalBound) {
  window.addEventListener('mouseup',   _stopTimeStepHold);
  window.addEventListener('touchend',  _stopTimeStepHold);
  window.addEventListener('touchcancel', _stopTimeStepHold);
  window._timeStepHoldGlobalBound = true;
}

// ── Hold-to-repeat pour les spinners de la gauge (enfants / adultes) ──
let _gaugeSpinHoldTimer    = null;
let _gaugeSpinHoldInterval = null;
function _stopGaugeSpinHold() {
  if (_gaugeSpinHoldTimer)    { clearTimeout(_gaugeSpinHoldTimer);     _gaugeSpinHoldTimer    = null; }
  if (_gaugeSpinHoldInterval) { clearInterval(_gaugeSpinHoldInterval); _gaugeSpinHoldInterval = null; }
}
function _startGaugeSpinHold(step) {
  _stopGaugeSpinHold();
  step();
  _gaugeSpinHoldTimer = setTimeout(() => {
    _gaugeSpinHoldInterval = setInterval(step, 80);
  }, 400);
}
if (typeof window !== 'undefined' && !window._gaugeSpinHoldGlobalBound) {
  window.addEventListener('mouseup',     _stopGaugeSpinHold);
  window.addEventListener('touchend',    _stopGaugeSpinHold);
  window.addEventListener('touchcancel', _stopGaugeSpinHold);
  window._gaugeSpinHoldGlobalBound = true;
}
// Génère les 2 flèches haut/bas accolées à un champ heure (id obligatoire pour timeStep).
function _timeStepBtns(inputId, disabled) {
  const dis = disabled ? ' disabled' : '';
  const u = `onmousedown="_startTimeStepHold('${inputId}', 15, event)" ontouchstart="_startTimeStepHold('${inputId}', 15, event)" onmouseleave="_stopTimeStepHold()"`;
  const d = `onmousedown="_startTimeStepHold('${inputId}', -15, event)" ontouchstart="_startTimeStepHold('${inputId}', -15, event)" onmouseleave="_stopTimeStepHold()"`;
  return `<span class="time-step-btns"><button type="button" class="time-step-btn" tabindex="-1"${dis} ${u}>▲</button><button type="button" class="time-step-btn" tabindex="-1"${dis} ${d}>▼</button></span>`;
}
function sortedByTime(slots) {
  return [...slots].sort((a,b) => (parseTime(a.start_time)||'99:99').localeCompare(parseTime(b.start_time)||'99:99'));
}
function fmtDate(dateVal) {
  if (!dateVal) return '—';
  const d = new Date(dateVal + 'T12:00:00');
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'long' });
  const day     = d.toLocaleDateString('fr-FR', { day: 'numeric' });
  const month   = d.toLocaleDateString('fr-FR', { month: 'long' });
  const year    = d.getFullYear();
  return `${weekday.charAt(0).toUpperCase() + weekday.slice(1)} ${day} ${month} ${year}`;
}

// ── Comptes de places occupées ────────────────────────────
// Structure récurrente : serverCounts[periodId][slotId][dayKey][week] = N
// (week='' = pas de mode A/B sur ce slot ; week='A' ou 'B' = booking pour cette semaine).
// Si `week` n'est pas précisé, on somme toutes les semaines (compat ancienne lecture).
function _sumOverWeeks(node, week) {
  if (!node) return 0;
  if (typeof node === 'number') return node; // tolère ancien format pré-migration
  if (week !== undefined && week !== null) return node[week] || 0;
  return Object.values(node).reduce((a, b) => a + (b || 0), 0);
}
function countTaken(periodId, slotId, dayKey, week) {
  if (!serverCounts) return 0;
  if (recurringMode) return _sumOverWeeks(serverCounts[periodId]?.[slotId]?.[dayKey], week);
  return serverCounts[slotId] || 0;
}
function countGaugeSum(periodId, slotId, dayKey, week) {
  if (!serverGaugeSums) return 0;
  if (recurringMode) return _sumOverWeeks(serverGaugeSums[periodId]?.[slotId]?.[dayKey], week);
  return serverGaugeSums[slotId] || 0;
}
// Retourne le nombre de réservations (et la somme jauge) "déjà retirées" du créneau
// (slotId, dayKey) côté UI mais pas encore confirmées serveur, afin d'afficher
// immédiatement les places libérées. Couvre :
//   - les bookings déplacés DEPUIS ce créneau (pendingSelection avec bk.moved)
//   - les bookings supprimés ou coupés (pendingCancellations)
// Quand dayKey === null on raisonne sur un créneau ponctuel (slot_id seul).
function _movedAwayAdjustment(slotId, dayKey) {
  let count = 0, gaugeSum = 0;
  // 1. Réservations déplacées vers un autre créneau
  for (const arr of Object.values(pendingSelection)) {
    for (const bk of (arr || [])) {
      if (bk.moved && bk.originalSlotId === slotId && (dayKey == null || bk.originalDay === dayKey)) {
        count++;
        gaugeSum += (parseInt(bk.enfants) || 0) + (parseInt(bk.accompagnants) || 0);
      }
    }
  }
  // 2. Réservations supprimées / coupées (annulations en attente sur ce créneau).
  // Les infos slot/day/jauge sont stockées dans pendingCancellations au moment de
  // l'annulation (cf. selectSlot / selectSlotUnique / ctx Couper) — pas besoin de
  // ré-interroger allBookings (vide pour un user non-admin).
  const isUniqCtx = (dayKey == null);
  for (const c of pendingCancellations) {
    if (isUniqCtx && c.type === 'unique' && c.slotId === slotId) {
      count++;
      gaugeSum += (parseInt(c.enfants) || 0) + (parseInt(c.accompagnants) || 0);
    } else if (!isUniqCtx && c.type === 'recurring' && c.slotId === slotId && c.dayKey === dayKey) {
      count++;
      gaugeSum += (parseInt(c.enfants) || 0) + (parseInt(c.accompagnants) || 0);
    }
  }
  return { count, gaugeSum };
}
function getCapacity(slotId, periodId, dayKey) {
  if (recurringMode) {
    const pid  = String(periodId);
    // Fallback sur _FULL : SLOTS_REC_MAP n'est pas rechargé par loadAdminData ni après un
    // cycle, donc il peut être vide pour les périodes d'un exercice fraîchement créé ou
    // d'un exercice passé sur lequel on navigue.
    const slot = (SLOTS_REC_MAP[pid] || SLOTS_REC_MAP_FULL[pid] || []).find(s => s.id === slotId);
    if (!slot || !(dayKey in (slot.cap || {}))) return null;
    return slot.cap[dayKey];
  }
  const slot = SLOTS_UNIQ.find(s => s.id === slotId)
            || SLOTS_UNIQ_FULL.find(s => s.id === slotId);
  return slot?.capacity ?? 1;
}

// ── Filtre période dans le tableau admin ──────────────────
function renderPeriodFilter() {
  const sel = document.getElementById('admin-filter-period');
  if (!sel) return;
  sel.innerHTML = '<option value="">Toutes les périodes</option>'
    + PERIODS.map(p => p.state === 'actif' ? `<option value="${p.id}">${p.label}</option>` : '').join('');
}

// ── Rendu du planning de réservation ──────────────────────
function renderPeriodTabs() {
  const el = document.getElementById('period-tabs');
  if (!el) return; // tableau de réservations supprimé
  el.innerHTML = '';
  PERIODS.forEach((p, i) => {
    if (p.state !== 'actif') return;
    const pKey = String(p.id);
    const hasBk = pendingSelection[pKey]?.length > 0;
    const btn = document.createElement('button');
    btn.className = 'period-btn' + (i === activePeriodIdx ? ' active' : '') + (hasBk ? ' has-booking' : '');
    btn.innerHTML = `<span class="period-badge"></span>${p.label}`;
    if (!hasBk) btn.style.setProperty('--period-color', p.color || '#6dceaa');
    btn.onclick = () => { activePeriodIdx = i; schedulePage = 1; renderSchedule(); };
    btn.addEventListener('dragover',  e => { if (_userDragData?.type === 'recurring') e.preventDefault(); });
    btn.addEventListener('dragenter', e => _userOnDragEnterTab(e, i));
    btn.addEventListener('dragleave', e => _userOnDragLeaveTab(e));
    el.appendChild(btn);
  });
}

// Maintien d'un bouton ◀/▶ de navigation semaine : déclenche la fonction à intervalle
// régulier tant que le bouton est pressé. Le 1er shift est fait par le onclick natif ;
// on ne programme ici que la répétition après le délai initial. Si le bouton devient
// disabled (limite atteinte côté "Masquer les horaires sans..."), la boucle s'arrête.
let _weekShiftHoldTimer = null;
let _weekShiftHoldInterval = null;
function _startWeekShiftHold(fnName, delta, btnId, ev) {
  if (ev && ev.preventDefault) ev.preventDefault();
  _stopWeekShiftHold();
  const tick = () => {
    const btn = btnId ? document.getElementById(btnId) : null;
    if (btn && btn.disabled) { _stopWeekShiftHold(); return; }
    const fn = window[fnName];
    if (typeof fn === 'function') fn(delta);
  };
  _weekShiftHoldTimer = setTimeout(() => {
    _weekShiftHoldInterval = setInterval(tick, 250);
  }, 400);
}
function _stopWeekShiftHold() {
  if (_weekShiftHoldTimer)    { clearTimeout(_weekShiftHoldTimer);     _weekShiftHoldTimer    = null; }
  if (_weekShiftHoldInterval) { clearInterval(_weekShiftHoldInterval); _weekShiftHoldInterval = null; }
}
if (typeof window !== 'undefined' && !window._weekShiftHoldGlobalBound) {
  window.addEventListener('mouseup',     _stopWeekShiftHold);
  window.addEventListener('touchend',    _stopWeekShiftHold);
  window.addEventListener('touchcancel', _stopWeekShiftHold);
  window._weekShiftHoldGlobalBound = true;
}

function _pgDragNav(btn, canNavigate, navigate) {
  let timer = null;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } btn.classList.remove('pg-drag-hover'); };
  btn.addEventListener('dragover', e => {
    if (!_userDragData) return;
    e.preventDefault();
    if (!timer && canNavigate()) {
      btn.classList.add('pg-drag-hover');
      timer = setTimeout(() => { clear(); if (canNavigate()) navigate(); }, 700);
    }
  });
  btn.addEventListener('dragleave', clear);
  btn.addEventListener('drop', clear);
}

function renderPagination(total, onPageChange) {
  const el = document.getElementById('schedule-pagination');
  if (!el) return;
  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (schedulePage > totalPages) schedulePage = totalPages;
  if (schedulePage < 1) schedulePage = 1;
  el.innerHTML = '';

  // Format compact "‹ X / Y ›" (aligné sur le tableau Comptes utilisateurs).
  // Le drag-and-drop hover (auto-nav après 700ms en glissant un slot) reste
  // attaché aux boutons prev/next pour préserver l'UX du planning.
  const prev = document.createElement('button');
  prev.className = 'btn btn-ghost';
  prev.style.cssText = 'padding:.1rem .45rem;font-size:.72rem';
  prev.textContent = '‹';
  prev.disabled = schedulePage <= 1;
  prev.onclick = () => { schedulePage--; onPageChange(); };
  _pgDragNav(prev, () => schedulePage > 1, () => { schedulePage--; onPageChange(); });
  el.appendChild(prev);

  const info = document.createElement('span');
  info.style.cssText = 'font-size:.7rem;color:var(--muted)';
  info.textContent = `${schedulePage} / ${totalPages}`;
  el.appendChild(info);

  const next = document.createElement('button');
  next.className = 'btn btn-ghost';
  next.style.cssText = 'padding:.1rem .45rem;font-size:.72rem';
  next.textContent = '›';
  next.disabled = schedulePage >= totalPages;
  next.onclick = () => { schedulePage++; onPageChange(); };
  _pgDragNav(next, () => schedulePage < totalPages, () => { schedulePage++; onPageChange(); });
  el.appendChild(next);

  // Centrer la pagination sur la largeur réelle du tableau
  requestAnimationFrame(() => {
    const tbl = document.getElementById('schedule-table');
    if (tbl) el.style.width = tbl.offsetWidth + 'px';
  });
}

// Idx de la période active contenant la date du jour, ou -1 si aucune
function _currentPeriodIdx() {
  const today = new Date().toISOString().slice(0, 10);
  return PERIODS.findIndex(p => p.state === 'actif' && p.date_start && p.date_end && today >= p.date_start && today <= p.date_end);
}
// Idx de la première période active dans l'ordre (par défaut quand la date du jour ne match aucune)
function _firstActivePeriodIdx() {
  return PERIODS.findIndex(p => p.state === 'actif');
}
// Idx de la période à présélectionner : celle qui contient aujourd'hui, ou la 1ère active à défaut.
function _defaultPeriodIdx() {
  const idx = _currentPeriodIdx();
  return idx !== -1 ? idx : _firstActivePeriodIdx();
}
// Auto-positionne planningPeriodIdx sur la période en cours tant que l'utilisateur n'en a pas choisi une
function _ensurePlanningPeriodDefault() {
  if (_planningPeriodUserPicked) return;
  const idx = _defaultPeriodIdx();
  if (idx !== -1 && idx < PERIODS.length) planningPeriodIdx = idx;
}
// Idem pour capPeriodIdx (Créneaux récurrents — Paramètres)
function _ensureCapPeriodDefault() {
  if (_capPeriodUserPicked) return;
  const idx = _defaultPeriodIdx();
  if (idx !== -1 && idx < PERIODS.length) capPeriodIdx = idx;
}

// AGENDA — la periode est choisie par mois/jour uniquement (annee ignoree), pour
// retomber sur la bonne saison meme si l'exercice / les dates des periodes sont
// configurees pour une autre annee.
function _periodMatchesTodayIgnoreYear(p) {
  if (!p.date_start || !p.date_end) return false;
  const d = new Date();
  const today = String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const start = p.date_start.slice(5); // 'YYYY-MM-DD' -> 'MM-DD'
  const end   = p.date_end.slice(5);
  // Cas standard (la periode reste dans une seule annee civile).
  if (start <= end) return start <= today && today <= end;
  // Cas chevauchant le 1er janvier (ex periode oct -> janv).
  return today >= start || today <= end;
}
function _currentAgendaPeriodIdx() {
  return PERIODS.findIndex(p =>
    p.state === 'actif'
    && (!currentExerciceId || p.exercice_id === currentExerciceId)
    && _periodMatchesTodayIgnoreYear(p)
  );
}
function _firstAgendaPeriodIdx() {
  return PERIODS.findIndex(p =>
    p.state === 'actif' && (!currentExerciceId || p.exercice_id === currentExerciceId)
  );
}
function _ensureAgendaPeriodDefault() {
  if (_agendaPeriodUserPicked) return;
  let idx = _currentAgendaPeriodIdx();
  if (idx === -1) idx = _firstAgendaPeriodIdx();
  if (idx !== -1 && idx < PERIODS.length) agendaPeriodIdx = idx;
}

function setDefaultSchedulePosition() {
  const today = new Date().toISOString().slice(0, 10);
  if (!!_userDem()?.recurrent) {
    const idx = _defaultPeriodIdx();
    if (idx !== -1) activePeriodIdx = idx;
  } else {
    const sorted = [...SLOTS_UNIQ].sort((a, b) => {
      if (!a.slot_date && !b.slot_date) return 0;
      if (!a.slot_date) return 1; if (!b.slot_date) return -1;
      return a.slot_date < b.slot_date ? -1 : 1;
    });
    const idx = sorted.findIndex(s => s.slot_date && s.slot_date >= today);
    if (idx !== -1) schedulePage = Math.floor(idx / 10) + 1;
  }
}

function renderSchedule() {
  if (!currentUser) return;
  _syncDemandeurExercice();
  const _ud = _userDem();
  const userRecurring = !!_ud?.recurrent;
  const userGauge     = !!_ud?.jauge;

  const lbl = document.getElementById('max-res-label');
  if (lbl) {
    if (userRecurring) {
      const perPeriod = `<strong>${maxReservationsPeriod} créneau${maxReservationsPeriod>1?'x':''} par période</strong>`;
      const perAn   = `<strong>${maxReservations} créneau${maxReservations>1?'x':''} par an</strong>`;
      lbl.innerHTML = `Vous pouvez réserver ${perPeriod} et ${perAn}.`;
    } else {
      const perAn = `<strong>${maxReservations} séance${maxReservations>1?'s':''} par an</strong>`;
      lbl.innerHTML = `Vous pouvez réserver ${perAn}.`;
    }
  }
  const demInfo = document.getElementById('dem-info');
  if (demInfo) {
    const f = (v, label) => `<span style="opacity:${v?1:.35}">${label} <strong>${v?'✓':'—'}</strong></span>`;
    if (_ud) {
      demInfo.innerHTML =
        `<span style="color:var(--text);font-weight:600">${_ud.label}</span>` +
        `<span style="color:var(--border)">|</span>` +
        f(_ud.recurrent,  'Récurrent') +
        f(_ud.semaine_ab, 'Sem. A/B') +
        f(_ud.validation, 'Validation') +
        f(_ud.themes,     'Thèmes') +
        f(_ud.jauge,      'Jauge');
    } else {
      const rows = (_currentDemSettings || []).filter(function(r) { return r.demandeur_id; });
      demInfo.innerHTML = rows.map(function(r) {
        return `<span style="display:inline-flex;align-items:center;gap:.6rem;flex-wrap:wrap">`
          + `<span style="color:var(--text);font-weight:600">${r.label||''}</span>`
          + `<span style="color:var(--border)">|</span>`
          + f(r.recurrent,  'Récurrent')
          + f(r.semaine_ab, 'Sem. A/B')
          + f(r.validation, 'Validation')
          + f(r.themes,     'Thèmes')
          + f(r.jauge,      'Jauge')
          + `</span>`;
      }).join('<span style="color:var(--border);margin:0 .4rem">·</span>');
    }
    demInfo.style.display = (debugMode && demInfo.innerHTML.trim()) ? 'flex' : 'none';
  }

  // L'ancien tableau de réservations a été supprimé : tout passe désormais par l'agenda
  // utilisateur (#user-agenda-wrap) qui gère lui-même affichage, sélection et drag&drop.
  renderUserAgenda();
  updateConfirmBtn();
}

function renderScheduleUnique() {
  // L'ancien tableau ponctuel a été supprimé : on rafraîchit juste l'agenda utilisateur.
  renderUserAgenda();
  updateConfirmBtn();
}

// ── Vue agenda côté utilisateur (sous le tableau de réservations) ────────
// Reprend la grille de l'agenda admin mais chaque créneau affiche les mêmes
// icones et infos de disponibilité que le tableau de réservations (📆 + places,
// ✅ Validé, ⏳ En attente, Complet). Mode choisi automatiquement selon le
// demandeur du user : récurrent → modèle de période ; sinon → semaine en cours.
//
// État indépendant du tableau de réservation : `userAgendaPeriodIdx` et
// `userAgendaWeekAnchor` permettent à l'utilisateur de naviguer dans l'agenda
// sans toucher au tableau du dessus (et vice-versa).
function _userAgendaSelectPeriod(idx) {
  userAgendaPeriodIdx = idx;
  // En realweek (demandeur non-récurrent), basculer la semaine vers le lundi qui
  // couvre le début de la nouvelle période, sinon l'utilisateur clique sur un onglet
  // sans rien voir changer.
  const p = PERIODS[idx];
  if (p && !_userDem()?.recurrent && p.date_start) {
    userAgendaWeekAnchor = _agendaMondayOf(p.date_start);
  }
  renderUserAgenda();
}
function shiftUserAgendaWeek(delta) {
  if (!userAgendaWeekAnchor) userAgendaWeekAnchor = _agendaMondayOf(new Date());
  let newAnchor = _agendaAddDays(userAgendaWeekAnchor, delta * 7);
  // Quand "Afficher les horaires sans créneau" est DÉCOCHÉ, on saute aux semaines AYANT
  // au moins un créneau (selon SLOTS_UNIQ_FULL / SLOTS_UNIQ, hors créneaux désactivés et
  // vacances scolaires si le demandeur les exclut). Si plus aucune semaine ne porte de
  // créneau dans la direction demandée, on garde la semaine "naturelle" (delta × 7 jours).
  if (!userAgendaShowEmptySlots && delta !== 0) {
    const ud = _userDem();
    const hideSchool = !!(ud && !ud.open_on_school_holidays);
    const uniqSrc = (SLOTS_UNIQ_FULL && SLOTS_UNIQ_FULL.length) ? SLOTS_UNIQ_FULL : SLOTS_UNIQ;
    const dates = (uniqSrc || [])
      .filter(sl => (!sl.state || sl.state === 'actif') && sl.slot_date)
      .filter(sl => !hideSchool || !_isSchoolVacance(sl.slot_date))
      .map(sl => sl.slot_date);
    if (dates.length) {
      const step = delta > 0 ? 7 : -7;
      const MAX_ITER = 260; // ~5 ans, garde-fou
      let iter = 0;
      while (iter++ < MAX_ITER) {
        const sunday = _agendaAddDays(newAnchor, 6);
        const hasSlot = dates.some(d => d >= newAnchor && d <= sunday);
        if (hasSlot) break;
        const limitOk = delta > 0
          ? dates.some(d => d > sunday)
          : dates.some(d => d < newAnchor);
        if (!limitOk) break; // plus de semaines avec créneaux dans cette direction
        newAnchor = _agendaAddDays(newAnchor, step);
      }
    }
  }
  // Clamp à la période active actuelle (cohérence avec les onglets visibles en realweek) :
  // si le shift (potentiellement amplifié par le skip-empty) sort de la période, on annule.
  // Source de vérité = userAgendaPeriodIdx (l'onglet sélectionné).
  if (!_userDem()?.recurrent) {
    const curActive = (userAgendaPeriodIdx !== null ? PERIODS[userAgendaPeriodIdx] : null)
      || _agendaPeriodCoveringDate(userAgendaWeekAnchor)
      || _agendaPeriodCoveringDate(_agendaAddDays(userAgendaWeekAnchor, 3))
      || null;
    if (curActive && curActive.date_start && curActive.date_end) {
      const newSunday = _agendaAddDays(newAnchor, 6);
      if (newAnchor > curActive.date_end || newSunday < curActive.date_start) return;
    }
  }
  userAgendaWeekAnchor = newAnchor;
  renderUserAgenda();
}
function resetUserAgendaWeekToToday() {
  userAgendaWeekAnchor = _agendaMondayOf(new Date());
  // Bascule l'onglet période actif sur celle qui contient aujourd'hui (si demandeur
  // non-recurrent : aligne le contexte realweek avec la nouvelle ancre).
  const todayYmd = _agendaYmdLocal(new Date());
  const idx = PERIODS.findIndex(p => p.state === 'actif'
    && p.date_start && p.date_end
    && todayYmd >= p.date_start && todayYmd <= p.date_end);
  if (idx !== -1) userAgendaPeriodIdx = idx;
  renderUserAgenda();
}
function setUserAgendaWeekAB(wk) {
  userAgendaWeekAB = (wk === 'B') ? 'B' : 'A';
  renderUserAgenda();
}

function renderUserAgenda() {
  const wrapEl = document.getElementById('user-agenda-wrap');
  const gridEl = document.getElementById('user-agenda-grid');
  if (!wrapEl || !gridEl) return;
  if (!currentUser) { wrapEl.style.display = 'none'; return; }
  const ud = _userDem();
  if (!ud) { wrapEl.style.display = 'none'; return; }
  wrapEl.style.display = '';

  const userRecurring = !!ud.recurrent;
  const userGauge     = !!ud.jauge;
  const userAbMode    = !!ud.semaine_ab;
  const mode = userRecurring ? 'model' : 'realweek';

  // Toolbar : onglets période toujours visibles (même en realweek), week-nav uniquement en realweek.
  const tabsEl    = document.getElementById('user-agenda-period-tabs');
  const weekNavEl = document.getElementById('user-agenda-week-nav');
  const abToggleEl = document.getElementById('user-agenda-ab-toggle');
  if (tabsEl)     tabsEl.style.display     = '';
  if (weekNavEl)  weekNavEl.style.display  = (mode === 'realweek') ? 'flex' : 'none';
  // Synchro de la checkbox "Afficher les horaires sans créneau" avec l'état global.
  const showEmptyCb = document.getElementById('user-agenda-show-empty');
  if (showEmptyCb) showEmptyCb.checked = !!userAgendaShowEmptySlots;
  // Toggle A/B : uniquement en mode modèle et si le demandeur est en mode AB.
  // En realweek, A/B est déduit de la date, pas besoin de sélecteur.
  if (abToggleEl) abToggleEl.style.display = (userAbMode && mode === 'model') ? '' : 'none';
  if (userAbMode && mode === 'model') {
    document.getElementById('user-agenda-ab-A')?.classList.toggle('active', userAgendaWeekAB === 'A');
    document.getElementById('user-agenda-ab-B')?.classList.toggle('active', userAgendaWeekAB === 'B');
  }

  let activePeriod = null;
  let weekAnchor   = null;
  let effectiveAB  = null;
  if (mode === 'model') {
    // Initialise l'index local depuis activePeriodIdx au premier rendu (avant tout clic).
    if (userAgendaPeriodIdx === null) userAgendaPeriodIdx = activePeriodIdx;
    // Recale si la période ciblée n'est plus active (ex. après changement d'exercice).
    if (!PERIODS[userAgendaPeriodIdx] || PERIODS[userAgendaPeriodIdx].state !== 'actif') {
      const fb = PERIODS.findIndex(p => p.state === 'actif');
      if (fb !== -1) userAgendaPeriodIdx = fb;
    }
    activePeriod = PERIODS[userAgendaPeriodIdx] || PERIODS.find(p => p.state === 'actif') || null;

    // En mode modèle, le toggle Semaine A/B détermine la semaine effective.
    if (userAbMode) effectiveAB = userAgendaWeekAB;

    // Onglets période (uniquement les périodes actives — alignée sur le tableau de résa).
    if (tabsEl) {
      tabsEl.innerHTML = PERIODS.map((p, i) => {
        if (p.state !== 'actif') return '';
        const pKey   = String(p.id);
        const hasBk  = pendingSelection[pKey]?.length > 0;
        const colorVar = !hasBk ? `--period-color:${p.color || '#6dceaa'}` : '';
        return `<button class="period-btn ${i === userAgendaPeriodIdx ? 'active' : ''}${hasBk ? ' has-booking' : ''}"
          style="${colorVar}"
          onclick="_userAgendaSelectPeriod(${i})">
          <span class="period-badge"></span>${p.label}
        </button>`;
      }).join('');
    }

    if (!activePeriod) { gridEl.innerHTML = '<p class="no-booking-msg">Aucune période disponible.</p>'; return; }
  } else {
    if (!userAgendaWeekAnchor) {
      // Initialise sur la semaine du premier créneau ponctuel à venir (ou aujourd'hui si rien).
      // Sans ça, si l'utilisateur n'a aucun créneau cette semaine il aurait à cliquer ▶ pour
      // trouver les créneaux suivants — pas idéal pour la découverte.
      const todayYmd = _agendaYmdLocal(new Date());
      const upcoming = (SLOTS_UNIQ || [])
        .filter(sl => sl.slot_date && (!sl.state || sl.state === 'actif'))
        .map(sl => sl.slot_date)
        .filter(d => d >= todayYmd)
        .sort();
      userAgendaWeekAnchor = upcoming.length
        ? _agendaMondayOf(upcoming[0])
        : _agendaMondayOf(new Date());
    }
    weekAnchor = userAgendaWeekAnchor;
    if (userAbMode) effectiveAB = _slotDateWeekAB(weekAnchor);
    // Période active : si l'utilisateur a explicitement choisi un onglet (userAgendaPeriodIdx
    // valide), c'est la source de vérité. Sinon on dérive de la semaine affichée.
    const _userPickedP = (userAgendaPeriodIdx !== null
      && PERIODS[userAgendaPeriodIdx]
      && PERIODS[userAgendaPeriodIdx].state === 'actif')
      ? PERIODS[userAgendaPeriodIdx]
      : null;
    activePeriod = _userPickedP
      || _agendaPeriodCoveringDate(weekAnchor)
      || _agendaPeriodCoveringDate(_agendaAddDays(weekAnchor, 3))
      || null;
    if (activePeriod && !_userPickedP) {
      const idx = PERIODS.indexOf(activePeriod);
      if (idx !== -1) userAgendaPeriodIdx = idx;
    }

    // Label "18 mai → 24 mai" pour la barre de navigation semaine.
    // Les bornes affichées suivent les jours actifs du service (lun-ven, lun-sam, lun-dim…).
    const monday = weekAnchor;
    const sunday = _agendaAddDays(monday, 6);
    const fmt = ymd => new Date(ymd + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const _activeDays = _agendaActiveDays();
    const firstIdx = _activeDays.length ? _activeDays[0].idx : 0;
    const lastIdx  = _activeDays.length ? _activeDays[_activeDays.length - 1].idx : 6;
    const firstDay = _agendaAddDays(monday, firstIdx);
    const lastDay  = _agendaAddDays(monday, lastIdx);
    const lblEl = document.getElementById('user-agenda-week-label');
    if (lblEl) lblEl.textContent = `${fmt(firstDay)} → ${fmt(lastDay)}`;

    // Désactive ◀ / ▶ quand "Afficher les horaires sans créneau" est décoché si plus aucune
    // semaine n'a de créneau dans cette direction (on l'évalue à l'avance).
    const prevBtn = document.getElementById('user-agenda-week-prev');
    const nextBtn = document.getElementById('user-agenda-week-next');
    let hasPrev = true, hasNext = true;
    if (!userAgendaShowEmptySlots) {
      const hideSchool = !!(ud && !ud.open_on_school_holidays);
      const uniqSrc = (SLOTS_UNIQ_FULL && SLOTS_UNIQ_FULL.length) ? SLOTS_UNIQ_FULL : SLOTS_UNIQ;
      const dates = (uniqSrc || [])
        .filter(sl => (!sl.state || sl.state === 'actif') && sl.slot_date)
        .filter(sl => !hideSchool || !_isSchoolVacance(sl.slot_date))
        .map(sl => sl.slot_date);
      hasPrev = dates.some(d => d < monday);
      hasNext = dates.some(d => d > sunday);
    }
    // Clamp à la période active : la nouvelle semaine doit encore intersecter [date_start, date_end].
    if (activePeriod && activePeriod.date_start && activePeriod.date_end) {
      const prevMonday = _agendaAddDays(monday, -7);
      const prevSunday = _agendaAddDays(prevMonday, 6);
      const nextMonday = _agendaAddDays(monday, 7);
      if (prevSunday < activePeriod.date_start) hasPrev = false;
      if (nextMonday > activePeriod.date_end)   hasNext = false;
    }
    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;

    // Onglets période visibles aussi en realweek : ils servent de repère + raccourci de nav.
    // L'onglet actif est celui qui contient la semaine ; clic = saute au lundi du début de la période.
    if (tabsEl) {
      const activeIdx = activePeriod ? PERIODS.indexOf(activePeriod) : -1;
      tabsEl.innerHTML = PERIODS.map((p, i) => {
        if (p.state !== 'actif') return '';
        const pKey   = String(p.id);
        const hasBk  = pendingSelection[pKey]?.length > 0;
        const colorVar = !hasBk ? `--period-color:${p.color || '#6dceaa'}` : '';
        return `<button class="period-btn ${i === activeIdx ? 'active' : ''}${hasBk ? ' has-booking' : ''}"
          style="${colorVar}"
          onclick="_userAgendaSelectPeriod(${i})">
          <span class="period-badge"></span>${p.label}
        </button>`;
      }).join('');
    }
  }

  const dayStart = _agendaTimeToMin(morningStart) ?? 9 * 60;
  let   dayEnd   = _agendaTimeToMin(afternoonEnd) ?? 18 * 60;
  if (dayEnd <= dayStart) dayEnd = _agendaTimeToMin(morningEnd) ?? (dayStart + 8 * 60);
  const totalMin   = dayEnd - dayStart;
  const rowHeight  = 17; // px par tranche de 15 min
  const rows       = Math.ceil(totalMin / 15);
  const gridHeight = rows * rowHeight;

  const lunchStart = _agendaTimeToMin(morningEnd);
  const lunchEnd   = _agendaTimeToMin(afternoonStart);
  const hasLunch = (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart
                    && lunchStart >= dayStart && lunchEnd <= dayEnd);

  const days = _agendaActiveDays();
  if (!days.length) { gridEl.innerHTML = '<p class="no-booking-msg">Aucun jour actif.</p>'; return; }

  // Construit la liste des blocs à afficher (timed = positionnés sur la grille horaire,
  // allday = créneaux "Journée entière" sans start/end time, placés dans une bande
  // dédiée au-dessus de la grille).
  const blocks = [];
  const alldayBlocks = [];
  if (mode === 'model' && activePeriod) {
    const slots = (SLOTS_REC_MAP[String(activePeriod.id)] || SLOTS_REC_MAP_FULL[String(activePeriod.id)] || [])
      .filter(sl => !sl.state || sl.state === 'actif')
      // En mode AB, on filtre par la semaine sélectionnée (via le toggle).
      .filter(sl => !effectiveAB || _slotMatchesWeek(sl, effectiveAB === 'A'));
    const rowWk = effectiveAB || '';
    for (const sl of slots) {
      const sMin = _agendaTimeToMin(sl.start_time);
      const eMin = _agendaTimeToMin(sl.end_time);
      const isAllday = sMin === null || eMin === null || eMin <= sMin;
      for (const d of days) {
        const cap = getCapacity(sl.id, activePeriod.id, d.key);
        if (cap === null || cap === 0) continue;
        if (isAllday) {
          alldayBlocks.push({ dayKey: d.key, dayIdx: DKEYS.indexOf(d.key), slot: sl, period: activePeriod, kind: 'rec', cap, week: rowWk });
        } else {
          blocks.push({ dayKey: d.key, dayIdx: DKEYS.indexOf(d.key), startMin: sMin, endMin: eMin, slot: sl, period: activePeriod, kind: 'rec', cap, week: rowWk });
        }
      }
    }
  } else if (mode === 'realweek' && weekAnchor) {
    const monday = weekAnchor;
    const sunday = _agendaAddDays(monday, 6);
    const hideSchool = !!(ud && !ud.open_on_school_holidays);
    // SLOTS_UNIQ est toujours peuplé côté user ; SLOTS_UNIQ_FULL ne l'est que côté admin.
    // On préfère SLOTS_UNIQ_FULL si non vide (plus exhaustif), sinon fallback sur SLOTS_UNIQ.
    const uniqSrc = (SLOTS_UNIQ_FULL && SLOTS_UNIQ_FULL.length) ? SLOTS_UNIQ_FULL : SLOTS_UNIQ;
    const uniqs = (uniqSrc || [])
      .filter(sl => !sl.state || sl.state === 'actif')
      .filter(sl => sl.slot_date && sl.slot_date >= monday && sl.slot_date <= sunday)
      .filter(sl => !hideSchool || !_isSchoolVacance(sl.slot_date));
    for (const sl of uniqs) {
      const sMin = _agendaTimeToMin(sl.start_time);
      const eMin = _agendaTimeToMin(sl.end_time);
      const isAllday = sMin === null || eMin === null || eMin <= sMin;
      const dk = _agendaDayKeyFromYmd(sl.slot_date);
      if (!DKEYS.includes(dk)) continue;
      if (isAllday) {
        alldayBlocks.push({ dayKey: dk, dayIdx: DKEYS.indexOf(dk), slot: sl, period: activePeriod, kind: 'uniq', cap: sl.capacity || 1, week: '' });
      } else {
        blocks.push({ dayKey: dk, dayIdx: DKEYS.indexOf(dk), startMin: sMin, endMin: eMin, slot: sl, period: activePeriod, kind: 'uniq', cap: sl.capacity || 1, week: '' });
      }
    }
  }

  // Layout multi-colonnes pour les chevauchements (par jour).
  for (const d of days) {
    const dayBlocks = blocks.filter(b => b.dayKey === d.key);
    _agendaLayoutOverlaps(dayBlocks);
  }

  // Helper : ' is-out-of-period' si le jour i doit être grisé (jour hors période OU
  // jour férié français quand le service est fermé les fériés). Même classe pour le
  // même rendu visuel (hachures + opacité).
  const _outOfPeriodCls = i => {
    if (mode !== 'realweek' || !weekAnchor) return '';
    const dayYmd = _agendaAddDays(weekAnchor, i);
    if (activePeriod && activePeriod.date_start && activePeriod.date_end
        && (dayYmd < activePeriod.date_start || dayYmd > activePeriod.date_end)) {
      return ' is-out-of-period';
    }
    if (!openOnHolidays && _isFrenchHoliday(dayYmd)) return ' is-out-of-period';
    return '';
  };

  // En-tête : ajoute la date sous le nom du jour en mode realweek.
  const dayHeader = days.map((d, i) => {
    let sub = '';
    if (mode === 'realweek' && weekAnchor) {
      const dayYmd = _agendaAddDays(weekAnchor, i);
      const dt = new Date(dayYmd + 'T00:00:00');
      sub = `<span class="agenda-day-sub">${dt.getDate()}/${String(dt.getMonth()+1).padStart(2,'0')}</span>`;
    }
    return `<div class="agenda-header-cell${_outOfPeriodCls(i)}">${d.label}${sub}</div>`;
  }).join('');

  // Marqueurs d'heure
  // Compactage de la pause méridienne : si > 30 min, on saute les quarts au-delà de
  // lunchStart+30 (la bande visuelle "lunch" est limitée à 2 quarts d'heure ≈ 30 min).
  const _lunchSkipFrom = (hasLunch && (lunchEnd - lunchStart) > 30) ? (lunchStart + 30) : null;
  // Compactage actif quand "Afficher les horaires sans créneau" est DÉCOCHÉ : granularité
  // HEURE. Un quart est conservé si l'heure qui le contient est chevauchée par au moins un
  // bloc (peu importe les réservations sur ce bloc, contrairement à l'agenda admin).
  const _hideEmptyUA = !userAgendaShowEmptySlots;
  const _occupiedQ = new Set();
  if (_hideEmptyUA) {
    const _occupiedHours = new Set();
    for (const b of blocks) {
      const s = Math.max(b.startMin, dayStart);
      const e = Math.min(b.endMin, dayEnd);
      if (e <= s) continue;
      for (let m = Math.floor(s / 60) * 60; m < e; m += 60) _occupiedHours.add(m);
    }
    for (const h of _occupiedHours) {
      for (let q = h; q < h + 60; q += 15) {
        if (q >= dayStart && q < dayEnd) _occupiedQ.add(q);
      }
    }
  }
  const _quarters = [];
  for (let m = dayStart; m < dayEnd; m += 15) {
    if (_hideEmptyUA && !_occupiedQ.has(m)) continue;
    if (_lunchSkipFrom !== null && m >= _lunchSkipFrom && m < lunchEnd) continue;
    _quarters.push(m);
  }
  const _qIdx = new Map();
  _quarters.forEach((m, i) => _qIdx.set(m, i));
  const compactGridHeight = _quarters.length * rowHeight;
  const mapMinToY = (min) => {
    const q = Math.floor(min / 15) * 15;
    const offset = (min - q) / 15;
    if (_qIdx.has(q)) return (_qIdx.get(q) + offset) * rowHeight;
    let prev = -1;
    for (const qv of _quarters) { if (qv < q) prev = _qIdx.get(qv); else break; }
    return (prev + 1) * rowHeight;
  };

  // Détection des ruptures (saut > 15 min entre deux quarts visibles consécutifs).
  // À chaque rupture on annote : fin de plage précédente AU-DESSUS, début de plage suivante
  // EN-DESSOUS (cette dernière via la classe `is-break-start`). Activé pour toutes les
  // ruptures SAUF celle de la pause méridienne (déjà signalée par la bande grise dédiée).
  const _isLunchBreak = (i) =>
    hasLunch && _lunchSkipFrom !== null
    && _quarters[i + 1] === lunchEnd
    && _quarters[i] + 15 >= _lunchSkipFrom;
  const _breakStartQuarters = new Set();
  for (let i = 0; i < _quarters.length - 1; i++) {
    if (_quarters[i + 1] - _quarters[i] > 15 && !_isLunchBreak(i)) {
      _breakStartQuarters.add(_quarters[i + 1]);
    }
  }
  // "Fin réelle" de la grille = fin du dernier quart visible (peut différer de dayEnd si
  // une plage a été compactée jusqu'au bout).
  const effectiveDayEnd = _quarters.length ? _quarters[_quarters.length - 1] + 15 : dayEnd;
  const hourMarks = [];
  let _isFirstHourMark = true;
  for (let m = Math.ceil(dayStart / 60) * 60; m <= effectiveDayEnd; m += 60) {
    if (m < dayStart || m > effectiveDayEnd) continue;
    if (m < effectiveDayEnd && !_qIdx.has(m)) continue;
    const top = mapMinToY(m);
    let cls = 'agenda-time-mark';
    if (m === effectiveDayEnd) cls += ' is-break-end';
    // Premier marqueur de la grille : placé sous la ligne (sinon il déborde au-dessus
    // du conteneur). Même règle que les débuts de plage après rupture.
    else if (_isFirstHourMark || _breakStartQuarters.has(m)) cls += ' is-break-start';
    hourMarks.push(`<div class="${cls}" style="top:${top}px">${_agendaMinToLabel(m)}</div>`);
    _isFirstHourMark = false;
  }
  // Marqueurs "fin de plage précédente" placés au-dessus de chaque ligne de rupture
  // (hors pause méridienne, qui a déjà sa bande grise pour s'identifier).
  for (let i = 0; i < _quarters.length - 1; i++) {
    if (_quarters[i + 1] - _quarters[i] > 15 && !_isLunchBreak(i)) {
      const endOfPlage = _quarters[i] + 15;
      const yBreak = mapMinToY(endOfPlage);
      hourMarks.push(`<div class="agenda-time-mark is-break-end" style="top:${yBreak}px">${_agendaMinToLabel(endOfPlage)}</div>`);
    }
  }
  // Lignes de grille (filtrées selon le mapping pour la pause compactée)
  const gridLines = [];
  for (let m = dayStart; m <= dayEnd; m += 15) {
    if (m < dayEnd && !_qIdx.has(m)) continue;
    const top = mapMinToY(m);
    const cls = (m % 60 === 0) ? 'agenda-grid-line is-hour' : 'agenda-grid-line';
    gridLines.push(`<div class="${cls}" style="top:${top}px"></div>`);
  }
  let lunchBand = '';
  if (hasLunch) {
    const ltop = mapMinToY(lunchStart);
    const lh = mapMinToY(lunchEnd) - ltop;
    if (lh > 0) lunchBand = `<div class="agenda-lunch-band" style="top:${ltop}px;height:${lh}px"></div>`;
  }

  const myBookingsRec  = (mode === 'model' && activePeriod) ? (pendingSelection[String(activePeriod.id)] || []) : [];
  const myBookingsUniq = (pendingSelection['unique'] || []);

  // Tableau de handlers à brancher après injection DOM.
  const _pendingHandlers = [];
  // Badges "ma réservation" à construire en DOM (theme/gauge widgets nécessitent
  // les fabriques _createUserThemeInput / _createGaugeBadge).
  const _pendingMineBadges = [];

  // Helper : produit le HTML d'un bloc (timed ou allday) et enregistre les handlers.
  // - isAlldayBlock=true → bloc rendu en flow normal (pas de positionnement absolu)
  //   dans la bande "journée entière" en haut de l'agenda
  // - isAlldayBlock=false → bloc positionné en absolu sur la grille horaire
  const _buildUserAgendaBlockHtml = (b, bi, isAlldayBlock = false) => {
    let positionStyle = '';
    let tooltipTime;
    if (isAlldayBlock) {
      positionStyle = 'position:relative;height:auto;top:auto;left:auto;width:auto;';
      tooltipTime   = 'Journée entière';
    } else {
      const s = Math.max(b.startMin, dayStart);
      const e = Math.min(b.endMin, dayEnd);
      if (e <= s) return '';
      // 2 px de gap en haut et en bas pour matcher le padding vertical de
      // .agenda-allday-cell qui encadre les blocs journée entière. top/height passent par
      // mapMinToY pour respecter le compactage de la pause méridienne.
      const ys = mapMinToY(s);
      const ye = mapMinToY(e);
      const top      = ys + 2;
      const height   = Math.max(0, ye - ys - 4);
      const colCount = b.colCount || 1;
      const col      = b._col || 0;
      const widthPct = 100 / colCount;
      const leftPct  = col * widthPct;
      positionStyle = `top:${top}px;height:${height}px;left:calc(${leftPct}% + 3px);width:calc(${widthPct}% - 6px);`;
      tooltipTime   = `${_agendaMinToLabel(b.startMin)} – ${_agendaMinToLabel(b.endMin)}`;
    }

    const isUniq   = b.kind === 'uniq';
    const sl       = b.slot;
    const isMirror = isUniq && !!sl.parent_slot_id;
    const total    = b.cap;
    const rowWk  = b.week || '';
    const _matchWk = bk => !rowWk || !(bk.week || '') || (bk.week || '') === rowWk;

    let myBk = null, isMine = false, isFull = false;
    let displayFree = total, gaugeFree = total, free = total;

    if (isUniq) {
      const _adj  = _movedAwayAdjustment(sl.id, null);
      const taken = countTaken(null, sl.id, null) - _adj.count;
      free = total - taken;
      const _bks = allBookingsUnique.filter(bk => bk.slot_id === sl.id);
      const gaugeSum = (allBookingsUnique.length > 0
        ? _bks.reduce((sx, bk) => sx + (parseInt(bk.enfants)||0) + (parseInt(bk.accompagnants)||0), 0)
        : countGaugeSum(null, sl.id, null)) - _adj.gaugeSum;
      gaugeFree   = total - gaugeSum;
      myBk        = myBookingsUniq.find(bk => bk.slotId === sl.id);
      isMine      = !!myBk;
      displayFree = userGauge ? gaugeFree : free;
      isFull      = displayFree <= 0;
    } else {
      const _adj  = _movedAwayAdjustment(sl.id, b.dayKey);
      const taken = countTaken(activePeriod.id, sl.id, b.dayKey, rowWk) - _adj.count;
      free = total - taken;
      const bks = allBookings.filter(bk => parseInt(bk.period_id) === activePeriod.id && bk.slot_id === sl.id && bk.day_key === b.dayKey && _matchWk(bk));
      const gaugeSum = (allBookings.length > 0
        ? bks.reduce((sx, bk) => sx + (parseInt(bk.enfants)||0) + (parseInt(bk.accompagnants)||0), 0)
        : countGaugeSum(activePeriod.id, sl.id, b.dayKey, rowWk)) - _adj.gaugeSum;
      gaugeFree   = total - gaugeSum;
      myBk        = myBookingsRec.find(bk => bk.slotId === sl.id && bk.day === b.dayKey && _matchWk(bk));
      isMine      = !!myBk;
      displayFree = userGauge ? gaugeFree : free;
      isFull      = displayFree <= 0;
    }

    const validated = isMine && myBk.validated == 1;
    // La couleur du bloc ne s'adapte plus au remplissage / à la jauge (pas de
    // .is-warn / .is-full). Tous les créneaux gardent l'accent jaune par défaut ;
    // seul le badge "ma réservation" et le label "Complet"/"X places" indiquent l'état.
    const blockStateCls = '';

    const kindCls    = (isUniq && !isMirror) ? 'is-uniq' : 'is-rec';
    const alldayCls  = isAlldayBlock ? ' is-allday' : '';
    const longCls    = (!isAlldayBlock && (b.endMin - b.startMin) > 60) ? ' is-long' : '';
    const spotsClass = isFull ? 'spots-full' : 'spots-ok';
    const spotsLabel = isFull ? 'Complet' : `${displayFree} place${displayFree > 1 ? 's' : ''}`;
    const tooltip    = `${tooltipTime}\n${isFull ? 'Complet' : spotsLabel}${isMine ? (validated ? '\n✅ Réservé (validé)' : '\n⏳ Réservé (en attente)') : ''}${rowWk ? `\nSemaine ${rowWk}` : ''}`;

    const blockId = `user-ag-blk-${isAlldayBlock ? 'ad-' : ''}${bi}-${b.dayKey}-${sl.id}-${rowWk || 'x'}`;
    _pendingHandlers.push({
      id: blockId, kind: isUniq ? 'unique' : 'recurring',
      sl, dk: b.dayKey, di: b.dayIdx,
      periodId: activePeriod ? activePeriod.id : null,
      week: rowWk,
      isMine, isFull, myBk,
    });

    const cursorStyle = (isFull && !isMine) ? 'cursor:not-allowed;' : '';

    const slotHtml = isMine ? '' : `<div class="user-agenda-block-inner">
      <span class="slot-icon"${isFull ? ' style="opacity:.2"' : ''}>📆</span>
      <span class="slot-spots ${spotsClass}">${spotsLabel}</span>
    </div>`;

    let mineBadgeHtml = '';
    if (isMine) {
      const placeholderCls = (themeMode || userGauge) ? ' has-widgets' : '';
      mineBadgeHtml = `<div class="user-agenda-mine-badge ${validated ? 'is-validated' : 'is-pending'}${placeholderCls}" data-mine-block="${blockId}"></div>`;
      _pendingMineBadges.push({
        blockId, myBk, validated, isUniq, gaugeFree,
        kind: isUniq ? 'unique' : 'recurring',
        sl, dk: b.dayKey, di: b.dayIdx,
        periodId: activePeriod ? activePeriod.id : null,
        week: rowWk,
      });
    }

    return `<div id="${blockId}" class="user-agenda-block agenda-block ${kindCls}${alldayCls}${longCls} ${blockStateCls}"
      style="${positionStyle}${cursorStyle}"
      title="${tooltip.replace(/"/g, '&quot;')}">
      ${slotHtml}
      ${mineBadgeHtml}
    </div>`;
  };

  const dayCols = days.map((d, i) => {
    const dayBlocks = blocks.filter(b => b.dayKey === d.key);
    const blocksHtml = dayBlocks.map((b, bi) => _buildUserAgendaBlockHtml(b, bi, false)).join('');
    return `<div class="agenda-day-col${_outOfPeriodCls(i)}" data-day="${d.key}" style="height:${compactGridHeight}px">
      ${gridLines.join('')}
      ${lunchBand}
      ${blocksHtml}
    </div>`;
  }).join('');

  // Ligne "Journée entière" (visible seulement s'il y a des créneaux sans horaires)
  const hasAllday = alldayBlocks.length > 0;
  let alldayRow = '';
  if (hasAllday) {
    const alldayCells = days.map((d, i) => {
      const cells = alldayBlocks.filter(b => b.dayKey === d.key);
      const cellsHtml = cells.map((b, bi) => _buildUserAgendaBlockHtml(b, bi, true)).join('');
      return `<div class="agenda-allday-cell${_outOfPeriodCls(i)}" data-day="${d.key}">${cellsHtml}</div>`;
    }).join('');
    alldayRow = `<div class="agenda-header-cell agenda-allday-corner" title="Journée entière">Journée entière</div>${alldayCells}`;
  }

  const cornerAB  = (userAbMode && mode === 'realweek' && effectiveAB) ? effectiveAB : '';
  const headerRow = `<div class="agenda-header-cell agenda-corner">${cornerAB}</div>${dayHeader}`;
  const bodyRow   = `
    <div class="agenda-time-col" style="height:${compactGridHeight}px">${hourMarks.join('')}</div>
    ${dayCols}`;

  // Pas de message "Aucun créneau" si "Afficher les horaires sans créneau" est décoché :
  // c'est le filtre qui a vidé la vue, l'utilisateur sait pourquoi.
  const emptyMsg = (!blocks.length && !alldayBlocks.length && !_hideEmptyUA)
    ? `<div class="agenda-empty-overlay">Aucun créneau à afficher pour cette ${mode === 'model' ? 'période' : 'semaine'}.</div>`
    : '';

  gridEl.innerHTML = `
    <div class="agenda-wrap">
      <div class="agenda-grid" style="grid-template-columns: 44px repeat(${days.length}, 1fr)">
        ${headerRow}
        ${alldayRow}
        ${bodyRow}
      </div>
      ${emptyMsg}
    </div>`;

  // Branche les handlers de clic / drag / context-menu après injection DOM.
  // Reprend la matrice de comportement de renderSchedule / renderScheduleUnique :
  //   - isMine          → bloc draggable, menu contextuel "ma réservation" (couper/copier/supprimer)
  //   - !mine && !full  → bloc cliquable (ajout), drop target, menu contextuel "vide" (nouvelle / coller)
  //   - !mine &&  full  → rien (non-cliquable, non-droppable)
  for (const h of _pendingHandlers) {
    const el = document.getElementById(h.id);
    if (!el) continue;

    if (h.isMine) {
      // Drag : on glisse la réservation vers un autre créneau.
      el.draggable = true;
      el.addEventListener('dragstart', e => _userOnDragStart(e, h.myBk, h.kind === 'recurring' ? h.periodId : null, h.kind));
      el.addEventListener('dragend',   e => _userOnDragEnd(e));
      // Menu contextuel : couper / copier / supprimer.
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        showSlotCtxMenu(e, {
          type: h.kind,
          periodId: h.kind === 'recurring' ? String(h.periodId) : null,
          sl: h.sl, dk: h.kind === 'recurring' ? h.dk : null, di: h.kind === 'recurring' ? h.di : null,
          week: h.week, blocked: false,
        });
      });
    } else if (!h.isFull) {
      // Bloc dispo : clic pour réserver.
      el.addEventListener('click', () => {
        if (h.kind === 'unique') selectSlotUnique(h.sl);
        else selectSlot(h.periodId, h.sl, h.dk, h.di, h.week);
      });
      // Drop target : on dépose ici une réservation existante.
      el.addEventListener('dragover',  e => _userOnDragOver(e));
      el.addEventListener('dragenter', e => _userOnDragEnter(e, h.kind === 'recurring' ? String(h.periodId) : null));
      el.addEventListener('dragleave', e => _userOnDragLeave(e));
      el.addEventListener('drop', e => {
        if (h.kind === 'unique') _userOnDrop(e, null, h.sl.id, null, null);
        else _userOnDrop(e, String(h.periodId), h.sl.id, h.dk, h.di, h.week);
      });
      // Menu contextuel : nouvelle réservation / coller.
      el.addEventListener('contextmenu', e => {
        e.preventDefault();
        showSlotEmptyCtxMenu(e, {
          type: h.kind,
          periodId: h.kind === 'recurring' ? String(h.periodId) : null,
          sl: h.sl, dk: h.kind === 'recurring' ? h.dk : null, di: h.kind === 'recurring' ? h.di : null,
          week: h.week,
        });
      });
    }
  }

  // Construit le contenu interactif des badges "ma réservation" : icône + (thème
  // si themeMode) + (jauge si userGauge) + (label "Validé"/"En attente"/"★ vous"
  // si ni thème ni jauge). Reprend la logique de _buildScheduleSlotBtn.
  const hasWidgets = themeMode || userGauge;
  for (const m of _pendingMineBadges) {
    const badgeEl = document.querySelector(`.user-agenda-mine-badge[data-mine-block="${m.blockId}"]`);
    if (!badgeEl) continue;
    badgeEl.innerHTML = '';

    // Icône (sauf en mode jauge — _createGaugeBadge intègre déjà son propre
    // marqueur ✅/⏳ au milieu de la jauge, qu'il y ait ou non un champ thème).
    if (!userGauge) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'slot-icon';
      iconSpan.textContent = m.validated ? '✅' : '⏳';
      badgeEl.appendChild(iconSpan);
    }

    if (themeMode) {
      // Ordre identique à _buildScheduleSlotBtn : (gauge sous l'icône) puis (thème en dernier).
      if (userGauge) badgeEl.appendChild(_createGaugeBadge(m.myBk, m.validated, m.gaugeFree));
      badgeEl.appendChild(_createUserThemeInput(m.myBk, m.validated, false, 'spots-ok'));
    } else if (userGauge) {
      badgeEl.appendChild(_createGaugeBadge(m.myBk, m.validated, m.gaugeFree));
    } else {
      const spots = document.createElement('span');
      spots.className = 'slot-spots spots-ok';
      spots.innerHTML = m.validated
        ? '<span style="font-size:.62rem;color:var(--accent);font-weight:600">Validé</span>'
        : (m.isUniq
            ? '<span style="font-size:.62rem;color:rgb(232,164,90);font-weight:600">En attente</span>'
            : '★ vous');
      badgeEl.appendChild(spots);
    }

    // Suppression : toujours via le bouton × (positionné en haut à droite par
    // .user-agenda-mine-badge .slot-btn-close), visible au survol — comme sur les
    // anciens badges slot-btn.my-booking. Le clic sur le corps du badge ne fait
    // rien (le handler du bloc est désactivé pour les mine, cf. _pendingHandlers).
    // Sécurité validation : si le service est en validation bloquante ET que le mode
    // validation est ON ET que la réservation est validée → pas de croix (même règle
    // que le blocage dans selectSlot, ligne ~2487).
    const _blockedDelete = !!validationMode && !!m.validated && !!validationBloquante;
    if (!_blockedDelete) {
      const cancelBooking = () => {
        if (m.kind === 'unique') selectSlotUnique(m.sl);
        else selectSlot(m.periodId, m.sl, m.dk, m.di, m.week);
      };
      badgeEl.appendChild(_createSlotCloseBtn(cancelBooking));
    }
  }
}

// ── Sélection de créneaux ─────────────────────────────────
async function selectSlot(periodId, slot, dayKey, dayIdx, week = '') {
  if (!pendingSelection[periodId]) pendingSelection[periodId] = [];
  const arr = pendingSelection[periodId];
  // Clé d'unicité : slotId + day + week (en mode A/B, A et B sont des bookings distincts)
  const _wk = week || '';
  const existIdx = arr.findIndex(b => b.slotId===slot.id && b.day===dayKey && (b.week || '') === _wk);
  if (existIdx !== -1) {
    const removed = arr[existIdx];
    if (removed.bookingId && removed.validated == 1 && validationBloquante && validationMode) {
      showToast('Réservation validée - Modification impossible', 2800, {warn: true}); return;
    }
    arr.splice(existIdx, 1);
    if (!arr.length) delete pendingSelection[periodId];
    if (removed.bookingId) {
      // periodId peut arriver en number (depuis _pendingMineBadges/clic sur ×) ou en string
      // (depuis le menu contextuel) — coerce les deux côtés pour que la comparaison match.
      const period = PERIODS.find(p => String(p.id) === String(periodId));
      cancelledBookings.push({ slotLabel: removed.slotLabel, dayLabel: removed.dayLabel, themeLabel: removed.themeLabel, trimLabel: period?.label, trimColor: period?.color });
      pendingCancellations.push({
        id: removed.bookingId, type: 'recurring',
        slotId: removed.slotId, dayKey: removed.day, week: removed.week || '',
        enfants: parseInt(removed.enfants) || 0, accompagnants: parseInt(removed.accompagnants) || 0,
      });
    }
    await loadServerCounts();
    renderSchedule(); return;
  }
  // Ne compter que les réservations sur des jours dont la capacité est définie (non null)
  const validCount = arr.filter(b => getCapacity(b.slotId, parseInt(periodId), b.day) !== null).length;
  if (validCount >= maxReservationsPeriod) { showToast(`⚠️ Limite par période atteinte`); return; }
  const total = Object.entries(pendingSelection)
    .filter(([k]) => k !== 'unique')
    .reduce((s, [k, a]) => s + a.filter(b => getCapacity(b.slotId, parseInt(k), b.day) !== null).length, 0);
  if (total >= maxReservations) { showToast(`⚠️ Limite annuelle atteinte`); return; }
  arr.push({ slotId:slot.id, slotLabel:slotLabel(slot), day:dayKey, dayLabel:DAYS[dayIdx], week:_wk, themeLabel:'', enfants: currentUser?.enfants ?? 0, accompagnants: currentUser?.accompagnants ?? 0, validated: validationMode ? 0 : 1 });
  renderSchedule();
  if (themeMode) setTimeout(() => {
    if (_currentServiceThemesMode === 'liste' && _currentServiceThemesList.length > 0) {
      // Picker custom : ouvrir le menu déroulant pour inciter au choix d'un thème
      const wrap = document.querySelector(`div.slot-spots[data-slot-id="${slot.id}"][data-day-key="${dayKey}"]`);
      if (wrap) wrap.click();
    } else {
      const inp = document.querySelector(`textarea.slot-spots[data-slot-id="${slot.id}"][data-day-key="${dayKey}"]`);
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  }, 0);
}

async function selectSlotUnique(slot) {
  if (!pendingSelection['unique']) pendingSelection['unique'] = [];
  const arr = pendingSelection['unique'];
  const existIdx = arr.findIndex(b => b.slotId===slot.id);
  if (existIdx !== -1) {
    const removed = arr.splice(existIdx, 1)[0];
    if (removed.bookingId) {
      cancelledBookings.push({ slotLabel: removed.slotLabel, dayLabel: removed.dayLabel, themeLabel: removed.themeLabel });
      pendingCancellations.push({
        id: removed.bookingId, type: 'unique',
        slotId: removed.slotId,
        enfants: parseInt(removed.enfants) || 0, accompagnants: parseInt(removed.accompagnants) || 0,
      });
    }
    await loadServerCounts();
    renderScheduleUnique(); return;
  }
  if (arr.filter(b => !b.recurringBookingId).length >= maxReservations) { showToast(`⚠️ Limite atteinte`); return; }
  if (!_checkBookingDelay(slot)) return;
  arr.push({ slotId:slot.id, slotLabel:slotLabel(slot), dayLabel: slot.slot_date ? fmtDate(slot.slot_date) : '—', themeLabel:'', enfants: currentUser?.enfants ?? 0, accompagnants: currentUser?.accompagnants ?? 0, validated: validationMode ? 0 : 1 });
  renderScheduleUnique();
  if (themeMode) setTimeout(() => {
    if (_currentServiceThemesMode === 'liste' && _currentServiceThemesList.length > 0) {
      // Picker custom : ouvrir le menu déroulant pour inciter au choix d'un thème
      const wrap = document.querySelector(`div.slot-spots[data-slot-id="${slot.id}"]`);
      if (wrap) wrap.click();
    } else {
      const inp = document.querySelector(`textarea.slot-spots[data-slot-id="${slot.id}"]`);
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }
  }, 0);
}

// ── Menu contextuel slot-btn my-booking ──────────────────
function showSlotCtxMenu(e, data) {
  let menu = document.getElementById('slot-ctx-menu');
  if (!menu) return;
  // Le clic droit ouvre le menu contextuel : on cache l'info-bulle (sinon elle
  // reste visible par-dessus le menu jusqu'au prochain mouseleave).
  _scheduleTtHide();
  menu.classList.remove('hidden');
  const cutBtn = document.getElementById('slot-ctx-cut');
  if (cutBtn) cutBtn.style.display = data.blocked ? 'none' : '';
  const delBtn = document.getElementById('slot-ctx-delete');
  if (delBtn) delBtn.style.display = data.blocked ? 'none' : '';
  const sepEl = menu.querySelector('.slot-ctx-sep');
  if (sepEl) sepEl.style.display = data.blocked ? 'none' : '';
  const vw = window.innerWidth, vh = window.innerHeight;
  let x = e.clientX, y = e.clientY;
  menu.style.left = (x + menu.offsetWidth > vw ? vw - menu.offsetWidth - 4 : x) + 'px';
  menu.style.top  = (y + menu.offsetHeight > vh ? vh - menu.offsetHeight - 4 : y) + 'px';

  document.getElementById('slot-ctx-cut').onclick = async () => {
    if (data.blocked) { hideSlotCtxMenu(); showToast('Réservation validée - Modification impossible', 2800, {warn: true}); return; }
    const bkArr = data.type === 'recurring' ? pendingSelection[data.periodId] : pendingSelection['unique'];
    // En mode A/B, deux bookings (A et B) peuvent coexister sur le même slot+jour ; on filtre aussi par semaine.
    const _wk = data.week || '';
    const bkIdx = bkArr ? (data.type === 'unique'
      ? bkArr.findIndex(b => b.slotId === data.sl.id)
      : bkArr.findIndex(b => b.slotId === data.sl.id && b.day === data.dk && (b.week || '') === _wk)) : -1;
    const myBk = bkIdx !== -1 ? bkArr[bkIdx] : null;
    _slotClipboard = { ...data, themeLabel: myBk?.themeLabel || '', bookingId: myBk?.bookingId || null,
      originalSlotLabel: myBk?.slotLabel || '', originalDayLabel: myBk?.dayLabel || '', isCut: true };
    hideSlotCtxMenu();
    if (myBk) {
      bkArr.splice(bkIdx, 1);
      if (!bkArr.length && data.type === 'recurring') delete pendingSelection[data.periodId];
      if (myBk.bookingId) {
        pendingCancellations.push({
          id: myBk.bookingId, type: data.type, _cbKey: myBk.bookingId,
          slotId: myBk.slotId,
          dayKey: data.type === 'recurring' ? myBk.day : null,
          week: myBk.week || '',
          enfants: parseInt(myBk.enfants) || 0, accompagnants: parseInt(myBk.accompagnants) || 0,
        });
        const period = data.type === 'recurring' ? PERIODS.find(p => String(p.id) === data.periodId) : null;
        cancelledBookings.push({ slotLabel: myBk.slotLabel, dayLabel: myBk.dayLabel,
          themeLabel: myBk.themeLabel, trimLabel: period?.label, trimColor: period?.color, _bookingId: myBk.bookingId });
      }
      await loadServerCounts();
      if (data.type === 'recurring') renderSchedule(); else renderScheduleUnique();
      updateConfirmBtn();
    }
    showToast('✂️ Créneau coupé');
  };
  document.getElementById('slot-ctx-copy').onclick = () => {
    const arr = data.type === 'recurring' ? pendingSelection[data.periodId] : pendingSelection['unique'];
    const _wk = data.week || '';
    const myBk = arr?.find(b => b.slotId === data.sl.id && (data.type === 'unique' || (b.day === data.dk && (b.week || '') === _wk)));
    _slotClipboard = { ...data, themeLabel: myBk?.themeLabel || '', bookingId: null, isCut: false };
    hideSlotCtxMenu();
    showToast('📋 Créneau copié');
  };
  document.getElementById('slot-ctx-delete').onclick = () => {
    hideSlotCtxMenu();
    if (data.blocked) { showToast('Réservation validée - Modification impossible', 2800, {warn: true}); return; }
    if (data.type === 'recurring') selectSlot(data.periodId, data.sl, data.dk, data.di, data.week || '');
    else selectSlotUnique(data.sl);
  };
}
function hideSlotCtxMenu() {
  const menu = document.getElementById('slot-ctx-menu');
  if (menu) menu.classList.add('hidden');
}
document.addEventListener('click', () => { hideSlotCtxMenu(); hideSlotEmptyCtxMenu(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideSlotCtxMenu(); hideSlotEmptyCtxMenu(); } });

function showSlotEmptyCtxMenu(e, data) {
  const menu = document.getElementById('slot-ctx-empty-menu');
  if (!menu) return;
  // Le clic droit ouvre le menu contextuel : on cache l'info-bulle (sinon elle
  // reste visible par-dessus le menu jusqu'au prochain mouseleave).
  _scheduleTtHide();
  // Mettre à jour l'état de "Coller"
  const pasteBtn = document.getElementById('slot-ctx-paste');
  if (pasteBtn) {
    const canPaste = !!_slotClipboard;
    pasteBtn.disabled = !canPaste;
    pasteBtn.style.opacity = canPaste ? '' : '.4';
    pasteBtn.style.cursor  = canPaste ? '' : 'not-allowed';
  }
  menu.classList.remove('hidden');
  const vw = window.innerWidth, vh = window.innerHeight;
  menu.style.left = (e.clientX + menu.offsetWidth  > vw ? vw - menu.offsetWidth  - 4 : e.clientX) + 'px';
  menu.style.top  = (e.clientY + menu.offsetHeight > vh ? vh - menu.offsetHeight - 4 : e.clientY) + 'px';

  document.getElementById('slot-ctx-new').onclick = () => {
    hideSlotEmptyCtxMenu();
    if (data.type === 'recurring') selectSlot(data.periodId, data.sl, data.dk, data.di);
    else selectSlotUnique(data.sl);
  };
  if (pasteBtn) pasteBtn.onclick = async () => {
    if (!_slotClipboard) return;
    hideSlotEmptyCtxMenu();
    if (_slotClipboard.isCut && _slotClipboard.bookingId) {
      // Déplacement d'une réservation existante → même logique que drag-and-drop
      const targetSl = data.sl;
      const _cbCounts = initialCounts[_slotClipboard.bookingId] || {};
      const bkEntry = {
        bookingId: _slotClipboard.bookingId,
        slotId: targetSl.id,
        slotLabel: slotLabel(targetSl),
        themeLabel: _slotClipboard.themeLabel || '',
        moved: true,
        // En mode validation OFF, on auto-valide. Sinon, repasse "en attente".
        validated: validationMode ? 0 : 1,
        enfants:       _cbCounts.enfants       ?? 0,
        accompagnants: _cbCounts.accompagnants ?? 0,
        originalSlotId: _slotClipboard.sl.id,
        originalSlotLabel: _slotClipboard.originalSlotLabel,
        originalDay: _slotClipboard.dk,
        originalDayLabel: _slotClipboard.originalDayLabel,
      };
      if (data.type === 'recurring') {
        bkEntry.day = data.dk; bkEntry.dayLabel = DAYS[data.di];
        // Propager la semaine A/B du contexte de paste pour ne pas dupliquer le badge
        // sur les deux lignes A et B (cf. _matchWk qui matche un booking sans week à toutes les lignes).
        bkEntry.week = data.week || '';
        if (!pendingSelection[data.periodId]) pendingSelection[data.periodId] = [];
        pendingSelection[data.periodId].push(bkEntry);
      } else {
        bkEntry.dayLabel = targetSl.slot_date ? fmtDate(targetSl.slot_date) : '—';
        if (!pendingSelection['unique']) pendingSelection['unique'] = [];
        pendingSelection['unique'].push(bkEntry);
      }
      // Retirer de pendingCancellations et cancelledBookings (c'est un move, pas une suppression)
      const pcIdx = pendingCancellations.findIndex(c => c.id === _slotClipboard.bookingId);
      if (pcIdx !== -1) pendingCancellations.splice(pcIdx, 1);
      const cbIdx = cancelledBookings.findIndex(c => c._bookingId === _slotClipboard.bookingId);
      if (cbIdx !== -1) cancelledBookings.splice(cbIdx, 1);
      await loadServerCounts();
      if (data.type === 'recurring') renderSchedule(); else renderScheduleUnique();
      updateConfirmBtn();
    } else {
      // Nouvelle réservation (Copier ou Couper sur un pending sans bookingId)
      if (data.type === 'recurring') await selectSlot(data.periodId, data.sl, data.dk, data.di, data.week || '');
      else await selectSlotUnique(data.sl);
      if (themeMode && _slotClipboard.themeLabel) {
        const arr = data.type === 'recurring' ? pendingSelection[data.periodId] : pendingSelection['unique'];
        const bk = arr?.find(b => b.slotId === data.sl.id && (data.type === 'unique' || (b.day === data.dk && (b.week || '') === (data.week || ''))));
        if (bk) {
          bk.themeLabel = _slotClipboard.themeLabel;
          if (data.type === 'recurring') renderSchedule(); else renderScheduleUnique();
        }
      }
    }
    showToast('📋 Créneau collé');
  };
}
function hideSlotEmptyCtxMenu() {
  const menu = document.getElementById('slot-ctx-empty-menu');
  if (menu) menu.classList.add('hidden');
}

// ── Drag-and-drop réservations utilisateur ────────────────
function _userOnDragStart(event, bk, periodId, type) {
  _userDragData = { bk, periodId, type };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', String(bk.bookingId || bk.slotId));
  requestAnimationFrame(() => event.currentTarget?.classList.add('slot-btn-dragging'));
}

function _userOnDragEnd(event) {
  if (_userDragTabTimer) { clearTimeout(_userDragTabTimer); _userDragTabTimer = null; }
  document.querySelectorAll('.slot-btn-dragging').forEach(el => el.classList.remove('slot-btn-dragging'));
  document.querySelectorAll('.slot-user-drop-target').forEach(el => el.classList.remove('slot-user-drop-target'));
  document.querySelectorAll('.period-btn.drag-hover-tab').forEach(el => el.classList.remove('drag-hover-tab'));
  _userDragData = null;
}

function _userOnDragEnterTab(event, periodIdx) {
  if (!_userDragData || _userDragData.type !== 'recurring') return;
  if (periodIdx === activePeriodIdx) return;
  event.preventDefault();
  if (_userDragTabTimer) return;
  event.currentTarget.classList.add('drag-hover-tab');
  _userDragTabTimer = setTimeout(() => {
    _userDragTabTimer = null;
    activePeriodIdx = periodIdx;
    renderSchedule();
  }, 650);
}

function _userOnDragLeaveTab(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    if (_userDragTabTimer) { clearTimeout(_userDragTabTimer); _userDragTabTimer = null; }
    event.currentTarget.classList.remove('drag-hover-tab');
  }
}

function _userOnDragOver(event) {
  if (!_userDragData) return;
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
}

function _userOnDragEnter(event, periodId) {
  if (!_userDragData) return;
  event.preventDefault();
  event.currentTarget.classList.add('slot-user-drop-target');
}

function _userOnDragLeave(event) {
  if (!event.currentTarget.contains(event.relatedTarget))
    event.currentTarget.classList.remove('slot-user-drop-target');
}

async function _userOnDrop(event, periodId, targetSlotId, targetDayKey, targetDayIdx, targetWeek = '') {
  event.preventDefault();
  event.currentTarget.classList.remove('slot-user-drop-target');
  if (!_userDragData) return;
  const { bk, periodId: srcPeriodId, type } = _userDragData;
  _userDragData = null;
  if (type === 'recurring' && bk.slotId === targetSlotId && bk.day === targetDayKey && srcPeriodId === periodId && (bk.week || '') === (targetWeek || '')) return;
  if (type === 'unique'    && bk.slotId === targetSlotId) return;
  if (type === 'unique') {
    const targetSlot = SLOTS_UNIQ.find(s => s.id === targetSlotId);
    if (targetSlot && !_checkBookingDelay(targetSlot)) return;
  }

  const srcArr = type === 'recurring' ? (pendingSelection[srcPeriodId] || []) : (pendingSelection['unique'] || []);
  const idx = type === 'recurring'
    ? srcArr.findIndex(x => (x.bookingId ? x.bookingId === bk.bookingId : (x.slotId === bk.slotId && x.day === bk.day && (x.week || '') === (bk.week || ''))))
    : srcArr.findIndex(x => (x.bookingId ? x.bookingId === bk.bookingId : x.slotId === bk.slotId));

  let movedBookingId = null;
  if (idx !== -1) {
    const entry = srcArr[idx];
    if (entry.bookingId && !entry.moved) {
      entry.originalSlotId    = entry.slotId;
      entry.originalSlotLabel = entry.slotLabel;
      if (type === 'recurring') { entry.originalDay = entry.day; entry.originalDayLabel = entry.dayLabel; }
    }
    entry.slotId    = targetSlotId;
    entry.slotLabel = slotLabel(getSlots().find(s => s.id === targetSlotId) || { id: targetSlotId });
    if (type === 'recurring') { entry.day = targetDayKey; entry.dayLabel = DAYS[targetDayIdx]; entry.week = targetWeek || ''; }
    // En mode validation OFF, on auto-valide après déplacement. Sinon, repasse "en attente".
    if (entry.bookingId) { entry.moved = true; entry.validated = validationMode ? 0 : 1; movedBookingId = entry.bookingId; }

    // Déplacement inter-période : déplacer l'entrée vers le bon période
    if (type === 'recurring' && srcPeriodId !== periodId) {
      srcArr.splice(idx, 1);
      if (!srcArr.length) delete pendingSelection[srcPeriodId];
      if (!pendingSelection[periodId]) pendingSelection[periodId] = [];
      pendingSelection[periodId].push(entry);
    }
  }

  if (movedBookingId) { await loadServerCounts(); showToast('📌 Déplacement en attente de confirmation'); }
  if (type === 'recurring') renderSchedule(); else renderScheduleUnique();
}

function hasModifications() {
  if (cancelledBookings.length) return true;
  for (const arr of Object.values(pendingSelection)) {
    for (const bk of (arr || [])) {
      if (!bk.bookingId) return true;
      if (bk.moved) return true;
      if ((bk.themeLabel || '') !== (initialThemes[bk.bookingId] || '')) return true;
      const ic = initialCounts[bk.bookingId];
      if (ic && ((bk.enfants ?? 0) !== ic.enfants || (bk.accompagnants ?? 0) !== ic.accompagnants)) return true;
    }
  }
  return false;
}
function updateConfirmBtn() {
  const hasMod = hasModifications();
  // Boutons sous l'agenda utilisateur.
  const confAg = document.getElementById('btn-to-confirm-agenda');
  if (confAg) confAg.disabled = !hasMod;
  const cancAg = document.getElementById('btn-cancel-reservations-agenda');
  if (cancAg) cancAg.disabled = !hasMod;
  document.querySelectorAll('.tab-nav-btn, #service-sidebar button, #btn-export-reservations, #btn-print-reservations').forEach(btn => {
    btn.classList.toggle('nav-locked', hasMod && btn.id !== 'tab-reservation');
  });
}

// ── Export Excel (CSV UTF-8 BOM) des réservations ─────────
function exportReservationsExcel() {
  const svc      = SERVICES.find(s => s.id === currentServiceId);
  const svcName  = svc ? svc.label : 'reservations';
  const user     = currentUser;
  const userName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : '';

  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;

  const rows = [];
  if (recurringMode) {
    rows.push([esc('Période'), esc('Jour'), esc('Créneau'), esc('Enfants'), esc('Adultes'), esc('Thème'), esc('Statut')].join(';'));
    PERIODS.forEach(p => {
      (pendingSelection[String(p.id)] || []).forEach(bk => {
        rows.push([
          esc(p.label),
          esc(bk.dayLabel||''),
          esc(bk.slotLabel||''),
          esc(bk.enfants ?? ''),
          esc(bk.accompagnants ?? ''),
          esc(bk.themeLabel||''),
          esc(bk.validated==1?'Validé':'En attente'),
        ].join(';'));
      });
    });
  } else {
    rows.push([esc('Date'), esc('Créneau'), esc('Enfants'), esc('Adultes'), esc('Thème'), esc('Statut')].join(';'));
    (pendingSelection['unique'] || []).forEach(bk => {
      rows.push([
        esc(bk.dayLabel||''),
        esc(bk.slotLabel||''),
        esc(bk.enfants ?? ''),
        esc(bk.accompagnants ?? ''),
        esc(bk.themeLabel||''),
        esc(bk.validated==1?'Validé':'En attente'),
      ].join(';'));
    });
  }

  const bom  = '\uFEFF';
  const csv  = bom + rows.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `reservations_${svcName.replace(/\s+/g,'_')}.csv`;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Impression des réservations ───────────────────────────
function printReservations() {
  const svc     = SERVICES.find(s => s.id === currentServiceId);
  const svcName = svc ? svc.label : '';
  const user    = currentUser;
  const userName = user ? `${user.prenom || ''} ${user.nom || ''}`.trim() : '';

  // Construire les lignes du tableau
  const rows = [];
  if (recurringMode) {
    PERIODS.forEach(p => {
      (pendingSelection[String(p.id)] || []).forEach(bk => {
        const statusLabel = bk.validated == 1 ? 'Validé' : 'En attente';
        const statusColor = bk.validated == 1 ? (printBW ? '#1a1a1a' : '#2e7d5e') : (printBW ? '#c0c0c0' : '#b45309');
        rows.push(`<tr>
          <td>${p.label}</td>
          <td>${bk.dayLabel || '—'}</td>
          <td>${bk.slotLabel || '—'}</td>
          <td style="text-align:center">${bk.enfants ?? '—'}</td>
          <td style="text-align:center">${bk.accompagnants ?? '—'}</td>
          <td>${bk.themeLabel || '—'}</td>
          <td style="color:${statusColor};font-weight:600">${statusLabel}</td>
        </tr>`);
      });
    });
  } else {
    (pendingSelection['unique'] || []).forEach(bk => {
      const statusLabel = bk.validated == 1 ? 'Validé' : 'En attente';
      const statusColor = bk.validated == 1 ? (printBW ? '#555' : '#2e7d5e') : (printBW ? '#999' : '#b45309');
      rows.push(`<tr>
        <td colspan="2">${bk.dayLabel || '—'}</td>
        <td>${bk.slotLabel || '—'}</td>
        <td style="text-align:center">${bk.enfants ?? '—'}</td>
        <td style="text-align:center">${bk.accompagnants ?? '—'}</td>
        <td>${bk.themeLabel || '—'}</td>
        <td style="color:${statusColor};font-weight:600">${statusLabel}</td>
      </tr>`);
    });
  }

  const thead = recurringMode
    ? `<tr><th>Période</th><th>Jour</th><th>Créneau</th><th>Enf.</th><th>Adult.</th><th>Thème</th><th>Statut</th></tr>`
    : `<tr><th colspan="2">Date</th><th>Créneau</th><th>Enf.</th><th>Adult.</th><th>Thème</th><th>Statut</th></tr>`;

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
  <title>Réservations — ${svcName}</title>
  <style>
    body { font-family: system-ui, sans-serif; color: #1a1f2e; margin: 2cm; font-size: 11pt; }
    h1 { font-size: 15pt; margin: 0 0 .25rem; }
    .sub { color: #555; font-size: 10pt; margin-bottom: 1.5rem; }
    table { width: 100%; border-collapse: collapse; margin-top: .5rem; }
    th { background: #f0f2f5; text-align: left; padding: .4rem .6rem; font-size: 9pt;
         text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #d0d4da; }
    td { padding: .45rem .6rem; border-bottom: 1px solid #e4e6ea; font-size: 10pt; vertical-align: middle; }
    tr:last-child td { border-bottom: none; }
    .empty { color: #888; font-style: italic; text-align: center; padding: 1.5rem; }
    @media print { body { margin: 1.5cm; } }
  </style></head><body>
  <h1>${svcName}</h1>
  <div class="sub">
    ${userName ? `<strong>${userName}</strong> · ` : ''}Imprimé le ${new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' })}
  </div>
  <table>
    <thead>${thead}</thead>
    <tbody>${rows.length ? rows.join('') : `<tr><td colspan="5" class="empty">Aucune réservation</td></tr>`}</tbody>
  </table>
  </body></html>`;

  const iframe = document.getElementById('print-frame');
  const doc = iframe.contentDocument || iframe.contentWindow.document;
  doc.open(); doc.write(html); doc.close();
  iframe.contentWindow.focus();
  setTimeout(() => iframe.contentWindow.print(), 250);
}

// ── Confirmation ──────────────────────────────────────────
async function cancelReservations() {
  _clearGaugeCaps();
  pendingSelection = {}; cancelledBookings = []; initialThemes = {}; initialCounts = {}; pendingCancellations = [];
  document.querySelectorAll('.tab-nav-btn, #service-sidebar button, #btn-export-reservations, #btn-print-reservations').forEach(btn => { btn.classList.remove('nav-locked'); });
  await loadUserBookings();
  await loadServerCounts();
  switchTab('reservation');
  showToast('Modifications annulées.');
}

function goToConfirm() {
  if (!hasModifications()) return;
  _clearGaugeCaps();
  // Synchroniser les valeurs des inputs jauge du DOM → pendingSelection avant d'ouvrir la modale
  document.querySelectorAll('input[data-gauge-field]').forEach(inp => {
    const field  = inp.dataset.gaugeField;
    const slotId = inp.dataset.slotId; // conserver comme chaîne (les IDs sont des VARCHAR)
    const dayKey = inp.dataset.dayKey || null;
    const val    = parseInt(inp.value) || 0;
    if (recurringMode) {
      for (const arr of Object.values(pendingSelection)) {
        const bk = (arr || []).find(b => String(b.slotId) === slotId && (dayKey ? b.day === dayKey : true));
        if (bk) bk[field] = val;
      }
    } else {
      const bk = (pendingSelection['unique'] || []).find(b => String(b.slotId) === slotId);
      if (bk) bk[field] = val;
    }
  });
  renderConfirmation();
  document.getElementById('reservation-confirm-modal')?.classList.add('open');
}

function closeReservationConfirmModal() {
  document.getElementById('reservation-confirm-modal')?.classList.remove('open');
}


function renderConfirmation() {
  const u = currentUser;
  const _ud2 = _userDem(); const userRecurring = !!_ud2?.recurrent; const userGauge = !!_ud2?.jauge;
  const enfAccLine = userGauge ? '' : `
    <div class="recap-item"><div class="recap-key">Enfants</div><div class="recap-val">${u.enfants||'—'}</div></div>
    <div class="recap-item"><div class="recap-key">Adultes</div><div class="recap-val">${u.accompagnants||'—'}</div></div>`;
  document.getElementById('recap-user').innerHTML = `
    <div class="recap-item"><div class="recap-key">Nom</div><div class="recap-val">${u.nom||'—'}</div></div>
    <div class="recap-item"><div class="recap-key">Prénom</div><div class="recap-val">${u.prenom||'—'}</div></div>
    <div class="recap-item"><div class="recap-key">E-mail</div><div class="recap-val">${u.email}</div></div>
    <div class="recap-item"><div class="recap-key">Niveau</div><div class="recap-val">${u.niveau||'—'}</div></div>${enfAccLine}
  `;
  // Réinitialiser le snapshot jauge : il sera rempli ci-dessous pour chaque nouvelle réservation
  _gaugeSnapshot = {};
  const recapEl = document.getElementById('recap-bookings');
  const entries = [];
  if (userRecurring) {
    PERIODS.forEach(p => {
      (pendingSelection[String(p.id)]||[]).forEach(bk => {
        const isNew        = !bk.bookingId;
        const isMoved      = bk.bookingId && bk.moved;
        const themeChanged = bk.bookingId && !bk.moved && (bk.themeLabel||'') !== (initialThemes[bk.bookingId]||'');
        const _countChanged = bk.bookingId && initialCounts[bk.bookingId] && ((bk.enfants ?? 0) !== initialCounts[bk.bookingId].enfants || (bk.accompagnants ?? 0) !== initialCounts[bk.bookingId].accompagnants);
        const badge = isNew   ? `<span style="color:var(--accent);font-weight:700"> +</span>`
                    : isMoved ? `<span style="color:var(--warn);font-weight:700"> ↔</span>`
                    : themeChanged ? `<span style="color:var(--warn);font-weight:700"> ✎</span>`
                  : _countChanged ? `<span style="color:var(--warn);font-weight:700"> ✎</span>` : '';
        const sub = isMoved
          ? `<div class="val" style="font-size:.72rem;color:var(--muted)">${bk.originalDayLabel} : ${bk.originalSlotLabel} → ${bk.dayLabel} : ${bk.slotLabel}</div>`
          : themeChanged
          ? `<div class="val" style="font-size:.72rem;color:var(--muted)">${initialThemes[bk.bookingId]||'—'} → ${bk.themeLabel||'—'}</div>`
          : '';
        const gaugeLine = (userGauge && (isNew || _countChanged)) ? (() => {
          const enf = bk.enfants ?? 0, acc = bk.accompagnants ?? 0;
          if (isNew) _gaugeSnapshot[bk.slotId + '|' + (bk.day || '') + '|' + (bk.week || '')] = { enfants: enf, accompagnants: acc };
          const _prev = _countChanged ? `<span style="text-decoration:line-through;opacity:.5">${initialCounts[bk.bookingId].enfants} · ${initialCounts[bk.bookingId].accompagnants}</span> → ` : '';
          return `<div class="val" style="font-size:.72rem;color:var(--accent)">${_prev}Enfants : ${enf} · Adultes : ${acc}</div>`;
        })() : '';
        entries.push(`<div class="recap-period-entry">
          <div class="recap-period-dot" style="background:${p.color || '#6dceaa'}"></div>
          <div class="recap-period-info">
            <div class="key">${p.label}${badge}</div>
            <div class="val">${bk.dayLabel} : ${bk.slotLabel}${bk.themeLabel?' · '+bk.themeLabel:''}</div>${sub}${gaugeLine}
          </div></div>`);
      });
    });
  } else {
    (pendingSelection['unique']||[]).forEach(bk => {
      const isNew        = !bk.bookingId;
      const isMoved      = bk.bookingId && bk.moved;
      const themeChanged = bk.bookingId && !bk.moved && (bk.themeLabel||'') !== (initialThemes[bk.bookingId]||'');
      const _countChangedU = bk.bookingId && initialCounts[bk.bookingId] && ((bk.enfants ?? 0) !== initialCounts[bk.bookingId].enfants || (bk.accompagnants ?? 0) !== initialCounts[bk.bookingId].accompagnants);
      const badge = isNew   ? `<span style="color:var(--accent);font-weight:700"> +</span>`
                  : isMoved ? `<span style="color:var(--warn);font-weight:700"> ↔</span>`
                  : themeChanged ? `<span style="color:var(--warn);font-weight:700"> ✎</span>`
                  : _countChangedU ? `<span style="color:var(--warn);font-weight:700"> ✎</span>` : '';
      const sub = isMoved
        ? `<div class="val" style="font-size:.72rem;color:var(--muted)">${bk.originalSlotLabel} → ${bk.slotLabel}</div>`
        : themeChanged
        ? `<div class="val" style="font-size:.72rem;color:var(--muted)">${initialThemes[bk.bookingId]||'—'} → ${bk.themeLabel||'—'}</div>`
        : '';
      const gaugeLine = (userGauge && (isNew || _countChangedU)) ? (() => {
        const enf = bk.enfants ?? 0, acc = bk.accompagnants ?? 0;
        if (isNew) _gaugeSnapshot[bk.slotId + '|'] = { enfants: enf, accompagnants: acc };
        const _prevU = _countChangedU ? `<span style="text-decoration:line-through;opacity:.5">${initialCounts[bk.bookingId].enfants} · ${initialCounts[bk.bookingId].accompagnants}</span> → ` : '';
        return `<div class="val" style="font-size:.72rem;color:var(--accent)">${_prevU}Enfants : ${enf} · Adultes : ${acc}</div>`;
      })() : '';
      entries.push(`<div class="recap-period-entry">
        <div class="recap-period-dot"></div>
        <div class="recap-period-info">
          <div class="key">Séance ponctuelle${badge}</div>
          <div class="val">${bk.dayLabel} : ${bk.slotLabel}${bk.themeLabel?' · '+bk.themeLabel:''}</div>${sub}${gaugeLine}
        </div></div>`);
    });
  }
  const cancelledEntries = cancelledBookings.map(bk => `<div class="recap-period-entry">
    <div class="recap-period-dot" style="background:${bk.trimColor||'var(--danger)'};opacity:.5"></div>
    <div class="recap-period-info">
      <div class="key" style="color:var(--danger)">${bk.trimLabel ? bk.trimLabel+' — ' : ''}Supprimée</div>
      <div class="val" style="text-decoration:line-through;opacity:.6">${bk.dayLabel} : ${bk.slotLabel}${bk.themeLabel?' · '+bk.themeLabel:''}</div>
    </div></div>`);
  recapEl.innerHTML = (entries.length || cancelledEntries.length)
    ? `<div class="recap-period-entries">${entries.join('')}${cancelledEntries.join('')}</div>`
    : `<p class="no-booking-msg">Aucune modification.</p>`;
}

async function finalConfirm() {
  // Nouvelles réservations (sans bookingId)
  const selections = [];
  // Déplacements (bookingId + moved)
  const moveUpdates = [];
  // Modifications de thème sur réservations existantes
  const themeUpdates = [];
  const countUpdates = [];
  const _ud3 = _userDem(); const _urRec = !!_ud3?.recurrent; const _urGauge = !!_ud3?.jauge;
  const type = _urRec ? 'recurring' : 'unique';
  if (_urRec) {
    PERIODS.forEach(p => {
      (pendingSelection[String(p.id)]||[]).forEach(bk => {
        if (!bk.bookingId) {
          const _snapKeyR = bk.slotId + '|' + (bk.day || '') + '|' + (bk.week || '');
          const _snapR    = _gaugeSnapshot[_snapKeyR];
          selections.push({ slotId: bk.slotId, period_id: p.id, day: bk.day, week: bk.week || '', themeLabel: bk.themeLabel||'',
            enfants:       _snapR ? _snapR.enfants       : (bk.enfants       ?? 0),
            accompagnants: _snapR ? _snapR.accompagnants : (bk.accompagnants ?? 0) });
        } else if (bk.moved) {
          moveUpdates.push({ id: bk.bookingId, type, service_id: currentServiceId, slot_id: bk.slotId, period_id: p.id, day_key: bk.day, week: bk.week || '' });
        } else if ((bk.themeLabel||'') !== (initialThemes[bk.bookingId]||'')) {
          themeUpdates.push({ id: bk.bookingId, theme_label: bk.themeLabel||'', type });
        }
        const _ic = initialCounts[bk.bookingId];
        if (bk.bookingId && _ic && ((bk.enfants ?? 0) !== _ic.enfants || (bk.accompagnants ?? 0) !== _ic.accompagnants)) {
          countUpdates.push({ id: bk.bookingId, type, enfants: bk.enfants ?? 0, accompagnants: bk.accompagnants ?? 0 });
        }
      });
    });
  } else {
    (pendingSelection['unique']||[]).forEach(bk => {
      if (!bk.bookingId) {
        const _snapKeyU = bk.slotId + '|';
        const _snapU    = _gaugeSnapshot[_snapKeyU];
        selections.push({ slotId: bk.slotId, themeLabel: bk.themeLabel||'',
          enfants:       _snapU ? _snapU.enfants       : (bk.enfants       ?? 0),
          accompagnants: _snapU ? _snapU.accompagnants : (bk.accompagnants ?? 0) });
      } else if (bk.moved) {
        moveUpdates.push({ id: bk.bookingId, type, service_id: currentServiceId, slot_id: bk.slotId });
      } else if ((bk.themeLabel||'') !== (initialThemes[bk.bookingId]||'')) {
        themeUpdates.push({ id: bk.bookingId, theme_label: bk.themeLabel||'', type });
      }
      const _icU = initialCounts[bk.bookingId];
      if (bk.bookingId && _icU && ((bk.enfants ?? 0) !== _icU.enfants || (bk.accompagnants ?? 0) !== _icU.accompagnants)) {
        countUpdates.push({ id: bk.bookingId, type, enfants: bk.enfants ?? 0, accompagnants: bk.accompagnants ?? 0 });
      }
    });
  }
  if (_urGauge && selections.length) {
    for (const sel of selections) {
      const existSum = _urRec
        ? _sumOverWeeks(serverGaugeSums[sel.period_id]?.[sel.slotId]?.[sel.day], sel.week)
        : (serverGaugeSums[sel.slotId] || 0);
      const slotCap = _urRec
        ? getCapacity(sel.slotId, sel.period_id, sel.day)
        : (SLOTS_UNIQ.find(s => s.id === sel.slotId)?.capacity || 1);
      const personnes = (sel.enfants ?? 0) + (sel.accompagnants ?? 0);
      if (existSum + personnes > slotCap) {
        showToast(`⚠️ Jauge dépassée : ${existSum + personnes} personne${existSum + personnes > 1 ? 's' : ''} pour une jauge de ${slotCap}`);
        return;
      }
    }
  }
  // Capture des libellés pour le mail récap, AVANT que les API ne vident les listes
  // (cancelledBookings est reset par loadUserBookings, pendingCancellations par la boucle ci-dessous).
  const _mailAdds = selections.map(sel => {
    if (sel.period_id) {
      const period = PERIODS.find(p => p.id === sel.period_id);
      const dayLbl = DAYS[DKEYS.indexOf(sel.day)] || sel.day;
      const sl     = _getUserSlots().find(s => s.id === sel.slotId) || {};
      return [dayLbl, slotLabel(sl), sel.week ? 'Semaine ' + sel.week : '', period?.label]
        .filter(Boolean).join(' · ');
    }
    const sl = SLOTS_UNIQ.find(s => s.id === sel.slotId) || {};
    return [sl.slot_date ? fmtDate(sl.slot_date) : '', _fmtSlotHoursFr(sl.start_time, sl.end_time)]
      .filter(Boolean).join(' · ');
  });
  const _mailMoves = moveUpdates.map(mu => {
    if (mu.type === 'recurring') {
      const period = PERIODS.find(p => p.id === mu.period_id);
      const dayLbl = DAYS[DKEYS.indexOf(mu.day_key)] || mu.day_key;
      const sl     = _getUserSlots().find(s => s.id === mu.slot_id) || {};
      return [dayLbl, slotLabel(sl), mu.week ? 'Semaine ' + mu.week : '', period?.label]
        .filter(Boolean).join(' · ');
    }
    const sl = SLOTS_UNIQ.find(s => s.id === mu.slot_id) || {};
    return [sl.slot_date ? fmtDate(sl.slot_date) : '', _fmtSlotHoursFr(sl.start_time, sl.end_time)]
      .filter(Boolean).join(' · ');
  });
  const _mailCancels = cancelledBookings.map(cb =>
    [cb.dayLabel, cb.slotLabel, cb.trimLabel].filter(Boolean).join(' · ')
  );
  const _mailThemeCount = themeUpdates.length;
  const _mailCountChangeCount = countUpdates.length;
  for (const c of pendingCancellations) {
    const r = await apiPost('/bookings.php?action=cancel', { id: c.id, type: c.type });
    if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur lors de la suppression')); return; }
  }
  pendingCancellations = [];
  for (const payload of moveUpdates) {
    const r = await apiPost('/bookings.php?action=user_move', payload);
    if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur lors du déplacement')); return; }
  }
  if (selections.length) {
    const r = await apiPost('/bookings.php?action=book', { service_id: currentServiceId, selections });
    if (!r.ok) {
      showToast('⚠️ ' + (r.error || 'Erreur lors de la réservation'));
      return;
    }
  }
  for (const u of themeUpdates) {
    await apiPost('/bookings.php?action=update_theme', u);
  }
  for (const cu of countUpdates) {
    await apiPost('/bookings.php?action=update_counts', cu);
  }
  cancelledBookings = [];
  pendingCancellations = [];
  document.querySelectorAll('.tab-nav-btn, #service-sidebar button, #btn-export-reservations, #btn-print-reservations').forEach(btn => { btn.classList.remove('nav-locked'); });
  // Recharger
  await loadUserBookings();
  await loadServerCounts();
  if (recurringMode) renderSchedule(); else renderScheduleUnique();

  // Mail récap : changements de ce save uniquement (le snapshot est construit côté serveur,
  // pour qu'il puisse inclure les réservations sur les autres services).
  const _mailChanges = [];
  _mailAdds.forEach(s    => _mailChanges.push('Ajouté : '   + s));
  _mailMoves.forEach(s   => _mailChanges.push('Déplacé vers : ' + s));
  _mailCancels.forEach(s => _mailChanges.push('Annulé : '   + s));
  if (_mailThemeCount)       _mailChanges.push(`Modification de thème : ${_mailThemeCount} créneau${_mailThemeCount > 1 ? 'x' : ''}`);
  if (_mailCountChangeCount) _mailChanges.push(`Modification du nombre de participants : ${_mailCountChangeCount} créneau${_mailCountChangeCount > 1 ? 'x' : ''}`);
  const _mailRes = await apiPost('/bookings.php?action=send_recap', {
    service_id: currentServiceId,
    changes: _mailChanges,
    // "En attente de validation" uniquement si une nouvelle réservation a été créée en mode validation ON.
    // Une simple modif/déplacement/annulation en mode validation reste "modifications enregistrées".
    validation_pending: !!validationMode && _mailAdds.length > 0,
    // Nombre de nouvelles réservations créées (validation OFF) — pour distinguer
    // "réservation enregistrée" (>=1 nouvelle) de "modifications enregistrées" (que des modifs/déplacements/annulations).
    new_count: _mailAdds.length,
  });

  closeReservationConfirmModal();
  if (!_mailRes || !_mailRes.ok) {
    showToast('⚠️ Réservations enregistrées — l\'email récapitulatif n\'a pas pu être envoyé', 4000, { warn: true });
  } else {
    showToast(validationMode
      ? '📨 Demande enregistrée — en attente de validation.'
      : '🎉 Réservations enregistrées !');
  }
}

// ── Profil utilisateur ────────────────────────────────────
async function renderProfileRead() {
  const u = currentUser;
  if (!u) return;
  const svcIds    = Array.isArray(u.services) ? u.services : [];
  const svcLabels = svcIds.length
    ? svcIds.map(id => { const s = SERVICES.find(x => x.id === id); return s ? (svcIcon(s.label, id) + ' ' + s.label) : id; }).join(', ')
    : '—';
  if (u.demandeur_id) await _fetchStructures(u.demandeur_id);
  const catLabel = _getDemandeurLabel(u.demandeur_id);
  const strLabel = _getStructureLabel(u.demandeur_id, u.structure_id);
  document.getElementById('profile-read').innerHTML = `
    <div class="recap-item"><div class="recap-key">Nom</div><div class="recap-val">${u.nom||'—'}</div></div>
    <div class="recap-item"><div class="recap-key">Prénom</div><div class="recap-val">${u.prenom||'—'}</div></div>
    <div class="recap-item"><div class="recap-key">E-mail</div><div class="recap-val">${u.email}</div></div>
    <div class="recap-item"><div class="recap-key">Téléphone</div><div class="recap-val">${formatTel(u.tel)}</div></div>
    <div class="recap-item"><div class="recap-key">Catégorie</div><div class="recap-val">${catLabel}</div></div>
    <div class="recap-item"><div class="recap-key">Structure</div><div class="recap-val">${strLabel}</div></div>
    <div style="display:flex;gap:.75rem;min-width:0">
      <div class="recap-item" style="flex:4;min-width:0"><div class="recap-key">Niveau</div><div class="recap-val">${u.niveau||'—'}</div></div>
      <div class="recap-item" style="flex:2;min-width:0"><div class="recap-key">Enfants</div><div class="recap-val">${u.enfants||'—'}</div></div>
      <div class="recap-item" style="flex:2;min-width:0"><div class="recap-key">Adultes</div><div class="recap-val">${u.accompagnants||'—'}</div></div>
    </div>
    <div class="recap-item"><div class="recap-key">Rôle</div><div class="recap-val">${rolePill(u.role)}</div></div>
    <div class="recap-item"><div class="recap-key">Service</div><div class="recap-val">${svcLabels}</div></div>
  `;
  // Liens RGPD self-service (vue imprimable + JSON) → cibles l'utilisateur courant.
  const pdfBtn  = document.getElementById('rgpd-self-pdf-btn');
  const jsonBtn = document.getElementById('rgpd-self-json-btn');
  if (pdfBtn)  pdfBtn.href  = `rgpd_export.php?id=${u.id}`;
  if (jsonBtn) jsonBtn.href = `api/users.php?action=export_json&id=${u.id}`;
  // Suppression self-service (RGPD art. 17) : accessible à tous les rôles.
  // Pour un admin, le backend refuse l'opération s'il ne resterait plus
  // aucun autre admin actif (cf. requestAccountDeletion).
  const delSection = document.getElementById('rgpd-self-delete-section');
  if (delSection) delSection.style.display = '';
}

// ── Mot de passe oublié (self-service) ────────────────────
function openForgotPasswordModal() {
  document.getElementById('forgot-email').value = '';
  const btn = document.getElementById('forgot-submit-btn');
  btn.disabled = false;
  btn.textContent = 'Envoyer le lien';
  document.getElementById('forgot-password-modal').classList.add('open');
  setTimeout(() => document.getElementById('forgot-email')?.focus(), 50);
}
function closeForgotPasswordModal() {
  document.getElementById('forgot-password-modal').classList.remove('open');
}
async function submitForgotPassword() {
  const email = (document.getElementById('forgot-email')?.value || '').trim();
  if (!email) { showToast('⚠️ Saisissez une adresse e-mail'); return; }
  const btn = document.getElementById('forgot-submit-btn');
  btn.disabled = true; btn.textContent = '…';
  const r = await apiPost('/auth.php?action=password_reset_request', {
    action: 'password_reset_request',
    email,
  });
  closeForgotPasswordModal();
  // Réponse volontairement vague côté serveur (anti-énumération) — on relaie tel quel.
  showToast(r && r.message ? '📧 ' + r.message : '📧 Si cette adresse est connue, un mail vient de partir.', 5000);
}

// ── Self-service deletion (RGPD article 17) ───────────────
// Preflight : avant d'ouvrir la modale (et de demander un mot de passe), on
// vérifie côté serveur si l'opération est autorisée pour le user courant
// (= refus si dernier admin actif). Sinon on affiche un toast explicatif.
async function openSelfDeleteModal() {
  const check = await apiGet('/auth.php?action=self_delete_check');
  if (check && check.ok && check.allowed === false) {
    showToast('⚠️ ' + check.reason, 5000, { warn: true });
    return;
  }
  document.getElementById('self-delete-pwd').value = '';
  const err = document.getElementById('self-delete-error');
  if (err) err.style.display = 'none';
  const btn = document.getElementById('self-delete-submit-btn');
  btn.disabled = false;
  btn.textContent = 'Envoyer le mail de confirmation';
  document.getElementById('self-delete-modal').classList.add('open');
  setTimeout(() => document.getElementById('self-delete-pwd')?.focus(), 50);
}
function closeSelfDeleteModal() {
  document.getElementById('self-delete-modal').classList.remove('open');
}
async function submitSelfDelete() {
  const pwd = document.getElementById('self-delete-pwd').value;
  if (!pwd) { showToast('⚠️ Veuillez saisir votre mot de passe'); return; }
  const btn = document.getElementById('self-delete-submit-btn');
  const err = document.getElementById('self-delete-error');
  btn.disabled = true;
  btn.textContent = '…';
  if (err) err.style.display = 'none';
  const r = await apiPost('/auth.php?action=account_deletion_request', {
    action: 'account_deletion_request',
    password: pwd,
  });
  if (!r || !r.ok) {
    if (err) {
      err.textContent = (r && r.error) || 'Erreur';
      err.style.display = '';
    }
    btn.disabled = false;
    btn.textContent = 'Envoyer le mail de confirmation';
    return;
  }
  closeSelfDeleteModal();
  showToast('📧 E-mail de confirmation envoyé — valable 24h');
}

function formatTel(tel) {
  if (!tel) return '—';
  const d = tel.replace(/\D/g, '');
  if (d.length !== 10) return tel;
  return d.match(/.{2}/g).join(' ');
}
function formatTelInput(tel) {
  if (!tel) return '';
  const d = tel.replace(/\D/g, '');
  if (d.length !== 10) return tel;
  return d.match(/.{2}/g).join(' ');
}

function rolePill(role) {
  const map = { administrateur:'admin', gestionnaire:'gestionnaire', utilisateur:'utilisateur' };
  const cls = map[role] || 'utilisateur';
  return `<span class="role-pill role-${cls}">${cls}</span>`;
}

async function toggleProfileEdit() {
  const readEl  = document.getElementById('profile-read');
  const editEl  = document.getElementById('profile-edit');
  const btnEl   = document.getElementById('btn-profile-edit').closest('div');
  const editing = !editEl.classList.contains('hidden');
  if (editing) {
    editEl.classList.add('hidden');
    readEl.classList.remove('hidden');
    btnEl.classList.remove('hidden');
  } else {
    const u = currentUser;
    document.getElementById('p-prenom').value   = u.prenom || '';
    document.getElementById('p-nom').value      = u.nom    || '';
    document.getElementById('p-email-display').textContent = u.email;
    document.getElementById('p-tel').value      = formatTelInput(u.tel);
    document.getElementById('p-demandeur').innerHTML = _demandeurOptions(u.demandeur_id || '');
    await _loadStructuresInto('p-structure', u.demandeur_id || '', u.structure_id || '');
    _setNiveauField('p-niveau', u.niveau || '', u.demandeur_id || '');
    document.getElementById('p-enfants').value       = u.enfants       || '';
    document.getElementById('p-accompagnants').value = u.accompagnants || '';
    const svcIds = Array.isArray(u.services) ? u.services : [];
    document.getElementById('p-service-display').textContent = svcIds.length
      ? svcIds.map(id => { const s = SERVICES.find(x => x.id === id); return s ? s.label : id; }).join(', ')
      : '—';
    readEl.classList.add('hidden');
    editEl.classList.remove('hidden');
    btnEl.classList.add('hidden');
  }
}

async function saveProfile() {
  const data = {
    prenom:        document.getElementById('p-prenom').value.trim(),
    nom:           document.getElementById('p-nom').value.trim(),
    tel:           document.getElementById('p-tel').value.trim(),
    demandeur_id:  document.getElementById('p-demandeur').value || '',
    structure_id:  document.getElementById('p-structure').value  || '',
    niveau:        document.getElementById('p-niveau').value.trim(),
    enfants:       document.getElementById('p-enfants').value        || 0,
    accompagnants: document.getElementById('p-accompagnants').value  || 0,
  };
  const r = await apiPost('/auth.php?action=update_profile', data);
  if (!r.ok) { showToast('⚠️ ' + (r.error||'Erreur')); return; }
  currentUser = r.user;
  renderProfileRead();
  document.getElementById('profile-edit').classList.add('hidden');
  document.getElementById('profile-read').classList.remove('hidden');
  const _btnEl = document.getElementById('btn-profile-edit');
  _btnEl.textContent = '✏️ Modifier';
  _btnEl.closest('div').classList.remove('hidden');
  const initials = ((currentUser.prenom ? currentUser.prenom[0] : '') + (currentUser.nom ? currentUser.nom[0] : '') || '?').toUpperCase();
  document.getElementById('avatar-initials').textContent = initials;
  document.getElementById('user-display-name').textContent = (currentUser.prenom+' '+currentUser.nom).trim();
  showToast('✅ Profil mis à jour');
}

function validatePwdChange() {
  const cur  = document.getElementById('p-pwd-current').value;
  const nw   = document.getElementById('p-pwd-new').value;
  const conf = document.getElementById('p-pwd-confirm').value;
  const policyErr = nw ? _pwdValid(nw) : '';
  const policyEl  = document.getElementById('p-pwd-policy-error');
  if (policyEl) { policyEl.textContent = policyErr; policyEl.style.display = policyErr ? 'block' : 'none'; }
  document.getElementById('p-pwd-mismatch').style.display = (conf && nw !== conf) ? 'block' : 'none';
  document.getElementById('btn-pwd-change').disabled = !(cur && !_pwdValid(nw) && nw === conf);
}

async function changePassword() {
  const cur = document.getElementById('p-pwd-current').value;
  const nw  = document.getElementById('p-pwd-new').value;
  const r = await apiPost('/auth.php?action=change_password', { current: cur, new: nw });
  if (!r.ok) { document.getElementById('p-pwd-error').style.display = 'block'; return; }
  document.getElementById('p-pwd-error').style.display = 'none';
  ['p-pwd-current','p-pwd-new','p-pwd-confirm'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('btn-pwd-change').disabled = true;
  showToast('🔑 Mot de passe mis à jour');
}

function toggleEmailChange() {
  const wrap = document.getElementById('p-email-change');
  const isHidden = wrap.classList.contains('hidden');
  if (isHidden) {
    wrap.classList.remove('hidden');
    document.getElementById('p-email-new').focus();
  } else {
    wrap.classList.add('hidden');
    document.getElementById('p-email-new').value = '';
    document.getElementById('p-email-error').style.display = 'none';
  }
}

async function requestEmailChange() {
  const emailInput = document.getElementById('p-email-new');
  const errEl      = document.getElementById('p-email-error');
  const newEmail   = emailInput.value.trim();
  errEl.style.display = 'none';
  if (!newEmail) return;
  const r = await apiPost('/auth.php?action=email_change_request', { new_email: newEmail });
  if (!r.ok) {
    errEl.textContent    = r.error || 'Erreur lors de la demande';
    errEl.style.display  = 'block';
    return;
  }
  toggleEmailChange();
  showToast('📧 Email de confirmation envoyé à ' + newEmail);
}

// ── Admin — chargement des données ───────────────────────
async function loadAdminData() {
  if (!currentServiceId || currentServiceId === 'admin' || currentServiceId === 'compte') return;
  const r = await apiGet(`/bookings.php?action=list&service_id=${currentServiceId}&all=1`);
  if (r.ok) { allBookings = r.bookings || []; allBookingsUnique = r.bookings_unique || []; }
  // Charger aussi les slots de tous les états → permet aux vues planning de naviguer dans
  // les exercices passés (les SLOTS_REC/UNIQ globaux ne contiennent que l'actif et restent
  // utilisés par le flux de réservation). L'exercice sélectionné côté UI est passé à l'API
  // pour ne charger que ses slots (= dernier exercice par défaut, ou celui choisi via ◀ ▶).
  const _exQs = currentExerciceId ? `&exercice_id=${encodeURIComponent(currentExerciceId)}` : '';
  const r2 = await apiGet(`/services.php?action=list&include_inactive=1${_exQs}`);
  if (r2.ok) {
    const svc = (r2.services || []).find(s => s.id === currentServiceId);
    if (svc) {
      SLOTS_REC_FULL     = svc.slots_recurring || [];
      SLOTS_REC_MAP_FULL = _buildSlotsMap(SLOTS_REC_FULL);
      SLOTS_UNIQ_FULL    = svc.slots_unique || [];
    }
  }
}

// ── Admin — tableau des réservations ─────────────────────
// Bascule entre les 2 sous-onglets de "Liste des réservations" (Récurrentes / Ponctuelles).
function switchAdminResTab(tab) {
  if (!['rec','uniq'].includes(tab)) return;
  _adminResTab = tab;
  renderAdminTable(); // resetPage=true
}

function renderAdminTable(resetPage = true) {
  if (resetPage) adminPage = 0;

  const tab = _adminResTab;
  // États visuels des onglets
  ['rec','uniq'].forEach(t => {
    const btn = document.getElementById('res-tab-' + t);
    if (btn) btn.classList.toggle('active', t === tab);
  });
  // Titre du panel suit le sous-onglet actif.
  const titleEl = document.getElementById('admin-res-panel-title');
  if (titleEl) titleEl.textContent = (tab === 'rec')
    ? 'Liste des réservations récurrentes'
    : 'Liste des réservations ponctuelles';
  // Filtre Période : visible sur les deux onglets — les ponctuels ont aussi un period_id
  // depuis la migration 2026-05.
  const fPeriodSel = document.getElementById('admin-filter-period');
  if (fPeriodSel) fPeriodSel.style.display = '';
  // Checkbox "inclure les miroirs récurrents" : visible uniquement sur Ponctuelles
  // (les miroirs sont des slots ponctuels engendrés par un récurrent ; sur l'onglet
  // Récurrentes ils n'existent pas en tant que lignes).
  const fMirrorsWrap = document.getElementById('admin-filter-mirrors-wrap');
  if (fMirrorsWrap) fMirrorsWrap.style.display = (tab === 'uniq') ? 'inline-flex' : 'none';

  const search   = _normSearch(document.getElementById('admin-search')?.value || '');
  const fPeriod  = document.getElementById('admin-filter-period')?.value || '';
  const includeMirrors = !!document.getElementById('admin-filter-mirrors')?.checked;
  const tbody    = document.getElementById('admin-tbody');
  const empty    = document.getElementById('admin-empty');
  const count    = document.getElementById('admin-count');
  if (!tbody) return;

  // Sélection des lignes par onglet
  let rows = tab === 'rec' ? [...allBookings] : [...allBookingsUnique];

  // Filtres
  if (fPeriod) {
    // S'applique aux 2 types : les ponctuels ont aussi un period_id depuis 2026-05.
    rows = rows.filter(r => String(r.period_id) === fPeriod);
  }
  if (tab === 'uniq' && !includeMirrors) {
    // Un miroir est un booking ponctuel rattaché à un slot lui-même issu d'un récurrent
    // (slot.parent_slot_id) OU à un booking récurrent parent (r.recurring_booking_id alias parent_booking_id).
    rows = rows.filter(r => {
      if (r.recurring_booking_id) return false;
      const sl = SLOTS_UNIQ.find(s => s.id === r.slot_id);
      return !sl?.parent_slot_id;
    });
  }
  if (search) rows = rows.filter(r =>
    _normSearch((r.nom||'')+(r.prenom||'')+(r.email||'')).includes(search));

  rows.sort((a,b) => {
    const va = a[adminSortKey]||'', vb = b[adminSortKey]||'';
    return adminSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  // Colgroup + thead selon l'onglet (largeurs ajustées sans/avec colonne Statut).
  const cgEl  = document.getElementById('admin-colgroup');
  const theEl = document.getElementById('admin-thead');
  const statutCol = validationMode ? '<col style="width:4%">' : '';
  const statutTh  = validationMode ? '<th style="text-align:center"></th>' : '';
  if (tab === 'rec') {
    if (cgEl) cgEl.innerHTML =
      `<col style="width:${validationMode ? '14%' : '16%'}">
       <col style="width:8%">
       <col style="width:${validationMode ? '22%' : '24%'}">
       <col style="width:7%">
       <col style="width:22%">
       <col style="width:${validationMode ? '23%' : '23%'}">${statutCol}`;
    if (theEl) theEl.innerHTML =
      `<tr>
        <th>Structure</th>
        <th>Niveau</th>
        <th onclick="sortAdmin('nom')">Demandeur <span class="sort-arrow">↕</span></th>
        <th style="text-align:center" title="Enfants + Adultes">Participants</th>
        <th style="text-align:center">Créneau</th>
        <th>Thème</th>${statutTh}
      </tr>`;
  } else { // 'uniq'
    if (cgEl) cgEl.innerHTML =
      `<col style="width:${validationMode ? '14%' : '16%'}">
       <col style="width:8%">
       <col style="width:${validationMode ? '20%' : '22%'}">
       <col style="width:7%">
       <col style="width:20%">
       <col style="width:${validationMode ? '27%' : '27%'}">${statutCol}`;
    if (theEl) theEl.innerHTML =
      `<tr>
        <th>Structure</th>
        <th>Niveau</th>
        <th onclick="sortAdmin('nom')">Demandeur <span class="sort-arrow">↕</span></th>
        <th style="text-align:center" title="Enfants + Adultes">Participants</th>
        <th style="text-align:center">Créneau</th>
        <th>Thème</th>${statutTh}
      </tr>`;
  }

  if (!rows.length) {
    tbody.innerHTML = '';
    empty?.classList.remove('hidden');
    if (count) count.textContent = '0 réservation';
    document.getElementById('admin-pagination').innerHTML = '';
    return;
  }
  empty?.classList.add('hidden');

  const totalPages = Math.ceil(rows.length / ADMIN_PAGE_SIZE);
  adminPage = Math.min(adminPage, totalPages - 1);
  const from     = adminPage * ADMIN_PAGE_SIZE;
  const pageRows = rows.slice(from, from + ADMIN_PAGE_SIZE);

  if (count) count.textContent =
    `${from + 1}–${from + pageRows.length} sur ${rows.length} réservation${rows.length>1?'s':''}`;

  // Pagination
  const pag = document.getElementById('admin-pagination');
  if (pag) {
    pag.innerHTML = `
      <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem"
        onclick="adminPage=Math.max(0,adminPage-1);renderAdminTable(false)" ${adminPage===0?'disabled':''}>‹</button>
      <span style="font-size:.7rem;color:var(--muted)">${adminPage+1} / ${totalPages}</span>
      <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem"
        onclick="adminPage=Math.min(${totalPages-1},adminPage+1);renderAdminTable(false)" ${adminPage>=totalPages-1?'disabled':''}>›</button>
    `;
  }

  tbody.innerHTML = pageRows.map(r => {
    const type     = r.day_key ? 'recurring' : 'unique';
    const slotPool = type === 'recurring' ? SLOTS_REC : SLOTS_UNIQ;
    const slot     = slotPool.find(s => s.id === r.slot_id);
    const rBadge   = (type === 'unique' && slot?.parent_slot_id) ? '<span style="font-size:.55rem;font-weight:800;background:rgba(0,0,0,.18);border-radius:3px;padding:1px 3px;margin-right:3px;vertical-align:middle">R</span>' : '';
    const _hasTimes = slot && slot.start_time && slot.end_time;
    const _timesStr = _hasTimes
      ? `${slot.start_time.slice(0,5)} – ${slot.end_time.slice(0,5)}`
      : 'Journée entière';
    let _dayLine = '';
    if (type === 'recurring') {
      _dayLine = DAYS[DKEYS.indexOf(r.day_key)] || r.day_key || '';
    } else if (slot?.slot_date) {
      const d = new Date(slot.slot_date);
      const dayName  = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1] || '';
      const dateOnly = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
      _dayLine = [dayName, dateOnly].filter(Boolean).join(' ');
    }
    // Créneau : badge R à gauche, jour/date + horaires sur une seule ligne, même style.
    const creneau = slot
      ? `${rBadge}${[_dayLine, _timesStr].filter(Boolean).join(' ')}`
      : (r.slot_id || '—');
    // period_id est désormais source de vérité pour les 2 types (migration 2026-05).
    // Si NULL/0 sur un ponctuel : c'est une donnée legacy non migrée, on affiche "—".
    const period = r.period_id
      ? PERIODS.find(p => p.id === parseInt(r.period_id))
      : null;
    const pillColor = period ? period.color : '#6dceaa';
    const pillLabel = period ? (period.etiquette || period.label) : '—';
    const trimPill = period
      ? `<span class="role-pill" style="background:${pillColor}66;color:color-mix(in srgb,${pillColor} 65%,#000)">${pillLabel}</span>`
      : '—';
    const statut = r.validated == 1 ? '✅' : '⏳';

    // Cellules communes — ordre : Structure, Niveau, Demandeur (Nom Prénom), Enf., Adult., puis spécifique au type, Thème, [Statut].
    const demandeurTxt = [r.nom, r.prenom].filter(Boolean).join(' ') || '—';
    const demandeurTd  = `<td style="white-space:normal">${demandeurTxt}</td>`;
    // Fallback : si pas de structure, on affiche la catégorie (demandeur_label).
    const structTd  = `<td style="white-space:normal">${r.structure_label || r.demandeur_label || '—'}</td>`;
    const niveauTd  = `<td style="white-space:nowrap">${r.niveau||'—'}</td>`;
    const _enf = parseInt(r.enfants) || 0;
    const _adu = parseInt(r.accompagnants) || 0;
    const participantsTd = `<td style="text-align:center;white-space:nowrap">${_enf} + ${_adu}</td>`;
    const creneauTd = `<td style="text-align:left;white-space:nowrap">${creneau}</td>`;
    const themeTd   = `<td>${r.theme_label||'—'}</td>`;
    const statutTd  = validationMode ? `<td style="text-align:center;overflow:visible">${statut}</td>` : '';

    if (tab === 'rec') {
      // Récurrentes : pill période en tête de la cellule créneau, puis jour + horaires.
      const creneauWithPeriod = `<td style="text-align:left;white-space:nowrap">${trimPill} ${creneau}</td>`;
      return `<tr>${structTd}${niveauTd}${demandeurTd}${participantsTd}${creneauWithPeriod}${themeTd}${statutTd}</tr>`;
    }
    // 'uniq'
    return `<tr>${structTd}${niveauTd}${demandeurTd}${participantsTd}${creneauTd}${themeTd}${statutTd}</tr>`;
  }).join('');
}

function sortAdmin(key) {
  if (adminSortKey === key) adminSortAsc = !adminSortAsc;
  else { adminSortKey = key; adminSortAsc = true; }
  renderAdminTable();
}

// ── Modale de confirmation : suppression d'une réservation ──
// Retourne une Promise<boolean> : true si l'utilisateur confirme.
let _bkDelResolve = null;
function askDeleteBooking(id, type) {
  const list = type === 'unique' ? allBookingsUnique : allBookings;
  const bk   = list.find(b => b.id == id) || {};
  const name = bk.structure_label || bk.demandeur_label
            || ((bk.nom || '') + ' ' + (bk.prenom || '')).trim()
            || 'cette réservation';
  const sl     = (type === 'unique' ? SLOTS_UNIQ : SLOTS_REC).find(s => s.id === bk.slot_id);
  const dayIdx = ALL_DKEYS.indexOf(bk.day_key);
  const dayLbl = dayIdx >= 0 ? ALL_DAYS[dayIdx] : '';
  const parts  = [];
  if (sl)     parts.push(slotLabel(sl));
  if (dayLbl) parts.push(dayLbl);
  if (bk.period_id) {
    const p = PERIODS.find(p => p.id === parseInt(bk.period_id));
    if (p?.label) parts.push(p.label);
  }
  if (type === 'unique' && bk.slot_date) {
    parts.push(new Date(bk.slot_date + 'T00:00').toLocaleDateString('fr-FR'));
  }
  document.getElementById('bdc-name').textContent    = name;
  document.getElementById('bdc-kind').textContent    = (type === 'recurring') ? ' récurrente' : '';
  document.getElementById('bdc-details').textContent = parts.join(' · ');
  document.getElementById('booking-delete-confirm-modal').classList.add('open');
  return new Promise(resolve => { _bkDelResolve = resolve; });
}
function _resolveBookingDelete(ok) {
  document.getElementById('booking-delete-confirm-modal').classList.remove('open');
  if (_bkDelResolve) { _bkDelResolve(ok); _bkDelResolve = null; }
}
// ── Export CSV ────────────────────────────────────────────
function exportCSV() {
  if (!currentServiceId) return;
  window.location.href = `${API}/export.php?service_id=${currentServiceId}`;
}

// ── Impression admin : reprend la "Liste des réservations" filtrée du sous-onglet actif ──
function printAdminReservations() {
  if (!currentServiceId) return;
  const tab = _adminResTab;
  const isRec = (tab === 'rec');
  const titleStr = isRec
    ? 'Liste des réservations récurrentes'
    : 'Liste des réservations ponctuelles';
  const svc      = SERVICES.find(s => s.id === currentServiceId);
  const svcName  = svc ? svc.label : '';

  // Reprend les mêmes filtres que renderAdminTable
  const search  = _normSearch(document.getElementById('admin-search')?.value || '');
  const fPeriod = document.getElementById('admin-filter-period')?.value || '';
  const includeMirrors = !!document.getElementById('admin-filter-mirrors')?.checked;

  let rows = isRec ? [...allBookings] : [...allBookingsUnique];
  if (fPeriod && isRec) rows = rows.filter(r => String(r.period_id) === fPeriod);
  if (!isRec && !includeMirrors) {
    rows = rows.filter(r => {
      if (r.recurring_booking_id) return false;
      const sl = SLOTS_UNIQ.find(s => s.id === r.slot_id);
      return !sl?.parent_slot_id;
    });
  }
  if (search) rows = rows.filter(r =>
    _normSearch((r.nom||'')+(r.prenom||'')+(r.email||'')).includes(search));
  rows.sort((a,b) => {
    const va = a[adminSortKey]||'', vb = b[adminSortKey]||'';
    return adminSortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  // Helper : libellé du créneau combinant jour/date + horaires (ou "Journée entière").
  const slotTimeStr = (sl) => {
    if (!sl) return '—';
    const s = (sl.start_time || '').slice(0, 5);
    const e = (sl.end_time   || '').slice(0, 5);
    return (s && e) ? `${s} – ${e}` : 'Journée entière';
  };

  const bodyRows = rows.map(r => {
    const type     = r.day_key ? 'recurring' : 'unique';
    const slotPool = type === 'recurring' ? SLOTS_REC : SLOTS_UNIQ;
    const slot     = slotPool.find(s => s.id === r.slot_id);
    const struct   = r.structure_label || r.demandeur_label || '—';
    const demandeur = [r.nom, r.prenom].filter(Boolean).join(' ') || '—';
    const period   = r.period_id ? PERIODS.find(p => p.id === parseInt(r.period_id)) : null;
    const periodLbl = period ? period.label : '—';
    const timesStr = slotTimeStr(slot);
    let dayLine = '';
    if (type === 'recurring') {
      dayLine = DAYS[DKEYS.indexOf(r.day_key)] || r.day_key || '';
    } else if (slot?.slot_date) {
      const d = new Date(slot.slot_date + 'T12:00:00');
      const dayName  = DAYS[d.getDay() === 0 ? 6 : d.getDay() - 1] || '';
      const dateOnly = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric' });
      dayLine = `${dayName} ${dateOnly}`.trim();
    }
    const creneauCell = escHtml([dayLine, timesStr].filter(Boolean).join(' '));
    const statut = r.validated == 1 ? 'Validé' : 'En attente';
    const _enf = parseInt(r.enfants) || 0;
    const _adu = parseInt(r.accompagnants) || 0;
    const participantsCell = `<td style="text-align:center;white-space:nowrap">${_enf} + ${_adu}</td>`;
    return isRec
      ? `<tr>
          <td>${escHtml(struct)}</td>
          <td>${escHtml(r.niveau || '—')}</td>
          <td>${escHtml(demandeur)}</td>
          ${participantsCell}
          <td>${escHtml(periodLbl)} · ${creneauCell}</td>
          <td>${escHtml(r.theme_label || '—')}</td>
          ${validationMode ? `<td>${statut}</td>` : ''}
        </tr>`
      : `<tr>
          <td>${escHtml(struct)}</td>
          <td>${escHtml(r.niveau || '—')}</td>
          <td>${escHtml(demandeur)}</td>
          ${participantsCell}
          <td>${creneauCell}</td>
          <td>${escHtml(r.theme_label || '—')}</td>
          ${validationMode ? `<td>${statut}</td>` : ''}
        </tr>`;
  }).join('');

  const thead = isRec
    ? `<tr><th>Structure</th><th>Niveau</th><th>Demandeur</th><th>Participants</th><th>Créneau</th><th>Thème</th>${validationMode ? '<th>Statut</th>' : ''}</tr>`
    : `<tr><th>Structure</th><th>Niveau</th><th>Demandeur</th><th>Participants</th><th>Créneau</th><th>Thème</th>${validationMode ? '<th>Statut</th>' : ''}</tr>`;

  // Impression via la fenêtre parente : Chrome respecte fiablement @page sur la fenêtre
  // principale, beaucoup moins quand on imprime une iframe. On injecte un conteneur dédié
  // qui devient visible uniquement en @media print, et on cache tout le reste.
  let container = document.getElementById('admin-print-area');
  if (!container) {
    container = document.createElement('div');
    container.id = 'admin-print-area';
    document.body.appendChild(container);
  }
  let styleEl = document.getElementById('admin-print-styles');
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'admin-print-styles';
    document.head.appendChild(styleEl);
  }
  styleEl.textContent = `
    @page { size: A4 landscape; margin: 1cm; }
    #admin-print-area { display: none; }
    @media print {
      body > *:not(#admin-print-area) { display: none !important; }
      body { background: white !important; color: #1a1f2e !important; font-family: system-ui, sans-serif !important; }
      #admin-print-area { display: block !important; font-size: 10pt; }
      #admin-print-area h1 { font-size: 15pt; margin: 0 0 .25rem; }
      #admin-print-area .subtitle { font-size: 10pt; color: #555; margin-bottom: 1rem; }
      #admin-print-area table { width: 100%; border-collapse: collapse; }
      #admin-print-area th, #admin-print-area td { padding: .35rem .5rem; border-bottom: 1px solid #ddd; font-size: 9.5pt; text-align: left; vertical-align: top; color: #1a1f2e; }
      #admin-print-area th { background: #f0f0f0; font-weight: 600; font-size: 9pt; text-transform: uppercase; letter-spacing: .04em; }
      #admin-print-area tr:nth-child(even) td { background: #fafafa; }
    }
  `;
  container.innerHTML = `
    <h1>${escHtml(titleStr)}</h1>
    <div class="subtitle">${escHtml(svcName)} — ${rows.length} réservation${rows.length>1?'s':''}</div>
    <table>
      <thead>${thead}</thead>
      <tbody>${bodyRows || `<tr><td colspan="7" style="text-align:center;color:#999;padding:1.5rem">Aucune réservation</td></tr>`}</tbody>
    </table>
  `;
  const _cleanup = () => {
    if (container && container.parentNode) container.parentNode.removeChild(container);
    if (styleEl && styleEl.parentNode) styleEl.parentNode.removeChild(styleEl);
    window.removeEventListener('afterprint', _cleanup);
  };
  window.addEventListener('afterprint', _cleanup);
  // Fallback si afterprint ne se déclenche pas.
  setTimeout(_cleanup, 60000);
  // Laisse le DOM se mettre à jour avant le print.
  setTimeout(() => window.print(), 100);
}

// ── Admin — Comptes utilisateurs ──────────────────────────
let _allUsersAdmin = [];
async function renderUserAccountsAdmin(resetPage = true) {
  if (resetPage) ucPage = 0;
  const search = _normSearch(document.getElementById('uc-search-admin')?.value || '');
  if (!_allUsersAdmin.length) {
    const r = await apiGet('/users.php?action=list');
    if (r.ok) _allUsersAdmin = r.users || [];
  }
  let users = _allUsersAdmin.filter(u =>
    !search || _normSearch((u.nom||'')+(u.prenom||'')+(u.email||'')).includes(search));
  if (ucSortKey === 'default') {
    users.sort((a,b) =>
      (a.role||'').localeCompare(b.role||'') ||
      (a.nom||'').localeCompare(b.nom||'') ||
      (a.prenom||'').localeCompare(b.prenom||''));
  } else {
    users.sort((a,b) => (a[ucSortKey]||'').localeCompare(b[ucSortKey]||''));
  }

  const tbody = document.getElementById('uc-tbody-admin');
  const empty = document.getElementById('uc-empty-admin');
  const count = document.getElementById('uc-count-admin');
  const pag   = document.getElementById('uc-pagination-admin');
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = ''; empty?.classList.remove('hidden');
    if (count) count.textContent = '0 compte';
    if (pag) pag.innerHTML = '';
    return;
  }
  empty?.classList.add('hidden');

  // Pagination
  const totalPages = Math.max(1, Math.ceil(users.length / UC_PAGE_SIZE));
  ucPage = Math.min(Math.max(0, ucPage), totalPages - 1);
  const from     = ucPage * UC_PAGE_SIZE;
  const pageRows = users.slice(from, from + UC_PAGE_SIZE);

  if (count) count.textContent = `${from + 1}–${from + pageRows.length} sur ${users.length} compte${users.length>1?'s':''}`;
  if (pag) {
    pag.innerHTML = `
      <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem"
        onclick="ucPage=Math.max(0,ucPage-1);renderUserAccountsAdmin(false)" ${ucPage===0?'disabled':''}>‹</button>
      <span style="font-size:.7rem;color:var(--muted)">${ucPage+1} / ${totalPages}</span>
      <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem"
        onclick="ucPage=Math.min(${totalPages-1},ucPage+1);renderUserAccountsAdmin(false)" ${ucPage>=totalPages-1?'disabled':''}>›</button>
    `;
  }

  tbody.innerHTML = pageRows.map((u, i) => {
    // Rupture de rôle : comparer au précédent dans la PAGE (i>0) ou au global (i==0 et page>0)
    const prev = i > 0 ? pageRows[i-1] : (from > 0 ? users[from-1] : null);
    const breakRole = (ucSortKey === 'default' || ucSortKey === 'role') && prev && (prev.role||'') !== (u.role||'');
    const rowClass = breakRole ? ' class="role-break"' : '';
    return `<tr${rowClass}>
    <td class="col-check"><input type="checkbox" class="admin-cb uc-cb" data-id="${u.id}" onchange="toggleAccountRow(this)"></td>
    <td>${u.nom||'—'}</td><td>${u.prenom||'—'}</td>
    <td style="color:var(--muted)">${u.email}</td>
    <td style="white-space:nowrap">${formatTel(u.tel)}</td>
    <td>${(() => {
      // Cascade : service(s) > structure > catégorie. Indépendant du rôle.
      const svcIds = Array.isArray(u.services) ? u.services : [];
      if (svcIds.length) {
        return svcIds.map(id => { const s = SERVICES.find(x => x.id === id); return s ? s.label : id; }).join(', ');
      }
      if (u.structure_label) return u.structure_label;
      if (u.demandeur_label) return u.demandeur_label;
      return '—';
    })()}</td>
    <td>${rolePill(u.role)}</td>
    <td style="text-align:center;white-space:nowrap">
      <a class="btn btn-ghost" href="rgpd_export.php?id=${u.id}" target="_blank" onclick="event.stopPropagation()"
        style="padding:.05rem .45rem;font-size:.7rem;text-decoration:none;margin-right:.2rem" title="Exporter les données RGPD">📥</a>
      ${u.anonymized_at
        ? '<span style="font-size:.62rem;color:var(--muted);font-style:italic" title="Compte déjà anonymisé">anonymisé</span>'
        : `<button class="btn btn-ghost" onclick="event.stopPropagation();_rgpdAnonymizeFromAdminTable(${u.id})"
            style="padding:.05rem .45rem;font-size:.7rem;border-color:rgba(224,107,107,.4);color:var(--danger)" title="Anonymiser ce compte (RGPD)">🛡️</button>`}
    </td>
  </tr>`;
  }).join('');
}

function sortUsers(key) {
  if (ucSortKey === key) { /* toggle direction handled elsewhere */ }
  ucSortKey = key; renderUserAccountsAdmin();
}

async function toggleAccountRow(cb) {
  const id = cb.dataset.id;
  // Désélectionner tous les autres
  document.querySelectorAll('.uc-cb').forEach(other => {
    if (other !== cb) { other.checked = false; other.closest('tr')?.classList.remove('row-checked'); }
  });
  selectedRows.clear();
  if (cb.checked) { selectedRows.add(id); cb.closest('tr').classList.add('row-checked'); }
  else { cb.closest('tr').classList.remove('row-checked'); }
  const toolbar = document.getElementById('uc-bulk-toolbar-admin');
  const countEl = document.getElementById('uc-bulk-count-admin');
  if (toolbar) toolbar.style.visibility = selectedRows.size > 0 ? 'visible' : 'hidden';
  if (countEl) countEl.textContent = selectedRows.size > 0 ? '1 sélectionné' : '';
  // Bouton Supprimer : visible seulement si le compte sélectionné n'a aucune
  // réservation (sinon, l'admin doit utiliser Anonymiser pour préserver l'historique).
  const delBtn = document.getElementById('btn-delete-account');
  if (delBtn) {
    let canDelete = false;
    if (cb.checked) {
      const u = _allUsersAdmin.find(x => x.id == id);
      canDelete = !!u && (u.booking_count || 0) === 0;
    }
    delBtn.style.display = canDelete ? '' : 'none';
  }
  const resendBtn = document.getElementById('btn-resend-confirm');
  if (resendBtn) {
    let showResend = false;
    if (cb.checked) {
      const r = await apiGet(`/users.php?action=get&id=${id}`);
      if (r.ok) showResend = parseInt(r.user.email_confirmed) === 0;
    }
    resendBtn.style.display = showResend ? '' : 'none';
  }
}

async function resendConfirmationEmail() {
  const id = [...selectedRows][0];
  if (!id) return;
  const r = await apiPost('/auth.php?action=resend_confirmation', { user_id: Number(id) });
  if (r.ok) showToast('📧 Mail de confirmation renvoyé');
  else showToast('⚠️ ' + (r.error || 'Erreur'));
}
function clearAccountSelection() {
  selectedRows.clear();
  document.querySelectorAll('.uc-cb').forEach(cb => { cb.checked = false; cb.closest('tr')?.classList.remove('row-checked'); });
  const t = document.getElementById('uc-bulk-toolbar-admin');
  if (t) t.style.visibility = 'hidden';
}
function editSelectedAccount() {
  if (selectedRows.size !== 1) return showToast('⚠️ Sélectionnez un seul compte pour le modifier');
  openUserModal([...selectedRows][0]);
}

function _populateServiceSelect(selectedIds) {
  const sel = document.getElementById('uc-edit-service');
  const set = new Set((selectedIds || []).map(String));
  if (!SERVICES.length) {
    sel.innerHTML = '<span style="color:var(--muted);font-size:.78rem">Aucun service disponible</span>';
    return;
  }
  sel.innerHTML = SERVICES.map(s => `<label class="uc-service-row">
    <span>${s.label}</span>
    <input type="checkbox" value="${s.id}"${set.has(String(s.id)) ? ' checked' : ''}>
  </label>`).join('');
}
function _readSelectedServices() {
  return [...document.querySelectorAll('#uc-edit-service input[type=checkbox]:checked')].map(cb => cb.value);
}
// Active la liste de services uniquement pour les gestionnaires.
// Les autres rôles (utilisateur, administrateur) ne gèrent pas de service nominatif :
// les cases sont décochées et désactivées, et le conteneur grisé.
function _applyServicesEnabledByRole() {
  const role    = document.getElementById('uc-edit-role')?.value || '';
  const enabled = role === 'gestionnaire';
  const list    = document.getElementById('uc-edit-service');
  if (!list) return;
  list.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.disabled = !enabled;
    if (!enabled) cb.checked = false;
  });
  list.style.opacity       = enabled ? '' : '.5';
  list.style.pointerEvents = enabled ? '' : 'none';
}

async function openUserModal(userId) {
  _editUserId = userId;
  const u = _allUsersAdmin.find(u => u.id == userId);
  if (!u) return;
  document.getElementById('uc-modal-title').textContent = `✏️ ${u.prenom} ${u.nom}`;
  document.getElementById('uc-edit-prenom').value  = u.prenom || '';
  document.getElementById('uc-edit-nom').value    = u.nom    || '';
  const emailEl = document.getElementById('uc-edit-email');
  emailEl.value = u.email; emailEl.disabled = true;
  document.getElementById('uc-edit-tel').value    = formatTelInput(u.tel);
  document.getElementById('uc-edit-demandeur').innerHTML = _demandeurOptions(u.demandeur_id || '');
  await _loadStructuresInto('uc-edit-structure', u.demandeur_id || '', u.structure_id || '');
  _setNiveauField('uc-edit-niveau', u.niveau || '', u.demandeur_id || '');
  document.getElementById('uc-edit-enfants').value       = u.enfants       || '';
  document.getElementById('uc-edit-accompagnants').value = u.accompagnants || '';
  document.getElementById('uc-edit-role').value          = u.role          || 'utilisateur';
  _populateServiceSelect(Array.isArray(u.services) ? u.services : []);
  _applyServicesEnabledByRole();
  document.getElementById('uc-edit-pwd').value    = '';
  // Reset toujours actif en mode édition (envoi de mail, plus de check complexité).
  document.getElementById('btn-admin-pwd-reset').disabled = false;
  document.getElementById('uc-modal-overlay').classList.add('open');
}

function openCreateUserModal() {
  _editUserId = null;
  document.getElementById('uc-modal-title').textContent = '＋ Ajouter un compte';
  ['uc-edit-prenom','uc-edit-nom','uc-edit-tel','uc-edit-pwd','uc-edit-accompagnants'].forEach(id => document.getElementById(id).value='');
  document.getElementById('uc-edit-demandeur').innerHTML = _demandeurOptions('');
  document.getElementById('uc-edit-structure').innerHTML = '<option value="">— Sélectionner d\'abord une catégorie —</option>';
  _setNiveauField('uc-edit-niveau');
  document.getElementById('uc-edit-email').value  = '';
  document.getElementById('uc-edit-email').disabled = false;
  document.getElementById('uc-edit-enfants').value= '';
  document.getElementById('uc-edit-role').value   = 'utilisateur';
  _populateServiceSelect([]);
  _applyServicesEnabledByRole();
  // Mode création : pas d'utilisateur cible donc reset désactivé. Une fois
  // créé, l'admin pourra ré-ouvrir la fiche pour envoyer le lien.
  document.getElementById('btn-admin-pwd-reset').disabled = true;
  document.getElementById('uc-modal-overlay').classList.add('open');
}

function closeUserModal() {
  document.getElementById('uc-modal-overlay').classList.remove('open');
}

async function saveUserEdit() {
  const data = {
    prenom:       document.getElementById('uc-edit-prenom').value.trim(),
    nom:          document.getElementById('uc-edit-nom').value.trim(),
    tel:          document.getElementById('uc-edit-tel').value.trim(),
    demandeur_id: document.getElementById('uc-edit-demandeur').value || '',
    structure_id:  document.getElementById('uc-edit-structure').value  || '',
    niveau:        document.getElementById('uc-edit-niveau').value.trim(),
    enfants:       document.getElementById('uc-edit-enfants').value       || 0,
    accompagnants: document.getElementById('uc-edit-accompagnants').value || 0,
    role:          document.getElementById('uc-edit-role').value,
    services:      _readSelectedServices(),
  };
  let r;
  if (_editUserId) {
    r = await apiPost('/users.php?action=update', { id: _editUserId, ...data });
  } else {
    data.email    = document.getElementById('uc-edit-email').value.trim();
    data.password = document.getElementById('uc-edit-pwd').value || 'Changez-moi1!';
    r = await apiPost('/users.php?action=create', data);
  }
  if (!r.ok) { showToast('⚠️ ' + (r.error||'Erreur')); return; }
  closeUserModal();
  _allUsersAdmin = [];
  renderUserAccountsAdmin();
  showToast('✅ Compte enregistré');
}

// Nouveau flow : l'admin déclenche l'envoi d'un mail à l'utilisateur, qui choisira
// lui-même son nouveau mot de passe via le lien reçu (valide 1h). L'admin ne
// connaît jamais le mot de passe.
// UX : ferme la modale d'édition puis ouvre la modale de confirmation
// polymorphe (réutilisée depuis le système RGPD, tonalité 'info').
function adminResetPassword() {
  if (!_editUserId) return;
  const id = _editUserId;
  const u  = _allUsersAdmin.find(x => x.id == id);
  closeUserModal();
  // Sync cache : la modale polymorphe lit _rgpdUsersCache.
  if (u && !_rgpdUsersCache.find(x => x.id == id)) _rgpdUsersCache = _rgpdUsersCache.concat([u]);
  _rgpdOpenConfirmModal([id], {
    title:       '🔑 Envoyer un lien de réinitialisation',
    intro:       'Un e-mail va être envoyé au compte suivant. Il y trouvera un lien valable 1 heure pour choisir lui-même un nouveau mot de passe.',
    warningHtml: '<strong style="color:var(--accent)">Confidentialité.</strong> L\'administrateur ne définit pas le mot de passe et n\'y aura jamais accès — c\'est l\'utilisateur qui le choisit via le lien reçu.',
    warnTone:    'info',
    buttonLabel: '📧 Envoyer le lien',
    buttonTone:  'info',
    onConfirm:   _rgpdConfirmAdminPasswordReset,
  });
}
async function _rgpdConfirmAdminPasswordReset() {
  const ids = _rgpdPendingAnonymizeIds.slice();
  if (!ids.length) return;
  const id  = ids[0];
  const btn = document.getElementById('rgpd-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const r = await apiPost('/auth.php?action=password_reset_admin_trigger', {
    action: 'password_reset_admin_trigger',
    id,
  });
  closeRgpdAnonymizeModal();
  if (!r || !r.ok) { showToast('⚠️ ' + ((r && r.error) || 'Erreur')); return; }
  showToast('📧 Lien de réinitialisation envoyé', 4000);
}

function deleteSelectedAccounts() {
  if (!selectedRows.size) return;
  const ids = Array.from(selectedRows).map(x => parseInt(x, 10));
  // Filtre : seulement les comptes sans bookings (le bouton est déjà censé
  // n'apparaître que dans ce cas, mais on revérifie).
  const eligible = ids.filter(id => {
    const u = _allUsersAdmin.find(x => x.id == id);
    return u && (u.booking_count || 0) === 0;
  });
  if (!eligible.length) {
    showToast('⚠️ Aucun compte éligible à la suppression dure (utilisez Anonymiser)', 5000, { warn: true });
    return;
  }
  _rgpdOpenDeleteModal(eligible);
}

// Configure et ouvre la modale de confirmation pour une suppression dure
// (rouge, "Action irréversible" — pas de garde-fou utilisateur, mais le
// backend exige booking_count == 0).
function _rgpdOpenDeleteModal(ids) {
  // Sync cache : la modale lit _rgpdUsersCache pour afficher la liste
  ids.forEach(id => {
    const u = _allUsersAdmin.find(x => x.id == id);
    if (u && !_rgpdUsersCache.find(x => x.id == id)) _rgpdUsersCache = _rgpdUsersCache.concat([u]);
  });
  const n = ids.length;
  _rgpdOpenConfirmModal(ids, {
    title: n === 1 ? '🗑️ Supprimer définitivement le compte' : `🗑️ Supprimer définitivement ${n} comptes`,
    intro: n === 1
      ? 'Vous êtes sur le point de supprimer définitivement le compte suivant :'
      : `Vous êtes sur le point de supprimer définitivement les ${n} comptes suivants :`,
    warningHtml: '<strong style="color:var(--danger)">Action irréversible.</strong> Le compte sera entièrement effacé de la base de données. Cette action n\'est autorisée que pour les comptes sans aucune réservation associée.',
    warnTone:    'danger',
    buttonLabel: n === 1 ? '🗑️ Supprimer définitivement' : `🗑️ Supprimer (${n})`,
    buttonTone:  'danger',
    onConfirm:   _rgpdConfirmHardDelete,
  });
}
async function _rgpdConfirmHardDelete() {
  const ids = _rgpdPendingAnonymizeIds.slice();
  if (!ids.length) return;
  const btn = document.getElementById('rgpd-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  let ok = 0, fail = 0;
  for (const id of ids) {
    const r = await apiPost('/users.php?action=delete', { id });
    if (r && r.ok) ok++; else fail++;
  }
  closeRgpdAnonymizeModal();
  showToast(fail
    ? `⚠️ ${ok} compte(s) supprimé(s), ${fail} échec(s)`
    : ok === 1 ? '🗑️ Compte supprimé' : `🗑️ ${ok} comptes supprimés`);
  selectedRows.clear(); _allUsersAdmin = [];
  clearAccountSelection(); renderUserAccountsAdmin();
}

// ── Admin — Services ──────────────────────────────────────

const _svcSelected = new Set();

function _svcToolbarUpdate() {
  const toolbar  = document.getElementById('svc-bulk-toolbar');
  const countEl  = document.getElementById('svc-bulk-count');
  const n = _svcSelected.size;
  if (toolbar) toolbar.style.visibility = n > 0 ? 'visible' : 'hidden';
  if (countEl) countEl.textContent = n > 0 ? `${n} sélectionné(s)` : '';
}

function toggleSvcRow(cb) {
  const id = cb.dataset.id;
  // Désélectionner tous les autres
  document.querySelectorAll('.svc-cb').forEach(other => {
    if (other !== cb) { other.checked = false; other.closest('tr')?.classList.remove('row-checked'); }
  });
  _svcSelected.clear();
  if (cb.checked) { _svcSelected.add(id); cb.closest('tr').classList.add('row-checked'); }
  else { cb.closest('tr').classList.remove('row-checked'); }
  _svcToolbarUpdate();
}

function editSelectedSvc() {
  if (_svcSelected.size !== 1) return showToast('⚠️ Sélectionnez un service pour le modifier');
  openSvcModal([..._svcSelected][0]);
}

async function deleteSelectedSvcs() {
  if (!_svcSelected.size) return;
  if (!confirm(`Supprimer ${_svcSelected.size} service(s) et toutes leurs réservations ?`)) return;
  for (const id of _svcSelected) await apiPost('/services.php?action=delete', { id });
  _svcSelected.clear();
  const r = await apiGet('/services.php?action=list');
  if (r.ok) { SERVICES = r.services; renderServiceSidebar(); renderServicesConfigTable(); }
  _svcToolbarUpdate();
  showToast('🗑️ Service(s) supprimé(s)');
}

function renderServicesConfigTable() {
  const tbody = document.getElementById('services-config-tbody');
  if (!tbody) return;
  _svcSelected.clear();
  _svcToolbarUpdate();
  tbody.innerHTML = SERVICES.map(s => {
    const id = s.id;
    return '<tr data-svc-id="' + id + '">'
      + '<td class="col-check"></td>'
      + '<td style="font-size:1.2rem;text-align:center">' + svcIcon(s.label, id) + '</td>'
      + '<td style="font-size:.9rem">' + s.label + '</td>'
      + '<td style="text-align:center"><button class="btn btn-ghost" onclick="switchParent(\'' + id + '\')" style="font-size:.72rem;padding:.2rem .5rem">Gérer</button></td>'
      + '</tr>';
  }).join('');
  tbody.querySelectorAll('tr[data-svc-id]').forEach(tr => {
    const id = tr.dataset.svcId;
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.className = 'admin-cb svc-cb'; cb.dataset.id = id;
    cb.addEventListener('change', () => toggleSvcRow(cb));
    tr.querySelector('td.col-check').appendChild(cb);
  });
}

function makeToggle(type, svcId, isOn, onclickFn, disabled = false, compact = false) {
  if (disabled) isOn = false;
  const bg   = isOn ? 'var(--accent)' : 'var(--surface2)';
  const brd  = isOn ? 'var(--accent)' : 'var(--border)';
  // Dimensions standard (32×18) ou compactes (26×14)
  const w    = compact ? 26 : 32;
  const h    = compact ? 14 : 18;
  const dot  = compact ? 9  : 11;
  const off  = compact ? 1.5 : 2;
  const on   = compact ? (w - dot - off - 3) : 16; // ≈ 12.5px (compact) / 16px (standard)
  const dotL = isOn ? on + 'px' : off + 'px';
  const top  = compact ? 1 : 2;
  const click = disabled ? '' : `onclick="${onclickFn}"`;
  const cursor = disabled ? 'not-allowed' : 'pointer';
  const opacity = disabled ? 'opacity:.35;' : '';
  return `<label style="display:inline-flex;align-items:center;cursor:${cursor};${opacity}">
    <div ${click} style="position:relative;width:${w}px;height:${h}px;border-radius:99px;
      background:${bg};border:1.5px solid ${brd};cursor:${cursor};transition:.25s;flex-shrink:0">
      <span style="position:absolute;top:${top}px;left:${dotL};width:${dot}px;height:${dot}px;border-radius:50%;
        background:${isOn?'#0f1117':'var(--muted)'};transition:.25s;display:block"></span>
    </div>
  </label>`;
}

// ── Modale service (création + édition) ──────────────────
let _svcModalId   = null; // null = création, sinon ID du service édité
let _svcModalIcon = '';

function _renderSvcModalIcon() {
  const btn = document.getElementById('svc-modal-icon-btn');
  if (btn) btn.textContent = _svcModalIcon || '🎯';
}


// Rendu générique de la table (paramétré par état + ID conteneur + suffixe handlers)
function _renderCatSettingsTable(state, containerId, suffix, addBtnId = null) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const cols  = ['recurrent', 'semaine_ab', 'validation', 'themes', 'jauge'];
  const heads = ['Récurrent', 'Semaine A/B', 'Validation', 'Thèmes', 'Jauge'];
  const usedIds = state.map(function(r) { return r.demandeur_id; }).filter(Boolean);
  const thS  = 'padding:.35rem .5rem;font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);text-align:center;white-space:nowrap';
  const tdS  = 'padding:.4rem .5rem;text-align:center';
  const tdLS = 'padding:.4rem .6rem;font-size:.82rem;white-space:nowrap';
  const tdDelS = 'padding:.4rem .3rem;text-align:center';
  const fnToggle = '_toggle'    + suffix;
  const fnSet    = '_set'       + suffix + 'RowCategory';
  const fnRemove = '_remove'    + suffix + 'Row';
  const fnAdd    = '_add'       + suffix + 'Row';

  let html = '';

  if (state.length > 0) {
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:.6rem"><thead><tr>';
    html += '<th style="' + thS + ';text-align:left">Demandeur</th>';
    heads.forEach(function(h) { html += '<th style="' + thS + '">' + h + '</th>'; });
    html += '<th></th></tr></thead><tbody>';

    state.forEach(function(row, idx) {
      html += '<tr>';
      if (row.demandeur_id) {
        html += '<td style="' + tdLS + '">' + row.label + '</td>';
      } else {
        html += '<td style="' + tdLS + 'padding-top:.2rem;padding-bottom:.2rem"><select onchange="' + fnSet + '(' + idx + ',this.value)" style="font-size:.82rem;padding:.25rem .4rem">';
        html += '<option value="">— Demandeur —</option>';
        DEMANDEURS.forEach(function(c) {
          if (usedIds.indexOf(c.id) === -1) {
            html += '<option value="' + c.id + '">' + c.label + '</option>';
          }
        });
        html += '</select></td>';
      }
      cols.forEach(function(f) {
        const onclick  = fnToggle + '(' + idx + ",'" + f + "')";
        const disabled = (f === 'semaine_ab' && !row.recurrent);
        html += '<td style="' + tdS + '">' + makeToggle(f + '_' + idx, suffix, !!row[f], onclick, disabled, true) + '</td>';
      });
      html += '<td style="' + tdDelS + '"><button onclick="' + fnRemove + '(' + idx + ')" title="Supprimer" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:.9rem;line-height:1;padding:.1rem .3rem">✕</button></td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
  }

  const availableLeft = DEMANDEURS.filter(function(c) { return usedIds.indexOf(c.id) === -1; });
  // Bouton "＋ Ajouter" : externe (panel-title) si addBtnId fourni, sinon inline.
  if (addBtnId) {
    const btn = document.getElementById(addBtnId);
    if (btn) btn.style.display = availableLeft.length > 0 ? '' : 'none';
  } else if (availableLeft.length > 0) {
    html += '<button type="button" onclick="' + fnAdd + '()" class="btn btn-ghost" style="font-size:.8rem;padding:.35rem .8rem">＋ Ajouter</button>';
  }

  container.innerHTML = html;
}

// ── Onglet Paramètres > Demandeurs ──
let _paramsCatSettings = [];
let _paramsCatSnapshot = ''; // JSON figé de _paramsCatSettings après load/save (référence de "non modifié")
// Sync inter-lignes lors d'un toggle (mêmes règles partagées entre modale & pane Paramètres).
function _catApplyToggle(state, idx, field) {
  if (!state[idx]) return;
  state[idx][field] = state[idx][field] ? 0 : 1;
  if (field === 'recurrent' && !state[idx].recurrent) {
    state[idx].semaine_ab = 0;
    const otherPonct = state.find(function(r, i) { return i !== idx && !r.recurrent; });
    if (otherPonct) state[idx].jauge = otherPonct.jauge;
  } else if (field === 'recurrent' && state[idx].recurrent) {
    const other = state.find(function(r, i) { return i !== idx && r.recurrent; });
    if (other) { state[idx].semaine_ab = other.semaine_ab; state[idx].jauge = other.jauge; }
  } else if (field === 'semaine_ab') {
    const val = state[idx].semaine_ab;
    state.forEach(function(r) { if (r.recurrent) r.semaine_ab = val; });
  } else if (field === 'jauge') {
    const val = state[idx].jauge;
    const isRec = state[idx].recurrent;
    state.forEach(function(r) { if (!!r.recurrent === !!isRec) r.jauge = val; });
  }
}
// Handlers branchés en onclick via noms dynamiques '_toggle' + suffix, etc. dans
// _renderCatSettingsTable — donc indispensables même s'ils paraissent peu référencés.
function _toggleParamsCat(idx, field)            { _catApplyToggle(_paramsCatSettings, idx, field); _renderParamsCatTable(); }
function _setParamsCatRowCategory(idx, catId) {
  if (!_paramsCatSettings[idx]) return;
  const id  = catId ? parseInt(catId) : null;
  const cat = DEMANDEURS.find(function(c) { return c.id == catId; });
  _paramsCatSettings[idx].demandeur_id = id;
  _paramsCatSettings[idx].label        = cat ? cat.label : '';
  _renderParamsCatTable();
}
function _removeParamsCatRow(idx) { _paramsCatSettings.splice(idx, 1); _renderParamsCatTable(); }
function _addParamsCatRow() {
  // Hériter la jauge d'une ligne existante du même mode (par défaut : non-récurrent)
  const sameModeRow = _paramsCatSettings.find(r => !r.recurrent);
  const defaultJauge = sameModeRow && sameModeRow.jauge ? 1 : 0;
  _paramsCatSettings.push({ demandeur_id: null, label: '', recurrent: 0, semaine_ab: 0, validation: 0, themes: 0, jauge: defaultJauge });
  _renderParamsCatTable();
}
function _renderParamsCatTable() {
  _renderCatSettingsTable(_paramsCatSettings, 'params-cat-table', 'ParamsCat', 'btn-add-demandeur-row');
  const cancelBtn = document.getElementById('btn-cancel-params-demandeurs');
  if (cancelBtn) cancelBtn.style.display = _isParamsCatDirty() ? '' : 'none';
}
function _isParamsCatDirty() {
  return JSON.stringify(_paramsCatSettings) !== _paramsCatSnapshot;
}
function _cancelParamsDemandeurs() {
  loadParamsDemandeurs();
}

function loadParamsDemandeurs() {
  if (!currentServiceId || currentServiceId === 'admin' || currentServiceId === 'compte') {
    _paramsCatSettings = [];
  } else {
    _paramsCatSettings = (_currentDemSettings || []).map(function(x) { return Object.assign({}, x); });
    // Cohérence : si une ligne d'un mode a jauge=1, toutes les lignes du même mode en héritent
    const recHasJauge   = _paramsCatSettings.some(function(r) { return  r.recurrent && r.jauge; });
    const ponctHasJauge = _paramsCatSettings.some(function(r) { return !r.recurrent && r.jauge; });
    _paramsCatSettings.forEach(function(r) {
      if ( r.recurrent && recHasJauge)   r.jauge = 1;
      if (!r.recurrent && ponctHasJauge) r.jauge = 1;
    });
    // Idem pour Semaine A/B parmi les récurrents
    const recHasAB = _paramsCatSettings.some(function(r) { return r.recurrent && r.semaine_ab; });
    if (recHasAB) _paramsCatSettings.forEach(function(r) { if (r.recurrent) r.semaine_ab = 1; });
  }
  _paramsCatSnapshot = JSON.stringify(_paramsCatSettings);
  _renderParamsCatTable();
}

async function saveParamsDemandeurs() {
  if (!isManagerUser()) return;
  if (!currentServiceId || currentServiceId === 'admin' || currentServiceId === 'compte') return;
  const rows = _paramsCatSettings.filter(function(r) { return r.demandeur_id; });
  const r = await apiPost('/service_demandeur_settings.php', { service_id: currentServiceId, rows: rows });
  if (r.ok) {
    _currentDemSettings = rows.map(function(x) { return Object.assign({}, x); });
    recurringMode  = _currentDemSettings.some(function(x) { return x.recurrent; });
    validationMode = _currentDemSettings.some(function(x) { return x.validation; });
    themeMode      = _currentDemSettings.some(function(x) { return x.themes; });
    _applyRecurringMode();
    if (_lastServiceTab === 'planning-rec' || _lastServiceTab === 'planning') _lastServiceTab = 'agenda';
    renderAdminDemInfo();
    _paramsCatSnapshot = JSON.stringify(_paramsCatSettings);
    _renderParamsCatTable();
    showToast('✅ Paramètres enregistrés');
  }
}

// ── Onglet Paramètres > Thèmes ──
// État UI : mode ('libre' | 'liste') + liste des thèmes du service (tableau de strings).
// Persistance back-end à câbler ultérieurement — pour l'instant, état en mémoire par service.
let _paramsThemesMode      = 'libre';
let _paramsThemesList      = [];
let _paramsThemesSnapshot  = '';
function _setParamsThemesMode(mode) {
  _paramsThemesMode = (mode === 'liste') ? 'liste' : 'libre';
  const wrap = document.getElementById('params-themes-list-wrap');
  if (wrap) wrap.style.display = _paramsThemesMode === 'liste' ? '' : 'none';
  _renderParamsThemesDirty();
}
function _addParamsThemeRow() {
  _paramsThemesList.push('');
  _renderParamsThemesTable();
  // Focus immédiat sur le nouvel input pour saisie rapide
  setTimeout(function() {
    const inputs = document.querySelectorAll('#params-themes-table input[type="text"]');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }, 0);
}
function _removeParamsThemeRow(idx) {
  _paramsThemesList.splice(idx, 1);
  _renderParamsThemesTable();
}
function _setParamsThemeValue(idx, val) {
  if (_paramsThemesList[idx] === undefined) return;
  _paramsThemesList[idx] = val;
  _renderParamsThemesDirty();
}
function _renderParamsThemesTable() {
  const container = document.getElementById('params-themes-table');
  if (!container) return;
  const headStyle = 'font-size:.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);padding:.35rem .5rem';
  const rowStyle  = 'display:flex;align-items:center;gap:.4rem;padding:0 .2rem';
  const inputStyle = 'flex:1;font-size:.85rem;padding:.25rem .35rem;border:none;background:transparent;color:var(--text);outline:none';
  const delBtnStyle = 'background:none;border:none;cursor:pointer;color:var(--muted);font-size:.9rem;line-height:1;padding:.1rem .3rem';
  const addBtnStyle = 'font-size:.68rem;padding:.25rem .65rem;white-space:nowrap';

  let html = '<div style="display:flex;align-items:center;justify-content:space-between;gap:.5rem">';
  html += '<span style="' + headStyle + '">Thème</span>';
  html += '<button type="button" id="btn-add-theme-row" onclick="_addParamsThemeRow()" class="btn btn-ghost" style="' + addBtnStyle + '">＋ Ajouter</button>';
  html += '</div>';

  if (_paramsThemesList.length > 0) {
    _paramsThemesList.forEach(function(label, idx) {
      const safe = String(label).replace(/"/g, '&quot;');
      html += '<div style="' + rowStyle + '">';
      html += '<input type="text" value="' + safe + '" oninput="_setParamsThemeValue(' + idx + ',this.value)" placeholder="Nom du thème" style="' + inputStyle + '">';
      html += '<button type="button" onclick="_removeParamsThemeRow(' + idx + ')" title="Supprimer" style="' + delBtnStyle + '">✕</button>';
      html += '</div>';
    });
  } else {
    html += '<div style="padding:.4rem .5rem;font-size:.8rem;color:var(--muted)">Aucun thème — cliquez sur « ＋ Ajouter » pour en créer un.</div>';
  }
  container.innerHTML = html;
  _renderParamsThemesDirty();
}
function _paramsThemesState() {
  return JSON.stringify({ mode: _paramsThemesMode, list: _paramsThemesList });
}
function _isParamsThemesDirty() {
  return _paramsThemesState() !== _paramsThemesSnapshot;
}
function _renderParamsThemesDirty() {
  const cancelBtn = document.getElementById('btn-cancel-params-themes');
  if (cancelBtn) cancelBtn.style.display = _isParamsThemesDirty() ? '' : 'none';
}
function _cancelParamsThemes() { loadParamsThemes(); }
async function loadParamsThemes() {
  _paramsThemesMode = 'libre';
  _paramsThemesList = [];
  if (currentServiceId && currentServiceId !== 'admin' && currentServiceId !== 'compte') {
    try {
      const r = await apiGet('/service_themes.php?service_id=' + encodeURIComponent(currentServiceId));
      if (r && r.ok) {
        _paramsThemesMode = r.mode === 'liste' ? 'liste' : 'libre';
        _paramsThemesList = Array.isArray(r.themes) ? r.themes.map(function(t) { return String(t.label || ''); }) : [];
      }
    } catch (e) { /* silencieux : on retombe sur l'état par défaut */ }
  }
  // Synchroniser les contrôles UI
  document.querySelectorAll('input[name="themes-mode"]').forEach(function(r) {
    r.checked = (r.value === _paramsThemesMode);
  });
  const wrap = document.getElementById('params-themes-list-wrap');
  if (wrap) wrap.style.display = _paramsThemesMode === 'liste' ? '' : 'none';
  _paramsThemesSnapshot = _paramsThemesState();
  _renderParamsThemesTable();
}
async function saveParamsThemes() {
  if (!isManagerUser()) return;
  if (!currentServiceId || currentServiceId === 'admin' || currentServiceId === 'compte') return;
  // Nettoyage côté client : trim + suppression des vides + dédoublonnage (insensible à la casse).
  // Le back-end refait le même nettoyage côté serveur (défense en profondeur).
  const seen = {};
  _paramsThemesList = _paramsThemesList.map(function(s) { return String(s).trim(); }).filter(function(s) {
    if (!s) return false;
    const k = s.toLowerCase();
    if (seen[k]) return false;
    seen[k] = 1;
    return true;
  });
  const r = await apiPost('/service_themes.php', {
    service_id: currentServiceId,
    mode:       _paramsThemesMode,
    themes:     _paramsThemesList.map(function(label) { return { label: label }; }),
  });
  if (!r || !r.ok) {
    showToast('⚠️ ' + ((r && r.error) || 'Erreur lors de l\'enregistrement'));
    return;
  }
  _paramsThemesSnapshot = _paramsThemesState();
  // Met aussi à jour l'état utilisé côté écran de réservation (helper _createUserThemeInput).
  _currentServiceThemesMode = _paramsThemesMode;
  _currentServiceThemesList = _paramsThemesList.slice();
  _renderParamsThemesTable();
  showToast('✅ Thèmes enregistrés');
}

// ════════════════════════════════════════════════════════════
//  Sous-onglet Paramètres → RGPD
//  Partie 1 : effacer les infos nominatives d'un utilisateur
//             dont la catégorie est configurée pour ce service.
//  Partie 2 (admin) : scan global trié par inactivité, propose
//             l'effacement au-delà du seuil rgpd_retention_years.
// ════════════════════════════════════════════════════════════
let _rgpdUsersCache = [];      // dernier résultat /users.php?action=list
let _rgpdRetentionYears = 2;   // seuil chargé depuis app_config
let _rgpdP1Page = 0;           // pagination du tableau "Effacer un utilisateur"
let _rgpdP2Page = 0;           // pagination du scan d'inactivité (0-indexé)
const _RGPD_PAGE_SIZE = 10;    // commun aux 2 tableaux

// Libellé harmonisé pour les compteurs des 2 tableaux RGPD : "compte utilisateur" / "comptes utilisateurs"
function _rgpdCountWord(n) {
  return n > 1 ? 'comptes utilisateurs' : 'compte utilisateur';
}

// "il y a 2 ans 3 mois" / "il y a 4 jours" / "jamais"
function _rgpdFmtDuration(fromYmdHis) {
  if (!fromYmdHis) return 'jamais';
  const t0 = new Date(String(fromYmdHis).replace(' ', 'T'));
  if (isNaN(t0.getTime())) return '—';
  const days = Math.floor((Date.now() - t0.getTime()) / 86400000);
  if (days < 1)  return 'aujourd\'hui';
  if (days < 30) return `il y a ${days} jour${days > 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `il y a ${months} mois`;
  const years = Math.floor(days / 365);
  const remMonths = Math.floor((days - years * 365) / 30);
  return remMonths
    ? `il y a ${years} an${years > 1 ? 's' : ''} ${remMonths} mois`
    : `il y a ${years} an${years > 1 ? 's' : ''}`;
}

// Référence d'activité = MAX(last_login_at, last_booking_at, created_at).
// On prend le plus récent des trois pour ne pas pénaliser un compte sans
// reconnexion mais utilisé indirectement (ex: enfant dont le parent admin
// réserve à sa place). Fallback created_at pour les comptes jamais utilisés.
function _rgpdLastSeen(u) {
  const candidates = [u.last_login_at, u.last_booking_at, u.created_at]
    .filter(Boolean)
    .map(d => {
      const t = new Date(String(d).replace(' ', 'T')).getTime();
      return isNaN(t) ? null : t;
    })
    .filter(t => t !== null);
  if (!candidates.length) return null;
  const maxTs = Math.max.apply(null, candidates);
  // Retourne au format "YYYY-MM-DD HH:MM:SS" (compatible avec les autres usages).
  const d = new Date(maxTs);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function _rgpdDaysInactive(u) {
  const ref = _rgpdLastSeen(u);
  if (!ref) return Infinity;
  const t = new Date(String(ref).replace(' ', 'T'));
  if (isNaN(t.getTime())) return Infinity;
  return Math.floor((Date.now() - t.getTime()) / 86400000);
}

// Charge les données du sous-onglet RGPD :
//   - liste des utilisateurs (via API users.list, accessible aux gestionnaires)
//   - seuil rgpd_retention_years (admin only)
// Puis rend les deux parties.
// Paramètres > RGPD : effacement par utilisateur (scope service).
// Accessible aux gestionnaires.
async function loadParamsRgpd() {
  if (!isManagerUser()) return;
  const r = await apiGet('/users.php?action=list');
  _rgpdUsersCache = (r && r.ok && Array.isArray(r.users)) ? r.users : [];
  _renderRgpdPart1();
}

// Administration > RGPD : scan d'inactivité + journal d'audit (admin only).
async function loadAdminRgpd() {
  if (!isAdminUser()) return;
  const [usersRes, cfgRes] = await Promise.all([
    apiGet('/users.php?action=list'),
    apiGet('/settings.php?action=get'),
  ]);
  _rgpdUsersCache = (usersRes && usersRes.ok && Array.isArray(usersRes.users)) ? usersRes.users : [];
  const v = parseInt(cfgRes?.config?.rgpd_retention_years, 10);
  _rgpdRetentionYears = (Number.isFinite(v) && v >= 0) ? v : 2;
  const thrInp = document.getElementById('cfg-rgpd-retention-years');
  if (thrInp) thrInp.value = String(_rgpdRetentionYears);
  _renderRgpdPart2();
  loadRgpdAuditLog();
}

// ── Journal d'audit RGPD ─────────────────────────────────
let _rgpdLogRows  = [];
let _rgpdLogPage  = 0;
const _RGPD_LOG_PAGE_SIZE = 10;

async function loadRgpdAuditLog() {
  if (!isAdminUser()) return;
  const r = await apiGet('/rgpd_log.php?action=list');
  _rgpdLogRows = (r && r.ok && Array.isArray(r.rows)) ? r.rows : [];
  _rgpdLogPage = 0;
  _renderRgpdAuditLog();
}

// Étiquette lisible pour les actions journalisées.
function _rgpdActionLabel(a) {
  if (a === 'anonymize')                   return '🗑️ Anonymisation';
  if (a === 'export_json')                 return '📥 Export JSON';
  if (a === 'export_pdf')                  return '🖨️ Export imprimable';
  if (a === 'self_delete_requested')       return '✉️ Demande de suppression';
  if (a === 'self_delete')                 return '🗑️ Suppression self-service';
  if (a === 'notice_sent')                 return '📧 Préavis d\'inactivité';
  if (a === 'password_reset')              return '🔑 Mot de passe réinitialisé';
  if (a === 'password_reset_admin_trigger')return '🔑 Lien reset envoyé par admin';
  if (a === 'hard_delete')                 return '🗑️ Suppression dure (compte vide)';
  return a;
}

// Compose un libellé "Nom Prénom — email" pour target/actor à partir d'une ligne.
// Si la valeur est vide (target_user_id == NULL), retourne "—".
// Si le compte est anonymisé, on ajoute un marqueur visuel.
function _rgpdLogUserLabel(row, prefix) {
  const id = row[`${prefix}_user_id`];
  if (id == null) return '<span style="color:var(--muted)">—</span>';
  const nom    = row[`${prefix}_nom`]    || '';
  const prenom = row[`${prefix}_prenom`] || '';
  const email  = row[`${prefix}_email`]  || '';
  const name   = (nom + ' ' + prenom).trim();
  const isAnon = prefix === 'target' && row.target_anonymized_at;
  const label  = name || email || `#${id}`;
  return `<span title="user #${id}">${label}${isAnon ? ' <span style="font-size:.62rem;color:var(--muted)">(anonymisé)</span>' : ''}</span>`
       + (name && email ? `<br><span style="font-size:.65rem;color:var(--muted)">${email}</span>` : '');
}

function _renderRgpdAuditLog() {
  const listEl = document.getElementById('rgpd-log-list');
  const cntEl  = document.getElementById('rgpd-log-count');
  if (!listEl) return;
  const total = _rgpdLogRows.length;
  if (cntEl) cntEl.textContent = `${total} entrée${total > 1 ? 's' : ''}`;
  if (!total) {
    listEl.innerHTML = '<div style="font-size:.78rem;color:var(--muted);font-style:italic;padding:.5rem">Aucune action RGPD journalisée pour le moment.</div>';
    return;
  }
  const totalPages = Math.max(1, Math.ceil(total / _RGPD_LOG_PAGE_SIZE));
  if (_rgpdLogPage >= totalPages) _rgpdLogPage = totalPages - 1;
  if (_rgpdLogPage < 0) _rgpdLogPage = 0;
  const from     = _rgpdLogPage * _RGPD_LOG_PAGE_SIZE;
  const pageRows = _rgpdLogRows.slice(from, from + _RGPD_LOG_PAGE_SIZE);

  listEl.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:.78rem">'
    + '<thead><tr style="text-align:left">'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">Date</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">Action</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">Cible</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">Acteur</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">IP</th>'
    + '</tr></thead><tbody>'
    + pageRows.map(r => {
        const d = new Date(String(r.created_at).replace(' ', 'T'));
        const dateLbl = d.toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
        return `<tr>
          <td style="padding:.2rem .5rem;color:var(--muted);white-space:nowrap">${dateLbl}</td>
          <td style="padding:.2rem .5rem">${_rgpdActionLabel(r.action)}</td>
          <td style="padding:.2rem .5rem">${_rgpdLogUserLabel(r, 'target')}</td>
          <td style="padding:.2rem .5rem">${_rgpdLogUserLabel(r, 'actor')}</td>
          <td style="padding:.2rem .5rem;color:var(--muted);font-family:monospace;font-size:.7rem">${r.ip || '—'}</td>
        </tr>`;
      }).join('')
    + '</tbody></table>'
    + `<div style="display:flex;align-items:center;justify-content:center;gap:.5rem;margin-top:.6rem">
        <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem" onclick="_rgpdLogGotoPage(${_rgpdLogPage - 1})" ${_rgpdLogPage === 0 ? 'disabled' : ''}>‹</button>
        <span style="font-size:.7rem;color:var(--muted)">${_rgpdLogPage + 1} / ${totalPages}</span>
        <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem" onclick="_rgpdLogGotoPage(${_rgpdLogPage + 1})" ${_rgpdLogPage >= totalPages - 1 ? 'disabled' : ''}>›</button>
      </div>`;
}
function _rgpdLogGotoPage(p) {
  _rgpdLogPage = Math.max(0, p);
  _renderRgpdAuditLog();
}

// ── Partie 1 : utilisateurs du service ──
// Critère : role='utilisateur' + non anonymisé + effective_demandeur_id ∈
// demandeurs configurés pour le service courant (_currentDemSettings).
function _rgpdServiceUsers() {
  const demIds = new Set(
    (_currentDemSettings || [])
      .map(r => parseInt(r.demandeur_id, 10))
      .filter(Boolean)
  );
  return _rgpdUsersCache.filter(u =>
    u.role === 'utilisateur'
    && !u.anonymized_at
    && demIds.has(parseInt(u.effective_demandeur_id, 10))
  );
}
function _renderRgpdPart1() {
  const listEl  = document.getElementById('rgpd-p1-list');
  const emptyEl = document.getElementById('rgpd-p1-empty');
  if (!listEl) return;
  const all = _rgpdServiceUsers();
  // Filtre via la zone de recherche (insensible aux accents et à la casse, sur nom/prenom/email)
  const q = _normSearch((document.getElementById('rgpd-p1-search')?.value || '').trim());
  const list = q
    ? all.filter(u => (
        _normSearch(u.nom).includes(q)    ||
        _normSearch(u.prenom).includes(q) ||
        _normSearch(u.email).includes(q)
      ))
    : all;
  const cntLbl = q
    ? `${list.length} / ${all.length} ${_rgpdCountWord(all.length)}`
    : `${all.length} ${_rgpdCountWord(all.length)}`;
  if (emptyEl) emptyEl.style.display = all.length ? 'none' : '';
  if (!list.length) {
    listEl.innerHTML = all.length
      ? '<div style="font-size:.78rem;color:var(--muted);font-style:italic;padding:.5rem">Aucun résultat pour cette recherche.</div>'
      : '';
    return;
  }
  // Pagination 10 lignes par page (recadre si la liste rétrécit, ex. après recherche)
  const totalPages = Math.max(1, Math.ceil(list.length / _RGPD_PAGE_SIZE));
  if (_rgpdP1Page >= totalPages) _rgpdP1Page = totalPages - 1;
  if (_rgpdP1Page < 0) _rgpdP1Page = 0;
  const from     = _rgpdP1Page * _RGPD_PAGE_SIZE;
  const pageRows = list.slice(from, from + _RGPD_PAGE_SIZE);

  listEl.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:.78rem">'
    + '<thead><tr style="text-align:left">'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">Nom</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">Prénom</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">E-mail</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)"></th>'
    + '</tr></thead><tbody>'
    + pageRows.map(u => `<tr>
        <td style="padding:.15rem .5rem">${u.nom    || ''}</td>
        <td style="padding:.15rem .5rem">${u.prenom || ''}</td>
        <td style="padding:.15rem .5rem;color:var(--muted)">${u.email}</td>
        <td style="padding:.15rem .5rem;text-align:right;white-space:nowrap">
          <a class="btn btn-ghost" href="rgpd_export.php?id=${u.id}" target="_blank"
            style="padding:.05rem .5rem;font-size:.72rem;text-decoration:none;margin-right:.3rem" title="Exporter les données">📥 Exporter</a>
          <button class="btn btn-ghost" onclick="_rgpdAnonymizeFromTable(${u.id})"
            style="padding:.05rem .5rem;font-size:.72rem;border-color:rgba(224,107,107,.4);color:var(--danger)">🗑️ Effacer</button>
        </td>
      </tr>`).join('')
    + '</tbody></table>'
    // Ligne sous le tableau : compteur à gauche, pagination centrée (spacer à droite pour symétrie)
    + `<div style="display:flex;align-items:center;margin-top:.6rem">
        <span style="flex:1;font-size:.7rem;color:var(--muted)">${cntLbl}</span>
        <div style="display:flex;align-items:center;gap:.5rem">
          <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem" onclick="_rgpdP1GotoPage(${_rgpdP1Page - 1})" ${_rgpdP1Page === 0 ? 'disabled' : ''}>‹</button>
          <span style="font-size:.7rem;color:var(--muted)">${_rgpdP1Page + 1} / ${totalPages}</span>
          <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem" onclick="_rgpdP1GotoPage(${_rgpdP1Page + 1})" ${_rgpdP1Page >= totalPages - 1 ? 'disabled' : ''}>›</button>
        </div>
        <span style="flex:1"></span>
      </div>`;
}
function _rgpdP1GotoPage(p) {
  _rgpdP1Page = Math.max(0, p);
  _renderRgpdPart1();
}
// Appelé par l'input de recherche : reset à la 1ʳᵉ page avant de filtrer.
function _rgpdP1OnSearch() {
  _rgpdP1Page = 0;
  _renderRgpdPart1();
}
// Modale de confirmation polymorphe : utilisée pour les 2 actions RGPD
// (anonymize + notify), avec libellés / couleur / warning configurables.
// Les ids en attente sont stockés dans _rgpdPendingAnonymizeIds.
let _rgpdPendingAnonymizeIds = [];
let _rgpdModalPage = 0; // pagination de la liste de cibles dans la modale
let _rgpdModalOnConfirm = null; // callback exécutée au clic Confirmer

// Ouverture générique : voir signature opts plus bas.
function _rgpdOpenConfirmModal(ids, opts) {
  opts = opts || {};
  const list = ids.map(id => _rgpdUsersCache.find(x => x.id == id)).filter(Boolean);
  if (!list.length) return;
  _rgpdPendingAnonymizeIds = list.map(u => u.id);
  _rgpdModalPage = 0;
  document.getElementById('rgpd-confirm-title').textContent = opts.title || 'Confirmer';
  document.getElementById('rgpd-confirm-intro').textContent = opts.intro || '';
  // Encadré d'avertissement : tonalité danger (rouge), warn (orange) ou info (vert/accent).
  const warnTonePalette = {
    'danger': { border: 'var(--danger)', bg: 'rgba(224,107,107,.08)' },
    'warn':   { border: 'var(--warn)',   bg: 'rgba(232,164,90,.08)' },
    'info':   { border: 'var(--accent)', bg: 'rgba(109,206,170,.08)' },
  };
  const warnColors = warnTonePalette[opts.warnTone] || warnTonePalette.danger;
  const warnEl = document.getElementById('rgpd-confirm-warning');
  warnEl.style.borderLeft = '3px solid ' + warnColors.border;
  warnEl.style.background = warnColors.bg;
  warnEl.innerHTML        = opts.warningHtml || '';
  // Bouton Confirmer : libellé + couleur + handler (remplacé à chaque ouverture).
  const btnTonePalette = {
    'danger': 'var(--danger)',
    'warn':   'var(--warn)',
    'info':   'var(--accent)',
  };
  const btnBg = btnTonePalette[opts.buttonTone] || btnTonePalette.danger;
  const btn = document.getElementById('rgpd-confirm-btn');
  btn.disabled       = false;
  btn.textContent    = opts.buttonLabel || `Confirmer (${list.length})`;
  btn.style.background  = btnBg;
  btn.style.borderColor = btnBg;
  _rgpdModalOnConfirm = opts.onConfirm || null;
  btn.onclick = () => { if (_rgpdModalOnConfirm) _rgpdModalOnConfirm(); };
  _renderRgpdModalTargets();
  document.getElementById('rgpd-anonymize-modal').classList.add('open');
}

// Wrapper rétrocompatible pour l'anonymisation (1 ou N comptes).
function _rgpdOpenAnonymizeModal(ids, opts) {
  opts = opts || {};
  const n = ids.length;
  _rgpdOpenConfirmModal(ids, {
    title: n === 1
      ? '🛡️ Effacer les données nominatives'
      : `🛡️ Effacer les données nominatives de ${n} comptes`,
    intro: opts.intro || (n === 1
      ? "Vous êtes sur le point d'effacer définitivement les données nominatives de :"
      : `Vous êtes sur le point d'effacer définitivement les données nominatives des ${n} comptes suivants :`),
    warningHtml: '<strong style="color:var(--danger)">Action irréversible.</strong> Les champs nom, prénom, e-mail et téléphone seront vidés, le compte sera verrouillé. L\'enregistrement et l\'historique des réservations sont conservés à des fins statistiques.',
    warnTone:    'danger',
    buttonLabel: n === 1 ? '🗑️ Confirmer l\'effacement' : `🗑️ Confirmer (${n})`,
    buttonTone:  'danger',
    onConfirm:   _rgpdConfirmAnonymize,
  });
}

// Wrapper pour l'envoi de préavis (orange, non destructif).
function _rgpdOpenNotifyModal(ids) {
  const n = ids.length;
  _rgpdOpenConfirmModal(ids, {
    title: n === 1 ? '📧 Envoyer le préavis d\'inactivité' : `📧 Envoyer le préavis à ${n} comptes`,
    intro: n === 1
      ? "Vous êtes sur le point d'envoyer un préavis d'anonymisation au compte suivant :"
      : `Vous êtes sur le point d'envoyer un préavis d'anonymisation aux ${n} comptes suivants :`,
    warningHtml: '<strong style="color:var(--warn)">Préavis non destructif.</strong> Un e-mail leur sera envoyé. La suppression effective n\'aura lieu qu\'au bout de 30 jours sauf reconnexion de leur part — ce qui annule automatiquement le préavis.',
    warnTone:    'warn',
    buttonLabel: n === 1 ? '📧 Envoyer le préavis' : `📧 Envoyer (${n})`,
    buttonTone:  'warn',
    onConfirm:   _rgpdConfirmNotify,
  });
}
// Rendu paginé de la liste des cibles dans la modale (10 par page, comme les
// tableaux principaux — la barre est toujours affichée, même avec 1 page).
function _renderRgpdModalTargets() {
  const list = _rgpdPendingAnonymizeIds
    .map(id => _rgpdUsersCache.find(x => x.id == id))
    .filter(Boolean);
  const totalPages = Math.max(1, Math.ceil(list.length / _RGPD_PAGE_SIZE));
  if (_rgpdModalPage >= totalPages) _rgpdModalPage = totalPages - 1;
  if (_rgpdModalPage < 0) _rgpdModalPage = 0;
  const from     = _rgpdModalPage * _RGPD_PAGE_SIZE;
  const pageRows = list.slice(from, from + _RGPD_PAGE_SIZE);
  const targetsEl = document.getElementById('rgpd-confirm-targets');
  if (!targetsEl) return;
  const rowsHtml = pageRows.map(u => `
    <div style="padding:.1rem 0;font-size:.82rem">
      <span style="font-weight:600;color:var(--text)">${(u.nom || '') + ' ' + (u.prenom || '')}</span>
      <span style="color:var(--muted);margin-left:.4rem;font-size:.75rem">${u.email || ''}</span>
    </div>`).join('') || '<div style="font-style:italic;color:var(--muted)">—</div>';
  // Pagination affichée seulement si > 1 page (gain de place dans la modale).
  const pagHtml = totalPages > 1
    ? `<div style="display:flex;align-items:center;justify-content:center;gap:.5rem;margin-top:.5rem;padding-top:.4rem;border-top:1px solid var(--border)">
        <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem" onclick="_rgpdModalGotoPage(${_rgpdModalPage - 1})" ${_rgpdModalPage === 0 ? 'disabled' : ''}>‹</button>
        <span style="font-size:.7rem;color:var(--muted)">${_rgpdModalPage + 1} / ${totalPages}</span>
        <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem" onclick="_rgpdModalGotoPage(${_rgpdModalPage + 1})" ${_rgpdModalPage >= totalPages - 1 ? 'disabled' : ''}>›</button>
      </div>`
    : '';
  targetsEl.innerHTML = rowsHtml + pagHtml;
}
function _rgpdModalGotoPage(p) {
  _rgpdModalPage = Math.max(0, p);
  _renderRgpdModalTargets();
}
function closeRgpdAnonymizeModal() {
  document.getElementById('rgpd-anonymize-modal').classList.remove('open');
  _rgpdPendingAnonymizeIds = [];
}
async function _rgpdConfirmAnonymize() {
  const ids = _rgpdPendingAnonymizeIds.slice();
  if (!ids.length) return;
  const btn = document.getElementById('rgpd-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  // Un seul appel batch côté serveur (transaction) plutôt que N appels HTTP.
  const r = await apiPost('/users.php?action=anonymize_bulk', { action: 'anonymize_bulk', ids });
  closeRgpdAnonymizeModal();
  if (!r || !r.ok) {
    showToast('⚠️ ' + ((r && r.error) || 'Erreur'));
  } else {
    const n = r.anonymized || 0;
    const skipped = r.skipped || 0;
    showToast(skipped
      ? `⚠️ ${n} compte(s) effacé(s), ${skipped} ignoré(s)`
      : n === 1
        ? '✅ Données nominatives effacées'
        : `✅ ${n} comptes effacés`);
  }
  await _rgpdReload();
}
// Recharge l'écran RGPD pertinent selon l'onglet visible.
//   - Administration > RGPD     → loadAdminRgpd
//   - Administration > Comptes  → vide _allUsersAdmin et re-rend
//   - Paramètres > RGPD          → loadParamsRgpd (par défaut)
async function _rgpdReload() {
  const adminRgpdTab    = document.getElementById('tab-content-admin-rgpd');
  const adminComptesTab = document.getElementById('tab-content-admin-comptes');
  if (adminRgpdTab && !adminRgpdTab.classList.contains('hidden')) {
    await loadAdminRgpd();
  } else if (adminComptesTab && !adminComptesTab.classList.contains('hidden')) {
    _allUsersAdmin = []; // invalide le cache local pour forcer un re-fetch
    await renderUserAccountsAdmin();
  } else {
    await loadParamsRgpd();
  }
}
// Wrappers : appellent la modale unifiée avec un seul id.
function _rgpdAnonymizeFromTable(id) { _rgpdOpenAnonymizeModal([id]); }
function _rgpdAnonymizeFromScan(id)  { _rgpdOpenAnonymizeModal([id]); }
// Variante pour la table Administration > Comptes utilisateurs : le cache
// principal de la modale est _rgpdUsersCache, alors que cette table utilise
// _allUsersAdmin. On synchronise les deux le temps de l'opération.
function _rgpdAnonymizeFromAdminTable(id) {
  const u = _allUsersAdmin.find(x => x.id == id);
  if (!u) return;
  // Preflight client-side : refuse l'anonymisation du dernier admin actif
  // sans ouvrir la modale (le serveur fait la même garde, c'est pour l'UX).
  const check = _rgpdCheckAnonymizeOne(u, _allUsersAdmin);
  if (!check.allowed) {
    showToast('⚠️ ' + check.reason, 5000, { warn: true });
    return;
  }
  if (!_rgpdUsersCache.find(x => x.id == id)) {
    _rgpdUsersCache = _rgpdUsersCache.concat([u]);
  }
  _rgpdOpenAnonymizeModal([id]);
}

// Vérification côté client : un compte cible peut-il être anonymisé ?
// Retourne { allowed: bool, reason?: string }.
// La règle "dernier admin actif" est dupliquée ici (déjà appliquée côté serveur)
// pour éviter d'ouvrir une modale qui de toute façon se solderait par une erreur.
function _rgpdCheckAnonymizeOne(target, allUsers) {
  if (target.anonymized_at) {
    return { allowed: false, reason: 'Ce compte est déjà anonymisé.' };
  }
  if (target.role === 'administrateur') {
    const otherActiveAdmins = allUsers.filter(u =>
      u.role === 'administrateur' && !u.anonymized_at && u.id != target.id
    );
    if (otherActiveAdmins.length === 0) {
      return { allowed: false, reason: 'Impossible d\'anonymiser le dernier administrateur actif.' };
    }
  }
  return { allowed: true };
}

// ── Partie 2 : scan global ──
// Rendu du tableau du scan d'inactivité (onglet Administration > RGPD).
// Sécurité : la visibilité de l'onglet est déjà gérée par switchAdminTab
// (les onglets admin ne sont accessibles qu'aux admins).
function _renderRgpdPart2() {
  const list = _rgpdUsersCache
    .filter(u => u.role === 'utilisateur' && !u.anonymized_at)
    .map(u => Object.assign({}, u, { _days: _rgpdDaysInactive(u) }))
    .sort((a, b) => b._days - a._days);
  const cntLbl = `${list.length} ${_rgpdCountWord(list.length)}`;
  const thresholdDays = _rgpdRetentionYears * 365;
  const GRACE_DAYS = 30; // délai après envoi du préavis avant suppression effective
  // Helper : nombre de jours depuis l'envoi du préavis.
  // Retourne -1 si jamais envoyé (pour que `>= GRACE_DAYS` retourne false).
  const noticeAge = (u) => {
    if (!u.deletion_notice_sent_at) return -1;
    const t = new Date(String(u.deletion_notice_sent_at).replace(' ', 'T'));
    if (isNaN(t.getTime())) return -1;
    return Math.floor((Date.now() - t.getTime()) / 86400000);
  };
  // Compteurs :
  //  - eligible        = inactif au-delà du seuil
  //  - needNotice      = éligible MAIS sans préavis encore envoyé
  //  - canAnonymize    = éligible ET préavis envoyé il y a >= GRACE_DAYS
  const eligible     = list.filter(u => u._days >= thresholdDays);
  const needNotice   = eligible.filter(u => !u.deletion_notice_sent_at);
  const canAnonymize = eligible.filter(u => noticeAge(u) >= GRACE_DAYS);
  const bulkBtn = document.getElementById('rgpd-p2-bulk-btn');
  const bulkCnt = document.getElementById('rgpd-p2-bulk-count');
  if (bulkCnt) bulkCnt.textContent = String(canAnonymize.length);
  if (bulkBtn) {
    bulkBtn.disabled = canAnonymize.length === 0;
    bulkBtn.style.opacity = canAnonymize.length === 0 ? '.4' : '';
    bulkBtn.title = canAnonymize.length === 0
      ? 'Aucun compte éligible n\'a de préavis ≥ 30 jours envoyé'
      : '';
  }
  const notifyBtn = document.getElementById('rgpd-p2-notify-btn');
  const notifyCnt = document.getElementById('rgpd-p2-notify-count');
  if (notifyCnt) notifyCnt.textContent = String(needNotice.length);
  if (notifyBtn) {
    notifyBtn.disabled = needNotice.length === 0;
    notifyBtn.style.opacity = needNotice.length === 0 ? '.4' : '';
  }
  const listEl = document.getElementById('rgpd-p2-list');
  if (!listEl) return;
  if (!list.length) {
    listEl.innerHTML = '<div style="font-size:.78rem;color:var(--muted);font-style:italic;padding:.5rem">Aucun compte utilisateur à traiter.</div>';
    return;
  }
  // Pagination : 10 par page, recadre l'index si la liste a rétréci
  const totalPages = Math.max(1, Math.ceil(list.length / _RGPD_PAGE_SIZE));
  if (_rgpdP2Page >= totalPages) _rgpdP2Page = totalPages - 1;
  if (_rgpdP2Page < 0) _rgpdP2Page = 0;
  const from     = _rgpdP2Page * _RGPD_PAGE_SIZE;
  const pageRows = list.slice(from, from + _RGPD_PAGE_SIZE);

  listEl.innerHTML = '<table style="width:100%;border-collapse:collapse;font-size:.78rem">'
    + '<thead><tr style="text-align:left">'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">Nom</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">E-mail</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)" title="Plus récent entre dernière connexion et dernière réservation">Dernière activité</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">Inactivité</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)">Préavis</th>'
    + '<th style="padding:.4rem .5rem;border-bottom:1px solid var(--border)"></th>'
    + '</tr></thead><tbody>'
    + pageRows.map(u => {
        const eligible = u._days >= thresholdDays;
        const ref      = _rgpdLastSeen(u);
        // Source de la date la plus récente (pour le tooltip discret).
        const refSource = u.last_login_at && u.last_booking_at
          ? (new Date(String(u.last_login_at).replace(' ','T')) >= new Date(String(u.last_booking_at).replace(' ','T')) ? 'connexion' : 'réservation')
          : (u.last_login_at ? 'connexion' : (u.last_booking_at ? 'réservation' : 'création'));
        const refLbl = ref
          ? `<span title="via ${refSource}">${new Date(String(ref).replace(' ', 'T')).toLocaleDateString('fr-FR')}</span>`
          : '—';
        // Statut du préavis :
        //  - non éligible → "—"
        //  - éligible sans préavis → "à envoyer" (orange)
        //  - préavis < 30j → "envoyé le X — J jours restants"
        //  - préavis ≥ 30j → "délai écoulé"
        let noticeCell;
        if (!eligible) {
          noticeCell = '<span style="font-size:.7rem;color:var(--muted)">—</span>';
        } else if (!u.deletion_notice_sent_at) {
          noticeCell = '<span style="font-size:.7rem;color:#e8a45a;font-weight:600">à envoyer</span>';
        } else {
          const sentAt = new Date(String(u.deletion_notice_sent_at).replace(' ', 'T'));
          const daysSince = Math.floor((Date.now() - sentAt.getTime()) / 86400000);
          const remain = GRACE_DAYS - daysSince;
          const sentLbl = sentAt.toLocaleDateString('fr-FR');
          noticeCell = remain > 0
            ? `<span style="font-size:.7rem;color:var(--muted);white-space:nowrap">envoyé le ${sentLbl} · <span style="color:#e8a45a">J−${remain}</span></span>`
            : `<span style="font-size:.7rem;color:var(--muted);white-space:nowrap">envoyé le ${sentLbl} · <span style="color:var(--danger);font-weight:600">délai écoulé</span></span>`;
        }
        // Bouton Effacer : actif seulement si éligible ET préavis envoyé il y a >= GRACE_DAYS.
        // Sinon on affiche un placeholder explicite (l'admin doit envoyer un préavis et attendre).
        const ageDays = noticeAge(u);
        const canDelete = eligible && ageDays >= GRACE_DAYS;
        let actionCell;
        if (canDelete) {
          actionCell = `<button class="btn btn-ghost" onclick="_rgpdAnonymizeFromScan(${u.id})" style="padding:.05rem .5rem;font-size:.72rem;border-color:rgba(224,107,107,.4);color:var(--danger)">🗑️ Effacer</button>`;
        } else if (eligible) {
          actionCell = '<span style="font-size:.7rem;color:var(--muted)" title="Le préavis doit avoir été envoyé il y a au moins 30 jours">⏳ préavis requis</span>';
        } else {
          actionCell = '<span style="font-size:.7rem;color:var(--muted)">—</span>';
        }
        return `<tr>
          <td style="padding:.15rem .5rem">${(u.nom || '')} ${(u.prenom || '')}</td>
          <td style="padding:.15rem .5rem;color:var(--muted)">${u.email}</td>
          <td style="padding:.15rem .5rem;color:var(--muted)">${refLbl}</td>
          <td style="padding:.15rem .5rem;${eligible ? 'color:var(--danger);font-weight:600' : 'color:var(--muted)'}">${_rgpdFmtDuration(ref)}</td>
          <td style="padding:.15rem .5rem">${noticeCell}</td>
          <td style="padding:.15rem .5rem;text-align:right">${actionCell}</td>
        </tr>`;
      }).join('')
    + '</tbody></table>'
    // Ligne sous le tableau : compteur à gauche, pagination centrée (spacer à droite pour symétrie)
    + `<div style="display:flex;align-items:center;margin-top:.6rem">
        <span style="flex:1;font-size:.7rem;color:var(--muted)">${cntLbl}</span>
        <div style="display:flex;align-items:center;gap:.5rem">
          <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem" onclick="_rgpdP2GotoPage(${_rgpdP2Page - 1})" ${_rgpdP2Page === 0 ? 'disabled' : ''}>‹</button>
          <span style="font-size:.7rem;color:var(--muted)">${_rgpdP2Page + 1} / ${totalPages}</span>
          <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem" onclick="_rgpdP2GotoPage(${_rgpdP2Page + 1})" ${_rgpdP2Page >= totalPages - 1 ? 'disabled' : ''}>›</button>
        </div>
        <span style="flex:1"></span>
      </div>`;
}
function _rgpdP2GotoPage(p) {
  _rgpdP2Page = Math.max(0, p);
  _renderRgpdPart2();
}
// Anonymisation en masse : tous les utilisateurs dépassant le seuil d'inactivité.
// Ouvre la modale de confirmation avec la liste des cibles ; le confirme
// déclenche la boucle d'appels API (cf. _rgpdConfirmAnonymize).
function _rgpdBulkAnonymize() {
  const thresholdDays = _rgpdRetentionYears * 365;
  const GRACE_DAYS = 30;
  // Seuls les comptes éligibles AVEC préavis envoyé il y a >= 30 jours peuvent
  // être anonymisés (option "préavis obligatoire").
  const eligible = _rgpdUsersCache.filter(u => {
    if (u.role !== 'utilisateur' || u.anonymized_at) return false;
    if (_rgpdDaysInactive(u) < thresholdDays) return false;
    if (!u.deletion_notice_sent_at) return false;
    const t = new Date(String(u.deletion_notice_sent_at).replace(' ', 'T'));
    if (isNaN(t.getTime())) return false;
    return Math.floor((Date.now() - t.getTime()) / 86400000) >= GRACE_DAYS;
  });
  if (!eligible.length) { showToast('Aucun compte éligible (préavis ≥ 30 jours requis)'); return; }
  _rgpdOpenAnonymizeModal(eligible.map(u => u.id), {
    intro: `Vous êtes sur le point d'effacer définitivement les données nominatives de ${eligible.length} compte${eligible.length > 1 ? 's' : ''} inactif${eligible.length > 1 ? 's' : ''} (préavis envoyé il y a plus de ${GRACE_DAYS} jours) :`,
  });
}

// Envoie le préavis d'anonymisation à tous les comptes éligibles n'ayant pas
// encore reçu de mail. Ouvre la modale de confirmation polymorphe ; l'appel
// API est déclenché par _rgpdConfirmNotify au clic Confirmer.
function _rgpdBulkNotify() {
  const thresholdDays = _rgpdRetentionYears * 365;
  const targets = _rgpdUsersCache.filter(u =>
    u.role === 'utilisateur'
    && !u.anonymized_at
    && !u.deletion_notice_sent_at
    && _rgpdDaysInactive(u) >= thresholdDays
  );
  if (!targets.length) { showToast('Aucun préavis à envoyer'); return; }
  _rgpdOpenNotifyModal(targets.map(u => u.id));
}
async function _rgpdConfirmNotify() {
  const ids = _rgpdPendingAnonymizeIds.slice();
  if (!ids.length) return;
  const btn = document.getElementById('rgpd-confirm-btn');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const r = await apiPost('/users.php?action=notify_inactive', {
    action: 'notify_inactive',
    ids,
  });
  closeRgpdAnonymizeModal();
  if (!r || !r.ok) {
    showToast('⚠️ ' + ((r && r.error) || 'Erreur'));
  } else {
    const sent    = r.sent    || 0;
    const skipped = r.skipped || 0;
    showToast(`📧 ${sent} préavis envoyé${sent > 1 ? 's' : ''}` + (skipped ? ` (${skipped} ignorés)` : ''));
  }
  await _rgpdReload();
}

// Setter pour le champ de configuration admin
async function setRgpdRetentionYears(value) {
  const v = parseInt(value, 10);
  if (!Number.isFinite(v) || v < 0 || v > 50) { showToast('⚠️ Valeur invalide (0-50)'); return; }
  _rgpdRetentionYears = v;
  const r = await apiPost('/settings.php?action=save', { action: 'save', rgpd_retention_years: String(v) });
  if (!r || !r.ok) { showToast('⚠️ ' + ((r && r.error) || 'Erreur')); return; }
  showToast('✅ Durée RGPD enregistrée');
}

function openSvcModalIconPicker() {
  let picker = document.getElementById('_icon-picker');
  if (picker) picker.remove();
  const current = _svcModalIcon || '🎯';
  picker = document.createElement('div');
  picker.id = '_icon-picker';
  picker.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center';
  picker.onclick = e => { if (e.target === picker) picker.remove(); };
  picker.innerHTML = `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:var(--rad);padding:1.25rem 1.5rem;max-width:480px;width:92%;max-height:80vh;overflow-y:auto;box-shadow:0 8px 32px rgba(0,0,0,.4)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">
        <span style="font-size:.95rem;font-weight:600;color:var(--text)">Choisir une icône</span>
        <button onclick="document.getElementById('_icon-picker').remove()" style="background:none;border:none;cursor:pointer;font-size:1.2rem;color:var(--muted);line-height:1">✕</button>
      </div>
      ${_ICON_CATEGORIES.map(cat => `
        <div style="margin-bottom:.85rem">
          <div style="font-size:.62rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:.3rem">${cat.label}</div>
          <div style="display:flex;flex-wrap:wrap;gap:4px">
            ${cat.icons.map(icon => `<button onclick="_selectSvcModalIcon('${icon}')"
              style="width:36px;height:36px;font-size:1.15rem;border:2px solid ${icon===current?'var(--accent)':'transparent'};border-radius:6px;background:var(--surface2);cursor:pointer;display:flex;align-items:center;justify-content:center">${icon}</button>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
  document.body.appendChild(picker);
}

function _selectSvcModalIcon(icon) {
  _svcModalIcon = icon;
  document.getElementById('_icon-picker')?.remove();
  _renderSvcModalIcon();
}

function openSvcModal(svcId = null) {
  _svcModalId = svcId;
  const svc = svcId ? SERVICES.find(s => s.id === svcId) : null;
  _svcModalIcon = svcId ? (svc?.icon || '') : '';
  const input = document.getElementById('svc-modal-label');
  if (input) input.value = svc ? svc.label : '';
  const title = document.getElementById('svc-modal-title');
  if (title) title.textContent = svc ? '✏️ Modifier le service' : '➕ Nouveau service';
  const submitBtn = document.getElementById('svc-modal-submit');
  if (submitBtn) submitBtn.textContent = svc ? 'Enregistrer' : 'Créer';
  _renderSvcModalIcon();

  document.getElementById('svc-modal')?.classList.add('open');
  setTimeout(() => input?.focus(), 50);
}

function closeSvcModal() {
  document.getElementById('svc-modal')?.classList.remove('open');
}

async function submitSvcModal() {
  const input = document.getElementById('svc-modal-label');
  const label = input?.value.trim();
  if (!label) { input?.focus(); return; }
  if (_svcModalId) {
    // Édition
    const r = await apiPost('/services.php?action=update', {
      id: _svcModalId, label, icon: _svcModalIcon || null,
    });
    if (r.ok) {
      const svc = SERVICES.find(s => s.id === _svcModalId);
      if (svc) { svc.label = label; svc.icon = _svcModalIcon || null; }
      closeSvcModal();
      renderServiceSidebar(); renderServicesConfigTable();
      showToast('✅ Service mis à jour');
    }
  } else {
    // Création
    const r = await apiPost('/services.php?action=create', {
      label, position: SERVICES.length
    });
    if (r.ok) {
      if (_svcModalIcon && r.id) await apiPost('/services.php?action=update', { id: r.id, icon: _svcModalIcon });
      closeSvcModal();
      const r2 = await apiGet('/services.php?action=list');
      if (r2.ok) { SERVICES = r2.services; renderServiceSidebar(); renderServicesConfigTable(); showToast('✅ Service créé'); }
    }
  }
}

// Alias pour le bouton "+ Ajouter"
function openCreateSvcModal() { openSvcModal(null); }

async function removeService(svcId) {
  if (!confirm('Supprimer ce service et toutes ses réservations ?')) return;
  const r = await apiPost('/services.php?action=delete', { id: svcId });
  if (r.ok) {
    SERVICES = SERVICES.filter(s => s.id !== svcId);
    renderServiceSidebar(); renderServicesConfigTable(); showToast('🗑️ Service supprimé');
  }
}


// ── Badges colorés ───────────────────────────────────────
// border / accent utilisent var(--accent) pour s'adapter automatiquement au thème :
//   dark  → #6dceaa (vert menthe)
//   light → #5ab544 (vert vif)
const BADGE_COLOR_VALIDATED  = { bg:'#c8e8d4', border:'var(--accent)',         accent:'var(--accent)'    };
const BADGE_COLOR_PENDING    = { bg:'#f3dfbb', border:'rgba(232,164,90,.45)', accent:'rgb(232,164,90)'  };
// Efface le marquage visuel de toutes les colonnes jauge plafonnées
function _clearGaugeCaps() {
  document.querySelectorAll('.gauge-col-capped').forEach(col => {
    col.classList.remove('gauge-col-capped');
    col.style.background   = '';
    col.style.borderRadius = '';
    const baseColor = col.dataset.baseColor || '';
    col.querySelectorAll('input, span, .gauge-spin-btn').forEach(el => { el.style.color = baseColor; });
  });
}

// Crée l'élément de saisie du thème pour une cellule de réservation utilisateur.
// - Mode 'libre' (par défaut) → textarea (saisie libre)
// - Mode 'liste' avec thèmes définis pour ce service → select (menu déroulant compact)
// Le caller doit toujours appendChild() le résultat et peut compléter dataset.slotId/dayKey.
function _createUserThemeInput(myBk, validated, blocked, spotsClass) {
  // var(--accent) → #6dceaa en dark / #5ab544 en light (cohérent avec .spots-ok).
  const themeColor = validated ? 'var(--accent)' : 'rgb(232,164,90)';
  const isListe    = _currentServiceThemesMode === 'liste' && _currentServiceThemesList.length > 0;
  const curTheme   = (myBk && myBk.themeLabel) || '';

  if (isListe) {
    // Picker custom (et non <select> natif) : Chrome ignore les styles padding/line-height
    // des <option>, ce qui empêche d'obtenir des lignes compactes dans la liste déroulée.
    const list = _currentServiceThemesList.slice();
    if (curTheme && !list.includes(curTheme)) list.push(curTheme);

    const wrap = document.createElement('div');
    wrap.className = `slot-spots ${spotsClass} ${validated ? 'theme-validated' : 'theme-pending'}`;
    wrap.style.cssText = `position:relative;font-size:.62rem;color:${themeColor};border:none;background:transparent;cursor:${blocked?'default':'pointer'};max-width:100%;line-height:1;box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:2px;height:14px;padding:0 2px 0 4px;user-select:none;overflow:hidden`;
    wrap.style.setProperty('--theme-color', themeColor);

    const labelEl = document.createElement('span');
    // Tronquer avec ellipsis sur une seule ligne — pas de wrap.
    labelEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1';
    labelEl.textContent = curTheme || '— Thème —';
    wrap.appendChild(labelEl);

    const arrowEl = document.createElement('span');
    arrowEl.style.cssText = `flex-shrink:0;font-size:1rem;color:${themeColor};line-height:1`;
    arrowEl.textContent = '▾';
    wrap.appendChild(arrowEl);

    let menu = null;
    function closeMenu() {
      if (!menu) return;
      menu.remove();
      menu = null;
      document.removeEventListener('mousedown', onDocMouseDown, true);
      document.removeEventListener('keydown',   onKeyDown,      true);
      window.removeEventListener('scroll',      closeMenu,      true);
      window.removeEventListener('resize',      closeMenu);
    }
    function onDocMouseDown(e) {
      if (menu && !menu.contains(e.target) && !wrap.contains(e.target)) closeMenu();
    }
    function onKeyDown(e) { if (e.key === 'Escape') closeMenu(); }
    function openMenu() {
      if (blocked || menu) return;
      // Cache l'info-bulle des créneaux pour ne pas masquer le picker.
      if (typeof _scheduleTtHide === 'function') _scheduleTtHide();
      document.querySelectorAll('.user-theme-picker-menu').forEach(el => el.remove());
      menu = document.createElement('div');
      menu.className = 'user-theme-picker-menu';
      const r = wrap.getBoundingClientRect();
      const hoverBg = validated ? 'rgba(109,206,170,.18)' : 'rgba(232,164,90,.18)';
      menu.style.cssText = `position:fixed;top:${r.bottom+2}px;left:${r.left}px;min-width:${Math.max(r.width,80)}px;background:var(--surface);border:1px solid ${themeColor};border-radius:3px;font-size:.62rem;color:var(--text);z-index:10000;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.3);padding:1px 0`;
      const items = [''].concat(list);
      items.forEach(label => {
        const it = document.createElement('div');
        it.style.cssText = 'padding:1px 6px;line-height:1.1;cursor:pointer;white-space:nowrap';
        it.textContent = label || '— Thème —';
        if (label === curTheme) it.style.background = 'rgba(255,255,255,.06)';
        it.addEventListener('mouseenter', () => it.style.background = hoverBg);
        it.addEventListener('mouseleave', () => { it.style.background = label === curTheme ? 'rgba(255,255,255,.06)' : ''; });
        it.addEventListener('mousedown',  e => { e.stopPropagation(); e.preventDefault(); });
        it.addEventListener('click', e => {
          e.stopPropagation();
          if (myBk) myBk.themeLabel = label;
          labelEl.textContent = label || '— Thème —';
          closeMenu();
          updateConfirmBtn();
        });
        menu.appendChild(it);
      });
      document.body.appendChild(menu);
      setTimeout(() => {
        document.addEventListener('mousedown', onDocMouseDown, true);
        document.addEventListener('keydown',   onKeyDown,      true);
        window.addEventListener('scroll',      closeMenu,      true);
        window.addEventListener('resize',      closeMenu);
      }, 0);
    }

    wrap.addEventListener('mousedown', e => e.stopPropagation());
    wrap.addEventListener('click', e => {
      e.stopPropagation();
      if (blocked) return;
      menu ? closeMenu() : openMenu();
    });
    return wrap;
  }

  // Mode libre — textarea (comportement historique)
  const inp = document.createElement('textarea');
  inp.className = `slot-spots ${spotsClass}`;
  inp.classList.add(validated ? 'theme-validated' : 'theme-pending');
  inp.style.color = themeColor;
  inp.style.webkitTextFillColor = themeColor;
  inp.style.setProperty('--theme-color', themeColor);
  inp.placeholder = 'Saisissez un thème';
  inp.value = curTheme;
  if (blocked) { inp.readOnly = true; inp.style.pointerEvents = 'none'; }
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } };
  inp.onkeyup = e => e.stopPropagation();
  inp.oninput = () => {
    if (!myBk || blocked) return;
    myBk.themeLabel = inp.value;
    updateConfirmBtn();
    autoResizeTextarea(inp);
  };
  inp.addEventListener('blur', () => { inp.style.background = ''; inp.style.color = themeColor; });
  if (!blocked) inp.addEventListener('mousedown', e => e.stopPropagation());
  requestAnimationFrame(() => autoResizeTextarea(inp));
  return inp;
}

// Petite croix de suppression visible au survol d'un badge "my-booking".
// Le clic appelle `onCancel`, qui doit faire la même chose que cliquer le badge
// (typiquement selectSlot / selectSlotUnique → toggle de la sélection).
function _createSlotCloseBtn(onCancel) {
  const x = document.createElement('span');
  x.className = 'slot-btn-close';
  x.textContent = '×';
  x.title = 'Supprimer';
  // mousedown : éviter le démarrage du drag du parent.
  x.addEventListener('mousedown', e => { e.stopPropagation(); e.preventDefault(); });
  x.addEventListener('click', e => {
    e.stopPropagation(); e.preventDefault();
    onCancel();
  });
  return x;
}

function _createGaugeBadge(myBk, validated, free, blocked = false) {
  // Pour un booking déjà confirmé à CE créneau, son gauge est dans serverGaugeSums (donc dans taken)
  // → on l'ajoute à free pour obtenir le vrai max disponible pour ce booking.
  // Pour un booking déplacé vers un NOUVEAU créneau, il n'est pas encore dans serverGaugeSums
  // → free est déjà le vrai disponible, rien à ajouter.
  const isAtSameSlot = myBk.bookingId && !myBk.moved;
  const origEnf  = isAtSameSlot ? (initialCounts[myBk.bookingId]?.enfants       ?? 0) : 0;
  const origAcc  = isAtSameSlot ? (initialCounts[myBk.bookingId]?.accompagnants  ?? 0) : 0;
  const maxTotal = Math.max(0, (free ?? 0) + origEnf + origAcc);

  // En mode jauge, le minimum est de 1 enfant ET 1 adulte (chacun).
  // 1. on garantit ce plancher, puis 2. on réduit si la somme dépasse maxTotal.
  let newEnf = Math.max(1, myBk.enfants        ?? 0);
  let newAcc = Math.max(1, myBk.accompagnants  ?? 0);
  let accCapped = false, enfCapped = false;
  if (newEnf + newAcc > maxTotal) {
    const accDesired = Math.max(1, maxTotal - newEnf);
    if (accDesired < newAcc) { newAcc = accDesired; accCapped = true; }
  }
  if (newEnf + newAcc > maxTotal) {
    const enfDesired = Math.max(1, maxTotal - newAcc);
    if (enfDesired < newEnf) { newEnf = enfDesired; enfCapped = true; }
  }
  myBk.enfants       = newEnf;
  myBk.accompagnants = newAcc;

  const CAPPED_STYLE  = 'background:whitesmoke;border-radius:var(--rad-sm);';
  const COLOR_CAPPED  = 'var(--danger)';
  // var(--accent) → #6dceaa en dark / #5ab544 en light (cohérent avec .spots-ok).
  const color         = validated ? 'var(--accent)' : 'rgb(232,164,90)';
  const colorEnfVal   = enfCapped ? COLOR_CAPPED : color;
  const colorAccVal   = accCapped ? COLOR_CAPPED : color;
  const icon  = validated ? '✅' : '⏳';
  const anyCapped = enfCapped || accCapped;
  if (anyCapped) {
    showToast('⚠️ Pas assez de places disponibles, le nombre de participants a été réduit', 4000, {error: true, top: true});
  }
  const SPIN_BTN = (dir, forCol, clr) => {
    // Triangle dessiné en SVG — la boîte de l'icône colle exactement au glyphe,
    // donc la zone cliquable correspond pile à ce que voit l'utilisateur.
    const path = dir === 'up' ? 'M3 0 L6 5 L0 5 Z' : 'M0 0 L6 0 L3 5 Z';
    return `<button type="button" class="gauge-spin-btn" data-spin="${dir}" data-for="${forCol}"
      style="background:none;border:none;padding:0;margin:0;cursor:pointer;color:${clr};display:block;width:6px;height:5px;line-height:0;font-size:0;transform:translateY(${dir === 'up' ? '-1' : '1'}px)">
      <svg width="6" height="5" viewBox="0 0 6 5" fill="currentColor" style="display:block">
        <path d="${path}"/>
      </svg>
    </button>`;
  };
  const div = document.createElement('div');
  div.className = 'gauge-badge';
  div.style.cssText = `display:flex;align-items:center;justify-content:center;width:100%;cursor:default;padding-top:1px`;
  div.innerHTML = `
    <div data-gauge-col="enf" data-base-color="${color}" style="display:flex;flex-direction:column;align-items:start;width:calc((100% - .85rem) / 2);${enfCapped ? CAPPED_STYLE : ''}">
      <div class="gauge-inp-enf" style="display:flex;align-items:center;justify-content:center;width:100%">
        <div aria-hidden="true" style="display:flex;flex-direction:column;align-items:flex-start;visibility:hidden;flex-shrink:0;width:55%">${SPIN_BTN('up','enf',colorEnfVal)}${SPIN_BTN('down','enf',colorEnfVal)}</div>
        <input type="number" min="1" max="${maxTotal}" value="${newEnf}"
          style="width:20%;text-align:center;font-size:.75rem;background:transparent;border:none;color:${colorEnfVal};-webkit-text-fill-color:${colorEnfVal};opacity:1;font-weight:600;padding:0;flex-shrink:0">
        <div style="display:flex;flex-direction:column;align-items:flex-start;flex-shrink:0;width:25%">${SPIN_BTN('up','enf',colorEnfVal)}${SPIN_BTN('down','enf',colorEnfVal)}</div>
      </div>
      <span class="gauge-txt" style="color:${colorEnfVal};padding-left:30%;box-sizing:border-box">${newEnf > 1 ? 'Enfants' : 'Enfant'}</span>
    </div>
    <span class="slot-icon" style="align-self:flex-start">${icon}</span>
    <div data-gauge-col="acc" data-base-color="${color}" style="display:flex;flex-direction:column;align-items:start;width:calc((100% - .85rem) / 2);${accCapped ? CAPPED_STYLE : ''}">
      <div class="gauge-inp-acc" style="display:flex;align-items:center;justify-content:center;width:100%">
        <div aria-hidden="true" style="display:flex;flex-direction:column;align-items:flex-start;visibility:hidden;flex-shrink:0;width:25%">${SPIN_BTN('up','acc',colorAccVal)}${SPIN_BTN('down','acc',colorAccVal)}</div>
        <input type="number" min="1" max="${maxTotal}" value="${newAcc}"
          style="width:20%;text-align:center;font-size:.75rem;background:transparent;border:none;color:${colorAccVal};-webkit-text-fill-color:${colorAccVal};opacity:1;font-weight:600;padding:0;flex-shrink:0">
        <div style="display:flex;flex-direction:column;align-items:flex-start;flex-shrink:0;width:55%">${SPIN_BTN('up','acc',colorAccVal)}${SPIN_BTN('down','acc',colorAccVal)}</div>
      </div>
      <span class="gauge-txt" style="color:${colorAccVal};padding-right:30%;box-sizing:border-box">${newAcc > 1 ? 'Adultes' : 'Adulte'}</span>
    </div>`;
  const colEnf = div.querySelector('[data-gauge-col="enf"]');
  const colAcc = div.querySelector('[data-gauge-col="acc"]');
  if (enfCapped) colEnf.classList.add('gauge-col-capped');
  if (accCapped) colAcc.classList.add('gauge-col-capped');
  const [inpEnf, inpAcc] = div.querySelectorAll('input');
  if (blocked) {
    inpEnf.disabled = true;
    inpAcc.disabled = true;
    div.querySelectorAll('.gauge-spin-btn').forEach(b => { b.disabled = true; });
  }
  const [lblEnf, , lblAcc] = div.querySelectorAll('span'); // slot-icon est le span du milieu
  // data-* pour lecture directe depuis finalConfirm()
  inpEnf.dataset.gaugeField = 'enfants';
  inpEnf.dataset.slotId     = myBk.slotId || '';
  inpEnf.dataset.dayKey     = myBk.day    || '';
  inpAcc.dataset.gaugeField = 'accompagnants';
  inpAcc.dataset.slotId     = myBk.slotId || '';
  inpAcc.dataset.dayKey     = myBk.day    || '';
  // Les deux champs ont min=1, donc l'autre champ occupe ≥1 place : on garde un plancher de 1 sur le max.
  const _updateMaxes = () => {
    inpEnf.max = Math.max(1, maxTotal - (parseInt(inpAcc.value) || 1));
    inpAcc.max = Math.max(1, maxTotal - (parseInt(inpEnf.value) || 1));
  };
  _updateMaxes();
  inpEnf.oninput = () => {
    myBk.enfants = parseInt(inpEnf.value) || 0;
    colEnf.classList.remove('gauge-col-capped');
    colEnf.style.background = ''; colEnf.style.borderRadius = '';
    inpEnf.style.color = color; lblEnf.style.color = color;
    lblEnf.textContent = (myBk.enfants > 1) ? 'Enfants' : 'Enfant';
    colEnf.querySelectorAll('.gauge-spin-btn').forEach(b => b.style.color = color);
    _updateMaxes(); updateConfirmBtn();
  };
  inpAcc.oninput = () => {
    myBk.accompagnants = parseInt(inpAcc.value) || 0;
    colAcc.classList.remove('gauge-col-capped');
    colAcc.style.background = ''; colAcc.style.borderRadius = '';
    inpAcc.style.color = color; lblAcc.style.color = color;
    lblAcc.textContent = (myBk.accompagnants > 1) ? 'Adultes' : 'Adulte';
    colAcc.querySelectorAll('.gauge-spin-btn').forEach(b => b.style.color = color);
    _updateMaxes(); updateConfirmBtn();
  };
  div.querySelectorAll('.gauge-spin-btn').forEach(btn => {
    const step = () => {
      const inp = btn.dataset.for === 'enf' ? inpEnf : inpAcc;
      if (btn.dataset.spin === 'up') inp.stepUp(); else inp.stepDown();
      inp.dispatchEvent(new Event('input'));
    };
    btn.addEventListener('mousedown', e => {
      e.stopPropagation();
      e.preventDefault();
      _startGaugeSpinHold(step);
    });
    btn.addEventListener('touchstart', e => {
      e.stopPropagation();
      e.preventDefault();
      _startGaugeSpinHold(step);
    }, { passive: false });
    btn.addEventListener('mouseleave', _stopGaugeSpinHold);
  });
  [inpEnf, inpAcc].forEach(inp => {
    inp.addEventListener('click',     e => e.stopPropagation());
    inp.addEventListener('mousedown', e => e.stopPropagation());
  });
  return div;
}

// Construit l'element bouton (<button> ou <div>) d'une cellule de l'ecran reservation,
// avec son contenu interne selon le mode actif (themes, jauge, ou places simples).
// Les event handlers (drag, click, contextmenu) restent a la charge du caller car ils
// referencent des variables locales (periodId, dayIdx, week, etc.).
//
// opts attendus :
//   sl               : objet slot
//   myBk             : reservation du user sur ce slot (ou null)
//   isMine, isFull, userGauge, _myBkValidated, _isBlocked
//   gaugeFree        : pour le _createGaugeBadge
//   spotsClass, spotsLabel
//   pendingLabel     : libelle a afficher quand isMine + pas valide (recurring: '* vous',
//                      unique: '<span...>En attente</span>')
//   dayKey           : optionnel, pour dataset.dayKey (mode recurrent)
//   onSelect         : callback () => void appele sur clic quand !isMine (placement direct)
function _buildScheduleSlotBtn(opts) {
  const { sl, myBk, isMine, isFull, gaugeFree, userGauge,
          _myBkValidated, _isBlocked, spotsClass, spotsLabel,
          pendingLabel, dayKey = null, onSelect } = opts;
  const btn = document.createElement((themeMode || userGauge) && isMine ? 'div' : 'button');
  btn.className = 'slot-btn' + (isMine ? (_myBkValidated ? ' my-booking' : ' my-booking my-booking-pending') : '');
  if (isFull && !isMine) { btn.disabled = true; btn.style.cursor = 'not-allowed'; }
  btn.dataset.slotId = sl.id;
  if (dayKey) btn.dataset.dayKey = dayKey;
  if (!(userGauge && isMine)) {
    // Créneau complet (non-mine) → icône estompée à 20 % pour signaler l'indisponibilité.
    const iconStyle = (isFull && !isMine) ? ' style="opacity:.2"' : '';
    btn.insertAdjacentHTML('beforeend',
      `<span class="slot-icon"${iconStyle}>${isMine ? (_myBkValidated ? '✅' : '⏳') : '<span style="font-size:1rem">📆</span>'}</span>`);
  }
  if (themeMode && isMine) {
    btn.style.cssText += 'cursor:pointer;height:auto;min-height:44px;';
    const inp = _createUserThemeInput(myBk, _myBkValidated, _isBlocked, spotsClass);
    inp.dataset.slotId = sl.id;
    if (dayKey) inp.dataset.dayKey = dayKey;
    if (userGauge) btn.appendChild(_createGaugeBadge(myBk, _myBkValidated, gaugeFree, _isBlocked));
    btn.appendChild(inp);
  } else if (userGauge && isMine) {
    btn.style.cssText += 'cursor:pointer;height:auto;min-height:44px;';
    btn.appendChild(_createGaugeBadge(myBk, _myBkValidated, gaugeFree, _isBlocked));
  } else {
    if (!isMine && onSelect) btn.onclick = onSelect;
    const spotsInner = isMine
      ? (_myBkValidated
          ? `<span style="font-size:.62rem;color:var(--accent);font-weight:600">Validé</span>`
          : pendingLabel)
      : spotsLabel;
    btn.insertAdjacentHTML('beforeend', `<span class="slot-spots ${spotsClass}">${spotsInner}</span>`);
  }
  return btn;
}

function _badgeIndicators(b) {
  const c      = b.validated == 1 ? BADGE_COLOR_VALIDATED : BADGE_COLOR_PENDING;
  const border = `border:1.5px solid ${c.bg}`;
  const pill   = (cls) => `<span class="${cls}" style="${border}">${cls.slice(-1).toUpperCase()}</span>`;
  let html = '';
  if (b.validated == 1)              html += pill('indic_v');
  if      (b.pointage === 'present') html += pill('indic_p');
  else if (b.pointage === 'absent')  html += pill('indic_a');
  if (!html) return '';
  return `<span style="position:absolute;right:3px;top:3px;display:flex;flex-direction:column;gap:2px;align-items:center;z-index:1">${html}</span>`;
}
function _badgeStyle(b) {
  const c = b.validated == 1 ? BADGE_COLOR_VALIDATED : BADGE_COLOR_PENDING;
  return `background:${c.bg};border-color:${c.border}`;
}
function _badgeTitle(b) {
  const tel = (b.tel || '').trim();
  const mail = b.email || '';
  const enf = parseInt(b.enfants) || 0;
  const acc = parseInt(b.accompagnants) || 0;
  const lines = [];
  if (tel) lines.push(`Tel : ${tel}`);
  lines.push(mail);
  lines.push(`${enf} enfant${enf > 1 ? 's' : ''} ${acc} adulte${acc > 1 ? 's' : ''}`);
  return lines.join('\n');
}

// ── Admin — Planning ──────────────────────────────────────
function renderPlanningTab() {
  const pre     = _activePlanningTabId;
  const gridEl  = document.getElementById(`${pre}-grid`);
  const tabsEl  = document.getElementById(`${pre}-period-tabs`);
  const legendEl= document.getElementById(`${pre}-legend`);
  if (!gridEl || !tabsEl) return;
  const gaugeRec = _currentDemSettings.some(function(r) { return r.recurrent && r.jauge; });

  // Légende — uniquement pour le planning ponctuel.
  // Le planning récurrent n'affiche pas de légende (le pointage P/A n'a pas de sens
  // sur un événement récurrent, et "R Récurrent" y est trivial).
  // En mode Semaine A/B, l'indicateur "R" est remplacé par deux pastilles "A" et "B"
  // (cf. renderPlanningUnique : les créneaux miroirs y portent A ou B selon la semaine).
  const _abModeLegend = _currentDemSettings.some(function(r) { return r.semaine_ab; });
  const _legendIndicStyle = 'font-size:.55rem;font-weight:800;border-radius:3px;padding:1px 3px;line-height:1';
  let _legendRecurrentItem = '';
  if (recurringMode) {
    if (_abModeLegend) {
      _legendRecurrentItem =
        `<span style="display:flex;align-items:center;gap:.35rem"><span style="${_legendIndicStyle};color:#fff;background:#9a9a9a">A</span> Semaine A</span>`
      + `<span style="display:flex;align-items:center;gap:.35rem"><span style="${_legendIndicStyle};color:var(--text);background:#9a9a9a">B</span> Semaine B</span>`;
    } else {
      _legendRecurrentItem = `<span style="display:flex;align-items:center;gap:.35rem"><span class="indic_r" style="color:var(--text);background:rgba(0,0,0,.18)">R</span> Récurrent</span>`;
    }
  }
  const legendHtmlUniq = `<div style="display:flex;align-items:center;gap:.6rem;font-size:.78rem;color:var(--muted);flex-wrap:wrap">
      ${_legendRecurrentItem}
      <span style="display:flex;align-items:center;gap:.35rem"><span class="indic_p">P</span> Présent</span>
      <span style="display:flex;align-items:center;gap:.35rem"><span class="indic_a">A</span> Absent</span>
    </div>`;

  // Synchronise les barres de navigation d'exercice (label + boutons disabled).
  _renderExerciceNav();

  if (_activePlanningTabId !== 'planning-rec') {
    if (legendEl) legendEl.style.display = 'none'; // géré dans renderPlanningUnique
    gridEl.innerHTML = renderPlanningUnique(legendHtmlUniq);
    tabsEl.innerHTML = '';
    return;
  }

  // Si l'utilisateur n'a pas encore choisi de période, se placer sur celle en cours
  _ensurePlanningPeriodDefault();
  // Recale planningPeriodIdx s'il pointe une période hors de l'exercice sélectionné
  if (currentExerciceId
      && PERIODS[planningPeriodIdx]
      && PERIODS[planningPeriodIdx].exercice_id !== currentExerciceId) {
    const fallback = PERIODS.findIndex(p => p.exercice_id === currentExerciceId);
    if (fallback !== -1) planningPeriodIdx = fallback;
  }

  // Rendu onglets périodes — filtré par exercice sélectionné (ou actif si pas d'exercice)
  tabsEl.innerHTML = PERIODS.map((p,i) => {
    if (currentExerciceId ? p.exercice_id !== currentExerciceId : p.state !== 'actif') return '';
    return `<button class="period-btn ${i === planningPeriodIdx ? 'active' : ''}"
      style="--period-color:${p.color || '#6dceaa'}"
      onclick="planningPeriodIdx=${i};_planningPeriodUserPicked=true;renderPlanningTab()"
      ondragover="_onDragOverTab(event)"
      ondragenter="_onDragEnterTab(event,${i})"
      ondragleave="_onDragLeaveTab(event)">
      <span class="period-badge"></span>${p.label}
    </button>`;
  }).join('');

  const t = PERIODS[planningPeriodIdx] || PERIODS[0];
  if (!t) { gridEl.innerHTML = ''; return; }
  const bookingsForPeriod = allBookings.filter(b => parseInt(b.period_id) === t.id);
  const abMode = _currentDemSettings.some(function(r) { return r.semaine_ab; });
  const html = `
    <div class="planning-wrap">
      <table class="planning-table">
        <thead><tr>
          <th>Créneau</th>
          ${abMode ? `<th style="width:90px;text-align:center">Semaine</th>` : ''}
          ${DAYS.map(d=>`<th>${d}</th>`).join('')}
        </tr></thead>
        <tbody>
          ${(() => {
            // En mode Semaine A/B, on "expanse" les slots multi-semaines (ex. weeks='A,B')
            // en plusieurs lignes visuelles, une par semaine. Les réservations (clé slot_id+day_key
            // sans dimension semaine) s'affichent à l'identique sur chaque ligne expansée — ce qui
            // est correct sémantiquement : un user inscrit l'est bien pour les deux semaines.
            const _slotsForPeriod = (SLOTS_REC_MAP_FULL[String(t.id)] || [])
              .filter(sl => !sl.state || sl.state === 'actif');
            const _baseSlots = planningHideEmpty
              ? sortedByTime(_slotsForPeriod).filter(sl => bookingsForPeriod.some(b => b.slot_id === sl.id))
              : sortedByTime(_slotsForPeriod);
            const _expandedSlots = abMode
              ? _baseSlots.flatMap(sl => {
                  const w = _slotWeeks(sl);
                  // Multi-semaines (NULL, vide ou liste 'A,B') → 1 ligne par semaine
                  // Mono-semaine ('A' ou 'B') → 1 seule ligne
                  const list = (!w || String(w).includes(','))
                    ? (w ? String(w).split(',').map(s => s.trim()).filter(Boolean) : ['A','B'])
                    : [String(w).trim()];
                  return list.map(wk => Object.assign({}, sl, { _displayWeek: wk }));
                })
              : _baseSlots;
            return _expandedSlots.map(sl => `<tr>
            <td><div style="font-size:.65rem;font-weight:700">${slotLabel(sl).replace(' – ','<br>')}</div></td>
            ${abMode ? `<td style="width:90px;text-align:center;vertical-align:middle">${_weekAbBadge(sl._displayWeek || _slotWeeks(sl))}</td>` : ''}
            ${DKEYS.map(dk => {
              const total = getCapacity(sl.id, t.id, dk);
              // Filtre par semaine quand la ligne représente une semaine spécifique (mode A/B).
              // Un booking sans week ('' = legacy / pas de mode A/B) reste visible sur toutes les lignes.
              const _rowWk = sl._displayWeek || '';
              const bks = bookingsForPeriod.filter(b => b.slot_id === sl.id && b.day_key === dk
                && (!_rowWk || !(b.week || '') || (b.week || '') === _rowWk));
              const left = total !== null ? total - bks.length : null;
              const pctClass = total !== null && bks.length >= total ? 'full' : total !== null && bks.length >= total*.7 ? 'low' : '';
              const _capText = total === null ? '' : left <= 0
                ? `<span style="color:var(--danger)">Complet</span>`
                : `<span style="color:var(--accent)">${left} place${left > 1 ? 's' : ''}</span>`;
              const _gaugeMax = total;
              const _gaugeSum = bks.reduce((s, b) => s + (parseInt(b.enfants)||0) + (parseInt(b.accompagnants)||0), 0);
              const _gaugePct = _gaugeMax > 0 ? Math.min(100, Math.round(_gaugeSum / _gaugeMax * 100)) : 0;
              const _gaugeColor = _gaugePct >= 100 ? 'var(--danger)' : _gaugePct >= 70 ? '#e8a45a' : 'var(--accent)';
              const _gaugePart = gaugeRec && total !== null ? `<span style="display:inline-flex;align-items:center;gap:.3rem;color:${_gaugeColor}">
                <span>Jauge</span>
                <span style="display:inline-block;width:48px;height:5px;border-radius:3px;background:rgba(0,0,0,.1);overflow:hidden;flex-shrink:0"><span style="display:block;height:100%;width:${_gaugePct}%;background:${_gaugeColor};border-radius:3px"></span></span>
                <span>${_gaugeSum}/${_gaugeMax}</span>
              </span>` : '';
              const capLabel = total !== null ? `<div class="planning-cap" style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">${gaugeRec ? '' : _capText}${_gaugePart}</div>` : '';
              const _renderBadge = (b, extraClass = '') => {
                const isCut = _ctxCutData && !_ctxCutData.isCopy && _ctxCutData.id == b.id;
                return `<div class="planning-name-tag ${b.validated==1?'is-validated':'is-pending'}${isCut?' is-cut':''}${extraClass?' '+extraClass:''}" data-bid="${b.id}" style="${_badgeStyle(b)}" title="${_badgeTitle(b)}"
                  draggable="true"
                  ondragstart="_onDragStart(event,${b.id},'recurring','${sl.id}',${t.id},'${dk}','${_rowWk}')"
                  ondragend="_onDragEnd(event)"
                  onclick="openBadgeDetail(event,${b.id},'recurring')"
                  oncontextmenu="showBadgeCtx(event, ${JSON.stringify({id:b.id,email:b.email,periodId:t.id,slotId:sl.id,dayKey:dk,type:'recurring',week:_rowWk}).replace(/"/g,'&quot;')})">
                  ${_badgeIndicators(b)}
                  <span class="planning-name-tag-close" onmousedown="event.stopPropagation();event.preventDefault()" onclick="_quickDeleteBadge(event,${b.id},'recurring')" title="Supprimer">×</span>
                  <span style="font-weight:700">${b.structure_label || b.demandeur_label || (b.nom+' '+b.prenom)}</span>
                  <span style="font-size:.65rem;color:var(--muted)">${(b.structure_label || b.demandeur_label) ? b.nom+' '+b.prenom : (b.niveau||'')}</span>
                  ${themeMode && b.theme_label?`<span style="font-size:.62rem;color:${(b.validated==1?BADGE_COLOR_VALIDATED:BADGE_COLOR_PENDING).accent};font-weight:600">${b.theme_label}</span>`:''}
                </div>`;
              };
              let _badgesHtml;
              if (!bks.length) {
                _badgesHtml = '<div class="planning-empty">—</div>';
              } else if (bks.length === 1) {
                _badgesHtml = _renderBadge(bks[0]);
              } else {
                const _front = bks[0];
                const _back  = bks[1];
                const _back2 = bks[2] || null;
                _badgesHtml =
                  `<div class="planning-stack-wrap" onclick="openCellStackModal(event, ${t.id}, '${sl.id}', '${dk}', '${_rowWk}')" title="${bks.length} réservations — cliquer pour voir la liste">`
                  + (_back2 ? `<div class="stack-back2">${_renderBadge(_back2)}</div>` : '')
                  + `<div class="stack-back">${_renderBadge(_back)}</div>`
                  + `<div class="stack-front">${_renderBadge(_front)}</div>`
                  + `<span class="planning-stack-count">${bks.length}</span>`
                  + `</div>`;
              }
              return `<td onclick="openCellCreate(event,'${t.id}','${sl.id}','${dk}','${_rowWk}')"
                oncontextmenu="showCellCtx(event,'${t.id}','${sl.id}','${dk}','${_rowWk}')"
                ondragover="_onDragOver(event)"
                ondragenter="_onDragEnter(event,${t.id},'${sl.id}','${dk}')"
                ondragleave="_onDragLeave(event)"
                ondrop="_onDrop(event,${t.id},'${sl.id}','${dk}','${_rowWk}')">
                <div class="planning-cell-inner">
                  <div class="planning-cell-badges">${_badgesHtml}</div>
                  ${capLabel}
                </div>
              </td>`;
            }).join('')}
          </tr>`).join('');
          })()}
        </tbody>
      </table>
    </div>`;
  gridEl.innerHTML = html;
  // Pas de légende sur le planning récurrent (le pointage ne s'applique pas aux récurrents)
  if (legendEl) {
    legendEl.style.display = 'none';
    legendEl.innerHTML = '';
  }
  // Bandeaux dem-info admin (Planning récurrent + autres onglets admin) — rendu centralisé
  renderAdminDemInfo();
  // Si un glisser est en cours, remettre la transparence sur le badge source (DOM reconstruit)
  if (_dragData) {
    const src = gridEl.querySelector(`.planning-name-tag[data-bid="${_dragData.id}"]`);
    if (src) src.classList.add('is-dragging');
  }
  // Rafraîchir la modale multi-badges si elle est ouverte
  if (_cellStackCoords) _renderCellStackModal();
}

function renderPlanningUnique(legendHtml = '') {
  const gaugeRec   = _currentDemSettings.some(function(r) { return r.recurrent  && r.jauge; });
  const gaugePonct = _currentDemSettings.some(function(r) { return !r.recurrent && r.jauge; });
  const abMode     = _currentDemSettings.some(function(r) { return r.semaine_ab; });
  // Source : SLOTS_UNIQ_FULL (incl. desactive/archive) si dispo, sinon SLOTS_UNIQ (actif).
  const _uniqSource = SLOTS_UNIQ_FULL.filter(sl => !sl.state || sl.state === 'actif');
  if (!_uniqSource.length) return '<p class="no-booking-msg">Aucun créneau ponctuel défini. Ajoutez-en dans l\'onglet Paramètres.</p>';

  // Index slot_id -> bookings[] construit une fois (evite O(n*m) en filter + per-slot lookup).
  const bookingsBySlot = new Map();
  for (const b of allBookingsUnique) {
    const arr = bookingsBySlot.get(b.slot_id);
    if (arr) arr.push(b); else bookingsBySlot.set(b.slot_id, [b]);
  }

  // Limite par la plage de dates des périodes de l'exercice sélectionné.
  let exMinDate = null, exMaxDate = null;
  if (currentExerciceId) {
    for (const p of PERIODS) {
      if (p.exercice_id !== currentExerciceId) continue;
      if (p.date_start && (!exMinDate || p.date_start < exMinDate)) exMinDate = p.date_start;
      if (p.date_end   && (!exMaxDate || p.date_end   > exMaxDate)) exMaxDate = p.date_end;
    }
  }

  // Note : parseTime() zero-pad start_time pour eviter que "9:00" trie apres "10:00".
  const sorted = [..._uniqSource].sort((a,b) =>
    (a.slot_date||'').localeCompare(b.slot_date||'') ||
    (parseTime(a.start_time)||'99:99').localeCompare(parseTime(b.start_time)||'99:99'));

  let filtered = sorted;
  if (exMinDate && exMaxDate) {
    filtered = filtered.filter(sl => sl.slot_date && sl.slot_date >= exMinDate && sl.slot_date <= exMaxDate);
  }
  if (planningHideEmpty) {
    filtered = filtered.filter(sl => bookingsBySlot.has(sl.id));
  }

  const perPage  = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
  planningUniqPage = Math.min(planningUniqPage, pageCount - 1);
  const pageSlots = filtered.slice(planningUniqPage * perPage, (planningUniqPage + 1) * perPage);

  const rows = pageSlots.map(sl => {
    const isMirror  = !!sl.parent_slot_id;
    const gaugeFlag = isMirror ? gaugeRec : gaugePonct;
    const bks     = bookingsBySlot.get(sl.id) || [];
    const total   = sl.capacity || 6;
    const left    = total - bks.length;
    const _uCapText = left <= 0
      ? `<span style="color:var(--danger)">Complet</span>`
      : `<span style="color:var(--accent)">${left} place${left > 1 ? 's' : ''}</span>`;
    const _uGaugeMax = total;
    const _uGaugeSum = bks.reduce((s, b) => s + (parseInt(b.enfants)||0) + (parseInt(b.accompagnants)||0), 0);
    const _uGaugePct = _uGaugeMax > 0 ? Math.min(100, Math.round(_uGaugeSum / _uGaugeMax * 100)) : 0;
    const _uGaugeColor = _uGaugePct >= 100 ? 'var(--danger)' : _uGaugePct >= 70 ? '#e8a45a' : 'var(--accent)';
    const _uGaugePart = gaugeFlag ? `<span style="display:inline-flex;align-items:center;gap:.3rem;color:${_uGaugeColor}">
      <span>Jauge</span>
      <span style="display:inline-block;width:48px;height:5px;border-radius:3px;background:rgba(0,0,0,.1);overflow:hidden;flex-shrink:0"><span style="display:block;height:100%;width:${_uGaugePct}%;background:${_uGaugeColor};border-radius:3px"></span></span>
      <span>${_uGaugeSum}/${_uGaugeMax}</span>
    </span>` : '';
    const capHtml = `<div style="font-size:.7rem;margin-top:-3px;display:flex;align-items:center;gap:.5rem;flex-wrap:wrap">${gaugeFlag ? '' : _uCapText}${_uGaugePart}</div>`;
    // Indicateur miroir : "R" en mode normal, "A" / "B" en mode semaine A/B (couleur différente pour
    // distinguer les deux semaines : A en couleur de texte, B en blanc, sur fond gris commun).
    const _baseIndicStyle = 'font-size:.55rem;font-weight:800;border-radius:3px;padding:1px 3px;margin-right:3px;vertical-align:middle';
    // Pour un miroir, `weeks` est toujours mono-valeur ('A' ou 'B') ; fallback ISO sur la date.
    const _slotWeekAB = _slotWeeks(sl) || _slotDateWeekAB(sl.slot_date);
    let _mirrorIndic;
    if (!sl.parent_slot_id) {
      // Slot non-miroir : on garde un span invisible pour préserver l'alignement vertical du texte de date
      _mirrorIndic = `<span style="${_baseIndicStyle};background:rgba(0,0,0,.18);visibility:hidden">R</span>`;
    } else if (abMode && _slotWeekAB === 'A') {
      _mirrorIndic = `<span style="${_baseIndicStyle};color:#fff;background:#9a9a9a" title="Créneau miroir — Semaine A">A</span>`;
    } else if (abMode && _slotWeekAB === 'B') {
      _mirrorIndic = `<span style="${_baseIndicStyle};color:var(--text);background:#9a9a9a" title="Créneau miroir — Semaine B">B</span>`;
    } else {
      _mirrorIndic = `<span style="${_baseIndicStyle};background:rgba(0,0,0,.18)" title="Créneau miroir (récurrent)">R</span>`;
    }
    return `<tr>
      <td style="white-space:nowrap;vertical-align:middle;position:relative">${_mirrorIndic}${fmtDate(sl.slot_date)}<div style="position:absolute;bottom:2px;right:4px;display:flex;justify-content:flex-end">${capHtml}</div></td>
      <td style="text-align:center">${sl.start_time ? displayTime(sl.start_time) : ''}</td>
      <td style="text-align:center">${sl.end_time ? displayTime(sl.end_time) : ''}</td>
      <td onclick="openCellCreate(event,'','${sl.id}','')"
        oncontextmenu="showCellCtx(event,'','${sl.id}','')"
        ondragover="_onDragOver(event)"
        ondragenter="_onDragEnter(event,'','${sl.id}','')"
        ondragleave="_onDragLeave(event)"
        ondrop="_onDrop(event,'','${sl.id}','')">
        <div class="planning-cell-inner" style="min-height:unset">
          <div class="planning-cell-badges">
            ${bks.map(b => {
              const isCut = _ctxCutData && !_ctxCutData.isCopy && _ctxCutData.id == b.id;
              const isLockedBadge = !!(b.pointage || b.recurring_booking_id);
              return `<div class="planning-name-tag ${b.validated==1?'is-validated':'is-pending'}${isCut?' is-cut':''}${isLockedBadge?' is-locked':''}" data-bid="${b.id}" style="${_badgeStyle(b)}" title="${_badgeTitle(b)}"
                draggable="${isLockedBadge ? 'false' : 'true'}"
                ${isLockedBadge ? '' : `ondragstart="_onDragStart(event,${b.id},'unique','${sl.id}','','')" ondragend="_onDragEnd(event)"`}
                onclick="openBadgeDetail(event,${b.id},'unique')"
                oncontextmenu="showBadgeCtx(event,${JSON.stringify({id:b.id,email:b.email,slotId:sl.id,type:'unique',pointage:b.pointage||'',recurringBookingId:b.recurring_booking_id||0}).replace(/"/g,'&quot;')})">
                ${_badgeIndicators(b)}
                ${isLockedBadge ? '' : `<span class="planning-name-tag-close" onmousedown="event.stopPropagation();event.preventDefault()" onclick="_quickDeleteBadge(event,${b.id},'unique')" title="Supprimer">×</span>`}
                <span style="font-weight:700">${b.structure_label || b.demandeur_label || (b.nom+' '+b.prenom)}</span>
                <span style="font-size:.65rem;color:var(--muted)">${(b.structure_label || b.demandeur_label) ? b.nom+' '+b.prenom : (b.niveau||'')}</span>
                ${b.theme_label?`<span style="font-size:.62rem;color:${(b.validated==1?BADGE_COLOR_VALIDATED:BADGE_COLOR_PENDING).accent};font-weight:600">${b.theme_label}</span>`:''}
              </div>`;
            }).join('')}
            ${!bks.length ? '<div class="planning-empty">—</div>' : ''}
          </div>
        </div>
      </td>
    </tr>`;
  }).join('');

  const paginationInner = pageCount > 1 ? `
    <div style="display:flex;align-items:center;gap:.4rem">
      <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem"
        onclick="planningUniqPage--;renderPlanningTab()"
        ondragover="_onDragOverPage(event)"
        ondragenter="_onDragEnterPage(event,-1)"
        ondragleave="_onDragLeavePage(event)"
        ${planningUniqPage===0?'disabled':''}>‹</button>
      <span style="font-size:.7rem;color:var(--muted)">${planningUniqPage+1} / ${pageCount}</span>
      <button class="btn btn-ghost" style="padding:.1rem .45rem;font-size:.72rem"
        onclick="planningUniqPage++;renderPlanningTab()"
        ondragover="_onDragOverPage(event)"
        ondragenter="_onDragEnterPage(event,1)"
        ondragleave="_onDragLeavePage(event)"
        ${planningUniqPage>=pageCount-1?'disabled':''}>›</button>
    </div>` : '';

  const footer = (legendHtml || paginationInner) ? `
    <div style="display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:1.2rem 0 .5rem;gap:2rem">
      <div>${legendHtml}</div>
      <div>${paginationInner}</div>
      <div></div>
    </div>` : '';

  return `<div class="planning-wrap">
    <div class="admin-table-wrap">
    <table class="admin-table planning-uniq-table">
      <thead><tr>
        <th style="text-align:center;white-space:nowrap;width:1%">Date</th>
        <th style="text-align:center;white-space:nowrap;width:1%">Début</th>
        <th style="text-align:center;white-space:nowrap;width:1%">Fin</th>
        <th style="text-align:center">Séance</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    </div>
    ${footer}
  </div>`;
}

// ── Admin — Agenda hebdomadaire (vue graphique Google-Agenda) ──
// V1 : blocs des créneaux récurrents positionnés sur une grille jour×heure (pas 15 min).
// Mode "modèle de période" : projection des créneaux récurrents (day_key → colonne jour).
// Mode "semaine réelle" : superpose les créneaux ponctuels d'une semaine calendaire.
// Les ponctuels passent par `slot_date` → jour de semaine via getDay() (matrice de transformation).

function _agendaTimeToMin(hhmm) {
  const t = parseTime(hhmm);
  if (!t) return null;
  const [h, m] = t.split(':').map(n => parseInt(n, 10));
  return h * 60 + m;
}

function _agendaMinToLabel(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

// Renvoie la liste {key, label} des jours affiches dans l'agenda.
// Regle specifique a la vue agenda : Lundi a Vendredi toujours affiches,
// Samedi/Dimanche uniquement s'ils sont coches comme jours d'ouverture.
function _agendaActiveDays() {
  return ALL_DKEYS
    .map((k, i) => ({ key: k, label: ALL_DAYS[i], idx: i }))
    .filter(d => {
      if (d.key === 'sam' || d.key === 'dim') return DKEYS.includes(d.key);
      return true;
    });
}

// Formatage yyyy-mm-dd en heure LOCALE (contrairement à toISOString() qui convertit en UTC
// et peut décaler la date d'un jour selon le fuseau horaire et l'heure d'été).
function _agendaYmdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Renvoie le lundi (yyyy-mm-dd) de la semaine contenant la date donnée.
function _agendaMondayOf(ymdOrDate) {
  const d = (ymdOrDate instanceof Date) ? new Date(ymdOrDate) : new Date(ymdOrDate + 'T00:00:00');
  const wd = d.getDay(); // 0=dim, 1=lun, ...
  const diff = (wd === 0 ? -6 : 1 - wd);
  d.setDate(d.getDate() + diff);
  return _agendaYmdLocal(d);
}

function _agendaAddDays(ymd, n) {
  const d = new Date(ymd + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return _agendaYmdLocal(d);
}

// "lun" pour 0=dim, 1=lun, ... (utilise ALL_DKEYS dans l'ordre lun-dim)
function _agendaDayKeyFromYmd(ymd) {
  const wd = new Date(ymd + 'T00:00:00').getDay();
  return ALL_DKEYS[wd === 0 ? 6 : wd - 1];
}

// Retourne la période qui couvre une date (yyyy-mm-dd), ou null si aucune.
function _agendaPeriodCoveringDate(ymd) {
  return PERIODS.find(p =>
    (!currentExerciceId || p.exercice_id === currentExerciceId)
    && p.date_start && p.date_end
    && p.date_start <= ymd && ymd <= p.date_end
  ) || null;
}

function setAgendaMode(mode) {
  agendaMode = (mode === 'realweek') ? 'realweek' : 'model';
  if (agendaMode === 'realweek' && !agendaWeekAnchor) {
    agendaWeekAnchor = _agendaMondayOf(new Date());
  }
  renderAgendaWeekly();
}

// Retourne les dates (slot_date) des créneaux ponctuels actifs PORTANT au moins une
// réservation — utilisé par le mode "Masquer les horaires sans réservation" pour
// sauter aux semaines qui contiennent effectivement quelque chose, et désactiver les
// flèches quand il n'y a plus rien dans une direction.
function _agendaBookedSlotDates() {
  const bookedSlotIds = new Set((allBookingsUnique || []).map(b => b.slot_id));
  if (!bookedSlotIds.size) return [];
  const uniqSrc = (SLOTS_UNIQ_FULL && SLOTS_UNIQ_FULL.length) ? SLOTS_UNIQ_FULL : SLOTS_UNIQ;
  return (uniqSrc || [])
    .filter(sl => (!sl.state || sl.state === 'actif') && sl.slot_date && bookedSlotIds.has(sl.id))
    .map(sl => sl.slot_date);
}
// Sélection d'une période depuis les onglets de l'agenda admin. Marque le clic
// utilisateur (pour ne plus auto-positionner sur la période contenant aujourd'hui)
// et, en realweek, déplace l'ancre de semaine vers le lundi qui couvre la nouvelle période.
function _agendaSelectPeriod(idx) {
  agendaPeriodIdx = idx;
  _agendaPeriodUserPicked = true;
  const p = PERIODS[idx];
  if (p && agendaMode === 'realweek' && p.date_start) {
    agendaWeekAnchor = _agendaMondayOf(p.date_start);
  }
  renderAgendaWeekly();
}

function shiftAgendaWeek(deltaWeeks) {
  if (!agendaWeekAnchor) agendaWeekAnchor = _agendaMondayOf(new Date());
  let newAnchor = _agendaAddDays(agendaWeekAnchor, deltaWeeks * 7);
  // En mode "Masquer les horaires sans réservation", on saute aux semaines AYANT au moins
  // une réservation. Si plus aucune n'existe dans la direction, on garde le shift naturel
  // (le bouton sera désactivé au prochain rendu de toute façon).
  if (agendaHideEmptyHours && deltaWeeks !== 0) {
    const dates = _agendaBookedSlotDates();
    if (dates.length) {
      const step = deltaWeeks > 0 ? 7 : -7;
      const MAX_ITER = 260;
      let iter = 0;
      while (iter++ < MAX_ITER) {
        const sunday = _agendaAddDays(newAnchor, 6);
        if (dates.some(d => d >= newAnchor && d <= sunday)) break;
        const limitOk = deltaWeeks > 0
          ? dates.some(d => d > sunday)
          : dates.some(d => d < newAnchor);
        if (!limitOk) break;
        newAnchor = _agendaAddDays(newAnchor, step);
      }
    }
  }
  // Clamp à la période active actuelle (cohérence avec les onglets visibles en realweek) :
  // si le shift (potentiellement amplifié par le skip-empty) sort de la période, on annule.
  // Source de vérité = agendaPeriodIdx (l'onglet sélectionné), pas la dérivation par date
  // qui peut tomber dans la période précédente quand date_start est en milieu de semaine.
  if (agendaMode === 'realweek') {
    const curActive = PERIODS[agendaPeriodIdx]
      || _agendaPeriodCoveringDate(agendaWeekAnchor)
      || _agendaPeriodCoveringDate(_agendaAddDays(agendaWeekAnchor, 3))
      || null;
    if (curActive && curActive.date_start && curActive.date_end) {
      const newSunday = _agendaAddDays(newAnchor, 6);
      if (newAnchor > curActive.date_end || newSunday < curActive.date_start) return;
    }
  }
  agendaWeekAnchor = newAnchor;
  renderAgendaWeekly();
}

function resetAgendaWeekToToday() {
  agendaWeekAnchor = _agendaMondayOf(new Date());
  // Bascule l'onglet sur la période contenant aujourd'hui (cohérent avec la nouvelle ancre).
  const todayYmd = _agendaYmdLocal(new Date());
  const idx = PERIODS.findIndex(p => p.state === 'actif'
    && p.date_start && p.date_end
    && todayYmd >= p.date_start && todayYmd <= p.date_end);
  if (idx !== -1) {
    agendaPeriodIdx = idx;
    _agendaPeriodUserPicked = true;
  }
  renderAgendaWeekly();
}

function setAgendaWeekAB(wk) {
  agendaWeekAB = (wk === 'B') ? 'B' : 'A';
  renderAgendaWeekly();
}

// Algo de chevauchement (sweep) : assigne {col, colCount} à chaque bloc d'un jour.
// Deux blocs se chevauchent si leurs intervalles [startMin, endMin) s'intersectent.
function _agendaLayoutOverlaps(dayBlocks) {
  if (!dayBlocks.length) return;
  dayBlocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  // Stratégie : on traite les blocs dans l'ordre. Un "cluster" est un groupe transitivement
  // chevauchant. On flushe le cluster (et fixe colCount) dès qu'un bloc ne chevauche aucun actif.
  let cluster = [];
  let clusterMaxEnd = -Infinity;
  const flush = () => {
    const n = Math.max(1, ...cluster.map(b => b._col + 1));
    cluster.forEach(b => { b.colCount = n; });
    cluster = [];
    clusterMaxEnd = -Infinity;
  };
  for (const b of dayBlocks) {
    if (b.startMin >= clusterMaxEnd) flush();
    // Trouve la première colonne libre parmi les blocs actifs du cluster.
    const activeCols = new Set(cluster.filter(x => x.endMin > b.startMin).map(x => x._col));
    let col = 0;
    while (activeCols.has(col)) col++;
    b._col = col;
    cluster.push(b);
    clusterMaxEnd = Math.max(clusterMaxEnd, b.endMin);
  }
  flush();
}

function renderAgendaWeekly() {
  const gridEl  = document.getElementById('agenda-grid');
  const tabsEl  = document.getElementById('agenda-period-tabs');
  const navEl   = document.getElementById('agenda-week-nav');
  const abEl    = document.getElementById('agenda-ab-toggle');
  if (!gridEl) return;

  // Synchro nav exercice (label + boutons disabled), comme les autres onglets admin.
  _renderExerciceNav();

  // Si aucun demandeur récurrent, le mode "modèle de période" n'a pas de sens :
  // on force "semaine réelle" et on masque le switcher de mode.
  const recurrentMode = _currentDemSettings.some(r => r.recurrent);
  const switcherEl = document.getElementById('agenda-mode-switcher');
  if (switcherEl) switcherEl.style.display = recurrentMode ? '' : 'none';
  if (!recurrentMode) {
    agendaMode = 'realweek';
    if (!agendaWeekAnchor) agendaWeekAnchor = _agendaMondayOf(new Date());
  }

  // Boutons mode (active/inactif)
  document.getElementById('agenda-mode-model')?.classList.toggle('active', agendaMode === 'model');
  document.getElementById('agenda-mode-realweek')?.classList.toggle('active', agendaMode === 'realweek');

  // Onglets période toujours visibles (en realweek ils servent de repère + raccourci nav).
  if (tabsEl) tabsEl.style.display = '';
  if (navEl)  navEl.style.display  = (agendaMode === 'realweek') ? 'flex' : 'none';
  const legendEl = document.getElementById('agenda-legend-realweek');
  if (legendEl) legendEl.style.display = (agendaMode === 'realweek' && recurrentMode) ? 'flex' : 'none';
  // "Mode pointage" : caché en mode modèle (pas pertinent sur la vue théorique d'une période).
  // On force aussi planningQuickPointage=false en mode modèle pour éviter un état actif invisible.
  const pointageWrap = document.getElementById('agenda-quick-pointage-wrap');
  if (pointageWrap) pointageWrap.style.display = (agendaMode === 'realweek') ? '' : 'none';
  if (agendaMode !== 'realweek' && planningQuickPointage) {
    planningQuickPointage = false;
    const pointageCb = document.getElementById('agenda-quick-pointage');
    if (pointageCb) pointageCb.checked = false;
  }
  // Synchro de la checkbox "Masquer les horaires sans réservation" avec l'état global.
  const hideHoursCb = document.getElementById('agenda-hide-empty-hours');
  if (hideHoursCb) hideHoursCb.checked = !!agendaHideEmptyHours;

  // Mode semaine A/B activé pour ce service ?
  const abMode = _currentDemSettings.some(r => r.semaine_ab);
  // Toggle AB visible uniquement en mode modèle + service en mode AB. En mode realweek,
  // la semaine est déduite automatiquement de la date.
  if (abEl) abEl.style.display = (abMode && agendaMode === 'model') ? '' : 'none';
  if (abMode) {
    document.getElementById('agenda-ab-A')?.classList.toggle('active', agendaWeekAB === 'A');
    document.getElementById('agenda-ab-B')?.classList.toggle('active', agendaWeekAB === 'B');
  }

  // Détermine la période active selon le mode.
  let activePeriod = null;
  if (agendaMode === 'model') {
    // Auto-positionne sur la periode contenant aujourd'hui (mois/jour, annee ignoree),
    // tant que l'utilisateur n'a pas choisi manuellement un autre onglet periode.
    _ensureAgendaPeriodDefault();
    // Onglets périodes (même logique que planning récurrent)
    if (tabsEl) {
      tabsEl.innerHTML = PERIODS.map((p, i) => {
        if (currentExerciceId ? p.exercice_id !== currentExerciceId : p.state !== 'actif') return '';
        return `<button class="period-btn ${i === agendaPeriodIdx ? 'active' : ''}"
          style="--period-color:${p.color || '#6dceaa'}"
          onclick="_agendaSelectPeriod(${i})">
          <span class="period-badge"></span>${p.label}
        </button>`;
      }).join('');
    }
    // Recale l'index si hors exercice courant.
    if (currentExerciceId
        && PERIODS[agendaPeriodIdx]
        && PERIODS[agendaPeriodIdx].exercice_id !== currentExerciceId) {
      const fb = PERIODS.findIndex(p => p.exercice_id === currentExerciceId);
      if (fb !== -1) agendaPeriodIdx = fb;
    }
    activePeriod = PERIODS[agendaPeriodIdx] || null;
    if (!activePeriod) {
      gridEl.innerHTML = '<p class="no-booking-msg">Aucune période disponible pour cet exercice.</p>';
      return;
    }
  } else {
    // Mode semaine réelle : assure une ancre + label "Lun 18 → Dim 24 mai 2026"
    if (!agendaWeekAnchor) agendaWeekAnchor = _agendaMondayOf(new Date());
    const monday = agendaWeekAnchor;
    const sunday = _agendaAddDays(monday, 6);
    const fmt = ymd => {
      const d = new Date(ymd + 'T00:00:00');
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    };
    const lbl = document.getElementById('agenda-week-label');
    if (lbl) lbl.textContent = `${fmt(monday)} → ${fmt(sunday)}`;
    // Désactive ◀ / ▶ en mode "Masquer les horaires sans réservation" si plus aucune
    // semaine n'a de réservation dans cette direction.
    const prevBtn = document.getElementById('agenda-week-prev');
    const nextBtn = document.getElementById('agenda-week-next');
    let hasPrev = true, hasNext = true;
    if (agendaHideEmptyHours) {
      const dates = _agendaBookedSlotDates();
      hasPrev = dates.some(d => d < monday);
      hasNext = dates.some(d => d > sunday);
    }
    // Période active : si l'utilisateur a explicitement choisi un onglet, c'est la source
    // de vérité (sinon on tombe dans le piège du Monday-of(date_start) qui recule dans la
    // période précédente quand date_start est en milieu de semaine).
    const _pickedP = (_agendaPeriodUserPicked && PERIODS[agendaPeriodIdx]
      && (!currentExerciceId || PERIODS[agendaPeriodIdx].exercice_id === currentExerciceId)
      && PERIODS[agendaPeriodIdx].state === 'actif')
      ? PERIODS[agendaPeriodIdx]
      : null;
    activePeriod = _pickedP
      || _agendaPeriodCoveringDate(monday)
      || _agendaPeriodCoveringDate(_agendaAddDays(monday, 3))
      || null;
    // Synchroniser agendaPeriodIdx avec activePeriod ET verrouiller (_agendaPeriodUserPicked=true) :
    // sans ce verrou, chaque ◀/▶ re-dérive activePeriod depuis le nouveau anchor → si la
    // semaine traverse une frontière de période, l'activePeriod changerait silencieusement.
    if (activePeriod && !_pickedP) {
      const idx = PERIODS.indexOf(activePeriod);
      if (idx !== -1) {
        agendaPeriodIdx = idx;
        _agendaPeriodUserPicked = true;
      }
    }
    // Clamp ◀ ▶ aux bornes de la période active : la semaine cible doit encore intersecter la période.
    if (activePeriod && activePeriod.date_start && activePeriod.date_end) {
      const prevMonday = _agendaAddDays(monday, -7);
      const prevSunday = _agendaAddDays(prevMonday, 6);
      const nextMonday = _agendaAddDays(monday, 7);
      if (prevSunday < activePeriod.date_start) hasPrev = false;
      if (nextMonday > activePeriod.date_end)   hasNext = false;
    }
    if (prevBtn) prevBtn.disabled = !hasPrev;
    if (nextBtn) nextBtn.disabled = !hasNext;
    // Onglets période (rendus aussi en realweek) : actif = celui qui contient la semaine.
    if (tabsEl) {
      const activeIdx = activePeriod ? PERIODS.indexOf(activePeriod) : -1;
      tabsEl.innerHTML = PERIODS.map((p, i) => {
        if (currentExerciceId ? p.exercice_id !== currentExerciceId : p.state !== 'actif') return '';
        return `<button class="period-btn ${i === activeIdx ? 'active' : ''}"
          style="--period-color:${p.color || '#6dceaa'}"
          onclick="_agendaSelectPeriod(${i})">
          <span class="period-badge"></span>${p.label}
        </button>`;
      }).join('');
    }
  }

  // Plage horaire affichée : du début matin à la fin après-midi du service.
  // Si afternoon_end vide / égal à morning_end, on n'affiche que la matinée.
  const dayStart = _agendaTimeToMin(morningStart) ?? 9 * 60;
  let   dayEnd   = _agendaTimeToMin(afternoonEnd) ?? 18 * 60;
  if (dayEnd <= dayStart) dayEnd = _agendaTimeToMin(morningEnd) ?? (dayStart + 8 * 60);
  const totalMin = dayEnd - dayStart;
  const rowHeight = 17; // px par tranche de 15 min
  const rows      = Math.ceil(totalMin / 15);
  const gridHeight = rows * rowHeight;

  // Zone "pause méridienne" grisée (entre morning_end et afternoon_start).
  const lunchStart = _agendaTimeToMin(morningEnd);
  const lunchEnd   = _agendaTimeToMin(afternoonStart);
  const hasLunch = (lunchStart !== null && lunchEnd !== null && lunchEnd > lunchStart
                    && lunchStart >= dayStart && lunchEnd <= dayEnd);

  const days = _agendaActiveDays();
  if (!days.length) {
    gridEl.innerHTML = '<p class="no-booking-msg">Aucun jour actif pour ce service.</p>';
    return;
  }

  // Mode jauge actif par type de créneau (selon service_demandeur_settings.jauge).
  const gaugeRec   = _currentDemSettings.some(r => r.recurrent && r.jauge);
  const gaugePonct = _currentDemSettings.some(r => !r.recurrent && r.jauge);

  // Détermine la semaine A/B effective :
  // - mode model + abMode : valeur du toggle (agendaWeekAB)
  // - mode realweek + abMode : déduction ISO depuis la date du lundi
  // - sinon : null (aucun filtre)
  let effectiveAB = null;
  if (abMode) {
    if (agendaMode === 'realweek' && agendaWeekAnchor) {
      effectiveAB = _slotDateWeekAB(agendaWeekAnchor);
    } else {
      effectiveAB = agendaWeekAB;
    }
  }

  // Construit la liste des blocs (créneaux récurrents projetés) pour la période active.
  // Forme : { dayKey, startMin, endMin, slot, bookings[], period, kind: 'rec'|'uniq' }
  // NB : en mode "semaine réelle", on ne projette PAS les récurrents parents — leur
  // matérialisation datée (les miroirs dans SLOTS_UNIQ_FULL) suffit et évite le doublon.
  // Les créneaux sans horaires (start/end manquant) vont dans `alldayBlocks` et seront
  // rendus dans une bande "Journée entière" au-dessus de la grille horaire.
  const blocks = [];
  const alldayBlocks = [];
  if (activePeriod && agendaMode === 'model') {
    const slots = (SLOTS_REC_MAP_FULL[String(activePeriod.id)] || [])
      .filter(sl => !sl.state || sl.state === 'actif')
      // En mode AB, n'afficher que les créneaux applicables à la semaine sélectionnée.
      .filter(sl => !effectiveAB || _slotMatchesWeek(sl, effectiveAB === 'A'));
    const bookingsByKey = new Map();
    for (const b of allBookings) {
      if (parseInt(b.period_id) !== activePeriod.id) continue;
      // Filtre AB sur les bookings : une résa sans `week` (legacy) reste visible sur les deux.
      if (effectiveAB && (b.week || '') && (b.week || '') !== effectiveAB) continue;
      const k = b.slot_id + '|' + b.day_key;
      const arr = bookingsByKey.get(k);
      if (arr) arr.push(b); else bookingsByKey.set(k, [b]);
    }
    for (const sl of slots) {
      const sMin = _agendaTimeToMin(sl.start_time);
      const eMin = _agendaTimeToMin(sl.end_time);
      const isAllday = sMin === null || eMin === null || eMin <= sMin;
      for (const d of days) {
        // Filtre : si la capacité pour ce jour est 0/null, on n'affiche pas le bloc.
        const cap = getCapacity(sl.id, activePeriod.id, d.key);
        if (cap === null || cap === 0) continue;
        const bks = bookingsByKey.get(sl.id + '|' + d.key) || [];
        const blk = {
          dayKey: d.key, startMin: sMin, endMin: eMin,
          slot: sl, bookings: bks, period: activePeriod, kind: 'rec', cap
        };
        if (isAllday) alldayBlocks.push(blk); else blocks.push(blk);
      }
    }
  }

  // En mode semaine réelle, ajoute aussi les créneaux ponctuels de la semaine.
  if (agendaMode === 'realweek') {
    const monday = agendaWeekAnchor;
    const sunday = _agendaAddDays(monday, 6);
    const uniqs = (typeof SLOTS_UNIQ_FULL !== 'undefined' ? SLOTS_UNIQ_FULL : SLOTS_UNIQ)
      .filter(sl => !sl.state || sl.state === 'actif')
      .filter(sl => sl.slot_date && sl.slot_date >= monday && sl.slot_date <= sunday);
    const bookingsBySlot = new Map();
    const allUniq = (typeof allBookingsUnique !== 'undefined' ? allBookingsUnique : []);
    for (const b of allUniq) {
      const arr = bookingsBySlot.get(b.slot_id);
      if (arr) arr.push(b); else bookingsBySlot.set(b.slot_id, [b]);
    }
    for (const sl of uniqs) {
      const sMin = _agendaTimeToMin(sl.start_time);
      const eMin = _agendaTimeToMin(sl.end_time);
      const isAllday = sMin === null || eMin === null || eMin <= sMin;
      const dk = _agendaDayKeyFromYmd(sl.slot_date);
      if (!DKEYS.includes(dk)) continue;
      const blk = {
        dayKey: dk, startMin: sMin, endMin: eMin,
        slot: sl, bookings: bookingsBySlot.get(sl.id) || [],
        period: activePeriod, kind: 'uniq', cap: sl.capacity || 0
      };
      if (isAllday) alldayBlocks.push(blk); else blocks.push(blk);
    }
  }

  // Couleur du bloc : fixe (--agenda-block-color, defini en CSS) pour tous les creneaux.

  // ── Compactage horaire optionnel ─────────────────────────
  // Si "Masquer les horaires sans réservation" est coché, on construit la liste des
  // quarts d'heure occupés (au moins un bloc qui les chevauche) sur la semaine affichée,
  // et on en déduit un mapping minute -> position y compactée. La grille, les marques
  // d'heures, les lignes et les blocs utilisent ce mapping.
  // En mode normal, le mapping est identitaire (linéaire) sur [dayStart..dayEnd].
  const _hideEmpty = !!agendaHideEmptyHours;
  const _occupiedQ = new Set();
  if (_hideEmpty) {
    // Granularité d'affichage = HEURE : dès qu'un quart d'une heure est touché par un bloc
    // avec au moins une réservation, on conserve les 4 quarts de cette heure pour préserver
    // le repère visuel "heure entière".
    const _occupiedHours = new Set();
    for (const b of blocks) {
      if (!b.bookings || !b.bookings.length) continue;
      const s = Math.max(b.startMin, dayStart);
      const e = Math.min(b.endMin, dayEnd);
      if (e <= s) continue;
      for (let m = Math.floor(s / 60) * 60; m < e; m += 60) _occupiedHours.add(m);
    }
    // Étend chaque heure occupée à ses 4 quarts (en restant dans [dayStart, dayEnd]).
    for (const h of _occupiedHours) {
      for (let q = h; q < h + 60; q += 15) {
        if (q >= dayStart && q < dayEnd) _occupiedQ.add(q);
      }
    }
  }
  // Liste ordonnée des quarts visibles (val en minutes).
  // Cas particulier : la pause méridienne (si > 30 min) est limitée à 2 quarts visuels
  // (= 30 min). Les quarts au-delà de lunchStart+30 sont sautés, quel que soit le mode.
  const _quarters = [];
  const _lunchSkipFrom = (hasLunch && (lunchEnd - lunchStart) > 30) ? (lunchStart + 30) : null;
  for (let m = dayStart; m < dayEnd; m += 15) {
    if (_hideEmpty && !_occupiedQ.has(m)) continue;
    if (_lunchSkipFrom !== null && m >= _lunchSkipFrom && m < lunchEnd) continue;
    _quarters.push(m);
  }
  const _qIdx = new Map();
  _quarters.forEach((m, i) => _qIdx.set(m, i));
  const _compactRows = _quarters.length;
  // mapMinToY : convertit une minute réelle en y (px) selon le mapping (linéaire intra-quart).
  // Toujours basé sur _quarters → gère à la fois le compactage hideEmpty et celui de la pause.
  const mapMinToY = (min) => {
    const q = Math.floor(min / 15) * 15;
    const offset = (min - q) / 15; // 0..1
    if (_qIdx.has(q)) return (_qIdx.get(q) + offset) * rowHeight;
    // Quart non visible : on colle au quart visible le plus proche en amont.
    let prev = -1;
    for (const qv of _quarters) { if (qv < q) prev = _qIdx.get(qv); else break; }
    return (prev + 1) * rowHeight;
  };
  const compactGridHeight = _compactRows * rowHeight;

  // Rendu HTML.
  // Colonne 1 = heures, colonnes 2..N+1 = jours actifs.
  const cols = days.length + 1;
  // Helper : ' is-out-of-period' si le jour i doit être grisé (hors période active OU
  // jour férié français quand le service est fermé les fériés). Même classe pour la
  // cohérence visuelle (hachures + opacité).
  const _outOfPeriodCls = i => {
    if (agendaMode !== 'realweek' || !agendaWeekAnchor) return '';
    const dayYmd = _agendaAddDays(agendaWeekAnchor, i);
    if (activePeriod && activePeriod.date_start && activePeriod.date_end
        && (dayYmd < activePeriod.date_start || dayYmd > activePeriod.date_end)) {
      return ' is-out-of-period';
    }
    if (!openOnHolidays && _isFrenchHoliday(dayYmd)) return ' is-out-of-period';
    return '';
  };
  // En-tête : si mode semaine réelle, ajoute la date sous le nom du jour.
  const dayHeader = days.map((d, i) => {
    let sub = '';
    if (agendaMode === 'realweek' && agendaWeekAnchor) {
      const dayYmd = _agendaAddDays(agendaWeekAnchor, i);
      const dt = new Date(dayYmd + 'T00:00:00');
      sub = `<span class="agenda-day-sub">${dt.getDate()}/${String(dt.getMonth()+1).padStart(2,'0')}</span>`;
    }
    return `<div class="agenda-header-cell${_outOfPeriodCls(i)}">${d.label}${sub}</div>`;
  }).join('');

  // Sur chaque rupture (saut > 15 min entre deux quarts visibles consécutifs) :
  //  - on annote la fin de la plage précédente AU-DESSUS de la ligne de rupture
  //  - on annote le début de la plage suivante EN-DESSOUS de la ligne de rupture
  // Les heures "début de plage" reçoivent une classe spéciale pour être positionnées
  // sous la ligne (au lieu d'être centrées dessus).
  const _breakStartQuarters = new Set();
  if (_hideEmpty) {
    for (let i = 0; i < _quarters.length - 1; i++) {
      if (_quarters[i + 1] - _quarters[i] > 15) _breakStartQuarters.add(_quarters[i + 1]);
    }
  }
  // Marqueurs d'heure (toutes les heures pleines incluses dans la plage).
  // On saute les heures dont le quart correspondant n'est pas visible (compactage hideEmpty
  // OU pause méridienne limitée). "Fin réelle" de la grille = fin du dernier quart visible.
  // Cas particulier : la dernière heure (m === effectiveDayEnd) doit être affichée AU-DESSUS
  // de la ligne (sinon elle dépasse hors de la time-col) → style `is-break-end`.
  const effectiveDayEnd = _quarters.length
    ? _quarters[_quarters.length - 1] + 15
    : dayEnd;
  const hourMarks = [];
  let _isFirstHourMark = true;
  for (let m = Math.ceil(dayStart / 60) * 60; m <= effectiveDayEnd; m += 60) {
    if (m < dayStart || m > effectiveDayEnd) continue;
    if (m < effectiveDayEnd && !_qIdx.has(m)) continue;
    const top = mapMinToY(m);
    let cls = 'agenda-time-mark';
    if (m === effectiveDayEnd) cls += ' is-break-end';
    // Premier marqueur de la grille : placé sous la ligne (sinon il déborde au-dessus
    // du conteneur). Même règle que les débuts de plage après rupture.
    else if (_isFirstHourMark || _breakStartQuarters.has(m)) cls += ' is-break-start';
    hourMarks.push(`<div class="${cls}" style="top:${top}px">${_agendaMinToLabel(m)}</div>`);
    _isFirstHourMark = false;
  }
  // Marqueurs "fin de plage précédente" placés au-dessus de chaque ligne de rupture.
  if (_hideEmpty) {
    for (let i = 0; i < _quarters.length - 1; i++) {
      if (_quarters[i + 1] - _quarters[i] > 15) {
        const endOfPlage = _quarters[i] + 15;
        const yBreak = mapMinToY(endOfPlage);
        hourMarks.push(`<div class="agenda-time-mark is-break-end" style="top:${yBreak}px">${_agendaMinToLabel(endOfPlage)}</div>`);
      }
    }
  }

  // Lignes de grille (toutes les 15 min — épaisses sur l'heure pleine).
  // On n'affiche que les lignes des quarts visibles (compactage hideEmpty + pause méridienne).
  const gridLines = [];
  for (let m = dayStart; m <= dayEnd; m += 15) {
    if (m < dayEnd && !_qIdx.has(m)) continue;
    const top = mapMinToY(m);
    const cls = (m % 60 === 0) ? 'agenda-grid-line is-hour' : 'agenda-grid-line';
    gridLines.push(`<div class="${cls}" style="top:${top}px"></div>`);
  }

  // Bandeau pause méridienne (si applicable).
  // En mode compact, on recalcule top/height à partir du mapping ; si la pause tombe
  // entièrement dans une zone masquée, le bandeau disparaît (height ≤ 0).
  let lunchBand = '';
  if (hasLunch) {
    const ltop = mapMinToY(lunchStart);
    const lh = mapMinToY(lunchEnd) - ltop;
    if (lh > 0) lunchBand = `<div class="agenda-lunch-band" style="top:${ltop}px;height:${lh}px"></div>`;
  }

  // Helper : produit le HTML d'un bloc admin (timed ou allday) à partir de ses bookings.
  // - isAlldayBlock=true → bloc rendu en flow normal (pas de positionnement absolu)
  //   dans la bande "journée entière" au-dessus de la grille horaire
  // - isAlldayBlock=false → bloc positionné en absolu sur la grille horaire
  const _renderAgendaAdminBlock = (b, isAlldayBlock = false) => {
    let positionStyle = '';
    let timeLabel;
    let height;
    if (isAlldayBlock) {
      positionStyle = '';
      timeLabel = 'Journée entière';
      // height "virtuelle" pour le seuil chips : 50px (= hauteur de la bande all-day)
      height = 50;
    } else {
      const s = Math.max(b.startMin, dayStart);
      const e = Math.min(b.endMin, dayEnd);
      if (e <= s) return '';
      // 2 px de gap en haut et en bas pour matcher le padding vertical de
      // .agenda-allday-cell qui encadre les blocs journée entière. En mode compact,
      // top/height sont calculés via le mapping mapMinToY (les quarts vides sont sautés).
      const ys = mapMinToY(s);
      const ye = mapMinToY(e);
      const top = ys + 2;
      height = Math.max(0, ye - ys - 4);
      const colCount = b.colCount || 1;
      const col = b._col || 0;
      const widthPct = 100 / colCount;
      const leftPct  = col * widthPct;
      positionStyle = `top:${top}px;height:${height}px;left:calc(${leftPct}% + 3px);width:calc(${widthPct}% - 6px)`;
      timeLabel = `${_agendaMinToLabel(b.startMin)} – ${_agendaMinToLabel(b.endMin)}`;
    }

    const isUniq    = b.kind === 'uniq';
    // Un créneau "miroir" est matérialisé à partir d'un créneau récurrent parent
    // (parent_slot_id présent). En mode realweek il apparaît comme uniq, mais il
    // hérite du mode jauge du parent récurrent (gaugeRec), pas du mode ponctuel.
    const isMirror = isUniq && !!b.slot.parent_slot_id;
    const taken = b.bookings.length;
    const total = b.cap;
    // Mode jauge : compteur = somme enfants+accompagnants ; sinon = nombre de résa.
    const gaugeActive = (isUniq && !isMirror) ? gaugePonct : gaugeRec;
    const gaugeSum = gaugeActive
      ? b.bookings.reduce((s, bk) => s + (parseInt(bk.enfants)||0) + (parseInt(bk.accompagnants)||0), 0)
      : 0;
    const ratio = total > 0
      ? (gaugeActive ? gaugeSum / total : taken / total)
      : 0;
    // La couleur du bloc ne s'adapte plus au remplissage / à la jauge — accent
    // jaune par défaut pour tous les créneaux. Le compteur en bas-gauche et les
    // chips suffisent à indiquer l'état de remplissage.
    const fullCls   = '';
    const kindCls   = (isUniq && !isMirror) ? 'is-uniq' : 'is-rec';
    const alldayCls = isAlldayBlock ? ' is-allday' : '';
    const longCls   = (!isAlldayBlock && (b.endMin - b.startMin) > 60) ? ' is-long' : '';
    const metaCount = gaugeActive ? gaugeSum : taken;
    const totalLbl  = total === 0 ? '∞' : total;
    // Créneau court (≤ 30 min, hors journée entière) : pas assez de place pour le
    // compteur jauge / X/Y → on masque le bandeau meta.
    const shortBlock = !isAlldayBlock && (b.endMin - b.startMin) <= 30;
    // En mode jauge : mini-barre de remplissage + texte X/Y (comme _renderCsmCapInfo).
    // Sinon : juste le texte X/Y comme avant.
    let metaHtml;
    if (shortBlock) {
      metaHtml = '';
    } else if (gaugeActive && total > 0) {
      const pct = Math.min(100, Math.round(gaugeSum / total * 100));
      const gColor = pct >= 100 ? 'var(--danger)' : pct >= 70 ? '#e8a45a' : 'var(--accent)';
      metaHtml = `<div class="agenda-block-meta is-gauge" style="color:${gColor}">
        <span>Jauge</span>
        <span class="agenda-block-gauge-bar"><span style="width:${pct}%;background:${gColor}"></span></span>
        <span>${gaugeSum}/${totalLbl}</span>
      </div>`;
    } else {
      metaHtml = `<div class="agenda-block-meta">${metaCount}/${totalLbl}</div>`;
    }
    const tooltip = `${timeLabel}\n${taken}/${total} réservation${taken > 1 ? 's' : ''}`
      + (gaugeActive ? `\nJauge ${gaugeSum}/${total}` : '')
      + (isUniq ? '\n(créneau ponctuel)' : '');

    // Coordonnées du bloc pour les handlers (cellule = slot+jour ; semaine pour récurrent).
    const dropPid   = isUniq ? '' : b.period.id;
    const dropSid   = b.slot.id;
    const dropDk    = isUniq ? '' : b.dayKey;
    const dropWk    = isUniq ? '' : (effectiveAB || '');
    const dragType  = isUniq ? 'unique' : 'recurring';

    // Affichage des badges si le bloc est assez haut. Sinon, on garde juste le compteur.
    const minHeightForChips = 28;
    const showChips = height >= minHeightForChips && taken > 0;
    let chipsHtml = '';
    if (showChips) {
      // Helper de rendu d'un badge identique au planning (mêmes handlers).
      const _renderBadge = (bk) => {
        const isCut = _ctxCutData && !_ctxCutData.isCopy && _ctxCutData.id == bk.id;
        // Badge pointé → verrouillé : pas de croix, pas de drag (cohérent avec planning ponctuel).
        const isLocked = !!bk.pointage;
        // Sécurité validation : pas de croix de suppression sur une réservation validée
        // quand le service est en validation bloquante ET le mode validation ON.
        // (la suppression reste possible via le menu contextuel pour les actions volontaires.)
        const noCloseBtn = isLocked
          || (!!validationMode && bk.validated == 1 && !!validationBloquante);
        const dragArgs = isUniq
          ? `${bk.id},'unique','${dropSid}','',''`
          : `${bk.id},'recurring','${dropSid}',${dropPid},'${dropDk}','${dropWk}'`;
        const ctxObj = isUniq
          ? { id: bk.id, email: bk.email, slotId: dropSid, type: 'unique', pointage: bk.pointage || '', recurringBookingId: bk.recurring_booking_id || 0 }
          : { id: bk.id, email: bk.email, periodId: dropPid, slotId: dropSid, dayKey: dropDk, type: 'recurring', week: dropWk };
        const ctxStr = JSON.stringify(ctxObj).replace(/"/g, '&quot;');
        const themeAccent = (bk.validated == 1 ? BADGE_COLOR_VALIDATED : BADGE_COLOR_PENDING).accent;
        const primaryLabel = bk.structure_label || bk.demandeur_label || ((bk.nom || '') + ' ' + (bk.prenom || ''));
        const secondaryLabel = (bk.structure_label || bk.demandeur_label) ? ((bk.nom || '') + ' ' + (bk.prenom || '')) : (bk.niveau || '');
        return `<div class="planning-name-tag ${bk.validated == 1 ? 'is-validated' : 'is-pending'}${isCut ? ' is-cut' : ''}${isLocked ? ' is-locked' : ''}" data-bid="${bk.id}" style="${_badgeStyle(bk)}" title="${_badgeTitle(bk)}"
          draggable="${isLocked ? 'false' : 'true'}"
          ${isLocked ? '' : `ondragstart="event.stopPropagation();_onDragStart(event,${dragArgs})" ondragend="_onDragEnd(event)"`}
          onclick="event.stopPropagation();openBadgeDetail(event,${bk.id},'${dragType}')"
          oncontextmenu="event.stopPropagation();showBadgeCtx(event,${ctxStr})">
          ${_badgeIndicators(bk)}
          ${noCloseBtn ? '' : `<span class="planning-name-tag-close" onmousedown="event.stopPropagation();event.preventDefault()" onclick="_quickDeleteBadge(event,${bk.id},'${dragType}')" title="Supprimer">×</span>`}
          <span style="font-weight:700">${primaryLabel}</span>
          <span style="font-size:.65rem;color:var(--muted)">${secondaryLabel}</span>
          ${themeMode && bk.theme_label ? `<span style="font-size:.62rem;color:${themeAccent};font-weight:600">${bk.theme_label}</span>` : ''}
        </div>`;
      };

      if (taken === 1) {
        chipsHtml = `<div class="agenda-block-chips">${_renderBadge(b.bookings[0])}</div>`;
      } else {
        const _front = b.bookings[0];
        const _back  = b.bookings[1];
        const _back2 = b.bookings[2] || null;
        chipsHtml = `<div class="agenda-block-chips">
          <div class="planning-stack-wrap" onclick="event.stopPropagation();openCellStackModal(event,'${dropPid}','${dropSid}','${dropDk}','${dropWk}')" title="${taken} réservations — cliquer pour voir la liste">
            ${_back2 ? `<div class="stack-back2">${_renderBadge(_back2)}</div>` : ''}
            <div class="stack-back">${_renderBadge(_back)}</div>
            <div class="stack-front">${_renderBadge(_front)}</div>
            <span class="planning-stack-count">${taken}</span>
          </div>
        </div>`;
      }
    }

    const blockClickFn = `openCellCreate(event,'${dropPid}','${dropSid}','${dropDk}','${dropWk}')`;

    return `<div class="agenda-block ${kindCls}${alldayCls}${longCls} ${fullCls}"
      style="${positionStyle}"
      title="${tooltip.replace(/"/g, '&quot;')}"
      onclick="${blockClickFn}"
      oncontextmenu="showCellCtx(event,'${dropPid}','${dropSid}','${dropDk}','${dropWk}')"
      ondragover="_onDragOver(event)"
      ondragenter="_onDragEnter(event,'${dropPid}','${dropSid}','${dropDk}')"
      ondragleave="_onDragLeave(event)"
      ondrop="_onDrop(event,'${dropPid}','${dropSid}','${dropDk}','${dropWk}')">
      ${chipsHtml}
      ${metaHtml}
    </div>`;
  };

  // Pour chaque jour, génère ses blocs avec layout multi-colonnes pour les chevauchements.
  const dayCols = days.map((d, i) => {
    // En mode "masquer les horaires sans réservation", on retire aussi les créneaux vides
    // (sans booking) pour éviter qu'ils n'apparaissent collés/écrasés sur la grille compactée.
    const dayBlocks = blocks.filter(b => b.dayKey === d.key && (!_hideEmpty || (b.bookings && b.bookings.length)));
    _agendaLayoutOverlaps(dayBlocks);
    const blocksHtml = dayBlocks.map(b => _renderAgendaAdminBlock(b, false)).join('');
    return `<div class="agenda-day-col${_outOfPeriodCls(i)}" data-day="${d.key}" style="height:${compactGridHeight}px">
      ${gridLines.join('')}
      ${lunchBand}
      ${blocksHtml}
    </div>`;
  }).join('');

  // Bande "Journée entière" — créneaux sans horaires, empilés dans une ligne dédiée.
  // En mode "masquer les horaires sans réservation", on retire les blocs journée entière
  // sans booking (la bande disparaît entièrement si tous les blocs allday sont vides).
  const _visibleAllday = _hideEmpty
    ? alldayBlocks.filter(b => b.bookings && b.bookings.length)
    : alldayBlocks;
  const hasAllday = _visibleAllday.length > 0;
  let alldayRow = '';
  if (hasAllday) {
    const alldayCells = days.map((d, i) => {
      const cells = _visibleAllday.filter(b => b.dayKey === d.key);
      const cellsHtml = cells.map(b => _renderAgendaAdminBlock(b, true)).join('');
      return `<div class="agenda-allday-cell${_outOfPeriodCls(i)}" data-day="${d.key}">${cellsHtml}</div>`;
    }).join('');
    alldayRow = `<div class="agenda-header-cell agenda-allday-corner" title="Journée entière">Journée entière</div>${alldayCells}`;
  }

  // En mode semaine reelle + service en mode AB, on indique dans le coin haut-gauche
  // la lettre (A ou B) deduite automatiquement de la date du lundi affiche.
  const cornerAB = (abMode && agendaMode === 'realweek' && effectiveAB) ? effectiveAB : '';
  const headerRow = `<div class="agenda-header-cell agenda-corner">${cornerAB}</div>${dayHeader}`;
  const bodyRow = `
    <div class="agenda-time-col" style="height:${compactGridHeight}px">
      ${hourMarks.join('')}
    </div>
    ${dayCols}`;

  // Pas de message "Aucun créneau" si l'option "Masquer les horaires sans réservation"
  // est active : c'est ce filtre qui a vidé la vue, l'utilisateur sait pourquoi.
  const emptyMsg = (!blocks.length && !alldayBlocks.length && !_hideEmpty)
    ? `<div class="agenda-empty-overlay">Aucun créneau à afficher pour cette ${agendaMode === 'model' ? 'période' : 'semaine'}.</div>`
    : '';

  gridEl.innerHTML = `
    <div class="agenda-wrap">
      <div class="agenda-grid" style="grid-template-columns: 44px repeat(${days.length}, 1fr)">
        ${headerRow}
        ${alldayRow}
        ${bodyRow}
      </div>
      ${emptyMsg}
    </div>`;
}

// ── Context menu planning ─────────────────────────────────
let _ctxBookingData = null;

function _ctxHide() {
  document.getElementById('badge-ctx-menu').style.display = 'none';
  document.getElementById('ctx-overlay').style.display = 'none';
}

function _showCtxAt(event) {
  document.getElementById('ctx-overlay').style.display = 'block';
  const menu = document.getElementById('badge-ctx-menu');
  menu.style.display = 'block';
  const mx = Math.min(event.clientX, window.innerWidth  - 190);
  const my = Math.min(event.clientY, window.innerHeight - 220);
  menu.style.left = mx + 'px';
  menu.style.top  = my + 'px';
}

function showBadgeCtx(event, data) {
  event.preventDefault();
  event.stopPropagation();
  _ctxBookingData = typeof data === 'string' ? JSON.parse(data) : data;
  _ctxCellData    = null;
  const isUnique  = _ctxBookingData.type === 'unique';
  const isLocked  = isUnique && !!(_ctxBookingData.pointage || _ctxBookingData.recurringBookingId);
  document.getElementById('ctx-btn-cut').style.display        = isLocked ? 'none' : '';
  document.getElementById('ctx-btn-copy').style.display       = '';
  document.getElementById('ctx-btn-delete').style.display     = isLocked ? 'none' : '';
  const isMgr = isManagerUser();
  document.getElementById('ctx-sep-pointage').style.display   = isUnique && isMgr ? '' : 'none';
  document.getElementById('ctx-btn-present').style.display    = isUnique && isMgr ? '' : 'none';
  document.getElementById('ctx-btn-absent').style.display     = isUnique && isMgr ? '' : 'none';
  document.getElementById('ctx-btn-pointage-clear').style.display = isUnique && isMgr ? '' : 'none';
  document.getElementById('ctx-sep-cell').style.display       = _ctxCutData ? '' : 'none';
  document.getElementById('ctx-btn-create').style.display     = 'none';
  const pasteBtn = document.getElementById('ctx-btn-paste');
  pasteBtn.style.display  = _ctxCutData ? '' : 'none';
  _showCtxAt(event);
}

function showCellCtx(event, periodId, slotId, dayKey, week = '') {
  event.preventDefault();
  _ctxBookingData = null;
  _ctxCellData    = { periodId, slotId, dayKey, week };
  document.getElementById('ctx-btn-cut').style.display              = 'none';
  document.getElementById('ctx-btn-copy').style.display             = 'none';
  document.getElementById('ctx-btn-delete').style.display           = 'none';
  document.getElementById('ctx-sep-pointage').style.display         = 'none';
  document.getElementById('ctx-btn-present').style.display          = 'none';
  document.getElementById('ctx-btn-absent').style.display           = 'none';
  document.getElementById('ctx-btn-pointage-clear').style.display   = 'none';
  document.getElementById('ctx-sep-cell').style.display             = 'none';
  const isMirrorSlot = SLOTS_UNIQ.some(s => s.id == slotId && s.parent_slot_id);
  document.getElementById('ctx-btn-create').style.display     = isMirrorSlot ? 'none' : '';
  const pasteBtn = document.getElementById('ctx-btn-paste');
  pasteBtn.style.display   = '';
  pasteBtn.disabled        = !_ctxCutData;
  _showCtxAt(event);
}

async function _ctxValidate() {
  if (!_ctxBookingData) return;
  if (_ctxBookingData.pointage || _ctxBookingData.recurringBookingId) { _ctxHide(); showToast('⚠️ Impossible de modifier la validation de cette réservation'); return; }
  _ctxHide();
  const r = await apiPost('/bookings.php?action=validate', { id: _ctxBookingData.id, type: _ctxBookingData.type || 'recurring', validated: 1 });
  if (r.ok) {
    showToast('✅ Réservation validée');
    await loadAdminData();
    _rerenderActiveAdminView();
    if (document.getElementById('cell-stack-modal')?.classList.contains('open')) _renderCellStackModal();
  }
}

async function _ctxPointage(value) {
  if (!_ctxBookingData) return;
  _ctxHide();
  const r = await apiPost('/bookings.php?action=pointage', { id: _ctxBookingData.id, value: value ?? '' });
  if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  const bk = allBookingsUnique.find(b => b.id == _ctxBookingData.id);
  if (bk) bk.pointage = value || null;
  // Rerendre la vue admin active (planning OU agenda) — le pointage doit se
  // refléter immédiatement dans la vue où l'utilisateur l'a déclenché.
  _rerenderActiveAdminView();
  // Idem dans la modale cell-stack si elle est ouverte (l'utilisateur déclenche
  // souvent le pointage depuis cette modale, l'indicateur P/A doit s'y refléter).
  if (document.getElementById('cell-stack-modal')?.classList.contains('open')) _renderCellStackModal();
  showToast(value === 'present' ? '✅ Pointé Présent' : value === 'absent' ? '❌ Pointé Absent' : '— Pointage effacé');
}

async function _ctxDelete() {
  if (!_ctxBookingData) return;
  if (_ctxBookingData.pointage || _ctxBookingData.recurringBookingId) { _ctxHide(); showToast('⚠️ Impossible de supprimer cette réservation'); return; }
  _ctxHide();
  const id   = _ctxBookingData.id;
  const type = _ctxBookingData.type || 'recurring';
  if (!await askDeleteBooking(id, type)) return;
  const r = await apiPost('/bookings.php?action=cancel', { id, type });
  if (r.ok) { showToast('🗑️ Réservation supprimée'); await loadAdminData(); _rerenderActiveAdminView(); await loadServerCounts(); }
}

// Suppression rapide d'un badge planning via la croix × (même action que le menu contextuel).
// Rerendere la vue admin active (planning ou agenda) après une mutation de booking.
// renderPlanningTab() reste appelée pour rafraîchir le planning même quand on est sur
// l'agenda, car certaines structures partagées (cell stack modal, etc.) y sont sychronisées.
function _rerenderActiveAdminView() {
  // Les onglets "Planning récurrent" / "Planning" ont été supprimés : l'agenda est le seul
  // rendu admin à rafraîchir après une action (validation, suppression, création, etc.).
  if (_lastServiceTab === 'agenda') renderAgendaWeekly();
}

async function _quickDeleteBadge(ev, id, type) {
  ev.stopPropagation(); ev.preventDefault();
  if (!await askDeleteBooking(id, type)) return;
  const r = await apiPost('/bookings.php?action=cancel', { id, type });
  if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  showToast('🗑️ Réservation supprimée');
  await loadAdminData();
  _rerenderActiveAdminView();
  await loadServerCounts();
}

function _ctxCut() {
  if (!_ctxBookingData) return;
  _ctxHide();
  _ctxCutData = { ..._ctxBookingData };
  _rerenderActiveAdminView(); // re-render pour afficher l'état coupé
  if (document.getElementById('cell-stack-modal')?.classList.contains('open')) _renderCellStackModal();
  showToast('✂️ Réservation coupée — clic droit sur la cellule cible pour coller');
}

async function _ctxPaste() {
  if (!_ctxCutData || !_ctxCellData) return;
  _ctxHide();
  const isCopy  = !!_ctxCutData.isCopy;
  const action  = isCopy ? 'duplicate' : 'move';
  const r = await apiPost(`/bookings.php?action=${action}`, {
    id: _ctxCutData.id, type: _ctxCutData.type || 'recurring',
    service_id: currentServiceId,
    slot_id: _ctxCellData.slotId, period_id: _ctxCellData.periodId, day_key: _ctxCellData.dayKey,
    week: _ctxCellData.week || '',
  });
  if (r.ok) {
    showToast(isCopy ? '📋 Réservation dupliquée' : '📌 Réservation déplacée');
    if (!isCopy) _ctxCutData = null; // copie : on garde le presse-papier
    await loadAdminData(); _rerenderActiveAdminView();
    if (document.getElementById('cell-stack-modal')?.classList.contains('open')) _renderCellStackModal();
  } else { showToast('⚠️ ' + (r.error || 'Erreur')); }
}

async function _ctxEditTheme() {
  if (!_ctxBookingData) return;
  _ctxHide();
  const bk = allBookings.find(b => b.id == _ctxBookingData.id);
  const newTheme = prompt('Modifier le thème :', bk?.theme_label || '');
  if (newTheme === null) return;
  const r = await apiPost('/bookings.php?action=update_theme', { id: _ctxBookingData.id, type: _ctxBookingData.type || 'recurring', theme_label: newTheme.trim() });
  if (r.ok) { showToast('✅ Thème mis à jour'); await loadAdminData(); _rerenderActiveAdminView(); }
}

function _ctxCopy() {
  if (!_ctxBookingData) return;
  _ctxCutData = { ..._ctxBookingData, isCopy: true };
  _ctxHide();
  showToast('📋 Réservation copiée — clic droit sur la cellule cible pour coller');
}

function _ctxCreate() { _ctxHide(); openPlanningCreateModal(); }

// ── Fiche réservation (clic sur badge) ───────────────────
async function _quickValidate(bk, type = 'unique') {
  const newVal = bk.validated == 1 ? 0 : 1;
  const r = await apiPost('/bookings.php?action=validate', { id: bk.id, type, validated: newVal });
  if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  // Recharger depuis le serveur : valider un récurrent propage aussi aux miroirs (cf.
  // api/bookings.php), donc allBookingsUnique doit être resynchronisé pour que la vue
  // "semaine réelle" reflète la nouvelle valeur sur les instances datées.
  await loadAdminData();
  _rerenderActiveAdminView();
  if (document.getElementById('cell-stack-modal')?.classList.contains('open')) _renderCellStackModal();
}

async function _quickPointage(bk) {
  const next = bk.pointage === null || !bk.pointage ? 'present' : bk.pointage === 'present' ? 'absent' : null;
  const r = await apiPost('/bookings.php?action=pointage', { id: bk.id, value: next ?? '' });
  if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  bk.pointage = next;
  _rerenderActiveAdminView();
  // Idem en modale cell-stack si ouverte (clic rapide sur badge depuis la modale).
  if (document.getElementById('cell-stack-modal')?.classList.contains('open')) _renderCellStackModal();
}

function openBadgeDetail(event, bookingId, type) {
  event.stopPropagation();
  if (type === 'unique') {
    const bk = allBookingsUnique.find(b => b.id == bookingId);
    if (bk && planningQuickValidate) {
      if (bk.recurring_booking_id) {
        showToast('Il s\'agit d\'une réservation récurrente : vous pouvez la valider globalement sur le planning récurrent.', 4500, { warn: true });
        return;
      }
      if (bk.pointage) {
        showToast('Cette réservation a déjà été pointée : vous ne pouvez plus la modifier.', 4500, { warn: true });
        return;
      }
      _quickValidate(bk);
      return;
    }
    if (bk && planningQuickPointage && isManagerUser()) {
      _quickPointage(bk); return;
    }
  }
  if (type === 'recurring') {
    const bk = allBookings.find(b => b.id == bookingId);
    if (bk && planningQuickValidate) { _quickValidate(bk, 'recurring'); return; }
  }
  const pool = type === 'unique' ? allBookingsUnique : allBookings;
  const bk   = pool.find(b => b.id == bookingId);
  if (!bk) return;

  _detailBookingId   = bookingId;
  _detailBookingType = type;

  // ── Titre = créneau ─────────────────────────────────────
  // récurrent : "📋 Réservation : T3 — Avril - Juin, mardi 09:00 - 11:00"
  // ponctuel  : "📋 Réservation : lundi 18 mai 2026, 11:00 - 12:00"
  let suffix = '';
  if (type === 'recurring') {
    const _recPool = SLOTS_REC_FULL.length ? SLOTS_REC_FULL : SLOTS_REC;
    const sl       = _recPool.find(s => s.id === bk.slot_id) || {};
    const trim     = PERIODS.find(p => p.id === parseInt(bk.period_id)) || {};
    const dayIdx   = ALL_DKEYS.indexOf(bk.day_key);
    const dayLbl   = dayIdx >= 0 ? (ALL_DAYS[dayIdx] || '').toLowerCase() : '';
    const dayPart  = [dayLbl, _fmtSlotHoursFr(sl.start_time, sl.end_time)].filter(Boolean).join(' ');
    const trimPart = [trim.etiquette || '', trim.label || ''].filter(Boolean).join(' — ');
    suffix = [trimPart, dayPart].filter(Boolean).join(', ');
  } else {
    const _uniqPool = SLOTS_UNIQ_FULL.length ? SLOTS_UNIQ_FULL : SLOTS_UNIQ;
    const sl = _uniqPool.find(s => s.id === bk.slot_id) || {};
    const times = _fmtSlotHoursFr(sl.start_time, sl.end_time);
    if (sl.slot_date) {
      const d = new Date(sl.slot_date + 'T12:00:00');
      const dateStr = `${d.toLocaleDateString('fr-FR', { weekday: 'long' })} `
                    + `${d.toLocaleDateString('fr-FR', { day: 'numeric' })} `
                    + `${d.toLocaleDateString('fr-FR', { month: 'long' })} `
                    + `${d.getFullYear()}`;
      suffix = [dateStr, times].filter(Boolean).join(', ');
    } else {
      suffix = times;
    }
  }
  document.getElementById('bdet-title').textContent = '📋 Réservation' + (suffix ? ' : ' + suffix : '');

  // ── Affichage seul : Structure (à défaut, Type de demandeur) ──
  const strField = document.getElementById('bdet-structure-field');
  const strLbl   = document.getElementById('bdet-structure-label');
  const strVal   = document.getElementById('bdet-structure-value');
  if (bk.structure_label) {
    strField.style.display = '';
    strLbl.textContent = 'Structure';
    strVal.textContent = bk.structure_label;
  } else if (bk.demandeur_label) {
    strField.style.display = '';
    strLbl.textContent = 'Type de demandeur';
    strVal.textContent = bk.demandeur_label;
  } else {
    strField.style.display = 'none';
  }

  // ── Affichage seul : Demandeur (NOM Prénom) ──
  document.getElementById('bdet-demandeur-value').textContent =
    `${(bk.nom || '').toUpperCase()} ${bk.prenom || ''}`.trim() || '—';

  // ── Modifiable : participants ──
  _bdetInitEnfants       = bk.enfants       != null && bk.enfants       !== '' ? parseInt(bk.enfants, 10)       || 0 : 0;
  _bdetInitAccompagnants = bk.accompagnants != null && bk.accompagnants !== '' ? parseInt(bk.accompagnants, 10) || 0 : 0;
  document.getElementById('bdet-enfants').value       = _bdetInitEnfants;
  document.getElementById('bdet-accompagnants').value = _bdetInitAccompagnants;
  _bdetUpdateLabels();

  // ── Modifiable : thème (uniquement si le demandeur de la résa a `themes`=1) ──
  // Selon le mode du service : 'libre' = saisie texte libre, 'liste' = menu déroulant
  // peuplé depuis _currentServiceThemesList (avec valeur courante ajoutée si absente,
  // pour rester cohérent même si la liste a évolué).
  const _demSetting = (bk.demandeur_id != null)
    ? _currentDemSettings.find(r => parseInt(r.demandeur_id) === parseInt(bk.demandeur_id))
    : null;
  _bdetThemeShown = !!(_demSetting && _demSetting.themes);
  const themeField  = document.getElementById('bdet-theme-field');
  const themeInput  = document.getElementById('bdet-theme-input');
  const themeSelect = document.getElementById('bdet-theme-select');
  if (_bdetThemeShown) {
    themeField.style.display = '';
    _bdetInitTheme = bk.theme_label || '';
    if (_currentServiceThemesMode === 'liste') {
      // Mode liste → dropdown
      themeInput.style.display  = 'none';
      themeSelect.style.display = '';
      const list = (_currentServiceThemesList || []).slice();
      if (_bdetInitTheme && !list.includes(_bdetInitTheme)) list.push(_bdetInitTheme);
      themeSelect.innerHTML = `<option value="">— Aucun —</option>`
        + list.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
      themeSelect.value = _bdetInitTheme;
      themeInput.value  = '';
    } else {
      // Mode libre → saisie texte
      themeSelect.style.display = 'none';
      themeInput.style.display  = '';
      themeInput.value  = _bdetInitTheme;
      themeSelect.value = '';
    }
  } else {
    themeField.style.display  = 'none';
    themeInput.style.display  = 'none';
    themeSelect.style.display = 'none';
    _bdetInitTheme   = '';
    themeInput.value = '';
    themeSelect.value = '';
  }

  _bdetCheckDirty();

  const lockEdit = (type === 'unique' && (bk.pointage || bk.recurring_booking_id));
  document.getElementById('bdet-enfants').disabled       = lockEdit;
  document.getElementById('bdet-accompagnants').disabled = lockEdit;
  themeInput.disabled  = lockEdit;
  themeSelect.disabled = lockEdit;
  document.getElementById('bdet-save-btn').style.display    = lockEdit ? 'none' : '';
  document.getElementById('bdet-cancel-btn').style.display  = lockEdit ? 'none' : (_bdetIsDirty() ? '' : 'none');

  // ── Liste des dates des bookings effectifs (uniquement en récurrent) ──
  // Source : enfants ponctuels créés pour cette résa récurrente (parent_booking_id).
  const _occField = document.getElementById('bdet-occurrences-field');
  const _occList  = document.getElementById('bdet-occurrences-list');
  if (type === 'recurring') {
    const _period = PERIODS.find(p => p.id === parseInt(bk.period_id)) || null;
    const _recPool2 = SLOTS_REC_FULL.length ? SLOTS_REC_FULL : SLOTS_REC;
    const _slot = _recPool2.find(s => s.id === bk.slot_id) || null;
    const _dates = _bookingDatesForRecurring(bk.id);
    if (_dates.length) {
      _occList.innerHTML = _renderOccurrencesList(_period, _slot, _dates);
      _occField.style.display = '';
    } else {
      _occField.style.display = 'none';
    }
  } else {
    _occField.style.display = 'none';
  }

  document.getElementById('booking-detail-modal').classList.add('open');
}

function closeBadgeDetail() {
  document.getElementById('booking-detail-modal').classList.remove('open');
}

let _cellStackCoords = null;
function openCellStackModal(event, periodId, slotId, dayKey, week = '') {
  if (event) event.stopPropagation();
  _cellStackCoords = { periodId, slotId, dayKey, week };
  if (!_renderCellStackModal()) return;
  // Synchroniser les cases "Mode validation" et "Mode pointage" avec l'état global.
  const cbV = document.getElementById('csm-quick-validate');
  if (cbV) cbV.checked = !!planningQuickValidate;
  const cbP = document.getElementById('csm-quick-pointage');
  if (cbP) cbP.checked = !!planningQuickPointage;
  // "Mode pointage" n'a de sens que sur les ponctuels / miroirs datés (= isUniq).
  // En contexte récurrent (planning rec ou agenda mode "Modèle de période"), on cache la
  // checkbox et on force planningQuickPointage=false pour éviter un état actif invisible.
  const isUniqCtx = !periodId || periodId === '' || periodId === 0 || periodId === '0';
  const wrapP = document.getElementById('csm-quick-pointage-wrap');
  if (wrapP) wrapP.style.display = isUniqCtx ? '' : 'none';
  if (!isUniqCtx && planningQuickPointage) {
    planningQuickPointage = false;
    if (cbP) cbP.checked = false;
    _syncQuickPointageCheckboxes();
  }
  document.getElementById('cell-stack-modal').classList.add('open');
}
function _renderCellStackModal() {
  if (!_cellStackCoords) return false;
  const { periodId, slotId, dayKey, week } = _cellStackCoords;
  // Détection du cas ponctuel : periodId vide (transmis depuis l'agenda en mode semaine
  // réelle sur un créneau ponctuel, ou depuis le planning ponctuel).
  const isUniq = !periodId || periodId === '' || periodId === 0 || periodId === '0';
  // Un slot ponctuel avec parent_slot_id est un miroir (instance datée d'un récurrent) :
  // on le visualise comme un récurrent (couleur jaune) plutôt que comme un ponctuel pur.
  const _slotUniq = isUniq ? (SLOTS_UNIQ || []).find(s => s.id === slotId) : null;
  const isMirror  = !!(_slotUniq && _slotUniq.parent_slot_id);
  const _wk = week || '';
  const bks = isUniq
    ? (allBookingsUnique || []).filter(b => b.slot_id === slotId)
    : allBookings.filter(b => parseInt(b.period_id) === parseInt(periodId) && b.slot_id === slotId && b.day_key === dayKey
        && (!_wk || !(b.week || '') || (b.week || '') === _wk));
  if (!bks.length) { closeCellStackModal(); return false; }
  const badgeType = isUniq ? 'unique' : 'recurring';
  // Couleur du bloc créneau : jaune (récurrent / miroir) ou vert lime (ponctuel pur).
  const slotBlockEl = document.getElementById('csm-slot-block');
  if (slotBlockEl) slotBlockEl.classList.toggle('is-uniq', isUniq && !isMirror);
  // Titre = pill avec le style natif de .period-btn.active.
  // - Récurrent : label de la période ("Avril - Juin")
  // - Ponctuel  : date du créneau (capitalisée) ("Lundi 5 mai 2026")
  const periodLabelEl = document.getElementById('cell-stack-period-label');
  // Sous-titre : (Semaine A/B si abMode) + jour + créneau (récurrent) ; juste horaire (ponctuel)
  const subEl = document.getElementById('cell-stack-subtitle');
  if (isUniq) {
    const sl = (SLOTS_UNIQ_FULL.length ? SLOTS_UNIQ_FULL : SLOTS_UNIQ).find(s => s.id === slotId) || {};
    if (periodLabelEl) periodLabelEl.textContent = sl.slot_date ? fmtDate(sl.slot_date) : '';
    if (subEl) subEl.textContent = slotLabel(sl);
  } else {
    const sl     = SLOTS_REC.find(s => s.id === slotId) || {};
    const trim   = PERIODS.find(p => p.id === parseInt(periodId)) || {};
    const dayIdx = ALL_DKEYS.indexOf(dayKey);
    const dayLbl = dayIdx >= 0 ? ALL_DAYS[dayIdx] : '';
    if (periodLabelEl) periodLabelEl.textContent = trim.label || '';
    if (subEl) {
      const _abMode = _currentDemSettings.some(r => r.semaine_ab);
      const wkPart  = (_abMode && week) ? `Semaine ${week} · ` : '';
      subEl.textContent = `${wkPart}${dayLbl} · ${slotLabel(sl)}`;
    }
  }
  // Bandeau capacité / jauge
  _renderCsmCapInfo();
  // Mini-grille horaire : time-col à gauche + bloc créneau coloré contenant les badges.
  // - Lignes horaires (en background) restent au rythme fixe 24px / 15 min (decoratives).
  // - Marques d'heures (start / intermediaires / end) sont positionnees PROPORTIONNELLEMENT
  //   a la hauteur reelle du bloc, recalculee apres rendu des badges (requestAnimationFrame).
  //   Donc start tout en haut, end tout en bas, le reste reparti entre les deux.
  // - Pas d'ascenseur : la modale grandit selon le contenu (cf. CSS .csm-grid-wrap).
  const _csmSlotForTimeCol = isUniq
    ? (SLOTS_UNIQ_FULL.length ? SLOTS_UNIQ_FULL : SLOTS_UNIQ).find(s => s.id === slotId)
    : SLOTS_REC.find(s => s.id === slotId);
  const _csmSMin = _agendaTimeToMin(_csmSlotForTimeCol?.start_time);
  const _csmEMin = _agendaTimeToMin(_csmSlotForTimeCol?.end_time);
  // Couleur du bloc creneau : fixe (--agenda-block-color, defini en CSS), comme l'agenda.
  {
    const timeCol = document.getElementById('csm-time-col');
    const slotBlock = document.getElementById('csm-slot-block');
    const rowH = 24; // px par tranche de 15 min (sert juste de hauteur min)
    if (timeCol && slotBlock && _csmSMin !== null && _csmEMin !== null && _csmEMin > _csmSMin) {
      slotBlock.style.minHeight = `${Math.max(56, (_csmEMin - _csmSMin) / 15 * rowH)}px`;
      // Vide les marques pour eviter un flash de l'ancien positionnement.
      timeCol.innerHTML = '';
    } else if (timeCol && slotBlock) {
      timeCol.innerHTML = '';
      slotBlock.style.minHeight = '';
    }
  }
  const listEl = document.getElementById('cell-stack-list');
  if (listEl) {
    listEl.innerHTML = bks.map(b => {
      const isCut = _ctxCutData && !_ctxCutData.isCopy && _ctxCutData.id == b.id;
      const ctxData = isUniq
        ? JSON.stringify({id:b.id,email:b.email,slotId,type:'unique',pointage:b.pointage||'',recurringBookingId:b.recurring_booking_id||0}).replace(/"/g,'&quot;')
        : JSON.stringify({id:b.id,email:b.email,periodId,slotId,dayKey,type:'recurring',week:_wk}).replace(/"/g,'&quot;');
      const isLocked = isUniq && !!(b.pointage || b.recurring_booking_id);
      const dragHandler = isUniq
        ? `_onDragStartFromStackModalUniq(event,${b.id},'${slotId}')`
        : `_onDragStartFromStackModal(event,${b.id},'${slotId}',${periodId},'${dayKey}')`;
      return `<div class="planning-name-tag ${b.validated==1?'is-validated':'is-pending'}${isCut?' is-cut':''}${isLocked?' is-locked':''}" data-bid="${b.id}" style="${_badgeStyle(b)};cursor:${isLocked?'default':'grab'}" title="${_badgeTitle(b)}"
        draggable="${isLocked?'false':'true'}"
        ${isLocked ? '' : `ondragstart="${dragHandler}" ondragend="_onDragEnd(event)"`}
        onclick="openBadgeDetail(event,${b.id},'${badgeType}')"
        oncontextmenu="showBadgeCtx(event, ${ctxData})">
        ${_badgeIndicators(b)}
        ${isLocked ? '' : `<span class="planning-name-tag-close" onmousedown="event.stopPropagation();event.preventDefault()" onclick="_quickDeleteBadge(event,${b.id},'${badgeType}')" title="Supprimer">×</span>`}
        <span style="font-weight:700">${b.structure_label || b.demandeur_label || (b.nom+' '+b.prenom)}</span>
        <span style="font-size:.65rem;color:var(--muted)">${(b.structure_label || b.demandeur_label) ? b.nom+' '+b.prenom : (b.niveau||'')}</span>
        ${themeMode && b.theme_label?`<span style="font-size:.62rem;color:${(b.validated==1?BADGE_COLOR_VALIDATED:BADGE_COLOR_PENDING).accent};font-weight:600">${b.theme_label}</span>`:''}
      </div>`;
    }).join('');
  }
  // Une fois les badges rendus, on connait la hauteur réelle du bloc créneau.
  // On positionne les marques d'heures proportionnellement (start en haut, end en bas)
  // et on cale les lignes horaires (background) sur le meme rythme via custom properties.
  if (_csmSMin !== null && _csmEMin !== null && _csmEMin > _csmSMin) {
    requestAnimationFrame(() => {
      const slotBlock = document.getElementById('csm-slot-block');
      const timeCol   = document.getElementById('csm-time-col');
      if (!slotBlock || !timeCol) return;
      const realH = slotBlock.clientHeight;
      if (!realH) return;
      timeCol.style.height = `${realH}px`;
      const range = _csmEMin - _csmSMin; // minutes
      const quarterH = realH / (range / 15);
      slotBlock.style.setProperty('--quarter-h', `${quarterH}px`);
      slotBlock.style.setProperty('--hour-h', `${quarterH * 4}px`);
      const marks = [];
      for (let m = _csmSMin; m <= _csmEMin; m += 15) {
        const top = (m - _csmSMin) / range * realH;
        marks.push(`<div class="csm-time-mark" style="top:${top}px">${_agendaMinToLabel(m)}</div>`);
      }
      timeCol.innerHTML = marks.join('');
    });
  }
  return true;
}

// Drag depuis la modale stack en mode ponctuel (slot unique sans period/dayKey).
function _onDragStartFromStackModalUniq(event, bookingId, slotId) {
  _onDragStart(event, bookingId, 'unique', slotId, '', '');
  setTimeout(() => {
    const modal = document.getElementById('cell-stack-modal');
    if (modal) modal.classList.remove('open');
    _cellStackCoords = null;
  }, 0);
}
// Glisser un badge depuis la modale "pile" → fermer la modale (différé) pour libérer la grille
function _onDragStartFromStackModal(event, bookingId, slotId, periodId, dayKey) {
  // Lancer le drag d'abord pour que le navigateur capture correctement le ghost
  _onDragStart(event, bookingId, 'recurring', slotId, periodId, dayKey);
  // Puis fermer la modale au prochain tick une fois le drag réellement amorcé
  setTimeout(() => {
    const modal = document.getElementById('cell-stack-modal');
    if (modal) modal.classList.remove('open');
    _cellStackCoords = null;
  }, 0);
}
function closeCellStackModal() {
  document.getElementById('cell-stack-modal').classList.remove('open');
  _cellStackCoords = null;
}
// Clic-droit sur la liste de la modale "pile" : affiche le menu contextuel cellule
// (paste / nouvelle réservation) ciblant la cellule actuellement ouverte.
function _onCellStackCtx(event) {
  if (!_cellStackCoords) return;
  // Si on est tombé sur un badge, son propre oncontextmenu prend le pas (stopPropagation
  // dans showBadgeCtx). Ici on ne traite que le clic sur le fond de la liste.
  const onBadge = event.target.closest('.planning-name-tag');
  if (onBadge) return;
  const { periodId, slotId, dayKey, week } = _cellStackCoords;
  showCellCtx(event, periodId, slotId, dayKey, week || '');
}
// Clic-gauche sur le fond de la liste (hors badge) : ouvre directement la
// création d'une nouvelle réservation pour la cellule courante.
function _onCellStackClick(event) {
  if (!_cellStackCoords) return;
  const onBadge = event.target.closest('.planning-name-tag');
  if (onBadge) return;
  const { periodId, slotId, dayKey, week } = _cellStackCoords;
  openCellCreate(event, periodId, slotId, dayKey, week || '');
}

function openPrivacyModal() {
  document.getElementById('privacy-modal').classList.add('open');
}
function closePrivacyModal() {
  document.getElementById('privacy-modal').classList.remove('open');
}

function _bdetUpdateLabels() {
  const e = parseInt(document.getElementById('bdet-enfants').value, 10)       || 0;
  const a = parseInt(document.getElementById('bdet-accompagnants').value, 10) || 0;
  document.getElementById('bdet-enfants-lbl').textContent       = (e > 1) ? 'Enfants' : 'Enfant';
  document.getElementById('bdet-accompagnants-lbl').textContent = (a > 1) ? 'Adultes' : 'Adulte';
  _bdetCheckDirty();
}
function _bdetIsDirty() {
  const e = parseInt(document.getElementById('bdet-enfants').value, 10)       || 0;
  const a = parseInt(document.getElementById('bdet-accompagnants').value, 10) || 0;
  if (e !== _bdetInitEnfants || a !== _bdetInitAccompagnants) return true;
  if (_bdetThemeShown) {
    const t = _bdetCurrentTheme();
    if (t !== (_bdetInitTheme || '').trim()) return true;
  }
  return false;
}
function _bdetCurrentTheme() {
  if (_currentServiceThemesMode === 'liste') {
    return (document.getElementById('bdet-theme-select').value || '').trim();
  }
  return (document.getElementById('bdet-theme-input').value || '').trim();
}
function _bdetCheckDirty() {
  const dirty = _bdetIsDirty();
  const saveBtn   = document.getElementById('bdet-save-btn');
  const cancelBtn = document.getElementById('bdet-cancel-btn');
  if (saveBtn   && saveBtn.style.display   !== 'none') saveBtn.disabled       = !dirty;
  if (cancelBtn && saveBtn?.style.display  !== 'none') cancelBtn.style.display = dirty ? '' : 'none';
}

async function bdetSaveParticipants() {
  const _bk = (_detailBookingType === 'unique' ? allBookingsUnique : allBookings).find(b => b.id == _detailBookingId);
  if (_bk?.pointage || _bk?.recurring_booking_id) { showToast('⚠️ Impossible de modifier cette réservation'); return; }
  const enfants       = Math.max(0, parseInt(document.getElementById('bdet-enfants').value, 10)       || 0);
  const accompagnants = Math.max(0, parseInt(document.getElementById('bdet-accompagnants').value, 10) || 0);
  // Participants — seulement si modifiés (évite un PATCH inutile quand on ne change que le thème)
  if (enfants !== _bdetInitEnfants || accompagnants !== _bdetInitAccompagnants) {
    const r = await apiPost('/bookings.php?action=update_counts', {
      id: _detailBookingId, type: _detailBookingType, enfants, accompagnants
    });
    if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  }
  // Thème — uniquement si le champ est visible et a été modifié
  if (_bdetThemeShown) {
    const theme = _bdetCurrentTheme();
    if (theme !== (_bdetInitTheme || '').trim()) {
      const rt = await apiPost('/bookings.php?action=update_theme', {
        id: _detailBookingId, type: _detailBookingType, theme_label: theme
      });
      if (!rt.ok) { showToast('⚠️ ' + (rt.error || 'Erreur')); return; }
    }
  }
  showToast('✅ Réservation enregistrée');
  closeBadgeDetail();
  await loadAdminData(); renderPlanningTab();
}

document.addEventListener('click', _ctxHide);
document.addEventListener('keydown', e => { if (e.key === 'Escape') _ctxHide(); });
document.addEventListener('click', e => {
  const btn = e.target.closest('.nav-locked');
  if (!btn) return;
  e.stopImmediatePropagation(); e.preventDefault();
  showToast('⚠️ Veuillez confirmer ou annuler');
}, true);

// ── Drag-and-drop badges planning ────────────────────────
function _onDragStart(event, bookingId, type, slotId, periodId, dayKey, week = '') {
  _dragData = { id: bookingId, type, slotId, periodId, dayKey, week };
  event.dataTransfer.effectAllowed = 'copyMove';
  event.dataTransfer.setData('text/plain', String(bookingId)); // requis Firefox
  // Légère transparence sur le badge source (délai pour que le ghost soit capturé d'abord).
  // Sélecteur générique sur data-bid : l'agenda et le planning utilisent tous deux .planning-name-tag.
  requestAnimationFrame(() => {
    document.querySelectorAll(`[data-bid="${bookingId}"]`).forEach(el => el.classList.add('is-dragging'));
  });
}

function _onDragEnd(event) {
  // Nettoyage même si le drop a échoué ou été annulé
  if (_dragTabTimer) { clearTimeout(_dragTabTimer); _dragTabTimer = null; }
  document.querySelectorAll('.is-dragging').forEach(el => el.classList.remove('is-dragging'));
  document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  document.querySelectorAll('.period-btn.drag-hover-tab').forEach(el => el.classList.remove('drag-hover-tab'));
  document.querySelectorAll('.drag-hover-page').forEach(el => el.classList.remove('drag-hover-page'));
  _dragData = null;
}

function _onDragOver(event) {
  if (!_dragData) return;
  event.preventDefault(); // nécessaire pour autoriser le drop
  event.dataTransfer.dropEffect = event.ctrlKey ? 'copy' : 'move';
}

function _onDragEnter(event, periodId, slotId, dayKey) {
  if (!_dragData) return;
  event.preventDefault();
  event.currentTarget.classList.add('drag-over');
}

function _onDragLeave(event) {
  // Ne retirer la classe que si on quitte vraiment la cellule (pas un enfant)
  if (!event.currentTarget.contains(event.relatedTarget)) {
    event.currentTarget.classList.remove('drag-over');
  }
}

// Survol d'un onglet période pendant un glisser → bascule après délai
function _onDragOverTab(event) {
  if (!_dragData) return;
  event.preventDefault();
}
function _onDragEnterTab(event, periodIdx) {
  if (!_dragData) return;
  event.preventDefault();
  // Déjà sur ce période (après bascule, le navigateur re-déclenche dragenter) → rien à faire
  if (periodIdx === planningPeriodIdx) return;
  const btn = event.currentTarget;
  // Si le décompte est déjà en cours pour cet onglet, ne pas relancer
  if (btn.classList.contains('drag-hover-tab')) return;
  if (_dragTabTimer) { clearTimeout(_dragTabTimer); _dragTabTimer = null; }
  btn.classList.add('drag-hover-tab');
  _dragTabTimer = setTimeout(() => {
    _dragTabTimer = null;
    planningPeriodIdx = periodIdx;
    _planningPeriodUserPicked = true;
    renderPlanningTab(); // re-render : les onglets + la grille du nouveau période
  }, 650);
}
function _onDragLeaveTab(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    if (_dragTabTimer) { clearTimeout(_dragTabTimer); _dragTabTimer = null; }
    event.currentTarget.classList.remove('drag-hover-tab');
  }
}
function _onDragOverPage(event) {
  if (!_dragData) return;
  event.preventDefault();
}
function _onDragEnterPage(event, dir) {
  if (!_dragData) return;
  const btn = event.currentTarget;
  if (btn.disabled) return;
  if (Date.now() - _dragPageCooldown < 300) return; // cooldown post-rendu
  if (btn.classList.contains('drag-hover-page')) return;
  if (_dragTabTimer) { clearTimeout(_dragTabTimer); _dragTabTimer = null; }
  btn.classList.add('drag-hover-page');
  _dragTabTimer = setTimeout(() => {
    _dragTabTimer = null;
    _dragPageCooldown = Date.now();
    planningUniqPage += dir;
    renderPlanningTab();
  }, 650);
}
function _onDragLeavePage(event) {
  if (!event.currentTarget.contains(event.relatedTarget)) {
    if (_dragTabTimer) { clearTimeout(_dragTabTimer); _dragTabTimer = null; }
    event.currentTarget.classList.remove('drag-hover-page');
  }
}

async function _onDrop(event, periodId, slotId, dayKey, week = '') {
  event.preventDefault();
  event.currentTarget.classList.remove('drag-over');
  if (!_dragData) return;
  const data = _dragData;
  const isCopy = event.ctrlKey;
  _dragData = null;
  // Même cellule (et même semaine) sans copie → rien à faire
  if (!isCopy && data.periodId === periodId && data.slotId === slotId && data.dayKey === dayKey && (data.week || '') === (week || '')) return;
  const action = isCopy ? 'duplicate' : 'move';
  const r = await apiPost(`/bookings.php?action=${action}`, {
    id: data.id, type: data.type,
    service_id: currentServiceId,
    slot_id: slotId, period_id: periodId, day_key: dayKey,
    week: week,
  });
  if (r.ok) {
    showToast(isCopy ? '📋 Réservation dupliquée' : '📌 Réservation déplacée');
    await loadAdminData(); _rerenderActiveAdminView();
  } else {
    showToast('⚠️ ' + (r.error || 'Erreur'));
    _rerenderActiveAdminView(); // restaurer l'affichage
  }
}

// ── Modal création réservation depuis le planning ─────────
function openCellCreate(event, periodId, slotId, dayKey, week = '') {
  if (SLOTS_UNIQ.some(s => s.id == slotId && s.parent_slot_id)) {
    showToast('Cette date est gérée par son créneau récurrent — créez la réservation depuis là.', 4000, { warn: true });
    return;
  }
  _ctxCellData = { periodId, slotId, dayKey, week };
  openPlanningCreateModal();
}

// Plus petite date à laquelle une réservation peut commencer compte tenu du
// délai minimum (jours ouvrés négatifs / jours civils ≥ 1000 / 0 = aujourd'hui).
// Pour les minutes legacy (1..999), on retombe sur aujourd'hui : un check à la
// minute n'a de sens que sur un créneau ponctuel daté.
function _earliestBookableDate() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  if (!bookingDelay || (bookingDelay > 0 && bookingDelay < 1000)) return today;
  if (bookingDelay >= 1000) {
    const d = new Date(today);
    d.setDate(d.getDate() + (bookingDelay - 1000));
    return d;
  }
  // Jours ouvrés (bookingDelay < 0) : avance jour par jour jusqu'à ce que
  // _workingDaysBetween(today, d) atteigne le requis.
  const required = Math.abs(bookingDelay);
  const d = new Date(today);
  while (_workingDaysBetween(today, d) < required) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

// Liste des dates des bookings enfants d'une réservation récurrente existante.
// Source : allBookingsUnique avec parent_booking_id pointant sur l'id de la résa.
// La date est récupérée depuis le slot miroir (SLOTS_UNIQ_FULL/SLOTS_UNIQ) via slot_id.
function _bookingDatesForRecurring(parentBookingId) {
  const pool = SLOTS_UNIQ_FULL.length ? SLOTS_UNIQ_FULL : SLOTS_UNIQ;
  return (allBookingsUnique || [])
    .filter(b => parseInt(b.parent_booking_id || b.recurring_booking_id || 0) === parseInt(parentBookingId))
    .map(b => {
      const sl = pool.find(s => s.id === b.slot_id);
      return sl?.slot_date || null;
    })
    .filter(Boolean)
    .sort();
}
// Prédit les dates qui seront effectivement bookées pour un utilisateur donné lors d'une
// création de résa récurrente. Part des miroirs (déjà filtrés state + period_holidays à la
// génération) puis applique le filtre vacances scolaires si le demandeur de l'user est
// fermé (`open_on_school_holidays`=0).
function _predictedBookingDates(slotId, periodId, dayKey, week, userId) {
  const mirrorDates = _mirrorDatesForRecurring(slotId, periodId, dayKey, week);
  if (!userId) return mirrorDates;
  const user  = (_allUsersAdmin || []).find(u => parseInt(u.id) === parseInt(userId));
  const demId = user ? parseInt(user.effective_demandeur_id || 0) : 0;
  const dem   = (DEMANDEURS || []).find(d => parseInt(d.id) === demId);
  // Si pas de demandeur configuré, ou demandeur ouvert pendant vacances : aucun filtre.
  if (!dem || dem.open_on_school_holidays) return mirrorDates;
  return mirrorDates.filter(d => !_isSchoolVacance(d));
}
// Variante côté user courant (onglet Réservations) : applique le filtre vacances scolaires
// depuis `_userDem().open_on_school_holidays` (lookup direct sans passer par DEMANDEURS).
function _predictedDatesForCurrentUser(slotId, periodId, dayKey, week) {
  const mirrorDates = _mirrorDatesForRecurring(slotId, periodId, dayKey, week);
  const dem = _userDem();
  if (!dem || dem.open_on_school_holidays) return mirrorDates;
  return mirrorDates.filter(d => !_isSchoolVacance(d));
}
// Tooltip custom des créneaux récurrents (onglet Réservations) — police plus petite et
// rendu en grille 4 colonnes. Native `title` ne le permet pas.
function _ensureScheduleTooltip() {
  let el = document.getElementById('schedule-slot-tooltip');
  if (!el) {
    el = document.createElement('div');
    el.id = 'schedule-slot-tooltip';
    el.className = 'schedule-tooltip';
    document.body.appendChild(el);
  }
  return el;
}
// Détecte si l'utilisateur est en train d'éditer un thème (picker liste ouvert
// ou textarea/input thème focalisé dans un slot-btn) — auquel cas on n'affiche pas
// l'info-bulle pour ne pas gêner la saisie.
function _isThemeBeingEdited() {
  if (document.querySelector('.user-theme-picker-menu')) return true;
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')
      && ae.closest && ae.closest('.slot-btn')) return true;
  return false;
}
function _scheduleTtShow(event, dates) {
  if (_isThemeBeingEdited()) return;
  const el = _ensureScheduleTooltip();
  // Format court "7 avril" (sans jour de la semaine ni année) pour économiser l'espace.
  const fmt = ymd => new Date(ymd + 'T12:00:00')
    .toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
  el.innerHTML = '<div class="schedule-tooltip-title">Journées concernées :</div>'
               + dates.map(d => `<div>• ${fmt(d)}</div>`).join('');
  el.classList.remove('is-line');
  el.classList.add('is-visible');
  _scheduleTtMove(event);
}
// Variante mono-ligne (mode ponctuel) : date + horaires + places restantes
// affichés sur une seule ligne, dans le même élément tooltip.
function _scheduleTtShowLine(event, text) {
  if (_isThemeBeingEdited()) return;
  const el = _ensureScheduleTooltip();
  el.innerHTML = text;
  el.classList.add('is-line');
  el.classList.add('is-visible');
  _scheduleTtMove(event);
}
function _scheduleTtMove(event) {
  const el = document.getElementById('schedule-slot-tooltip');
  if (!el || !el.classList.contains('is-visible')) return;
  // Cache si l'utilisateur a ouvert le picker thème ou focalisé une saisie.
  if (_isThemeBeingEdited()) { _scheduleTtHide(); return; }
  const offset = 12;
  let x = event.clientX + offset;
  let y = event.clientY + offset;
  const r = el.getBoundingClientRect();
  if (x + r.width  > window.innerWidth)  x = window.innerWidth  - r.width  - 4;
  if (y + r.height > window.innerHeight) y = window.innerHeight - r.height - 4;
  el.style.left = x + 'px';
  el.style.top  = y + 'px';
}
function _scheduleTtHide() {
  const el = document.getElementById('schedule-slot-tooltip');
  if (el) el.classList.remove('is-visible', 'is-line');
}
// Cache instantanément l'info-bulle quand un thème reçoit le focus (mode libre).
// Le mode liste passe par openMenu() qui appelle déjà _scheduleTtHide().
document.addEventListener('focusin', e => {
  const ae = e.target;
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')
      && ae.closest && ae.closest('.slot-btn')) {
    _scheduleTtHide();
  }
});
// Liste des dates miroir d'un créneau récurrent dans une période donnée,
// matchant le jour de la semaine (dayKey) et la semaine A/B si fournie.
// Source : SLOTS_UNIQ_FULL/SLOTS_UNIQ filtrés par parent_slot_id + period_id.
// Filtre :
//   - état : seuls les miroirs `state='actif'` (les désactivés/archivés sont exclus)
//   - vacances/jours fériés : implicitement exclus, car les miroirs sont générés en
//     filtrant `period_holidays` à la création (cf. cycle / save flow côté API)
// Renvoie un tableau trié de 'YYYY-MM-DD'.
function _mirrorDatesForRecurring(slotId, periodId, dayKey, week) {
  const pool = SLOTS_UNIQ_FULL.length ? SLOTS_UNIQ_FULL : SLOTS_UNIQ;
  const dayKeyOf = ymd => ALL_DKEYS[[6,0,1,2,3,4,5][new Date(ymd + 'T12:00:00').getDay()]];
  return pool
    .filter(s =>
      s.parent_slot_id === slotId
      && parseInt(s.period_id) === parseInt(periodId)
      && s.slot_date
      && (!s.state || s.state === 'actif')
      && dayKeyOf(s.slot_date) === dayKey
      && (!week || (_slotWeeks(s) || '') === week)
    )
    .map(s => s.slot_date)
    .sort();
}
// Format "lundi 7 avril 2026" (locale FR — minuscules par défaut).
function _fmtDateLongFr(ymd) {
  if (!ymd) return '';
  return new Date(ymd + 'T12:00:00')
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
// Format heure compact FR : "9h" si minutes=0, sinon "9h30" (pas de zéro initial).
function _fmtHourFr(t) {
  if (!t) return '';
  const [h, m] = String(t).split(':');
  const hh = parseInt(h, 10);
  const mm = parseInt(m || '0', 10);
  return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2, '0')}`;
}
// Plage horaire d'un slot : "de 9h à 10h" ou "journée entière" si start/end manquent.
function _fmtSlotHoursFr(startTime, endTime) {
  if (!startTime || !endTime) return 'journée entière';
  return `de ${_fmtHourFr(startTime)} à ${_fmtHourFr(endTime)}`;
}
// Rendu d'une liste d'occurrences : dates en 3 colonnes, avec horaires (ou "journée entière")
// derrière chaque date. Format heure : "9h" ou "9h30" (pas de zéro initial, "h" au lieu de ":").
function _renderOccurrencesList(period, slot, dates) {
  if (!dates || !dates.length) return '';
  const timesPart = _fmtSlotHoursFr(slot?.start_time, slot?.end_time);
  const grid = dates.map(d => `<div>• ${_fmtDateLongFr(d)} ${timesPart}</div>`).join('');
  return `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:.15rem .75rem">${grid}</div>`;
}

// Première occurrence (≥ _earliestBookableDate) dans la période matchant le
// jour de la semaine et la semaine A/B (si fournie). Renvoie 'YYYY-MM-DD' ou null.
function _nextRecOccurrenceDate(period, dayKey, week) {
  if (!period?.date_start || !period?.date_end) return null;
  const earliest = _earliestBookableDate();
  const start = new Date(period.date_start + 'T00:00:00');
  const end   = new Date(period.date_end   + 'T00:00:00');
  const cur   = new Date(earliest > start ? earliest : start);
  if (cur > end) return null;
  const dayKeyOf = d => ALL_DKEYS[[6,0,1,2,3,4,5][d.getDay()]];
  const ymd = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  while (cur <= end) {
    if (dayKeyOf(cur) === dayKey && (!week || _slotDateWeekAB(ymd(cur)) === week)) {
      return ymd(cur);
    }
    cur.setDate(cur.getDate() + 1);
  }
  return null;
}

// Date + heures associées à la cellule cliquée (ponctuel : date du slot ;
// récurrent : prochaine occurrence respectant période / jour / semaine / délai).
// Renvoie null si la cellule n'a pas d'occurrence à venir.
// Helper : un set de coordonnées cible un créneau récurrent si periodId est non-vide.
// Cas couverts : planning rec, agenda admin mode "Modèle de période", modale multi-badges
// ouverte sur un récurrent. Pour un ponctuel (planning ponctuel, agenda mode realweek),
// periodId vaut '' ou 0.
function _isRecCoords(coords) {
  if (!coords) return false;
  const p = coords.periodId;
  return p !== null && p !== undefined && p !== '' && String(p) !== '0';
}
function _pcmCellInfo(coords) {
  const { periodId, slotId, dayKey, week } = coords;
  const isRec = _isRecCoords(coords);
  if (isRec) {
    const pid    = String(periodId);
    const slot   = (SLOTS_REC_MAP[pid] || SLOTS_REC_MAP_FULL[pid] || []).find(s => s.id === slotId);
    const period = PERIODS.find(p => String(p.id) === pid);
    if (!slot || !period) return null;
    const date = _nextRecOccurrenceDate(period, dayKey, week);
    if (!date) return null;
    return { date, start_time: slot.start_time, end_time: slot.end_time };
  }
  const pool = SLOTS_UNIQ_FULL.length ? SLOTS_UNIQ_FULL : SLOTS_UNIQ;
  const slot = pool.find(s => s.id === slotId);
  if (!slot || !slot.slot_date) return null;
  return { date: slot.slot_date, start_time: slot.start_time, end_time: slot.end_time };
}

// Retourne null si la cellule accepte une nouvelle réservation, sinon une chaîne décrivant
// la raison du refus (à afficher dans un toast). On lit la capacité directement depuis
// SLOTS_REC_MAP / SLOTS_UNIQ selon le type de coords (récurrent vs ponctuel).
function _pcmCellBookableReason(coords) {
  const { periodId, slotId, dayKey, week } = coords;
  const isRec = _isRecCoords(coords);
  let total;
  if (isRec) {
    const pid    = String(periodId);
    const period = PERIODS.find(p => String(p.id) === pid);
    if (!period) return 'Période introuvable.';
    if (!_nextRecOccurrenceDate(period, dayKey, week)) {
      return 'Aucune date à venir pour ce créneau (période passée ou délai minimum non respecté).';
    }
    const slot = (SLOTS_REC_MAP[pid] || SLOTS_REC_MAP_FULL[pid] || []).find(s => s.id === slotId);
    if (!slot) return 'Créneau introuvable.';
    if (!(dayKey in (slot.cap || {}))) return 'Aucune capacité définie pour ce jour de la semaine.';
    total = slot.cap[dayKey];
  } else {
    const pool = SLOTS_UNIQ_FULL.length ? SLOTS_UNIQ_FULL : SLOTS_UNIQ;
    const slot = pool.find(s => s.id === slotId);
    if (!slot) return 'Créneau introuvable.';
    if (slot.slot_date && slot.start_time
      && new Date(`${slot.slot_date}T${slot.start_time}`) <= Date.now()) {
      return 'Cette séance est déjà passée.';
    }
    total = parseInt(slot.capacity, 10) || 0;
  }
  if (!total || total <= 0) return 'Capacité non définie sur ce créneau.';
  const _wk  = week || '';
  const pool = isRec ? (allBookings || []) : (allBookingsUnique || []);
  const bks  = isRec
    ? pool.filter(b =>
        parseInt(b.period_id) === parseInt(periodId)
        && b.slot_id === slotId && b.day_key === dayKey
        && (!_wk || !(b.week || '') || (b.week || '') === _wk))
    : pool.filter(b => b.slot_id === slotId);
  const gaugeFlag = (_currentDemSettings || []).some(r =>
    (isRec ? r.recurrent : !r.recurrent) && r.jauge);
  if (gaugeFlag) {
    const sum = bks.reduce((s, b) => s + (parseInt(b.enfants)||0) + (parseInt(b.accompagnants)||0), 0);
    if (sum >= total) return `Créneau complet (${sum}/${total}).`;
  } else if (bks.length >= total) {
    return `Créneau complet (${bks.length}/${total}).`;
  }
  return null;
}
function _pcmCellIsBookable(coords) {
  return _pcmCellBookableReason(coords) === null;
}

async function openPlanningCreateModal() {
  if (!_ctxCellData) return;
  const blockReason = _pcmCellBookableReason(_ctxCellData);
  if (blockReason) { showToast('⚠️ ' + blockReason, 4000, { warn: true }); return; }
  // Titre dynamique selon le type de cellule :
  //   ponctuel  : "➕ Nouvelle réservation : lundi 18 Mai 2026, 11:00 - 12:00"
  //   récurrent : "➕ Nouvelle réservation : T3 — Avril - Juin, mardi 09:00 - 11:00"
  const titleEl = document.getElementById('pcm-title');
  if (titleEl) {
    const isRec = _isRecCoords(_ctxCellData);
    const info  = _pcmCellInfo(_ctxCellData);
    let suffix = '';
    if (info) {
      const times = _fmtSlotHoursFr(info.start_time, info.end_time);
      if (isRec) {
        const period    = PERIODS.find(p => String(p.id) === String(_ctxCellData.periodId));
        const dayLbl    = (ALL_DAYS[ALL_DKEYS.indexOf(_ctxCellData.dayKey)] || '').toLowerCase();
        const dayPart   = [dayLbl, times].filter(Boolean).join(' ');
        const periodPart = [period?.etiquette || '', period?.label || ''].filter(Boolean).join(' — ');
        suffix = [periodPart, dayPart].filter(Boolean).join(', ');
      } else if (info.date) {
        const d = new Date(info.date + 'T12:00:00');
        const dateStr = `${d.toLocaleDateString('fr-FR', { weekday: 'long' })} `
                      + `${d.toLocaleDateString('fr-FR', { day: 'numeric' })} `
                      + `${d.toLocaleDateString('fr-FR', { month: 'long' })} `
                      + `${d.getFullYear()}`;
        suffix = [dateStr, times].filter(Boolean).join(', ');
      }
    }
    titleEl.textContent = '➕ Nouvelle réservation' + (suffix ? ' : ' + suffix : '');
  }
  document.getElementById('pcm-theme-input').value  = '';
  document.getElementById('pcm-theme-select').value = '';
  if (!_allUsersAdmin.length) {
    const r = await apiGet('/users.php?action=list');
    if (r.ok) _allUsersAdmin = r.users || [];
  }
  // 1er menu : types de demandeurs du service, filtrés selon la nature de la
  // cellule (récurrent vs ponctuel) — un même service peut configurer des
  // demandeurs distincts pour chacun des deux modes.
  const isRec   = _isRecCoords(_ctxCellData);
  const demRows = (_currentDemSettings || []).filter(r =>
    r.demandeur_id && (isRec ? r.recurrent : !r.recurrent));
  const demSel  = document.getElementById('pcm-demandeur-select');
  demSel.innerHTML = demRows.length
    ? demRows.map(r => `<option value="${r.demandeur_id}">${r.label || ('Demandeur #' + r.demandeur_id)}</option>`).join('')
    : '<option value="">Aucun type de demandeur configuré</option>';
  // 2e menu : peuplé selon le type sélectionné
  _pcmPopulateUsers();
  // Champ thème : visibilité et type (input/select) selon le demandeur sélectionné
  // et le mode de thèmes du service.
  _pcmUpdateThemeField();
  // Précharge le cache des vacances scolaires pour pouvoir filtrer la prédiction
  // selon le drapeau `open_on_school_holidays` du demandeur de l'user sélectionné.
  await _loadSchoolHolidaysIfNeeded();
  // ── Liste des dates des bookings à créer (uniquement en récurrent) ──
  _pcmRefreshOccurrences();
  document.getElementById('planning-create-modal').classList.add('open');
}
// Recalcule et affiche la liste des dates qui seront effectivement réservées pour
// l'utilisateur courant. Appelée à l'ouverture et à chaque changement de demandeur/user.
function _pcmRefreshOccurrences() {
  const isRec    = _isRecCoords(_ctxCellData);
  const _occField = document.getElementById('pcm-occurrences-field');
  const _occList  = document.getElementById('pcm-occurrences-list');
  if (!isRec || !_ctxCellData) {
    if (_occField) _occField.style.display = 'none';
    return;
  }
  const _pid    = String(_ctxCellData.periodId);
  const _period = PERIODS.find(p => String(p.id) === _pid) || null;
  const _slot   = (SLOTS_REC_MAP_FULL[_pid] || SLOTS_REC_MAP[_pid] || [])
    .find(s => s.id === _ctxCellData.slotId) || null;
  const _userId = parseInt(document.getElementById('pcm-user-select').value, 10) || 0;
  const _dates  = _predictedBookingDates(
    _ctxCellData.slotId, _ctxCellData.periodId, _ctxCellData.dayKey, _ctxCellData.week || '', _userId
  );
  if (_dates.length) {
    _occList.innerHTML = _renderOccurrencesList(_period, _slot, _dates);
    _occField.style.display = '';
  } else {
    _occField.style.display = 'none';
  }
}
// Affiche/masque le champ thème selon le demandeur sélectionné (themes=1 requis)
// et bascule entre <input> (mode libre) et <select> (mode liste) selon le service.
function _pcmUpdateThemeField() {
  const field   = document.getElementById('pcm-theme-field');
  const inputEl = document.getElementById('pcm-theme-input');
  const selEl   = document.getElementById('pcm-theme-select');
  const demId   = parseInt(document.getElementById('pcm-demandeur-select').value, 10) || 0;
  const dem     = (_currentDemSettings || []).find(r => parseInt(r.demandeur_id) === demId);
  const themesOn = !!(dem && dem.themes);
  if (!themesOn) {
    field.style.display   = 'none';
    inputEl.style.display = 'none';
    selEl.style.display   = 'none';
    return;
  }
  field.style.display = '';
  if (_currentServiceThemesMode === 'liste') {
    inputEl.style.display = 'none';
    selEl.style.display   = '';
    const list = (_currentServiceThemesList || []).slice();
    selEl.innerHTML = `<option value="">— Aucun —</option>`
      + list.map(t => `<option value="${escHtml(t)}">${escHtml(t)}</option>`).join('');
    selEl.value = '';
  } else {
    selEl.style.display   = 'none';
    inputEl.style.display = '';
    inputEl.value = '';
  }
}
// Filtre les utilisateurs (role='utilisateur') selon le type de demandeur choisi,
// en se basant sur effective_demandeur_id (= demandeur_id direct, sinon celui de la structure).
function _pcmPopulateUsers() {
  const demId = parseInt(document.getElementById('pcm-demandeur-select').value, 10) || 0;
  const users = _allUsersAdmin.filter(u =>
    u.role === 'utilisateur' &&
    (!demId || parseInt(u.effective_demandeur_id, 10) === demId)
  );
  const sel = document.getElementById('pcm-user-select');
  sel.innerHTML = users.length
    ? users.map(u => `<option value="${u.id}">${u.nom} ${u.prenom}</option>`).join('')
    : '<option value="">Aucun demandeur disponible</option>';
  _pcmSyncCounts();
}
function onPcmDemandeurChange() { _pcmPopulateUsers(); _pcmUpdateThemeField(); _pcmRefreshOccurrences(); }
// Pré-remplit Enfants/Adultes depuis le profil de l'utilisateur sélectionné
// (l'admin peut ensuite ajuster avant validation).
function _pcmSyncCounts() {
  const userId = parseInt(document.getElementById('pcm-user-select').value, 10) || 0;
  const u = _allUsersAdmin.find(x => parseInt(x.id, 10) === userId);
  document.getElementById('pcm-enfants').value       = u ? (parseInt(u.enfants, 10) || 0) : 0;
  document.getElementById('pcm-accompagnants').value = 1;
  _pcmUpdateLabels();
}
function _pcmUpdateLabels() {
  const e = parseInt(document.getElementById('pcm-enfants').value, 10)       || 0;
  const a = parseInt(document.getElementById('pcm-accompagnants').value, 10) || 0;
  document.getElementById('pcm-enfants-lbl').textContent       = (e > 1) ? 'Enfants' : 'Enfant';
  document.getElementById('pcm-accompagnants-lbl').textContent = (a > 1) ? 'Adultes' : 'Adulte';
}
function onPcmUserChange() { _pcmSyncCounts(); _pcmRefreshOccurrences(); }
// Reflète l'état de planningQuickValidate sur toutes les checkboxes "validation rapide"
// (header du planning rec + modale "pile de badges") afin que toggling sur une instance se voie partout.
function _syncQuickValidateCheckboxes() {
  ['planning-rec-quick-validate', 'csm-quick-validate', 'agenda-quick-validate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = !!planningQuickValidate;
  });
}
// Pendant pointage : reflète l'état de planningQuickPointage sur toutes les checkboxes
// (header planning + modale pile + agenda) pour cohérence visuelle multi-vues.
function _syncQuickPointageCheckboxes() {
  ['planning-quick-pointage', 'csm-quick-pointage', 'agenda-quick-pointage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.checked = !!planningQuickPointage;
  });
}
// Affiche dans la modale "pile" la capacité restante et la jauge pour la cellule cible
function _renderCsmCapInfo() {
  const el = document.getElementById('csm-cap-info');
  if (!el || !_cellStackCoords) return;
  const { periodId, slotId, dayKey, week } = _cellStackCoords;
  const isUniq = !periodId || periodId === '' || periodId === 0 || periodId === '0';
  const _wk = week || '';
  let total, bks;
  let isMirror = false;
  if (isUniq) {
    const sl = (SLOTS_UNIQ_FULL.length ? SLOTS_UNIQ_FULL : SLOTS_UNIQ).find(s => s.id === slotId) || {};
    total = sl.capacity != null ? parseInt(sl.capacity) : null;
    bks = (allBookingsUnique || []).filter(b => b.slot_id === slotId);
    // Un créneau miroir d'un récurrent garde le mode jauge du parent (gaugeRec).
    isMirror = !!sl.parent_slot_id;
  } else {
    total = getCapacity(slotId, periodId, dayKey);
    bks = (allBookings || []).filter(b =>
      parseInt(b.period_id) === parseInt(periodId) && b.slot_id === slotId && b.day_key === dayKey
      && (!_wk || !(b.week || '') || (b.week || '') === _wk)
    );
  }
  const takenCount = bks.length;
  const gaugeSum   = bks.reduce((s, b) => s + (parseInt(b.enfants)||0) + (parseInt(b.accompagnants)||0), 0);
  // Un miroir uniq hérite du mode jauge récurrent (sinon : flag normal selon isUniq).
  const gaugeFlag  = _currentDemSettings.some(r => (isUniq && !isMirror) ? (!r.recurrent && r.jauge) : (r.recurrent && r.jauge));
  if (total == null) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = 'flex';
  // Convention de l'app : on affiche soit la jauge (si mode jauge), soit le nombre de
  // places restantes — pas les deux en même temps (cf. cellules du planning, etc.).
  if (gaugeFlag) {
    const pct   = total > 0 ? Math.min(100, Math.round(gaugeSum / total * 100)) : 0;
    const color = pct >= 100 ? 'var(--danger)' : pct >= 70 ? '#e8a45a' : 'var(--accent)';
    el.innerHTML = `<span class="csm-gauge-info" style="color:${color}">
      <span>Jauge</span>
      <span style="display:inline-block;width:80px;height:6px;border-radius:3px;background:rgba(0,0,0,.18);overflow:hidden;flex-shrink:0"><span style="display:block;height:100%;width:${pct}%;background:${color};border-radius:3px"></span></span>
      <span>${gaugeSum}/${total}</span>
    </span>`;
  } else {
    const left = total - takenCount;
    el.innerHTML = left <= 0
      ? `<span style="color:var(--danger);font-weight:600">Complet</span>`
      : `<span style="color:var(--accent);font-weight:600">${left} place${left > 1 ? 's' : ''} disponible${left > 1 ? 's' : ''}</span>`;
  }
}
function closePlanningCreateModal() {
  document.getElementById('planning-create-modal').classList.remove('open');
}
async function savePlanningBooking() {
  const userId = document.getElementById('pcm-user-select').value;
  // Lit le thème depuis l'élément actif (input ou select) selon le mode du service ;
  // vide si le champ thème n'est pas visible (demandeur sans themes).
  const _themeField = document.getElementById('pcm-theme-field');
  const theme = (_themeField.style.display === 'none')
    ? ''
    : (_currentServiceThemesMode === 'liste'
        ? (document.getElementById('pcm-theme-select').value || '').trim()
        : (document.getElementById('pcm-theme-input').value  || '').trim());
  const enfants       = Math.max(0, parseInt(document.getElementById('pcm-enfants').value, 10)       || 0);
  const accompagnants = Math.max(0, parseInt(document.getElementById('pcm-accompagnants').value, 10) || 0);
  if (!userId || !_ctxCellData) { showToast('⚠️ Sélectionnez un utilisateur'); return; }
  const isRec = _isRecCoords(_ctxCellData);
  const r = await apiPost('/bookings.php?action=admin_book', {
    user_id: parseInt(userId), service_id: currentServiceId,
    slot_id: _ctxCellData.slotId, period_id: _ctxCellData.periodId,
    day_key: _ctxCellData.dayKey, theme_label: theme,
    type: isRec ? 'recurring' : 'unique',
    week: _ctxCellData.week || '',
    enfants, accompagnants,
  });
  if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  closePlanningCreateModal();
  showToast('✅ Réservation créée');
  // Recharge les données puis re-render l'onglet actif (planning rec / ponctuel ou agenda).
  await loadAdminData();
  _rerenderActiveAdminView();
  await loadServerCounts();
}

// ── Impression planning ───────────────────────────────────
function _printDateCell(dateVal) {
  if (!dateVal) return '—';
  const d = new Date(dateVal);
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'long' });
  const date    = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  return `<span class="cell-date-day">${weekday.charAt(0).toUpperCase() + weekday.slice(1)}</span>`
       + `<span class="cell-date-num">${date}</span>`;
}

function _printBadge(b) {
  const c   = b.validated == 1
    ? (printBW ? { bg:'rgba(20,20,20,.12)', border:'rgba(20,20,20,.35)', accent:'#1a1a1a' } : BADGE_COLOR_VALIDATED)
    : (printBW ? { bg:'rgba(200,200,200,.25)', border:'rgba(200,200,200,.55)', accent:'#aaa' } : BADGE_COLOR_PENDING);
  const sub = (b.structure_label || b.demandeur_label) ? b.nom+' '+b.prenom : (b.niveau||'');
  const printIndicators = (() => {
    const pill = (cls) => `<span class="${cls}">${cls.slice(-1).toUpperCase()}</span>`;
    let html = '';
    if      (b.pointage === 'present') html += pill('indic_p');
    else if (b.pointage === 'absent')  html += pill('indic_a');
    return html ? `<span style="position:absolute;right:3px;top:3px;display:flex;flex-direction:column;gap:2px;align-items:center;z-index:1">${html}</span>` : '';
  })();
  return `<div class="badge" style="background:${c.bg};border-color:${c.border};position:relative">
    ${printIndicators}
    <span class="badge-name">${b.structure_label || b.demandeur_label || (b.nom+' '+b.prenom)}</span>
    ${sub ? `<span class="badge-sub">${sub}</span>` : ''}
    ${themeMode && b.theme_label ? `<span class="badge-theme" style="color:${c.accent}">${b.theme_label}</span>` : ''}
  </div>`;
}

function _printCapLabel(left, total) {
  const capText = left <= 0
    ? `<span class="cap-text full">Complet</span>`
    : left <= total * .3
      ? `<span class="cap-text low">${left} place${left>1?'s':''}</span>`
      : `<span class="cap-text ok">${left} place${left>1?'s':''}</span>`;
  return `<div class="cap">${capText}</div>`;
}

// Impression de la vue Agenda hebdomadaire : reproduit fidèlement la grille affichée.
// Clone le DOM #agenda-grid (tous les blocs, bordures, badges, jauges, etc.) et l'injecte
// dans une iframe d'impression avec la feuille de style du site + overrides print/N&B.
function printAgenda(bw) {
  printBW = !!bw;
  const grid = document.getElementById('agenda-grid');
  if (!grid) return;
  // Détermine le sous-titre selon le mode (semaine réelle vs modèle de période).
  let subLabel = '';
  if (agendaMode === 'realweek') {
    subLabel = document.getElementById('agenda-week-label')?.textContent || '';
  } else if (PERIODS[agendaPeriodIdx]) {
    subLabel = PERIODS[agendaPeriodIdx].label;
  }
  const exercice = currentExerciceId
    ? (EXERCICES.find(e => e.id === currentExerciceId)?.label || '')
    : '';
  const serviceLabel = currentService?.label || '';
  const gridHtml = grid.outerHTML;

  let pf = document.getElementById('_print-frame');
  if (pf) pf.remove();
  pf = document.createElement('iframe');
  pf.id = '_print-frame';
  pf.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
  document.body.appendChild(pf);
  const win = pf.contentWindow;
  // URL absolue du CSS du site (réutilise le rendu identique à l'écran).
  const cssHref = document.querySelector('link[href*="public/css/app.css"]')?.href
    || (location.origin + (location.pathname.replace(/\/[^/]*$/, '') || '') + '/public/css/app.css');
  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="fr">
<head>
  <meta charset="utf-8">
  <title>Agenda — ${subLabel || serviceLabel}</title>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Barlow+Condensed:wght@400;600&display=swap" rel="stylesheet">
  <link href="${cssHref}" rel="stylesheet">
  <style>
    /* Pas d'orientation forcée : l'utilisateur peut basculer Paysage/Portrait depuis
       le dialogue d'impression du navigateur. */
    @page { size: A4; margin: 1cm; }
    html, body {
      background: #fff !important;
      color: #000 !important;
      margin: 0; padding: 0;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    body {
      font-family: 'Instrument Sans', 'Segoe UI', sans-serif;
      padding: 0;
    }
    .print-header {
      display: flex; align-items: baseline; justify-content: space-between;
      gap: 1em; padding: 0 0 .15em; margin: 0 0 .25em;
      border-bottom: 1px solid #ccc;
    }
    .print-title { font-size: 10px; font-weight: 400; letter-spacing: .01em; }
    .print-title .resa { font-weight: 600; }
    .print-title em { color: ${printBW ? '#1a1a1a' : '#6dceaa'}; font-style: italic; font-weight: 600; }
    .print-sub { font-size: 9px; color: #555; text-align: right; }
    .print-sub strong { color: #000; font-weight: 600; }
    .agenda-header-cell { padding: .15rem .25rem !important; font-size: 9px !important; }
    /* À l'impression, on rétrécit la grille pour qu'elle tienne sur la page. Le zoom CSS
       conserve les positions absolues calculées en JS et fonctionne dans Chromium/Edge.
       Deux orientations gérées : paysage (zoom plus grand) et portrait (plus serré). */
    @media print and (orientation: landscape) { #agenda-grid { zoom: 0.78; } }
    @media print and (orientation: portrait)  { #agenda-grid { zoom: 0.55; } }

    /* Force fond blanc pour la grille et ses colonnes (le CSS du site cible parfois var(--surface)). */
    #agenda-grid, .agenda-day-col, .agenda-time-col, .agenda-header-cell, .agenda-allday-cell {
      background: #fff !important;
    }
    .agenda-time-mark { color: #555 !important; }
    .agenda-grid-line { border-top-color: rgba(0,0,0,.08) !important; }
    .agenda-grid-line.is-hour { border-top-color: rgba(0,0,0,.18) !important; }
    /* Petits éléments d'UI qui n'ont aucun sens à l'impression. */
    .planning-name-tag-close { display: none !important; }

    ${printBW ? `
      /* Mode N&B : on neutralise la couleur de fond des blocs et le tag jaune/vert. */
      .agenda-block {
        --agenda-block-color: #4a4a4a !important;
        background: rgba(0,0,0,.06) !important;
        border-color: #4a4a4a !important;
        color: #000 !important;
      }
      .agenda-block.is-uniq {
        --agenda-block-color: #4a4a4a !important;
        background: rgba(0,0,0,.04) !important;
      }
      .planning-name-tag {
        background: #f0f0f0 !important;
        color: #000 !important;
        border-color: #bbb !important;
      }
      .planning-name-tag.is-validated { box-shadow: inset 3px 0 0 0 #000 !important; }
    ` : ''}
  </style>
</head>
<body>
  <div class="print-header">
    <div class="print-title"><span class="resa">Cultu</span><em>Rézo</em> — Agenda hebdomadaire</div>
    <div class="print-sub">
      ${serviceLabel ? `<strong>${serviceLabel}</strong>` : ''}
      ${exercice ? ` · ${exercice}` : ''}
      ${subLabel ? ` · ${subLabel}` : ''}
    </div>
  </div>
  ${gridHtml}
</body>
</html>`);
  win.document.close();

  // Attente du chargement du CSS avant d'imprimer (sinon certains styles manquent).
  const triggerPrint = () => { try { win.focus(); win.print(); } catch (_) {} };
  if (win.document.readyState === 'complete') setTimeout(triggerPrint, 400);
  else win.addEventListener('load', () => setTimeout(triggerPrint, 200));
}

function printPlanning() {
  const PRINT_PAGE_ROWS = 10;

  // Découpe un tableau en blocs de n éléments
  function _chunks(arr, n) {
    const out = [];
    for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
    return out.length ? out : [[]];
  }

  // Bloc page : titre période + tableau + légende
  function _pageBlock(t, isFirstBlock, colgroup, thead, rows, legend) {
    return `<div class="${isFirstBlock ? '' : 'page-break'}">
      <div class="period-header">
        <span class="period-dot"></span>
        <span class="period-label">${t.label}</span>
        <span class="period-sep">—</span>
        <span class="period-range">${t.period}</span>
      </div>
      <table>${colgroup}${thead}<tbody>${rows}</tbody></table>
      ${legend}
    </div>`;
  }

  let tableHtml = '';
  let title     = '';
  let legendHtml = `
    <div class="legend">
      ${recurringMode  ? `<span class="legend-item"><span class="indic_r">R</span> Récurrent</span>` : ''}
      ${validationMode ? `<span class="legend-item"><span class="indic_e">E</span> En attente</span>` : ''}
      <span class="legend-item"><span class="indic_p">P</span> Présent</span>
      <span class="legend-item"><span class="indic_a">A</span> Absent</span>
    </div>`;

  if (_activePlanningTabId !== 'planning-rec') {
    title = 'Planning général — séances ponctuelles';
    const _uniqPool = SLOTS_UNIQ_FULL.length ? SLOTS_UNIQ_FULL : SLOTS_UNIQ;
    // Note : parseTime() zero-pad start_time pour eviter que "9:00" trie apres "10:00".
    const sorted = [..._uniqPool].sort((a,b) =>
      (a.slot_date||'').localeCompare(b.slot_date||'') ||
      (parseTime(a.start_time)||'99:99').localeCompare(parseTime(b.start_time)||'99:99'));
    // Le slot porte désormais directement son period_id (migration 2026-05).
    // Fallback derivation par date pour les slots non migrés (au cas où).
    const trimOf = sl => {
      if (sl?.period_id) return sl.period_id;
      const ds = sl?.slot_date;
      if (!ds) return PERIODS[0]?.id ?? 1;
      const found = PERIODS.find(p => p.date_start && p.date_end && ds >= p.date_start && ds <= p.date_end);
      return found ? found.id : (PERIODS[0]?.id ?? 1);
    };
    const _periodsScope = currentExerciceId
      ? PERIODS.filter(p => p.exercice_id === currentExerciceId)
      : PERIODS;
    const groups = _periodsScope.map(t => ({ t, slots: sorted.filter(sl => trimOf(sl) === t.id) }))
                             .filter(g => g.slots.length > 0);
    // Index slot_id -> bookings[] construit une fois (evite O(n*m) en filter + per-slot lookup).
    const bookingsBySlot = new Map();
    for (const b of allBookingsUnique) {
      const arr = bookingsBySlot.get(b.slot_id);
      if (arr) arr.push(b); else bookingsBySlot.set(b.slot_id, [b]);
    }
    const colgroup = `<colgroup><col style="width:92px"><col style="width:50px"><col style="width:50px"><col></colgroup>`;
    const thead    = `<thead><tr><th>Date</th><th>Début</th><th>Fin</th><th>Séance</th></tr></thead>`;
    const groupRows = groups.map(g => ({
      t: g.t,
      rows: (planningHideEmpty ? g.slots.filter(sl => bookingsBySlot.has(sl.id)) : g.slots).map(sl => {
        const bks   = bookingsBySlot.get(sl.id) || [];
        const total = sl.capacity || 6;
        const left  = total - bks.length;
        const badges = bks.map(_printBadge).join('') || '<span class="empty">—</span>';
        return `<tr>
          <td class="cell-date"><div style="display:flex;flex-direction:column;min-height:53px">${_printDateCell(sl.slot_date)}${sl.parent_slot_id?'<span style="font-size:.55rem;font-weight:800;background:rgba(0,0,0,.25);border-radius:3px;padding:1px 3px;margin-left:3px;vertical-align:middle">R</span>':''}<span style="flex:1"></span><div style="display:flex;justify-content:flex-end;margin-bottom:3px">${_printCapLabel(left, total)}</div></div></td>
          <td class="cell-time">${sl.start_time ? displayTime(sl.start_time) : ''}</td>
          <td class="cell-time">${sl.end_time ? displayTime(sl.end_time) : ''}</td>
          <td class="cell-badges"><div class="badges-wrap">${badges}</div></td>
        </tr>`;
      })
    }));
    const buildUniqHtml = (rpp) => {
      let bi = 0;
      return groupRows.map(gr => _chunks(gr.rows, rpp).map(chunk =>
        _pageBlock(gr.t, bi++ === 0, colgroup, thead, chunk.join(''), legendHtml)
      ).join('')).join('');
    };
    tableHtml = `<div class="landscape-only">${buildUniqHtml(10)}</div><div class="portrait-only">${buildUniqHtml(16)}</div>`;
  } else {
    title = 'Planning général';
    const colgroup = `<colgroup><col style="width:60px">${DKEYS.map(() => '<col>').join('')}</colgroup>`;
    const thead    = `<thead><tr><th>Créneau</th>${DAYS.map(d => `<th>${d}</th>`).join('')}</tr></thead>`;
    const _periodsScope = currentExerciceId
      ? PERIODS.filter(p => p.exercice_id === currentExerciceId)
      : PERIODS.filter(p => p.state === 'actif');
    const trimRows = _periodsScope.map(t => {
      const bookingsForPeriod = allBookings.filter(b => parseInt(b.period_id) === t.id);
      const _slotsForPeriod = SLOTS_REC_MAP_FULL[String(t.id)] || SLOTS_REC_MAP[String(t.id)] || [];
      return {
        t,
        rows: (planningHideEmpty ? sortedByTime(_slotsForPeriod).filter(sl => bookingsForPeriod.some(b => b.slot_id === sl.id)) : sortedByTime(_slotsForPeriod)).map(sl => {
          const cells = DKEYS.map(dk => {
            const bks   = bookingsForPeriod.filter(b => b.slot_id === sl.id && b.day_key === dk);
            const total = getCapacity(sl.id, t.id, dk);
            const left  = total - bks.length;
            const badges = bks.map(_printBadge).join('') || '<span class="empty">—</span>';
            return `<td class="cell-badges"><div class="badges-wrap">${badges}</div>${_printCapLabel(left, total)}</td>`;
          }).join('');
          const lbl = slotLabel(sl).replace(' – ', '<br>');
          return `<tr><td class="cell-slot">${lbl}</td>${cells}</tr>`;
        })
      };
    });
    const buildRecHtml = (rpp) => {
      let bi = 0;
      return trimRows.map(tr => _chunks(tr.rows, rpp).map(chunk =>
        _pageBlock(tr.t, bi++ === 0, colgroup, thead, chunk.join(''), legendHtml)
      ).join('')).join('');
    };
    tableHtml = `<div class="landscape-only">${buildRecHtml(10)}</div><div class="portrait-only">${buildRecHtml(16)}</div>`;
  }

  const printDate = new Date().toLocaleDateString('fr-FR', { day:'2-digit', month:'long', year:'numeric' });

  // Lire les couleurs réelles du thème actif (clair ou sombre)
  const cs       = getComputedStyle(document.documentElement);
  const C_DARK   = cs.getPropertyValue('--surface2').trim();   // fond colonne/header
  const C_TEXT   = cs.getPropertyValue('--text').trim();       // texte sur fond sombre
  const C_MUTED  = cs.getPropertyValue('--muted').trim();      // texte secondaire
  const C_BG     = cs.getPropertyValue('--bg').trim();         // fond page
  const C_BORDER = 'rgba(0,0,0,.12)';                          // bordure neutre pour l'impression

  let _pf = document.getElementById('_print-frame');
  if (_pf) _pf.remove();
  _pf = document.createElement('iframe');
  _pf.id = '_print-frame';
  _pf.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;border:none';
  document.body.appendChild(_pf);
  const win = _pf.contentWindow;
  win.document.open();
  win.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
    <title>${title}</title>
    <link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      body {
        font-family: 'Instrument Sans', 'Segoe UI', sans-serif; font-size: 10px;
        color: ${C_TEXT}; margin: 1cm;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }

      /* ── En-tête page ── */
      .print-header {
        display: grid; grid-template-columns: 1fr auto 1fr;
        align-items: center;
        background: #fff; padding: .5em 0; margin-bottom: 1em;
        border-bottom: 1px solid ${C_BORDER};
      }
      .print-title     { font-size: 13px; font-weight: 400; letter-spacing: .01em; text-align: center; }
      .print-title .resa { font-weight: 600; }
      .print-title em  { color: ${printBW ? '#1a1a1a' : '#6dceaa'}; font-style: italic; font-weight: 600; }
      .print-date      { font-size: 8.5px; color: ${C_MUTED}; text-align: right; }
      @page {
        @bottom-right {
          content: counter(page) " / " counter(pages);
          font-size: 8px; color: #888;
          font-family: 'Instrument Sans', 'Segoe UI', sans-serif;
        }
      }
      @media print {
        .print-header { position: fixed; top: 0; left: .7cm; right: .7cm; z-index: 100; }
        body { margin-top: 1.3cm; }
        .page-break { padding-top: 1.3cm; }
      }
      @media print and (orientation: landscape) { .portrait-only  { display: none; } }
      @media print and (orientation: portrait)  { .landscape-only { display: none; } }

      /* ── Titre période ── */
      .page-break { page-break-before: always; }
      /* Titre période */
      .period-header {
        display: flex; align-items: center; gap: .4em;
        padding: .6em .2em .3em;
      }
      .period-dot    { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #000; flex-shrink: 0; }
      .period-label  { font-size: 11px; font-weight: 600; color: #000; }
      .period-sep    { color: #000; font-size: 10px; margin: 0 .2em; }
      .period-range { font-size: 9.5px; font-weight: 400; color: #000; }

      /* ── Tableau ── */
      table { width: 100%; border-collapse: collapse; table-layout: fixed; border: 1px solid ${C_BORDER}; }
      thead { display: table-header-group; }
      th {
        background: ${C_DARK}; color: ${C_TEXT};
        font-size: 8.5px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
        padding: 5px 7px; text-align: center;
        border-right: 1px solid ${C_BORDER}; border-bottom: 1px solid ${C_BORDER};
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }
      th:last-child { border-right: none; }
      th:first-child { text-align: left; }
      tr { page-break-inside: avoid; }
      td {
        border-right: 1px solid ${C_BORDER}; border-bottom: 1px solid ${C_BORDER};
        vertical-align: top; padding: 5px 6px; background: #fff;
      }
      td:last-child { border-right: none; }
      tr:last-child td { border-bottom: none; }

      /* Colonne créneau (mode récurrent) */
      .cell-slot {
        background: ${C_DARK} !important; color: ${C_TEXT} !important;
        font-size: 8.5px; font-weight: 600; text-align: center; vertical-align: middle;
        letter-spacing: .03em; min-width: 58px; line-height: 1.5;
        -webkit-print-color-adjust: exact; print-color-adjust: exact;
      }

      /* Colonnes date/heure (mode ponctuel) */
      .cell-date { text-align: center; vertical-align: top; display: table-cell; }
      .cell-date-day { display: block; font-weight: 600; font-size: 9.5px; }
      .cell-date-num { display: block; font-size: 9px; color: ${C_MUTED}; margin-top: 1px; }
      .cell-time { text-align: center; vertical-align: middle; white-space: nowrap; color: ${C_MUTED}; font-size: 9.5px; }

      /* Cellule badges */
      .cell-badges { padding: 4px 5px 0; min-height: 53px; }
      .badges-wrap { display: flex; flex-wrap: wrap; gap: 3px; min-height: 40px; align-items: flex-start; }

      /* Badge coloré — fidèle à l'écran */
      .badge {
        border: 1px solid; border-radius: 6px;
        padding: 3px 6px;
        display: flex; flex-direction: column; gap: 1px;
        font-size: 9px; width: 100%; max-width: 150px; box-sizing: border-box;
        min-height: 40px;
      }
      .badge-name  { font-weight: 600; font-size: 9.5px; line-height: 1.25; }
      .badge-sub   { font-size: 8px; color: #6b7280; line-height: 1.2; }
      .badge-theme { font-size: 7.5px; font-weight: 600; line-height: 1.2; }

      /* Indicateur de capacité */
      .cap           { font-size: 7.5px; font-weight: 500; margin-top: 2px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
      .cap-text.full { color: ${printBW ? '#000' : '#dc2626'}; }
      .cap-text.low  { color: ${printBW ? '#c0c0c0' : '#d97706'}; }
      .cap-text.ok   { color: ${printBW ? '#1a1a1a' : '#6dceaa'}; }
      .cap-gauge     { display: inline-flex; align-items: center; gap: 3px; font-weight: 500; }
      .cap-gauge-track { display: inline-block; width: 36px; height: 4px; border-radius: 3px; background: rgba(0,0,0,.1); overflow: hidden; flex-shrink: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .cap-gauge-fill  { display: block; height: 100%; border-radius: 3px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .empty    { flex: 1; display: flex; align-items: center; justify-content: center; color: #c4c9d4; font-style: italic; font-size: 8.5px; min-height: 28px; }

      /* Légende */
      .legend {
        display: flex; align-items: center; gap: 14px;
        margin-top: .9em; font-size: 9px; color: #6b7280;
      }
      .legend-label { font-weight: 600; color: #1a1f2e; }
      .legend-item  { display: flex; align-items: center; gap: 5px; }
      .legend-dot   { display: inline-block; width: 11px; height: 11px; border-radius: 3px; }
      .indic_r,.indic_v,.indic_e,.indic_p,.indic_a { display:inline-block;font-size:7px;font-weight:800;color:#fff;border-radius:3px;padding:1px 3px;line-height:1.3;white-space:nowrap;-webkit-print-color-adjust:exact;print-color-adjust:exact; }
      .indic_r { background:rgba(120,120,120,.75); }
      .indic_v { background:${printBW ? 'rgba(15,15,15,.9)' : 'rgba(109,206,170,.9)'}; }
      .indic_e { background:${printBW ? 'rgba(195,195,195,.95)' : 'rgba(232,164,90,.9)'}; ${printBW ? 'color:#222;' : ''} }
      .indic_p { background:${printBW ? 'rgba(40,40,40,.9)' : 'rgba(30,120,80,.9)'}; }
      .indic_a { background:${printBW ? 'rgba(110,110,110,.85)' : 'rgba(220,80,80,.9)'}; }

    </style>
  </head><body>
    <div class="print-header">
      <div></div>
      <div class="print-title"><span class="resa">Cultu</span><em>Rézo</em> &nbsp;·&nbsp; ${title}</div>
      <div class="print-date">${printDate}</div>
    </div>
    ${tableHtml}
  </body></html>`);
  win.document.close();
  win.onafterprint = () => _pf.remove();
  win.print();
}

// ── Statistiques ──────────────────────────────────────────
// ── Stats : helpers ─────────────────────────────────────
function switchStatsTab(t) {
  if (!['rec','uniq','all'].includes(t)) return;
  _statsType = t;
  renderStatsTab();
}
function applyStatsFilters() {
  _statsPeriodId = document.getElementById('stats-filter-period')?.value || '';
  _statsDateFrom = document.getElementById('stats-date-from')?.value     || '';
  _statsDateTo   = document.getElementById('stats-date-to')?.value       || '';
  renderStatsTab();
}
function resetStatsFilters() {
  _statsPeriodId = '';
  _statsDateFrom = '';
  _statsDateTo   = '';
  const sel = document.getElementById('stats-filter-period'); if (sel) sel.value = '';
  const df  = document.getElementById('stats-date-from');     if (df) df.value = '';
  const dt  = document.getElementById('stats-date-to');       if (dt) dt.value = '';
  renderStatsTab();
}

// Helpers internes pour la refonte des stats.
function _statsDayLabel(dk) {
  const map = {lun:'Lundi', mar:'Mardi', mer:'Mercredi', jeu:'Jeudi', ven:'Vendredi', sam:'Samedi', dim:'Dimanche'};
  return map[dk] || dk;
}
function _statsBucketLabel(ym) {
  // ym = "2026-01" → "Janvier 2026"
  if (!ym || !/^\d{4}-\d{2}$/.test(ym)) return ym || '—';
  const months = ['','Janv.','Févr.','Mars','Avril','Mai','Juin','Juil.','Août','Sept.','Oct.','Nov.','Déc.'];
  const [y, m] = ym.split('-').map(Number);
  return `${months[m]} ${y}`;
}
function _statsCardHtml(value, label, modifier = '') {
  return `<div class="stat-card${modifier ? ' ' + modifier : ''}">
    <div class="stat-val">${value ?? '—'}</div>
    <div class="stat-label">${label}</div>
  </div>`;
}

async function renderStatsTab() {
  if (!currentServiceId || currentServiceId === 'admin' || currentServiceId === 'compte') return;

  // États visuels des onglets
  ['rec','uniq','all'].forEach(t => {
    const btn = document.getElementById('stats-tab-' + t);
    if (btn) btn.classList.toggle('active', t === _statsType);
  });

  // Construction de la query
  const qs = new URLSearchParams({ service_id: currentServiceId, type: _statsType });
  if (_statsPeriodId) qs.set('period_id', _statsPeriodId);
  if (_statsDateFrom) qs.set('date_from', _statsDateFrom);
  if (_statsDateTo)   qs.set('date_to',   _statsDateTo);
  if (currentExerciceId) qs.set('exercice_id', currentExerciceId);

  const r = await apiGet(`/stats.php?${qs.toString()}`);
  if (!r.ok) return;

  // Hydratation du dropdown période (depuis la liste serveur, pas les PERIODS clientes
  // qui pourraient être filtrées par exercice).
  const selPeriod = document.getElementById('stats-filter-period');
  if (selPeriod && r.periods_list) {
    const current = _statsPeriodId;
    selPeriod.innerHTML = '<option value="">Toutes les périodes</option>'
      + (r.periods_list || []).map(p => `<option value="${p.id}"${String(p.id) === String(current) ? ' selected' : ''}>${p.label}</option>`).join('');
  }

  // ── KPI cards (conditionnelles selon service_meta) ──
  const meta = r.service_meta || {};
  const k = r.kpis || {};
  const cards = [];
  cards.push(_statsCardHtml(k.total_bookings ?? 0, 'Réservations', 'accent'));
  cards.push(_statsCardHtml(k.distinct_users ?? 0, 'Utilisateurs distincts'));
  if (k.fill_rate_pct !== null && k.fill_rate_pct !== undefined) {
    cards.push(_statsCardHtml(k.fill_rate_pct + '%', 'Taux de remplissage'));
  }
  if (meta.has_validation) {
    cards.push(_statsCardHtml(k.pending ?? 0, 'En attente', 'warn'));
  }
  if (meta.has_pointage) {
    const totalPointed = (k.present || 0) + (k.absent || 0);
    const presPct = totalPointed > 0 ? Math.round(100 * (k.present || 0) / totalPointed) + '%' : '—';
    cards.push(_statsCardHtml(presPct, 'Taux de présence'));
  }
  if (meta.has_gauge) {
    cards.push(_statsCardHtml(k.total_enfants ?? 0, 'Total enfants'));
    cards.push(_statsCardHtml(k.total_accompagnants ?? 0, 'Total adultes'));
  }
  const kpisEl = document.getElementById('stats-kpis');
  if (kpisEl) kpisEl.innerHTML = cards.join('');

  // ── Charts ──
  const COLORS = ['#6dceaa', '#e8a45a', '#a07dd4', '#e06b6b', '#5ab4e8', '#f0c44e', '#7dd4a8', '#b08bd4'];
  const tickColor = '#7a8099';
  const gridColor = 'rgba(255,255,255,.06)';
  const destroyChart = (id) => { if (_chartInstances[id]) { _chartInstances[id].destroy(); delete _chartInstances[id]; } };
  const baseBarOpts = {
    plugins: { legend: { display: false } },
    scales: {
      y: { beginAtZero: true, ticks: { color: tickColor, precision: 0 }, grid: { color: gridColor } },
      x: { ticks: { color: tickColor }, grid: { display: false } },
    },
  };

  // Évolution mensuelle (line)
  destroyChart('evolution');
  const ctEvo = document.getElementById('chart-evolution');
  if (ctEvo) {
    const labels = (r.evolution || []).map(x => _statsBucketLabel(x.bucket));
    const data   = (r.evolution || []).map(x => parseInt(x.count) || 0);
    _chartInstances.evolution = new Chart(ctEvo, {
      type: 'line',
      data: { labels, datasets: [{ data, borderColor: COLORS[0], backgroundColor: COLORS[0] + '33', tension: .3, fill: true, pointRadius: 3 }] },
      options: baseBarOpts,
    });
  }

  // Par jour de la semaine
  destroyChart('days');
  const ctDays = document.getElementById('chart-days');
  if (ctDays) {
    const labels = (r.by_day || []).map(x => _statsDayLabel(x.day_key));
    const data   = (r.by_day || []).map(x => parseInt(x.count) || 0);
    _chartInstances.days = new Chart(ctDays, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: COLORS[1] }] },
      options: baseBarOpts,
    });
  }

  // Top créneaux remplis (bar horizontal)
  destroyChart('fill');
  const ctFill = document.getElementById('chart-fill');
  if (ctFill) {
    const labels = (r.by_slot_fill || []).map(x => x.label);
    const data   = (r.by_slot_fill || []).map(x => x.fill_pct);
    _chartInstances.fill = new Chart(ctFill, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: COLORS[2] }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => ctx.parsed.x + '%' } } },
        scales: {
          x: { beginAtZero: true, max: 100, ticks: { color: tickColor, callback: v => v + '%' }, grid: { color: gridColor } },
          y: { ticks: { color: tickColor }, grid: { display: false } },
        },
      },
    });
  }

  // Par période (bar avec couleurs des périodes)
  destroyChart('periods');
  const ctPer = document.getElementById('chart-periods');
  if (ctPer) {
    const labels = (r.by_period || []).map(x => x.label || `#${x.period_id}`);
    const data   = (r.by_period || []).map(x => parseInt(x.count) || 0);
    const bg     = (r.by_period || []).map(x => x.color || COLORS[0]);
    _chartInstances.periods = new Chart(ctPer, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: bg }] },
      options: baseBarOpts,
    });
  }

  // Top structures (bar horizontal)
  destroyChart('structures');
  const ctStr = document.getElementById('chart-structures');
  if (ctStr) {
    const labels = (r.top_structures || []).map(x => x.label);
    const data   = (r.top_structures || []).map(x => parseInt(x.count) || 0);
    _chartInstances.structures = new Chart(ctStr, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: COLORS[3] }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { color: tickColor, precision: 0 }, grid: { color: gridColor } },
          y: { ticks: { color: tickColor }, grid: { display: false } },
        },
      },
    });
  }

  // Top niveaux (bar horizontal)
  destroyChart('niveaux');
  const ctNiv = document.getElementById('chart-niveaux');
  if (ctNiv) {
    const labels = (r.top_niveaux || []).map(x => x.label);
    const data   = (r.top_niveaux || []).map(x => parseInt(x.count) || 0);
    _chartInstances.niveaux = new Chart(ctNiv, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: COLORS[4] }] },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { color: tickColor, precision: 0 }, grid: { color: gridColor } },
          y: { ticks: { color: tickColor }, grid: { display: false } },
        },
      },
    });
  }

  // Pointage (doughnut) — uniquement si has_pointage
  destroyChart('pointage');
  const ptPanel = document.getElementById('stats-panel-pointage');
  if (ptPanel) ptPanel.style.display = meta.has_pointage ? '' : 'none';
  const ctPt = document.getElementById('chart-pointage');
  if (ctPt && meta.has_pointage) {
    const pt = r.pointage || {};
    _chartInstances.pointage = new Chart(ctPt, {
      type: 'doughnut',
      data: {
        labels: ['Présents', 'Absents', 'Non pointés'],
        datasets: [{ data: [pt.present || 0, pt.absent || 0, pt.untracked || 0], backgroundColor: [COLORS[0], COLORS[3], 'rgba(255,255,255,.15)'] }],
      },
      options: { plugins: { legend: { position: 'bottom', labels: { color: tickColor, font: { size: 10 } } } } },
    });
  }
}

// ── Paramètres — Jours ────────────────────────────────────
function renderDaysCheckboxes() {
  const panel = document.getElementById('days-panel');
  if (panel) panel.style.display = '';
  const el = document.getElementById('days-checkboxes');
  if (!el) return;
  el.innerHTML = ALL_DKEYS.map((dk,i) => `
    <label style="display:flex;align-items:center;gap:.3rem;cursor:pointer;font-size:.75rem;font-weight:500;text-transform:none;letter-spacing:0">
      <input type="checkbox" id="day-cb-${dk}" class="admin-cb day-cb" ${ACTIVE_DKEYS.includes(dk)?'checked':''}
        style="accent-color:var(--accent);width:13px;height:13px" onchange="applyActiveDays()">
      ${ALL_DAYS[i]}
    </label>`).join('');
  const cbFerie = document.getElementById('day-cb-ferie');
  if (cbFerie) cbFerie.checked = openOnHolidays;
}

async function applyOpenOnHolidays() {
  const val = document.getElementById('day-cb-ferie')?.checked ? 1 : 0;
  const r = await apiPost('/services.php?action=update', { id: currentServiceId, open_on_holidays: val });
  if (r.ok) {
    openOnHolidays = !!val;
    if (currentService) currentService.open_on_holidays = !!val;
    showToast('✅ Jours fériés enregistrés');
  }
}

async function applyActiveDays() {
  const selected = ALL_DKEYS.filter(dk => document.getElementById(`day-cb-${dk}`)?.checked);
  if (!selected.length) { showToast('⚠️ Au moins un jour requis'); return; }
  const r = await apiPost('/services.php?action=update', { id: currentServiceId, active_days: selected });
  if (r.ok) {
    ACTIVE_DKEYS = selected;
    DKEYS = ALL_DKEYS.filter(k => ACTIVE_DKEYS.includes(k));
    DAYS  = DKEYS.map(k => ALL_DAYS[ALL_DKEYS.indexOf(k)]);
    if (currentService) currentService.active_days = selected;
    _editSlotsRec = []; _editSlotsRecMap = {}; _editSlotsUniq = [];
    renderCapTabs();
    renderCapEditor();
    showToast('✅ Jours enregistrés');
  }
}

// ── Paramètres — Créneaux ─────────────────────────────────
function renderCapTabs() {
  const el = document.getElementById('cap-period-tabs-2');
  if (!el) return;
  // Si l'utilisateur n'a pas encore choisi de période, se placer sur celle en cours
  _ensureCapPeriodDefault();
  el.innerHTML = '';
  PERIODS.forEach((p, i) => {
    if (p.state !== 'actif') return;
    const btn = document.createElement('button');
    btn.className = 'period-btn' + (i === capPeriodIdx ? ' active' : '');
    btn.innerHTML = `<span class="period-badge"></span>${p.label}`;
    btn.onclick = () => switchCapPeriod(i);
    el.appendChild(btn);
  });
}

function switchCapPeriod(i) {
  if (i === capPeriodIdx) return;
  _capPeriodUserPicked = true;
  // Sauvegarder les éditions en cours pour la période actuelle
  const oldPid = String(PERIODS[capPeriodIdx]?.id ?? '');
  _editSlotsRecMap[oldPid] = _editSlotsRec;
  // Charger la période sélectionnée
  capPeriodIdx = i;
  const newPid = String(PERIODS[capPeriodIdx]?.id ?? '');
  _editSlotsRec = _editSlotsRecMap[newPid] !== undefined
    ? _editSlotsRecMap[newPid]
    : [];  // sera initialisé dans renderCapEditorRec
  _slotPageRec = 0;
  renderCapTabs();
  renderCapEditor();
}

// Helpers : un créneau a-t-il des réservations ? Quel est le minimum de places ?
function _slotHasReservations(slotId, periodId, isRec) {
  if (isRec) {
    const c = serverCounts[periodId]?.[slotId] || {};
    const g = serverGaugeSums[periodId]?.[slotId] || {};
    for (const dk of ['lun','mar','mer','jeu','ven','sam','dim']) {
      // dk pointe maintenant vers un objet indexé par week ; on somme les semaines
      if (_sumOverWeeks(c[dk]) > 0 || _sumOverWeeks(g[dk]) > 0) return true;
    }
    return false;
  }
  return (serverCounts[slotId]||0) > 0 || (serverGaugeSums[slotId]||0) > 0;
}
// Existe-t-il des réservations pour ce slot/période, ciblées sur une semaine donnée ?
function _slotHasReservationsForWeek(slotId, periodId, week) {
  const c = serverCounts[periodId]?.[slotId];
  const g = serverGaugeSums[periodId]?.[slotId];
  if (!c && !g) return false;
  for (const dk of ['lun','mar','mer','jeu','ven','sam','dim']) {
    if ((c?.[dk]?.[week] || 0) > 0 || (g?.[dk]?.[week] || 0) > 0) return true;
  }
  return false;
}
function _slotMinCap(slotId, periodId, dayKey, isRec) {
  if (isRec) {
    return Math.max(_sumOverWeeks(serverCounts[periodId]?.[slotId]?.[dayKey]), _sumOverWeeks(serverGaugeSums[periodId]?.[slotId]?.[dayKey]));
  }
  return Math.max(serverCounts[slotId]||0, serverGaugeSums[slotId]||0);
}

// Helpers pour les mutations de _editSlotsRec/_editSlotsUniq par ID (évite les bugs d'index avec sortedByTime)
function _slotSet(slotId, field, val) {
  const isRec = !!_editSlotsRec.find(s => s.id === slotId);
  const sl = isRec ? _editSlotsRec.find(s => s.id === slotId) : _editSlotsUniq.find(s => s.id === slotId);
  if (!sl) return;
  // Pour uniq, clamper la capacité au minimum (réservations déjà effectuées)
  if (!isRec && field === 'capacity') {
    const minC = _slotMinCap(slotId, null, null, false);
    const n = parseInt(val) || 0;
    val = Math.max(minC, n);
  }
  sl[field] = val;
  const _dur = isRec ? recurDuration : ponctDuration;
  if (field === 'start_time' && _dur < 1440 && /^\d{1,2}:\d{2}$/.test(val)) {
    sl.end_time = addMinutes(val, _dur);
    const endEl = document.getElementById('slot-end-' + slotId);
    if (endEl) endEl.value = sl.end_time;
  }
}
// Pose des horaires par défaut sur un créneau récurrent "journée entière"
// (start_time + end_time auto-calculé par _slotSet selon recurDuration), puis re-render
// pour faire apparaître les inputs éditables à la place du libellé "Journée entière".
function _slotInitTimes(slotId) {
  const sl = _editSlotsRec.find(s => s.id === slotId);
  if (!sl) return;
  _slotSet(slotId, 'start_time', '09:00');
  // Filet de sécurité : si recurDuration ≥ 1440 (journée entière par défaut),
  // _slotSet ne calcule pas end_time → on en pose un.
  if (!sl.end_time) sl.end_time = addMinutes('09:00', 60);
  renderCapEditorRec(_slotPageRec);
}
function _slotCapSet(slotId, dayKey, val) {
  const sl = _editSlotsRec.find(s => s.id === slotId) || _editSlotsUniq.find(s => s.id === slotId);
  if (!sl) return;
  if (!sl.cap) sl.cap = {};
  let n = parseInt(val) || 0;
  // Clamper au minimum (réservations déjà effectuées sur ce jour)
  const periodId = PERIODS[capPeriodIdx]?.id ?? null;
  if (periodId !== null) {
    const minC = _slotMinCap(slotId, periodId, dayKey, true);
    if (n < minC) n = minC;
  }
  sl.cap[dayKey] = n;
}

function renderCapEditor(goToPage = null) {
  _ensureCapPeriodDefault();
  renderCapEditorRec(goToPage);
  renderCapEditorUniq(goToPage);
  renderCapEditorMir(goToPage);
}

function renderRecurDaysFilter() {
  const el = document.getElementById('recur-days-filter');
  if (!el) return;
  const fullLabel = {
    lun: 'Lundi', mar: 'Mardi', mer: 'Mercredi', jeu: 'Jeudi',
    ven: 'Vendredi', sam: 'Samedi', dim: 'Dimanche',
  };
  el.innerHTML = ACTIVE_DKEYS.map(dk => `
    <label style="display:flex;align-items:center;gap:.25rem;cursor:pointer;font-size:.68rem;font-weight:normal;letter-spacing:.06em;color:var(--text);white-space:nowrap;user-select:none;text-transform:none">
      <input type="checkbox" class="admin-cb recur-day-cb" data-dk="${dk}" checked
        style="accent-color:var(--accent);width:11px;height:11px">
      ${fullLabel[dk] || dk}
    </label>`).join('');
}

function renderCapEditorRec(goToPage = null) {
  const el = document.getElementById('cap-editor-2');
  if (!el) return;
  // Initialisation depuis SLOTS_REC_MAP si le buffer est vide
  if (!_editSlotsRec.length) {
    const pid = String(PERIODS[capPeriodIdx]?.id ?? '');
    const source = JSON.parse(JSON.stringify(SLOTS_REC_MAP[pid] || []));
    // Convertir caps string → cap object { dayKey: capacity }
    for (const sl of source) {
      if (sl.caps && !sl.cap) {
        sl.cap = {};
        for (const c of sl.caps.split('|')) {
          const [day, cap] = c.split(':');
          if (day) sl.cap[day] = parseInt(cap) || 0;
        }
        delete sl.caps;
      } else if (!sl.cap) {
        sl.cap = {};
      }
    }
    // Tri initial UNIQUEMENT à l'initialisation du buffer : l'ordre est ensuite
    // figé pendant toute la phase d'édition (pour éviter qu'une ligne ne saute
    // de position quand on lui ajoute des horaires) et n'est régénéré que sur
    // enregistrement ou annulation, qui vident _editSlotsRec.
    _editSlotsRec = sortedByTime(source);
    _slotPageRec = goToPage !== null ? goToPage : 0;
  }
  // Préserver la sélection inter-rendus, mais purger les IDs qui n'existent plus
  const _existingIds = new Set(_editSlotsRec.map(s => s.id));
  for (const id of [..._slotDelSelectionRec]) if (!_existingIds.has(id)) _slotDelSelectionRec.delete(id);
  const bar = document.getElementById('slot-delete-bar');
  if (bar) bar.style.visibility = _slotDelSelectionRec.size ? 'visible' : 'hidden';
  const cnt = document.getElementById('slot-delete-count');
  if (cnt) cnt.textContent = `${_slotDelSelectionRec.size} sélectionné(s)`;
  const _periodIdRec = PERIODS[capPeriodIdx]?.id ?? null;
  // Masquer le bouton Supprimer si une ligne cochée a des réservations
  {
    const _anyResChecked = [..._slotDelSelectionRec].some(id => _slotHasReservations(id, _periodIdRec, true));
    const _suprBtn = document.getElementById('btn-supprimer-rec');
    if (_suprBtn) _suprBtn.style.display = _anyResChecked ? 'none' : '';
  }
  // Bouton Annuler : visible si la sélection est non vide ou s'il y a un nouveau slot non enregistré
  {
    const _pid = String(_periodIdRec ?? '');
    const _savedRecIds = new Set((SLOTS_REC_MAP[_pid] || []).map(s => String(s.id)));
    const _hasNew = _editSlotsRec.some(s => !_savedRecIds.has(String(s.id)));
    const _btn = document.getElementById('slot-cancel-rec');
    if (_btn) _btn.style.display = (_slotDelSelectionRec.size || _hasNew) ? '' : 'none';
  }

  // Plus de re-tri ici : on s'appuie sur l'ordre figé de _editSlotsRec (cf. init).
  // Le tri ne s'applique qu'à la prochaine régénération du buffer (save / cancel / changement de période).
  const totalPages = Math.max(1, Math.ceil(_editSlotsRec.length / SLOT_PAGE_SIZE));
  _slotPageRec = Math.min(_slotPageRec, totalPages - 1);
  const offset = _slotPageRec * SLOT_PAGE_SIZE;
  const pageSlots = _editSlotsRec.slice(offset, offset + SLOT_PAGE_SIZE);
  const abMode = _currentDemSettings.some(function(r) { return r.semaine_ab; });
  const pagerHtml = `
    <div style="display:flex;align-items:center;justify-content:center;gap:.5rem;font-size:.82rem">
      <button class="btn btn-ghost" style="padding:2px 8px" onclick="slotPageGoRec(${_slotPageRec - 1})" ${_slotPageRec === 0 ? 'disabled' : ''}>‹</button>
      <span style="color:var(--muted)">Page ${_slotPageRec + 1} / ${totalPages}</span>
      <button class="btn btn-ghost" style="padding:2px 8px" onclick="slotPageGoRec(${_slotPageRec + 1})" ${_slotPageRec >= totalPages - 1 ? 'disabled' : ''}>›</button>
    </div>`;
  el.innerHTML = `<div class="planning-wrap">
    <table class="admin-table cap-editor-table">
      <thead><tr>
        <th class="col-check" style="width:32px"><input type="checkbox" class="admin-cb" id="slot-del-all" onchange="toggleAllSlotDelRec(this)"></th>
        ${abMode ? `<th style="width:110px;text-align:center">Semaine</th>` : ''}
        <th style="width:70px;text-align:center">Début</th>
        <th style="width:70px;text-align:center">Fin</th>
        ${DAYS.map(d=>`<th style="text-align:center">${d}</th>`).join('')}
        <th style="width:36px;text-align:center" title="Demandeurs autorisés">👥</th>
      </tr></thead>
      <tbody>${pageSlots.map(sl => {
        const _checked = _slotDelSelectionRec.has(sl.id);
        const _isReserved = _slotHasReservations(sl.id, _periodIdRec, true);
        // Capacité : éditable dès que la ligne est cochée (même si réservé)
        const _disCap     = _checked ? '' : ' disabled';
        // Horaires + boutons d'effacement : désactivés si non coché OU si réservé
        const _disTime    = (_checked && !_isReserved) ? '' : ' disabled';
        const _disCapClear= (_checked && !_isReserved) ? '' : ' disabled';
        const _demCount   = (sl.demandeur_ids || []).length;
        const _demBtnStyle = _demCount
          ? 'background:var(--accent-dim);border-color:var(--accent);color:var(--accent)'
          : 'color:var(--muted)';
        return `<tr>
        <td class="col-check"><input type="checkbox" class="admin-cb slot-del-cb" data-id="${sl.id}"${_checked?' checked':''} onchange="toggleSlotDelRec(this)"></td>
        ${abMode ? (() => {
          const _curWeeks = _slotWeeks(sl) || 'A,B';
          // Lecture seule (ligne non cochée) → badge simple
          if (!_checked) return `<td style="text-align:center">${_weekAbBadge(_curWeeks)}</td>`;
          // Édition : on calcule quelles options sont compatibles avec les réservations existantes.
          // Règle : on ne peut pas désactiver une semaine qui a déjà des réservations
          // (sinon les badges deviendraient orphelins). Le choix courant reste toujours sélectionnable.
          const _hasA = _slotHasReservationsForWeek(sl.id, _periodIdRec, 'A');
          const _hasB = _slotHasReservationsForWeek(sl.id, _periodIdRec, 'B');
          const _bothBooked = _hasA && _hasB;
          // 'A,B' couvre toujours les bookings existants → autorisé
          // 'A seul.' interdit si B a des bookings (orphelins)
          // 'B seul.' interdit si A a des bookings (orphelins)
          const _allowAB = true;
          let _allowA = !_hasB;
          let _allowB = !_hasA;
          // Le choix courant reste toujours autorisé (même s'il deviendrait incohérent à terme)
          if (_curWeeks === 'A') _allowA = true;
          if (_curWeeks === 'B') _allowB = true;
          // Bookings sur A et B → pas de degré de liberté → dropdown désactivé
          const _selDisabled = _bothBooked ? ' disabled title="Réservations sur A et B : impossible de restreindre"' : '';
          return `<td style="text-align:center"><select onchange="_slotSet('${sl.id}','weeks',this.value)" style="font-size:.72rem;padding:1px 3px"${_selDisabled}>
            <option value="A,B"${_curWeeks==='A,B'?' selected':''}${_allowAB?'':' disabled'}>Semaines A & B</option>
            <option value="A"${_curWeeks==='A'?' selected':''}${_allowA?'':' disabled'}>Semaine A</option>
            <option value="B"${_curWeeks==='B'?' selected':''}${_allowB?'':' disabled'}>Semaine B</option>
          </select></td>`;
        })() : ''}
        ${(() => {
          // Créneau sans heure de début ni de fin → journée entière (cellule fusionnée sur les 2 colonnes)
          const _isAllDay = !sl.start_time && !sl.end_time;
          if (_isAllDay) {
            const _canEdit = _checked && !_isReserved;
            const _addBtn = _canEdit
              ? `<button class="cell-add-btn" style="margin-left:.4rem" onclick="_slotInitTimes('${sl.id}')" title="Définir une heure de début et de fin">➕</button>`
              : '';
            return `<td colspan="2" style="text-align:center"><span style="color:var(--muted);font-size:.72rem;font-style:italic" title="Créneau sans horaire (journée complète)">Journée entière</span>${_addBtn}</td>`;
          }
          const _startCell = `<td>${sl.start_time
            ? `<span class="cell-input-wrap"><span class="time-step-wrap"><input type="text" id="slot-start-${sl.id}" value="${sl.start_time}"${_disTime} placeholder="09:30" style="width:58px;font-size:.78rem" oninput="_slotSet('${sl.id}','start_time',this.value.replace('h',':'))">${_timeStepBtns('slot-start-'+sl.id, !!_disTime)}</span><button class="cell-clear-btn" onclick="_slotClear('${sl.id}','start_time')"${_disTime} title="Effacer">🚫</button></span>`
            : `<span style="color:var(--muted);font-size:.75rem">—</span>`}</td>`;
          const _endCell = `<td>${sl.end_time
            ? `<input type="text" id="slot-end-${sl.id}" value="${sl.end_time}" readonly style="width:58px;font-size:.78rem;color:var(--muted);cursor:default;pointer-events:none">`
            : `<span style="color:var(--muted);font-size:.75rem">—</span>`}</td>`;
          return _startCell + _endCell;
        })()}
        ${DKEYS.map(dk => {
          const hasDay = sl.cap && dk in sl.cap;
          const cap = hasDay ? sl.cap[dk] : defaultCapacity;
          if (hasDay) {
            const _minC = _slotMinCap(sl.id, _periodIdRec, dk, true);
            // Bouton 🚫 capacité : autorisé uniquement si la ligne est cochée ET ce jour n'a pas de réservations
            const _disClearDay = (_checked && _minC === 0) ? '' : ' disabled';
            return `<td style="text-align:center"><span class="cell-input-wrap"><input type="number" id="slot-cap-${sl.id}-${dk}" min="${_minC}" max="99" value="${cap}"${_disCap} style="width:52px;text-align:center;font-size:.78rem" oninput="_slotCapSet('${sl.id}','${dk}',this.value)" onchange="if(parseInt(this.value)<${_minC})this.value=${_minC}"><button class="cell-clear-btn" onclick="_slotClearCap('${sl.id}','${dk}')"${_disClearDay} title="Effacer">🚫</button></span></td>`;
          }
          if (_checked) {
            return `<td style="text-align:center"><button class="cell-add-btn" onclick="_slotAddCap('${sl.id}','${dk}')" title="Activer ce jour">➕</button></td>`;
          }
          return `<td style="text-align:center"><span style="color:var(--muted);font-size:.75rem">—</span></td>`;
        }).join('')}
        <td style="text-align:center"><button type="button" class="btn btn-ghost dem-row-btn" onclick="openDemandeursModal('rec','${sl.id}')" title="${_demCount ? _demCount + ' demandeur(s) autorisé(s)' : 'Aucune restriction — cliquer pour configurer'}" style="padding:1px 5px;font-size:.78rem;line-height:1;border-radius:var(--rad-sm);${_demBtnStyle}">👥</button></td>
      </tr>`;}).join('')}</tbody>
    </table>
  </div>`;
  const sp1 = document.getElementById('slot-pager');
  if (sp1) sp1.innerHTML = pagerHtml;
}

function _slotDateWeekAB(dateStr) {
  // Retourne 'A' (semaine ISO paire) ou 'B' (semaine ISO impaire)
  // Calcul en UTC pour éviter les décalages DST (heure d'été/hiver)
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  const ms    = Date.UTC(y, m - 1, d);
  const jan4  = Date.UTC(y, 0, 4);
  const dow   = new Date(jan4).getUTCDay();         // 0=dim … 6=sam
  const w1Mon = jan4 - ((dow + 6) % 7) * 86400000; // lundi de S1 en UTC
  const w     = Math.floor((ms - w1Mon) / (7 * 86400000)) + 1;
  return w % 2 === 0 ? 'A' : 'B';
}
// Lecture unifiée : `weeks` (nouveau modèle, ex. 'A,B') OU `week_ab` (ancien modèle, ex. 'A')
function _slotWeeks(sl) {
  return sl?.weeks ?? sl?.week_ab ?? null;
}
// Le slot s'applique-t-il à la semaine isoEvenIs (semaine 'A' si pair, 'B' sinon) ?
function _slotMatchesWeek(sl, isWeekA) {
  const w = _slotWeeks(sl);
  if (!w) return true; // pas de contrainte → toujours applicable
  const list = String(w).split(',').map(s => s.trim()).filter(Boolean);
  return (isWeekA && list.includes('A')) || (!isWeekA && list.includes('B'));
}
function _weekAbBadge(w) {
  if (!w) return `<span style="font-size:.7rem;font-weight:700;letter-spacing:.08em;color:var(--text)">Toutes</span>`;
  // Liste 'A,B' → "Semaines A & B" ; sinon "Semaine X"
  const list = String(w).split(',').map(s => s.trim()).filter(Boolean);
  const label = list.length > 1
    ? `Semaines ${list.join(' & ')}`
    : `Semaine ${list[0] || w}`;
  return `<span style="font-size:.7rem;font-weight:700;letter-spacing:.08em;color:var(--text)">${label}</span>`;
}
function renderCapEditorUniq(goToPage = null) {
  const el = document.getElementById('cap-editor-uniq');
  if (!el) return;
  // Initialisation depuis SLOTS_UNIQ si le buffer est vide.
  // _editSlotsUniq contient TOUS les slots ponctuels (manuels + miroirs actifs + miroirs désactivés)
  // car la sauvegarde sert l'API qui attend l'ensemble. La répartition se fait au rendu :
  //   - cap-editor-uniq (cette fonction) → ponctuels manuels uniquement
  //   - cap-editor-mir  (renderCapEditorMir) → miroirs (actifs + désactivés) du période courant
  if (!_editSlotsUniq.length) {
    const active = JSON.parse(JSON.stringify(SLOTS_UNIQ || []));
    const disabledMirrors = (SLOTS_UNIQ_FULL || [])
      .filter(s => s.parent_slot_id && s.state && s.state !== 'actif')
      .map(s => JSON.parse(JSON.stringify(s)));
    _editSlotsUniq = active.concat(disabledMirrors);
    _slotPageUniq = goToPage !== null ? goToPage : 0;
  }
  // Tableau ponctuels purs : on filtre les miroirs (ils ont leur propre tableau).
  const pureManuals = _editSlotsUniq.filter(s => !s.parent_slot_id);
  const _manualIds  = new Set(pureManuals.map(s => String(s.id)));
  // Purger sélection : enlever les IDs qui ne sont plus des manuels visibles ici.
  for (const id of [..._slotDelSelectionUniq]) if (!_manualIds.has(id)) _slotDelSelectionUniq.delete(id);
  const barU = document.getElementById('slot-delete-bar-uniq');
  if (barU) barU.style.visibility = _slotDelSelectionUniq.size ? 'visible' : 'hidden';
  const cntU = document.getElementById('slot-delete-count-uniq');
  if (cntU) cntU.textContent = `${_slotDelSelectionUniq.size} sélectionné(s)`;
  // Bouton Supprimer : masqué si une ligne cochée a des réservations
  {
    const _anyResChecked = [..._slotDelSelectionUniq].some(id => _slotHasReservations(id, null, false));
    const _suprBtn = document.getElementById('btn-supprimer-uniq');
    if (_suprBtn) {
      _suprBtn.style.display = _anyResChecked ? 'none' : '';
      _suprBtn.textContent = 'Supprimer';
    }
  }
  // Bouton Annuler : visible si la sélection est non vide ou s'il y a un nouveau slot non enregistré
  {
    const _savedUniqIds = new Set((SLOTS_UNIQ || []).map(s => String(s.id)));
    const _hasNew = pureManuals.some(s => !_savedUniqIds.has(String(s.id)));
    const _btn = document.getElementById('slot-cancel-uniq');
    if (_btn) _btn.style.display = (_slotDelSelectionUniq.size || _hasNew) ? '' : 'none';
  }

  const visibleSlots = pureManuals;
  const totalPages = Math.max(1, Math.ceil(visibleSlots.length / SLOT_PAGE_SIZE));
  _slotPageUniq = Math.min(_slotPageUniq, totalPages - 1);
  const offset = _slotPageUniq * SLOT_PAGE_SIZE;
  const pageSlots = visibleSlots.slice(offset, offset + SLOT_PAGE_SIZE);
  const pagerHtml = `
    <div style="display:flex;align-items:center;justify-content:center;gap:.5rem;font-size:.82rem">
      <button class="btn btn-ghost" style="padding:2px 8px" onclick="slotPageGoU(${_slotPageUniq - 1})" ${_slotPageUniq === 0 ? 'disabled' : ''}>‹</button>
      <span style="color:var(--muted)">Page ${_slotPageUniq + 1} / ${totalPages}</span>
      <button class="btn btn-ghost" style="padding:2px 8px" onclick="slotPageGoU(${_slotPageUniq + 1})" ${_slotPageUniq >= totalPages - 1 ? 'disabled' : ''}>›</button>
    </div>`;
  const _savedIds = new Set((SLOTS_UNIQ || []).map(s => String(s.id)));
  el.innerHTML = `<div class="planning-wrap">
    <table class="admin-table cap-editor-table">
      <thead><tr>
        <th class="col-check" style="width:32px;text-align:center"><input type="checkbox" class="admin-cb" id="slot-del-all-u" onchange="toggleAllSlotDelU(this)"></th>
        <th style="text-align:center;width:52px">Semaine</th>
        <th style="text-align:center;width:130px">Date</th><th style="text-align:center;width:80px">Début</th><th style="text-align:center;width:80px">Fin</th><th style="text-align:center;width:80px">Capacité</th>
        <th style="width:36px;text-align:center" title="Demandeurs autorisés">👥</th>
      </tr></thead>
      <tbody>${pageSlots.map(sl => {
        const _checked    = _slotDelSelectionUniq.has(String(sl.id));
        const _isExisting = _savedIds.has(String(sl.id)); // déjà enregistré côté serveur
        const _isReserved = _isExisting && _slotHasReservations(sl.id, null, false);
        // Date / horaires : désactivés si non coché OU réservé
        const _disTime = ((_isExisting && !_checked) || _isReserved) ? ' disabled' : '';
        // Capacité : éditable dès que la ligne est cochée (même si réservé)
        const _disCap  = (_isExisting && !_checked) ? ' disabled' : '';
        const _minC    = _slotMinCap(sl.id, null, null, false);
        const _demCount   = (sl.demandeur_ids || []).length;
        const _demBtnStyle = _demCount
          ? 'background:var(--accent-dim);border-color:var(--accent);color:var(--accent)'
          : 'color:var(--muted)';
        return `<tr>
        <td class="col-check" style="text-align:center"><input type="checkbox" class="admin-cb slot-del-cb-u" data-id="${sl.id}"${_checked ? ' checked' : ''} onchange="toggleSlotDelU(this)"></td>
        <td style="text-align:center">${_slotWeeks(sl) ? _weekAbBadge(_slotWeeks(sl)) : ''}</td>
        <td style="text-align:center"><input type="date" value="${sl.slot_date||''}" style="font-size:.78rem" oninput="_slotSet('${sl.id}','slot_date',this.value)"${_disTime}></td>
        <td style="text-align:center">${sl.start_time
          ? `<span class="time-step-wrap"><input type="text" id="slot-uniq-start-${sl.id}" value="${sl.start_time}" style="width:58px;font-size:.78rem;text-align:center" oninput="_slotSet('${sl.id}','start_time',this.value.replace('h',':'))"${_disTime}>${_timeStepBtns('slot-uniq-start-'+sl.id, !!_disTime)}</span>`
          : ''}</td>
        <td style="text-align:center">${sl.end_time
          ? `<input type="text" id="slot-end-${sl.id}" value="${sl.end_time}" readonly style="width:58px;font-size:.78rem;text-align:center;color:var(--muted);cursor:default;pointer-events:none">`
          : ''}</td>
        <td style="text-align:center"><input type="number" min="${Math.max(1,_minC)}" max="99" value="${sl.capacity||defaultCapacity}" style="width:52px;font-size:.78rem;text-align:center" oninput="_slotSet('${sl.id}','capacity',parseInt(this.value)||1)" onchange="if(parseInt(this.value)<${Math.max(1,_minC)})this.value=${Math.max(1,_minC)}"${_disCap}></td>
        <td style="text-align:center"><button type="button" class="btn btn-ghost dem-row-btn" onclick="openDemandeursModal('uniq','${sl.id}')" title="${_demCount ? _demCount + ' demandeur(s) autorisé(s)' : 'Aucune restriction — cliquer pour configurer'}" style="padding:1px 5px;font-size:.78rem;line-height:1;border-radius:var(--rad-sm);${_demBtnStyle}">👥</button></td>
      </tr>`;}).join('')}</tbody>
    </table>
  </div>`;
  const sp2 = document.getElementById('slot-pager-uniq');
  if (sp2) sp2.innerHTML = pagerHtml;
}

function addMinutes(time, minutes) {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
}
function timeToMin(time) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
function nextSlotStart() {
  // Mode récurrent : cherche le prochain horaire disponible toutes dates confondues
  const ranges = [[morningStart, morningEnd], [afternoonStart, afternoonEnd]];
  for (const [rangeStart, rangeEnd] of ranges) {
    const rsMin = timeToMin(rangeStart);
    const reMin = timeToMin(rangeEnd);
    let fill = rsMin;
    for (const sl of _editSlotsRec) {
      if (!sl.start_time || !sl.end_time) continue;
      const sMin = timeToMin(sl.start_time);
      const eMin = timeToMin(sl.end_time);
      if (sMin >= rsMin && eMin <= reMin) fill = Math.max(fill, eMin);
    }
    if (fill + recurDuration <= reMin) {
      return String(Math.floor(fill / 60)).padStart(2, '0') + ':' + String(fill % 60).padStart(2, '0');
    }
  }
  return null;
}
function nextSlotForDate(date) {
  // Mode ponctuel : prochain horaire disponible sur une date donnée
  const ranges = [[morningStart, morningEnd], [afternoonStart, afternoonEnd]];
  const slotsOnDate = _editSlotsUniq.filter(sl => sl.slot_date === date);
  for (const [rangeStart, rangeEnd] of ranges) {
    const rsMin = timeToMin(rangeStart);
    const reMin = timeToMin(rangeEnd);
    let fill = rsMin;
    for (const sl of slotsOnDate) {
      if (!sl.start_time || !sl.end_time) continue;
      const sMin = timeToMin(sl.start_time);
      const eMin = timeToMin(sl.end_time);
      if (sMin >= rsMin && eMin <= reMin) fill = Math.max(fill, eMin);
    }
    if (fill + ponctDuration <= reMin) {
      return String(Math.floor(fill / 60)).padStart(2, '0') + ':' + String(fill % 60).padStart(2, '0');
    }
  }
  return null; // plus de place ce jour
}
function nextWorkingDay(dateStr) {
  const dayKeys = ['dim', 'lun', 'mar', 'mer', 'jeu', 'ven', 'sam'];
  const d = new Date(dateStr + 'T00:00:00');
  for (let i = 1; i <= 7; i++) {
    d.setDate(d.getDate() + 1);
    if (ACTIVE_DKEYS.includes(dayKeys[d.getDay()])) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const j = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${j}`;
    }
  }
  return dateStr;
}
async function addSlotRec() {
  const now = Date.now();
  // Jours cochés dans le filtre recur-days-filter
  const checkedDays = new Set(
    [...document.querySelectorAll('.recur-day-cb:checked')].map(cb => cb.dataset.dk)
  );
  const defaultCap = {};
  for (const dk of DKEYS) {
    if (checkedDays.has(dk)) defaultCap[dk] = defaultCapacity;
    // clé absente → PHP stockera NULL pour ce jour
  }
  const _abMode = _currentDemSettings.some(function(r) { return r.semaine_ab; });
  // IDs créés pendant cet appel — on les coche automatiquement pour que la ligne
  // s'affiche d'emblée en mode éditable (pas besoin de cocher la checkbox à la main).
  const _newIds = [];
  // Modèle "un slot, N semaines" : en mode Semaine A/B, on crée UN SEUL slot dont
  // le champ `weeks` vaut 'A,B' (s'applique aux deux semaines). L'utilisateur pourra
  // ensuite restreindre à 'A' ou 'B' s'il souhaite spécialiser. Plus de paire à synchroniser.
  const id = 'sl_' + now;
  _newIds.push(id);
  const slotWeeks = _abMode ? 'A,B' : null;
  if (recurDuration >= 1440) {
    _editSlotsRec.push({ id, start_time: '', end_time: '', slot_date: '', cap: { ...defaultCap }, weeks: slotWeeks });
  } else {
    const start = nextSlotStart();
    if (start) {
      const end = addMinutes(start, recurDuration);
      _editSlotsRec.push({ id, start_time: start, end_time: end, slot_date: '', cap: { ...defaultCap }, weeks: slotWeeks });
    } else {
      // Plus de place automatique dans les plages matin/après-midi : on crée quand même un
      // créneau "journée entière" éditable, l'utilisateur pourra ajuster les horaires manuellement.
      _editSlotsRec.push({ id, start_time: '', end_time: '', slot_date: '', cap: { ...defaultCap }, weeks: slotWeeks });
      showToast('ℹ️ Plus de place automatique dans les plages — ajustez les horaires manuellement', 3500);
    }
  }
  // Mettre les nouvelles lignes en mode édition
  for (const id of _newIds) _slotDelSelectionRec.add(id);
  const targetPage = Math.floor((_editSlotsRec.length - 1) / SLOT_PAGE_SIZE);
  _slotPageRec = targetPage;
  renderCapEditorRec();
}
let _schoolHolidaysCache = null;
let _schoolHolidaysCacheZone = null;
async function _loadSchoolHolidaysIfNeeded() {
  if (_schoolHolidaysCache && _schoolHolidaysCacheZone === schoolZone) return;
  const r = await apiGet('/holidays.php?action=list_school&zone=' + encodeURIComponent(schoolZone));
  _schoolHolidaysCache = (r && r.ok) ? (r.periods || []) : [];
  _schoolHolidaysCacheZone = schoolZone;
}
function _isSchoolVacance(dateStr) {
  if (!_schoolHolidaysCache) return false;
  // Convention data.gouv.fr : start_date est le soir du dernier jour d'école
  // → premier jour de vacances = start_date + 1
  for (const p of _schoolHolidaysCache) {
    if (dateStr > p.date_start && dateStr <= p.date_end) return true;
  }
  return false;
}
function _easterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}
function _isFrenchHoliday(dateStr) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [year, month, day] = dateStr.split('-').map(Number);
  const fixed = [[1,1],[5,1],[5,8],[7,14],[8,15],[11,1],[11,11],[12,25]];
  if (fixed.some(([m,d]) => m===month && d===day)) return true;
  const e = _easterDate(year);
  const fmt = (date) => date.toISOString().slice(0,10);
  const dayMs = 86400000;
  return [1, 39, 50].some(off => fmt(new Date(e.getTime() + off * dayMs)) === dateStr);
}
async function addSlotUniq() {
  const id = 'sl_' + Date.now();
  // Trouver la dernière date utilisée
  let lastDate = '';
  for (const sl of _editSlotsUniq) {
    if (sl.slot_date && sl.slot_date > lastDate) lastDate = sl.slot_date;
  }
  let targetDate = lastDate;
  if (!targetDate) {
    const now = new Date();
    const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    const sept1 = `${year}-09-01`;
    const dayKeys = ['dim','lun','mar','mer','jeu','ven','sam'];
    const sept1Day = dayKeys[new Date(sept1 + 'T00:00:00').getDay()];
    targetDate = ACTIVE_DKEYS.includes(sept1Day) ? sept1 : nextWorkingDay(sept1);
  }
  if (ponctDuration >= 1440) {
    if (lastDate) targetDate = nextWorkingDay(lastDate);
    _editSlotsUniq.push({ id, start_time: '', end_time: '', slot_date: targetDate, capacity: defaultCapacity });
  } else {
    let start;
    if (lastDate) {
      start = nextSlotForDate(targetDate);
      if (!start) {
        targetDate = nextWorkingDay(targetDate);
        start = nextSlotForDate(targetDate) || morningStart || '09:00';
      }
    } else {
      start = morningStart || '09:00';
    }
    const end = addMinutes(start, ponctDuration);
    _editSlotsUniq.push({ id, start_time: start, end_time: end, slot_date: targetDate, capacity: defaultCapacity });
  }
  // Cocher la nouvelle ligne pour qu'elle s'affiche d'emblée en mode éditable
  _slotDelSelectionUniq.add(id);
  const targetPage = Math.floor((_editSlotsUniq.length - 1) / SLOT_PAGE_SIZE);
  _slotPageUniq = targetPage;
  renderCapEditorUniq();
}
function slotPageGoRec(page) {
  const totalPages = Math.max(1, Math.ceil(_editSlotsRec.length / SLOT_PAGE_SIZE));
  _slotPageRec = Math.max(0, Math.min(page, totalPages - 1));
  renderCapEditor();
}
function slotPageGoU(page) {
  const totalPages = Math.max(1, Math.ceil(_editSlotsUniq.length / SLOT_PAGE_SIZE));
  _slotPageUniq = Math.max(0, Math.min(page, totalPages - 1));
  renderCapEditorUniq();
}

function toggleSlotDelRec(cb) {
  const id = cb.dataset.id;
  if (cb.checked) {
    _slotDelSelectionRec.add(id);
    const periodId = PERIODS[capPeriodIdx]?.id ?? null;
    if (_slotHasReservations(id, periodId, true)) {
      showToast('⚠️ Ce créneau a déjà été réservé, vous ne pouvez modifier que le nombre de places ou les journées sans réservation', 4500, { warn: true });
    }
  } else {
    _slotDelSelectionRec.delete(id);
    // Décocher = annuler les modifs non enregistrées : restaurer depuis SLOTS_REC_MAP
    const pid = String(PERIODS[capPeriodIdx]?.id ?? '');
    const original = (SLOTS_REC_MAP[pid] || []).find(s => s.id === id);
    if (original) {
      const idx = _editSlotsRec.findIndex(s => s.id === id);
      if (idx !== -1) _editSlotsRec[idx] = JSON.parse(JSON.stringify(original));
    }
  }
  renderCapEditor();
}
function toggleAllSlotDelRec(masterCb) {
  const pid = String(PERIODS[capPeriodIdx]?.id ?? '');
  document.querySelectorAll('.slot-del-cb').forEach(cb => {
    const id = cb.dataset.id;
    if (masterCb.checked) {
      _slotDelSelectionRec.add(id);
    } else {
      _slotDelSelectionRec.delete(id);
      const original = (SLOTS_REC_MAP[pid] || []).find(s => s.id === id);
      if (original) {
        const idx = _editSlotsRec.findIndex(s => s.id === id);
        if (idx !== -1) _editSlotsRec[idx] = JSON.parse(JSON.stringify(original));
      }
    }
  });
  renderCapEditor();
}
function _slotClear(slotId, field) {
  const sl = _editSlotsRec.find(s => s.id === slotId) || _editSlotsUniq.find(s => s.id === slotId);
  if (!sl) return;
  sl[field] = '';
  if (field === 'start_time') sl.end_time = '';
  renderCapEditor();
}
function _slotClearCap(slotId, dk) {
  const sl = _editSlotsRec.find(s => s.id === slotId);
  if (!sl || !sl.cap) return;
  delete sl.cap[dk];
  renderCapEditor();
}
function _slotAddCap(slotId, dk) {
  const sl = _editSlotsRec.find(s => s.id === slotId);
  if (!sl) return;
  if (!sl.cap) sl.cap = {};
  sl.cap[dk] = defaultCapacity;
  renderCapEditor();
}
async function deleteSelectedSlotsRec() {
  _editSlotsRec = _editSlotsRec.filter(s => !_slotDelSelectionRec.has(s.id));
  _slotDelSelectionRec.clear();
  await saveCapacityRec();
  // Vider le buffer → renderCapEditorRec rechargera depuis SLOTS_REC_MAP
  const pid = String(PERIODS[capPeriodIdx]?.id ?? '');
  delete _editSlotsRecMap[pid];
  _editSlotsRec = [];
  renderCapEditor();
}

function toggleSlotDelU(cb) {
  const id = cb.dataset.id;
  if (cb.checked) {
    _slotDelSelectionUniq.add(id);
    if (_slotHasReservations(id, null, false)) {
      showToast('⚠️ Ce créneau a déjà été réservé, vous ne pouvez modifier que le nombre de places', 4500, { warn: true });
    }
  } else {
    _slotDelSelectionUniq.delete(id);
    // Décocher = annuler les modifs non enregistrées : restaurer depuis SLOTS_UNIQ
    const original = (SLOTS_UNIQ || []).find(s => String(s.id) === id);
    if (original) {
      const idx = _editSlotsUniq.findIndex(s => String(s.id) === id);
      if (idx !== -1) _editSlotsUniq[idx] = JSON.parse(JSON.stringify(original));
    }
  }
  renderCapEditorUniq();
}
function toggleAllSlotDelU(masterCb) {
  document.querySelectorAll('.slot-del-cb-u:not([disabled])').forEach(cb => {
    const id = cb.dataset.id;
    if (masterCb.checked) {
      _slotDelSelectionUniq.add(id);
    } else {
      _slotDelSelectionUniq.delete(id);
      const original = (SLOTS_UNIQ || []).find(s => String(s.id) === id);
      if (original) {
        const idx = _editSlotsUniq.findIndex(s => String(s.id) === id);
        if (idx !== -1) _editSlotsUniq[idx] = JSON.parse(JSON.stringify(original));
      }
    }
  });
  renderCapEditorUniq();
}
async function deleteSelectedSlotsU() {
  // Tableau "Créneaux ponctuels" : ne reçoit plus que des ponctuels manuels.
  // Les miroirs sont gérés via le tableau dédié (cap-editor-mir) → deleteSelectedSlotsMir.
  _editSlotsUniq = _editSlotsUniq.filter(s => !_slotDelSelectionUniq.has(s.id));
  _slotDelSelectionUniq.clear();
  await saveCapacityUniq({ skipWarnings: true });
  _editSlotsUniq = [];
  renderCapEditorUniq();
  renderCapEditorMir();
}

// ── Tableau miroirs (pane Créneaux récurrents) ────────────
function _mirrorsForSelectedRec() {
  // Renvoie les miroirs (parent_slot_id != null) attachés aux récurrents actuellement cochés,
  // triés par date croissante (puis par heure de début) indépendamment de l'état.
  if (!_slotDelSelectionRec.size) return [];
  const parentIds = new Set([..._slotDelSelectionRec].map(String));
  const list = _editSlotsUniq.filter(s => s.parent_slot_id && parentIds.has(String(s.parent_slot_id)));
  list.sort((a, b) => {
    const d = (a.slot_date || '').localeCompare(b.slot_date || '');
    if (d) return d;
    // parseTime() zero-pad pour eviter que "9:00" trie apres "10:00".
    return (parseTime(a.start_time)||'99:99').localeCompare(parseTime(b.start_time)||'99:99');
  });
  return list;
}
function renderCapEditorMir(goToPage = null) {
  const el = document.getElementById('cap-editor-mir');
  if (!el) return;
  const periodMirrors = _mirrorsForSelectedRec();
  // Section visible uniquement si au moins un récurrent est coché.
  const section = document.getElementById('section-creneaux-miroirs');
  if (section) section.style.display = _slotDelSelectionRec.size ? '' : 'none';
  if (!_slotDelSelectionRec.size) { el.innerHTML = ''; return; }
  // Purger sélection : enlever les IDs qui ne sont plus visibles ici.
  const _existingIds = new Set(periodMirrors.map(s => String(s.id)));
  for (const id of [..._slotDelSelectionMir]) if (!_existingIds.has(id)) _slotDelSelectionMir.delete(id);
  const bar = document.getElementById('slot-delete-bar-mir');
  if (bar) bar.style.visibility = _slotDelSelectionMir.size ? 'visible' : 'hidden';
  const cnt = document.getElementById('slot-delete-count-mir');
  if (cnt) cnt.textContent = `${_slotDelSelectionMir.size} sélectionné(s)`;
  // Bouton d'action : Désactiver / Activer / mixte
  {
    let nActif = 0, nDes = 0;
    let anyBlocking = false;
    for (const id of _slotDelSelectionMir) {
      const sl = periodMirrors.find(s => String(s.id) === String(id));
      if (!sl) continue;
      const disabled = sl.state && sl.state !== 'actif';
      if (disabled) nDes++; else nActif++;
      // Bloquer la désactivation si le miroir actif a des réservations (réactivation toujours autorisée).
      if (!disabled && _slotHasReservations(id, null, false)) anyBlocking = true;
    }
    const btn = document.getElementById('btn-action-mir');
    if (btn) {
      btn.style.display = anyBlocking ? 'none' : '';
      if (_slotDelSelectionMir.size) {
        const labels = [];
        if (nActif) labels.push('Désactiver');
        if (nDes)   labels.push('Activer');
        btn.textContent = labels.join(' / ') || 'Désactiver';
      }
    }
  }
  // Pagination
  const totalPages = Math.max(1, Math.ceil(periodMirrors.length / SLOT_PAGE_SIZE));
  if (goToPage !== null) _slotPageMir = goToPage;
  _slotPageMir = Math.max(0, Math.min(_slotPageMir, totalPages - 1));
  const offset = _slotPageMir * SLOT_PAGE_SIZE;
  const pageSlots = periodMirrors.slice(offset, offset + SLOT_PAGE_SIZE);
  const pagerHtml = `
    <div style="display:flex;align-items:center;justify-content:center;gap:.5rem;font-size:.82rem">
      <button class="btn btn-ghost" style="padding:2px 8px" onclick="slotPageGoMir(${_slotPageMir - 1})" ${_slotPageMir === 0 ? 'disabled' : ''}>‹</button>
      <span style="color:var(--muted)">Page ${_slotPageMir + 1} / ${totalPages}</span>
      <button class="btn btn-ghost" style="padding:2px 8px" onclick="slotPageGoMir(${_slotPageMir + 1})" ${_slotPageMir >= totalPages - 1 ? 'disabled' : ''}>›</button>
    </div>`;
  el.innerHTML = `<div class="planning-wrap">
    <table class="admin-table cap-editor-table">
      <thead><tr>
        <th class="col-check" style="width:32px;text-align:center"><input type="checkbox" class="admin-cb" id="slot-del-all-mir" onchange="toggleAllSlotDelMir(this)"></th>
        <th style="text-align:center;width:52px">Semaine</th>
        <th style="text-align:center;width:130px">Date</th>
        <th style="text-align:center;width:80px">Début</th>
        <th style="text-align:center;width:80px">Fin</th>
        <th style="text-align:center;width:80px">Capacité</th>
      </tr></thead>
      <tbody>${pageSlots.map(sl => {
        const disabled = sl.state && sl.state !== 'actif';
        const checked  = _slotDelSelectionMir.has(String(sl.id));
        const rowStyle = disabled
          ? ' style="opacity:.55;background:rgba(220,80,80,.05)"'
          : ' style="opacity:.85"';
        const badge = disabled
          ? `<span title="Miroir désactivé — cocher pour réactiver" style="font-size:.55rem;font-weight:800;color:#fff;background:#c25555;border-radius:3px;padding:1px 4px;margin-left:3px;vertical-align:middle">D</span>`
          : '';
        return `<tr${rowStyle}>
          <td class="col-check" style="text-align:center"><input type="checkbox" class="admin-cb slot-del-cb-mir" data-id="${sl.id}"${checked ? ' checked' : ''} onchange="toggleSlotDelMir(this)"></td>
          <td style="text-align:center">${_slotWeeks(sl) ? _weekAbBadge(_slotWeeks(sl)) : ''}</td>
          <td style="text-align:center">${fmtDate(sl.slot_date)}${badge}</td>
          <td style="text-align:center">${sl.start_time || ''}</td>
          <td style="text-align:center">${sl.end_time   || ''}</td>
          <td style="text-align:center">${sl.capacity   || ''}</td>
        </tr>`;
      }).join('')}</tbody>
    </table>
  </div>`;
  const sp = document.getElementById('slot-pager-mir');
  if (sp) sp.innerHTML = pagerHtml;
}
function toggleSlotDelMir(cb) {
  const id = cb.dataset.id;
  if (cb.checked) _slotDelSelectionMir.add(id);
  else            _slotDelSelectionMir.delete(id);
  renderCapEditorMir();
}
function toggleAllSlotDelMir(masterCb) {
  document.querySelectorAll('.slot-del-cb-mir').forEach(cb => {
    if (masterCb.checked) _slotDelSelectionMir.add(cb.dataset.id);
    else                  _slotDelSelectionMir.delete(cb.dataset.id);
  });
  renderCapEditorMir();
}
function slotPageGoMir(p) {
  renderCapEditorMir(p);
}
async function deleteSelectedSlotsMir() {
  // Désactivation / réactivation des miroirs sélectionnés.
  const toDesactive = [], toActive = [];
  for (const id of _slotDelSelectionMir) {
    const sl = _editSlotsUniq.find(s => String(s.id) === String(id));
    if (!sl || !sl.parent_slot_id) continue;
    if (sl.state && sl.state !== 'actif') toActive.push(id);
    else                                   toDesactive.push(id);
  }
  if (toDesactive.length) {
    const r = await apiPost('/slots.php?action=set_state', { ids: toDesactive, state: 'desactive' });
    if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  }
  if (toActive.length) {
    const r = await apiPost('/slots.php?action=set_state', { ids: toActive, state: 'actif' });
    if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  }
  _slotDelSelectionMir.clear();
  await _reloadSlots();
  _editSlotsUniq = [];
  renderCapEditorUniq();
  renderCapEditorMir();
  showToast('✅ Miroirs mis à jour');
}

async function saveCapacity() {
  await saveCapacityRec();
  await saveCapacityUniq();
}

// ── Annuler les modifications non enregistrées ────────────
function cancelCapacityRec() {
  const periodId = PERIODS[capPeriodIdx]?.id ?? null;
  if (periodId !== null) {
    delete _editSlotsRecMap[String(periodId)];
  }
  _slotDelSelectionRec.clear();
  _editSlotsRec = [];
  renderCapEditorRec();
  // Sélection des récurrents vidée → masquer aussi la section « Dates correspondantes ».
  renderCapEditorMir();
  showToast('↶ Modifications annulées');
}
function cancelCapacityUniq() {
  _slotDelSelectionUniq.clear();
  _slotDelSelectionMir.clear();
  _editSlotsUniq = [];
  renderCapEditorUniq();
  renderCapEditorMir();
  showToast('↶ Modifications annulées');
}
async function saveCapacityRec() {
  const periodId = PERIODS[capPeriodIdx]?.id ?? null;
  if (!periodId) return;
  const r = await apiPost('/slots.php?action=save', {
    service_id: currentServiceId, type: 'recurring', period_id: periodId, slots: _editSlotsRec,
  });
  if (!r.ok) { showToast('⚠️ ' + (r.error||'Erreur')); return; }
  await _reloadSlots();
  // Reset état édition : décocher toutes les lignes + recharger depuis la DB
  _slotDelSelectionRec.clear();
  const pid = String(periodId);
  delete _editSlotsRecMap[pid];
  _editSlotsRec = [];
  renderCapEditorRec();
  // Les miroirs ont été regénérés côté serveur → rafraîchir le tableau dédié des miroirs.
  _editSlotsUniq = [];
  renderCapEditorUniq();
  renderCapEditorMir();
  showToast('✅ Créneaux récurrents enregistrés');
}
async function saveCapacityUniq(opts = {}) {
  // Détecter les avertissements AVANT le reset du buffer (sauf en suppression).
  // Ne vérifier que les slots NOUVEAUX ou dont la date a changé — pas les slots
  // déjà existants en base, sinon le warning se déclenche à tort.
  let warnHoliday = false;
  if (!opts.skipWarnings) {
    const oldById = new Map((SLOTS_UNIQ || []).map(s => [s.id, s]));
    for (const sl of _editSlotsUniq) {
      if (!sl.slot_date) continue;
      const old = oldById.get(sl.id);
      const isNewOrChanged = !old || old.slot_date !== sl.slot_date;
      if (!isNewOrChanged) continue;
      if (!openOnHolidays && _isFrenchHoliday(sl.slot_date)) warnHoliday = true;
    }
  }
  const r = await apiPost('/slots.php?action=save', {
    service_id: currentServiceId, type: 'unique', slots: _editSlotsUniq,
  });
  if (!r.ok) { showToast('⚠️ ' + (r.error||'Erreur')); return; }
  await _reloadSlots();
  _editSlotsUniq = [];
  renderCapEditorUniq();
  if (warnHoliday) showToast('⚠️ Attention c\'est un jour férié', 3500, { warn: true });
  else             showToast('✅ Créneaux ponctuels enregistrés');
}
async function _reloadSlots() {
  const r2 = await apiGet('/services.php?action=list');
  if (r2.ok) {
    SERVICES = r2.services;
    currentService = SERVICES.find(s => s.id === currentServiceId);
    _syncShowPreviousFromService();
    if (currentService) {
      SLOTS_REC     = currentService.slots_recurring || [];
      SLOTS_REC_MAP = _buildSlotsMap(SLOTS_REC);
      SLOTS_UNIQ    = currentService.slots_unique    || [];
    }
  }
  // Admin / gestionnaire : recharger aussi les slots tous états confondus afin
  // que l'éditeur de capacité voie les miroirs désactivés (pour réactivation).
  if (isManagerUser()) {
    const r3 = await apiGet('/services.php?action=list&include_inactive=1');
    if (r3.ok) {
      const svc = (r3.services || []).find(s => s.id === currentServiceId);
      if (svc) {
        SLOTS_REC_FULL     = svc.slots_recurring || [];
        SLOTS_REC_MAP_FULL = _buildSlotsMap(SLOTS_REC_FULL);
        SLOTS_UNIQ_FULL    = svc.slots_unique || [];
      }
    }
  }
}

// ── Paramètres — Max réservations ────────────────────────
function renderMaxResDisplays() {
  const el    = document.getElementById('max-res-display');
  const elPeriod = document.getElementById('max-res-period-display');
  if (el)     el.textContent     = maxReservations;
  if (elPeriod) elPeriod.textContent = maxReservationsPeriod;
}
function adjustMaxRes(delta) {
  maxReservations = Math.max(1, maxReservations + delta);
  const el = document.getElementById('max-res-display');
  if (el) el.textContent = maxReservations;
  applyMaxRes();
}
async function applyMaxRes() {
  const r = await apiPost('/services.php?action=update', { id: currentServiceId, max_reservations: maxReservations, max_reservations_period: maxReservationsPeriod });
  if (r.ok) {
    if (currentService) { currentService.max_reservations = maxReservations; currentService.max_reservations_period = maxReservationsPeriod; }
    showToast('✅ Enregistré');
  }
}
function adjustMaxResPeriod(delta) {
  maxReservationsPeriod = Math.max(1, maxReservationsPeriod + delta);
  const el = document.getElementById('max-res-period-display');
  if (el) el.textContent = maxReservationsPeriod;
  applyMaxRes();
}

// ── Paramètres — Durée par défaut ────────────────────────
function formatDuration(min) {
  if (min >= 1440) return `${Math.floor(min / 1440)}j`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h > 0 ? (m > 0 ? `${h}h${String(m).padStart(2,'0')}` : `${h}h`) : `${m} min`;
}
function stepDuration(current, dir) {
  // Liste explicite des paliers autorisés : pas de quart d'heure (15, 45, 75, 105, 135, 165, 195, 225 exclus).
  const VALUES = [30, 60, 90, 120, 150, 180, 210, 240, 300, 1440];
  if (dir > 0) {
    return VALUES.find(v => v > current) ?? current;
  }
  let prev = VALUES[0];
  for (const v of VALUES) {
    if (v >= current) break;
    prev = v;
  }
  return prev;
}
function renderDefaultDurationDisplay() {
  const pd = document.getElementById('ponct-duration-display');
  if (pd) pd.textContent = formatDuration(ponctDuration);
  const rd = document.getElementById('recur-default-duration-display');
  if (rd) rd.textContent = formatDuration(recurDuration);
  document.querySelectorAll('#default-cap-inp, #rec-default-cap-inp').forEach(el => el.value = defaultCapacity);
}
function adjustPonctDuration(delta) {
  ponctDuration = stepDuration(ponctDuration, delta);
  renderDefaultDurationDisplay();
  scheduleDefaultsSave();
}
function adjustRecurDuration(delta) {
  recurDuration = stepDuration(recurDuration, delta);
  renderDefaultDurationDisplay();
  scheduleDefaultsSave();
}
let _defaultsSaveTimer = null;
function scheduleDefaultsSave() {
  clearTimeout(_defaultsSaveTimer);
  _defaultsSaveTimer = setTimeout(() => applyDefaultDuration(), 600);
}
async function applyDefaultDuration() {
  const r = await apiPost('/services.php?action=update', {
    id: currentServiceId,
    ponct_duration: ponctDuration,
    ponct_capacity: defaultCapacity,
    recur_duration: recurDuration,
  });
  if (r.ok) {
    if (currentService) {
      currentService.ponct_duration      = ponctDuration;
      currentService.ponct_capacity      = defaultCapacity;
      currentService.recur_duration      = recurDuration;
    }
    showToast('✅ Enregistré');
  }
}


async function savePeriodeSettings() {
  await applyActiveDays();
  await applyDefaultDuration();
}

async function applyCapacityToAllSlots() {
  const capVal = Math.max(1, defaultCapacity || 1);
  if (!_editSlotsRec.length && !_editSlotsUniq.length) { showToast('⚠️ Aucun créneau à modifier'); return; }
  if (!confirm(`Cette action va remplacer la capacité pour l'ensemble des créneaux du service par '${capVal}'`)) return;

  for (const sl of _editSlotsRec) {
    if (!sl.cap) sl.cap = {};
    for (const dk of DKEYS) sl.cap[dk] = capVal;
  }
  for (const sl of _editSlotsUniq) sl.capacity = capVal;

  renderCapEditor();
  await saveCapacity();
  showToast('✅ Capacité appliquée à tous les créneaux');
}


// ── Paramètres — Plage horaire ────────────────────────────
function renderTimeRanges() {
  const set = (id, val) => document.querySelectorAll('#' + id).forEach(el => el.value = val);
  set('morning-start',   morningStart);
  set('morning-end',     morningEnd);
  set('afternoon-start', afternoonStart);
  set('afternoon-end',   afternoonEnd);
}
async function applyTimeRanges() {
  const r = await apiPost('/services.php?action=update', {
    id: currentServiceId,
    morning_start: morningStart, morning_end: morningEnd,
    afternoon_start: afternoonStart, afternoon_end: afternoonEnd,
  });
  if (r.ok) {
    if (currentService) {
      currentService.morning_start   = morningStart;
      currentService.morning_end     = morningEnd;
      currentService.afternoon_start = afternoonStart;
      currentService.afternoon_end   = afternoonEnd;
    }
    showToast('✅ Enregistré');
  }
}

// ── Paramètres — Délai de réservation ────────────────────
function renderBookingDelay() {
  const el = document.getElementById('booking-delay-select');
  if (el) el.value = bookingDelay;
}
async function applyBookingDelay() {
  const r = await apiPost('/services.php?action=update', { id: currentServiceId, booking_delay: bookingDelay });
  if (r.ok) {
    if (currentService) currentService.booking_delay = bookingDelay;
    showToast('✅ Enregistré');
  }
}

// ── Paramètres — Auto-validation des réservations ────────
function renderAutoValidationDelay() {
  const el = document.getElementById('auto-validation-delay-select');
  if (el) el.value = autoValidationDelay;
}
async function applyAutoValidationDelay() {
  const r = await apiPost('/services.php?action=update', { id: currentServiceId, auto_validation_delay: autoValidationDelay });
  if (r.ok) {
    if (currentService) currentService.auto_validation_delay = autoValidationDelay;
    showToast('✅ Enregistré');
  }
}
function renderValidationBloquante() {
  const cb = document.getElementById('validation-bloquante-cb');
  if (cb) cb.checked = validationBloquante;
}
async function toggleValidationBloquante() {
  const cb = document.getElementById('validation-bloquante-cb');
  validationBloquante = cb ? cb.checked : !validationBloquante;
  const r = await apiPost('/services.php?action=update', { id: currentServiceId, validation_bloquante: validationBloquante ? 1 : 0 });
  if (r.ok) {
    if (currentService) currentService.validation_bloquante = validationBloquante ? 1 : 0;
    showToast('✅ Enregistré');
  } else {
    validationBloquante = !validationBloquante;
    renderValidationBloquante();
  }
}

// ── Paramètres — Modes du service ────────────────────────
function renderModeToggles() {
  const tw = document.getElementById('theme-toggle-wrap');
  if (tw) tw.innerHTML = makeToggle('theme', currentServiceId, themeMode, 'toggleThemeMode()', gaugeEnabled);
}

function toggleThemeMode() {
  themeMode = !themeMode;
  renderModeToggles();
  renderSchedule();
}

// ── scanBookings / purge (adaptés pour l'API) ────────────
async function scanBookings() {
  const r = await apiGet(`/bookings.php?action=list&service_id=${currentServiceId}&all=1`);
  const log = document.getElementById('purge-log');
  if (!log) return;
  if (!r.ok) { log.textContent = 'Erreur: ' + (r.error||'?'); return; }
  log.textContent = `Réservations récurrentes : ${r.bookings?.length||0}\nRéservations ponctuelles : ${r.bookings_unique?.length||0}`;
}
async function purgeBookings() {
  if (!confirm('Supprimer TOUTES les réservations de ce service ?')) return;
  const all = [...(allBookings||[]),...(allBookingsUnique||[])];
  for (const b of all) {
    const type = b.day_key ? 'recurring' : 'unique';
    await apiPost('/bookings.php?action=cancel', { id: b.id, type });
  }
  allBookings = []; allBookingsUnique = [];
  const log = document.getElementById('purge-log');
  if (log) log.textContent = 'Toutes les réservations ont été supprimées.';
  showToast('🗑️ Réservations purgées');
}
// ── Configuration messagerie ──────────────────────────────
async function loadMailConfig() {
  const r = await apiGet('/settings.php?action=get');
  if (!r.ok) { showToast('⚠️ Impossible de charger la configuration'); return; }
  const c = r.config;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val ?? ''; };
  set('cfg-mail-driver',    c.mail_driver);
  set('cfg-mail-from',      c.mail_from);
  set('cfg-mail-from-name', c.mail_from_name);
  set('cfg-mail-host',      c.mail_host);
  set('cfg-mail-port',      c.mail_port);
  set('cfg-mail-security',  c.mail_security);
  set('cfg-mail-username',  c.mail_username);
  // Ne pas pré-remplir le champ password (masque ••• n'est pas placé dans un input type=password)
  document.getElementById('cfg-mail-password').value = '';
  toggleSmtpFields();
}

function toggleSmtpFields() {
  const driver = document.getElementById('cfg-mail-driver')?.value;
  const wrap   = document.getElementById('smtp-fields-wrap');
  if (!wrap) return;
  const isSmtp = driver === 'smtp';
  wrap.querySelectorAll('input, select').forEach(el => {
    el.style.opacity = isSmtp ? '' : '.4';
    el.disabled = !isSmtp;
  });
}

async function saveMailConfig() {
  const val = id => document.getElementById(id)?.value ?? '';
  const payload = {
    action:          'save',
    mail_driver:     val('cfg-mail-driver'),
    mail_from:       val('cfg-mail-from'),
    mail_from_name:  val('cfg-mail-from-name'),
    mail_host:       val('cfg-mail-host'),
    mail_port:       val('cfg-mail-port'),
    mail_security:   val('cfg-mail-security'),
    mail_username:   val('cfg-mail-username'),
    mail_password:   val('cfg-mail-password'),
  };
  const btn = document.getElementById('btn-mail-save');
  if (btn) { btn.disabled = true; btn.textContent = '…'; }
  const r = await apiPost('/settings.php?action=save', payload);
  if (btn) { btn.disabled = false; btn.textContent = '💾 Enregistrer'; }
  if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  showToast('✅ Configuration enregistrée');
  // Recharger pour afficher l'état réel (ex. masquage du mot de passe)
  await loadMailConfig();
}

async function sendTestMail() {
  const to = (document.getElementById('cfg-mail-test-to')?.value || '').trim();
  if (!to) { showToast('⚠️ Saisissez une adresse destinataire'); return; }
  const r = await apiPost('/settings.php?action=test_mail', { action: 'test_mail', to });
  if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur lors de l\'envoi')); return; }
  showToast('✅ ' + (r.message || 'E-mail de test envoyé'));
}

// ── Utilitaire HTML ───────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Nom de l'exercice en cours : année de la 1ère période active → année de la dernière (fusionnée si identique)
function _computeExerciceName() {
  const actives = PERIODS.filter(p => p.state === 'actif');
  const startYears = actives.map(p => p.date_start && parseInt(p.date_start.slice(0, 4))).filter(Boolean);
  const endYears   = actives.map(p => p.date_end   && parseInt(p.date_end.slice(0, 4))).filter(Boolean);
  if (!startYears.length && !endYears.length) return '';
  const minY = Math.min(...startYears, ...endYears);
  const maxY = Math.max(...startYears, ...endYears);
  return minY === maxY ? `${minY}` : `${minY}-${maxY}`;
}
// Nom du prochain exercice (chaque année de l'exercice en cours incrémentée d'1).
function _computeNextExerciceName() {
  const actives = PERIODS.filter(p => p.state === 'actif');
  const startYears = actives.map(p => p.date_start && parseInt(p.date_start.slice(0, 4))).filter(Boolean);
  const endYears   = actives.map(p => p.date_end   && parseInt(p.date_end.slice(0, 4))).filter(Boolean);
  if (!startYears.length && !endYears.length) return '';
  const minY = Math.min(...startYears, ...endYears);
  const maxY = Math.max(...startYears, ...endYears);
  return minY === maxY ? `${minY + 1}` : `${minY + 1}-${maxY + 1}`;
}

// Affiche la plage de l'exercice en cours (début 1ère période active → fin dernière période active)
function _renderExerciceDates() {
  const el = document.getElementById('exercice-dates');
  if (!el) return;
  const fmt = d => d ? new Date(d + 'T00:00').toLocaleDateString('fr-FR') : null;
  const actives = PERIODS.filter(p => p.state === 'actif');
  const minStart = actives.reduce((acc, p) => p.date_start && (!acc || p.date_start < acc) ? p.date_start : acc, null);
  const maxEnd   = actives.reduce((acc, p) => p.date_end   && (!acc || p.date_end   > acc) ? p.date_end   : acc, null);
  const a = fmt(minStart) || '—';
  const b = fmt(maxEnd)   || '—';
  el.textContent = (a === '—' && b === '—') ? '—' : `${a} → ${b}`;
}
// ── Navigation entre exercices (◀ label ▶) ────────────────
function _latestExerciceId() {
  // Le "dernier exercice du service" = max(exercice_id) parmi les périodes du scope.
  return PERIODS.reduce((mx, p) => (p.exercice_id != null && p.exercice_id > (mx ?? 0) ? p.exercice_id : mx), null);
}
function _isOnLatestExercice() {
  const latest = _latestExerciceId();
  // Quand le service n'a aucun exercice (ex. service tout neuf), tout est permis.
  return latest === null || currentExerciceId === latest;
}
function _showPreviousExercices() {
  const cb = document.getElementById('exercice-show-previous');
  return !!cb?.checked;
}
// Côté demandeur : on force toujours l'affichage du dernier exercice (le plus récent
// dans EXERCICES), indépendamment du flag service `show_previous_exercices`. Le label
// inline est mis à jour via _renderExerciceNav().
function _syncDemandeurExercice() {
  if (isManagerUser()) return;
  const latestId = EXERCICES.length ? EXERCICES[EXERCICES.length - 1].id : null;
  if (latestId != null && currentExerciceId !== latestId) currentExerciceId = latestId;
  _renderExerciceNav();
}
function _renderExerciceNav() {
  const i = EXERCICES.findIndex(e => e.id === currentExerciceId);
  const labelText = i >= 0 ? EXERCICES[i].label : '—';
  const showPrev = _showPreviousExercices();
  const canPrev = i > 0 && showPrev;
  const canNext = i >= 0 && i < EXERCICES.length - 1;
  document.querySelectorAll('.ex-nav-label').forEach(el => el.textContent = labelText);
  document.querySelectorAll('.ex-nav-prev').forEach(el => el.disabled = !canPrev);
  document.querySelectorAll('.ex-nav-next').forEach(el => el.disabled = !canNext);
}
async function onToggleShowPrevious() {
  // Persistance : la préférence est stockée sur le service courant (champ
  // services.show_previous_exercices). Hors contexte service (admin/compte),
  // l'état reste en mémoire seulement.
  const show = _showPreviousExercices();
  if (currentService?.id) {
    currentService.show_previous_exercices = show ? 1 : 0;
    apiPost('/services.php?action=update', {
      id: currentService.id,
      show_previous_exercices: show ? 1 : 0,
    });
  }
  // Si on désactive l'affichage des précédents alors qu'on est sur un exercice antérieur,
  // on saute au plus récent.
  if (!show && !_isOnLatestExercice()) {
    const latest = _latestExerciceId();
    if (latest != null) currentExerciceId = latest;
    await _refreshExerciceViews();
  } else {
    _renderExerciceNav();
  }
}
// Synchronise la case "Afficher les exercices précédents" avec le service courant.
function _syncShowPreviousFromService() {
  const cb = document.getElementById('exercice-show-previous');
  if (!cb) return;
  // Hors service spécifique, conserve l'état actuel.
  if (!currentService) return;
  const v = currentService.show_previous_exercices;
  // Par défaut (champ absent), DEFAULT 0 en base → décochée (= ne pas afficher les précédents).
  cb.checked = v === undefined || v === null ? false : !!parseInt(v);
}
async function _refreshExerciceViews() {
  if (document.getElementById('periods-editor')) renderPeriodsEditor();
  if (typeof renderPlanningTab === 'function'
      && (document.getElementById('planning-rec-grid') || document.getElementById('planning-grid'))) {
    _planningPeriodUserPicked = false; // laisse la sélection de trim retomber sur la 1ère période de l'exercice
    _agendaPeriodUserPicked   = false; // idem pour l'agenda quand on revient dessus
    // Recharger les slots pour l'exercice sélectionné (currentExerciceId est lu par loadAdminData).
    await loadAdminData();
    renderPlanningTab();
  }
  _applyExerciceLockToParamPanes();
}
async function selectPrevExercice() {
  if (!_showPreviousExercices()) return;
  const i = EXERCICES.findIndex(e => e.id === currentExerciceId);
  if (i > 0) { currentExerciceId = EXERCICES[i - 1].id; await _refreshExerciceViews(); }
}
async function selectNextExercice() {
  const i = EXERCICES.findIndex(e => e.id === currentExerciceId);
  if (i >= 0 && i < EXERCICES.length - 1) { currentExerciceId = EXERCICES[i + 1].id; await _refreshExerciceViews(); }
}

// ── Éditeur de périodes ───────────────────────────────────
function renderPeriodsEditor() {
  const el = document.getElementById('periods-editor');
  if (!el) return;
  _renderExerciceDates();
  _renderExerciceNav();
  // Filtre par exercice sélectionné. Les périodes sans exercice (= juste créées, dates à
  // remplir) restent visibles dans toutes les vues. On affiche toujours toutes les périodes
  // (actives + désactivées) du scope.
  const visiblePeriods = currentExerciceId
    ? PERIODS.filter(p => p.exercice_id === currentExerciceId || p.exercice_id == null)
    : PERIODS;
  if (!visiblePeriods.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:.85rem;margin:0">Aucune période définie.</p>';
    return;
  }
  const fmtD = d => d ? new Date(d + 'T00:00').toLocaleDateString('fr-FR') : '—';
  el.innerHTML = `
    <table class="periods-table">
      <thead><tr>
        <th style="width:32px"><input type="checkbox" id="period-select-all" onchange="toggleAllPeriods(this.checked)" title="Tout sélectionner"></th>
        <th>Coul</th>
        <th>Étiq</th>
        <th style="width:260px">Libellé</th>
        <th>Début</th>
        <th>Fin</th>
      </tr></thead>
      <tbody>
        ${visiblePeriods.map(p => `
          <tr${p.state === 'actif' ? '' : ' style="opacity:.55"'}>
            <td><input type="checkbox" class="period-chk" value="${p.id}" onchange="_updatePeriodDeleteBtn()"></td>
            <td><span class="period-swatch" style="background:${p.color || '#6dceaa'}"></span></td>
            <td>${escHtml(p.etiquette || '—')}</td>
            <td class="td-left">${escHtml(p.label || '—')}</td>
            <td>${fmtD(p.date_start)}</td>
            <td>${fmtD(p.date_end)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  _updatePeriodDeleteBtn();
}

function _updatePeriodDeleteBtn() {
  // Sur un exercice ancien (pas le dernier du service), masque toutes les actions.
  const onLatest = _isOnLatestExercice();
  const addBtn = document.querySelector('.pr-add > button[onclick="addPeriod()"]');
  if (addBtn) addBtn.style.display = onLatest ? '' : 'none';
  if (!onLatest) {
    const wrap = document.getElementById('btn-delete-periods');
    if (wrap) wrap.style.display = 'none';
    return;
  }
  const checked = document.querySelectorAll('.period-chk:checked');
  const all = document.querySelectorAll('.period-chk');
  const wrap = document.getElementById('btn-delete-periods');
  if (wrap) wrap.style.display = checked.length > 0 ? 'flex' : 'none';
  const editBtn = document.getElementById('btn-edit-period');
  if (editBtn) editBtn.style.display = checked.length === 1 ? '' : 'none';
  // Règles d'affichage des boutons d'action :
  //  - Supprimer  : toutes les périodes cochées doivent être sans relations (bookings / slots).
  //  - Désactiver : visible s'il existe au moins une période cochée actuellement active.
  //  - Réactiver  : visible s'il existe au moins une période cochée actuellement inactive.
  // En cas de sélection mixte (active + inactive), Désactiver et Réactiver sont
  // toutes deux visibles ; chacune n'agit que sur le sous-ensemble pertinent.
  const ids   = [...checked].map(cb => parseInt(cb.value));
  const items = ids.map(id => PERIODS.find(p => p.id === id)).filter(Boolean);
  const anyWithRelations = items.some(p => parseInt(p.relations_count || 0) > 0);
  const anyInactive      = items.some(p => p.state !== 'actif');
  const canDelete        = checked.length > 0 && !anyWithRelations;
  const delBtn = document.getElementById('btn-delete-period');
  const reaBtn = document.getElementById('btn-reactivate-period');
  if (delBtn) delBtn.style.display = canDelete                                 ? '' : 'none';
  if (reaBtn) reaBtn.style.display = (checked.length > 0 && anyInactive)       ? '' : 'none';
  const count = document.getElementById('period-selected-count');
  if (count) count.textContent = `${checked.length} sélectionné(s)`;
  const sa = document.getElementById('period-select-all');
  if (sa) {
    sa.indeterminate = checked.length > 0 && checked.length < all.length;
    sa.checked = all.length > 0 && checked.length === all.length;
  }
}
// ── Changement d'exercice ───────────────────────────────────
// Rend le contenu du pane "Changement d'exercice" : avertissement + état du bouton
// "Lancer le changement", + colonne "Retour à l'année précédente" (visible uniquement
// si un cycle est annulable et qu'aucune réservation n'existe sur l'exercice en cours).
// Les cases "Créer un nouvel exercice" et "Supprimer le dernier exercice" sont
// mutuellement exclusives : cocher l'une décoche l'autre. Les deux peuvent être
// décochées en même temps (état neutre, aucune colonne affichée).
function onToggleAllowCreate() {
  const create = document.getElementById('exercice-allow-create');
  if (create?.checked) {
    const del = document.getElementById('exercice-allow-delete');
    if (del) del.checked = false;
  }
  renderExercicePane();
}
function onToggleAllowDelete() {
  const del = document.getElementById('exercice-allow-delete');
  if (del?.checked) {
    const create = document.getElementById('exercice-allow-create');
    if (create) create.checked = false;
  }
  renderExercicePane();
}
async function renderExercicePane() {
  if (!document.getElementById('pane-exercice')) return;
  // Chaque case contrôle sa propre colonne ; elles sont mutuellement exclusives
  // (voir onToggleAllowCreate / onToggleAllowDelete).
  const allowCreate = !!document.getElementById('exercice-allow-create')?.checked;
  const createCol = document.getElementById('pc-create-col');
  if (createCol) createCol.style.display = allowCreate ? '' : 'none';
  if (allowCreate) {
    const actives = PERIODS.filter(p => p.state === 'actif');
    const warn = document.getElementById('period-cycle-warning');
    const btn  = document.getElementById('btn-confirm-cycle');
    if (!actives.length) {
      warn.textContent = 'Aucune période active à reconduire.';
      warn.style.display = '';
      btn.disabled = true;
      btn.textContent = "Créer le prochain exercice";
    } else {
      warn.style.display = 'none';
      warn.textContent = '';
      btn.disabled = false;
      const nextName = _computeNextExerciceName();
      btn.textContent = nextName ? `Créer l'exercice ${nextName}` : "Créer le prochain exercice";
    }
  }
  await _populateUndoSection();
}
async function _populateUndoSection() {
  const col        = document.getElementById('pc-undo-col');
  const info       = document.getElementById('period-undo-info');
  const confirmRow = document.getElementById('period-undo-confirm-row');
  const ack        = document.getElementById('period-undo-ack');
  const ackLabel   = document.getElementById('period-undo-ack-label');
  if (!col) return;
  ack.checked = false;
  // La case "Supprimer le dernier exercice" pilote la visibilité de cette colonne.
  const allowDelete = !!document.getElementById('exercice-allow-delete')?.checked;
  if (!allowDelete) {
    col.style.display = 'none';
    return;
  }
  const svcId = currentServiceId && !['admin','compte'].includes(currentServiceId) ? currentServiceId : null;
  const url = '/periods.php?action=undo_cycle_info' + (svcId ? `&service_id=${encodeURIComponent(svcId)}` : '');
  const r = await apiGet(url);
  const n = r.ok ? parseInt(r.bookings_count || 0) : 0;
  // Mémorise pour la modale de confirmation (askConfirmUndo) : adapte sa teinte selon le risque.
  _undoBookingsCount = n;
  if (!r.ok || !r.has_undo) {
    col.style.display = 'none';
    return;
  }
  col.style.display = '';
  // Couleur d'accent : danger (rouge) si la suppression entraînera la perte de réservations,
  // warn (orange) sinon — moins anxiogène pour un exercice vierge.
  const accent = n > 0 ? 'var(--danger)' : 'var(--warn)';
  const labelEl = document.getElementById('pc-undo-label');
  const titleEl = document.getElementById('pc-undo-title');
  const btn     = document.getElementById('btn-confirm-undo');
  if (labelEl) labelEl.style.display = n > 0 ? '' : 'none';
  if (titleEl) titleEl.style.color = accent;
  if (btn)     btn.style.background = accent;
  if (n > 0) {
    info.textContent = `⚠️ ${n} réservation${n > 1 ? 's' : ''} seront supprimées.`;
    info.style.color = accent;
    if (ackLabel) ackLabel.textContent = `J'ai compris : ${n} réservation${n > 1 ? 's' : ''} seront supprimées.`;
    confirmRow.style.display = '';
  } else {
    info.textContent = '✓ Aucune réservation existante.';
    info.style.color = 'var(--accent)';
    confirmRow.style.display = 'none';
  }
  if (btn) {
    const name = _computeExerciceName();
    btn.textContent = name ? `Supprimer l'exercice ${name}` : "Supprimer l'exercice en cours";
  }
  _updateUndoConfirmBtn();
}
function askConfirmCycle() {
  const name = _computeNextExerciceName();
  const el = document.getElementById('exc-create-name');
  if (el) el.textContent = name ? `l'exercice ${name}` : "le prochain exercice";
  document.getElementById('exercice-create-confirm-modal').classList.add('open');
}
function closeExerciceCreateConfirm() {
  document.getElementById('exercice-create-confirm-modal').classList.remove('open');
}
function askConfirmUndo() {
  const name = _computeExerciceName();
  const el = document.getElementById('exc-delete-name');
  if (el) el.textContent = name ? `l'exercice ${name}` : "l'exercice en cours";
  // Teinte adaptée : danger (rouge) si réservations à perdre, warn (orange) sinon.
  const accent = _undoBookingsCount > 0 ? 'var(--danger)' : 'var(--warn)';
  const t = document.getElementById('exc-delete-modal-title');
  const w = document.getElementById('exc-delete-modal-warning');
  const b = document.getElementById('exc-delete-modal-btn');
  if (t) t.style.color = accent;
  if (w) w.style.color = accent;
  if (b) b.style.background = accent;
  document.getElementById('exercice-delete-confirm-modal').classList.add('open');
}
function closeExerciceDeleteConfirm() {
  document.getElementById('exercice-delete-confirm-modal').classList.remove('open');
}
async function confirmPeriodCycle() {
  const svcId = currentServiceId && !['admin','compte'].includes(currentServiceId) ? currentServiceId : null;
  const recreatePeriods = document.getElementById('pc-opt-periods').checked ? 1 : 0;
  const recreateSlots   = document.getElementById('pc-opt-slots').checked   ? 1 : 0;
  const payload = { recreate_periods: recreatePeriods, recreate_slots: recreateSlots };
  if (svcId) payload.service_id = svcId;
  const r = await apiPost('/periods.php?action=cycle', payload);
  if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  await loadPeriods();
  renderPeriodsEditor();
  if (typeof renderPeriodTabs === 'function') renderPeriodTabs();
  if (typeof renderCapTabs === 'function')  renderCapTabs();
  // Recharger aussi les services (nouveaux slots récurrents)
  if (recreateSlots) {
    const r2 = await apiGet('/services.php?action=list');
    if (r2.ok) SERVICES = r2.services || [];
  }
  // Décoche la case déclencheuse pour refermer la colonne après l'action.
  const cbCreate = document.getElementById('exercice-allow-create');
  if (cbCreate) cbCreate.checked = false;
  await renderExercicePane();
  const msg = recreatePeriods
    ? `✅ ${r.created} période(s) créée(s)` + (recreateSlots && r.slots_created ? ` · ${r.slots_created} créneau(x) cloné(s)` : '')
    : '✅ Aucune action effectuée';
  showToast(msg);
}

function _updateUndoConfirmBtn() {
  const btn = document.getElementById('btn-confirm-undo');
  const row = document.getElementById('period-undo-confirm-row');
  const ack = document.getElementById('period-undo-ack');
  // Si la case d'acquittement est visible, le bouton n'est actif que quand elle est cochée.
  if (row && row.style.display !== 'none') {
    btn.disabled = !ack.checked;
  } else {
    btn.disabled = false;
  }
}
async function confirmUndoCycle() {
  const svcId = currentServiceId && !['admin','compte'].includes(currentServiceId) ? currentServiceId : null;
  const payload = svcId ? { service_id: svcId } : {};
  const r = await apiPost('/periods.php?action=undo_cycle', payload);
  if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  await loadPeriods();
  renderPeriodsEditor();
  if (typeof renderPeriodTabs === 'function') renderPeriodTabs();
  if (typeof renderCapTabs === 'function')  renderCapTabs();
  const r2 = await apiGet('/services.php?action=list');
  if (r2.ok) SERVICES = r2.services || [];
  // Décoche la case déclencheuse pour refermer la colonne après l'action.
  const cbDelete = document.getElementById('exercice-allow-delete');
  if (cbDelete) cbDelete.checked = false;
  await renderExercicePane();
  showToast('🗑️ Exercice supprimé');
}

async function reactivateSelectedPeriods() {
  // N'agit que sur les périodes actuellement inactives.
  const ids = [...document.querySelectorAll('.period-chk:checked')]
    .map(cb => parseInt(cb.value))
    .filter(id => PERIODS.find(p => p.id === id)?.state !== 'actif');
  if (!ids.length) return;
  for (const id of ids) await apiPost('/periods.php?action=update', { id, state: 'actif' });
  await loadPeriods();
  renderPeriodsEditor();
  if (typeof renderPeriodTabs === 'function') renderPeriodTabs();
  if (typeof renderCapTabs === 'function')  renderCapTabs();
  showToast('✅ Période(s) réactivée(s)');
}
let _editPeriodId = null;
function openPeriodEditModal() {
  const checked = [...document.querySelectorAll('.period-chk:checked')];
  if (checked.length !== 1) return;
  const id = parseInt(checked[0].value);
  const p  = PERIODS.find(x => x.id === id);
  if (!p) return;
  _editPeriodId = id;
  document.getElementById('pe-etiquette').value = p.etiquette || '';
  document.getElementById('pe-color').value     = p.color || '#6dceaa';
  document.getElementById('pe-label').value     = p.label || '';
  document.getElementById('pe-date-start').value = p.date_start || '';
  document.getElementById('pe-date-end').value   = p.date_end || '';
  document.getElementById('period-edit-modal').classList.add('open');
}
function closePeriodEditModal() {
  document.getElementById('period-edit-modal').classList.remove('open');
  _editPeriodId = null;
}
async function savePeriodEdit() {
  if (!_editPeriodId) return;
  const data = {
    id:         _editPeriodId,
    etiquette:  document.getElementById('pe-etiquette').value.trim(),
    color:      document.getElementById('pe-color').value,
    label:      document.getElementById('pe-label').value.trim() || 'Période',
    date_start: document.getElementById('pe-date-start').value || null,
    date_end:   document.getElementById('pe-date-end').value   || null,
  };
  const r = await apiPost('/periods.php?action=update', data);
  if (!r.ok) { showToast('⚠️ ' + (r.error || 'Erreur')); return; }
  closePeriodEditModal();
  await loadPeriods();
  renderPeriodsEditor();
  if (typeof renderPeriodTabs === 'function') renderPeriodTabs();
  if (typeof renderCapTabs === 'function')  renderCapTabs();
  showToast('✅ Période mise à jour');
}

function toggleAllPeriods(checked) {
  document.querySelectorAll('.period-chk').forEach(cb => cb.checked = checked);
  _updatePeriodDeleteBtn();
}

// Ouvre la modale de confirmation. La suppression effective est faite par confirmDeleteSelectedPeriods().
function deleteSelectedPeriods() {
  const ids = [...document.querySelectorAll('.period-chk:checked')].map(cb => parseInt(cb.value));
  if (!ids.length) return;
  const items = ids.map(id => PERIODS.find(p => p.id === id)).filter(Boolean);
  document.getElementById('period-delete-count').textContent = items.length;
  document.getElementById('period-delete-list').innerHTML = items
    .map(p => `<li>${escHtml(p.label || ('#' + p.id))}</li>`).join('');
  document.getElementById('period-delete-modal').classList.add('open');
}
function closePeriodDeleteModal() {
  document.getElementById('period-delete-modal').classList.remove('open');
}
async function confirmDeleteSelectedPeriods() {
  const ids = [...document.querySelectorAll('.period-chk:checked')].map(cb => parseInt(cb.value));
  if (!ids.length) { closePeriodDeleteModal(); return; }
  for (const id of ids) await apiPost('/periods.php?action=delete', { id });
  closePeriodDeleteModal();
  await loadPeriods();
  renderPeriodsEditor();
  if (typeof renderPeriodTabs === 'function') renderPeriodTabs();
  showToast('🗑️ Période(s) supprimée(s)');
}

async function updatePeriodField(id, field, value) {
  const r = await apiPost('/periods.php?action=update', { id, [field]: value || null });
  if (r.ok) {
    const p = PERIODS.find(p => p.id === id);
    if (p) { p[field] = value || null; }
    showToast('✅ Période mise à jour');
  } else {
    showToast('⚠️ Erreur sauvegarde période');
  }
}
async function addPeriod() {
  const svcId = currentServiceId && !['admin','compte'].includes(currentServiceId) ? currentServiceId : null;
  const r = await apiPost('/periods.php?action=create', {
    service_id: svcId, exercice_id: currentExerciceId,
    label: 'Nouvelle période', date_start: null, date_end: null, color: '#6dceaa', position: PERIODS.length + 1
  });
  if (r.ok) {
    await loadPeriods();
    renderPeriodsEditor();
    showToast('✅ Période ajoutée');
  }
}

async function deletePeriodById(id) {
  if (!confirm('Supprimer cette période ? Toutes les réservations associées seront supprimées.')) return;
  const r = await apiPost('/periods.php?action=delete', { id });
  if (r.ok) {
    await loadPeriods();
    renderPeriodsEditor();
    if (typeof renderPeriodTabs === 'function') renderPeriodTabs();
    showToast('🗑️ Période supprimée');
  }
}
