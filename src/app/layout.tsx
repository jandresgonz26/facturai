import type { Metadata } from "next";
import { Inter, Instrument_Serif } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AgentProvider } from "@/components/agent/AgentProvider";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { AgentLauncher } from "@/components/agent/AgentLauncher";

const inter = Inter({ subsets: ["latin"] });

/**
 * Tipografía de display, solo para piezas destacadas como el saludo del día.
 * El contraste con Inter es deliberado: da un aire editorial que un peso más
 * de la misma fuente no consigue.
 */
const displaySerif = Instrument_Serif({
    subsets: ["latin"],
    weight: "400",
    style: ["normal", "italic"],
    variable: "--font-display",
});

export const metadata: Metadata = {
  title: "MicroBill",
  description: "Executive billing dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${inter.className} ${displaySerif.variable} min-h-screen bg-background font-sans antialiased`} suppressHydrationWarning>
        <ThemeProvider>
          <AgentProvider>
            <div className="flex min-h-screen overflow-hidden">
              <Sidebar />
              <div className="flex-1 min-w-0 flex flex-col lg:ml-64 h-screen overflow-hidden">
                <Header />
                <main className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-8">
                  <div className="max-w-[1600px] mx-auto">
                    {children}
                  </div>
                </main>
              </div>
            </div>
            <AgentPanel />
            <AgentLauncher />
            <Toaster />
          </AgentProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
