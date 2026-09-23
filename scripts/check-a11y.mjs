/**
 * Audit d'accessibilité automatique du site public (axe-core, WCAG 2.2 AA et
 * bonnes pratiques).
 *
 * Le site sert des personnes aveugles et malvoyantes : une régression de
 * contraste, un bouton sans nom ou un titre sauté se paient chez elles, pas
 * chez nous. Ce script rejoue l'audit en une commande, sur chaque page
 * publique et dans chaque configuration d'affichage que le site propose.
 *
 * Même technique que scripts/capture-aide-screenshots.mjs : Chrome piloté par
 * le Chrome DevTools Protocol, sans Playwright. axe-core est injecté depuis
 * node_modules.
 *
 * Ce qu'un outil automatique ne voit pas — environ deux problèmes sur trois :
 * un ordre de lecture absurde, un texte de lien vague, une annonce qui ne
 * vient jamais. Il ne remplace pas un passage au lecteur d'écran (NVDA,
 * VoiceOver), encore moins l'avis d'un auditeur.
 *
 * Usage :
 *   1. démarrer le serveur de dev (preview_start, ou pnpm dev)
 *   2. pnpm a11y:check                 — toutes les pages, toutes les configurations
 *      pnpm a11y:check contact         — seulement les pages dont le chemin contient « contact »
 *      A11Y_SHOTS=dossier pnpm a11y:check
 *                                      — garde aussi une capture de chaque passage,
 *                                        pour relire à l'œil le mode « couleurs forcées »
 *
 * Sort en erreur au premier défaut trouvé, pour pouvoir servir de garde-fou.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASE = process.env.A11Y_BASE_URL ?? 'http://localhost:3000';
const SHOTS_DIR = process.env.A11Y_SHOTS;
const PORT = 9223; // pas 9222 : aide:shots peut tourner en même temps
const AXE_SOURCE = fs.readFileSync(path.join(process.cwd(), 'node_modules', 'axe-core', 'axe.min.js'), 'utf8');

const CHROME_CANDIDATES = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
];

/**
 * Les pages publiques. `steps` ouvre ce qu'une page cache derrière un clic —
 * la fiche d'un livre est une modale, que l'audit de la page seule ne voit pas.
 */
const PAGES = [
    { path: '/' },
    { path: '/catalogue', waitFor: 'main button' },
    {
        path: '/catalogue',
        name: '/catalogue (fiche d\'un livre)',
        waitFor: '#resultats-catalogue button, main ul button',
        steps: [{ click: '#resultats-catalogue button, main ul button' }, { waitFor: '[role="dialog"]' }],
    },
    { path: '/listes-de-livres' },
    { path: '/dernieres-infos' },
    { path: '/contact' },
    { path: '/accessibilite' },
    { path: '/nous-connaitre/historique' },
    { path: '/nous-connaitre/informations-pratiques' },
    { path: '/nous-connaitre/equipe' },
    { path: '/nous-rejoindre' },
    { path: '/auth/signin' },
    { path: '/auth/forgot-password' },
];

/**
 * Les configurations d'affichage. Chaque réglage du bouton « Affichage »
 * (lib/affichage.ts) change la mise en page ou les couleurs : chacun peut
 * casser ce que l'autre respecte. Le téléphone porte le cumul le plus dur.
 */
const CONFIGS = [
    { name: 'clair', width: 1440, height: 900, theme: 'light' },
    { name: 'sombre', width: 1440, height: 900, theme: 'dark' },
    {
        name: 'couleurs forcées',
        width: 1440,
        height: 900,
        theme: 'light',
        forcedColors: true,
        // Sous « couleurs forcées », le système choisit les couleurs : les
        // contrastes calculés par axe sur les couleurs de la page n'ont plus
        // de sens. Ce passage vérifie le reste, et les captures servent à l'œil.
        disableRules: ['color-contrast', 'color-contrast-enhanced'],
    },
    {
        name: 'téléphone, texte très grand, espacé, contraste',
        width: 375,
        height: 812,
        mobile: true,
        theme: 'light',
        affichage: { taille: 'tres-grande', espacement: true, contraste: true, animationsReduites: false },
    },
    { name: 'téléphone sombre', width: 375, height: 812, mobile: true, theme: 'dark' },
];

// ── CDP, au strict nécessaire ────────────────────────────────────────────────

let nextId = 1;
const pending = new Map();
let socket;

function send(method, params = {}) {
    const id = nextId++;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => {
            if (pending.delete(id)) reject(new Error(`${method} : pas de réponse`));
        }, 60000);
    });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
    for (let attempt = 0; attempt < 40; attempt++) {
        try {
            const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
            const page = targets.find((t) => t.type === 'page');
            if (page?.webSocketDebuggerUrl) {
                socket = new WebSocket(page.webSocketDebuggerUrl);
                await new Promise((resolve, reject) => {
                    socket.onopen = resolve;
                    socket.onerror = reject;
                });
                socket.onmessage = (event) => {
                    const msg = JSON.parse(event.data);
                    const slot = pending.get(msg.id);
                    if (!slot) return;
                    pending.delete(msg.id);
                    msg.error ? slot.reject(new Error(msg.error.message)) : slot.resolve(msg.result);
                };
                return;
            }
        } catch {
            /* Chrome n'écoute pas encore. */
        }
        await sleep(250);
    }
    throw new Error("Chrome n'a pas ouvert son port de débogage");
}

