<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CultuRézo — Réservations</title>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=Barlow+Condensed:wght@400;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<link rel="stylesheet" href="public/css/app.css?v=<?= @filemtime(__DIR__.'/public/css/app.css') ?: time() ?>">
</head>
<body>

<div class="toast" id="toast"></div>

<header>
  <div class="logo hidden" id="header-logo">
    Cultu<em>Rézo</em>
  </div>
  <div class="tagline hidden" id="header-tagline">Réseau d'activités culturelles</div>

  <div class="user-bar hidden" id="user-bar">
    <div class="user-pill-wrap">
      <div class="user-pill" onclick="toggleUserMenu()">
        <div class="avatar" id="avatar-initials">?</div>
        <span id="user-display-name" style="font-size:.78rem;color:var(--text)"></span>
        <span style="font-size:.6rem;color:var(--muted)">▾</span>
      </div>
      <div id="user-menu">
        <button onclick="switchParent('compte');toggleUserMenu()">👤 Mon compte</button>
        <button class="danger" onclick="logout()">⏏ Déconnexion</button>
      </div>
    </div>
    <button class="btn-theme" onclick="toggleTheme()" title="Changer le thème">🌙</button>
  </div>

  <div id="theme-bar-guest" style="position:absolute;top:1rem;right:1.5rem">
    <button class="btn-theme" onclick="toggleTheme()" title="Changer le thème">🌙</button>
  </div>
</header>

