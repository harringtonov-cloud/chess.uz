import { Link, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { setSoundEnabled, soundEnabled } from '../lib/sound';
import { useEffect, useState } from 'react';
import { isMyTurn, useMyDailyGames } from '../lib/lobby';
import { useFriendships, useInvites } from '../lib/social';
import NotificationBell from './NotificationBell';
import { useModeration } from '../ModerationContext';

export default function Navbar() {
  const { profile, user, logout } = useAuth();
  const { role } = useModeration();
  const [sound, setSound] = useState(soundEnabled());
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    document.body.classList.toggle('menu-open', open);
    return () => document.body.classList.remove('menu-open');
  }, [open]);
  const friendships = useFriendships(profile?.uid);
  const invites = useInvites(profile?.uid);
  const dailyGames = useMyDailyGames(profile?.uid);
  const myTurns = profile ? dailyGames.filter(({ g }) => isMyTurn(g, profile.uid)).length : 0;
  const pending =
    friendships.filter((f) => f.status === 'pending' && f.requester !== profile?.uid).length + invites.length;
  return (
    <header className="navbar">
      <button className="burger" aria-label="Меню" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span />
        <span />
        <span />
      </button>
      <Link to="/" className="logo">
        ♞ chess<span>.uz</span>
      </Link>
      {open && <div className="nav-backdrop" onClick={() => setOpen(false)} />}
      <nav className={open ? 'open' : ''}>
        <NavLink to="/">
          Играть{myTurns > 0 && <span className="badge" title="Ваш ход в ежедневных партиях">{myTurns}</span>}
        </NavLink>
        <NavLink to="/bots">Боты</NavLink>
        <NavLink to="/puzzles">Головоломки</NavLink>
        <NavLink to="/learn">Учиться</NavLink>
        <NavLink to="/openings">Дебюты</NavLink>
        <NavLink to="/endgames">Эндшпили</NavLink>
        <NavLink to="/editor">Редактор</NavLink>
        <NavLink to="/analysis">Анализ</NavLink>
        <NavLink to="/leaderboard">Рейтинг</NavLink>
        {firebaseConfigured && <NavLink to="/tournaments">Турниры</NavLink>}
        {firebaseConfigured && <NavLink to="/clubs">Клубы</NavLink>}
        {firebaseConfigured && <NavLink to="/forum">Форум</NavLink>}
        {firebaseConfigured && user && (
          <NavLink to="/friends">
            Друзья{pending > 0 && <span className="badge">{pending}</span>}
          </NavLink>
        )}
        <div className="nav-extra">
          <Link to="/settings">⚙ Настройки</Link>
          <a
            href="#sound"
            onClick={(e) => {
              e.preventDefault();
              setSoundEnabled(!sound);
              setSound(!sound);
            }}
          >
            {sound ? '🔊 Звук включён' : '🔇 Звук выключен'}
          </a>
          {firebaseConfigured && user && profile && (
            <>
              <Link to={`/profile/${profile.uid}`}>👤 {profile.name}</Link>
              <a
                href="#logout"
                onClick={(e) => {
                  e.preventDefault();
                  logout();
                }}
              >
                Выйти
              </a>
            </>
          )}
        </div>
      </nav>
      <div className="nav-right">
        {firebaseConfigured && role && (
          <Link className="btn small ghost" to="/admin" title="Панель модерации">
            🛡
          </Link>
        )}
        {firebaseConfigured && <NotificationBell />}
        <Link className="btn small ghost desk-only" to="/settings" title="Настройки">
          ⚙
        </Link>
        <button
          className="btn small ghost desk-only"
          title="Звук"
          onClick={() => {
            setSoundEnabled(!sound);
            setSound(!sound);
          }}
        >
          {sound ? '🔊' : '🔇'}
        </button>
        {firebaseConfigured &&
          (user && profile ? (
            <>
              <Link className="btn small ghost desk-only" to={`/profile/${profile.uid}`}>
                {profile.name}
              </Link>
              <button className="btn small desk-only" onClick={() => logout()}>
                Выйти
              </button>
            </>
          ) : (
            <Link className="btn small primary" to="/login">
              Войти
            </Link>
          ))}
      </div>
    </header>
  );
}
