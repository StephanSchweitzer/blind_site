/**
 * Recapture les copies d'écran du mode d'emploi (public/aide/).
 *
 * Pilote Chrome par le Chrome DevTools Protocol, SANS dépendance nouvelle :
 * Node 22 apporte `WebSocket` et `fetch` en natif, et Chrome est déjà installé
 * sur les postes. Ajouter Playwright pour une poignée de captures aurait pesé
 * plus lourd que le service rendu.
 *
 * Les captures ne sont pas décoratives : le texte les commente (« cliquez sur
 * le bouton … »). Une capture qui contredit son paragraphe est pire que pas de
 * capture du tout — d'où ce script, pour que les refaire soit une commande et
 * non un après-midi.
 *
 * Usage :
 *   1. démarrer le serveur de dev (preview_start, ou pnpm dev)
 *   2. pnpm aide:shots            — toutes les captures déclarées
 *      pnpm aide:shots factures   — seulement celles dont le nom contient « factures »
 */
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';

const BASE = process.env.AIDE_BASE_URL ?? 'http://localhost:3000';
const EMAIL = process.env.AIDE_USER ?? 'claude@eca.test';
const PASSWORD = process.env.AIDE_PASSWORD ?? 'ClaudeDev2026!';
const OUT_DIR = path.join(process.cwd(), 'content', 'aide', 'images');
const PORT = 9222;
const VIEWPORT = { width: 1440, height: 900 };

const CHROME_CANDIDATES = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
];

/**
 * Ce qu'il faut photographier.
 *
 * `clip` borne la capture à un élément — les captures d'origine cadrent le
 * modal ou le tableau, pas la fenêtre entière. `steps` ouvre ce qu'il faut
 * avant de déclencher.
 */
const SPECS = [
    {
        name: 'factures-01.jpg',
        url: '/admin/bills',
        waitFor: 'table tbody tr',
        // Filtre sur le compte de test : la base de dev porte de VRAIS auditeurs,
        // et public/ n'est pas derriere l'authentification.
        steps: [{ searchFor: 'stef' }, { sleep: 2500 }],
        clip: '.rounded-lg.border',
        why: 'états Payée/Soldée et le filtre « Factures en retard »',
    },
    {
        name: 'factures-06.jpg',
        url: '/admin/bills',
        waitFor: 'table tbody tr',
        steps: [{ clickText: 'Ajouter une facture' }, { waitFor: '[role="dialog"]' }, { sleep: 800 }],
        clip: '[role="dialog"]',
        // Les numeros reprennent ceux du paragraphe de 08-factures.md.
        annotations: [
            { n: 1, label: "État de la facture" },
            { n: 2, label: 'Date de création' },
            { n: 3, label: "Date d'émission" },
            { n: 4, label: 'Créer la facture', self: true },
        ],
        why: "état à la création + date d'émission obligatoire si « Payée »",
    },
    {
        name: 'demandes-07.jpg',
        url: '/admin/orders',
        waitFor: 'table tbody tr',
        steps: [{ clickText: 'Ajouter une demande' }, { waitFor: '[role="dialog"]' }, { sleep: 800 }],
        clip: '[role="dialog"]',
        why: 'le coût conseillé par CD',
    },
    {
        name: 'attributions-10.jpg',
        url: '/admin/assignments',
        waitFor: 'table tbody tr',
        steps: [
            { clickText: 'Ajouter une attribution' }, { waitFor: '[role="dialog"]' }, { sleep: 900 },
            { scrollToText: "Date d'envoi au lecteur" }, { sleep: 400 },
        ],
        clip: '[role="dialog"]',
        why: 'les trois dates, dans leur ordre',
    },
    {
        name: 'paiements-07.jpg',
        url: '/admin/payments',
        waitFor: 'table tbody tr',
        steps: [
            { clickText: 'Ajouter un paiement' }, { waitFor: '[role="dialog"]' }, { sleep: 900 },
            { clickExact: 'Cotisation' }, { waitFor: '[role="option"]' }, { sleep: 400 },
            { clickExact: 'Don' }, { sleep: 900 },
        ],
        clip: '[role="dialog"]',
        why: 'le champ client selon le type (Donateur / Personne)',
    },
    {
        name: 'liste-de-livres-01.jpg',
        url: '/admin/listes-de-livres',
        waitFor: 'table tbody tr, .rounded-lg.border',
        clip: '.rounded-lg.border',
        why: "l'adresse /admin/listes-de-livres",
    },
    // ── Sections ajoutees apres la reprise du guide ─────────────────────────
    {
        name: 'doublons-01.jpg',
        url: '/admin/review',
        waitFor: '.rounded-lg.border',
        sleep: 1200,
        clip: '.rounded-lg.border',
        why: 'la file des doublons, deux fiches cote a cote',
    },
    {
        name: 'audio-orphelin-01.jpg',
        url: '/admin/audio-orphelins',
        waitFor: '.rounded-lg.border',
        sleep: 1200,
        clip: '.rounded-lg.border',
        why: 'les trois onglets et la file a traiter',
    },
    {
        name: 'statistiques-01.jpg',
        url: '/admin/stats',
        waitFor: 'h1',
        sleep: 2500,
        why: "les indicateurs d'activite",
    },
    {
        name: 'pages-publiques-01.jpg',
        url: '/admin/news',
        waitFor: '.rounded-lg.border',
        sleep: 1200,
        clip: '.rounded-lg.border',
        why: 'la liste des dernieres infos',
    },
    {
        name: 'mon-compte-01.jpg',
        url: '/admin/profile',
        waitFor: 'h1',
        sleep: 1500,
        why: 'identifiants, indisponibilites, activite recente',
    },
    {
        name: 'membres-14.jpg',
        url: '/admin/users/auditeurs',
        waitFor: 'table tbody tr',
        steps: [
            { searchFor: 'stef' }, { sleep: 2500 },
            { clickSelector: 'table tbody tr' }, { waitFor: '[role="dialog"]' }, { sleep: 2000 },
            { scrollToText: 'Supprimer la personne' }, { sleep: 400 },
        ],
        clip: '[role="dialog"]',
        why: 'la suppression, logique',
    },
];

