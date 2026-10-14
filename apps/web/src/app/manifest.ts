import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
    return {
        name: 'Bike Log',
        short_name: 'Bike Log',
        start_url: '/',
        display: 'standalone',
        background_color: '#f7f8f5',
        theme_color: '#345b43',
        icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
            { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    };
}
