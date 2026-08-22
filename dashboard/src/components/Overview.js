import { Shield, Wave, Clock, Play, Gavel, Alert, Check, Hash, Users } from './Icons.js';

const RULE_LABEL = { wortfilter: 'Wortfilter', spam: 'Spam', link: 'Links' };

function relativeTime(ts, nowSec) {
  const diff = ts - nowSec;
  const abs = Math.abs(diff);
  const unit =
    abs < 90 ? ['gleich', 'gerade eben'] :
    abs < 5400 ? [`in ${Math.round(abs / 60)} Min.`, `vor ${Math.round(abs / 60)} Min.`] :
    abs < 129600 ? [`in ${Math.round(abs / 3600)} Std.`, `vor ${Math.round(abs / 3600)} Std.`] :
    [`in ${Math.round(abs / 86400)} Tagen`, `vor ${Math.round(abs / 86400)} Tagen`];
  return diff >= 0 ? unit[0] : unit[1];
}

function Stat({ icon: Icon, label, value, sub, tone }) {
  return (
    <div className={`stat${tone ? ` ${tone}` : ''}`}>
      <div className="label">
        <Icon width={13} height={13} />
        {label}
      </div>
      <div className="value">{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Overview({ guildId, data, guildName, channels, nowSec, names = {}, issues = [] }) {
  const channelName = (id) => channels.find((c) => c.id === id)?.name ?? 'unbekannt';

  return (
    <>
      {issues.length > 0 && (
        <div className={`notice ${issues.some((i) => i.severity === 'error') ? 'error' : 'warning'}`}>
          <Alert width={15} height={15} />
          <div>
            <strong>
              {issues.some((i) => i.severity === 'error')
                ? 'Verknüpfungen zeigen ins Leere:'
                : 'Sieht ungewöhnlich aus:'}
            </strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {issues.map((i, n) => (
                <li key={n} style={{ marginBottom: 4 }}>
                  <strong>{i.where}</strong> – {i.message}
                  <div style={{ color: 'var(--text-dim)', fontSize: 12.5 }}>{i.hint}</div>
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 8 }}>
              <a href={`/guild/${guildId}/settings`}>Zu den Einstellungen</a>
            </div>
          </div>
        </div>
      )}

      {data.warnings.length > 0 && (
        <div className="notice warning">
          <Alert width={15} height={15} />
          <div>
            <strong>Fällt auf:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
              {data.warnings.map((w, i) => (
                <li key={i} style={{ marginBottom: 2 }}>
                  {w}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="stat-grid">
        <Stat
          icon={Shield}
          label="Automod"
          value={data.automodOn ? 'Aktiv' : 'Aus'}
          tone={data.automodOn ? 'ok' : 'off'}
          sub={
            data.automodOn
              ? [
                  data.badWordCount > 0 && `${data.badWordCount} Wörter`,
                  data.spamOn && 'Spam-Schutz',
                  data.linkFilterOn && 'Link-Filter',
                ]
                  .filter(Boolean)
                  .join(' · ') || 'keine Regel aktiv'
              : 'überwacht nichts'
          }
        />
        <Stat
          icon={Gavel}
          label="Verstöße (7 Tage)"
          value={data.infractionsWeek}
          sub={
            data.infractionsToday > 0
              ? `davon ${data.infractionsToday} heute`
              : 'heute noch keine'
          }
        />
        <Stat
          icon={Wave}
          label="Willkommen"
          value={data.welcomeOn ? 'Aktiv' : 'Aus'}
          tone={data.welcomeOn ? 'ok' : 'off'}
          sub={
            data.welcomeOn
              ? data.autoroleCount > 0
                ? `${data.autoroleCount} Autorole${data.autoroleCount === 1 ? '' : 'n'}`
                : 'ohne Autorole'
              : 'begrüßt niemanden'
          }
        />
        <Stat
          icon={Clock}
          label="Geplante Posts"
          value={data.activePosts}
          sub={
            data.nextPost
              ? `nächster ${relativeTime(data.nextPost.at, nowSec)}`
              : 'nichts geplant'
          }
        />
      </div>

      <div className="card">
        <div className="card-head">
          <span className="icon">
            <Gavel width={17} height={17} />
          </span>
          <div>
            <h2>Was der Bot diese Woche getan hat</h2>
            <p className="desc">Verstöße der letzten sieben Tage, nach Regel aufgeschlüsselt.</p>
          </div>
        </div>

        {data.infractionsWeek === 0 ? (
          <div className="empty">
            <Check width={26} height={26} />
            Keine Verstöße in den letzten sieben Tagen.
            {!data.automodOn && (
              <div style={{ marginTop: 6, color: 'var(--warning)' }}>
                Automod ist allerdings ausgeschaltet – der Bot schaut also gar nicht hin.
              </div>
            )}
          </div>
        ) : (
          <>
            <div className="row" style={{ marginBottom: 14 }}>
              {Object.entries(data.byRule).map(([rule, n]) => (
                <div key={rule} className="shrink">
                  <span className="badge accent">
                    {RULE_LABEL[rule] ?? rule}: {n}
                  </span>
                </div>
              ))}
              <span className="spacer" />
            </div>

            {data.repeatOffenders > 0 && (
              <div className="notice info" style={{ marginBottom: 0 }}>
                <Users width={15} height={15} />
                <div>
                  {data.repeatOffenders} Mitglied
                  {data.repeatOffenders === 1 ? ' ist' : 'er sind'} mehrfach auffällig geworden.
                  {data.topOffender && (
                    <>
                      {' '}Spitzenreiter:{' '}
                      {names[data.topOffender[0]] ? (
                        <strong>{names[data.topOffender[0]].name}</strong>
                      ) : (
                        <code>{data.topOffender[0]}</code>
                      )}{' '}
                      mit {data.topOffender[1]} Verstößen.
                    </>
                  )}{' '}
                  <a href={`/guild/${guildId}/infractions`}>Verstöße ansehen</a>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <div className="card-head">
          <span className="icon">
            <Clock width={17} height={17} />
          </span>
          <div>
            <h2>Was als Nächstes ansteht</h2>
            <p className="desc">Geplante Posts und beobachtete YouTube-Kanäle.</p>
          </div>
        </div>

        {data.nextPost ? (
          <div className="notice info" style={{ marginBottom: 12 }}>
            <Hash width={15} height={15} />
            <div>
              <strong>{relativeTime(data.nextPost.at, nowSec)}</strong> in{' '}
              <code>#{channelName(data.nextPost.post.channel_id)}</code>:{' '}
              {data.nextPost.post.content.length > 90
                ? `${data.nextPost.post.content.slice(0, 90)}…`
                : data.nextPost.post.content}
            </div>
          </div>
        ) : (
          <div className="notice info" style={{ marginBottom: 12 }}>
            <Clock width={15} height={15} />
            <div>
              Kein Post geplant. <a href={`/guild/${guildId}/posts`}>Einen anlegen</a>
            </div>
          </div>
        )}

        <div className="notice info" style={{ marginBottom: 0 }}>
          <Play width={15} height={15} />
          <div>
            {data.activeFeeds === 0 ? (
              <>
                Kein YouTube-Kanal beobachtet.{' '}
                <a href={`/guild/${guildId}/youtube`}>Kanal hinzufügen</a>
              </>
            ) : (
              <>
                {data.activeFeeds === 1
                  ? 'Ein YouTube-Kanal wird'
                  : `${data.activeFeeds} YouTube-Kanäle werden`}{' '}
                auf neue Uploads geprüft.
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
