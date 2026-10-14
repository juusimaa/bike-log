import type { Metadata, Viewport } from 'next';
import './globals.css';
export const metadata: Metadata = {
    title: 'Bike Log',
    description: 'Track component history, ride mileage and maintenance for every bike.',
};
export const viewport: Viewport = {
    themeColor: '#345b43',
};
export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
