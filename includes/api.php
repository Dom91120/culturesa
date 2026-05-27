<?php
// ============================================================
//  CultuRézo — Utilitaires API REST
// ============================================================

require_once __DIR__ . '/auth.php';

/**
 * Envoie une réponse JSON et termine le script
 */
function json_response(array $data, int $status = 200): void {
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/**
 * Retourne les données POST décodées depuis JSON ou form-data
 */
function get_input(): array {
    $ct = $_SERVER['CONTENT_TYPE'] ?? '';
    if (str_contains($ct, 'application/json')) {
        $raw  = file_get_contents('php://input');
        $body = json_decode($raw, true) ?? [];
        // Toujours fusionner les paramètres GET (query string) pour les requêtes GET+JSON
        return array_merge($_GET, $body);
    }
    return array_merge($_GET, $_POST);
}

/**
 * Récupère l'utilisateur connecté depuis le token, ou termine avec 401
 */
function require_auth(): array {
    $user = Auth::fromRequest();
    if (!$user) json_response(['ok' => false, 'error' => 'Non authentifié'], 401);
    return $user;
}

/**
 * Vérifie que l'utilisateur est admin, ou termine avec 403
 */
function require_admin(): array {
    $user = require_auth();
    if ($user['role'] !== 'administrateur') {
        json_response(['ok' => false, 'error' => 'Accès refusé'], 403);
    }
    return $user;
}

/**
 * Vérifie que l'utilisateur est admin ou gestionnaire
 */
function require_manager(): array {
    $user = require_auth();
    if (!in_array($user['role'], ['administrateur', 'gestionnaire'])) {
        json_response(['ok' => false, 'error' => 'Accès refusé'], 403);
    }
    return $user;
}

/**
 * Headers de sécurité + CORS restreint à la même origine
 */
function cors_headers(): void {
    // En-têtes de sécurité systématiques
    header('X-Frame-Options: DENY');
    header('X-Content-Type-Options: nosniff');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('X-XSS-Protection: 1; mode=block');

    // CORS : n'autoriser que l'origine propre du serveur
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    if ($origin !== '') {
        $scheme     = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $selfOrigin = $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? '');
        if ($origin === $selfOrigin) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
            header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
            header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token');
            header('Vary: Origin');
        }
        // Origine inconnue → pas de header CORS → le navigateur bloquera la requête cross-origin
    }

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
}

/**
 * Normalise un tableau utilisateur issu de la BDD :
 * décode le champ `services` de sa forme JSON string vers un tableau PHP.
 */
function normalize_user(array $user): array {
    if (isset($user['services']) && is_string($user['services'])) {
        $user['services'] = json_decode($user['services'], true) ?? [];
    } elseif (!isset($user['services'])) {
        $user['services'] = [];
    }
    return $user;
}

/**
 * Vérifie que l'utilisateur a accès au service demandé.
 * Les admins et gestionnaires ont accès à tous les services.
 * Les utilisateurs simples sans restriction (services null ou vide) ont accès à tous les services.
 * Les utilisateurs simples avec des services listés n'ont accès qu'à ceux-ci.
 */
function require_service_access(string $serviceId, array $user): void {
    if (in_array($user['role'], ['administrateur', 'gestionnaire'])) return;
    $allowed = json_decode($user['services'] ?? '[]', true);
    // Tableau vide ou null = aucune restriction, accès à tous les services
    if (!is_array($allowed) || empty($allowed)) return;
    if (!in_array($serviceId, $allowed, true)) {
        json_response(['ok' => false, 'error' => 'Accès refusé à ce service'], 403);
    }
}

/**
 * Vérifie qu'un gestionnaire a le droit d'administrer un service donné.
 * Les administrateurs ont accès à tous les services.
 * Les gestionnaires ne peuvent gérer que les services listés dans leur profil.
 */
function require_manager_service(string $serviceId, array $user): void {
    if ($user['role'] === 'administrateur') return;
    $managed = json_decode($user['services'] ?? '[]', true);
    if (!is_array($managed) || !in_array($serviceId, $managed, true)) {
        json_response(['ok' => false, 'error' => 'Accès refusé à ce service'], 403);
    }
}

// Helpers RGPD (rgpd_log, rgpd_build_export) — partagés avec confirm.php
require_once __DIR__ . '/rgpd.php';

// Activer CORS + headers sécurité pour toutes les requêtes API
cors_headers();
