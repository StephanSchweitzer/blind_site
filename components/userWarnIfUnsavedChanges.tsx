import { useEffect, useCallback, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { NavigateOptions } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface WarnIfUnsavedChangesProps {
    unsaved: boolean;
    message?: string;
}

const DEFAULT_MESSAGE = 'Vous avez des modifications non enregistrées. Êtes-vous sûr de vouloir quitter ?';

export const useWarnIfUnsavedChanges = ({
                                            unsaved,
                                            message = DEFAULT_MESSAGE
                                        }: WarnIfUnsavedChangesProps) => {
    const router = useRouter();
    const [showDialog, setShowDialog] = useState(false);
    const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

    // Use refs to track internal state that shouldn't trigger re-renders
    const isNavigatingRef = useRef(false);
    const actualUnsavedState = useRef(unsaved);

    // Keep the ref in sync with the prop
    useEffect(() => {
        actualUnsavedState.current = unsaved;
    }, [unsaved]);

    const temporarilyDisableWarnings = useCallback((callback: () => void) => {
        if (!actualUnsavedState.current) {
            // If nothing is unsaved, just navigate normally
            callback();
            return;
        }

        // Set the navigating flag to prevent warnings
        isNavigatingRef.current = true;

        // Remove the beforeunload handler temporarily
        const originalBeforeUnload = window.onbeforeunload;
        window.onbeforeunload = null;

        // Execute the navigation with a small delay to ensure handlers are removed
        setTimeout(() => {
            try {
                callback();
            } finally {
                // Reset after a short delay to allow navigation to complete
                setTimeout(() => {
                    isNavigatingRef.current = false;
                    // Only restore the handler if we still have unsaved changes
                    if (actualUnsavedState.current) {
                        window.onbeforeunload = originalBeforeUnload;
                    }
                }, 100);
            }
        }, 0);
    }, []);

    const showConfirmDialog = (onConfirm: () => void) => {
        setPendingNavigation(() => onConfirm);
        setShowDialog(true);
    };

    const handleAnchorClick = useCallback((e: Event) => {
        if (isNavigatingRef.current) return;

        const mouseEvent = e as MouseEvent;
        if (mouseEvent.button !== 0) return;

        const target = e.currentTarget as HTMLAnchorElement;
        const targetUrl = target.href;
        const currentUrl = window.location.href;

        if (targetUrl !== currentUrl && actualUnsavedState.current) {
            e.preventDefault();
            showConfirmDialog(() => {
                temporarilyDisableWarnings(() => {
                    window.location.href = targetUrl;
                });
            });
        }
    }, [temporarilyDisableWarnings]);

    const addAnchorListeners = useCallback(() => {
        const anchorElements = document.querySelectorAll<HTMLAnchorElement>('a[href]');
        anchorElements.forEach((anchor) => {
            anchor.addEventListener('click', handleAnchorClick);
        });
    }, [handleAnchorClick]);

    useEffect(() => {
        const mutationObserver = new MutationObserver(addAnchorListeners);
        mutationObserver.observe(document.body, { childList: true, subtree: true });
        addAnchorListeners();

        return () => {
            mutationObserver.disconnect();
            const anchorElements = document.querySelectorAll<HTMLAnchorElement>('a[href]');
            anchorElements.forEach((anchor) => {
                anchor.removeEventListener('click', handleAnchorClick);
            });
        };
    }, [addAnchorListeners, handleAnchorClick]);

    useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
            if (actualUnsavedState.current && !isNavigatingRef.current) {
                e.preventDefault();
                showConfirmDialog(() => {
                    temporarilyDisableWarnings(() => {
                        window.history.back();
                    });
                });
                // Prevent the immediate navigation
                window.history.pushState(null, '', window.location.href);
            }
        };

        window.addEventListener('popstate', handlePopState);

        // Only set the beforeunload handler if we have unsaved changes
        if (unsaved) {
            window.onbeforeunload = (e) => {
                // Skip the warning if we're in confirmed navigation
                if (isNavigatingRef.current) {
                    return undefined;
                }

                const frenchMessage = 'Vous avez des modifications non enregistrées. Êtes-vous sûr de vouloir quitter ?';
                e.preventDefault();
                e.returnValue = frenchMessage;
                return frenchMessage;
            };
        } else {
            window.onbeforeunload = null;
        }

        return () => {
            window.removeEventListener('popstate', handlePopState);
            window.onbeforeunload = null;
        };
    }, [unsaved, temporarilyDisableWarnings]);

    const navigateWithoutWarning = useCallback((url: string, options?: NavigateOptions) => {
        temporarilyDisableWarnings(() => {
            router.push(url, options);
        });
    }, [router, temporarilyDisableWarnings]);

    useEffect(() => {
        const originalPush = router.push.bind(router);

        const wrappedPush = (url: string, options?: NavigateOptions) => {
            if (actualUnsavedState.current && !isNavigatingRef.current) {
                showConfirmDialog(() => {
                    temporarilyDisableWarnings(() => {
                        originalPush(url, options);
                    });
                });
            } else {
                originalPush(url, options);
            }
        };

        router.push = wrappedPush;

        return () => {
            router.push = originalPush;
        };
    }, [router, temporarilyDisableWarnings]);

    const NavigationWarningDialog = () => (
        <AlertDialog open={showDialog} onOpenChange={(open) => {
            if (!open) {
                setPendingNavigation(null);
            }
            setShowDialog(open);
        }}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Modifications non enregistrées</AlertDialogTitle>
                    <AlertDialogDescription className="whitespace-pre-line">
                        {message}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                        if (pendingNavigation) {
                            temporarilyDisableWarnings(pendingNavigation);
                        }
                        setShowDialog(false);
                    }}>
                        Continuer
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );

    return { navigateWithoutWarning, NavigationWarningDialog };
};