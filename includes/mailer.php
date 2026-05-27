<?php
// ============================================================
//  CultuRézo — Helper d'envoi d'e-mail
//  Utilise PHPMailer (SMTP) ou mail() selon la configuration.
// ============================================================

require_once __DIR__ . '/db.php';

/**
 * Envoie un e-mail HTML.
 * Retourne true en cas de succès, ou lance une exception en cas d'erreur.
 *
 * @throws \RuntimeException|\PHPMailer\PHPMailer\Exception
 */
function send_mail(string $to, string $subject, string $htmlBody): bool
{
    // ── Lire la configuration stockée en base ────────────────
    $keys = ['mail_driver','mail_host','mail_port','mail_security',
             'mail_username','mail_password','mail_from','mail_from_name'];
    $rows = DB::all(
        "SELECT cfg_key, cfg_value FROM app_config WHERE cfg_key IN ("
        . implode(',', array_fill(0, count($keys), '?')) . ")",
        $keys
    );
    $cfg = [];
    foreach ($rows as $row) $cfg[$row['cfg_key']] = $row['cfg_value'] ?? '';

    $driver   = $cfg['mail_driver']    ?: 'mail';
    $from     = $cfg['mail_from']      ?: (defined('MAIL_FROM')      ? MAIL_FROM      : 'noreply@culturezo.fr');
    $fromName = $cfg['mail_from_name'] ?: (defined('MAIL_FROM_NAME') ? MAIL_FROM_NAME : 'CultuRézo');

    // ── Mode SMTP via PHPMailer ───────────────────────────────
    if ($driver === 'smtp') {
        $autoload = __DIR__ . '/../vendor/autoload.php';
        if (!file_exists($autoload)) {
            throw new \RuntimeException('PHPMailer introuvable. Lancez « composer install » à la racine du projet.');
        }
        require_once $autoload;

        $mail = new \PHPMailer\PHPMailer\PHPMailer(true); // true = exceptions activées

        $mail->isSMTP();
        $mail->Host      = $cfg['mail_host'] ?: 'localhost';
        $mail->Port      = (int)($cfg['mail_port'] ?: 587);
        $mail->CharSet   = 'UTF-8';
        $mail->Encoding  = 'base64';
        // Capture la réponse SMTP complète dans le message d'exception
        $mail->Debugoutput = 'error_log';
        $mail->SMTPDebug   = defined('SMTP_DEBUG') && SMTP_DEBUG ? 2 : 0;

        // Chiffrement
        if ($cfg['mail_security'] === 'ssl') {
            $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
        } elseif ($cfg['mail_security'] === 'tls') {
            $mail->SMTPSecure = \PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
        } else {
            $mail->SMTPAutoTLS = false;
        }

        // Authentification
        if ($cfg['mail_username'] !== '') {
            $mail->SMTPAuth = true;
            $mail->Username = $cfg['mail_username'];
            $mail->Password = $cfg['mail_password'] ?: '';
        }

        $mail->setFrom($from, $fromName);
        $mail->addAddress($to);
        $mail->isHTML(true);
        $mail->Subject = $subject;
        $mail->Body    = $htmlBody;
        $mail->AltBody = strip_tags($htmlBody);

        return $mail->send();
    }

    // ── Mode mail() / sendmail (fallback) ────────────────────
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $headers = implode("\r\n", [
        'MIME-Version: 1.0',
        'Content-Type: text/html; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
        'From: =?UTF-8?B?' . base64_encode($fromName) . '?= <' . $from . '>',
        'Reply-To: ' . $from,
        'X-Mailer: CultuRézo',
    ]);

    return (bool) @mail($to, $encodedSubject, base64_encode($htmlBody), $headers);
}
