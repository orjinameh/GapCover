import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppProvider } from "@/components/state";
import Shell from "@/components/Shell";

export const metadata: Metadata = {
  title: "Gap Cover",
  description: "Cover for the weekend gap on tokenized stocks. Base Sepolia testnet.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b0b0c" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <Shell>{children}</Shell>
        </AppProvider>
      </body>
    </html>
  );
}
