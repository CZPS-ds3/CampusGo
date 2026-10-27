import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { OfflineBanner } from './components/OfflineBanner.jsx';
import { QuestMenu } from './components/QuestMenu.jsx';
import { RouteWipe } from './components/RouteWipe.jsx';
import { Skeleton } from './components/Screen.jsx';
import { useSession } from './hooks/useSession.jsx';
import { useSettings } from './i18n.js';
import Info from './pages/Info.jsx';
import Locate from './pages/Locate.jsx';
import Login from './pages/Login.jsx';
import MapPage from './pages/MapPage.jsx';
import NotFound from './pages/NotFound.jsx';
import Profile from './pages/Profile.jsx';
import Quests from './pages/Quests.jsx';
import Quiz from './pages/Quiz.jsx';
import Ranks from './pages/Ranks.jsx';
import Result from './pages/Result.jsx';
import Splash from './pages/Splash.jsx';
import Team from './pages/Team.jsx';

/** Everything behind the login. The GO badge menu is hidden while a quiz runs. */
function Protected() {
  const { student, ready } = useSession();
  const location = useLocation();
  if (!ready) {
    return (
      <main className="page page--narrow">
        <Skeleton rows={3} />
      </main>
    );
  }
  if (!student) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  const inQuiz = location.pathname.startsWith('/quiz');
  return (
    <>
      <OfflineBanner />
      <Outlet />
      {!inQuiz && <QuestMenu />}
    </>
  );
}

export default function App() {
  useSettings(); // re-render the whole tree when language, theme or font size changes
  return (
    <>
      <Routes>
        <Route path="/" element={<Splash />} />
        <Route path="/login" element={<Login />} />
        <Route element={<Protected />}>
          <Route path="/map" element={<MapPage />} />
          <Route path="/locate/:id" element={<Locate />} />
          <Route path="/info/:id" element={<Info />} />
          <Route path="/quiz/:id" element={<Quiz />} />
          <Route path="/result/:id" element={<Result />} />
          <Route path="/quests" element={<Quests />} />
          <Route path="/team" element={<Team />} />
          <Route path="/ranks" element={<Ranks />} />
          <Route path="/profile" element={<Profile />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <RouteWipe />
    </>
  );
}
