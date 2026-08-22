import { api, ApiError } from '@/lib/api.js';
import { Permissions } from '@/components/Permissions.js';
import { Alert } from '@/components/Icons.js';
import { planPermissions, applyPermissions, undoPermissions } from '../actions.js';

export default async function PermissionsPage({ params }) {
  const { guildId } = await params;

  let meta, channels, presets, history;
  try {
    [meta, channels, presets, history] = await Promise.all([
      api.getMeta(guildId),
      api.getAllChannels(guildId),
      api.getPresets(),
      api.getPermissionHistory(guildId),
    ]);
  } catch (err) {
    return (
      <>
        <div className="page-head">
          <h1>Rechte</h1>
        </div>
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>{err instanceof ApiError ? err.message : 'Laden fehlgeschlagen.'}</div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Rechte</h1>
        <p>Kanalrechte gebündelt setzen, statt jeden Kanal einzeln durchzuklicken.</p>
      </div>
      <Permissions
        guildId={guildId}
        roles={meta.roles}
        channels={channels}
        presets={presets}
        history={history}
        planAction={planPermissions}
        applyAction={applyPermissions}
        undoAction={undoPermissions}
      />
    </>
  );
}
