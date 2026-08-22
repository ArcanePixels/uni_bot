/** @type {import('next').NextConfig} */
export default {
  // Erzeugt ein schlankes, eigenstaendiges Bundle fuer das Docker-Image.
  output: 'standalone',
  // shared/ liegt ausserhalb von dashboard/ und muss mitkompiliert werden.
  transpilePackages: ['@allrounder/shared'],
  // Ausgabeverzeichnis ueberschreibbar - hilft, wenn ein haengender Prozess
  // unter Windows das Standardverzeichnis blockiert.
  distDir: process.env.NEXT_DIST_DIR || '.next',
};
