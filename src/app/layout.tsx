import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { AgentProvider } from "@/components/agent/AgentProvider";
import { AgentPanel } from "@/components/agent/AgentPanel";
import { AgentLauncher } from "@/components/agent/AgentLauncher";

const inter = Inter({ subsets: ["latin"] });

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
      <body className={`${inter.className} min-h-screen bg-background font-sans antialiased`} suppressHydrationWarning>
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
