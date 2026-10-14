import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Analysis from './pages/Analysis';
import Bots from './pages/Bots';
import GamePage from './pages/Game';
import Home from './pages/Home';
import Leaderboard from './pages/Leaderboard';
import Login from './pages/Login';
import Profile from './pages/Profile';
import Puzzles from './pages/Puzzles';
import SettingsPage from './pages/Settings';

export default function App() {
  return (
    <>
      <Navbar />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/game/:id" element={<GamePage />} />
          <Route path="/bots" element={<Bots />} />
          <Route path="/puzzles" element={<Puzzles />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile/:uid" element={<Profile />} />
          <Route path="*" element={<div className="card">Страница не найдена</div>} />
        </Routes>
      </main>
    </>
  );
}