// ── CDP, au strict nécessaire ────────────────────────────────────────────────

let nextId = 1;
const pending = new Map();
let socket;

function send(method, params = {}, sessionId) {
    const id = nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    socket.send(JSON.stringify(message));
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => {
            if (pending.delete(id)) reject(new Error(`${method} : pas de réponse`));
        }, 30000);
    });
}

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function evaluate(expression) {
    const { result, exceptionDetails } = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.text + ' — ' + expression.slice(0, 80));
    return result.value;
}

async function goto(url) {
    await send('Page.navigate', { url });
    // Le routeur d'App Router peut rendre après `load` ; on attend le document
    // puis on laisse React finir.
    for (let i = 0; i < 60; i++) {
        if ((await evaluate('document.readyState')) === 'complete') break;
        await sleep(250);
    }
}

async function waitFor(selector, timeout = 25000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
        const found = await evaluate(`!!document.querySelector(${JSON.stringify(selector)})`);
        if (found) return true;
        await sleep(300);
    }
    throw new Error(`introuvable : ${selector}`);
}

/**
 * Le clic passe par le DOM plutôt que par des coordonnées : la mise en page
 * change au fil des versions, le libellé du bouton beaucoup moins.
 */
async function clickText(text, exact = false) {
    const clicked = await evaluate(`(() => {
        const wanted = ${JSON.stringify(text)};
        const exact = ${exact};
        const nodes = [...document.querySelectorAll('button, a, [role="button"], [role="option"], [role="combobox"]')];
        const hit = nodes.find((n) => {
            const label = n.textContent.trim();
            const ok = exact ? label === wanted : label.includes(wanted);
            return ok && n.getBoundingClientRect().height > 0;
        });
        if (!hit) return false;
        hit.click();
        return true;
    })()`);
    if (!clicked) throw new Error(`element « ${text} » introuvable`);
}

/** Amene un libelle au centre de son conteneur defilant, pour le photographier. */
async function scrollToText(text) {
    const ok = await evaluate(`(() => {
        const wanted = ${JSON.stringify(text)};
        const nodes = [...document.querySelectorAll('label, h3, h4, button, p, span, div')];
        const hit = nodes.reverse().find((n) => n.textContent.trim() === wanted && n.getBoundingClientRect().height > 0);
        if (!hit) return false;
        hit.scrollIntoView({ block: 'center' });
        return true;
    })()`);
    if (!ok) throw new Error(`libelle « ${text} » introuvable`);
}

/** Filtre un tableau, pour ne pas photographier les donnees de vrais membres. */
async function searchFor(term) {
    await evaluate(`(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const input = [...document.querySelectorAll('input[type="text"], input:not([type])')]
            .find((i) => (i.placeholder || '').toLowerCase().includes('recherch'));
        if (!input) return false;
        setter.call(input, ${JSON.stringify(term)});
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    })()`);
    // Certaines pages filtrent a la frappe et n'ont pas de bouton : son absence
    // n'est pas une erreur.
    try {
        await clickText('Rechercher');
    } catch {
        /* recherche instantanee */
    }
}

