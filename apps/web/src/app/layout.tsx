import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
    title: 'Bike Log',
    description: 'Local bicycle maintenance tracker',
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
