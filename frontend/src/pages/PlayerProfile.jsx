import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { errorText } from '../api/errorText.js';
import { Avatar } from '../components/Avatar.jsx';
import { Button } from '../components/Button.jsx';
import { Icon, IconButton } from '../components/icons.jsx';
import { Page, Skeleton } from '../components/Screen.jsx';
import { Chip, Display } from '../components/ui.jsx';
import { useToast } from '../hooks/useToast.jsx';
import { formatNumber, t } from '../i18n.js';

/** What any signed-in player may see about another player: points, ranks and team. No address, no last name. */
export default function PlayerProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [player, setPlayer] = useState(undefined);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .player(id)
      .then((result) => setPlayer(result.player))
      .catch((error) => {
        toast.error(errorText(error));
        navigate('/ranks', { replace: true });
      });
  }, [id, navigate, toast]);

  useEffect(() => {
    setPlayer(undefined);
    load();
  }, [load]);

  const invite = async () => {
    setBusy(true);
    try {
      await api.invitePlayer(player.id);
      toast.info(t('If the user exists and can be invited, an invitation has been sent.'));
      load();
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setBusy(false);
    }
  };

  if (!player) {
    return (
      <Page>
        <Skeleton rows={3} />
      </Page>
    );
  }

  const { team } = player;
  return (
    <Page className="page--player" wide>
      <div className="row">
        <IconButton icon="back" label={t('Back to ranks')} onClick={() => navigate(-1)} />
      </div>
      <div className="profile__hero">
        <Avatar
          size={96}
          name={player.displayName}
          avatar={{ url: player.pictureUrl, preset: player.avatarPreset }}
          label={t('Avatar of {name}', { name: player.displayName })}
        />
        <Display as="h1" size="h1" tabIndex={-1} className="block">
          {player.displayName}
        </Display>
        {player.isYou && <Chip tone="accent">{t('This is you')}</Chip>}
      </div>

      <div className="twocol">
        <div className="stack">
          <div className="grid2">
            <div className="card card--tight">
              <p className="caption muted">{t('Points')}</p>
              <p className="mono h2 accent">{formatNumber(player.totalPoints)}</p>
            </div>
            <div className="card card--tight">
              <p className="caption muted">{t('Solo rank')}</p>
              <p className="mono h2">#{player.rank}</p>
            </div>
            <div className="card card--tight">
              <p className="caption muted">{t('Quests cleared')}</p>
              <p className="mono h2 ok-text">{player.questsCleared}</p>
            </div>
            <div className="card card--tight">
              <p className="caption muted">{t('Team rank')}</p>
              <p className="mono h2">{team?.rank ? `#${team.rank}` : '–'}</p>
            </div>
          </div>
          {player.canInvite && (
            <Button variant="sub" busy={busy} onClick={invite}>
              <Icon name="mail" /> {t('Invite to my team')}
            </Button>
          )}
          {player.isYou && (
            <Button to="/profile" variant="ghost">
              {t('Open my profile settings')}
            </Button>
          )}
        </div>

        <section className="card stack" aria-labelledby="player-team">
          <Display as="h2" size="h3" id="player-team">
            {team ? team.name : t('No team yet')}
          </Display>
          {team ? (
            <>
              <p className="small muted">
                {team.members.length} {t('members')} · {formatNumber(team.score)} {t('Team score')}
                {!team.rank && ` · ${t('A team appears in the ranking from two members.')}`}
              </p>
              <ul className="stack stack--tight" aria-label={t('Members')}>
                {team.members.map((member) => (
                  <li key={member.id}>
                    <Link to={`/player/${member.id}`} className="card card--tight row">
                      <Avatar
                        size={40}
                        name={member.displayName}
                        avatar={{ url: member.pictureUrl, preset: member.avatarPreset }}
                      />
                      <span className="grow truncate strong">{member.displayName}</span>
                      <span className="mono small">{formatNumber(member.totalPoints)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="small muted">{t('This player is not in a team.')}</p>
          )}
        </section>
      </div>
    </Page>
  );
}
