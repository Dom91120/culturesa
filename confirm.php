<?php
// ============================================================
//  CultuRézo — Confirmation d'adresse e-mail avec CAPTCHA image
//  GET  /confirm.php?token=<token>  → affiche le CAPTCHA
//  POST /confirm.php                → vérifie CAPTCHA + active
// ============================================================

session_start();
require_once __DIR__ . '/includes/auth.php';

$scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
$appUrl = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost') . (defined('BASE_PATH') ? BASE_PATH : '');

$state      = 'captcha'; // captcha | success | error
$errMsg     = '';
$token      = '';
$confirmType = 'account'; // account | email_change | delete | reset_password

// ── POST : vérification du CAPTCHA puis activation ───────────
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $token       = trim($_POST['token'] ?? '');
    $confirmType = $_POST['confirm_type'] ?? 'account';
    $userAnswer  = strtoupper(trim($_POST['captcha_answer'] ?? ''));
    $newPwd      = $_POST['new_password']     ?? '';
    $newPwd2     = $_POST['new_password_2']   ?? '';

    if (!$token) {
        $state  = 'error';
        $errMsg = 'Token manquant.';
    } elseif (!isset($_SESSION['captcha_token'])) {
        $state  = 'error';
        $errMsg = 'Session expirée. Veuillez recharger la page.';
    } elseif ($_SESSION['captcha_token'] !== $token) {
        $state  = 'error';
        $errMsg = 'Token incohérent. Veuillez recommencer.';
    } elseif (!isset($_SESSION['captcha_answer']) || $userAnswer !== $_SESSION['captcha_answer']) {
        // Mauvaise réponse : invalider l'ancienne réponse (captcha_img.php en régénérera une)
        $state  = 'captcha';
        $errMsg = 'Code incorrect — un nouveau code a été généré.';
        unset($_SESSION['captcha_answer']);
    } elseif ($confirmType === 'reset_password' && ($newPwd === '' || $newPwd !== $newPwd2)) {
        // Captcha OK mais le nouveau mot de passe est vide ou non confirmé.
        $state  = 'captcha';
        $errMsg = $newPwd === '' ? 'Saisissez un nouveau mot de passe.' : 'Les deux mots de passe ne correspondent pas.';
        unset($_SESSION['captcha_answer']); // re-captcha au prochain affichage
    } else {
        // CAPTCHA OK → traitement selon le type
        unset($_SESSION['captcha_answer'], $_SESSION['captcha_token']);
        if ($confirmType === 'email_change') {
            $result = Auth::confirmEmailChange($token);
        } elseif ($confirmType === 'delete') {
            $result = Auth::confirmAccountDeletion($token);
        } elseif ($confirmType === 'reset_password') {
            $result = Auth::confirmPasswordReset($token, $newPwd);
        } else {
            $result = Auth::confirmEmail($token);
        }
        if ($result['ok']) {
            $state = 'success';
        } else {
            $state  = 'error';
            $errMsg = $result['error'];
        }
    }

// ── GET : validation du token + préparation session ──────────
} else {
    $token = trim($_GET['token'] ?? '');
    $typeParam = $_GET['type'] ?? '';
    if ($typeParam === 'email_change')      $confirmType = 'email_change';
    elseif ($typeParam === 'delete')         $confirmType = 'delete';
    elseif ($typeParam === 'reset_password') $confirmType = 'reset_password';
    else                                      $confirmType = 'account';

    if ($confirmType === 'email_change')      $valid = Auth::validateEmailChangeToken($token);
    elseif ($confirmType === 'delete')        $valid = Auth::validateDeletionToken($token);
    elseif ($confirmType === 'reset_password') $valid = Auth::validatePasswordResetToken($token);
    else                                       $valid = Auth::validateToken($token);

    if (!$token || !$valid) {
        $state  = 'error';
        $errMsg = 'Ce lien est invalide ou a expiré.';
    } else {
        $state = 'captcha';
        $_SESSION['captcha_token'] = $token;
        // La réponse sera stockée par captcha_img.php lors du chargement de l'image
    }
}

