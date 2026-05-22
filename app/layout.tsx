import type { Metadata } from "next";
import { Raleway } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";
const raleway = Raleway({
  subsets: ["latin"],
  variable: "--font-raleway",
});
export const metadata: Metadata = {
  title: "URUS Capital",
  description: "Plataforma de gestión inmobiliaria integral",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${raleway.variable} antialiased`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
