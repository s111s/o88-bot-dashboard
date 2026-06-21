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
  icons: {
    icon: "/logo-icon.svg",
    shortcut: "/logo-icon.svg",
  },
  openGraph: {
    title: "o88 — DeepBook Native Operator",
    description:
      "Settlement keeper · margin liquidator · flash-loan arb. Powered by Block Scholes SVI oracle. Live on Sui.",
    images: [{ url: "/logo.svg", width: 800, height: 200 }],
    url: "https://dashboard.o88.gg",
  },
  twitter: {
    card: "summary_large_image",
    title: "o88 — DeepBook Native Operator",
    description: "Settlement keeper · margin liquidator · flash-loan arb. Powered by Block Scholes SVI oracle.",
    images: ["/logo.svg"],
  },
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