// Libérer la session avant d'envoyer le HTML
// (pour que captcha_img.php puisse écrire captcha_answer sans attendre)
session_write_close();

// Graine unique pour forcer le rechargement de l'image à chaque affichage
$captchaSeed = bin2hex(random_bytes(8));
?>
<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title><?= $state === 'success' ? 'Compte activé' : ($state === 'captcha' ? 'Vérification' : 'Lien invalide') ?> — CultuRézo</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: #0f1117; color: #e8e4da;
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      padding: 1.5rem;
    }
    .wrap { display: flex; flex-direction: column; align-items: center; gap: 1.25rem; max-width: 480px; width: 100%; }
    .card {
      background: #181c27; border: 1px solid rgba(255,255,255,.08);
      border-radius: 12px; padding: 2.5rem 2rem; width: 100%;
      text-align: center;
    }
    .logo { font-size: 1.5rem; font-weight: 700; color: #6dceaa; margin-bottom: 1.75rem; }
    .icon { font-size: 3rem; margin-bottom: 1rem; line-height: 1; }
    h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: .75rem; }
    p  { font-size: .9rem; color: #9aa0b4; line-height: 1.6; margin-bottom: 1.25rem; }

    /* ── Captcha ── */
    .captcha-wrap {
      display: flex; align-items: center; justify-content: center;
      gap: .6rem; margin: 1.25rem 0 .75rem;
    }
    .captcha-img {
      border-radius: 8px; border: 1.5px solid rgba(109,206,170,.25);
      display: block; height: 72px; width: 230px;
      image-rendering: crisp-edges;
    }
    .captcha-refresh {
      background: none; border: 1.5px solid rgba(109,206,170,.3);
      border-radius: 8px; color: #6dceaa; font-size: 1.1rem;
      padding: .45rem .6rem; cursor: pointer; line-height: 1;
      transition: background .15s, border-color .15s;
      flex-shrink: 0;
    }
    .captcha-refresh:hover { background: rgba(109,206,170,.08); border-color: #6dceaa; }
    .captcha-input {
      width: 100%; font-size: 1.25rem; font-weight: 700; text-align: center;
      letter-spacing: .25em; text-transform: uppercase;
      background: #0f1117; color: #6dceaa;
      border: 1.5px solid rgba(109,206,170,.4); border-radius: 8px;
      padding: .55rem .5rem; outline: none; margin-bottom: 1rem;
    }
    .captcha-input:focus { border-color: #6dceaa; }
    .captcha-hint {
      font-size: .78rem; color: #5a6080; margin-bottom: .85rem; margin-top: -.25rem;
    }

    /* ── Messages ── */
    .error-msg {
      font-size: .82rem; color: #e05555; background: rgba(220,80,80,.1);
      border: 1px solid rgba(220,80,80,.3); border-radius: 6px;
      padding: .45rem .75rem; margin-bottom: 1rem;
    }

    /* ── Boutons ── */
    .btn {
      display: inline-block; background: #6dceaa; color: #0f1117;
      padding: .75rem 2rem; border-radius: 8px; text-decoration: none;
      font-weight: 700; font-size: .95rem; border: none; cursor: pointer;
      transition: background .15s; width: 100%;
    }
    .btn:hover { background: #4aae88; }
    .btn.ghost {
      background: transparent; color: #6dceaa;
      border: 1px solid rgba(109,206,170,.4);
    }
    .btn.ghost:hover { background: rgba(109,206,170,.08); }

    /* ── RGPD ── */
    .rgpd-card {
      background: #181c27; border: 1px solid rgba(255,255,255,.06);
      border-radius: 12px; padding: 1.5rem; width: 100%;
    }
    .rgpd-header {
      font-size: .78rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .08em; color: #6dceaa; margin-bottom: .85rem;
    }
    .rgpd-text { font-size: .8rem; color: #7a8099; line-height: 1.75; }
    .rgpd-text strong { color: #9aa0b4; }
    .rgpd-text ul { padding-left: 1.1rem; }
    .rgpd-text li { margin-bottom: .25rem; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="logo">CultuRézo</div>

      <?php if ($state === 'success'): ?>
        <?php if ($confirmType === 'delete'): ?>
          <div class="icon">🗑️</div>
          <h1>Compte supprimé</h1>
          <p>Vos données personnelles ont été effacées. L'historique de vos réservations est conservé sous forme anonyme à des fins statistiques.</p>
          <a href="<?= htmlspecialchars($appUrl) ?>" class="btn">Retour à l'accueil</a>
        <?php elseif ($confirmType === 'email_change'): ?>
          <div class="icon">✅</div>
          <h1>Adresse e-mail mise à jour !</h1>
          <p>Votre nouvelle adresse e-mail a bien été confirmée.<br>Veuillez vous reconnecter avec votre nouvelle adresse.</p>
          <a href="<?= htmlspecialchars($appUrl) ?>" class="btn">Se connecter →</a>
        <?php elseif ($confirmType === 'reset_password'): ?>
          <div class="icon">🔑</div>
          <h1>Mot de passe mis à jour</h1>
          <p>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</p>
          <a href="<?= htmlspecialchars($appUrl) ?>" class="btn">Se connecter →</a>
        <?php else: ?>
          <div class="icon">✅</div>
          <h1>Compte activé !</h1>
          <p>Votre adresse e-mail a bien été confirmée.<br>Vous pouvez maintenant vous connecter.</p>
          <a href="<?= htmlspecialchars($appUrl) ?>" class="btn">Se connecter →</a>
        <?php endif; ?>

      <?php elseif ($state === 'captcha'): ?>
        <?php if ($confirmType === 'delete'): ?>
          <div class="icon">🛡️</div>
          <h1>Confirmer la suppression du compte</h1>
          <p style="color:#e0a6a6">⚠️ Action irréversible. Tapez le code de vérification pour confirmer définitivement la suppression de vos données personnelles.</p>
        <?php elseif ($confirmType === 'reset_password'): ?>
          <div class="icon">🔑</div>
          <h1>Choisir un nouveau mot de passe</h1>
          <p>Saisissez votre nouveau mot de passe et le code de vérification.</p>
        <?php else: ?>
          <div class="icon">🛡️</div>
          <h1>Vérification anti-robot</h1>
          <p>Tapez les <?= $length = 6 ?> caractères affichés dans l'image pour activer votre compte.</p>
        <?php endif; ?>

        <?php if ($errMsg): ?>
          <div class="error-msg"><?= htmlspecialchars($errMsg) ?></div>
        <?php endif; ?>

        <form method="POST" action="<?= htmlspecialchars($appUrl) ?>/confirm.php" autocomplete="off">
          <input type="hidden" name="token"
                 value="<?= htmlspecialchars($token ?: ($_SESSION['captcha_token'] ?? '')) ?>">
          <input type="hidden" name="confirm_type" value="<?= htmlspecialchars($confirmType) ?>">

          <?php if ($confirmType === 'reset_password'): ?>
            <!-- Nouveaux champs mot de passe (uniquement pour reset) -->
            <div style="display:flex;flex-direction:column;gap:.5rem;margin-bottom:1rem;text-align:left">
              <label style="font-size:.78rem;color:#9aa0b4">Nouveau mot de passe
                <input type="password" name="new_password" required minlength="12"
                  style="display:block;width:100%;margin-top:.25rem;padding:.55rem .75rem;border-radius:8px;border:1.5px solid rgba(255,255,255,.12);background:#0f1117;color:#e8e4da;font-family:inherit;font-size:.92rem;outline:none">
              </label>
              <label style="font-size:.78rem;color:#9aa0b4">Confirmer le mot de passe
                <input type="password" name="new_password_2" required minlength="12"
                  style="display:block;width:100%;margin-top:.25rem;padding:.55rem .75rem;border-radius:8px;border:1.5px solid rgba(255,255,255,.12);background:#0f1117;color:#e8e4da;font-family:inherit;font-size:.92rem;outline:none">
              </label>
              <span style="font-size:.7rem;color:#5a6080;line-height:1.5">12 caractères minimum, avec au moins 1 majuscule, 1 minuscule, 1 chiffre et 1 caractère spécial.</span>
            </div>
          <?php endif; ?>

          <!-- Image CAPTCHA + bouton rafraîchir -->
          <div class="captcha-wrap">
            <img id="captcha-img"
                 src="<?= htmlspecialchars($appUrl) ?>/captcha_img.php?<?= $captchaSeed ?>"
                 alt="Code de vérification"
                 class="captcha-img"
                 draggable="false">
            <button type="button" class="captcha-refresh"
                    onclick="refreshCaptcha()" title="Nouveau code">↻</button>
          </div>

          <p class="captcha-hint">Lettres majuscules et chiffres · pas sensible à la casse</p>

          <input class="captcha-input"
                 type="text"
                 name="captcha_answer"
                 maxlength="6"
                 <?= $confirmType === 'reset_password' ? '' : 'autofocus' ?>
                 required
                 autocomplete="off"
                 spellcheck="false"
                 placeholder="_ _ _ _ _ _">

          <button class="btn" type="submit"
            style="<?= $confirmType === 'delete' ? 'background:#e06b6b;color:#fff' : '' ?>">
            <?php
              if ($confirmType === 'delete')             echo '🗑️ Supprimer définitivement mon compte';
              elseif ($confirmType === 'email_change')   echo 'Valider et changer mon adresse →';
              elseif ($confirmType === 'reset_password') echo '🔑 Valider mon nouveau mot de passe';
              else                                        echo 'Valider et activer mon compte →';
            ?>
          </button>
        </form>

      <?php else: ?>
        <div class="icon">⚠️</div>
        <h1>Lien invalide ou expiré</h1>
        <p><?= htmlspecialchars($errMsg) ?><br>Veuillez créer un nouveau compte ou contacter l'administration.</p>
        <a href="<?= htmlspecialchars($appUrl) ?>" class="btn ghost">← Retour à l'application</a>

      <?php endif; ?>
    </div>

    <?php if ($state === 'success'): ?>
    <div class="rgpd-card">
      <div class="rgpd-header">🔒 Vos droits sur vos données personnelles (RGPD)</div>
      <div class="rgpd-text">
        <p>Conformément au <strong>Règlement Général sur la Protection des Données (RGPD – UE 2016/679)</strong>, vous disposez des droits suivants :</p>
        <ul style="margin-top:.5rem">
          <li><strong>Droit d'accès</strong> — consulter les données vous concernant.</li>
          <li><strong>Droit de rectification</strong> — corriger des informations inexactes via votre espace compte.</li>
          <li><strong>Droit à l'effacement</strong> — demander la suppression de votre compte et de vos données.</li>
          <li><strong>Droit d'opposition</strong> — vous opposer au traitement de vos données.</li>
        </ul>
        <p style="margin-top:.65rem">Pour exercer ces droits, contactez directement l'établissement ou le service concerné. Vos demandes seront traitées dans un délai d'un mois conformément à la réglementation.</p>
      </div>
    </div>
    <?php endif; ?>
  </div>

  <script>
    function refreshCaptcha() {
      const img = document.getElementById('captcha-img');
      const base = img.src.split('?')[0];
      img.src = base + '?' + Date.now();
    }
  </script>
</body>
</html>
