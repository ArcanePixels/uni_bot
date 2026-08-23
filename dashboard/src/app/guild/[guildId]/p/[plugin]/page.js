import { notFound } from 'next/navigation';
import { api, ApiError } from '@/lib/api.js';
import { PluginPage } from '@/components/PluginPage.js';
import { Alert } from '@/components/Icons.js';
import {
  savePluginConfig,
  addPluginItem,
  updatePluginItem,
  deletePluginItem,
  movePluginItem,
  runPluginAction,
} from '../../actions.js';

/**
 * Eine Seite fuer alle Plugins.
 *
 * Der Plugin-Name steht im Pfad, die Oberflaeche kommt als Beschreibung aus dem
 * Manifest. Deshalb kommt hier bei einem neuen Plugin nichts dazu - und deshalb
 * muss niemand das Dashboard neu bauen, um ein Plugin zu sehen.
 */
export default async function DynamischePluginSeite({ params }) {
  const { guildId, plugin } = await params;

  let daten, meta;
  try {
    [daten, meta] = await Promise.all([api.getPluginData(guildId, plugin), api.getMeta(guildId)]);
  } catch (err) {
    // Ein Plugin, das es nicht gibt, ist keine Fehlermeldung wert - das ist
    // schlicht eine unbekannte Seite.
    if (err instanceof ApiError && err.status === 404) notFound();
    return (
      <>
        <div className="page-head">
          <h1>Plugin</h1>
        </div>
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>{err instanceof ApiError ? err.message : 'Laden fehlgeschlagen.'}</div>
        </div>
      </>
    );
  }

  const manifest = daten.manifest;

  return (
    <>
      <div className="page-head">
        <h1>{manifest.label}</h1>
        {manifest.description && <p>{manifest.description}</p>}
      </div>
      <PluginPage
        manifest={manifest}
        guildId={guildId}
        config={daten.config}
        lists={daten.lists}
        rechte={daten.rechte}
        letzterLauf={daten.letzterLauf}
        meta={meta}
        actions={{
          saveConfig: savePluginConfig,
          addItem: addPluginItem,
          updateItem: updatePluginItem,
          deleteItem: deletePluginItem,
          moveItem: movePluginItem,
          runAction: runPluginAction,
        }}
      />
    </>
  );
}
