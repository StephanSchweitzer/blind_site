'use client';

import React, { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { Pause, Play, RotateCcw, RotateCw } from 'lucide-react';

interface AudioPlayerProps {
    src: string;
    title: string;
}

/**
 * Le lecteur de la liste de livres enregistrée.
 *
 * Pas les contrôles natifs de <audio> : ils changent d'un navigateur à
 * l'autre, sont annoncés en anglais par certains lecteurs d'écran, et n'ont
 * ni vitesse ni saut de quelques secondes — or nos auditeurs écoutent souvent
 * accélérés (1,5 ou 2 ×) et reviennent sur un titre mal entendu. Ici tout est
 * en boutons, curseur et liste déroulante natifs, libellés en français.
 */

const SAUT_SECONDES = 15;
const VITESSES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const VITESSE_STORAGE_KEY = 'eca-vitesse-audio';

function lireVitesse(): number | null {
    try {
        const v = Number(localStorage.getItem(VITESSE_STORAGE_KEY));
        return VITESSES.includes(v) ? v : null;
    } catch {
        return null;
    }
}

function garderVitesse(v: number) {
    try {
        localStorage.setItem(VITESSE_STORAGE_KEY, String(v));
    } catch {
        // Vitesse gardée pour cette écoute seulement.
    }
}

/** « 2:05 », « 1:02:05 » — pour l'œil. */
function horloge(total: number): string {
    const s = Math.max(0, Math.floor(total));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = String(s % 60).padStart(2, '0');
    return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

/** « 2 minutes 5 secondes » — pour l'oreille : « 2:05 » se lit mal. */
function enToutesLettres(total: number): string {
    const s = Math.max(0, Math.floor(total));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const parts = [];
    if (h) parts.push(`${h} heure${h > 1 ? 's' : ''}`);
    if (m) parts.push(`${m} minute${m > 1 ? 's' : ''}`);
    if (sec || !parts.length) parts.push(`${sec} seconde${sec > 1 ? 's' : ''}`);
    return parts.join(' ');
}

const vitesseLabel = (v: number) => `${String(v).replace('.', ',')} ×${v === 1 ? ' (normale)' : ''}`;

const EVENEMENTS = ['timeupdate', 'durationchange', 'loadedmetadata', 'play', 'pause', 'ended', 'ratechange', 'error', 'emptied'];

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ src, title }) => {
    // L'élément deux fois : en état pour LIRE la lecture pendant le rendu (ce
    // qu'une ref interdit), en ref pour AGIR dessus dans les gestionnaires
    // (ce qu'une valeur d'état interdit). La ref de rappel pose les deux.
    const [audio, setAudio] = useState<HTMLAudioElement | null>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const attacher = useCallback((el: HTMLAudioElement | null) => {
        audioRef.current = el;
        setAudio(el);
    }, []);
    const id = useId();

    /**
     * L'état se lit sur l'élément <audio> lui-même plutôt que d'être recopié
     * au fil de ses événements : rendu côté serveur, il commence à charger
     * avant l'hydratation, et un `loadedmetadata` tombé avant elle serait
     * perdu. L'abonnement relit l'élément au montage, donc rien ne manque.
     */
    const subscribe = useCallback((notify: () => void) => {
        if (!audio) return () => {};
        EVENEMENTS.forEach((e) => audio.addEventListener(e, notify));
        return () => EVENEMENTS.forEach((e) => audio.removeEventListener(e, notify));
    }, [audio]);
    const lire = <T,>(read: (a: HTMLAudioElement) => T, fallback: T) => () =>
        audio ? read(audio) : fallback;

    const position = useSyncExternalStore(subscribe, lire((a) => Math.floor(a.currentTime), 0), () => 0);
    const duree = useSyncExternalStore(
        subscribe,
        lire((a) => (Number.isFinite(a.duration) ? Math.floor(a.duration) : 0), 0),
        () => 0,
    );
    const enPause = useSyncExternalStore(subscribe, lire((a) => a.paused, true), () => true);
    const vitesse = useSyncExternalStore(subscribe, lire((a) => a.playbackRate, 1), () => 1);
    const enErreur = useSyncExternalStore(subscribe, lire((a) => a.error !== null, false), () => false);

    // La vitesse choisie la dernière fois. `defaultPlaybackRate` aussi : un
    // nouveau chargement de la source ramène la vitesse à celle-là.
    useEffect(() => {
        const el = audioRef.current;
        const v = lireVitesse();
        if (el && v) {
            el.defaultPlaybackRate = v;
            el.playbackRate = v;
        }
        // Une page quittée peut rester montée, cachée (Activity) : l'écoute ne
        // doit pas la suivre sur la page suivante.
        return () => el?.pause();
    }, [audio]);

    /**
     * Tant que le curseur a le focus, sa valeur ne suit pas la lecture : les
     * lecteurs d'écran annoncent chaque changement de valeur de l'élément
     * focalisé, soit une annonce par seconde par-dessus l'enregistrement.
     * L'horloge visible, elle, continue d'avancer.
     */
    const [valeurTenue, setValeurTenue] = useState<number | null>(null);
    const valeurCurseur = valeurTenue ?? position;

    const allerA = (secondes: number) => {
        const el = audioRef.current;
        if (!el || !duree) return;
        const cible = Math.min(Math.max(0, secondes), duree);
        el.currentTime = cible;
        if (valeurTenue !== null) setValeurTenue(Math.floor(cible));
    };

    const basculer = () => {
        const el = audioRef.current;
        if (!el) return;
        if (el.paused) {
            el.play().catch(() => {
                // L'erreur de chargement est déjà signalée par `enErreur`.
            });
        } else {
            el.pause();
        }
    };

    const changerVitesse = (v: number) => {
        const el = audioRef.current;
        if (!el) return;
        el.defaultPlaybackRate = v;
        el.playbackRate = v;
        garderVitesse(v);
    };

    // Flèches : 5 s ; Page préc./suiv. : 1 min — le pas natif d'un curseur
    // d'une seconde rendrait une écoute de vingt minutes interminable à parcourir.
    const onCurseurKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        const pas: Record<string, number> = {
            ArrowLeft: -5, ArrowDown: -5, ArrowRight: 5, ArrowUp: 5, PageDown: -60, PageUp: 60,
        };
        if (e.key in pas) allerA(valeurCurseur + pas[e.key]);
        else if (e.key === 'Home') allerA(0);
        else if (e.key === 'End') allerA(duree);
        else return;
        e.preventDefault();
    };

    // Deux jeux de couleurs séparés plutôt qu'un de base surchargé : entre
    // deux classes Tailwind en conflit, c'est l'ordre de la feuille de style
    // qui l'emporte, pas celui de l'attribut.
    const forme =
        'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border-2 px-3 text-sm font-semibold disabled:opacity-50';
    const bouton = `${forme} border-gray-400 bg-white text-gray-900 hover:bg-gray-100 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700`;
    // min-w-24 sur téléphone : à 375 px, les trois boutons tiennent sur une ligne.
    const boutonPrincipal = `${forme} min-w-24 sm:min-w-32 border-blue-700 bg-blue-700 text-white hover:bg-blue-800 dark:border-blue-300 dark:bg-blue-300 dark:text-gray-950 dark:hover:bg-blue-200`;

    return (
        <div className="my-4" role="group" aria-labelledby={`${id}-titre`}>
            {/* text-gray-300 was unreadable on the light theme's near-white card
                (about 1.5:1); the label also needs to be French, since it is the
                only description of what the player plays (RGAA 3.2). */}
            <div id={`${id}-titre`} className="mb-3 text-sm text-gray-700 dark:text-gray-300">
                Version audio : {title}
            </div>

            <audio ref={attacher} src={src} preload="metadata" />

            {enErreur ? (
                <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
                    L&apos;enregistrement n&apos;a pas pu être chargé. Rechargez la page pour réessayer.
                </p>
            ) : (
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            className={bouton}
                            onClick={() => allerA(position - SAUT_SECONDES)}
                            disabled={!duree}
                            aria-label={`Reculer de ${SAUT_SECONDES} secondes`}
                        >
                            <RotateCcw aria-hidden="true" className="h-4 w-4" />
                            <span aria-hidden="true">{SAUT_SECONDES} s</span>
                        </button>
                        <button
                            type="button"
                            className={boutonPrincipal}
                            onClick={basculer}
                        >
                            {enPause ? <Play aria-hidden="true" className="h-5 w-5" /> : <Pause aria-hidden="true" className="h-5 w-5" />}
                            {enPause ? 'Écouter' : 'Pause'}
                        </button>
                        <button
                            type="button"
                            className={bouton}
                            onClick={() => allerA(position + SAUT_SECONDES)}
                            disabled={!duree}
                            aria-label={`Avancer de ${SAUT_SECONDES} secondes`}
                        >
                            <span aria-hidden="true">{SAUT_SECONDES} s</span>
                            <RotateCw aria-hidden="true" className="h-4 w-4" />
                        </button>

                        <label className="ml-auto flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                            Vitesse
                            <select
                                value={vitesse}
                                onChange={(e) => changerVitesse(Number(e.target.value))}
                                className="min-h-11 rounded-lg border-2 border-gray-400 bg-white px-2 text-sm text-gray-900 dark:border-gray-500 dark:bg-gray-800 dark:text-gray-100"
                            >
                                {VITESSES.map((v) => (
                                    <option key={v} value={v}>
                                        {vitesseLabel(v)}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <div className="flex items-center gap-3">
                        <input
                            type="range"
                            min={0}
                            max={duree || 0}
                            step={1}
                            value={Math.min(valeurCurseur, duree)}
                            disabled={!duree}
                            onChange={(e) => allerA(Number(e.target.value))}
                            onKeyDown={onCurseurKeyDown}
                            onFocus={() => setValeurTenue(position)}
                            onBlur={() => setValeurTenue(null)}
                            aria-label="Position dans l'enregistrement"
                            aria-valuetext={
                                duree
                                    ? `${enToutesLettres(valeurCurseur)} sur ${enToutesLettres(duree)}`
                                    : 'Chargement'
                            }
                            className="h-2 flex-1 cursor-pointer accent-blue-700 dark:accent-blue-400"
                        />
                        <span className="shrink-0 text-sm tabular-nums text-gray-800 dark:text-gray-200">
                            {horloge(position)} / {duree ? horloge(duree) : '–:––'}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
