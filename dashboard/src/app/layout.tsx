import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "o88 — DeepBook keeper & arbitrage operator",
  description:
    "Multi-product keeper & arbitrage operator for DeepBook on Sui. Captures opportunities across Predict, Margin, and Spot with Block Scholes oracle as the brain.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-black text-zinc-200 font-mono">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