<main>
<div class="app-layout" style="margin-left:auto;margin-right:auto">

  <!-- ── Sidebar services ── -->
  <div id="service-sidebar-wrap" style="display:none;width:18%;min-width:fit-content;max-width:300px;flex-shrink:0;position:relative">
    <button id="sidebar-toggle" onclick="toggleServiceSidebar()" title="Réduire / agrandir">☰</button>
    <div class="sidebar-header">
      <div class="sidebar-title" style="font-size:1rem;font-weight:bolder;color:var(--text)"><span class="sidebar-title-resa">Cultu</span><em style="color:var(--accent);font-style:italic">Rézo</em></div>
      <div class="sidebar-tagline">Réseau d'activités culturelles</div>
    </div>
    <div class="sidebar-label" style="font-size:.58rem;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);padding:.5rem .75rem .4rem">Services</div>
    <div id="service-sidebar"></div>
  </div>

  <!-- ── Zone principale ── -->
  <div class="app-main">

    <!-- ══ TABS NAV ══ -->
    <div id="tabs-nav-service" class="tabs-nav">
      <button class="tab-nav-btn hidden" id="tab-reservation" onclick="switchTab('reservation')">
        <span class="tab-icon">📅</span> Réservations
      </button>
      <button class="tab-nav-btn admin-tab hidden" id="tab-agenda" onclick="switchTab('agenda')">
        <span class="tab-icon">📆</span> Agenda
      </button>
      <button class="tab-nav-btn admin-tab hidden" id="tab-editions" onclick="switchTab('editions')">
        <span class="tab-icon">📋</span> Éditions
      </button>
      <button class="tab-nav-btn admin-tab hidden" id="tab-stats" onclick="switchTab('stats')">
        <span class="tab-icon">📈</span> Statistiques
      </button>
      <button class="tab-nav-btn admin-tab hidden" id="tab-creneaux" onclick="switchTab('creneaux')">
        <span class="tab-icon">🕘</span> Créneaux
      </button>
      <button class="tab-nav-btn admin-tab hidden" id="tab-params" onclick="switchTab('params')">
        <span class="tab-icon">🔧</span> Paramètres
      </button>
    </div>

    <div id="tabs-nav-admin" class="tabs-nav hidden">
      <button class="tab-nav-btn admin-tab" id="tab-admin-services" onclick="switchAdminTab('services')">
        <span class="tab-icon">🏷️</span> Services
      </button>
      <button class="tab-nav-btn admin-tab" id="tab-admin-comptes" onclick="switchAdminTab('comptes')">
        <span class="tab-icon">👥</span> Comptes utilisateurs
      </button>
      <button class="tab-nav-btn admin-tab" id="tab-admin-demandeurs" onclick="switchAdminTab('demandeurs')">
        <span class="tab-icon">🏛️</span> Demandeurs
      </button>
      <button class="tab-nav-btn admin-tab" id="tab-admin-config" onclick="switchAdminTab('config')">
        <span class="tab-icon">✉️</span> Messagerie
      </button>
      <button class="tab-nav-btn admin-tab" id="tab-admin-divers" onclick="switchAdminTab('divers')">
        <span class="tab-icon">⚙️</span> Configuration
      </button>
      <button class="tab-nav-btn admin-tab" id="tab-admin-rgpd" onclick="switchAdminTab('rgpd')">
        <span class="tab-icon">🛡️</span> RGPD
      </button>
    </div>

    <div id="tabs-nav-compte" class="tabs-nav hidden">
      <button class="tab-nav-btn active" onclick="switchTab('compte')">
        <span class="tab-icon">👤</span> Compte
      </button>
    </div>

    <!-- ══ ONGLET COMPTE / AUTH ══ -->
    <div id="tab-content-compte" class="hidden">

      <!-- Profil connecté -->
      <div id="form-profile" class="hidden">
        <div>
          <div class="panel-title">
            <span class="dot"></span>Mon compte
          </div>
          <div id="profile-read" class="recap-grid"></div>
          <div style="margin-top:.75rem;display:flex;justify-content:flex-end">
            <button class="btn btn-ghost" id="btn-profile-edit" onclick="toggleProfileEdit()"
              style="padding:.35rem .85rem;font-size:.78rem">✏️ Modifier</button>
          </div>
          <div id="profile-edit" class="hidden" style="margin-top:.75rem">
            <div class="form-grid" style="overflow:hidden">
              <div class="field"><label for="p-nom">Nom</label><input type="text" id="p-nom" placeholder="Dupont"></div>
              <div class="field"><label for="p-prenom">Prénom</label><input type="text" id="p-prenom" placeholder="Marie"></div>
              <div class="field">
                <label>E-mail</label>
                <div style="display:flex;gap:.5rem;align-items:center">
                  <div id="p-email-display" style="flex:1;opacity:.65;padding:.42rem .6rem;border-radius:var(--rad-sm);border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:.82rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"></div>
                  <button type="button" class="btn btn-ghost" onclick="toggleEmailChange()" style="padding:.3rem .65rem;font-size:.75rem;white-space:nowrap;flex-shrink:0">Changer</button>
                </div>
                <div id="p-email-change" class="hidden" style="margin-top:.5rem;display:flex;flex-direction:column;gap:.4rem">
                  <input type="email" id="p-email-new" placeholder="nouvelle@adresse.fr" style="font-size:.85rem">
                  <span class="field-error" id="p-email-error" style="display:none"></span>
                  <div style="display:flex;gap:.5rem;justify-content:flex-end">
                    <button type="button" class="btn btn-ghost" onclick="toggleEmailChange()" style="padding:.3rem .65rem;font-size:.75rem">Annuler</button>
                    <button type="button" class="btn btn-primary" onclick="requestEmailChange()" style="padding:.3rem .8rem;font-size:.75rem">Envoyer la confirmation</button>
                  </div>
                </div>
              </div>
              <div class="field"><label for="p-tel">Téléphone</label><input type="tel" id="p-tel" placeholder="06 12 34 56 78"></div>
              <div class="field full"><label for="p-demandeur">Catégorie</label><select id="p-demandeur" onchange="onProfileDemandeurChange()"></select></div>
              <div class="field full"><label for="p-structure">Structure</label><select id="p-structure"></select></div>
              <div style="display:flex;gap:.75rem;align-items:flex-end;min-width:0">
                <div class="field" style="flex:4;min-width:0"><label for="p-niveau">Niveau</label>
                  <div class="niveau-combo">
                    <input type="text" id="p-niveau" placeholder="Choisir ou saisir..." autocomplete="off" onfocus="openNiveauList('p-niveau')" oninput="_onNiveauInput('p-niveau')">
                    <button type="button" class="niveau-combo-btn" onmousedown="event.preventDefault();toggleNiveauList('p-niveau')" tabindex="-1" title="Voir les niveaux">▾</button>
                    <div class="niveau-combo-list" id="p-niveau-list"></div>
                  </div>
                </div>
                <div class="field" style="flex:2;min-width:0"><label for="p-enfants">Enfants</label><input type="number" id="p-enfants" placeholder="25" min="1" max="99"></div>
                <div class="field" style="flex:2;min-width:0"><label for="p-accompagnants">Adultes</label><input type="number" id="p-accompagnants" placeholder="0" min="0" max="99"></div>
              </div>
              <div class="field"><label>Service <span style="color:var(--muted);font-size:.7rem;text-transform:none;letter-spacing:0">(non modifiable)</span></label>
                <div id="p-service-display" style="opacity:.45;padding:.42rem .6rem;border-radius:var(--rad-sm);border:1px solid var(--border);background:var(--surface2);color:var(--text);font-size:.82rem"></div>
              </div>
            </div>
            <div class="btn-row">
              <button class="btn btn-ghost" onclick="toggleProfileEdit()">Annuler</button>
              <button class="btn btn-primary" onclick="saveProfile()">💾 Enregistrer</button>
            </div>
          </div>
        </div>
        <div>
          <div class="panel-title"><span class="dot"></span>Changer mon mot de passe</div>
          <div class="form-grid">
            <div class="field full">
              <label for="p-pwd-current">Mot de passe actuel <span class="required-star">*</span></label>
              <input type="password" id="p-pwd-current" placeholder="••••••••" oninput="validatePwdChange()">
              <span class="field-error" id="p-pwd-error">Mot de passe actuel incorrect.</span>
            </div>
            <div class="field">
              <label for="p-pwd-new">Nouveau <span class="required-star">*</span></label>
              <input type="password" id="p-pwd-new" placeholder="••••••••" oninput="validatePwdChange();updatePwdChecklist(this)">
              <ul class="pwd-checklist">
                <li data-rule="length">12 caractères</li>
                <li data-rule="upper">1 majuscule</li>
                <li data-rule="lower">1 minuscule</li>
                <li data-rule="digit">1 chiffre</li>
                <li data-rule="special">1 caractère spécial</li>
              </ul>
              <span class="field-error" id="p-pwd-policy-error" style="display:none"></span>
            </div>
            <div class="field">
              <label for="p-pwd-confirm">Confirmer <span class="required-star">*</span></label>
              <input type="password" id="p-pwd-confirm" placeholder="••••••••" oninput="validatePwdChange()">
              <span class="field-error" id="p-pwd-mismatch">Les mots de passe ne correspondent pas.</span>
            </div>
          </div>
          <div class="btn-row">
            <button class="btn btn-primary" id="btn-pwd-change" onclick="changePassword()" disabled>🔑 Mettre à jour</button>
          </div>
        </div>
        <div>
          <div class="panel-title"><span class="dot"></span>🛡️ Mes données personnelles (RGPD)</div>
          <p style="font-size:.8rem;color:var(--muted);line-height:1.5;margin-bottom:.75rem">
            Vous pouvez télécharger l'intégralité de vos données stockées dans l'application — profil et historique des réservations — conformément à l'article 15 du RGPD (droit d'accès). Consulter la <a href="#" onclick="event.preventDefault();openPrivacyModal()" style="color:var(--accent);text-decoration:underline">politique de confidentialité</a>.
          </p>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap">
            <a class="btn btn-ghost" id="rgpd-self-pdf-btn" target="_blank"
              style="padding:.4rem .9rem;font-size:.82rem;text-decoration:none">🖨️ Vue imprimable / PDF</a>
            <a class="btn btn-ghost" id="rgpd-self-json-btn" download
              style="padding:.4rem .9rem;font-size:.82rem;text-decoration:none">📥 Télécharger en JSON</a>
          </div>
          <div id="rgpd-self-delete-section" style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border);display:none">
            <p style="font-size:.8rem;color:var(--muted);line-height:1.5;margin-bottom:.75rem">
              <strong style="color:var(--text)">Supprimer mes données</strong> — vous pouvez demander l'effacement définitif de vos informations nominatives (droit à l'effacement, RGPD article 17). L'historique de vos réservations sera conservé sous forme anonyme à des fins statistiques.
            </p>
            <button class="btn btn-ghost" onclick="openSelfDeleteModal()"
              style="padding:.4rem .9rem;font-size:.82rem;border-color:rgba(224,107,107,.4);color:var(--danger)">
              🗑️ Demander la suppression de mon compte
            </button>
          </div>
        </div>
      </div>

      <!-- Mode toggle -->
      <div class="mode-toggle" id="mode-toggle">
        Déjà inscrit ? <button onclick="setAuthMode('login')">Se connecter</button>
      </div>

      <!-- Panneau confirmation email envoyé -->
      <div id="form-email-sent" class="hidden" style="width:60%;max-width:100%;margin:0 auto">
        <div class="panel" style="text-align:center;padding:2rem 1.5rem">
          <div style="font-size:2.5rem;margin-bottom:.75rem">📧</div>
          <div class="panel-title" style="justify-content:center;margin-bottom:.5rem"><span class="dot"></span>Vérifiez votre boîte mail</div>
          <p style="font-size:.88rem;color:var(--muted);line-height:1.6;margin-bottom:1.25rem">
            Un e-mail de confirmation vous a été envoyé.<br>
            Cliquez sur le lien dans cet e-mail pour activer votre compte.
          </p>
          <p style="font-size:.78rem;color:var(--muted)">Le lien est valable 24 heures.</p>
          <div style="margin-top:1.25rem">
            <button class="btn btn-ghost" onclick="setAuthMode('login')" style="font-size:.82rem">
              J'ai confirmé → Se connecter
            </button>
          </div>
        </div>
      </div>

      <!-- Formulaire création de compte -->
      <div id="form-create">
        <div class="panel">
          <div class="panel-title"><span class="dot"></span>Créer un compte</div>
          <div class="form-grid">
            <div class="field"><label for="c-nom">Nom <span class="required-star">*</span></label><input type="text" id="c-nom" placeholder="Dupont" oninput="validateCreate()"></div>
            <div class="field"><label for="c-prenom">Prénom <span class="required-star">*</span></label><input type="text" id="c-prenom" placeholder="Marie" oninput="validateCreate()"></div>
            <div class="field"><label for="c-email">E-mail <span class="required-star">*</span></label><input type="email" id="c-email" placeholder="marie@exemple.fr" oninput="validateCreate()"></div>
            <div class="field"><label for="c-tel">Téléphone</label><input type="tel" id="c-tel" placeholder="06 12 34 56 78"></div>
            <div class="field"><label for="c-demandeur">Catégorie</label><select id="c-demandeur" onchange="onCreateDemandeurChange()"></select></div>
            <div class="field"><label for="c-structure">Structure</label><select id="c-structure"></select></div>
            <div class="field full uc-niveau-row">
              <div><label for="c-niveau">Niveau</label>
                <div class="niveau-combo">
                  <input type="text" id="c-niveau" placeholder="Choisir ou saisir..." autocomplete="off" onfocus="openNiveauList('c-niveau')" oninput="_onNiveauInput('c-niveau')">
                  <button type="button" class="niveau-combo-btn" onmousedown="event.preventDefault();toggleNiveauList('c-niveau')" tabindex="-1" title="Voir les niveaux">▾</button>
                  <div class="niveau-combo-list" id="c-niveau-list"></div>
                </div>
              </div>
              <div><label for="c-enfants">Nb enfants</label><input type="number" id="c-enfants" placeholder="25" min="0" max="99"></div>
              <div><label for="c-accompagnants">Nb accompagnants</label><input type="number" id="c-accompagnants" placeholder="0" min="0" max="99"></div>
            </div>
            <div class="field"><label for="c-pwd">Mot de passe <span class="required-star">*</span></label>
              <input type="password" id="c-pwd" placeholder="••••••••" oninput="validateCreate();updatePwdChecklist(this)">
              <ul class="pwd-checklist">
                <li data-rule="length">12 caractères</li>
                <li data-rule="upper">1 majuscule</li>
                <li data-rule="lower">1 minuscule</li>
                <li data-rule="digit">1 chiffre</li>
                <li data-rule="special">1 caractère spécial</li>
              </ul>
              <span class="field-error" id="c-pwd-policy-error" style="display:none"></span></div>
            <div class="field"><label for="c-pwd2">Confirmer <span class="required-star">*</span></label>
              <input type="password" id="c-pwd2" placeholder="••••••••" oninput="validateCreate()">
              <span class="field-error" id="pwd-error">Les mots de passe ne correspondent pas.</span></div>
          </div>
        </div>
        <div class="rgpd-box">
          <div class="rgpd-header">🔒 Protection des données (RGPD)</div>
          <p class="rgpd-text">La Ville de Châtillon traite les données recueillies pour pouvoir gérer votre demande de réservation, et également afin de vous contacter en vue de bénéficier des services et des informations concernant les activités, évènements et fonctionnement des structures culturelles de la Ville.</p>
          <p class="rgpd-text" style="margin-top:.5rem">Pour en savoir plus sur la gestion de vos données personnelles et pour exercer vos droits, cliquez sur notre <a href="#" onclick="event.preventDefault();openPrivacyModal()" style="color:inherit;text-decoration:underline">Politique de confidentialité</a>.</p>
          <div class="check-row">
            <label class="custom-check">
              <input type="checkbox" id="rgpd-1" onchange="validateCreate()">
              <span class="checkmark"></span>
            </label>
            <span class="check-label" onclick="document.getElementById('rgpd-1').click()">
              J'accepte que mes données soient utilisées pour la gestion de mes réservations.
            </span>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-create" onclick="createAccount()" disabled>Créer mon compte →</button>
        </div>
      </div>

      <!-- Page de confirmation email envoyé -->
      <div id="form-email-sent" class="hidden" style="width:70%;max-width:100%;margin:0 auto">
        <div class="panel" style="text-align:center;padding:2rem 1.5rem">
          <div style="font-size:3rem;margin-bottom:.75rem">🖅</div>
          <div class="panel-title" style="justify-content:center;margin-bottom:.75rem"><span class="dot"></span>Vérifiez votre boîte mail</div>
          <p style="color:var(--fg);line-height:1.7;margin-bottom:1.5rem">
            Un e-mail de confirmation vient de vous être envoyé.<br>
            Cliquez sur le lien qu'il contient pour activer votre compte.<br>
            <span style="color:var(--muted);font-size:.85rem">Pensez à vérifier vos spams si vous ne le recevez pas dans quelques minutes.</span>
          </p>
          <ol style="text-align:left;display:inline-block;color:var(--fg);line-height:2;margin-bottom:1.5rem">
            <li>Ouvrez votre boîte mail</li>
            <li>Recherchez un message de <strong>CultuRézo</strong></li>
            <li>Cliquez sur le lien de confirmation</li>
            <li>Revenez ici et connectez-vous</li>
          </ol>
          <div style="margin-top:.5rem">
            <button class="btn btn-ghost" onclick="setAuthMode('login')" style="font-size:.85rem">← Retour à la connexion</button>
          </div>
        </div>

        <div class="rgpd-box" style="margin-top:1rem">
          <div class="rgpd-header">🔒 Vos droits sur vos données personnelles (RGPD)</div>
          <p class="rgpd-text">Conformément au <strong>Règlement Général sur la Protection des Données (RGPD – UE 2016/679)</strong>, vous disposez des droits suivants sur vos données :</p>
          <ul class="rgpd-text" style="padding-left:1.25rem;line-height:1.9">
            <li><strong>Droit d'accès</strong> — vous pouvez demander à consulter les données vous concernant.</li>
            <li><strong>Droit de rectification</strong> — vous pouvez corriger des informations inexactes via votre espace compte.</li>
            <li><strong>Droit à l'effacement</strong> — vous pouvez demander la suppression de votre compte et de vos données.</li>
            <li><strong>Droit d'opposition</strong> — vous pouvez vous opposer à tout moment au traitement de vos données.</li>
          </ul>
          <p class="rgpd-text" style="margin-top:.75rem">Pour exercer ces droits, contactez directement l'établissement ou le service auprès duquel vous avez effectué votre inscription. Vos demandes seront traitées dans un délai d'un mois conformément à la réglementation.</p>
        </div>
      </div>

      <!-- Formulaire connexion -->
      <div id="form-login" class="hidden" style="width:60%;max-width:100%;margin:0 auto">
        <div class="panel">
          <div class="panel-title"><span class="dot"></span>Se connecter</div>
          <div class="form-grid">
            <div class="field full"><label for="l-email">E-mail <span class="required-star">*</span></label>
              <input type="text" id="l-email" placeholder="marie@exemple.fr" oninput="validateLogin()"></div>
            <div class="field full"><label for="l-pwd">Mot de passe <span class="required-star">*</span></label>
              <input type="password" id="l-pwd" placeholder="••••••••" oninput="validateLogin()"
                     onkeydown="if(event.key==='Enter') login()">
              <span class="field-error" id="login-error">E-mail ou mot de passe incorrect.</span>
              <div style="margin-top:.4rem;text-align:right">
                <a href="#" onclick="event.preventDefault();openForgotPasswordModal()"
                  style="font-size:.75rem;color:var(--muted);text-decoration:underline">Mot de passe oublié ?</a>
              </div>
            </div>
          </div>
        </div>
        <div class="btn-row">
          <button class="btn btn-primary" id="btn-login" onclick="login()" disabled>Connexion →</button>
        </div>
      </div>

    </div><!-- /tab-compte -->

    <!-- ══ ONGLET RÉSERVATION ══ -->
    <div id="tab-content-reservation" class="hidden">
      <div>
        <div>
        <div style="position:relative;display:flex;align-items:center;justify-content:space-between">
          <div style="display:flex;align-items:center;gap:1rem">
            <div class="panel-title" style="margin:0">
              <span class="dot"></span>Réservations
              <span class="exercice-nav-inline"><span class="ex-nav-label">—</span></span>
            </div>
          </div>
          <div id="user-agenda-week-nav" style="display:none;align-items:center;gap:.6rem;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">
            <button type="button" id="user-agenda-week-prev" class="btn btn-ghost" onclick="shiftUserAgendaWeek(-1)" aria-label="Semaine précédente" style="padding:.15rem .3rem;font-size:.78rem;line-height:1">◀</button>
            <span id="user-agenda-week-label" style="font-size:.85rem;font-weight:600;color:var(--text);min-width:120px;text-align:center"></span>
            <button type="button" id="user-agenda-week-next" class="btn btn-ghost" onclick="shiftUserAgendaWeek(1)" aria-label="Semaine suivante" style="padding:.15rem .3rem;font-size:.78rem;line-height:1">▶</button>
            <button type="button" class="btn btn-ghost" onclick="resetUserAgendaWeekToToday()" style="padding:.15rem .6rem;font-size:.7rem;margin-left:.4rem">Aujourd'hui</button>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0">
            <button id="btn-export-reservations" onclick="exportReservationsExcel()" title="Exporter en Excel"
              style="background:none;border:1px solid var(--border);border-radius:var(--rad-sm);padding:.28rem .38rem;cursor:pointer;color:var(--muted);display:flex;align-items:center;line-height:1;transition:color .15s,border-color .15s"
              onmouseover="this.style.color='#1d6f42';this.style.borderColor='#1d6f42'"
              onmouseout="this.style.color='var(--muted)';this.style.borderColor='var(--border)'">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
              </svg>
            </button>
            <button id="btn-print-reservations" onclick="printBW=true;printReservations()" title="Imprimer en noir &amp; blanc"
              style="background:none;border:1px solid var(--border);border-radius:var(--rad-sm);padding:.28rem .38rem;cursor:pointer;color:var(--muted);display:flex;align-items:center;line-height:1;transition:color .15s,border-color .15s"
              onmouseover="this.style.color='var(--muted)';this.style.borderColor='var(--accent)'"
              onmouseout="this.style.color='var(--muted)';this.style.borderColor='var(--border)'">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
            </button>
            <button onclick="printBW=false;printReservations()" title="Imprimer en couleur"
              style="background:none;border:1px solid var(--border);border-radius:var(--rad-sm);padding:.28rem .38rem;cursor:pointer;color:var(--muted);display:flex;align-items:center;line-height:1;transition:color .15s,border-color .15s"
              onmouseover="this.style.borderColor='var(--accent)'"
              onmouseout="this.style.borderColor='var(--border)'">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/>
                <rect x="6" y="14" width="12" height="8" rx="1"/>
                <path style="fill:var(--accent);stroke:none" d="M 3.7630604,16.948673 C 3.4626967,16.867952 3.2657742,16.704292 3.1046628,16.401487 l -0.071206,-0.133829 v -2.765799 -2.7658 l 0.1021266,-0.188366 c 0.1125884,-0.207663 0.2718475,-0.354976 0.495038,-0.457905 l 0.1463299,-0.06748 H 12 20.223048 l 0.14633,0.06748 c 0.223191,0.102929 0.38245,0.250242 0.495038,0.457905 l 0.102127,0.188366 v 2.7658 2.765799 l -0.07121,0.133829 c -0.11037,0.207439 -0.203731,0.316066 -0.355162,0.413239 -0.226463,0.145321 -0.427098,0.181557 -1.005271,0.181557 h -0.512078 l -0.01069,-1.182157 -0.01069,-1.182156 -0.07988,-0.237918 c -0.21448,-0.638791 -0.673298,-1.098007 -1.315606,-1.316746 L 17.36803,12.996283 H 12 6.6319703 l -0.2379183,0.08102 c -0.326397,0.111155 -0.5843599,0.269576 -0.8157648,0.500981 -0.2323107,0.232311 -0.3907765,0.490935 -0.4998408,0.815765 l -0.079883,0.237918 -0.010695,1.182156 -0.010695,1.182157 -0.5257617,-0.002 C 4.0881255,16.99288 3.8754049,16.97882 3.7630598,16.94863 Z"/>
                <path style="fill:#fff6d5;stroke:none" d="M 7.0037175,5.5018587 V 3.0185874 H 12 16.996283 V 5.5018587 7.9851301 H 12 7.0037175 Z"/>
                <path style="fill:#fff6d5;stroke:none" d="M 7.0037175,17.992565 V 15.003717 H 12 16.996283 v 2.988848 2.988848 H 12 7.0037175 Z"/>
              </svg>
            </button>
          </div>
        </div>
        </div><!-- /header wrapper -->

        <!-- ── Vue agenda côté utilisateur (placée AVANT le tableau de réservations) ── -->
        <div id="user-agenda-wrap" style="display:none;padding:.5rem 0 1.25rem">
          <div style="position:relative;display:flex;align-items:center;gap:1rem;margin-bottom:.5rem;flex-wrap:wrap;min-height:1.8rem">
            <div class="period-tabs" id="user-agenda-period-tabs" style="margin:0"></div>
            <div class="agenda-mode-toggle" id="user-agenda-ab-toggle" style="display:none;margin-left:auto" aria-label="Semaine A ou B">
              <button type="button" class="agenda-mode-btn active" id="user-agenda-ab-A"
                onclick="setUserAgendaWeekAB('A')">Semaine A</button>
              <button type="button" class="agenda-mode-btn" id="user-agenda-ab-B"
                onclick="setUserAgendaWeekAB('B')">Semaine B</button>
            </div>
            <label class="planning-option" id="user-agenda-show-empty-wrap" style="margin-left:auto">
              Afficher les horaires sans créneau
              <input type="checkbox" id="user-agenda-show-empty" onchange="userAgendaShowEmptySlots=this.checked;renderUserAgenda()">
            </label>
          </div>
          <div id="user-agenda-grid"></div>
          <div class="info-note" style="margin-top:.25rem;width:fit-content;padding:0 .7rem .4rem">ℹ️ <span id="max-res-label"></span></div>
          <div class="schedule-footer">
            <div class="schedule-pagination"></div>
            <div class="schedule-footer-actions">
              <button id="btn-cancel-reservations-agenda" class="btn btn-ghost" onclick="cancelReservations()" disabled>Annuler</button>
              <button id="btn-to-confirm-agenda" class="btn btn-primary" onclick="goToConfirm()" disabled>Enregistrer →</button>
            </div>
          </div>
        </div>

        <div id="dem-info" style="display:none;font-size:.78rem;color:var(--muted);align-items:center;gap:.6rem;flex-wrap:wrap;padding:.6rem 0"></div>
      </div>
    </div><!-- /tab-reservation -->

    <!-- ══ MENU CONTEXTUEL SLOT VIDE ══ -->
    <div id="slot-ctx-empty-menu" class="slot-ctx-menu hidden">
      <button id="slot-ctx-new">📅 Nouvelle réservation</button>
      <button id="slot-ctx-paste">📋 Coller</button>
    </div>

    <!-- ══ MENU CONTEXTUEL SLOT ══ -->
    <div id="slot-ctx-menu" class="slot-ctx-menu hidden">
      <button id="slot-ctx-cut">✂️ Couper</button>
      <button id="slot-ctx-copy">📋 Copier</button>
      <hr class="slot-ctx-sep">
      <button id="slot-ctx-delete" class="slot-ctx-danger">🗑️ Supprimer</button>
    </div>

    <!-- ══ MODALE CONFIRMATION RÉSERVATION ══ -->
    <div class="modal-overlay" id="reservation-confirm-modal" onclick="if(event.target===this)closeReservationConfirmModal()">
      <div class="modal-box" style="max-width:720px;max-height:85vh;overflow-y:auto">
        <div class="modal-title">✅ Confirmer mes réservations</div>
        <div class="panel">
          <div class="panel-title" style="justify-content:space-between">
            <span style="display:flex;align-items:center;gap:.6rem"><span class="dot"></span>Récapitulatif</span>
            <button class="btn btn-ghost" onclick="window.print()" style="padding:.4rem .9rem;font-size:.78rem">🖨️ Imprimer</button>
          </div>
          <div class="recap-grid" id="recap-user"></div>
        </div>
        <div class="panel">
          <div class="panel-title"><span class="dot"></span>Mes réservations</div>
          <div id="recap-bookings"></div>
        </div>
        <div class="btn-row">
          <button class="btn btn-ghost" onclick="closeReservationConfirmModal()">← Modifier</button>
          <button class="btn btn-primary" onclick="finalConfirm()">Enregistrer mes réservations ✓</button>
        </div>
        <button class="modal-close" onclick="closeReservationConfirmModal()">×</button>
      </div>
    </div><!-- /reservation-confirm-modal -->

    <!-- ══ ONGLET ADMINISTRATION ══ -->
    <div id="tab-content-admin" class="hidden">
      <!-- Services -->
      <div id="tab-content-admin-services">
        <div>
          <div class="panel-title" style="justify-content:space-between">
            <span style="display:flex;align-items:center;gap:.6rem"><span class="dot" style="background:var(--warn)"></span>Configuration des services</span>
            <button class="btn btn-ghost" onclick="openCreateSvcModal()" style="padding:.3rem .75rem;font-size:.78rem">＋ Ajouter</button>
          </div>
          <div class="admin-table-wrap">
            <table class="admin-table" id="services-config-table" style="width:100%">
              <thead><tr>
                <th class="col-check" style="width:2rem"></th>
                <th style="width:2.5rem"></th>
                <th style="min-width:220px">Service</th>
                <th style="width:90px;text-align:center">Actions</th>
              </tr></thead>
              <tbody id="services-config-tbody"></tbody>
            </table>
          </div>
          <div style="margin-top:.5rem;visibility:hidden;display:flex;align-items:center;gap:.75rem" id="svc-bulk-toolbar">
            <span id="svc-bulk-count" style="font-size:.82rem;color:var(--muted)"></span>
            <button class="btn btn-ghost" onclick="editSelectedSvc()" style="border-color:rgba(109,206,170,.4);color:var(--accent);font-size:.8rem">✏️ Modifier</button>
            <button class="btn btn-ghost" onclick="deleteSelectedSvcs()" style="border-color:rgba(220,80,80,.4);color:#e05555;font-size:.8rem">🗑️ Supprimer</button>
          </div>
        </div>
      </div>

      <!-- Comptes -->
      <div id="tab-content-admin-comptes" class="hidden">
        <div>
          <div class="panel-title" style="justify-content:space-between;gap:.75rem">
            <span style="display:flex;align-items:center;gap:.6rem"><span class="dot" style="background:var(--warn)"></span>Comptes utilisateurs</span>
            <div class="search-wrap">
              <svg class="search-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" /></svg>
              <input type="text" id="uc-search-admin" placeholder="Nom, e-mail…" oninput="renderUserAccountsAdmin()">
            </div>
            <button class="btn btn-ghost" onclick="openCreateUserModal()" style="padding:.25rem .65rem;font-size:.68rem">＋ Ajouter</button>
          </div>
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead><tr>
                <th class="col-check"></th>
                <th style="min-width:130px;text-align:center" onclick="sortUsers('nom')">Nom <span class="sort-arrow">↕</span></th>
                <th style="min-width:130px;text-align:center" onclick="sortUsers('prenom')">Prénom <span class="sort-arrow">↕</span></th>
                <th style="text-align:center" onclick="sortUsers('email')">E-mail <span class="sort-arrow">↕</span></th>
                <th style="text-align:center">Téléphone</th>
                <th style="text-align:center">Structure / Service</th>
                <th style="text-align:center" onclick="sortUsers('role')">Rôle <span class="sort-arrow">↕</span></th>
                <th style="text-align:center" title="Export RGPD">RGPD</th>
              </tr></thead>
              <tbody id="uc-tbody-admin"></tbody>
              <tfoot><tr>
                <td id="uc-count-admin" colspan="8" style="border:none;padding:.55rem .6rem 0;font-size:.72rem;color:var(--muted)"></td>
              </tr></tfoot>
            </table>
          </div>
          <div style="margin-top:.5rem;display:flex;align-items:center;gap:.75rem">
            <div style="visibility:hidden;display:flex;align-items:center;gap:.75rem;flex:1" id="uc-bulk-toolbar-admin">
              <span id="uc-bulk-count-admin" style="font-size:.82rem;color:var(--muted)"></span>
              <button class="btn btn-ghost" onclick="editSelectedAccount()" style="border-color:rgba(109,206,170,.4);color:var(--accent);font-size:.68rem;padding:.25rem .65rem">✏️ Modifier</button>
              <button class="btn btn-ghost" id="btn-delete-account" onclick="deleteSelectedAccounts()" style="display:none;border-color:rgba(220,80,80,.4);color:#e05555;font-size:.68rem;padding:.25rem .65rem" title="Supprimer définitivement (réservé aux comptes sans réservation)">🗑️ Supprimer</button>
              <button class="btn btn-ghost" id="btn-resend-confirm" onclick="resendConfirmationEmail()" style="display:none;border-color:rgba(232,164,90,.4);color:var(--warn);font-size:.68rem;padding:.25rem .65rem">🖅 Renvoyer le mail de confirmation</button>
              <button class="btn btn-ghost" onclick="clearAccountSelection()" style="font-size:.68rem;padding:.25rem .65rem" title="Désélectionner le compte">Annuler</button>
            </div>
            <div id="uc-pagination-admin" style="display:flex;align-items:center;gap:.5rem"></div>
            <div style="flex:1"></div>
          </div>
          <div id="uc-empty-admin" class="admin-empty hidden">Aucun compte utilisateur.</div>
        </div>
      </div>

      <!-- Demandeurs (référentiel global) -->
      <div id="tab-content-admin-demandeurs" class="hidden">
        <div>
          <div class="panel-title" style="justify-content:space-between;gap:.75rem">
            <span style="display:flex;align-items:center;gap:.6rem"><span class="dot" style="background:var(--warn)"></span>Demandeurs</span>
            <button class="btn btn-ghost" onclick="addDemandeurAdmin()" style="padding:.25rem .65rem;font-size:.68rem">＋ Ajouter</button>
          </div>
          <div class="admin-table-wrap">
            <table class="admin-table">
              <thead><tr>
                <th style="min-width:200px;text-align:left">Libellé</th>
                <th style="width:240px;text-align:center" title="Coché = Ouvert pendant les vacances scolaires">Vacances</th>
                <th style="width:80px"></th>
              </tr></thead>
              <tbody id="dem-tbody-admin"></tbody>
            </table>
          </div>
          <div style="margin-top:.6rem;display:flex;justify-content:flex-end;gap:.5rem">
            <button id="btn-cancel-demandeurs-admin" class="btn btn-ghost" onclick="cancelDemandeursAdmin()" style="display:none;font-size:.7rem;padding:.2rem .6rem">Annuler</button>
            <button class="btn btn-primary" onclick="saveDemandeursAdmin()" style="background:var(--warn);color:#0f1117;font-size:.7rem;padding:.2rem .6rem">💾 Enregistrer</button>
          </div>
          <div id="dem-empty-admin" class="admin-empty hidden">Aucun demandeur.</div>
        </div>
      </div>

      <!-- Configuration -->
      <div id="tab-content-admin-config" class="hidden">

        <!-- Configuration messagerie -->
        <div>
          <div class="panel-title" style="justify-content:space-between">
            <span style="display:flex;align-items:center;gap:.6rem">
              <span class="dot" style="background:var(--warn)"></span>Configuration messagerie
            </span>
            <button class="btn btn-ghost" onclick="saveMailConfig()" id="btn-mail-save"
              style="padding:.3rem .75rem;font-size:.78rem">💾 Enregistrer</button>
          </div>
          <div class="form-grid">

            <div class="field">
              <label for="cfg-mail-driver">Mode d'envoi</label>
              <select id="cfg-mail-driver" onchange="toggleSmtpFields()">
                <option value="smtp">SMTP</option>
                <option value="mail">Fonction mail() PHP</option>
                <option value="sendmail">Sendmail</option>
              </select>
            </div>

            <div class="field">
              <label for="cfg-mail-from">Adresse expéditeur <span class="required-star">*</span></label>
              <input type="email" id="cfg-mail-from" placeholder="noreply@example.com">
            </div>

            <div class="field">
              <label for="cfg-mail-from-name">Nom expéditeur</label>
              <input type="text" id="cfg-mail-from-name" placeholder="CultuRézo">
            </div>

            <div id="smtp-fields-wrap" style="display:contents">
              <div class="field">
                <label for="cfg-mail-host">Serveur SMTP <span class="required-star">*</span></label>
                <input type="text" id="cfg-mail-host" placeholder="smtp.example.com">
              </div>

              <div style="display:flex;gap:.75rem;align-items:flex-end;min-width:0">
                <div class="field" style="flex:3;min-width:0">
                  <label for="cfg-mail-port">Port</label>
                  <input type="number" id="cfg-mail-port" placeholder="587" min="1" max="65535">
                </div>
                <div class="field" style="flex:5;min-width:0">
                  <label for="cfg-mail-security">Chiffrement</label>
                  <select id="cfg-mail-security">
                    <option value="">Aucun</option>
                    <option value="tls">STARTTLS</option>
                    <option value="ssl">SSL/TLS</option>
                  </select>
                </div>
              </div>

              <div class="field">
                <label for="cfg-mail-username">Nom d'utilisateur SMTP</label>
                <input type="text" id="cfg-mail-username" placeholder="user@example.com" autocomplete="off">
              </div>

              <div class="field">
                <label for="cfg-mail-password">Mot de passe SMTP</label>
                <input type="password" id="cfg-mail-password" placeholder="••••••••" autocomplete="new-password">
                <span class="field-hint">Laissez vide pour conserver le mot de passe actuel.</span>
              </div>
            </div>

          </div>

          <!-- Test d'envoi -->
          <div style="margin-top:1.25rem;padding-top:1rem;border-top:1px solid var(--border)">
            <div class="panel-title" style="margin-bottom:.75rem;font-size:.8rem">
              <span class="dot" style="background:var(--accent);width:.45rem;height:.45rem"></span>
              Envoyer un e-mail de test
            </div>
            <div style="display:flex;gap:.65rem;align-items:flex-end;flex-wrap:wrap">
              <div class="field" style="flex:1;min-width:200px;margin:0">
                <label for="cfg-mail-test-to" style="font-size:.72rem">Destinataire</label>
                <input type="email" id="cfg-mail-test-to" placeholder="destinataire@example.com">
              </div>
              <button class="btn btn-ghost" onclick="sendTestMail()"
                style="padding:.38rem .9rem;font-size:.78rem;border-color:rgba(109,206,170,.4);color:var(--accent)">
                🖅 Envoyer le test
              </button>
            </div>
          </div>
        </div>

      </div><!-- /tab-config -->

      <!-- Configuration (divers) -->
      <div id="tab-content-admin-divers" class="hidden">
        <div>
          <div class="panel-title" style="padding:.3rem 0">
            <span class="dot" style="background:var(--warn)"></span>Divers
          </div>
          <label style="display:flex;align-items:center;gap:.5rem;font-size:.85rem">
            Vacances scolaires — zone
            <select id="cfg-school-zone" onchange="setSchoolZone(this.value)" style="font-size:.85rem;padding:.2rem .4rem;border-radius:var(--rad-sm);border:1px solid var(--border);background:var(--surface2);color:var(--text)">
              <option value="A">A</option>
              <option value="B">B</option>
              <option value="C">C</option>
            </select>
            <button class="btn btn-ghost" onclick="refreshSchoolHolidays()"
              style="font-size:.75rem;padding:.2rem .55rem;border-color:rgba(109,206,170,.4);color:var(--accent)"
              title="Rafraîchir depuis data.education.gouv.fr">🔄 Rafraîchir</button>
            <span id="cfg-school-info" style="font-size:.72rem;color:var(--muted)"></span>
          </label>
          <label style="display:flex;align-items:center;gap:.5rem;cursor:pointer;font-size:.85rem;user-select:none;margin-top:.75rem">
            Mode debug
            <input type="checkbox" id="cfg-debug-mode" class="admin-cb" onchange="setDebugMode(this.checked)" style="accent-color:var(--accent);width:14px;height:14px">
          </label>
        </div>
      </div><!-- /tab-divers -->

      <!-- RGPD : scan d'inactivité (admin) -->
      <div id="tab-content-admin-rgpd" class="hidden">
        <div>
          <div class="panel-title" style="padding:.3rem 0">
            <span class="dot" style="background:var(--warn)"></span>RGPD — Scan d'inactivité
          </div>
          <p style="font-size:.78rem;color:var(--muted);margin-bottom:1rem;line-height:1.5">
            Liste tous les utilisateurs (hors gestionnaires et administrateurs) triés par durée d'inactivité décroissante. Le bouton « Effacer » apparaît pour ceux qui dépassent le seuil défini ci-dessous.
          </p>
          <!-- Barre de contrôles : seuil + actions -->
          <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.75rem">
            <label style="display:flex;align-items:center;gap:.5rem;font-size:.78rem;color:var(--muted)">
              Seuil d'inactivité
              <input type="number" id="cfg-rgpd-retention-years" min="0" max="50" onchange="setRgpdRetentionYears(this.value)"
                style="width:60px;font-size:.78rem;padding:.2rem .4rem;border-radius:var(--rad-sm);border:1px solid var(--border);background:var(--surface2);color:var(--text)">
              années
            </label>
            <div style="margin-left:auto;display:flex;gap:.4rem;flex-wrap:wrap">
              <button class="btn btn-ghost" onclick="loadAdminRgpd()" style="padding:.25rem .7rem;font-size:.72rem">🔄 Rafraîchir</button>
              <button class="btn btn-ghost" id="rgpd-p2-notify-btn" onclick="_rgpdBulkNotify()" disabled
                style="padding:.25rem .7rem;font-size:.72rem;border-color:rgba(232,164,90,.4);color:#e8a45a;opacity:.4">
                📧 Envoyer le préavis (<span id="rgpd-p2-notify-count">0</span>)
              </button>
              <button class="btn btn-ghost" id="rgpd-p2-bulk-btn" onclick="_rgpdBulkAnonymize()" disabled
                style="padding:.25rem .7rem;font-size:.72rem;border-color:rgba(224,107,107,.4);color:var(--danger);opacity:.4">
                🗑️ Effacer tous les comptes éligibles (<span id="rgpd-p2-bulk-count">0</span>)
              </button>
            </div>
          </div>
          <div id="rgpd-p2-list" style="max-height:500px;overflow-y:auto"></div>

          <!-- Journal d'audit RGPD -->
          <div style="margin-top:2rem">
            <div class="panel-title" style="padding:.3rem 0">
              <span class="dot" style="background:var(--warn)"></span>Journal d'audit RGPD
            </div>
            <p style="font-size:.78rem;color:var(--muted);margin-bottom:1rem;line-height:1.5">
              Trace toutes les actions RGPD effectuées sur l'application (anonymisations, exports, etc.). Cette journalisation est requise par le principe de redevabilité (RGPD art. 5.2) — ne contient pas de données nominatives.
            </p>
            <div style="display:flex;align-items:center;gap:.5rem;flex-wrap:wrap;margin-bottom:.5rem">
              <span style="font-size:.72rem;color:var(--muted)" id="rgpd-log-count"></span>
              <div style="margin-left:auto;display:flex;gap:.4rem">
                <button class="btn btn-ghost" onclick="loadRgpdAuditLog()" style="padding:.25rem .7rem;font-size:.72rem">🔄 Rafraîchir</button>
                <a class="btn btn-ghost" href="api/rgpd_log.php?action=export" download
                  style="padding:.25rem .7rem;font-size:.72rem;text-decoration:none">📥 Export CSV</a>
              </div>
            </div>
            <div id="rgpd-log-list" style="max-height:500px;overflow-y:auto"></div>
          </div>
        </div>
      </div><!-- /tab-rgpd -->

    </div><!-- /tab-admin -->


    <!-- ══ ONGLET AGENDA HEBDOMADAIRE ══ -->
    <div id="tab-content-agenda" class="hidden">
      <div>
        <div style="position:relative;display:flex;align-items:center;justify-content:space-between;margin-bottom:.5rem;flex-wrap:wrap;gap:1rem">
          <div class="panel-title" style="margin:0">
            <span class="dot" style="background:var(--accent)"></span>Agenda
            <span class="exercice-nav-inline">
              <span class="ex-nav-label">—</span>
              <span class="ex-nav-arrows">
                <button type="button" class="ex-arrow ex-nav-prev" onclick="selectPrevExercice()" aria-label="Exercice précédent">◀</button>
                <button type="button" class="ex-arrow ex-nav-next" onclick="selectNextExercice()" aria-label="Exercice suivant">▶</button>
              </span>
            </span>
          </div>
          <div id="agenda-week-nav" style="display:none;align-items:center;gap:.6rem;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%)">
            <button type="button" id="agenda-week-prev" class="btn btn-ghost"
              onclick="shiftAgendaWeek(-1)"
              onmousedown="_startWeekShiftHold('shiftAgendaWeek',-1,'agenda-week-prev',event)"
              ontouchstart="_startWeekShiftHold('shiftAgendaWeek',-1,'agenda-week-prev',event)"
              onmouseleave="_stopWeekShiftHold()"
              aria-label="Semaine précédente" style="padding:.15rem .3rem;font-size:.78rem;line-height:1">◀</button>
            <span id="agenda-week-label" style="font-size:.85rem;font-weight:600;color:var(--text);min-width:120px;text-align:center"></span>
            <button type="button" id="agenda-week-next" class="btn btn-ghost"
              onclick="shiftAgendaWeek(1)"
              onmousedown="_startWeekShiftHold('shiftAgendaWeek',1,'agenda-week-next',event)"
              ontouchstart="_startWeekShiftHold('shiftAgendaWeek',1,'agenda-week-next',event)"
              onmouseleave="_stopWeekShiftHold()"
              aria-label="Semaine suivante" style="padding:.15rem .3rem;font-size:.78rem;line-height:1">▶</button>
            <button type="button" class="btn btn-ghost" onclick="resetAgendaWeekToToday()" style="padding:.15rem .6rem;font-size:.7rem;margin-left:.4rem">Aujourd'hui</button>
          </div>
          <div class="agenda-mode-toggles-wrap">
            <div class="agenda-mode-toggle" id="agenda-mode-switcher" role="tablist" aria-label="Mode d'affichage">
              <button type="button" class="agenda-mode-btn active" id="agenda-mode-model"
                onclick="setAgendaMode('model')">Modèle de période</button>
              <button type="button" class="agenda-mode-btn" id="agenda-mode-realweek"
                onclick="setAgendaMode('realweek')">Semaine réelle</button>
            </div>
            <div class="agenda-mode-toggle" id="agenda-ab-toggle" style="display:none" aria-label="Semaine A ou B">
              <button type="button" class="agenda-mode-btn active" id="agenda-ab-A"
                onclick="setAgendaWeekAB('A')">Semaine A</button>
              <button type="button" class="agenda-mode-btn" id="agenda-ab-B"
                onclick="setAgendaWeekAB('B')">Semaine B</button>
            </div>
          </div>
        </div>
        <div id="agenda-toolbar" style="position:relative;display:flex;align-items:center;gap:1rem;margin-bottom:.5rem;flex-wrap:wrap">
          <div class="period-tabs" id="agenda-period-tabs" style="margin:0"></div>
          <div class="planning-options" style="margin-left:auto">
            <div class="planning-options-row" style="flex-direction:column;align-items:flex-end;gap:1px;line-height:1.1">
              <label class="planning-option">
                Masquer les horaires sans réservation
                <input type="checkbox" id="agenda-hide-empty-hours" onchange="agendaHideEmptyHours=this.checked;renderAgendaWeekly()">
              </label>
              <div style="display:flex;gap:.6rem;align-items:center">
                <label class="planning-option">
                  Mode validation
                  <input type="checkbox" id="agenda-quick-validate" onchange="planningQuickValidate=this.checked;if(this.checked){planningQuickPointage=false;document.getElementById('agenda-quick-pointage').checked=false}_syncQuickValidateCheckboxes()">
                </label>
                <label class="planning-option" id="agenda-quick-pointage-wrap">
                  Mode pointage
                  <input type="checkbox" id="agenda-quick-pointage" onchange="planningQuickPointage=this.checked;if(this.checked){planningQuickValidate=false;document.getElementById('agenda-quick-validate').checked=false}">
                </label>
              </div>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:.5rem">
            <button onclick="printAgenda(true)" title="Imprimer en noir &amp; blanc"
              style="background:none;border:1px solid var(--border);border-radius:var(--rad-sm);padding:.28rem .38rem;cursor:pointer;color:var(--muted);display:flex;align-items:center;line-height:1;transition:color .15s,border-color .15s"
              onmouseover="this.style.borderColor='var(--accent)'"
              onmouseout="this.style.borderColor='var(--border)'">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
            </button>
            <button onclick="printAgenda(false)" title="Imprimer en couleur"
              style="background:none;border:1px solid var(--border);border-radius:var(--rad-sm);padding:.28rem .38rem;cursor:pointer;color:var(--muted);display:flex;align-items:center;line-height:1;transition:color .15s,border-color .15s"
              onmouseover="this.style.borderColor='var(--accent)'"
              onmouseout="this.style.borderColor='var(--border)'">
              <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/>
                <rect x="6" y="14" width="12" height="8" rx="1"/>
                <path style="fill:var(--accent);stroke:none" d="M 3.7630604,16.948673 C 3.4626967,16.867952 3.2657742,16.704292 3.1046628,16.401487 l -0.071206,-0.133829 v -2.765799 -2.7658 l 0.1021266,-0.188366 c 0.1125884,-0.207663 0.2718475,-0.354976 0.495038,-0.457905 l 0.1463299,-0.06748 H 12 20.223048 l 0.14633,0.06748 c 0.223191,0.102929 0.38245,0.250242 0.495038,0.457905 l 0.102127,0.188366 v 2.7658 2.765799 l -0.07121,0.133829 c -0.11037,0.207439 -0.203731,0.316066 -0.355162,0.413239 -0.226463,0.145321 -0.427098,0.181557 -1.005271,0.181557 h -0.512078 l -0.01069,-1.182157 -0.01069,-1.182156 -0.07988,-0.237918 c -0.21448,-0.638791 -0.673298,-1.098007 -1.315606,-1.316746 L 17.36803,12.996283 H 12 6.6319703 l -0.2379183,0.08102 c -0.326397,0.111155 -0.5843599,0.269576 -0.8157648,0.500981 -0.2323107,0.232311 -0.3907765,0.490935 -0.4998408,0.815765 l -0.079883,0.237918 -0.010695,1.182156 -0.010695,1.182157 -0.5257617,-0.002 C 4.0881255,16.99288 3.8754049,16.97882 3.7630598,16.94863 Z"/>
                <path style="fill:#fff6d5;stroke:none" d="M 7.0037175,5.5018587 V 3.0185874 H 12 16.996283 V 5.5018587 7.9851301 H 12 7.0037175 Z"/>
                <path style="fill:#fff6d5;stroke:none" d="M 7.0037175,17.992565 V 15.003717 H 12 16.996283 v 2.988848 2.988848 H 12 7.0037175 Z"/>
              </svg>
            </button>
          </div>
        </div>
        <div id="agenda-grid"></div>
        <div class="agenda-legend" id="agenda-legend-realweek" style="display:none;margin-top:.6rem">
          <span class="agenda-legend-item"><span class="agenda-legend-swatch is-rec"></span>Récurrent</span>
          <span class="agenda-legend-item"><span class="agenda-legend-swatch is-uniq"></span>Ponctuel</span>
          <span class="agenda-legend-item"><span class="indic_p">P</span>Présent</span>
          <span class="agenda-legend-item"><span class="indic_a">A</span>Absent</span>
        </div>
        <div id="dem-info-agenda" style="display:none;font-size:.78rem;color:var(--muted);align-items:center;gap:.6rem;flex-wrap:wrap;padding:1rem 0"></div>
      </div>
    </div>

    <!-- ══ ONGLET EDITIONS ══ -->
    <div id="tab-content-editions" class="hidden">
      <div>
        <nav style="display:flex;gap:0;margin-bottom:-1px;justify-content:flex-end;padding:0 1rem">
          <button class="cren-tab active" id="res-tab-rec"  onclick="switchAdminResTab('rec')"><span class="tab-icon">🔁</span> Récurrentes</button>
          <button class="cren-tab"        id="res-tab-uniq" onclick="switchAdminResTab('uniq')"><span class="tab-icon">📌</span> Ponctuelles</button>
        </nav>
        <div class="panel">
          <div class="panel-title" style="justify-content:space-between;margin-bottom:.85rem">
            <span style="display:flex;align-items:center;gap:.6rem"><span class="dot" style="background:var(--warn)"></span><span id="admin-res-panel-title">Liste des réservations récurrentes</span></span>
            <div style="display:flex;align-items:center;gap:.5rem;flex-shrink:0">
              <button onclick="printAdminReservations()" title="Imprimer la liste"
                style="background:none;border:1px solid var(--border);border-radius:var(--rad-sm);padding:.28rem .38rem;cursor:pointer;color:var(--muted);display:flex;align-items:center;line-height:1;transition:color .15s,border-color .15s"
                onmouseover="this.style.borderColor='var(--accent)';this.style.color='var(--accent)'"
                onmouseout="this.style.color='var(--muted)';this.style.borderColor='var(--border)'">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                  <rect x="6" y="14" width="12" height="8"/>
                </svg>
              </button>
              <button onclick="exportCSV()" title="Exporter en CSV"
                style="background:none;border:1px solid var(--border);border-radius:var(--rad-sm);padding:.28rem .38rem;cursor:pointer;color:var(--muted);display:flex;align-items:center;line-height:1;transition:color .15s,border-color .15s"
                onmouseover="this.style.color='#1d6f42';this.style.borderColor='#1d6f42'"
                onmouseout="this.style.color='var(--muted)';this.style.borderColor='var(--border)'">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                  <line x1="8" y1="13" x2="16" y2="13"/><line x1="8" y1="17" x2="16" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
                </svg>
              </button>
            </div>
          </div>
          <div class="admin-filters">
            <select id="admin-filter-period" onchange="renderAdminTable()">
              <option value="">Toutes les périodes</option>
            </select>
            <input type="text" id="admin-search" placeholder="Rechercher…" oninput="renderAdminTable()">
            <label id="admin-filter-mirrors-wrap" style="display:none;align-items:center;gap:.35rem;font-size:.78rem;color:var(--muted);white-space:nowrap;flex:0 0 auto;min-width:0">
              <input type="checkbox" id="admin-filter-mirrors" onchange="renderAdminTable()">
              Inclure les miroirs récurrents
            </label>
          </div>
          <div class="admin-table-wrap" style="margin-top:1rem">
            <table class="admin-table" id="admin-table" style="width:100%;table-layout:fixed">
              <colgroup id="admin-colgroup"></colgroup>
              <thead id="admin-thead"></thead>
              <tbody id="admin-tbody"></tbody>
            </table>
          </div>
          <div id="admin-empty" class="admin-empty hidden">Aucune réservation.</div>
          <div style="position:relative;display:flex;align-items:center;justify-content:center;margin-top:.75rem">
            <div style="font-size:.72rem;color:var(--muted);position:absolute;left:0" id="admin-count"></div>
            <div id="admin-pagination" style="display:flex;align-items:center;gap:.5rem"></div>
          </div>
        </div>
        <div id="dem-info-editions" style="display:none;font-size:.78rem;color:var(--muted);align-items:center;gap:.6rem;flex-wrap:wrap;padding:1rem 0"></div>
      </div>
    </div>

    <!-- ══ ONGLET STATS ══ -->
    <div id="tab-content-stats" class="hidden">
      <div class="panel-title" style="margin-bottom:.5rem">
        <span class="dot" style="background:var(--warn)"></span>Statistiques
      </div>
      <nav style="display:flex;gap:0;margin-bottom:-1px;justify-content:flex-end;padding:0 1rem">
        <button class="cren-tab active" id="stats-tab-rec"  onclick="switchStatsTab('rec')"><span class="tab-icon">🔁</span> Récurrentes</button>
        <button class="cren-tab"        id="stats-tab-uniq" onclick="switchStatsTab('uniq')"><span class="tab-icon">📌</span> Ponctuelles</button>
        <button class="cren-tab"        id="stats-tab-all"  onclick="switchStatsTab('all')">Toutes</button>
      </nav>
      <div class="panel">
        <div class="admin-filters">
          <select id="stats-filter-period" onchange="applyStatsFilters()">
            <option value="">Toutes les périodes</option>
          </select>
          <label style="display:flex;align-items:center;gap:.35rem;font-size:.78rem;color:var(--muted);white-space:nowrap">
            Du <input type="date" id="stats-date-from" onchange="applyStatsFilters()" style="font-size:.78rem">
          </label>
          <label style="display:flex;align-items:center;gap:.35rem;font-size:.78rem;color:var(--muted);white-space:nowrap">
            Au <input type="date" id="stats-date-to" onchange="applyStatsFilters()" style="font-size:.78rem">
          </label>
          <button type="button" class="btn btn-ghost" onclick="resetStatsFilters()" style="padding:.25rem .7rem;font-size:.75rem">Réinitialiser</button>
        </div>
        <div class="stats-row" id="stats-kpis" style="margin-top:1rem"></div>
        <div id="stats-charts-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
          <div class="panel"><div class="panel-title" style="width:100%"><span class="dot" style="background:var(--warn)"></span>Évolution mensuelle</div><canvas id="chart-evolution" height="160"></canvas></div>
          <div class="panel"><div class="panel-title" style="width:100%"><span class="dot" style="background:var(--warn)"></span>Par jour de la semaine</div><canvas id="chart-days" height="160"></canvas></div>
          <div class="panel"><div class="panel-title" style="width:100%"><span class="dot" style="background:var(--warn)"></span>Top créneaux remplis</div><canvas id="chart-fill" height="160"></canvas></div>
          <div class="panel"><div class="panel-title" style="width:100%"><span class="dot" style="background:var(--warn)"></span>Inscriptions par période</div><canvas id="chart-periods" height="160"></canvas></div>
          <div class="panel"><div class="panel-title" style="width:100%"><span class="dot" style="background:var(--warn)"></span>Top structures</div><canvas id="chart-structures" height="160"></canvas></div>
          <div class="panel"><div class="panel-title" style="width:100%"><span class="dot" style="background:var(--warn)"></span>Top niveaux</div><canvas id="chart-niveaux" height="160"></canvas></div>
          <div class="panel" id="stats-panel-pointage" style="display:none"><div class="panel-title" style="width:100%"><span class="dot" style="background:var(--warn)"></span>Pointage</div><canvas id="chart-pointage" height="160"></canvas></div>
        </div>
      </div>
      <div id="dem-info-stats" style="display:none;font-size:.78rem;color:var(--muted);align-items:center;gap:.6rem;flex-wrap:wrap;padding:1rem 0"></div>
    </div>

    <!-- ══ ONGLET CRÉNEAUX ══ -->
    <div id="tab-content-creneaux" class="hidden">
      <nav style="display:flex;gap:0;margin-bottom:-1px;justify-content:flex-end;padding:0 1rem">
        <button class="cren-tab active" id="cren-tab-rec"  data-pane="rec"  onclick="switchCreneauxTab('rec')"><span class="tab-icon">🔁</span> Créneaux récurrents</button>
        <button class="cren-tab" id="cren-tab-uniq" data-pane="uniq" onclick="switchCreneauxTab('uniq')"><span class="tab-icon">📌</span> Créneaux ponctuels</button>
      </nav>

        <!-- Pane récurrents -->
        <div class="cren-pane active" id="pane-cren-rec">
        <div id="section-creneaux-recurrents">
          <div class="panel-title">
            <span class="dot" style="background:var(--warn)"></span>Créneaux récurrents
          </div>
          <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:.75rem">
            <div style="display:flex;align-items:center;gap:2rem;flex-wrap:wrap">
              <div class="rec-duration-group" style="display:flex;align-items:center;gap:.3rem">
                <span style="font-size:.62rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)">Durée</span>
                <button onclick="adjustRecurDuration(-15)" class="btn-ghost btn duration-btn" style="width:16px;height:16px;padding:0;border-radius:50%;font-size:.7rem">−</button>
                <span id="recur-default-duration-display" class="duration-value" style="font-size:.8rem;font-weight:300;min-width:34px;text-align:center;color:var(--warn)">1h30</span>
                <button onclick="adjustRecurDuration(15)" class="btn-ghost btn duration-btn" style="width:16px;height:16px;padding:0;border-radius:50%;font-size:.7rem">+</button>
              </div>
              <div class="capacity-group" style="display:flex;align-items:center;gap:.4rem">
                <span style="font-size:.62rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)">Capacité</span>
                <input type="number" id="rec-default-cap-inp" min="1" max="999" placeholder="1"
                  style="width:42px;font-size:.78rem;padding:.1rem .3rem;border:1.5px solid var(--border);border-radius:var(--rad-sm);background:var(--surface2);color:var(--text);text-align:center"
                  oninput="defaultCapacity=Math.max(1,parseInt(this.value)||1);scheduleDefaultsSave()">
                <button class="btn btn-ghost" onclick="applyCapacityToAllSlots()"
                  style="font-size:.72rem;padding:.15rem .5rem;border-color:rgba(220,160,60,.5);color:var(--warn)">⚡</button>
              </div>
              <div id="recur-days-filter" style="display:flex;align-items:center;gap:.4rem;flex-wrap:wrap"></div>
              <button class="btn btn-ghost" onclick="addSlotRec()" style="border-color:rgba(109,206,170,.3);color:var(--accent);white-space:nowrap;flex-shrink:0;font-size:.7rem;padding:.2rem .6rem;border-radius:var(--rad-sm);letter-spacing:.04em">＋ Ajouter</button>
            </div>
          </div>
          <div class="period-tabs" id="cap-period-tabs-2"></div>
          <div id="cap-editor-2"></div>
          <div style="margin-top:.75rem;display:flex;justify-content:space-between;align-items:center;gap:.75rem">
            <div id="slot-delete-bar" style="visibility:hidden;display:flex;align-items:center;gap:.75rem">
              <span id="slot-delete-count" style="font-size:.82rem;color:var(--muted)"></span>
              <button id="btn-supprimer-rec" class="btn btn-ghost" onclick="deleteSelectedSlotsRec()" style="border-color:rgba(220,80,80,.4);color:#e05555;font-size:.7rem;padding:.2rem .6rem">Supprimer</button>
            </div>
            <div id="slot-pager" style="flex:1;display:flex;justify-content:center"></div>
            <div style="display:flex;align-items:center;gap:.5rem">
              <button id="slot-cancel-rec" class="btn btn-ghost" onclick="cancelCapacityRec()" style="display:none;font-size:.7rem;padding:.2rem .6rem">Annuler</button>
              <button class="btn btn-primary" onclick="saveCapacityRec()" style="background:var(--warn);color:#0f1117;font-size:.7rem;padding:.2rem .6rem">💾 Enregistrer</button>
            </div>
          </div>
        </div>

        <!-- Sous-section : tableau des miroirs (visible quand des récurrents sont cochés) -->
        <div id="section-creneaux-miroirs" style="display:none;margin-top:1.5rem;border-top:1px solid rgba(255,255,255,.07);padding-top:1.5rem">
          <div class="panel-title">
            <span class="dot" style="background:var(--warn)"></span>Dates correspondantes
          </div>
          <div id="cap-editor-mir"></div>
          <div style="margin-top:.75rem;display:flex;justify-content:space-between;align-items:center;gap:.75rem">
            <div id="slot-delete-bar-mir" style="visibility:hidden;display:flex;align-items:center;gap:.75rem">
              <span id="slot-delete-count-mir" style="font-size:.82rem;color:var(--muted)"></span>
              <button id="btn-action-mir" class="btn btn-ghost" onclick="deleteSelectedSlotsMir()" style="border-color:rgba(220,80,80,.4);color:#e05555;font-size:.7rem;padding:.2rem .6rem">Désactiver</button>
            </div>
            <div id="slot-pager-mir" style="flex:1;display:flex;justify-content:center"></div>
          </div>
        </div>
        </div>

        <!-- Pane ponctuels -->
        <div class="cren-pane" id="pane-cren-uniq">
        <div>
          <div class="panel-title">
            <span class="dot" style="background:var(--warn)"></span>Créneaux ponctuels
          </div>
          <div style="display:flex;align-items:center;gap:2rem;margin-bottom:.75rem">
            <div style="display:flex;align-items:center;gap:2rem">
              <div class="duration-group" style="display:flex;align-items:center;gap:.3rem">
                <span style="font-size:.62rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)">Durée</span>
                <button onclick="adjustPonctDuration(-15)" class="btn-ghost btn duration-btn" style="width:16px;height:16px;padding:0;border-radius:50%;font-size:.7rem">−</button>
                <span id="ponct-duration-display" class="duration-value" style="font-size:.8rem;font-weight:300;min-width:34px;text-align:center;color:var(--warn)">1h30</span>
                <button onclick="adjustPonctDuration(15)" class="btn-ghost btn duration-btn" style="width:16px;height:16px;padding:0;border-radius:50%;font-size:.7rem">+</button>
              </div>
              <div id="default-capacity-group" class="capacity-group" style="display:flex;align-items:center;gap:.4rem">
                <span style="font-size:.62rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)">Capacité</span>
                <input type="number" id="default-cap-inp" min="1" max="999" placeholder="1"
                  style="width:42px;font-size:.78rem;padding:.1rem .3rem;border:1.5px solid var(--border);border-radius:var(--rad-sm);background:var(--surface2);color:var(--text);text-align:center"
                  oninput="defaultCapacity=Math.max(1,parseInt(this.value)||1);scheduleDefaultsSave()">
                <button class="btn btn-ghost" onclick="applyCapacityToAllSlots()"
                  style="font-size:.72rem;padding:.15rem .5rem;border-color:rgba(220,160,60,.5);color:var(--warn)">⚡</button>
              </div>
              <button class="btn btn-ghost" onclick="addSlotUniq()" style="border-color:rgba(109,206,170,.3);color:var(--accent);white-space:nowrap;flex-shrink:0;font-size:.7rem;padding:.2rem .6rem;border-radius:var(--rad-sm);letter-spacing:.04em">＋ Ajouter</button>
            </div>
          </div>
          <div id="cap-editor-uniq"></div>
          <div style="margin-top:.75rem;display:flex;justify-content:space-between;align-items:center;gap:.75rem">
            <div id="slot-delete-bar-uniq" style="visibility:hidden;display:flex;align-items:center;gap:.75rem">
              <span id="slot-delete-count-uniq" style="font-size:.82rem;color:var(--muted)"></span>
              <button id="btn-supprimer-uniq" class="btn btn-ghost" onclick="deleteSelectedSlotsU()" style="border-color:rgba(220,80,80,.4);color:#e05555;font-size:.7rem;padding:.2rem .6rem">Supprimer</button>
            </div>
            <div id="slot-pager-uniq" style="flex:1;display:flex;justify-content:center"></div>
            <div style="display:flex;align-items:center;gap:.5rem">
              <button id="slot-cancel-uniq" class="btn btn-ghost" onclick="cancelCapacityUniq()" style="display:none;font-size:.7rem;padding:.2rem .6rem">Annuler</button>
              <button class="btn btn-primary" onclick="saveCapacityUniq()" style="background:var(--warn);color:#0f1117;font-size:.7rem;padding:.2rem .6rem">💾 Enregistrer</button>
            </div>
          </div>
        </div>
        </div>
    </div>

    <!-- ══ ONGLET PARAMÈTRES ══ -->
    <div id="tab-content-params" class="hidden">
      <div id="params-layout">
        <!-- Navigation sous-onglets (droite) -->
        <nav id="params-subnav">
          <button class="params-tab" data-pane="periodes"     onclick="switchParamTab('periodes')"><span class="tab-icon">🗓️</span> Périodes d'ouverture</button>
          <button class="params-tab" data-pane="reservations" onclick="switchParamTab('reservations')"><span class="tab-icon">📝</span> Réservations</button>
          <button class="params-tab" data-pane="demandeurs"   onclick="switchParamTab('demandeurs')"><span class="tab-icon">👥</span> Demandeurs</button>
          <button class="params-tab" data-pane="themes"        onclick="switchParamTab('themes')"><span class="tab-icon">🎨</span> Thèmes</button>
          <button class="params-tab" id="params-tab-exercice" data-pane="exercice" onclick="switchParamTab('exercice')"><span class="tab-icon">🔄</span> Changement d'exercice</button>
          <button class="params-tab" id="params-tab-rgpd" data-pane="rgpd" onclick="switchParamTab('rgpd')"><span class="tab-icon">🛡️</span> RGPD</button>
        </nav>
        <!-- Contenu du sous-onglet actif -->
        <div id="params-content">

          <!-- Périodes d'ouverture -->
          <div class="params-pane" id="pane-periodes">
            <div class="panel">
              <div id="periods-row">
                <div class="panel-title pr-title">
                  <span style="display:flex;align-items:center;gap:.5rem"><span class="dot" style="background:var(--warn)"></span>Périodes</span>
                </div>
                <div id="exercice-nav" class="exercice-nav">
                  <button type="button" class="ex-arrow ex-nav-prev" onclick="selectPrevExercice()" aria-label="Exercice précédent">◀</button>
                  <span class="ex-nav-label">—</span>
                  <button type="button" class="ex-arrow ex-nav-next" onclick="selectNextExercice()" aria-label="Exercice suivant">▶</button>
                </div>
                <div id="periods-editor" class="pr-editor"></div>
                <div class="pr-add">
                  <div id="btn-delete-periods" style="display:none;align-items:center;gap:.5rem">
                    <span id="period-selected-count" style="font-size:.82rem;color:var(--muted)"></span>
                    <button class="btn btn-ghost" id="btn-edit-period"       onclick="openPeriodEditModal()"      style="display:none;border-color:rgba(109,206,170,.4);color:var(--accent);padding:.25rem .65rem;font-size:.68rem">✏️ Modifier</button>
                    <button class="btn btn-ghost" id="btn-reactivate-period" onclick="reactivateSelectedPeriods()" style="display:none;border-color:rgba(109,206,170,.4);color:var(--accent);padding:.25rem .65rem;font-size:.68rem">✓ Réactiver</button>
                    <button class="btn btn-ghost" id="btn-delete-period"     onclick="deleteSelectedPeriods()"     style="display:none;border-color:rgba(220,80,80,.4);color:#e05555;padding:.25rem .65rem;font-size:.68rem">🗑️ Supprimer</button>
                  </div>
                  <button class="btn btn-ghost" onclick="addPeriod()" style="margin-left:auto;border-color:rgba(109,206,170,.3);color:var(--accent);padding:.25rem .7rem;font-size:.7rem">＋ Ajouter une période</button>
                </div>
              </div>
              <div id="days-panel">
                <div class="panel-title panel-second-title"><span class="dot" style="background:var(--warn)"></span>Jours d'ouverture</div>
                <div style="display:flex;gap:.55rem;align-items:center;flex-wrap:wrap">
                  <div style="display:flex;gap:.55rem;flex-wrap:wrap;align-items:center" id="days-checkboxes"></div>
                  <span style="width:1px;height:1rem;background:var(--border);flex-shrink:0;margin:0 .2rem;align-self:center"></span>
                  <label style="display:flex;align-items:center;gap:.3rem;cursor:pointer;font-size:.75rem;font-weight:500;text-transform:none;letter-spacing:0">
                    <input type="checkbox" id="day-cb-ferie" class="admin-cb" style="accent-color:var(--accent);width:13px;height:13px" onchange="applyOpenOnHolidays()">
                    Jours fériés
                  </label>
                </div>
              </div>
              <div class="panel-title panel-second-title"><span class="dot" style="background:var(--warn)"></span>Plages horaires</div>
              <div class="defaults-row" style="display:flex;align-items:center;gap:2rem">
                <div style="display:flex;align-items:center;gap:.5rem">
                  <span style="font-size:.62rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)">Matin</span>
                  <span class="time-step-wrap">
                    <input type="text" id="morning-start" placeholder="09:00" maxlength="5"
                      style="width:50px;font-size:.78rem;padding:.15rem .35rem;border-radius:var(--rad-sm);border:1px solid var(--border);background:var(--surface2);color:var(--text);text-align:center"
                      oninput="morningStart=this.value">
                    <span class="time-step-btns">
                      <button type="button" class="time-step-btn" tabindex="-1" onmousedown="_startTimeStepHold('morning-start', 15, event)" ontouchstart="_startTimeStepHold('morning-start', 15, event)" onmouseleave="_stopTimeStepHold()">▲</button>
                      <button type="button" class="time-step-btn" tabindex="-1" onmousedown="_startTimeStepHold('morning-start', -15, event)" ontouchstart="_startTimeStepHold('morning-start', -15, event)" onmouseleave="_stopTimeStepHold()">▼</button>
                    </span>
                  </span>
                  <span class="time-step-wrap">
                    <input type="text" id="morning-end" placeholder="12:00" maxlength="5"
                      style="width:50px;font-size:.78rem;padding:.15rem .35rem;border-radius:var(--rad-sm);border:1px solid var(--border);background:var(--surface2);color:var(--text);text-align:center"
                      oninput="morningEnd=this.value">
                    <span class="time-step-btns">
                      <button type="button" class="time-step-btn" tabindex="-1" onmousedown="_startTimeStepHold('morning-end', 15, event)" ontouchstart="_startTimeStepHold('morning-end', 15, event)" onmouseleave="_stopTimeStepHold()">▲</button>
                      <button type="button" class="time-step-btn" tabindex="-1" onmousedown="_startTimeStepHold('morning-end', -15, event)" ontouchstart="_startTimeStepHold('morning-end', -15, event)" onmouseleave="_stopTimeStepHold()">▼</button>
                    </span>
                  </span>
                </div>
                <div style="display:flex;align-items:center;gap:.5rem">
                  <span style="font-size:.62rem;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:var(--muted)">Après-midi</span>
                  <span class="time-step-wrap">
                    <input type="text" id="afternoon-start" placeholder="14:00" maxlength="5"
                      style="width:50px;font-size:.78rem;padding:.15rem .35rem;border-radius:var(--rad-sm);border:1px solid var(--border);background:var(--surface2);color:var(--text);text-align:center"
                      oninput="afternoonStart=this.value">
                    <span class="time-step-btns">
                      <button type="button" class="time-step-btn" tabindex="-1" onmousedown="_startTimeStepHold('afternoon-start', 15, event)" ontouchstart="_startTimeStepHold('afternoon-start', 15, event)" onmouseleave="_stopTimeStepHold()">▲</button>
                      <button type="button" class="time-step-btn" tabindex="-1" onmousedown="_startTimeStepHold('afternoon-start', -15, event)" ontouchstart="_startTimeStepHold('afternoon-start', -15, event)" onmouseleave="_stopTimeStepHold()">▼</button>
                    </span>
                  </span>
                  <span class="time-step-wrap">
                    <input type="text" id="afternoon-end" placeholder="18:00" maxlength="5"
                      style="width:50px;font-size:.78rem;padding:.15rem .35rem;border-radius:var(--rad-sm);border:1px solid var(--border);background:var(--surface2);color:var(--text);text-align:center"
                      oninput="afternoonEnd=this.value">
                    <span class="time-step-btns">
                      <button type="button" class="time-step-btn" tabindex="-1" onmousedown="_startTimeStepHold('afternoon-end', 15, event)" ontouchstart="_startTimeStepHold('afternoon-end', 15, event)" onmouseleave="_stopTimeStepHold()">▲</button>
                      <button type="button" class="time-step-btn" tabindex="-1" onmousedown="_startTimeStepHold('afternoon-end', -15, event)" ontouchstart="_startTimeStepHold('afternoon-end', -15, event)" onmouseleave="_stopTimeStepHold()">▼</button>
                    </span>
                  </span>
                </div>
                <button class="btn btn-primary" onclick="savePeriodeSettings()" style="background:var(--warn);color:#0f1117;margin-left:auto">💾 Enregistrer</button>
              </div>
            </div>
          </div>

          <!-- Demandeurs -->
          <div class="params-pane" id="pane-demandeurs">
            <div class="panel">
              <div class="panel-title" style="justify-content:space-between">
                <span style="display:flex;align-items:center;gap:.6rem"><span class="dot" style="background:var(--warn)"></span>Configuration des demandeurs</span>
                <button type="button" id="btn-add-demandeur-row" class="btn btn-ghost" onclick="_addParamsCatRow()" style="font-size:.68rem;padding:.25rem .65rem">＋ Ajouter</button>
              </div>
              <div id="params-cat-table"></div>
              <div style="margin-top:.75rem;display:flex;justify-content:flex-end;gap:.5rem">
                <button id="btn-cancel-params-demandeurs" class="btn btn-ghost" onclick="_cancelParamsDemandeurs()" style="display:none;font-size:.7rem;padding:.2rem .6rem">Annuler</button>
                <button class="btn btn-primary" onclick="saveParamsDemandeurs()" style="background:var(--warn);color:#0f1117;font-size:.7rem;padding:.2rem .6rem">💾 Enregistrer</button>
              </div>
            </div>
          </div>

          <!-- Nb réservations -->
          <div class="params-pane" id="pane-reservations">
            <div class="panel">
              <div class="panel-title"><span class="dot" style="background:var(--warn)"></span>Nombre de réservations</div>
              <div style="display:flex;align-items:center;gap:4rem;flex-wrap:wrap">
                <div style="display:flex;align-items:center;gap:.75rem">
                  <label style="font-size:.78rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Maximum par période</label>
                  <div style="display:flex;align-items:center;gap:.3rem">
                    <button onclick="adjustMaxResPeriod(-1)" class="btn-ghost btn" style="width:22px;height:22px;padding:0;border-radius:50%">−</button>
                    <span id="max-res-period-display" style="font-size:1.15rem;font-weight:300;min-width:26px;text-align:center;color:var(--warn)">1</span>
                    <button onclick="adjustMaxResPeriod(1)"  class="btn-ghost btn" style="width:22px;height:22px;padding:0;border-radius:50%">+</button>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:.75rem">
                  <label style="font-size:.78rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Maximum par an</label>
                  <div style="display:flex;align-items:center;gap:.3rem">
                    <button onclick="adjustMaxRes(-1)" class="btn-ghost btn" style="width:22px;height:22px;padding:0;border-radius:50%">−</button>
                    <span id="max-res-display" style="font-size:1.15rem;font-weight:300;min-width:26px;text-align:center;color:var(--warn)">1</span>
                    <button onclick="adjustMaxRes(1)"  class="btn-ghost btn" style="width:22px;height:22px;padding:0;border-radius:50%">+</button>
                  </div>
                </div>
              </div>
              <div class="panel-title panel-second-title"><span class="dot" style="background:var(--warn)"></span>Délai de réservation</div>
              <div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap">
                <label style="font-size:.78rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Délai minimum avant une séance</label>
                <select id="booking-delay-select" onchange="bookingDelay=+this.value;applyBookingDelay()"
                  style="font-size:.85rem;padding:.3rem .6rem;border:1.5px solid var(--border);border-radius:var(--rad-sm);background:var(--surface2);color:var(--text)">
                  <option value="0">Aucun délai</option>
                  <option value="-1">1 jour ouvré</option>
                  <option value="-2">2 jours ouvrés</option>
                  <option value="-3">3 jours ouvrés</option>
                  <option value="1007">1 semaine</option>
                  <option value="1014">2 semaines</option>
                  <option value="1021">3 semaines</option>
                  <option value="1030">1 mois</option>
                </select>
              </div>
              <div class="panel-title panel-second-title"><span class="dot" style="background:var(--warn)"></span>Validation bloquante</div>
              <div style="display:flex;align-items:center;gap:.6rem">
                <input type="checkbox" id="validation-bloquante-cb" onchange="toggleValidationBloquante()">
                <label for="validation-bloquante-cb" style="font-size:.78rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);cursor:pointer">Validation bloquante</label>
              </div>
              <div class="panel-title panel-second-title"><span class="dot" style="background:var(--warn)"></span>Auto-validation</div>
              <div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap">
                <label style="font-size:.78rem;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)" title="Les réservations en attente sont validées automatiquement après ce délai, sauf si la séance est déjà passée">Auto-validation après</label>
                <select id="auto-validation-delay-select" onchange="autoValidationDelay=+this.value;applyAutoValidationDelay()"
                  style="font-size:.85rem;padding:.3rem .6rem;border:1.5px solid var(--border);border-radius:var(--rad-sm);background:var(--surface2);color:var(--text)">
                  <option value="0">Jamais</option>
                  <option value="-120">2 heures ouvrées</option>
                  <option value="-1440">1 jour ouvré</option>
                  <option value="-2880">2 jours ouvrés</option>
                  <option value="-4320">3 jours ouvrés</option>
                  <option value="10080">1 semaine</option>
                  <option value="20160">2 semaines</option>
                </select>
              </div>
            </div>
          </div>

          <!-- Thèmes -->
          <div class="params-pane" id="pane-themes">
            <div class="panel">
              <div class="panel-title" style="justify-content:space-between">
                <span style="display:flex;align-items:center;gap:.6rem"><span class="dot" style="background:var(--warn)"></span>Thèmes</span>
              </div>
              <div style="display:flex;flex-direction:column;gap:2rem;margin:2rem 0 1.5rem">
                <label class="cycle-opt"><input type="radio" name="themes-mode" value="libre" onchange="_setParamsThemesMode('libre')"> Thème libre</label>
                <label class="cycle-opt"><input type="radio" name="themes-mode" value="liste" onchange="_setParamsThemesMode('liste')"> Liste de thèmes</label>
              </div>
              <div id="params-themes-list-wrap" style="display:none;padding:0 1.5rem">
                <div id="params-themes-table"></div>
              </div>
              <div style="margin-top:.75rem;display:flex;justify-content:flex-end;gap:.5rem;padding:0 1.5rem">
                <button id="btn-cancel-params-themes" class="btn btn-ghost" onclick="_cancelParamsThemes()" style="display:none;font-size:.7rem;padding:.2rem .6rem">Annuler</button>
                <button class="btn btn-primary" onclick="saveParamsThemes()" style="background:var(--warn);color:#0f1117;font-size:.7rem;padding:.2rem .6rem">💾 Enregistrer</button>
              </div>
            </div>
          </div>

          <!-- Changement d'exercice -->
          <div class="params-pane" id="pane-exercice">
            <div class="panel">
              <div class="panel-title" style="margin-bottom:.4rem">
                <span class="dot" style="background:var(--warn)"></span>Dernier exercice
                <span id="exercice-dates">—</span>
                <label style="display:inline-flex;align-items:center;gap:.4rem;margin-left:2.5rem;font-weight:400;font-size:.78rem;color:var(--muted);text-transform:none;letter-spacing:0;cursor:pointer">
                  <input type="checkbox" id="exercice-show-previous" onchange="onToggleShowPrevious()" style="accent-color:var(--accent);width:14px;height:14px;cursor:pointer">
                  Afficher les exercices précédents
                </label>
              </div>

              <div id="exercice-lockable">
              <label style="display:flex;align-items:center;gap:.4rem;margin:2rem 0 .2rem;width:fit-content;font-weight:400;font-size:.78rem;color:var(--muted);text-transform:none;letter-spacing:0;cursor:pointer">
                <input type="checkbox" id="exercice-allow-create" onchange="onToggleAllowCreate()" style="accent-color:var(--accent);width:14px;height:14px;cursor:pointer">
                Créer un nouvel exercice
              </label>
              <label style="display:flex;align-items:center;gap:.4rem;margin:.2rem 0 .8rem;width:fit-content;font-weight:400;font-size:.78rem;color:var(--muted);text-transform:none;letter-spacing:0;cursor:pointer">
                <input type="checkbox" id="exercice-allow-delete" onchange="onToggleAllowDelete()" style="accent-color:var(--accent);width:14px;height:14px;cursor:pointer">
                Supprimer le dernier exercice
              </label>

              <div id="exercice-cols">

                <!-- ── Colonne 1 : Création d'un nouvel exercice ── -->
                <div class="exercice-col" id="pc-create-col">
                  <div class="panel" style="background:var(--surface2)">
                    <div style="font-weight:600;font-size:.85rem;color:var(--accent);margin-bottom:.4rem"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block;margin-right:.2em"><path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>Création d'un nouvel exercice</div>
                    <p style="font-size:.85rem;line-height:1.55;color:var(--text);margin-bottom:.6rem">
                      Cette opération prépare le prochain exercice annuel. Pour chaque période active du service :
                    </p>
                    <ul style="font-size:.82rem;line-height:1.6;color:var(--text);margin:0 0 .9rem 1.2rem;padding:0">
                      <li>une nouvelle période est créée avec les dates décalées de <strong>1 an</strong></li>
                      <li>la période originale est <strong>désactivée</strong> mais reste dans l'historique</li>
                    </ul>
                    <div style="display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem">
                      <label class="cycle-opt"><input type="checkbox" id="pc-opt-periods" checked> Recréer les périodes à l'identique</label>
                      <label class="cycle-opt"><input type="checkbox" id="pc-opt-slots"   checked> Recréer les créneaux récurrents à l'identique</label>
                    </div>
                    <p id="period-cycle-warning" style="font-size:.78rem;color:var(--danger);margin-bottom:1rem;display:none"></p>
                    <button class="btn btn-primary" id="btn-confirm-cycle" onclick="askConfirmCycle()" style="background:var(--accent);color:#0f1117">Créer le prochain exercice</button>
                  </div>
                </div>

                <!-- ── Colonne 2 : Retour à l'année précédente ── -->
                <div class="exercice-col" id="pc-undo-col" style="display:none">
                  <div id="pc-undo-label">⚠️ Utilisateur expérimenté :</div>
                  <div id="pc-undo-section">
                    <div id="pc-undo-title" style="font-weight:600;font-size:.85rem;color:var(--danger);margin-bottom:.4rem">↩ Retour à l'année précédente</div>
                    <p style="font-size:.85rem;line-height:1.55;color:var(--text);margin-bottom:.5rem">
                      Supprime entièrement l'exercice en cours (périodes, créneaux et réservations compris). Restaure l'exercice précédent.
                    </p>
                    <p id="period-undo-info" style="font-size:.78rem;line-height:1.5;margin-bottom:.6rem"></p>
                    <label id="period-undo-confirm-row" class="cycle-opt" style="display:none;margin-bottom:.6rem;font-size:.78rem">
                      <input type="checkbox" id="period-undo-ack" onchange="_updateUndoConfirmBtn()" style="accent-color:var(--danger)">
                      <span id="period-undo-ack-label"></span>
                    </label>
                    <button class="btn btn-ghost" id="btn-confirm-undo" onclick="askConfirmUndo()" style="font-size:.7rem;padding:.3rem .7rem;background:var(--danger);border:none;color:var(--text)">↩ Retour à l'année précédente</button>
                  </div>
                </div>

              </div>
              </div><!-- /#exercice-lockable -->
            </div>
          </div>

          <!-- RGPD : effacement d'un utilisateur du service -->
          <div class="params-pane" id="pane-rgpd">
            <div class="panel">
              <p style="font-size:.78rem;color:var(--muted);margin-bottom:1rem;line-height:1.5">
                <strong style="color:var(--text)">🗑️ Effacer</strong> vide les champs nom, prénom, e-mail et téléphone, et verrouille le compte. L'enregistrement est conservé pour préserver les statistiques (réservations passées notamment).<br>
                <strong style="color:var(--text)">📥 Exporter</strong> ouvre une vue imprimable des données personnelles de l'utilisateur (profil + historique des réservations) — à fournir sur demande au titre du droit d'accès RGPD (article 15). Téléchargement JSON également disponible depuis cette vue.
              </p>
              <div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:.75rem">
                <label style="font-size:.75rem;margin:0">Liste des utilisateurs du service</label>
                <input type="search" id="rgpd-p1-search" placeholder="🔍 Rechercher (nom, prénom, e-mail)…"
                  oninput="_rgpdP1OnSearch()"
                  style="margin-left:auto;flex:1;min-width:240px;max-width:330px;font-size:.78rem;padding:.35rem .6rem;border-radius:var(--rad-sm);border:1px solid var(--border);background:var(--surface);color:var(--text)">
              </div>
              <div id="rgpd-p1-list" style="max-height:500px;overflow-y:auto"></div>
              <div id="rgpd-p1-empty" style="display:none;font-size:.78rem;color:var(--muted);margin-top:.5rem;font-style:italic">
                Aucun utilisateur éligible pour ce service.
              </div>
            </div>
          </div>

        </div><!-- /params-content -->

      </div><!-- /params-layout -->
      <div id="dem-info-params" style="display:none;font-size:.78rem;color:var(--muted);align-items:center;gap:.6rem;flex-wrap:wrap;padding:1rem 0"></div>
    </div>

  </div><!-- /app-main -->
