import { useEffect } from 'react';
/** Browsers own the warning text and require user interaction before prompting. */
export function useBeforeUnload(unresolved: boolean) {
    useEffect(() => {
        if (!unresolved) return;
        const guard = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', guard);
        return () => window.removeEventListener('beforeunload', guard);
    }, [unresolved]);
}
