import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Bid Extract Review",
  description: "Review extracted bid tabulation data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      style={{ "--font-sans": "var(--font-geist-sans)", "--font-mono": "var(--font-geist-mono)" } as React.CSSProperties}
    >
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-full flex flex-col font-sans`}>{children}</body>
    </html>
  );
}