</div><!-- /app-layout -->
</main>

<!-- ── Modal édition compte ── -->
<div class="modal-overlay" id="uc-modal-overlay">
  <div class="modal-box">
    <div class="modal-title" id="uc-modal-title">✏️ Modifier le compte</div>
    <div class="form-grid">
      <div class="field"><label for="uc-edit-nom">Nom</label><input type="text" id="uc-edit-nom" placeholder="Nom" autocomplete="off"></div>
      <div class="field"><label for="uc-edit-prenom">Prénom</label><input type="text" id="uc-edit-prenom" placeholder="Prénom" autocomplete="off"></div>
      <div class="field"><label for="uc-edit-email">E-mail <span style="color:var(--muted);font-size:.7rem;text-transform:none;letter-spacing:0">(non modifiable)</span></label>
        <input type="text" id="uc-edit-email" disabled style="opacity:.45" autocomplete="off"></div>
      <div class="field"><label for="uc-edit-tel">Téléphone</label><input type="tel" id="uc-edit-tel" placeholder="06 12 34 56 78" autocomplete="off"></div>
      <div class="field"><label for="uc-edit-demandeur">Catégorie</label><select id="uc-edit-demandeur" onchange="onAdminDemandeurChange()" autocomplete="off"></select></div>
      <div class="field"><label for="uc-edit-structure">Structure</label><select id="uc-edit-structure" autocomplete="off"></select></div>
      <div class="field full uc-niveau-row">
        <div><label for="uc-edit-niveau">Niveau</label>
          <div class="niveau-combo">
            <input type="text" id="uc-edit-niveau" placeholder="Choisir ou saisir..." autocomplete="off" onfocus="openNiveauList('uc-edit-niveau')" oninput="_onNiveauInput('uc-edit-niveau')">
            <button type="button" class="niveau-combo-btn" onmousedown="event.preventDefault();toggleNiveauList('uc-edit-niveau')" tabindex="-1" title="Voir les niveaux">▾</button>
            <div class="niveau-combo-list" id="uc-edit-niveau-list"></div>
          </div>
        </div>
        <div><label for="uc-edit-enfants">Nb enfants</label><input type="number" id="uc-edit-enfants" min="0" max="99" autocomplete="off"></div>
        <div><label for="uc-edit-accompagnants">Nb accompagnants</label><input type="number" id="uc-edit-accompagnants" min="0" max="99" autocomplete="off"></div>
      </div>
      <div class="field full"><label for="uc-edit-role">Rôle</label>
        <select id="uc-edit-role" onchange="_applyServicesEnabledByRole()">
          <option value="utilisateur">Utilisateur</option>
          <option value="gestionnaire">Gestionnaire</option>
          <option value="administrateur">Administrateur</option>
        </select></div>
      <div class="field full"><label>Services</label>
        <div id="uc-edit-service" class="uc-services-list"></div></div>
      <div class="field full">
        <label>🔑 Mot de passe</label>
        <p style="font-size:.78rem;color:var(--muted);line-height:1.5;margin-bottom:.5rem">
          Pour des raisons de confidentialité, l'administrateur ne définit pas le mot de passe. Un e-mail contenant un lien sécurisé (valable 1 heure) sera envoyé à l'utilisateur, qui choisira lui-même son nouveau mot de passe.
        </p>
        <button class="btn btn-ghost" id="btn-admin-pwd-reset" onclick="adminResetPassword()"
          style="padding:.4rem .9rem;font-size:.78rem;border-color:rgba(109,206,170,.4);color:var(--accent)">
          📧 Envoyer un lien de réinitialisation
        </button>
        <!-- Champ caché pour compat saveUserEdit() qui le lit dans le cas 'create' -->
        <input type="hidden" id="uc-edit-pwd">
      </div>
    </div>
    <div class="btn-row" style="margin-top:1.25rem">
      <button class="btn btn-ghost" onclick="closeUserModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveUserEdit()">Enregistrer</button>
    </div>
    <button class="modal-close" onclick="closeUserModal()">×</button>
  </div>
