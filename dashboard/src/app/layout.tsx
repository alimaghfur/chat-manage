import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Chat Manager - Multi-Platform',
  description: 'Manage WhatsApp, Telegram, Instagram, & Messenger in one place',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-[#0B141A] text-[#E9EDEF] min-h-screen`}>
        {children}
      </body>
    </html>
  );
}
