'use client';
import { useState } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createQueryClient } from '../lib/query';
import { Workspace } from '../features/garage/Workspace';
export default function Home() {
    const [client] = useState(createQueryClient);
    return (
        <QueryClientProvider client={client}>
            <Workspace />
        </QueryClientProvider>
    );
}
