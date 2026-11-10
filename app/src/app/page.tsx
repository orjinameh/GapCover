import { AppProvider } from "@/components/state";
import TopBar from "@/components/TopBar";
import Hero from "@/components/Hero";
import Simulator from "@/components/Simulator";
import Desk from "@/components/Desk";

export default function Page() {
  return (
    <AppProvider>
      <main className="stagewrap">
        <TopBar />
        <Hero />
        <Simulator />
        <Desk />
        <footer className="foot meta">
          Gap Cover · Base Sepolia · built for the Base Stocks Maxxing hackathon · no claims of rights in any underlying company
        </footer>
      </main>
    </AppProvider>
  );
}
