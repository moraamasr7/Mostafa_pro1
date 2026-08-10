import type { Metadata } from "next";
import { Cairo } from "next/font/google";
import "./globals.css";

// استخدام خط Cairo عشان يدعم العربي بشكل جميل ومقروء
const cairoFont = Cairo({
  variable: "--font-cairo",
  subsets: ["arabic", "latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "مصطفى الجزار | المنيو",
  description:
    "منيو مطعم مصطفى الجزار — اطلب أحلى سندوتشات ولحوم واستلم من الفرع",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ar"
      dir="rtl"
      className={`${cairoFont.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-[family-name:var(--font-cairo)]">
        {children}
      </body>
    </html>
  );
}
