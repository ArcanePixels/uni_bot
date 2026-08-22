import { api, ApiError } from '@/lib/api.js';
import { auth } from '@/lib/auth.js';
import { Commands } from '@/components/Commands.js';
import { Alert } from '@/components/Icons.js';
import {
  createCommand,
  updateCommand,
  deleteCommand,
  clearMessageLog,
  triggerBackup,
} from '../actions.js';

export default async function CommandsPage({ params }) {
  const { guildId } = await params;

  let commands, messageLog, settings, meta;
  try {
    [commands, messageLog, settings, meta] = await Promise.all([
      api.getCommands(guildId),
      api.getMessageLog(guildId, '?limit=100'),
      api.getSettings(guildId),
      api.getMeta(guildId),
    ]);
  } catch (err) {
    return (
      <>
        <div className="page-head">
          <h1>Befehle</h1>
        </div>
        <div className="notice error">
          <Alert width={15} height={15} />
          <div>{err instanceof ApiError ? err.message : 'Laden fehlgeschlagen.'}</div>
        </div>
      </>
    );
  }

  // Sicherungen enthalten die Daten aller Server - nur der Betreiber (OWNER_IDS)
  // darf sie sehen. Bei allen anderen bleibt der Bereich leer mit Hinweis.
  const session = await auth();
  let backups = { list: [], keepDays: 0, directory: '–', hinweis: null };
  try {
    const b = await api.getBackups(session?.user?.id);
    backups = { list: b.backups, keepDays: b.keepDays, directory: b.directory, hinweis: null };
  } catch (err) {
    backups = {
      list: [],
      keepDays: 0,
      directory: '–',
      hinweis:
        err?.status === 403
          ? err.message
          : 'Sicherungen sind gerade nicht abrufbar.',
    };
  }

  return (
    <>
      <div className="page-head">
        <h1>Befehle</h1>
        <p>Eigene Textbefehle, Nachrichten-Log und Sicherungen.</p>
      </div>
      <Commands
        guildId={guildId}
        commands={commands}
        messageLog={messageLog}
        backups={backups}
        prefix={settings.customCommands?.prefix ?? '!'}
        commandsEnabled={Boolean(settings.customCommands?.enabled)}
        logEnabled={Boolean(settings.messageLog?.enabled)}
        roles={meta.roles}
        createAction={createCommand}
        updateAction={updateCommand}
        deleteAction={deleteCommand}
        clearLogAction={clearMessageLog}
        backupAction={triggerBackup}
      />
    </>
  );
}
