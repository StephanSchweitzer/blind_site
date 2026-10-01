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
}

type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = React.createContext<ConfirmFn | null>(null)

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
    const [pending, setPending] = React.useState<ConfirmOptions | null>(null)
    // Kept apart from `pending` so the content doesn't blank out during the
    // close animation.
    const [open, setOpen] = React.useState(false)
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
            setOpen(true)
        })
    }, [])

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
                    <AlertDialogFooter>
                        <AlertDialogCancel>
                            {pending?.cancelLabel ?? "Annuler"}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => settle(true)}
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
