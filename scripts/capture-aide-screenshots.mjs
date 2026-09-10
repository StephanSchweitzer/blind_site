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
        name: 'factures-02.jpg',
        url: '/admin/bills',
        waitFor: 'table tbody tr',
        steps: [{ clickText: 'Ajouter une facture' }, { waitFor: '[role="dialog"]' }, { sleep: 900 }],
        clip: '[role="dialog"]',
        why: 'le formulaire vide, avant qu\'un auditeur ne soit choisi',
    },
    {
        name: 'factures-03.jpg',
        url: '/admin/bills',
        waitFor: 'table tbody tr',
        steps: [
            { clickText: 'Ajouter une facture' }, { waitFor: '[role="dialog"]' }, { sleep: 900 },
            { clickSelector: '[role="dialog"] [role="combobox"]' }, { sleep: 600 },
            { typeIn: { selector: '[placeholder="Rechercher par nom ou email..."]', value: 'stef' } },
            { sleep: 1600 },
        ],
        clip: '[role="dialog"]',
        why: 'la recherche d\'auditeur, nom et adresse sur deux lignes',
    },
    {
        name: 'factures-04.jpg',
        url: '/admin/bills',
        waitFor: 'table tbody tr',
        steps: [
            { clickText: 'Ajouter une facture' }, { waitFor: '[role="dialog"]' }, { sleep: 900 },
            { clickSelector: '[role="dialog"] [role="combobox"]' }, { sleep: 600 },
            { typeIn: { selector: '[placeholder="Rechercher par nom ou email..."]', value: 'stef' } },
            { sleep: 1600 },
            { clickSelector: '[data-radix-popper-content-wrapper] button' },
            { sleep: 2200 },
            // L'etoile du champ obligatoire fait partie du texte du libelle.
            { scrollToText: 'Demandes à facturer *' }, { sleep: 400 },
        ],
        clip: '[role="dialog"]',
        why: 'les avertissements ambre : prestation non terminée, tarif absent',
    },
    {
        name: 'factures-06.jpg',
        url: '/admin/bills',
        waitFor: 'table tbody tr',
        steps: [{ clickText: 'Ajouter une facture' }, { waitFor: '[role="dialog"]' }, { sleep: 800 }],
        clip: '[role="dialog"]',
        // Les numeros reprennent ceux du paragraphe de 08-factures.md.
        annotations: [
            { n: 1, label: 'Auditeur *' },
            { n: 2, label: "État de la facture" },
            { n: 3, label: 'Date de création' },
            { n: 4, label: "Date d'émission" },
            { n: 5, label: 'Créer la facture', self: true },
        ],
        why: "état à la création + date d'émission obligatoire si « Payée »",
    },
    {
        name: 'factures-07.jpg',
        viewport: { width: 1440, height: 1400 },
        url: '/admin/bills',
        waitFor: 'table tbody tr',
        steps: [
            { clickText: 'Ajouter une facture' }, { waitFor: '[role="dialog"]' }, { sleep: 900 },
            // Le formulaire s'ouvre deja sur « Émise » : le bloc du reglement
            // est donc la, il ne reste qu'a cocher la case (par son etiquette).
            { clickExact: 'Facture déjà réglée' }, { sleep: 1000 },
        ],
        clip: '[role="dialog"]',
        why: 'la case « Facture déjà réglée » et les trois champs du règlement',
    },
    {
        name: 'factures-09.jpg',
        viewport: { width: 1440, height: 1400 },
        url: '/admin/bills?bill=2791',
        waitFor: '[role="dialog"]',
        sleep: 2200,
        clip: '[role="dialog"]',
        annotations: [
            { n: 1, label: 'Enregistrer un paiement', self: true },
            { n: 2, label: 'Émettre la facture', self: true },
            { n: 3, label: 'Ajouter une demande', self: true },
            { n: 4, label: 'Supprimer la facture', self: true },
        ],
        why: 'un BROUILLON : « Ajouter une demande » n\'existe que là',
    },
    {
        name: 'factures-10.jpg',
        viewport: { width: 1440, height: 1400 },
        url: '/admin/bills?bill=2804',
        waitFor: '[role="dialog"]',
        sleep: 2200,
        clip: '[role="dialog"]',
        annotations: [
            { n: 1, label: 'Imprimer la facture', self: true },
            { n: 2, label: 'Remettre en brouillon', self: true },
            { n: 3, label: 'Marquer comme payée', self: true },
            { n: 4, label: 'Solder la facture', self: true },
        ],
        why: 'une ÉMISE : le compte encaissé, et les trois suites possibles',
    },
    {
        name: 'factures-11.jpg',
        viewport: { width: 1440, height: 1400 },
        url: '/admin/bills?bill=2809',
        waitFor: '[role="dialog"]',
        sleep: 2200,
        clip: '[role="dialog"]',
        annotations: [{ n: 1, label: 'Rouvrir la facture', self: true }],
        why: 'une PAYÉE : le bandeau ambre « Facture finalisée »',
    },
    {
        name: 'factures-12.jpg',
        viewport: { width: 1440, height: 1400 },
        url: '/admin/bills?bill=2804',
        waitFor: '[role="dialog"]',
        sleep: 2200,
        steps: [{ clickText: 'Historique de la facture' }, { sleep: 1200 }],
        clip: '[role="dialog"]',
        why: "l'historique déployé, une ligne par écriture",
    },
    {
        name: 'factures-13.jpg',
        url: '/admin/bills?bill=2804',
        waitFor: '[role="dialog"]',
        sleep: 2200,
        steps: [{ clickText: 'Supprimer la facture' }, { sleep: 1200 }],
        clip: '[role="alertdialog"], [role="dialog"]',
        why: 'la confirmation de suppression, et ce qu\'elle annonce',
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
        name: 'paiements-04.jpg',
        viewport: { width: 1440, height: 1300 },
        url: '/admin/payments',
        waitFor: 'table tbody tr',
        steps: [
            { clickText: 'Ajouter un paiement' }, { waitFor: '[role="dialog"]' }, { sleep: 900 },
            { clickExact: 'Cotisation' }, { waitFor: '[role="option"]' }, { sleep: 500 },
            { clickExact: 'Enregistrement' }, { sleep: 900 },
            { clickText: 'Rechercher un auditeur' }, { sleep: 700 },
            { typeIn: { selector: '[placeholder="Nom, email, ou numéro de personne..."]', value: 'stef' } },
            { sleep: 1800 },
            { clickSelector: '[data-radix-popper-content-wrapper] button' }, { sleep: 2200 },
        ],
        clip: '[role="dialog"]',
        why: "l'auditeur choisi fait apparaitre « Factures associees »",
    },
    {
        name: 'paiements-05.jpg',
        viewport: { width: 1440, height: 1300 },
        url: '/admin/payments',
        waitFor: 'table tbody tr',
        steps: [
            { clickText: 'Ajouter un paiement' }, { waitFor: '[role="dialog"]' }, { sleep: 900 },
            { clickExact: 'Cotisation' }, { waitFor: '[role="option"]' }, { sleep: 500 },
            { clickExact: 'Enregistrement' }, { sleep: 900 },
            { clickText: 'Rechercher un auditeur' }, { sleep: 700 },
            { typeIn: { selector: '[placeholder="Nom, email, ou numéro de personne..."]', value: 'stef' } },
            { sleep: 1800 },
            { clickSelector: '[data-radix-popper-content-wrapper] button' }, { sleep: 2200 },
            { clickText: 'Rechercher une facture' }, { sleep: 1200 },
        ],
        clip: '[role="dialog"]',
        why: 'les 10 dernieres factures de cet auditeur, avec la recherche',
    },
    {
        name: 'paiements-06.jpg',
        viewport: { width: 1440, height: 1300 },
        url: '/admin/payments',
        waitFor: 'table tbody tr',
        steps: [
            { clickText: 'Ajouter un paiement' }, { waitFor: '[role="dialog"]' }, { sleep: 900 },
            { clickExact: 'Cotisation' }, { waitFor: '[role="option"]' }, { sleep: 500 },
            { clickExact: 'Enregistrement' }, { sleep: 900 },
            { clickText: 'Rechercher un auditeur' }, { sleep: 700 },
            { typeIn: { selector: '[placeholder="Nom, email, ou numéro de personne..."]', value: 'stef' } },
            { sleep: 1800 },
            { clickSelector: '[data-radix-popper-content-wrapper] button' }, { sleep: 2200 },
            { clickText: 'Rechercher une facture' }, { sleep: 1200 },
            { clickSelector: '[role="option"], [data-radix-popper-content-wrapper] button' },
            { sleep: 1400 },
        ],
        clip: '[role="dialog"]',
        why: 'la facture une fois rattachee au paiement en cours',
    },
    {
        name: 'paiements-07.jpg',
        viewport: { width: 1440, height: 1300 },
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
        name: 'paiements-01.jpg',
        url: '/admin/payments',
        waitFor: 'table tbody tr',
        // Le panneau de filtres part replie : sans ce clic, « Periode sur »
        // n'existe pas dans le DOM et son repere se poserait dans le vide.
        steps: [
            { typeIn: { selector: 'input[placeholder*="paiement"]', value: 'stef' } }, { sleep: 2200 },
            { clickExact: 'Filtres' }, { sleep: 600 },
        ],
        clip: '.rounded-lg.border',
        annotations: [
            { n: 1, label: 'Exporter (CSV)', self: true },
            { n: 2, label: 'Filtres', self: true },
            { n: 3, label: 'Période sur' },
        ],
        why: 'la recherche élargie, le panneau des filtres déplié et l\'export CSV',
    },
    {
        name: 'paiements-02.jpg',
        viewport: { width: 1440, height: 1300 },
        url: '/admin/payments',
        waitFor: 'table tbody tr',
        steps: [
            { clickText: 'Ajouter un paiement' }, { waitFor: '[role="dialog"]' }, { sleep: 900 },
            { clickExact: 'Cotisation' }, { waitFor: '[role="option"]' }, { sleep: 600 },
        ],
        clip: '[role="listbox"], [data-radix-popper-content-wrapper]',
        why: 'les quatre types de paiement, dans leur menu',
    },
    {
        name: 'paiements-03.jpg',
        viewport: { width: 1440, height: 1300 },
        url: '/admin/payments',
        waitFor: 'table tbody tr',
        steps: [{ clickText: 'Ajouter un paiement' }, { waitFor: '[role="dialog"]' }, { sleep: 1200 }],
        clip: '[role="dialog"]',
        annotations: [
            { n: 1, label: 'Type *' },
            { n: 2, label: 'Auditeur *' },
            { n: 3, label: 'Montant *' },
            { n: 4, label: 'Année de cotisation' },
            { n: 5, label: 'Créer le paiement', self: true },
        ],
        why: 'une COTISATION : le champ « Année de cotisation » lui est propre',
    },
    {
        name: 'paiements-08.jpg',
        viewport: { width: 1440, height: 1300 },
        url: '/admin/payments',
        waitFor: 'table tbody tr',
        steps: [
            { clickText: 'Ajouter un paiement' }, { waitFor: '[role="dialog"]' }, { sleep: 900 },
            { clickExact: 'Détails comptables' }, { sleep: 900 },
        ],
        clip: '[role="dialog"]',
        why: 'les détails comptables, repliés par défaut',
    },
    {
        name: 'paiements-09.jpg',
        viewport: { width: 1440, height: 1300 },
        url: '/admin/payments?payment=8996',
        waitFor: '[role="dialog"]',
        sleep: 2400,
        clip: '[role="dialog"]',
        why: 'un ENREGISTREMENT rattaché à une facture, tel qu\'on le rouvre',
    },
    {
        name: 'paiements-10.jpg',
        viewport: { width: 1440, height: 1300 },
        url: '/admin/payments?payment=8985',
        waitFor: '[role="dialog"]',
        sleep: 2400,
        clip: '[role="dialog"]',
        annotations: [
            { n: 1, label: 'Supprimer le paiement', self: true },
            { n: 2, label: 'Enregistrer les modifications', self: true },
        ],
        why: 'les deux gestes propres à la modification',
    },
    {
        name: 'paiements-11.jpg',
        viewport: { width: 1440, height: 1300 },
        url: '/admin/payments?payment=8985',
        waitFor: '[role="dialog"]',
        sleep: 2400,
        steps: [{ clickText: 'Supprimer le paiement' }, { sleep: 1400 }],
        clip: '[role="alertdialog"], [role="dialog"]',
        why: 'la confirmation de suppression d\'un paiement',
    },
    {
        name: 'liste-de-livres-01.jpg',
        url: '/admin/listes-de-livres',
        waitFor: 'table tbody tr, .rounded-lg.border',
        clip: '.rounded-lg.border',
        why: "l'adresse /admin/listes-de-livres",
    },
    {
        name: 'liste-de-livres-10.jpg',
        url: '/admin/listes-de-livres/new',
        waitFor: '#since',
        steps: [
            // Une date bien avant la coupure par défaut, pour faire apparaître
            // le bouton « Revenir à cette date » qu'on annote juste après.
            { typeIn: { selector: '#since', value: '2020-01-01' } },
            { sleep: 1800 },
        ],
        clip: '.rounded-md.border.border-border.bg-card.p-3',
        annotations: [
            { n: 1, label: 'Nouveautés depuis le' },
            { n: 2, label: 'Revenir à cette date', self: true },
        ],
        why: 'le filtre de date des nouveautés, et le retour à la coupure par défaut',
    },
    // ── Sections ajoutees apres la reprise du guide ─────────────────────────
    {
        name: 'page-principale-05.jpg',
        url: '/admin',
        waitFor: 'nav',
        clip: 'nav',
        annotations: [
            { n: 1, label: 'Aide', self: true, fleche: true },
        ],
        why: 'le lien « Aide », qui ouvre le mode d\'emploi de la page en cours dans un nouvel onglet',
    },
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
        sleep: 4000,
        annotations: [
            { n: 1, label: '4 semaines', self: true },
            // L'onglet porte son total colle a son nom : « Production1 ».
            { n: 2, label: 'Livres ajoutés' },
        ],
        why: "la periode, les trois familles, et les cartes de Production",
    },
    {
        name: 'statistiques-02.jpg',
        url: '/admin/stats',
        waitFor: 'h1',
        sleep: 4000,
        steps: [{ clickText: 'Facturation' }, { sleep: 1800 }],
        why: 'la famille Facturation, et ce que chaque carte y compte',
    },
    {
        name: 'statistiques-03.jpg',
        viewport: { width: 1440, height: 1100 },
        url: '/admin/stats',
        waitFor: 'h1',
        sleep: 4000,
        steps: [{ scrollToText: 'Activité des permanents' }, { sleep: 1200 }],
        annotations: [{ n: 1, label: 'Modifications tracées', self: true }],
        why: 'la grille : une ligne par permanent, une colonne par jour',
    },
    {
        name: 'statistiques-04.jpg',
        viewport: { width: 1440, height: 1100 },
        url: '/admin/stats',
        waitFor: 'h1',
        sleep: 4000,
        steps: [{ scrollToText: 'Membres' }, { sleep: 1200 }],
        why: "la carte Membres et son filtre Tous / Lecteurs / Auditeurs / Autres",
    },
    {
        name: 'statistiques-05.jpg',
        viewport: { width: 1440, height: 1300 },
        url: '/admin/stats',
        waitFor: 'h1',
        sleep: 4500,
        steps: [
            { scrollToText: 'Journal des modifications' }, { sleep: 2000 },
        ],
        why: 'le journal, ses filtres, et la ligne de retenue en tete',
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
        // Les etiquettes en font partie : une case a cocher Radix se bascule
        // par son libelle, et « Facture deja reglee » n'est rien d'autre.
        const nodes = [...document.querySelectorAll('button, a, label, [role="button"], [role="option"], [role="combobox"]')];
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
        // h1 et h2 compris : les titres de section des statistiques en sont,
        // et leur absence d'ici faisait echouer le cadrage sur un libelle
        // pourtant bien present dans la page.
        const nodes = [...document.querySelectorAll('label, h1, h2, h3, h4, button, p, span, div')];
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

/**
 * Ecrit dans UN champ designe, et pas dans le premier venu.
 *
 * `searchFor` prend le premier champ de recherche du document. Modal ouvert,
 * ce premier champ est celui de la PAGE, reste derriere : on filtrait le
 * tableau du fond pendant que le formulaire au premier plan restait vide.
 */
async function typeIn(selector, value) {
    const ok = await evaluate(`(() => {
        // Le premier VISIBLE : plusieurs pages posent le meme champ deux fois,
        // une version pour le telephone et une pour l'ecran large, dont une
        // seule est affichee. Ecrire dans la version masquee ne filtre rien.
        const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
            .find((n) => n.getBoundingClientRect().height > 0);
        if (!el) return false;
        const proto = el instanceof window.HTMLTextAreaElement
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(value)});
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
    })()`);
    if (!ok) throw new Error(`champ ${selector} introuvable`);
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
            // Une taille REELLE, pas seulement non nulle : le meme libelle
            // existe souvent en double, dont une copie de 1x1 px destinee aux
            // lecteurs d'ecran. Elle vient en premier dans le document, et le
            // repere se posait donc sur un point invisible.
            const el = noeuds.find((n) => {
                if (n.textContent.trim() !== libelle) return false;
                const r = n.getBoundingClientRect();
                return r.height > 8 && r.width > 8;
            });
            if (!el) return null;
            let cible = el;
            if (!propre) {
                // Remonter jusqu'au bloc qui englobe l'etiquette ET son champ.
                // Assez grand pour englober l'etiquette ET son champ, mais pas
                // plus : sans plafond, « Annee de cotisation » remontait
                // jusqu'au formulaire entier et le cadre vert enfermait dix
                // champs d'un coup, ce qui ne designe plus rien.
                const hauteurLibelle = el.getBoundingClientRect().height;
                let noeud = el;
                for (let i = 0; i < 3 && noeud.parentElement; i++) {
                    noeud = noeud.parentElement;
                    const h = noeud.getBoundingClientRect().height;
                    if (h > hauteurLibelle * 1.8) {
                        if (h <= hauteurLibelle * 6) cible = noeud;
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

/**
 * Remplace les donnees personnelles AVANT la photo.
 *
 * La base de developpement n'est pas un jeu d'essai : c'est une copie du reel,
 * avec de vrais auditeurs, leurs adresses electroniques et leurs adresses
 * postales. Or le guide s'imprime et se donne aux nouveaux permanents.
 *
 * D'ou ce nettoyage a la SOURCE plutot qu'apres coup. L'autre chaine
 * (aide-ocr.ps1 + redact-aide-screenshots.py) peint des rectangles sur des
 * pixels d'apres un OCR : elle depend de ce que l'OCR a su lire, et ce qu'il
 * rate reste lisible. Ici on reecrit le DOM — ce qui n'est plus dans la page
 * n'est dans aucune capture, sans dependre d'une reconnaissance de caracteres.
 *
 * Les pseudonymes sont DETERMINISTES : « Bernard MORVAN » rend toujours le
 * meme faux nom, dans toutes les captures. Un tirage aleatoire donnerait a la
 * meme personne un nom different d'une image a l'autre, et le lecteur croirait
 * a deux dossiers la ou le guide en montre un.
 *
 * Ce que le nettoyage NE fait pas : deviner qu'un mot est un patronyme. Les
 * formes reglees (courriel, telephone, voie, code postal) partent par motif ;
 * les noms partent par CORRESPONDANCE EXACTE contre la liste des membres, que
 * l'application nous donne elle-meme (voir chargerNomsReels). Une heuristique
 * aurait rebaptise « Claire » dans un titre du catalogue ; la verite terrain,
 * non. Le garde-fou en fin de fonction refuse la capture s'il reste un nom.
 */
const NOMS_FICTIFS = [
    'Camille Berger', 'Julien Marchand', 'Sylvie Lemoine', 'Thierry Nadaud',
    'Odile Vasseur', 'Marc Delaunay', 'Hélène Rousseau', 'Patrick Fontaine',
    'Nicole Aubry', 'Damien Perrot', 'Christiane Loiseau', 'Serge Bonnet',
];

/**
 * Les vrais noms, demandes a l'application elle-meme.
 *
 * Deviner qu'un mot est un patronyme ne marche pas : « Claire » ouvre autant de
 * fiches que de titres de livres. On prend donc la VERITE TERRAIN — la liste
 * des membres — et on ne remplace que ce qui y figure vraiment.
 *
 * Seuls les noms COMPLETS servent. Un prenom seul n'identifie personne et se
 * confond avec un titre ou un auteur du catalogue : le remplacer abimerait des
 * captures sans rien proteger.
 */
let NOMS_REELS = [];

async function chargerNomsReels() {
    const paires = await evaluate(`(async () => {
        const r = await fetch('/api/user');
        const j = await r.json();
        // /api/user rend un TABLEAU NU, la ou les autres routes enveloppent
        // dans { data } ou { users }. Lire j.users donnait undefined, donc une
        // liste vide, donc un garde-fou qui laissait tout passer sans rien
        // dire : c'est ainsi qu'un nom reel s'est retrouve dans une capture.
        const liste = Array.isArray(j) ? j : (j.users ?? j.data ?? []);
        return liste
            .filter((u) => u.firstName && u.lastName)
            .map((u) => [String(u.firstName).trim(), String(u.lastName).trim()]);
    })()`);

    const noms = new Set();
    for (const [prenom, nom] of paires ?? []) {
        if (prenom.length + nom.length < 5) continue;
        noms.add(`${prenom} ${nom}`);
        noms.add(`${nom} ${prenom}`);
    }
    // Les plus longs d'abord : « Daniel CHAVANCE BLESSIG » doit partir avant
    // qu'un fragment plus court n'en emporte la moitie.
    NOMS_REELS = [...noms].sort((a, b) => b.length - a.length);

    // Une liste vide n'est PAS une base sans membres : c'est une reponse qu'on
    // a mal lue. Un garde-fou qui ne garde rien est pire que pas de garde-fou,
    // parce qu'il rassure — on ne repart donc pas du tout dans ce cas.
    if (NOMS_REELS.length < 10) {
        throw new Error(
            `liste des membres quasi vide (${NOMS_REELS.length}) : le masquage des noms ne peut pas etre verifie`,
        );
    }
    return NOMS_REELS.length;
}

async function anonymiser(pseudonymes = []) {
    const restes = await evaluate(`(() => {
        const NOMS = ${JSON.stringify(NOMS_FICTIFS)};
        const REELS = ${JSON.stringify(NOMS_REELS)};

        // Meme chaine -> meme pseudonyme, pour toute la session.
        const memoire = (window.__pseudos ||= new Map());
        const pseudo = (brut) => {
            if (!memoire.has(brut)) memoire.set(brut, NOMS[memoire.size % NOMS.length]);
            return memoire.get(brut);
        };

        const COURRIEL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/g;
        const TELEPHONE = /\\b0[1-9](?:[ .\\-]?\\d{2}){4}\\b/g;
        const VOIE = /\\b\\d{1,4}\\s*(?:bis|ter)?\\s*(?:rue|avenue|av|boulevard|bd|impasse|chemin|all[ée]e|place|route|r[ée]sidence|quai|square|villa|cours)\\b[^,;\\n]*/gi;
        const CODE_POSTAL = /\\b\\d{5}\\s+[A-ZÀ-Ý][A-Za-zÀ-ÿ\\- ]{2,}/g;

        // Les noms declares par la spec, remplaces entiers : un patronyme n'a
        // pas de forme reconnaissable, seul son emplacement le designe.
        for (const selecteur of ${JSON.stringify(pseudonymes)}) {
            for (const el of document.querySelectorAll(selecteur)) {
                const brut = el.textContent.trim();
                if (brut) el.textContent = pseudo(brut);
            }
        }

        // Puis les formes reglees, sur les seuls noeuds de texte : passer par
        // innerHTML reecrirait le balisage et casserait la mise en page.
        const parcours = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const noeuds = [];
        while (parcours.nextNode()) noeuds.push(parcours.currentNode);
        for (const noeud of noeuds) {
            const avant = noeud.nodeValue;
            if (!avant || !avant.trim()) continue;
            let apres = avant
                .replace(COURRIEL, (m) => pseudo(m).toLowerCase().replace(/ /g, '.')
                    .normalize('NFD').replace(/[\\u0300-\\u036f]/g, '') + '@exemple.fr')
                .replace(TELEPHONE, '01 23 45 67 89')
                .replace(VOIE, '12 rue des Lilas')
                .replace(CODE_POSTAL, '57000 EXEMPLEVILLE');

            // Les noms reels, par correspondance exacte contre la liste des
            // membres — aucune heuristique, donc aucun faux positif sur un
            // titre du catalogue.
            for (const reel of REELS) {
                if (apres.includes(reel)) apres = apres.split(reel).join(pseudo(reel));
            }
            if (apres !== avant) noeud.nodeValue = apres;
        }

        /**
         * Rattrapage : les noms COUPES entre deux elements.
         *
         * « Prenom » dans un span et « NOM » dans le suivant, et aucun noeud de
         * texte ne porte le nom entier : la passe ci-dessus ne voit rien, alors
         * que la page, elle, l'affiche bien. C'est exactement ce que le
         * garde-fou a rattrape sur la fiche d'une attribution.
         *
         * On cherche donc le PLUS PETIT element dont le texte contient le nom,
         * et on remplace son contenu. Ecraser le balisage interne n'a pas
         * d'importance ici : ce qu'il portait, c'etait le nom.
         */
        const restant = () => REELS.filter((r) => document.body.innerText.includes(r));
        for (const reel of restant()) {
            // On descend par innerText, PAS par textContent. « Agnes Blanc »
            // s'affiche en deux elements voisins : l'espace qui les separe
            // vient du rendu, pas du texte. textContent rend donc
            // « AgnesBlanc » et ne trouve jamais le nom qu'on voit a l'ecran.
            let element = document.body;
            for (;;) {
                const enfant = [...element.children].find((e) => e.innerText?.includes(reel));
                if (!enfant) break;
                element = enfant;
            }
            if (element !== document.body) element.textContent = pseudo(reel);
        }

        // Garde-fou : ce qui ressemble encore a une donnee personnelle apres
        // le passage. Mieux vaut manquer une capture que la publier.
        const texte = document.body.innerText;
        const restes = [];
        if (/[A-Za-z0-9._%+-]+@(?!exemple\\.fr)[A-Za-z0-9.-]+\\.[A-Za-z]{2,}/.test(texte)) restes.push('courriel');
        if (/\\b0[1-9](?:[ .\\-]?\\d{2}){4}\\b/.test(texte.replace(/01 23 45 67 89/g, ''))) restes.push('téléphone');
        // Un nom de membre encore lisible : la capture est refusee. On ne dit
        // que le NOMBRE — ce script n'imprime jamais la donnee qu'il protege.
        const noms = REELS.filter((r) => texte.includes(r)).length;
        if (noms) restes.push(noms + ' nom(s) de membre');
        return restes;
    })()`);

    if (restes.length) {
        throw new Error(`donnée personnelle encore visible (${restes.join(', ')})`);
    }
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
        const combien = await chargerNomsReels();
        console.log(`Connecté. ${combien} noms de membres à masquer. ${specs.length} capture(s) à prendre.\n`);

        for (const spec of specs) {
            try {
                /**
                 * Une fenetre plus haute pour les modales qui depassent.
                 *
                 * La modale d'une facture mesure plus que les 900 px de la
                 * fenetre : « Imprimer la facture » en haut et « Supprimer la
                 * facture » en bas ne tenaient pas dans la meme image, et les
                 * reperes qui les visaient tombaient hors cadrage. Plutot que
                 * de couper le guide en deux captures qui se repondent mal, on
                 * agrandit la fenetre le temps de la photo.
                 */
                await send('Emulation.setDeviceMetricsOverride', {
                    width: spec.viewport?.width ?? VIEWPORT.width,
                    height: spec.viewport?.height ?? VIEWPORT.height,
                    deviceScaleFactor: 1,
                    mobile: false,
                });
                await goto(BASE + spec.url);
                if (spec.waitFor) await waitFor(spec.waitFor);
                await sleep(spec.sleep ?? 600);
                for (const step of spec.steps ?? []) {
                    if (step.clickText) await clickText(step.clickText);
                    if (step.clickExact) await clickText(step.clickExact, true);
                    if (step.clickSelector) await clickSelector(step.clickSelector);
                    if (step.typeIn) await typeIn(step.typeIn.selector, step.typeIn.value);
                    if (step.scrollToText) await scrollToText(step.scrollToText);
                    if (step.searchFor) await searchFor(step.searchFor);
                    if (step.waitFor) await waitFor(step.waitFor);
                    if (step.sleep) await sleep(step.sleep);
                }
                await forcerThemeClair();
                await sleep(300);
                // Juste avant la photo : apres toute la navigation, donc plus
                // rien ne peut recharger de vraies donnees par-dessus.
                await anonymiser(spec.pseudonymes ?? []);
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
