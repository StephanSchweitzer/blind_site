/**
 * Vérifie que chaque `<AideLink section="…" anchor="…">` de l'application
 * pointe vers une section — et une ancre — qui existent vraiment.
 *
 * La dérive de la prose ne se détecte pas mécaniquement ; celle des LIENS, si.
 * Un bouton « Aide » cassé ne se voit pas : il ouvre une page vide, et personne
 * ne le signale. Ce script le transforme en échec bruyant.
 *
 * Usage : pnpm aide:check
 */
import fs from 'fs';
import path from 'path';

import { getAideSection, listAideSections } from '../lib/aide';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components'];
const EXTENSIONS = new Set(['.tsx', '.ts']);

interface Usage {
    file: string;
    line: number;
    section: string;
    anchor?: string;
}

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
            walk(full, out);
        } else if (EXTENSIONS.has(path.extname(entry.name))) {
            out.push(full);
        }
    }
    return out;
}

function findUsages(): Usage[] {
    const usages: Usage[] = [];
    for (const dir of SCAN_DIRS) {
        const abs = path.join(ROOT, dir);
        if (!fs.existsSync(abs)) continue;

        for (const file of walk(abs)) {
            const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
            lines.forEach((line, i) => {
                // Une balise par ligne : c'est ainsi qu'elles sont écrites, et un
                // vrai parseur JSX serait hors de proportion pour ce contrôle.
                if (!line.includes('<AideLink')) return;
                const section = /section=["']([^"']+)["']/.exec(line)?.[1];
                if (!section) return;
                const anchor = /anchor=["']([^"']+)["']/.exec(line)?.[1];
                usages.push({
                    file: path.relative(ROOT, file),
                    line: i + 1,
                    section,
                    ...(anchor ? { anchor } : {}),
                });
            });
        }
    }
    return usages;
}

function main(): void {
    const sections = listAideSections();
    const known = new Set(sections.map((s) => s.slug));
    const usages = findUsages();
    const problems: string[] = [];

    for (const usage of usages) {
        if (!known.has(usage.section)) {
            problems.push(
                `${usage.file}:${usage.line} — section « ${usage.section} » introuvable dans content/aide/`
            );
            continue;
        }
        if (usage.anchor) {
            const section = getAideSection(usage.section);
            const anchors = new Set(section?.headings.map((h) => h.id) ?? []);
            if (!anchors.has(usage.anchor)) {
                problems.push(
                    `${usage.file}:${usage.line} — ancre « #${usage.anchor} » absente de ${usage.section}.md ` +
                    `(disponibles : ${[...anchors].join(', ') || 'aucune'})`
                );
            }
        }
    }

    // L'inverse vaut d'être signalé sans être une erreur : une section que
    // personne ne référence est une aide que personne ne trouvera depuis
    // l'application. Elle reste atteignable par le sommaire.
    const referenced = new Set(usages.map((u) => u.section));
    const unreferenced = sections.filter((s) => !referenced.has(s.slug));

    console.log(`${usages.length} lien(s) « Aide » pour ${sections.length} section(s).`);
    if (unreferenced.length) {
        console.log(
            `Sections sans bouton « Aide » (accessibles par le sommaire) : ${unreferenced
                .map((s) => s.slug)
                .join(', ')}`
        );
    }

    if (problems.length) {
        console.error(`\n${problems.length} lien(s) cassé(s) :`);
        for (const problem of problems) console.error(`  ${problem}`);
        process.exit(1);
    }

    console.log('Tous les liens « Aide » résolvent.');
}

main();
