import "./globals.css";

export const metadata = {
  title: "Senarai Pesakit Drehab AF",
  description: "Rekod pesakit, statistik, komisen dan pakej rawatan.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ms">
      <body>{children}</body>
    </html>
  );
}