async function clickSelector(selector) {
    const clicked = await evaluate(`(() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.click();
        return true;
    })()`);
    if (!clicked) throw new Error(`élément ${selector} introuvable`);
}

/** Le rectangle de l'élément visible, ramené dans la fenêtre. */
async function clipFor(selector) {
    return evaluate(`(() => {
        const els = [...document.querySelectorAll(${JSON.stringify(selector)})]
            .filter((e) => e.getBoundingClientRect().height > 0);
        if (!els.length) return null;
        // Le plus grand : le modal ou la carte principale, pas un liseré interne.
        const el = els.sort((a, b) =>
            b.getBoundingClientRect().height * b.getBoundingClientRect().width -
            a.getBoundingClientRect().height * a.getBoundingClientRect().width)[0];
        el.scrollIntoView({ block: 'nearest' });
        const r = el.getBoundingClientRect();
        const pad = 8;
        const x = Math.max(0, r.left - pad);
        const y = Math.max(0, r.top - pad);
        return {
            x, y,
            width: Math.min(window.innerWidth - x, r.width + pad * 2),
            height: Math.min(window.innerHeight - y, r.height + pad * 2),
        };
    })()`);
}

/**
 * La position REELLE d'un champ, demandee au navigateur.
 *
 * Les reperes numerotes du guide ne sont pas decoratifs : le texte y renvoie
 * (« (1) Selectionnez l'etat ... »). Les tracer a la main, c'est les voir
 * glisser des que l'interface bouge ; les prendre ici, c'est qu'ils suivent.
 */
async function reperesPour(annotations, clip) {
    const trouves = [];
    for (const a of annotations) {
        const rect = await evaluate(`(() => {
            const libelle = ${JSON.stringify(a.label)};
            const propre = ${a.self ? "true" : "false"};
            const noeuds = [...document.querySelectorAll('label, button, a, p, span, div, h3, h4')];
            const el = noeuds.find((n) => n.textContent.trim() === libelle
                && n.getBoundingClientRect().height > 0);
            if (!el) return null;
            let cible = el;
            if (!propre) {
                // Remonter jusqu'au bloc qui englobe l'etiquette ET son champ.
                const hauteurLibelle = el.getBoundingClientRect().height;
                let noeud = el;
                for (let i = 0; i < 3 && noeud.parentElement; i++) {
                    noeud = noeud.parentElement;
                    if (noeud.getBoundingClientRect().height > hauteurLibelle * 1.8) {
                        cible = noeud;
                        break;
                    }
                }
            }
            const r = cible.getBoundingClientRect();
            return { x: r.x, y: r.y, w: r.width, h: r.height };
        })()`);
        if (!rect) {
            console.log(`     ! repere ${a.n} : « ${a.label} » introuvable`);
            continue;
        }
        trouves.push({
            n: a.n,
            x: Math.round(rect.x - (clip ? clip.x : 0)),
            y: Math.round(rect.y - (clip ? clip.y : 0)),
            w: Math.round(rect.w),
            h: Math.round(rect.h),
            ...(a.fleche ? { fleche: true } : {}),
        });
    }
    return trouves;
}

async function capture(name, clipSelector, annotations = []) {
    let clip;
    if (clipSelector) {
        clip = await clipFor(clipSelector);
        if (clip) clip = { ...clip, scale: 1 };
    }
    const reperes = annotations.length ? await reperesPour(annotations, clip) : [];

    const { data } = await send('Page.captureScreenshot', {
        format: 'jpeg',
        quality: 85,
        ...(clip ? { clip } : {}),
    });
    const file = path.join(OUT_DIR, name);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    if (reperes.length) {
        fs.writeFileSync(file + '.reperes.json', JSON.stringify(reperes, null, 2));
    }
    return fs.statSync(file).size;
}

/**
 * Impose le theme clair.
 *
 * app/providers.tsx monte next-themes en `defaultTheme="system"` avec
 * `enableSystem` : au montage, la bibliotheque REECRIT « system » dans
 * localStorage, ce qui efface un « light » pose avant la navigation. On agit
 * donc en deux temps — la preference du systeme emulee pour que « system »
 * signifie clair, et la classe forcee juste avant la photo, apres toute
 * hydratation.
 */
async function forcerThemeClair() {
    await send('Emulation.setEmulatedMedia', {
        media: 'screen',
        features: [{ name: 'prefers-color-scheme', value: 'light' }],
    });
    // Forcer la classe ne suffit pas : ThemeToggle rappelle setTheme au montage
    // et next-themes repose la sienne. On actionne donc le bouton de
    // l'application, dont le choix explicite, lui, est retenu.
    const sombre = await evaluate(`document.documentElement.classList.contains('dark')`);
    if (sombre) {
        const bascule = await evaluate(`(() => {
            const b = document.querySelector('button[aria-label="Activer le thème clair"]');
            if (!b) return false;
            b.click();
            return true;
        })()`);
        if (!bascule) console.log('     ! bouton de theme introuvable — capture en sombre');
        await sleep(600);
    }
}

