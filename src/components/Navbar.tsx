import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { setSoundEnabled, soundEnabled } from '../lib/sound';
import { useState } from 'react';
import { useFriendships, useInvites } from '../lib/social';

export default function Navbar() {
  const { profile, user, logout } = useAuth();
  const [sound, setSound] = useState(soundEnabled());
  const friendships = useFriendships(profile?.uid);
  const invites = useInvites(profile?.uid);
  const pending =
    friendships.filter((f) => f.status === 'pending' && f.requester !== profile?.uid).length + invites.length;
  return (
    <header className="navbar">
      <Link to="/" className="logo">
        ♞ chess<span>.uz</span>
      </Link>
      <nav>
        <NavLink to="/">Играть</NavLink>
        <NavLink to="/bots">Боты</NavLink>
        <NavLink to="/puzzles">Головоломки</NavLink>
        <NavLink to="/analysis">Анализ</NavLink>
        <NavLink to="/leaderboard">Рейтинг</NavLink>
        {firebaseConfigured && <NavLink to="/clubs">Клубы</NavLink>}
        {firebaseConfigured && user && (
          <NavLink to="/friends">
            Друзья{pending > 0 && <span className="badge">{pending}</span>}
          </NavLink>
        )}
      </nav>
      <div className="nav-right">
        <Link className="btn small ghost" to="/settings" title="Настройки">
          ⚙
        </Link>
        <button
          className="btn small ghost"
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
              <Link className="btn small ghost" to={`/profile/${profile.uid}`}>
                {profile.name}
              </Link>
              <button className="btn small" onClick={() => logout()}>
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
