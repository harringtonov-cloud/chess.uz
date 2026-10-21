import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import { useModeration } from '../ModerationContext';
import { firebaseConfigured } from '../firebase';
import { loadSiteStats, saveAnnouncement, useAnnouncement, useReports } from '../lib/moderation';
import type { SiteStats, Staff } from '../lib/moderation';
import { REASON_INFO, REASON_ORDER, reportStats } from '../lib/moderationLogic';
import type { AnnouncementLevel } from '../lib/moderationLogic';
import LogTab from './admin/LogTab';
import PlayerPanel from './admin/PlayerPanel';
import PlayersTab from './admin/PlayersTab';
import ReportsTab from './admin/ReportsTab';
import SanctionsTab from './admin/SanctionsTab';

type Tab = 'overview' | 'reports' | 'players' | 'sanctions' | 'log' | 'announce';

const TABS: { id: Tab; label: string; adminOnly?: boolean }[] = [
  { id: 'overview', label: 'Обзор' },
  { id: 'reports', label: 'Жалобы' },
  { id: 'players', label: 'Игроки' },
  { id: 'sanctions', label: 'Санкции' },
  { id: 'log', label: 'Журнал' },
  { id: 'announce', label: 'Объявление', adminOnly: true },
];

export default function Admin() {
  const { user, loading } = useAuth();
  const { staff, role } = useModeration();
  const [tab, setTab] = useState<Tab>('overview');
  const [params] = useSearchParams();
  const [player, setPlayer] = useState<string | null>(params.get('player'));

  if (!firebaseConfigured) return <div className="card">Админ-панель доступна после подключения Firebase.</div>;
  if (loading) return <div className="card">Загрузка…</div>;
  if (!user) return <div className="card">Войдите в аккаунт. <Link to="/login">Войти</Link></div>;
  if (!staff || !role) {
    return (
      <div className="card">
        <h2>Нет доступа</h2>
        <p className="muted">
          Эта страница только для модераторов и администраторов. Роль выдаётся вручную в Firebase (инструкция в README, раздел
          «Админ-панель»).
        </p>
      </div>
    );
  }

  function open(uid: string) {
    setPlayer(uid);
    window.scrollTo({ top: 0 });
  }

  return (
    <div>
      <h2>🛡 Панель модерации <span className="muted">({role === 'admin' ? 'администратор' : 'модератор'})</span></h2>
      {player && <PlayerPanel uid={player} staff={staff} onClose={() => setPlayer(null)} />}
      <div className="tabs">
        {TABS.filter((t) => !t.adminOnly || role === 'admin').map((t) => (
          <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="card">
        {tab === 'overview' && <Overview />}
        {tab === 'reports' && <ReportsTab staff={staff} onOpenPlayer={open} />}
        {tab === 'players' && <PlayersTab onOpenPlayer={open} />}
        {tab === 'sanctions' && <SanctionsTab staff={staff} onOpenPlayer={open} />}
        {tab === 'log' && <LogTab />}
        {tab === 'announce' && role === 'admin' && <Announce staff={staff} />}
      </div>
    </div>
  );
}

function Overview() {
  const [stats, setStats] = useState<SiteStats | null>(null);
  const { reports } = useReports(true);
  useEffect(() => {
    loadSiteStats(Date.now()).then(setStats).catch(() => setStats(null));
  }, []);
  const rs = reportStats(reports);
  const max = Math.max(1, ...REASON_ORDER.map((r) => rs.byReason[r]));
  const num = (n: number | undefined) => (n === undefined ? '…' : n < 0 ? '—' : String(n));
  const tiles: [string, string][] = [
    ['Игроков', num(stats?.users)],
    ['Партий всего', num(stats?.games)],
    ['Идут сейчас', num(stats?.activeGames)],
    ['Клубов', num(stats?.clubs)],
    ['Турниров', num(stats?.tournaments)],
    ['Новых жалоб', num(stats?.openReports)],
    ['Активных санкций', num(stats?.activeSanctions)],
  ];
  return (
    <div>
      <div className="stat-grid">
        {tiles.map(([label, value]) => (
          <div key={label} className="rating-box">
            <span className="muted">{label}</span>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <h3>Жалобы по причинам (последние {reports.length})</h3>
      {REASON_ORDER.map((r) => (
        <div key={r} className="bar-row">
          <span className="bar-label">{REASON_INFO[r].icon} {REASON_INFO[r].label}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(rs.byReason[r] / max) * 100}%` }} /></span>
          <b>{rs.byReason[r]}</b>
        </div>
      ))}
      <p className="muted">
        Новых: {rs.open} · меры приняты: {rs.resolved} · отклонено: {rs.dismissed}
      </p>
    </div>
  );
}

function Announce({ staff }: { staff: Staff }) {
  const current = useAnnouncement();
  const [text, setText] = useState('');
  const [level, setLevel] = useState<AnnouncementLevel>('info');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (current) {
      setText(current.text);
      setLevel(current.level);
    }
  }, [current]);

  async function save(active: boolean) {
    setBusy(true);
    setMsg('');
    try {
      await saveAnnouncement(staff, { text, level, active });
      setMsg(active ? 'Объявление опубликовано ✓' : 'Объявление снято ✓');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form">
      <p className="muted">Короткое сообщение над всеми страницами сайта: тех. работы, турнир, новости.</p>
      <textarea value={text} maxLength={200} onChange={(e) => setText(e.target.value)} placeholder="Текст объявления (до 200 символов)" />
      <select value={level} onChange={(e) => setLevel(e.target.value as AnnouncementLevel)}>
        <option value="info">📢 Обычное</option>
        <option value="warning">⚠️ Важное</option>
      </select>
      <div className="row">
        <button className="btn primary" disabled={busy || text.trim().length < 3} onClick={() => save(true)}>
          Опубликовать
        </button>
        <button className="btn" disabled={busy || !current} onClick={() => save(false)}>
          Снять
        </button>
        {current && <span className="muted">Сейчас показывается: «{current.text}»</span>}
      </div>
      {msg && <p className="muted">{msg}</p>}
    </div>
  );
}
