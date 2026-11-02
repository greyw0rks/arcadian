import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Arcadian — Pre-trade Risk Gate",
  description: "Inspect a proposed DeFi trade using intelligence purchased through Telegraph, with its evidence and spending ledger attached.",
};

export default function DeskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
