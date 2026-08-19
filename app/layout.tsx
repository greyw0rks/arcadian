import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arcadian — DeFi Risk Score Miner",
  description: "A Telegraph Miner providing verifiable DeFi protocol risk scores (0-100) sourced from live DefiLlama data.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