</div>

<!-- ── Modal "Mot de passe oublié" (public, anti-énumération) ── -->
<div class="modal-overlay" id="forgot-password-modal" onclick="if(event.target===this)closeForgotPasswordModal()">
  <div class="modal-box" style="max-width:440px">
    <div class="modal-title">🔑 Mot de passe oublié</div>
    <p style="font-size:.85rem;color:var(--text);margin-bottom:.75rem">
      Saisissez l'adresse e-mail de votre compte. Si elle est connue, vous recevrez un lien pour choisir un nouveau mot de passe (valable 1 heure).
    </p>
    <div class="field full" style="margin-bottom:.5rem">
      <label for="forgot-email">Adresse e-mail</label>
      <input type="email" id="forgot-email" placeholder="vous@exemple.fr" autocomplete="email"
        onkeydown="if(event.key==='Enter')submitForgotPassword()">
    </div>
    <div class="btn-row" style="margin-top:1rem">
      <button class="btn btn-ghost" onclick="closeForgotPasswordModal()">Annuler</button>
      <button class="btn btn-primary" id="forgot-submit-btn" onclick="submitForgotPassword()">Envoyer le lien</button>
    </div>
    <button class="modal-close" onclick="closeForgotPasswordModal()">×</button>
  </div>
</div>

