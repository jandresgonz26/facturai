import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Toaster } from "@/components/ui/sonner";

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
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0"
          rel="stylesheet"
        />
      </head>
      <body className={`${inter.className} min-h-screen bg-background font-sans antialiased`} suppressHydrationWarning>
        <div className="flex min-h-screen overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col lg:ml-64 h-screen overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto px-6 py-8">
              <div className="max-w-[1600px] mx-auto">
                {children}
              </div>
            </main>
          </div>
        </div>
        <Toaster />
      </body>
    </html>
  );
}
