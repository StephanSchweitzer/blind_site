"use client"

import * as React from "react"

import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * The app's replacement for `window.confirm()`. The native dialogue can't be
 * styled, shows the site's hostname as its title, and looked nothing like the
 * AlertDialogs used elsewhere — so every confirmation goes through this one.
 *
 *     const confirm = useConfirm();
 *     if (!(await confirm({ title: 'Supprimer ce genre ?', destructive: true }))) return;
 *
 * Resolves `true` on the action button, `false` on cancel, Escape or a click
 * outside. One dialogue at a time: asking again while one is open answers the
 * pending one `false`.
 *
 * `beforeunload` (closing the tab or reloading with unsaved work) still shows
 * the browser's own prompt — no page may replace that one.
 */
export type ConfirmOptions = {
    title: string
    /** Plain text keeps its line breaks (`\n`). */
    description?: React.ReactNode
    confirmLabel?: string
    cancelLabel?: string
    /** Red action button, for deletions and other gestures that lose data. */
    destructive?: boolean
    /**
     * Something to type before the action button unlocks — for the gestures
     * that cannot be undone, where one click on a confirmation is too little
     * (« Tout supprimer définitivement », a whole book's only copy). A number,
     * as in the audio editor's delete dialogues: it makes the reader look at
     * what they are about to lose, where a retyped name only trains pasting.
     */
    requireText?: { label: React.ReactNode; value: string }
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [pending, setPending] = React.useState<ConfirmOptions | null>(null)
    // Kept apart from `pending` so the content doesn't blank out during the
    // close animation.
    const [open, setOpen] = React.useState(false)
    const [typed, setTyped] = React.useState("")
    const resolveRef = React.useRef<((value: boolean) => void) | null>(null)

    const settle = React.useCallback((value: boolean) => {
        resolveRef.current?.(value)
        resolveRef.current = null
        setOpen(false)
    }, [])

    const confirm = React.useCallback<ConfirmFn>((options) => {
        resolveRef.current?.(false)
        return new Promise<boolean>((resolve) => {
            resolveRef.current = resolve
            setPending(options)
            setTyped("")
            setOpen(true)
        })
    }, [])

    const unlocked = !pending?.requireText || typed.trim() === pending.requireText.value

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}
            <AlertDialog open={open} onOpenChange={(next) => { if (!next) settle(false) }}>
                <AlertDialogContent className="bg-card border-border">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-foreground">
                            {pending?.title}
                        </AlertDialogTitle>
                        {pending?.description && (
                            <AlertDialogDescription className="text-muted-foreground whitespace-pre-line">
                                {pending.description}
                            </AlertDialogDescription>
                        )}
                    </AlertDialogHeader>
                    {pending?.requireText && (
                        <div className="space-y-1">
                            <label htmlFor="confirm-require-text" className="text-sm text-foreground">
                                {pending.requireText.label}
                            </label>
                            <Input
                                id="confirm-require-text"
                                value={typed}
                                onChange={(e) => setTyped(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && unlocked) {
                                        e.preventDefault()
                                        settle(true)
                                    }
                                }}
                                inputMode="numeric"
                                autoComplete="off"
                                className="bg-field border-border text-foreground"
                            />
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {pending?.cancelLabel ?? "Annuler"}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => settle(true)}
                            disabled={!unlocked}
                            className={cn(
                                pending?.destructive &&
                                    "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            )}
                        >
                            {pending?.confirmLabel ?? "Confirmer"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmContext.Provider>
    )
}

export function useConfirm(): ConfirmFn {
    const confirm = React.useContext(ConfirmContext)
    if (!confirm) throw new Error("useConfirm must be used inside <ConfirmProvider>")
    return confirm
}
