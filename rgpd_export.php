<?php
// ============================================================
//  CultuRézo — Vue HTML imprimable de l'export RGPD
//  GET /rgpd_export.php?id=<userId>
//
//  Affiche les données personnelles d'un utilisateur dans une mise
//  en page propre, imprimable (window.print() → PDF via navigateur).
//
//  Accès : l'utilisateur lui-même (self-service) OU gestionnaire/admin.
//  Trace l'accès dans le journal d'audit rgpd_log.
// ============================================================

require_once __DIR__ . '/includes/api.php';

$currentUser = Auth::fromRequest();
if (!$currentUser) {
    http_response_code(401);
    echo '<!DOCTYPE html><html><body><p>Non authentifié — <a href="index.php">retour</a>.</p></body></html>';
    exit;
}

$userId = (int)($_GET['id'] ?? 0);
if (!$userId) {
    http_response_code(400);
    echo '<!DOCTYPE html><html><body><p>Paramètre id manquant.</p></body></html>';
    exit;
}

// Auto-export toujours autorisé. Sinon : gestionnaire ou admin.
if ($userId !== (int)$currentUser['id']
    && !in_array($currentUser['role'], ['administrateur', 'gestionnaire'], true)) {
    http_response_code(403);
    echo '<!DOCTYPE html><html><body><p>Accès refusé.</p></body></html>';
    exit;
}

$data = rgpd_build_export($userId);
if (!$data) {
    http_response_code(404);
    echo '<!DOCTYPE html><html><body><p>Utilisateur introuvable.</p></body></html>';
    exit;
}

rgpd_log('export_pdf', $userId, $currentUser);

// Helpers de formatage
function h($v) { return htmlspecialchars((string)($v ?? ''), ENT_QUOTES, 'UTF-8'); }
function fr_date($v, $withTime = false) {
    if (!$v) return '—';
    $t = strtotime($v);
    if (!$t) return h($v);
    return $withTime
        ? date('d/m/Y H:i', $t)
        : date('d/m/Y', $t);
}
function yes_no($v) { return $v ? 'Oui' : 'Non'; }

