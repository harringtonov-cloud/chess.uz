import { Link, NavLink } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { firebaseConfigured } from '../firebase';
import { setSoundEnabled, soundEnabled } from '../lib/sound';
import { useState } from 'react';

export default function Navbar() {
  const { profile, user, logout } = useAuth();
  const [sound, setSound] = useState(soundEnabled());
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
