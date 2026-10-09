'use client';
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../lib/query';
import { Workspace } from '../features/garage/Workspace';
import type { AccessIssue } from './SessionExpired';

export function HomeClient({ authenticated = false }: { identity?: string; authenticated?: boolean }) {
    const [issue, setIssue] = useState<AccessIssue | null>(null);
    const [client] = useState(() => createQueryClient(setIssue));
    return <QueryClientProvider client={client}><Workspace authenticated={authenticated} accessIssue={issue} onAccessIssue={setIssue} /></QueryClientProvider>;
}