async function signIn() {
    await goto(`${BASE}/auth/signin`);
    await forcerThemeClair();
    await goto(`${BASE}/auth/signin`);
    await waitFor('#email');

    /**
     * Les deux champs sont controles par React : ecrire `.value` ne suffit pas,
     * il faut passer par le setter natif du prototype puis emettre l'evenement,
     * sinon le rendu suivant remet la valeur de l'etat (vide).
     */
    const fill = async () => evaluate(`(() => {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
        const put = (id, value) => {
            const el = document.getElementById(id);
            if (!el) return null;
            setter.call(el, value);
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            return el.value;
        };
        put('email', ${JSON.stringify(EMAIL)});
        put('password', ${JSON.stringify(PASSWORD)});
        return {
            email: document.getElementById('email')?.value ?? null,
            password: document.getElementById('password')?.value ? 'rempli' : 'vide',
        };
    })()`);

    let filled = await fill();
    // Un premier passage peut tomber pendant une re-hydratation : on retente.
    if (!filled?.email) {
        await sleep(1000);
        filled = await fill();
    }
    if (process.env.AIDE_DEBUG) console.log('  champs :', filled);
    if (!filled?.email) throw new Error("impossible de renseigner l'email");

    await clickText('Se connecter');
    // Le premier passage compile /api/auth cote serveur de dev : large marge.
    for (let i = 0; i < 180; i++) {
        const url = await evaluate('location.pathname');
        if (!url.startsWith('/auth')) return;
        await sleep(500);
    }
    const diagnostic = await evaluate(`({
        path: location.pathname,
        search: location.search,
        alerte: document.body.innerText.slice(0, 400),
    })`);
    throw new Error('la connexion a echoue : ' + JSON.stringify(diagnostic, null, 2));
}

// ── Programme ────────────────────────────────────────────────────────────────

async function main() {
    const filter = process.argv[2];
    const specs = filter ? SPECS.filter((s) => s.name.includes(filter)) : SPECS;
    if (!specs.length) {
        console.error(`Aucune capture ne correspond à « ${filter} ».`);
        process.exit(1);
    }

    const chrome = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
    if (!chrome) throw new Error('ni Chrome ni Edge sur ce poste');

    const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-shots-'));
    const browser = spawn(chrome, [
        '--headless=new',
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${profile}`,
        `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
        '--hide-scrollbars',
        '--no-first-run',
        '--force-device-scale-factor=1',
        'about:blank',
    ], { stdio: 'ignore' });

    const failures = [];
    try {
        await connect();
        await send('Page.enable');
        await send('Runtime.enable');
        await send('Emulation.setDeviceMetricsOverride', {
            ...VIEWPORT, deviceScaleFactor: 1, mobile: false,
        });
        await signIn();
        console.log(`Connecté. ${specs.length} capture(s) à prendre.\n`);

        for (const spec of specs) {
            try {
                await goto(BASE + spec.url);
                if (spec.waitFor) await waitFor(spec.waitFor);
                await sleep(spec.sleep ?? 600);
                for (const step of spec.steps ?? []) {
                    if (step.clickText) await clickText(step.clickText);
                    if (step.clickExact) await clickText(step.clickExact, true);
                    if (step.clickSelector) await clickSelector(step.clickSelector);
                    if (step.scrollToText) await scrollToText(step.scrollToText);
                    if (step.searchFor) await searchFor(step.searchFor);
                    if (step.waitFor) await waitFor(step.waitFor);
                    if (step.sleep) await sleep(step.sleep);
                }
                await forcerThemeClair();
                await sleep(300);
                const size = await capture(spec.name, spec.clip, spec.annotations ?? []);
                console.log(`  ✓ ${spec.name.padEnd(26)} ${String(Math.round(size / 1024)).padStart(4)} Ko   ${spec.why}`);
            } catch (error) {
                failures.push([spec.name, error.message]);
                console.log(`  ✗ ${spec.name.padEnd(26)} ${error.message}`);
            }
        }
    } finally {
        try { socket?.close(); } catch { /* déjà fermé */ }
        browser.kill();
    }

    if (failures.length) {
        console.error(`\n${failures.length} capture(s) manquée(s).`);
        process.exit(1);
    }
    console.log('\nToutes les captures sont à jour.');
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
