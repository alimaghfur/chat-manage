import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'WhatsApp Chat Manager',
  description: 'Professional WhatsApp Chat Management Application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-[#0B141A] antialiased">{children}</body>
    </html>
  );
}
