import type { Metadata } from "next";
import { Geist, Geist_Mono, Scheherazade_New } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const arabicFont = Scheherazade_New({
  weight: ["400", "700"],
  subsets: ["arabic"],
  variable: "--font-arabic",
});

export const metadata: Metadata = {
  title: "Rehnama - Live Quran Understanding",
  description: "Understand the Quran live in multiple languages (English, Urdu, Kashmiri).",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${arabicFont.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
