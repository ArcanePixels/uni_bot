import { api, ApiError } from '@/lib/api.js';
import { Wizard } from '@/components/Wizard.js';
import { Alert } from '@/components/Icons.js';
import {
  createInterest,
  updateInterest,
  deleteInterest,
  publishInterests,
} from '../actions.js';

export default async function WizardPage({ params }) {
  const { guildId } = await params;

  let groups, meta, channels, presets;
  try {
    [groups, meta, channels, presets] = await Promise.all([
      api.getInterests(guildId),
      api.getMeta(guildId),
      api.getAllChannels(guildId),
      api.getPresets(),
    ]);
  } catch (err) {
    return (
      <>
        <div className="page-head">
          <h1>Setup-Wizard</h1>
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
        <h1>Setup-Wizard</h1>
        <p>
          Mitglieder klicken ein Symbol an und bekommen die passenden Kanäle freigeschaltet.
        </p>
      </div>
      <Wizard
        guildId={guildId}
        groups={groups}
        roles={meta.roles}
        channels={channels}
        presets={presets}
        createAction={createInterest}
        updateAction={updateInterest}
        deleteAction={deleteInterest}
        publishAction={publishInterests}
      />
    </>
  );
}
