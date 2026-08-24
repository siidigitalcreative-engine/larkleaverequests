import "./styles.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Approvals",
  description: "Submit and track employee requests for approval.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
