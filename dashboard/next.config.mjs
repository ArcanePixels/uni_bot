/** @type {import('next').NextConfig} */
export default {
  // Erzeugt ein schlankes, eigenstaendiges Bundle fuer das Docker-Image.
  output: 'standalone',
  // shared/ liegt ausserhalb von dashboard/ und muss mitkompiliert werden.
  transpilePackages: ['@allrounder/shared'],
  // Ausgabeverzeichnis ueberschreibbar - hilft, wenn ein haengender Prozess
  // unter Windows das Standardverzeichnis blockiert.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // `next dev` legt sonst bei jedem Start AGENTS.md und CLAUDE.md im
  // dashboard/-Ordner an. Die Anleitung fuer dieses Vorhaben steht in der
  // CLAUDE.md im Wurzelverzeichnis - zwei weitere Dateien stiften nur Unruhe
  // im Diff.
  agentRules: false,
};
