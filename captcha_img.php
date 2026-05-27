<?php
// ============================================================
//  CultuRézo — Génération du CAPTCHA image (GD, sans dépendance)
//  Retourne un PNG avec texte distordu + bruit.
//  La réponse attendue est stockée en $_SESSION['captcha_answer'].
// ============================================================

session_start();

// ── Texte aléatoire ──────────────────────────────────────────
// Caractères non ambigus (ni 0/O, ni 1/I/l)
$chars  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
$length = 6;
$text   = '';
for ($i = 0; $i < $length; $i++) {
    $text .= $chars[random_int(0, strlen($chars) - 1)];
}
$_SESSION['captcha_answer'] = $text;

// Libérer le verrou de session immédiatement
session_write_close();

// ── Dimensions ───────────────────────────────────────────────
$w = 230;
$h = 72;

if (!function_exists('imagecreatetruecolor')) {
    // GD non disponible : renvoyer une image 1×1 transparente
    header('Content-Type: image/gif');
    echo base64_decode('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    exit;
}

$img = imagecreatetruecolor($w, $h);

// ── Couleurs ─────────────────────────────────────────────────
$cBg    = imagecolorallocate($img, 15,  17,  23);   // #0f1117
$cBg2   = imagecolorallocate($img, 22,  26,  38);   // fond secondaire

// ── Fond avec léger dégradé horizontal ───────────────────────
for ($x = 0; $x < $w; $x++) {
    $ratio = $x / $w;
    $r = (int)(15 + 7  * $ratio);
    $g = (int)(17 + 9  * $ratio);
    $b = (int)(23 + 15 * $ratio);
    $lc = imagecolorallocate($img, $r, $g, $b);
    imageline($img, $x, 0, $x, $h - 1, $lc);
}

// ── Lignes de bruit de fond (discrètes) ──────────────────────
for ($i = 0; $i < 10; $i++) {
    $v  = random_int(35, 65);
    $lc = imagecolorallocate($img, $v, $v + random_int(0, 8), $v + random_int(0, 12));
    imageline(
        $img,
        random_int(0, $w), random_int(0, $h),
        random_int(0, $w), random_int(0, $h),
        $lc
    );
}

// ── Tracé des caractères (police GD intégrée, taille 5) ──────
$font    = 5;
$cw      = imagefontwidth($font);
$ch      = imagefontheight($font);
$spacing = $cw + 8;
$startX  = (int)(($w - $length * $spacing) / 2);
$baseY   = (int)(($h - $ch) / 2);

// Palettes de couleurs proches du thème vert/cyan
$palettes = [
    [109, 206, 170], [85,  220, 160], [130, 210, 185],
    [70,  195, 155], [145, 215, 195], [95,  225, 170],
];

for ($i = 0; $i < $length; $i++) {
    $pal = $palettes[array_rand($palettes)];
    $r   = max(60,  min(255, $pal[0] + random_int(-25, 25)));
    $g   = max(140, min(255, $pal[1] + random_int(-20, 20)));
    $b   = max(60,  min(255, $pal[2] + random_int(-25, 25)));
    $cc  = imagecolorallocate($img, $r, $g, $b);

    // Décalage vertical aléatoire par caractère
    $dy = random_int(-8, 8);
    imagestring($img, $font, $startX + $i * $spacing, $baseY + $dy, $text[$i], $cc);
}

// ── Pixels de bruit (avant distorsion) ───────────────────────
for ($i = 0; $i < 600; $i++) {
    $v  = random_int(18, 72);
    $nc = imagecolorallocate($img, $v, $v + random_int(0, 8), $v + random_int(0, 10));
    imagesetpixel($img, random_int(0, $w - 1), random_int(0, $h - 1), $nc);
}

// ── Distorsion sinus verticale ────────────────────────────────
$wave1 = imagecreatetruecolor($w, $h);
$wbg   = imagecolorallocate($wave1, 15, 17, 23);
imagefill($wave1, 0, 0, $wbg);

$ampV  = 5.5;
$freqV = 28.0;

for ($x = 0; $x < $w; $x++) {
    $dy = (int)round($ampV * sin($x / $freqV));
    for ($y = 0; $y < $h; $y++) {
        $srcY = $y - $dy;
        if ($srcY >= 0 && $srcY < $h) {
            imagesetpixel($wave1, $x, $y, imagecolorat($img, $x, $srcY));
        }
    }
}

// ── Distorsion sinus horizontale ─────────────────────────────
$wave2 = imagecreatetruecolor($w, $h);
$wbg2  = imagecolorallocate($wave2, 15, 17, 23);
imagefill($wave2, 0, 0, $wbg2);

$ampH  = 4.0;
$freqH = 32.0;

for ($y = 0; $y < $h; $y++) {
    $dx = (int)round($ampH * sin($y / $freqH));
    for ($x = 0; $x < $w; $x++) {
        $srcX = $x - $dx;
        if ($srcX >= 0 && $srcX < $w) {
            imagesetpixel($wave2, $x, $y, imagecolorat($wave1, $srcX, $y));
        }
    }
}

imagedestroy($img);
imagedestroy($wave1);

// ── Lignes de bruit par-dessus (post-distorsion) ─────────────
for ($i = 0; $i < 4; $i++) {
    $v  = random_int(40, 75);
    $lc = imagecolorallocate($wave2, $v, $v, $v);
    imageline(
        $wave2,
        random_int(0, $w), random_int(0, $h),
        random_int(0, $w), random_int(0, $h),
        $lc
    );
}

// ── Bordure subtile ───────────────────────────────────────────
$border = imagecolorallocate($wave2, 40, 50, 70);
imagerectangle($wave2, 0, 0, $w - 1, $h - 1, $border);

// ── Envoi ─────────────────────────────────────────────────────
header('Content-Type: image/png');
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');
header('Expires: 0');
imagepng($wave2, null, 6); // compression 6 (bon équilibre taille/qualité)
imagedestroy($wave2);