<!-- ── Modal self-service : demande de suppression de compte (RGPD art. 17) ── -->
<div class="modal-overlay" id="self-delete-modal" onclick="if(event.target===this)closeSelfDeleteModal()">
  <div class="modal-box" style="max-width:480px">
    <div class="modal-title">🛡️ Supprimer mon compte</div>
    <p style="font-size:.85rem;color:var(--text);margin-bottom:.75rem">
      Pour des raisons de sécurité, saisissez votre mot de passe. Vous recevrez ensuite un e-mail de confirmation valable <strong>24 heures</strong> ; la suppression effective n'aura lieu qu'après votre clic sur le lien.
    </p>
    <div class="field full" style="margin-bottom:1rem">
      <label for="self-delete-pwd">Mot de passe actuel</label>
      <input type="password" id="self-delete-pwd" placeholder="••••••••" autocomplete="current-password"
        onkeydown="if(event.key==='Enter')submitSelfDelete()">
      <span class="field-error" id="self-delete-error" style="display:none"></span>
    </div>
    <div style="font-size:.78rem;color:var(--muted);line-height:1.5;border-left:3px solid var(--danger);padding:.4rem .65rem;background:rgba(224,107,107,.08)">
      <strong style="color:var(--danger)">Action irréversible.</strong> Une fois confirmée par e-mail, vos nom, prénom, e-mail et téléphone seront définitivement effacés et le compte verrouillé.
    </div>
    <div class="btn-row" style="margin-top:1.25rem">
      <button class="btn btn-ghost" onclick="closeSelfDeleteModal()">Annuler</button>
      <button class="btn btn-primary" id="self-delete-submit-btn" onclick="submitSelfDelete()"
        style="background:var(--danger);border-color:var(--danger);color:#fff">Envoyer le mail de confirmation</button>
    </div>
    <button class="modal-close" onclick="closeSelfDeleteModal()">×</button>
  </div>