async function evaluate(expression) {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (exceptionDetails) {
        throw new Error((exceptionDetails.exception?.description ?? exceptionDetails.text) + ' — ' + expression.slice(0, 80));
    }
    return result.value;
}

async function goto(url) {
    await send('Page.navigate', { url });
    for (let i = 0; i < 120; i++) {
        if ((await evaluate('document.readyState')) === 'complete') return;
        await sleep(250);
    }
}

async function waitFor(selector, timeout = 30000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        if (await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`)) return;
        await sleep(300);
    }
    throw new Error(`introuvable : ${selector}`);
}

/** Thème et réglages d'affichage, posés avant le chargement de la page. */
async function preparer(config) {
    await send('Emulation.setDeviceMetricsOverride', {
        width: config.width,
        height: config.height,
        deviceScaleFactor: 1,
        mobile: !!config.mobile,
    });
    await send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [
            { name: 'prefers-color-scheme', value: config.theme },
            { name: 'forced-colors', value: config.forcedColors ? 'active' : 'none' },
            // Une page saisie en plein fondu donne de faux défauts de contraste.
            { name: 'prefers-reduced-motion', value: 'reduce' },
        ],
    });
    // next-themes lit « theme » dans localStorage ; le script de tête de
    // app/layout.tsx lit « eca-affichage ». Tous deux avant l'hydratation.
    await goto(`${BASE}/robots.txt`);
    await evaluate(`(() => {
        localStorage.setItem('theme', ${JSON.stringify(config.theme)});
        localStorage.setItem('eca-affichage', ${JSON.stringify(JSON.stringify(config.affichage ?? {}))});
    })()`);
}

async function auditer(config) {
    await evaluate(AXE_SOURCE + ';true');
    return evaluate(`(async () => {
        const result = await axe.run(
            { exclude: [['nextjs-portal']] },
            {
                runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
                rules: Object.fromEntries(${JSON.stringify(config.disableRules ?? [])}.map((id) => [id, { enabled: false }])),
                resultTypes: ['violations'],
            },
        );
        return result.violations.map((v) => ({
            id: v.id,
            impact: v.impact,
            help: v.help,
            nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: n.failureSummary })),
        }));
    })()`);
}

async function capturer(nom) {
    const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
    fs.writeFileSync(path.join(SHOTS_DIR, nom), Buffer.from(data, 'base64'));
}

const slug = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();

// ── Programme ────────────────────────────────────────────────────────────────

async function main() {
    const filter = process.argv[2];
    const pages = filter ? PAGES.filter((p) => (p.name ?? p.path).includes(filter)) : PAGES;
    if (!pages.length) {
        console.error(`Aucune page ne correspond à « ${filter} ».`);
        process.exit(1);
    }
    if (SHOTS_DIR) fs.mkdirSync(SHOTS_DIR, { recursive: true });

    const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
    if (!chrome) throw new Error('ni Chrome ni Edge sur ce poste');

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'a11y-check-'));
    const browser = spawn(chrome, [
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${profile}`,
        '--hide-scrollbars',
        '--no-first-run',
        '--force-device-scale-factor=1',
        'about:blank',
    ], { stdio: 'ignore' });

    let defauts = 0;
    const erreurs = [];
    try {
        await connect();
        await send('Page.enable');
        await send('Runtime.enable');

        for (const config of CONFIGS) {
            console.log(`\n── ${config.name} (${config.width} px)`);
            await preparer(config);
            for (const page of pages) {
                const nom = page.name ?? page.path;
                try {
                    await goto(BASE + page.path);
                    await waitFor('#contenu-principal, main');
                    if (page.waitFor) await waitFor(page.waitFor);
                    for (const step of page.steps ?? []) {
                        if (step.click) {
                            await evaluate(`document.querySelector(${JSON.stringify(step.click)}).click()`);
                        }
                        if (step.waitFor) await waitFor(step.waitFor);
                    }
                    await sleep(800);
                    const violations = await auditer(config);
                    if (SHOTS_DIR) await capturer(`${slug(config.name)}__${slug(nom) || 'accueil'}.png`);
                    if (!violations.length) {
                        console.log(`  ✓ ${nom}`);
                        continue;
                    }
                    defauts += violations.length;
                    console.log(`  ✗ ${nom}`);
                    for (const v of violations) {
                        console.log(`      [${v.impact}] ${v.id} — ${v.help} (${v.nodes.length})`);
                        for (const n of v.nodes.slice(0, 3)) console.log(`          ${n.target}`);
                    }
                } catch (error) {
                    erreurs.push(`${config.name} · ${nom} : ${error.message}`);
                    console.log(`  ! ${nom} — ${error.message}`);
                }
            }
        }
    } finally {
        try { socket?.close(); } catch { /* déjà fermé */ }
        browser.kill();
    }

    if (erreurs.length) console.error(`\n${erreurs.length} page(s) non auditée(s).`);
    if (defauts) console.error(`${defauts} défaut(s) d'accessibilité.`);
    if (erreurs.length || defauts) process.exit(1);
    console.log('\nAucun défaut détecté par axe. Reste le passage au lecteur d\'écran.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