$p = $data['profile'];
$bks = $data['bookings'];
$days = ['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'];
$dayMap = ['mon'=>'lundi','tue'=>'mardi','wed'=>'mercredi','thu'=>'jeudi','fri'=>'vendredi','sat'=>'samedi','sun'=>'dimanche'];
?><!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Export RGPD — <?= h(trim(($p['prenom'] ?? '') . ' ' . ($p['nom'] ?? '')) ?: $p['email']) ?></title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, sans-serif; color: #1a1f2e; max-width: 880px; margin: 2rem auto; padding: 0 1.5rem; line-height: 1.5; }
  h1 { font-size: 1.6rem; font-weight: 600; margin-bottom: .25rem; }
  h2 { font-size: 1.1rem; font-weight: 600; margin-top: 2rem; margin-bottom: .5rem; padding-bottom: .3rem; border-bottom: 2px solid #6dceaa; color: #2a4d3e; }
  .subtitle { color: #666; font-size: .9rem; margin-bottom: 1.5rem; }
  .meta { background: #f5f9f7; border: 1px solid #d8e4dd; border-radius: 6px; padding: .75rem 1rem; font-size: .82rem; color: #555; margin-bottom: 1.5rem; }
  .meta strong { color: #2a4d3e; }
  table { width: 100%; border-collapse: collapse; font-size: .85rem; margin-top: .5rem; }
  th, td { padding: .4rem .6rem; text-align: left; border-bottom: 1px solid #e8eaed; vertical-align: top; }
  th { background: #f5f9f7; font-weight: 600; color: #2a4d3e; }
  .field-grid { display: grid; grid-template-columns: 180px 1fr; gap: .35rem .75rem; font-size: .88rem; }
  .field-grid dt { color: #666; font-weight: 500; }
  .field-grid dd { margin: 0; color: #1a1f2e; }
  .no-data { color: #999; font-style: italic; }
  .toolbar { display: flex; gap: .5rem; justify-content: flex-end; margin-bottom: 1rem; }
  .toolbar button { background: #6dceaa; color: #0f1117; border: none; border-radius: 6px; padding: .5rem 1rem; font-family: inherit; font-size: .85rem; font-weight: 600; cursor: pointer; }
  .toolbar button:hover { background: #5dbd99; }
  .toolbar a { background: none; color: #666; border: 1px solid #d8e4dd; border-radius: 6px; padding: .5rem 1rem; font-family: inherit; font-size: .85rem; text-decoration: none; }
  .anon-banner { background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; padding: .6rem .85rem; font-size: .85rem; color: #856404; margin-bottom: 1.5rem; }
  @media print {
    .toolbar { display: none; }
    body { margin: 0; padding: 1rem; max-width: none; }
    h2 { page-break-after: avoid; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; }
  }
</style>
</head>
<body>

<div class="toolbar">
  <a href="api/users.php?action=export_json&id=<?= $userId ?>" download>📥 Télécharger en JSON</a>
  <button onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF</button>
</div>

<h1>Export des données personnelles</h1>
<p class="subtitle">Document généré le <?= date('d/m/Y à H:i') ?> — conformément aux articles 15 et 20 du RGPD</p>

<?php if ($p['anonymized_at']): ?>
<div class="anon-banner">
  ⚠️ Ce compte a été <strong>anonymisé</strong> le <?= fr_date($p['anonymized_at'], true) ?>. Les champs nominatifs ont été vidés.
</div>
<?php endif; ?>

<div class="meta">
  <strong>Compte n° <?= $userId ?></strong><br>
  Application : CultuRézo<br>
  Base légale : article 15 du Règlement Général sur la Protection des Données (droit d'accès)
</div>

<h2>Profil</h2>
<dl class="field-grid">
  <dt>Nom</dt>            <dd><?= h($p['nom'])    ?: '<span class="no-data">—</span>' ?></dd>
  <dt>Prénom</dt>         <dd><?= h($p['prenom']) ?: '<span class="no-data">—</span>' ?></dd>
  <dt>E-mail</dt>         <dd><?= h($p['email'])  ?></dd>
  <dt>Téléphone</dt>      <dd><?= h($p['tel'])    ?: '<span class="no-data">—</span>' ?></dd>
  <dt>Niveau / catégorie</dt> <dd><?= h($p['niveau']) ?: '<span class="no-data">—</span>' ?></dd>
  <dt>Enfants (défaut)</dt>    <dd><?= (int)$p['enfants'] ?></dd>
  <dt>Adultes (défaut)</dt>    <dd><?= (int)$p['accompagnants'] ?></dd>
  <dt>Demandeur</dt>      <dd><?= h($p['demandeur_label']) ?: '<span class="no-data">—</span>' ?></dd>
  <dt>Structure</dt>      <dd><?= h($p['structure_label']) ?: '<span class="no-data">—</span>' ?></dd>
  <dt>Rôle</dt>           <dd><?= h($p['role']) ?></dd>
  <dt>Consentement RGPD</dt>   <dd><?= yes_no($p['rgpd_ok']) ?></dd>
  <dt>E-mail confirmé</dt>     <dd><?= yes_no($p['email_confirmed']) ?></dd>
  <dt>Compte créé le</dt>      <dd><?= fr_date($p['created_at'], true) ?></dd>
  <dt>Dernière connexion</dt>  <dd><?= fr_date($p['last_login_at'], true) ?></dd>
  <?php if ($p['anonymized_at']): ?>
  <dt>Anonymisé le</dt>        <dd><?= fr_date($p['anonymized_at'], true) ?></dd>
  <?php endif; ?>
</dl>

<h2>Réservations (<?= count($bks) ?>)</h2>
<?php if (!count($bks)): ?>
  <p class="no-data">Aucune réservation enregistrée.</p>
<?php else: ?>
<table>
  <thead>
    <tr>
      <th>Type</th>
      <th>Service</th>
      <th>Période / Date</th>
      <th>Jour</th>
      <th>Créneau</th>
      <th>Thème</th>
      <th>Participants</th>
      <th>État</th>
      <th>Créée le</th>
    </tr>
  </thead>
  <tbody>
    <?php foreach ($bks as $b): ?>
    <?php
      $type = $b['booking_type'] === 'recurring' ? 'Récurrente' : 'Ponctuelle';
      // Récurrente : période + jour de la semaine. Ponctuelle : date du créneau (slot_id encode la date pour les ponctuels — mais on n'a pas le slot ici).
      $when = $b['booking_type'] === 'recurring'
        ? trim(($b['period_etiquette'] ? $b['period_etiquette'] . ' — ' : '') . ($b['period_label'] ?? ''))
        : (($b['period_date_start'] ?? '') ?: ($b['slot_id'] ?? '—'));
      $day  = $b['day_key'] ? ($dayMap[strtolower(substr($b['day_key'],0,3))] ?? $b['day_key']) : '';
      $week = $b['week'] ? ' (sem. ' . h($b['week']) . ')' : '';
      $etat = (int)$b['validated'] === 1 ? '✓ validée' : '⏳ en attente';
      if ($b['pointage'] === 'present') $etat .= ' · présent';
      if ($b['pointage'] === 'absent')  $etat .= ' · absent';
    ?>
    <tr>
      <td><?= $type ?></td>
      <td><?= h($b['service_label'] ?? $b['service_id']) ?></td>
      <td><?= h($when) ?></td>
      <td><?= h($day) . $week ?></td>
      <td><?= h($b['slot_id']) ?></td>
      <td><?= h($b['theme_label']) ?: '—' ?></td>
      <td><?= (int)$b['enfants'] ?> enf. + <?= (int)$b['accompagnants'] ?> ad.</td>
      <td><?= $etat ?></td>
      <td><?= fr_date($b['created_at'], true) ?></td>
    </tr>
    <?php endforeach; ?>
  </tbody>
</table>
<?php endif; ?>

<h2>Pour aller plus loin</h2>
<p style="font-size:.85rem;color:#555">
  Vous pouvez télécharger ces mêmes informations au <strong>format JSON</strong> (machine-readable, conforme à l'article 20 du RGPD sur la portabilité) via le bouton en haut de page.
</p>
<p style="font-size:.85rem;color:#555">
  Pour demander la rectification ou l'effacement de vos données, contactez l'administrateur de l'application.
</p>

</body>
</html>
