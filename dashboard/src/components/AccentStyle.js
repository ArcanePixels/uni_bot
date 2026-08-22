/**
 * Setzt die Akzentfarbe des jeweiligen Servers.
 *
 * Bewusst als <style>-Element statt per JavaScript: So steht die Farbe schon
 * im ersten Seitenaufbau und es gibt kein sichtbares Umspringen von der
 * Standardfarbe auf die Serverfarbe.
 */
export function AccentStyle({ color }) {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return null;

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: `:root{--accent:${color};--accent-soft:color-mix(in srgb, ${color} 15%, transparent);}`,
      }}
    />
  );
}
