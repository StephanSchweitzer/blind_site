import { useEffect, useCallback, useState } from 'react';
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

    const showConfirmDialog = (onConfirm: () => void) => {
        setPendingNavigation(() => onConfirm);
        setShowDialog(true);
    };

    const handleAnchorClick = useCallback((e: Event) => {
        const mouseEvent = e as MouseEvent;
        if (mouseEvent.button !== 0) return;

        const target = e.currentTarget as HTMLAnchorElement;
        const targetUrl = target.href;
        const currentUrl = window.location.href;

        if (targetUrl !== currentUrl && unsaved) {
            e.preventDefault();
            showConfirmDialog(() => {
                window.location.href = targetUrl;
            });
        }
    }, [unsaved]);

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
            if (unsaved) {
                e.preventDefault();
                showConfirmDialog(() => {
                    window.history.back();
                });
                // Prevent the immediate navigation
                window.history.pushState(null, '', window.location.href);
            }
        };

        if (unsaved) {
            window.addEventListener('popstate', handlePopState);

            // For browser refresh and direct URL changes, we still need to use
            // the native dialog as browsers don't allow custom dialogs for security reasons
            window.onbeforeunload = (e) => {
                const frenchMessage = 'Vous avez des modifications non enregistrées. Êtes-vous sûr de vouloir quitter ?';
                e.preventDefault();
                e.returnValue = frenchMessage;
                return frenchMessage;
            };
        }

        return () => {
            window.removeEventListener('popstate', handlePopState);
            window.onbeforeunload = null;
        };
    }, [unsaved, message]);

    const navigateWithoutWarning = useCallback((url: string, options?: NavigateOptions) => {
        router.push(url, options);
    }, [router]);

    useEffect(() => {
        const originalPush = router.push.bind(router);

        const wrappedPush = (url: string, options?: NavigateOptions) => {
            if (unsaved) {
                showConfirmDialog(() => {
                    originalPush(url, options);
                });
            } else {
                originalPush(url, options);
            }
        };

        router.push = wrappedPush;

        return () => {
            router.push = originalPush;
        };
    }, [router, unsaved]);

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
                    <AlertDialogDescription>
                        {message}
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Annuler</AlertDialogCancel>
                    <AlertDialogAction onClick={() => {
                        if (pendingNavigation) {
                            pendingNavigation();
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