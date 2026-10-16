import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import Analysis from './pages/Analysis';
import Bots from './pages/Bots';
import ClubPage from './pages/ClubPage';
import Clubs from './pages/Clubs';
import Friends from './pages/Friends';
import GamePage from './pages/Game';
import Home from './pages/Home';
import Leaderboard from './pages/Leaderboard';
import Learn from './pages/Learn';
import Login from './pages/Login';
import Openings from './pages/Openings';
import Profile from './pages/Profile';
import PuzzleRush from './pages/PuzzleRush';
import Puzzles from './pages/Puzzles';
import SettingsPage from './pages/Settings';
import TournamentPage from './pages/TournamentPage';
import Tournaments from './pages/Tournaments';

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
          <Route path="/rush" element={<PuzzleRush />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/openings" element={<Openings />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/clubs" element={<Clubs />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournament/:id" element={<TournamentPage />} />
          <Route path="/club/:id" element={<ClubPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile/:uid" element={<Profile />} />
          <Route path="*" element={<div className="card">Страница не найдена</div>} />
        </Routes>
      </main>
    </>
  );
}