</div>

<!-- ── Modal confirmation RGPD : effacement des données nominatives ── -->
<div class="modal-overlay" id="rgpd-anonymize-modal" onclick="if(event.target===this)closeRgpdAnonymizeModal()">
  <div class="modal-box" style="max-width:520px">
    <div class="modal-title" id="rgpd-confirm-title">🛡️ Effacer les données nominatives</div>
    <p style="font-size:.85rem;color:var(--text);margin-bottom:.5rem" id="rgpd-confirm-intro">
      Vous êtes sur le point d'effacer définitivement les données nominatives de :
    </p>
    <div id="rgpd-confirm-targets" style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad-sm);padding:.5rem .8rem;margin-bottom:1rem"></div>
    <div id="rgpd-confirm-warning" style="font-size:.78rem;color:var(--muted);line-height:1.5;padding:.4rem .65rem">
      <!-- Contenu rempli dynamiquement par _rgpdOpenConfirmModal — varie selon l'action (anonymize / notify) -->
    </div>
    <div class="btn-row" style="margin-top:1.25rem">
      <button class="btn btn-ghost" onclick="closeRgpdAnonymizeModal()">Annuler</button>
      <button class="btn btn-primary" id="rgpd-confirm-btn"
        style="color:#fff">Confirmer</button>
    </div>
    <button class="modal-close" onclick="closeRgpdAnonymizeModal()">×</button>
  </div>
