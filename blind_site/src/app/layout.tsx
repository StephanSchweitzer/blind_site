// app/layout.tsx
import './globals.css';
import { Inter } from 'next/font/google';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
    title: 'Accessible Books',
    description: 'Find books that have been read to CD and sent to you.',
};

export default function RootLayout({
                                       children,
                                   }: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en" className={inter.className}>
        <body>
        <Providers>{children}</Providers>
        </body>
        </html>
    );
}
