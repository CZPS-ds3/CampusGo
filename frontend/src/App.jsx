import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { OfflineBanner } from './components/OfflineBanner.jsx';
import { QuestMenu } from './components/QuestMenu.jsx';
import { Skeleton } from './components/Screen.jsx';
import { useSession } from './hooks/useSession.jsx';
import CityTeaser from './pages/CityTeaser.jsx';
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

/** Everything behind the login. The round menu is hidden while a quiz runs. */
function Protected() {
  const { student, ready } = useSession();
  const location = useLocation();
  if (!ready) {
    return (
      <div className="page screen">
        <div className="screen__body">
          <Skeleton rows={3} />
        </div>
      </div>
    );
  }
  if (!student)
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
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
  return (
    <Routes>
      <Route path="/" element={<Splash />} />
      <Route path="/login" element={<Login />} />
      <Route element={<Protected />}>
        <Route path="/map" element={<MapPage />} />
        <Route path="/quests" element={<Quests />} />
        <Route path="/team" element={<Team />} />
        <Route path="/ranks" element={<Ranks />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/city" element={<CityTeaser />} />
        <Route path="/quiz/:id" element={<Quiz />} />
        <Route path="/result/:id" element={<Result />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