</div>

<!-- ── Context menu planning ── -->
<div id="ctx-overlay" style="display:none;position:fixed;inset:0;z-index:10000" onclick="_ctxHide()"></div>
<div id="badge-ctx-menu" style="display:none">
  <button id="ctx-btn-cut"        onclick="_ctxCut()">✂️ Couper</button>
  <button id="ctx-btn-copy"       onclick="_ctxCopy()">📋 Copier</button>
  <button id="ctx-btn-delete" class="ctx-danger" onclick="_ctxDelete()">🗑️ Supprimer</button>
  <div id="ctx-sep-pointage" class="ctx-separator"></div>
  <button id="ctx-btn-present" onclick="_ctxPointage('present')">✅ Présent</button>
  <button id="ctx-btn-absent"  onclick="_ctxPointage('absent')" class="ctx-danger">❌ Absent</button>
  <button id="ctx-btn-pointage-clear" onclick="_ctxPointage(null)">— Effacer pointage</button>
  <div id="ctx-sep-cell" class="ctx-separator"></div>
  <button id="ctx-btn-create" onclick="_ctxCreate()">➕ Nouvelle réservation</button>
  <button id="ctx-btn-paste"  onclick="_ctxPaste()">📌 Coller ici</button>
</div>

<!-- ── Modal service (création / édition) ── -->
<div class="modal-overlay" id="svc-modal">
  <div class="modal-box" style="max-width:660px">
    <div class="modal-title" id="svc-modal-title">➕ Nouveau service</div>
    <div class="form-grid" style="gap:1rem 0">
      <div class="field full">
        <label for="svc-modal-label">Nom du service</label>
        <div style="display:flex;gap:.5rem;align-items:center">
          <button id="svc-modal-icon-btn" onclick="openSvcModalIconPicker()" title="Choisir une icône"
            style="flex-shrink:0;width:38px;height:38px;font-size:1.25rem;border:1px solid var(--border);border-radius:var(--rad-sm);background:var(--surface2);cursor:pointer">🎯</button>
          <input type="text" id="svc-modal-label" placeholder="Ex : Visite guidée" autocomplete="off"
            style="flex:1" onkeydown="if(event.key==='Enter')submitSvcModal()">
        </div>
      </div>
    </div>
    <div class="btn-row" style="margin-top:1.25rem">
      <button class="btn btn-ghost" onclick="closeSvcModal()">Annuler</button>
      <button class="btn btn-primary" id="svc-modal-submit" onclick="submitSvcModal()">Créer</button>
    </div>
    <button class="modal-close" onclick="closeSvcModal()">×</button>
  </div>
</div>

<!-- ── Modal création réservation planning ── -->
<div class="modal-overlay" id="planning-create-modal">
  <div class="modal-box">
    <div class="modal-title" id="pcm-title">➕ Nouvelle réservation</div>
    <div class="form-grid">
      <div class="field full"><label for="pcm-demandeur-select">Type de demandeur</label>
        <select id="pcm-demandeur-select" onchange="onPcmDemandeurChange()"></select></div>
      <div class="field full"><label for="pcm-user-select">Demandeur</label>
        <select id="pcm-user-select" onchange="onPcmUserChange()"></select></div>
      <div class="field full">
        <label>Participants</label>
        <div class="pcm-counters">
          <label class="pcm-counter" for="pcm-enfants">
            <span class="pcm-counter-icon" aria-hidden="true">👶</span>
            <input type="number" id="pcm-enfants" min="0" max="99" autocomplete="off" oninput="_pcmUpdateLabels()">
            <span class="pcm-counter-name" id="pcm-enfants-lbl">Enfants</span>
          </label>
          <label class="pcm-counter" for="pcm-accompagnants">
            <span class="pcm-counter-icon" aria-hidden="true">🧑‍🦰</span>
            <input type="number" id="pcm-accompagnants" min="0" max="99" autocomplete="off" oninput="_pcmUpdateLabels()">
            <span class="pcm-counter-name" id="pcm-accompagnants-lbl">Adultes</span>
          </label>
        </div>
      </div>
      <div class="field full" id="pcm-theme-field" style="display:none">
        <label>Thème <span style="color:var(--muted);font-size:.7rem;font-weight:400">(optionnel)</span></label>
        <input type="text" id="pcm-theme-input" placeholder="Thème de la visite…" style="display:none">
        <select id="pcm-theme-select" style="display:none"></select>
      </div>
      <div class="field full" id="pcm-occurrences-field" style="display:none">
        <label>Créneaux concernés</label>
        <div id="pcm-occurrences-list" style="font-size:.65rem;color:var(--muted);max-height:200px;overflow-y:auto;line-height:1.4"></div>
      </div>
    </div>
    <div class="btn-row" style="margin-top:1.25rem">
      <button class="btn btn-ghost" onclick="closePlanningCreateModal()">Annuler</button>
      <button class="btn btn-primary" onclick="savePlanningBooking()">Réserver</button>
    </div>
    <button class="modal-close" onclick="closePlanningCreateModal()">×</button>
  </div>
</div>

<!-- ── Modal pile de réservations (cellule planning récurrent) ── -->
<div class="modal-overlay" id="cell-stack-modal" onclick="if(event.target===this)closeCellStackModal()">
  <div class="modal-box" style="width:fit-content;max-width:min(95vw,1040px)">
    <div class="modal-title-row">
      <div style="display:flex;align-items:center;gap:.75rem;flex-wrap:wrap;min-width:0">
        <div class="modal-title" style="margin-bottom:0">
          <span class="period-btn active" id="cell-stack-period" style="cursor:default;pointer-events:none;padding:.2rem .55rem;font-size:.7rem;gap:.3rem">
            <span class="period-badge" style="display:block;width:5px;height:5px"></span>
            <span id="cell-stack-period-label">Période</span>
          </span>
        </div>
        <div id="cell-stack-subtitle" class="panel-subtitle" style="margin-bottom:0"></div>
      </div>
      <div style="display:flex;align-items:center;gap:.6rem;line-height:1.1">
        <label class="planning-option" style="margin:0">
          Mode validation
          <input type="checkbox" id="csm-quick-validate" onchange="planningQuickValidate=this.checked;if(this.checked){planningQuickPointage=false;_syncQuickPointageCheckboxes()}_syncQuickValidateCheckboxes()">
        </label>
        <label class="planning-option" id="csm-quick-pointage-wrap" style="margin:0">
          Mode pointage
          <input type="checkbox" id="csm-quick-pointage" onchange="planningQuickPointage=this.checked;if(this.checked){planningQuickValidate=false;_syncQuickValidateCheckboxes()}_syncQuickPointageCheckboxes()">
        </label>
      </div>
    </div>
    <div class="csm-grid-wrap">
      <div class="csm-time-col" id="csm-time-col"></div>
      <div class="csm-slot-block" id="csm-slot-block" onclick="_onCellStackClick(event)" oncontextmenu="_onCellStackCtx(event)">
        <div class="cell-stack-list" id="cell-stack-list"></div>
      </div>
    </div>
    <div id="csm-cap-info"></div>
    <button class="modal-close" onclick="closeCellStackModal()">×</button>
  </div>
