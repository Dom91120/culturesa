<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CultuRézo — Installation</title>
<style>
  body { font-family: system-ui,sans-serif; background:#0f1117; color:#e8e4da; max-width:700px; margin:4rem auto; padding:1rem 1.5rem; }
  h1   { font-size:1.8rem; font-weight:300; margin-bottom:.3rem; }
  h1 em { color:#6dceaa; font-style:italic; }
  .step { background:#181c27; border:1px solid rgba(255,255,255,.08); border-radius:10px; padding:1.25rem 1.5rem; margin-bottom:1rem; }
  .step h2 { font-size:1rem; font-weight:500; margin-bottom:1rem; color:#6dceaa; }
  label  { display:block; font-size:.7rem; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:#7a8099; margin-bottom:.25rem; margin-top:.75rem; }
  input  { display:block; width:100%; background:#1f2435; border:1px solid rgba(255,255,255,.08); border-radius:6px; padding:.5rem .75rem; font-family:inherit; font-size:.9rem; color:#e8e4da; outline:none; }
  input:focus { border-color:#6dceaa; }
  .btn   { background:#6dceaa; color:#0f1117; border:none; border-radius:6px; padding:.6rem 1.4rem; font-family:inherit; font-size:.85rem; font-weight:700; cursor:pointer; margin-top:1.25rem; transition:.2s; }
  .btn:hover { background:#85dab8; }
  .msg-ok    { background:rgba(109,206,170,.12); border:1px solid rgba(109,206,170,.3); border-radius:6px; padding:.75rem 1rem; font-size:.85rem; color:#6dceaa; margin-top:.75rem; }
  .msg-err   { background:rgba(224,107,107,.12); border:1px solid rgba(224,107,107,.3); border-radius:6px; padding:.75rem 1rem; font-size:.85rem; color:#e06b6b; margin-top:.75rem; }
  .check     { color:#6dceaa; margin-right:.4rem; }
  .cross     { color:#e06b6b; margin-right:.4rem; }
  pre        { background:#1f2435; border:1px solid rgba(255,255,255,.08); border-radius:6px; padding:.75rem; font-size:.78rem; overflow-x:auto; margin-top:.5rem; color:#9aa0b8; }
  a          { color:#6dceaa; }
</style>
</head>
<body>

<h1>Résa<em>Cult</em> — Installation</h1>
<p style="color:#7a8099;margin-bottom:2rem;font-size:.9rem">Assistant de configuration pour serveur LAMP</p>

<?php
// ── Vérifications système ────────────────────────────────
$checks = [];
$checks[] = ['PHP ≥ 7.4', version_compare(PHP_VERSION,'7.4','>='), PHP_VERSION];
$checks[] = ['Extension PDO', extension_loaded('pdo'), ''];
$checks[] = ['Extension PDO MySQL', extension_loaded('pdo_mysql'), ''];
$checks[] = ['Extension mbstring', extension_loaded('mbstring'), ''];
$checks[] = ['Dossier includes/ lisible', is_readable(__DIR__.'/../includes'), ''];
$checks[] = ['config.php existe', file_exists(__DIR__.'/../includes/config.php'), !file_exists(__DIR__.'/../includes/config.php') ? '→ créez includes/config.php depuis config.example.php' : ''];

echo '<div class="step"><h2>Vérifications système</h2>';
$allOk = true;
foreach ($checks as [$label, $ok, $detail]) {
    $icon = $ok ? '<span class="check">✅</span>' : '<span class="cross">❌</span>';
    echo "<div style='margin-bottom:.4rem'>$icon $label" . ($detail ? " <span style='color:#7a8099;font-size:.8rem'>($detail)</span>" : '') . "</div>";
    if (!$ok) $allOk = false;
}
echo '</div>';

// ── Formulaire de config DB ──────────────────────────────
$installed = false;
$error = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['db_host'])) {
    $host    = trim($_POST['db_host']);
    $port    = (int)($_POST['db_port'] ?: 3306);
    $name    = trim($_POST['db_name']);
    $user    = trim($_POST['db_user']);
    $pass    = $_POST['db_pass'];
    $charset = 'utf8mb4';
    $adminEmail = trim($_POST['admin_email']);
    $adminPwd   = $_POST['admin_pwd'];

    // Test connexion
    try {
        $dsn = "mysql:host=$host;port=$port;charset=$charset";
        $pdo = new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);

        // Créer la base si besoin
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `$name` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `$name`");

        // Lire et exécuter le SQL
        $sql = file_get_contents(__DIR__.'/culturezo.sql');
        // Remplacer le hash admin par un vrai hash.
        // Le hash bcrypt contient des "$N" (ex: $2y$10$...) qui seraient interprétés
        // comme des backreferences par preg_replace. On échappe \ et $ dans le replacement,
        // et on échappe les ' dans email/hash pour éviter de casser le SQL.
        $hash = password_hash($adminPwd, PASSWORD_DEFAULT);
        $emailSql = str_replace("'", "''", $adminEmail);
        $hashSql  = str_replace("'", "''", $hash);
        $replacement = "INSERT IGNORE INTO `users` (`email`, `password`, `prenom`, `nom`, `role`, `rgpd_ok`) VALUES\n('$emailSql', '$hashSql', 'Admin', 'CultuRézo', 'administrateur', 1);";
        $sql = preg_replace(
            "/INSERT IGNORE INTO `users`.*?VALUES\s*\([^)]+\);/s",
            addcslashes($replacement, '\\$'),
            $sql
        );
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
            if ($stmt) $pdo->exec($stmt . ';');
        }

        // Écrire config.php
        $configContent = <<<PHP
<?php
define('DB_HOST',    '$host');
define('DB_PORT',    $port);
define('DB_NAME',    '$name');
define('DB_USER',    '$user');
define('DB_PASS',    '$pass');
define('DB_CHARSET', 'utf8mb4');
define('SESSION_TTL', 8 * 3600);
define('BASE_PATH', '');
date_default_timezone_set('Europe/Paris');
define('DEBUG_MODE', false);
error_reporting(0);
ini_set('display_errors', 0);
PHP;
        file_put_contents(__DIR__.'/../includes/config.php', $configContent);
        $installed = true;

    } catch (Exception $e) {
        $error = $e->getMessage();
    }
}
?>

<?php if ($installed): ?>
  <div class="msg-ok">
    ✅ <strong>Installation réussie !</strong><br>
    La base de données a été configurée et le fichier <code>includes/config.php</code> a été créé.<br><br>
    <strong>🔒 Important :</strong> Supprimez ou protégez ce dossier <code>install/</code> dès maintenant.<br><br>
    <a href="../" style="font-weight:700">→ Accéder à l'application</a>
  </div>
<?php elseif ($error): ?>
  <div class="msg-err">❌ Erreur : <?= htmlspecialchars($error) ?></div>
<?php endif; ?>

<?php if (!$installed): ?>
<form method="POST">
  <div class="step">
    <h2>⚙️ Configuration de la base de données</h2>
    <label>Hôte MySQL</label>
    <input type="text" name="db_host" value="localhost" required>
    <label>Port</label>
    <input type="number" name="db_port" value="3306" required>
    <label>Nom de la base</label>
    <input type="text" name="db_name" value="culturezo" required>
    <label>Utilisateur MySQL</label>
    <input type="text" name="db_user" value="root" required>
    <label>Mot de passe MySQL</label>
    <input type="password" name="db_pass" placeholder="(vide si root sans mot de passe)">
  </div>
  <div class="step">
    <h2>👤 Compte administrateur</h2>
    <label>E-mail administrateur</label>
    <input type="email" name="admin_email" value="admin@culturezo.fr" required>
    <label>Mot de passe administrateur</label>
    <input type="password" name="admin_pwd" placeholder="Choisissez un mot de passe fort" required minlength="12">
  </div>
  <button class="btn" type="submit">🚀 Installer CultuRézo</button>
</form>
<?php endif; ?>

<div class="step" style="margin-top:2rem">
  <h2>📋 Installation manuelle</h2>
  <p style="font-size:.85rem;color:#7a8099;margin-bottom:.75rem">
    Vous pouvez aussi installer manuellement en suivant ces étapes :
  </p>
  <ol style="font-size:.85rem;color:#9aa0b8;line-height:2;padding-left:1.5rem">
    <li>Créer la base MySQL et importer <code>install/culturezo.sql</code></li>
    <li>Copier <code>includes/config.example.php</code> en <code>includes/config.php</code></li>
    <li>Renseigner les paramètres DB dans <code>includes/config.php</code></li>
    <li>Définir un mot de passe admin via <code>UPDATE users SET password=PASSWORD_HASH WHERE email='admin@culturezo.fr'</code></li>
    <li>Supprimer ou protéger le dossier <code>install/</code></li>
  </ol>
</div>

</body>
</html>
