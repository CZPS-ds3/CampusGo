import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Avatar } from '../components/Avatar.jsx';
import { Screen, Skeleton } from '../components/Screen.jsx';
import { useSession } from '../hooks/useSession.jsx';
import { copy } from '../i18n.js';

const fmt = (n) => n.toLocaleString('en');

function Board({ entries, mine, nameOf, detailOf }) {
  if (entries.length === 0) return null;
  return (
    <ol className="board">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className={`board__row${mine(entry) ? ' is-you' : ''}`}
          aria-current={mine(entry) || undefined}
        >
          <span className="board__rank mono">{entry.rank}</span>
          <Avatar name={nameOf(entry)} url={entry.pictureUrl} />
          <span className="board__name">
            {nameOf(entry)}
            {mine(entry) && <span className="chip chip--volt">{copy.ranks.you}</span>}
            {detailOf && <span className="muted board__detail">{detailOf(entry)}</span>}
          </span>
          <span className="board__points mono">
            {fmt(entry.points)} <span className="sr-only">{copy.ranks.points}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

export default function Ranks() {
  const { student } = useSession();
  const inTeam = Boolean(student?.teamId);
  const [tab, setTab] = useState('solo');
  const [solo, setSolo] = useState(null);
  const [team, setTeam] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    api
      .soloBoard()
      .then((data) => alive && setSolo(data))
      .catch((failure) => alive && setError(errorText(failure)));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (tab !== 'team' || !inTeam) return undefined;
    let alive = true;
    api
      .teamBoard()
      .then((data) => alive && setTeam(data))
      .catch((failure) => alive && setError(errorText(failure)));
    return () => {
      alive = false;
    };
  }, [tab, inTeam]);

  // BR06: the team ranking is only offered to students who are in a team.
  const tabs = inTeam ? ['solo', 'team'] : ['solo'];

  return (
    <Screen title={copy.ranks.title} wide>
      {inTeam && (
        <div className="tabs" role="tablist" aria-label="Ranking type">
          {tabs.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={`tab-${id}`}
              aria-selected={tab === id}
              aria-controls="board-panel"
              className={`tab${tab === id ? ' is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {id === 'solo' ? copy.ranks.solo : copy.ranks.team}
            </button>
          ))}
        </div>
      )}
      {!inTeam && <p className="muted">{copy.ranks.needTeam}</p>}
      <section
        id="board-panel"
        role={inTeam ? 'tabpanel' : undefined}
        aria-labelledby={inTeam ? `tab-${tab}` : undefined}
        aria-label={inTeam ? undefined : copy.ranks.title}
        className="panel"
      >
        {error && <p className="field__error">{error}</p>}
        {tab === 'solo' && !solo && !error && <Skeleton rows={4} height={56} />}
        {tab === 'solo' && solo && (
          <>
            {solo.entries.every((e) => e.points === 0) && <p>{copy.ranks.empty}</p>}
            <Board entries={solo.entries} mine={(e) => e.isYou} nameOf={(e) => e.displayName} />
          </>
        )}
        {tab === 'team' && !team && !error && <Skeleton rows={4} height={56} />}
        {tab === 'team' && team && (
          <>
            {team.entries.length === 0 && <p>{copy.ranks.noTeams}</p>}
            <Board
              entries={team.entries}
              mine={(e) => e.isYourTeam}
              nameOf={(e) => e.name}
              detailOf={(e) => copy.ranks.members(e.members)}
            />
          </>
        )}
      </section>
    </Screen>
  );
}
