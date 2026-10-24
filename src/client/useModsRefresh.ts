import { useEffect, useRef } from 'react';
import { useServerWebsocketEvent } from '@pterodactyl/sdk';

const BURST_INTERVAL = 10_000;
const BURST_LENGTH = 18; // 3 minutes
const PENDING_INTERVAL = 20_000;

/**
 * Keeps the installed-mods status current without a page reload. The mod loader rewrites its
 * log while the server boots, which can take a minute or more after the panel says "running",
 * so after any power change look again every 10 seconds for 3 minutes, and keep looking every
 * 20 seconds while any mod still waits for a restart.
 */
export function useModsRefresh(refresh: () => void, pending: boolean): void {
    const burst = useRef<number | null>(null);
    const latest = useRef(refresh);
    latest.current = refresh;

    useServerWebsocketEvent('status', () => {
        if (burst.current !== null) {
            window.clearInterval(burst.current);
        }
        let ticks = 0;
        burst.current = window.setInterval(() => {
            latest.current();
            if (++ticks >= BURST_LENGTH && burst.current !== null) {
                window.clearInterval(burst.current);
                burst.current = null;
            }
        }, BURST_INTERVAL);
    });

    useEffect(() => {
        if (!pending) {
            return;
        }
        const timer = window.setInterval(() => latest.current(), PENDING_INTERVAL);
        return () => window.clearInterval(timer);
    }, [pending]);

    useEffect(
        () => () => {
            if (burst.current !== null) {
                window.clearInterval(burst.current);
            }
        },
        [],
    );
}
