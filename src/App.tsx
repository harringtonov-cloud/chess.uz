import { Route, Routes } from 'react-router-dom';
import Navbar from './components/Navbar';
import SiteBanners from './components/SiteBanners';
import { ModerationProvider } from './ModerationContext';
import { NotificationsProvider } from './NotificationsContext';
import Admin from './pages/Admin';
import Analysis from './pages/Analysis';
import Bots from './pages/Bots';
import ClubPage from './pages/ClubPage';
import Clubs from './pages/Clubs';
import Editor from './pages/Editor';
import Friends from './pages/Friends';
import GamePage from './pages/Game';
import Home from './pages/Home';
import Leaderboard from './pages/Leaderboard';
import Learn from './pages/Learn';
import Login from './pages/Login';
import NotificationsPage from './pages/Notifications';
import OpeningTrainer from './pages/OpeningTrainer';
import Openings from './pages/Openings';
import Profile from './pages/Profile';
import PuzzleRush from './pages/PuzzleRush';
import Puzzles from './pages/Puzzles';
import SettingsPage from './pages/Settings';
import TournamentPage from './pages/TournamentPage';
import Vision from './pages/Vision';
import Tournaments from './pages/Tournaments';

export default function App() {
  return (
    <NotificationsProvider>
      <ModerationProvider>
      <Navbar />
      <SiteBanners />
      <main className="container">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/game/:id" element={<GamePage />} />
          <Route path="/bots" element={<Bots />} />
          <Route path="/puzzles" element={<Puzzles />} />
          <Route path="/rush" element={<PuzzleRush />} />
          <Route path="/learn" element={<Learn />} />
          <Route path="/editor" element={<Editor />} />
          <Route path="/vision" element={<Vision />} />
          <Route path="/openings" element={<Openings />} />
          <Route path="/openings/train" element={<OpeningTrainer />} />
          <Route path="/analysis" element={<Analysis />} />
          <Route path="/leaderboard" element={<Leaderboard />} />
          <Route path="/friends" element={<Friends />} />
          <Route path="/clubs" element={<Clubs />} />
          <Route path="/tournaments" element={<Tournaments />} />
          <Route path="/tournament/:id" element={<TournamentPage />} />
          <Route path="/club/:id" element={<ClubPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/profile/:uid" element={<Profile />} />
          <Route path="*" element={<div className="card">Страница не найдена</div>} />
        </Routes>
      </main>
      </ModerationProvider>
    </NotificationsProvider>
  );
}
