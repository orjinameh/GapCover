import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gap Cover",
  description: "Parametric cover for the weekend gap on tokenized stocks. Base Sepolia testnet only.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
