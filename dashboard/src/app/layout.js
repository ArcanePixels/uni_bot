import './globals.css';

export const metadata = {
  title: 'Discord Allrounder',
  description: 'Verwaltung für den Discord Allrounder Bot',
};

export default function RootLayout({ children }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