</div>

<!-- ── Modal fiche réservation ── -->
<div class="modal-overlay" id="booking-detail-modal">
  <div class="modal-box">
    <div class="modal-title" id="bdet-title">📋 Réservation</div>
    <div class="form-grid">
      <div class="field full" id="bdet-structure-field" style="display:none">
        <label id="bdet-structure-label">Structure</label>
        <div class="bdet-readonly" id="bdet-structure-value">—</div>
      </div>
      <div class="field full">
        <label>Demandeur</label>
        <div class="bdet-readonly" id="bdet-demandeur-value">—</div>
      </div>
      <div class="field full">
        <label>Participants</label>
        <div class="pcm-counters">
          <label class="pcm-counter" for="bdet-enfants">
            <span class="pcm-counter-icon" aria-hidden="true">👶</span>
            <input type="number" id="bdet-enfants" min="0" max="99" autocomplete="off" oninput="_bdetUpdateLabels()">
            <span class="pcm-counter-name" id="bdet-enfants-lbl">Enfants</span>
          </label>
          <label class="pcm-counter" for="bdet-accompagnants">
            <span class="pcm-counter-icon" aria-hidden="true">🧑‍🦰</span>
            <input type="number" id="bdet-accompagnants" min="0" max="99" autocomplete="off" oninput="_bdetUpdateLabels()">
            <span class="pcm-counter-name" id="bdet-accompagnants-lbl">Adultes</span>
          </label>
        </div>
      </div>
      <div class="field full" id="bdet-theme-field" style="display:none">
        <label>Thème</label>
        <input type="text" id="bdet-theme-input" autocomplete="off" oninput="_bdetCheckDirty()" style="display:none">
        <select id="bdet-theme-select" onchange="_bdetCheckDirty()" style="display:none"></select>
      </div>
      <div class="field full" id="bdet-occurrences-field" style="display:none">
        <label>Créneaux concernés</label>
        <div id="bdet-occurrences-list" style="font-size:.65rem;color:var(--muted);max-height:200px;overflow-y:auto;line-height:1.4"></div>
      </div>
    </div>
    <div class="btn-row" style="margin-top:1.25rem">
      <button class="btn btn-ghost" id="bdet-cancel-btn" onclick="closeBadgeDetail()" style="display:none">Annuler</button>
      <button class="btn btn-primary" id="bdet-save-btn" onclick="bdetSaveParticipants()" disabled>💾 Enregistrer</button>
    </div>
    <button class="modal-close" onclick="closeBadgeDetail()">×</button>
  </div>
</div>


<!-- ── Modale édition période ── -->
<div class="modal-overlay" id="period-edit-modal" onclick="if(event.target===this)closePeriodEditModal()">
  <div class="modal-box" style="max-width:480px">
    <div class="modal-title">✏️ Modifier la période</div>
    <div class="form-grid">
      <div class="field"><label for="pe-etiquette">Étiquette</label>
        <input type="text" id="pe-etiquette" placeholder="T1" autocomplete="off"></div>
      <div class="field"><label for="pe-color">Couleur</label>
        <input type="color" id="pe-color" style="width:100%;height:32px;padding:2px;cursor:pointer"></div>
      <div class="field full"><label for="pe-label">Libellé</label>
        <input type="text" id="pe-label" placeholder="Libellé" autocomplete="off"></div>
      <div class="field"><label for="pe-date-start">Début</label>
        <input type="date" id="pe-date-start"></div>
      <div class="field"><label for="pe-date-end">Fin</label>
        <input type="date" id="pe-date-end"></div>
    </div>
    <div class="btn-row" style="margin-top:1rem">
      <button class="btn btn-ghost" onclick="closePeriodEditModal()">Annuler</button>
      <button class="btn btn-primary" onclick="savePeriodEdit()">💾 Enregistrer</button>
    </div>
    <button class="modal-close" onclick="closePeriodEditModal()">×</button>
  </div>
</div>

<!-- ── Modale : choix des demandeurs autorisés pour un créneau ── -->
<div class="modal-overlay" id="demandeurs-modal" onclick="if(event.target===this)closeDemandeursModal()">
  <div class="modal-box" style="max-width:420px">
    <div class="modal-title">👥 Demandeurs autorisés</div>
    <p style="font-size:.78rem;color:var(--muted);margin-bottom:.75rem">Cochez les types de demandeurs autorisés à réserver ce créneau. Aucune case cochée = aucune restriction (créneau ouvert à tous les demandeurs du service).</p>
    <div id="demandeurs-modal-list" style="display:flex;flex-direction:column;gap:.15rem;max-height:50vh;overflow:auto"></div>
    <div class="btn-row" style="margin-top:1rem">
      <button class="btn btn-ghost" onclick="closeDemandeursModal()">Annuler</button>
      <button class="btn btn-primary" onclick="saveDemandeursModal()">💾 Enregistrer</button>
    </div>
    <button class="modal-close" onclick="closeDemandeursModal()">×</button>
  </div>
</div>

<!-- ── Modale confirmation suppression période ── -->
<div class="modal-overlay" id="period-delete-modal" onclick="if(event.target===this)closePeriodDeleteModal()">
  <div class="modal-box" style="max-width:480px">
    <div class="modal-title">🗑️ Supprimer des périodes</div>
    <p style="font-size:.85rem;line-height:1.5;color:var(--text);margin-bottom:.75rem">
      <span id="period-delete-count">0</span> période(s) sélectionnée(s) seront supprimées :
    </p>
    <ul id="period-delete-list" style="list-style:none;padding:.5rem .75rem;margin-bottom:.75rem;background:var(--surface2);border:1px solid var(--border);border-radius:var(--rad-sm);font-size:.82rem;max-height:160px;overflow-y:auto"></ul>
    <p style="font-size:.78rem;color:var(--danger);margin-bottom:1rem">⚠️ Toutes les réservations associées seront également supprimées. Action irréversible.</p>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="closePeriodDeleteModal()">Annuler</button>
      <button class="btn btn-primary" onclick="confirmDeleteSelectedPeriods()" style="background:var(--danger);color:#fff">🗑️ Confirmer</button>
    </div>
    <button class="modal-close" onclick="closePeriodDeleteModal()">×</button>
  </div>
</div>

<!-- ── Modale confirmation : création d'un nouvel exercice ── -->
<div class="modal-overlay" id="exercice-create-confirm-modal" onclick="if(event.target===this)closeExerciceCreateConfirm()">
  <div class="modal-box" style="max-width:460px">
    <div class="modal-title" style="color:var(--accent)"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-2px;display:inline-block;margin-right:.3em"><path d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"/></svg>Créer un nouvel exercice</div>
    <p style="font-size:.85rem;line-height:1.5;color:var(--text);margin-bottom:.75rem">
      Vous êtes sur le point de créer <strong id="exc-create-name">le prochain exercice</strong>.
      Les périodes actives de l'exercice actuel seront recréées avec les dates décalées d'un an, et l'exercice en cours sera désactivé (mais conservé dans l'historique).
    </p>
    <p style="font-size:.78rem;color:var(--accent);font-weight:600;margin-bottom:1rem">Confirmer la création ?</p>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="closeExerciceCreateConfirm()">Annuler</button>
      <button class="btn btn-primary" onclick="closeExerciceCreateConfirm();confirmPeriodCycle()" style="background:var(--accent);color:#0f1117">Créer</button>
    </div>
    <button class="modal-close" onclick="closeExerciceCreateConfirm()">×</button>
  </div>
</div>

<!-- ── Modale confirmation : suppression de l'exercice en cours ── -->
<div class="modal-overlay" id="exercice-delete-confirm-modal" onclick="if(event.target===this)closeExerciceDeleteConfirm()">
  <div class="modal-box" style="max-width:460px">
    <div class="modal-title" id="exc-delete-modal-title" style="color:var(--danger)">↩ Supprimer l'exercice en cours</div>
    <p style="font-size:.85rem;line-height:1.5;color:var(--text);margin-bottom:.75rem">
      Vous êtes sur le point de supprimer définitivement <strong id="exc-delete-name">l'exercice en cours</strong>.
      Toutes ses périodes et créneaux récurrents seront perdus, et l'exercice précédent sera restauré.
    </p>
    <p id="exc-delete-modal-warning" style="font-size:.78rem;color:var(--danger);font-weight:600;margin-bottom:1rem">⚠️ Cette action est irréversible. Confirmer la suppression ?</p>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="closeExerciceDeleteConfirm()">Annuler</button>
      <button class="btn btn-primary" id="exc-delete-modal-btn" onclick="closeExerciceDeleteConfirm();confirmUndoCycle()" style="background:var(--danger);border:none;color:var(--text)">🗑️ Supprimer</button>
    </div>
    <button class="modal-close" onclick="closeExerciceDeleteConfirm()">×</button>
  </div>
</div>

<!-- ── Modale confirmation : suppression d'une réservation ── -->
<div class="modal-overlay" id="booking-delete-confirm-modal" onclick="if(event.target===this)_resolveBookingDelete(false)">
  <div class="modal-box" style="max-width:440px">
    <div class="modal-title" style="color:var(--danger)">🗑️ Supprimer la réservation</div>
    <p style="font-size:.85rem;line-height:1.5;color:var(--text);margin-bottom:.4rem">
      Vous êtes sur le point de supprimer la réservation<span id="bdc-kind"></span> de <strong id="bdc-name">—</strong>.
    </p>
    <p id="bdc-details" style="font-size:.78rem;color:var(--muted);margin-bottom:1rem"></p>
    <p style="font-size:.78rem;color:var(--danger);font-weight:600;margin-bottom:1rem">⚠️ Cette action est irréversible.</p>
    <div class="btn-row">
      <button class="btn btn-ghost" onclick="_resolveBookingDelete(false)">Annuler</button>
      <button class="btn btn-primary" onclick="_resolveBookingDelete(true)" style="background:var(--danger);border:none;color:var(--text)">🗑️ Supprimer</button>
    </div>
    <button class="modal-close" onclick="_resolveBookingDelete(false)">×</button>
  </div>
</div>

<div class="modal-overlay" id="privacy-modal" onclick="if(event.target===this)closePrivacyModal()">
  <div class="modal-box" style="max-width:80%;max-height:80vh;overflow-y:auto">
    <div class="modal-title">🔒 Politique de confidentialité</div>
    <div style="font-size:.85rem;line-height:1.6;color:var(--text);text-align:justify">
      <p style="margin-bottom:.75rem"><strong>Responsable du traitement&nbsp;:</strong> les données collectées sur ce logiciel sont recueillies par la commune de Châtillon (92320), elles sont enregistrées dans un fichier informatisé&nbsp;;</p>
      <p style="margin-bottom:.75rem"><strong>Base légale&nbsp;:</strong> le traitement de vos données personnelles se fonde sur votre consentement&nbsp;;</p>
      <p style="margin-bottom:.75rem"><strong>Finalités&nbsp;:</strong> les données sont collectées afin de pouvoir traiter votre demande de réservation, d'en assurer la gestion et de vous contacter en vue de bénéficier des services et des informations concernant les activités, évènements et fonctionnement des structures culturelles de la Ville. Elles sont également destinées à des fins statistiques.</p>
      <p style="margin-bottom:.75rem"><strong>Durée de conservation&nbsp;:</strong> les informations communiquées seront conservées jusqu'à la suppression de votre compte. Les comptes inactifs (sans connexion) depuis plus de 2 ans peuvent être anonymisés automatiquement par l'administration&nbsp;: les champs nom, prénom, e-mail et téléphone sont alors effacés, l'historique de fréquentation est conservé sous forme anonyme à des fins statistiques&nbsp;;</p>
      <p style="margin-bottom:.75rem"><strong>Destinataires&nbsp;:</strong> les données transmises sont destinées à la Maison des Enfants de la commune de Châtillon (92320) et aux autres services municipaux de la commune (ludo-médiathèque, maison des arts, finances…), ainsi qu'au Trésor public et à la compagnie d'assurance de la commune&nbsp;;</p>
      <p style="margin-bottom:.75rem"><strong>Utilisation de mes données&nbsp;:</strong> la Commune s'engage, afin de protéger la confidentialité des données personnelles recueillies, à ce que celles-ci ne soient pas confiées, ni cédées, ni échangées, ni revendues à des tiers (entreprises ou organismes) à des fins commerciales ou de prospection&nbsp;;</p>
      <p style="margin-bottom:.75rem"><strong>Vos droits&nbsp;:</strong> conformément au règlement européen n°2016/679/UE sur la protection des données personnelles du 27/04/2016 et à la loi informatique et libertés n°78-17 du 06/01/1978, vous disposez d'un droit d'accès, de rectification, d'effacement, de limitation du traitement et de portabilité, aux données vous concernant. À tout moment, vous pouvez retirer votre consentement et supprimer votre compte&nbsp;;</p>
      <p style="margin-bottom:.75rem"><strong>Exercice de vos droits&nbsp;:</strong> ces droits s'exercent sur simple demande adressée par courrier postal à Madame la Maire (Mairie de Châtillon-dpo 1 place de la Libération BP 88, 92322 Châtillon Cedex) ou par courrier électronique au délégué à la protection des données personnelles à l'adresse suivante&nbsp;: <a href="mailto:dpo@chatillon92.fr" style="color:inherit">dpo@chatillon92.fr</a>&nbsp;;</p>
      <p>Pour plus d'informations, vous pouvez consulter le site internet de la CNIL — Commission Nationale de l'Informatique et des Libertés (<a href="https://www.cnil.fr" target="_blank" rel="noopener" style="color:inherit">www.cnil.fr</a>) ou celui de la commune de Châtillon (<a href="https://www.ville-chatillon.fr" target="_blank" rel="noopener" style="color:inherit">www.ville-chatillon.fr</a>). Si vous estimez, après cette démarche, que vos droits « Informatique et Libertés » ne sont pas respectés, vous avez la possibilité d'introduire une réclamation auprès de la CNIL.</p>
    </div>
    <div style="margin-top:1.25rem;text-align:center">
      <button class="btn btn-primary" onclick="closePrivacyModal()">Fermer</button>
    </div>
    <button class="modal-close" onclick="closePrivacyModal()">×</button>
  </div>
</div>

<script src="public/js/app.js?v=<?= @filemtime(__DIR__.'/public/js/app.js') ?: time() ?>"></script>
<iframe id="print-frame" style="display:none" aria-hidden="true"></iframe>
</body>
</html>
