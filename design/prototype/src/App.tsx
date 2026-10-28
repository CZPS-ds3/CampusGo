import { useEffect, useMemo, useRef, useState } from "react";

type Screen =
  | "welcome"
  | "register"
  | "permission"
  | "home"
  | "detail"
  | "verifying"
  | "verifyFail"
  | "quiz"
  | "feedback"
  | "complete"
  | "final"
  | "leaderboard"
  | "profile"
  | "expired"
  | "leftZone"
  | "mismatch";

type IconName =
  | "arrow"
  | "back"
  | "badge"
  | "check"
  | "chevron"
  | "clock"
  | "compass"
  | "home"
  | "leaderboard"
  | "lock"
  | "location"
  | "map"
  | "profile"
  | "refresh"
  | "shield"
  | "sparkles"
  | "target"
  | "users";

const campusImage =
  "https://images.unsplash.com/photo-1731349219592-60ca16964631?crop=entropy&cs=tinysrgb&fit=crop&fm=jpg&q=85&w=1200";

const checkpoints = [
  { name: "Mensa", status: "ready", points: 0, distance: "120 m", x: 29, y: 66 },
  { name: "Library", status: "completed", points: 300, distance: "240 m", x: 55, y: 24 },
  { name: "Cafeteria", status: "completed", points: 280, distance: "310 m", x: 73, y: 49 },
  { name: "Campus Garden", status: "completed", points: 250, distance: "450 m", x: 47, y: 79 },
  { name: "Care.Box", status: "locked", points: 0, distance: "620 m", x: 83, y: 72 },
] as const;

const questions = [
  {
    question: "Which payment method works at the DHBW Mensa?",
    options: ["Student ID card", "Cash only", "Any credit card", "Meal voucher booklet"],
    answer: 0,
    explanation: "Your student ID doubles as a rechargeable payment card at the Mensa.",
  },
  {
    question: "Where can you check today’s Mensa menu?",
    options: ["On the Studierendenwerk website", "Only at the counter", "In the library", "At the city hall"],
    answer: 0,
    explanation: "The Studierendenwerk publishes the current menu and allergen information online.",
  },
  {
    question: "What should you do with your tray after eating?",
    options: ["Leave it on the table", "Return it to the tray station", "Take it home", "Give it to the cashier"],
    answer: 1,
    explanation: "Returning trays keeps the dining area tidy and helps the Mensa team.",
  },
];

const spotQuestions = {
  Library: ["How do you borrow a book?", "Where are quiet study areas?", "How can you access e-books?"],
  Cafeteria: ["When is the morning rush?", "Where do cups go?", "Which reusable option is available?"],
  "Campus Garden": ["Which plants grow here?", "Who maintains the garden?", "What event happens here?"],
  "Care.Box": ["What support is available?", "How is a request kept private?", "Where can you find opening hours?"],
};

const leaders = [
  ["Mina", "Japan", "🇯🇵", 1450],
  ["Noah", "Germany", "🇩🇪", 1390],
  ["Priya", "India", "🇮🇳", 1320],
  ["Lina", "Sweden", "🇸🇪", 1260],
  ["Mateo", "Colombia", "🇨🇴", 1180],
  ["Yara", "Egypt", "🇪🇬", 1120],
  ["Chen", "China", "🇨🇳", 1040],
  ["Alex", "Spain", "🇪🇸", 830],
  ["Amara", "Kenya", "🇰🇪", 790],
  ["Leo", "Brazil", "🇧🇷", 740],
] as const;

function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  const paths: Record<IconName, React.ReactNode> = {
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h10" /></>,
    badge: <><circle cx="12" cy="8" r="5" /><path d="M8.8 12 7 21l5-3 5 3-1.8-9" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 18 6-6-6-6" />,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    compass: <><circle cx="12" cy="12" r="9" /><path d="m15 9-2 4-4 2 2-4 4-2Z" /></>,
    home: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    leaderboard: <><path d="M7 20v-7H3v7M14 20V4h-4v16M21 20V9h-4v11" /></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
    location: <><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    map: <><path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" /><path d="M9 3v15M15 6v15" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M18.3 16a8 8 0 1 1 1.3-8L20 12" /></>,
    shield: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></>,
    sparkles: <><path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3Z" /><path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7L19 14Z" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /><path d="M12 3v2M21 12h-2M12 21v-2M3 12h2" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" /></>,
  };
  return <svg {...common}>{paths[name]}</svg>;
}

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="logo" aria-label="campusGO">
      <span className="logo-mark"><Icon name="location" size={compact ? 18 : 25} /></span>
      <span className={compact ? "logo-type compact" : "logo-type"}>campus<span>GO</span></span>
    </div>
  );
}

function BrowserChrome() {
  return (
    <div className="browser-chrome" aria-label="Browser frame">
      <div className="browser-tabs">
        <div className="window-controls" aria-hidden="true"><i /><i /><i /></div>
        <div className="browser-tab"><span className="mini-favicon"><Icon name="location" size={12} /></span><strong>campusGO</strong><span className="tab-close">×</span></div>
        <button className="new-tab" aria-label="Open new tab">+</button>
      </div>
      <div className="browser-toolbar">
        <div className="browser-nav">
          <button aria-label="Browser back"><Icon name="back" size={17} /></button>
          <button aria-label="Browser forward" className="forward"><Icon name="chevron" size={17} /></button>
          <button aria-label="Reload page"><Icon name="refresh" size={16} /></button>
        </div>
        <div className="address-bar"><Icon name="lock" size={13} /><span>campusgo.dhbw-heilbronn.de</span></div>
        <button className="browser-menu" aria-label="Browser menu"><i /><i /><i /></button>
      </div>
    </div>
  );
}

function Button({
  children,
  onClick,
  variant = "primary",
  className = "",
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return <button type={type} disabled={disabled} className={`btn btn-${variant} ${className}`} onClick={onClick}>{children}</button>;
}

function PageHeader({ title, onBack, action }: { title: string; onBack?: () => void; action?: React.ReactNode }) {
  return (
    <header className="page-header">
      {onBack ? <button className="icon-btn" onClick={onBack} aria-label="Go back"><Icon name="back" /></button> : <Logo compact />}
      <div className="page-title">{title}</div>
      <div className="header-action">{action}</div>
    </header>
  );
}

function BottomNav({ screen, go }: { screen: Screen; go: (screen: Screen) => void }) {
  const items: [Screen, IconName, string][] = [["home", "home", "Home"], ["leaderboard", "leaderboard", "Ranks"], ["profile", "profile", "Profile"]];
  return (
    <nav className="bottom-nav" aria-label="Main navigation">
      {items.map(([target, icon, label]) => (
        <button key={target} className={screen === target ? "nav-item active" : "nav-item"} onClick={() => go(target)}>
          <Icon name={icon} size={21} /><span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function Welcome({ go }: { go: (screen: Screen) => void }) {
  const [activeCard, setActiveCard] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);
  const cards = [
    ["map", "Find your way", "Explore five real spots and get to know your new campus."],
    ["target", "Unlock local quizzes", "Arrive at each checkpoint to reveal a quick on-site challenge."],
    ["leaderboard", "Climb the ranks", "Earn points, team up, and celebrate with students from everywhere."],
  ] as const;
  const showCard = (index: number) => {
    const next = Math.max(0, Math.min(cards.length - 1, index));
    setActiveCard(next);
    carouselRef.current?.children[next]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  };
  return (
    <main className="welcome screen">
      <div className="welcome-orbit orbit-one" />
      <div className="welcome-orbit orbit-two" />
      <div className="welcome-top">
        <Logo />
        <div className="eyebrow light">Your Welcome Week adventure</div>
        <h1>Explore your campus.<br /><span>Earn points.</span></h1>
        <p>Turn your first days at DHBW Heilbronn into a friendly campus quest.</p>
      </div>
      <div className="intro-scroll" ref={carouselRef} aria-label="How campusGO works">
        {cards.map(([icon, title, body], index) => (
          <article className="intro-card" key={title}>
            <span className="step-number">0{index + 1}</span>
            <div className="intro-icon"><Icon name={icon} size={30} /></div>
            <h2>{title}</h2><p>{body}</p>
          </article>
        ))}
      </div>
      <div className="carousel-controls" aria-label="Onboarding carousel controls">
        <button className="carousel-arrow" onClick={() => showCard(activeCard - 1)} disabled={activeCard === 0} aria-label="Previous introduction">
          <Icon name="back" size={18} />
        </button>
        <div className="carousel-dots">
          {cards.map((card, index) => (
            <button
              key={card[1]}
              className={activeCard === index ? "active" : ""}
              onClick={() => showCard(index)}
              aria-label={`Show introduction ${index + 1}: ${card[1]}`}
            />
          ))}
        </div>
        <button className="carousel-arrow" onClick={() => showCard(activeCard + 1)} disabled={activeCard === cards.length - 1} aria-label="Next introduction">
          <Icon name="arrow" size={18} />
        </button>
      </div>
      <Button onClick={() => go("register")} className="welcome-cta">Get started <Icon name="arrow" /></Button>
      <div className="welcome-foot">Made for new DHBW students</div>
    </main>
  );
}

function Register({ go }: { go: (screen: Screen) => void }) {
  return (
    <main className="screen form-screen">
      <PageHeader title="Create your profile" onBack={() => go("welcome")} />
      <section className="content">
        <div className="section-kicker">JOIN THE QUEST</div>
        <h1>Let’s get you exploring</h1>
        <p className="lead">Use your school email. We’ll send a one-time code whenever you log in.</p>
        <form onSubmit={(e) => { e.preventDefault(); go("permission"); }} className="form-stack">
          <label className="field"><span>School email</span><input type="email" defaultValue="alex@dhbw-heilbronn.de" required /></label>
          <label className="field"><span>Display name</span><input defaultValue="Alex" required /></label>
          <label className="field"><span>Nationality</span><select defaultValue="Spain"><option>Spain</option><option>Germany</option><option>India</option><option>Japan</option><option>Brazil</option><option>Other</option></select></label>
          <label className="field"><span>Partner code <small>Optional</small></span><input placeholder="e.g. GO-TEAM-24" /></label>
          <div className="privacy-note"><Icon name="shield" size={20} /><div><strong>Privacy comes first</strong><span>We only collect minimal data.</span></div></div>
          <Button type="submit">Continue <Icon name="arrow" /></Button>
        </form>
        <button className="text-link" onClick={() => go("permission")}>Already have an account? Log in</button>
      </section>
    </main>
  );
}

function Permission({ go }: { go: (screen: Screen) => void }) {
  const steps = ["Tap “Allow location” below", "Choose “Allow while using site”", "Keep location on during each quiz"];
  return (
    <main className="screen">
      <PageHeader title="Location access" onBack={() => go("register")} />
      <section className="content permission-content">
        <div className="permission-visual">
          <div className="radar ring-1" /><div className="radar ring-2" />
          <span><Icon name="location" size={38} /></span>
        </div>
        <div className="section-kicker">UNLOCK CHECKPOINTS</div>
        <h1>Location makes the quest work</h1>
        <p className="lead">We use your location only to confirm you’re at a campus spot. We never track your route.</p>
        <div className="instruction-card">
          <div className="platform-pills"><span>iOS Safari</span><span>Android Chrome</span></div>
          {steps.map((step, i) => <div className="instruction" key={step}><b>{i + 1}</b><span>{step}</span></div>)}
        </div>
        <Button onClick={() => go("home")}><Icon name="target" /> Allow location</Button>
        <button className="text-link">Location not working? Get help</button>
      </section>
    </main>
  );
}

function MiniMap({ onMensa, full = false }: { onMensa?: () => void; full?: boolean }) {
  return (
    <div className={`campus-map ${full ? "full-map" : ""}`} aria-label="Stylised campus map">
      <div className="road road-a" /><div className="road road-b" /><div className="building building-a" /><div className="building building-b" /><div className="building building-c" />
      {checkpoints.map((point, index) => (
        <button
          key={point.name}
          aria-label={`${point.name}, ${point.status}`}
          className={`map-pin ${point.status}`}
          style={{ left: `${point.x}%`, top: `${point.y}%` }}
          onClick={index === 0 ? onMensa : undefined}
        >
          {point.status === "completed" ? <Icon name="check" size={14} /> : index + 1}
        </button>
      ))}
      <div className="you-dot" aria-label="You are here"><span /></div>
      <div className="map-label">DHBW CAMPUS</div>
    </div>
  );
}

function Home({ go }: { go: (screen: Screen) => void }) {
  return (
    <main className="screen app-screen map-home">
      <div className="explore-map">
        <MiniMap full onMensa={() => go("detail")} />
        <div className="map-shade" />
      </div>
      <div className="map-hud">
        <div className="map-brand"><Logo compact /><span>Explore campus</span></div>
        <button className="avatar" onClick={() => go("profile")} aria-label="Open profile">A</button>
      </div>
      <div className="map-progress">
        <div className="map-progress-ring"><strong>3</strong><span>/ 5</span></div>
        <div><small>WELCOME QUEST</small><strong>2 spots left</strong><span>18 days remaining</span></div>
        <div className="map-score"><Icon name="sparkles" size={16} /><strong>830</strong><span>PTS</span></div>
      </div>
      <div className="map-actions">
        <button aria-label="Center map on my location"><Icon name="target" /></button>
        <button aria-label="Show campus route"><Icon name="map" /></button>
      </div>
      <div className="checkpoint-encounter">
        <div className="encounter-handle" />
        <div className="encounter-top">
          <span className="status-chip ready"><i /> CHECKPOINT READY</span>
          <span>120 m away</span>
        </div>
        <div className="encounter-main">
          <div className="encounter-pin"><Icon name="location" size={27} /></div>
          <div><small>CHECKPOINT 4 OF 5</small><h1>Mensa</h1><p>Get closer to unlock the on-site quiz.</p></div>
          <button onClick={() => go("detail")} aria-label="Open Mensa checkpoint"><Icon name="arrow" /></button>
        </div>
        <div className="encounter-progress">{checkpoints.map((item, i) => <span key={item.name} className={item.status === "completed" ? "done" : i === 0 ? "current" : ""} />)}</div>
      </div>
      <BottomNav screen="home" go={go} />
    </main>
  );
}

function Detail({ go }: { go: (screen: Screen) => void }) {
  return (
    <main className="screen app-screen">
      <div className="photo-hero">
        <img src={campusImage} alt="Modern university building beside a green lawn" />
        <div className="photo-overlay" />
        <button className="icon-btn floating" onClick={() => go("home")} aria-label="Go back"><Icon name="back" /></button>
        <span className="ready-pill">Ready to discover</span>
        <div className="photo-caption"><span>CHECKPOINT 4 OF 5</span><h1>Mensa</h1><p><Icon name="location" size={16} /> Bildungscampus 15</p></div>
      </div>
      <section className="content detail-content">
        <div className="distance-card"><div><span>You’re nearby</span><strong>120 m away</strong></div><div className="distance-icon"><Icon name="compass" /></div></div>
        <h2>Food, friends & a local ritual</h2>
        <p className="lead">The Mensa is more than lunch—it’s where campus paths cross. Find the entrance to unlock your quiz.</p>
        <div className="fun-fact"><span><Icon name="sparkles" /></span><div><strong>Fun fact</strong><p>“Mensa” is Latin for table. In Germany, it’s the common name for a university dining hall.</p></div></div>
        <div className="locked-quiz"><Icon name="lock" /><div><strong>Quiz locked</strong><span>Go there to unlock 3 questions · up to 300 pts</span></div></div>
        <div className="prototype-helper"><span>PROTOTYPE HELPER</span><p>Skip the walk and preview the on-site experience.</p><Button onClick={() => go("verifying")}><Icon name="location" /> Simulate arrival</Button><button onClick={() => go("verifyFail")}>Preview failed verification</button></div>
      </section>
    </main>
  );
}

function Verifying({ go }: { go: (screen: Screen) => void }) {
  useEffect(() => {
    const timer = window.setTimeout(() => go("quiz"), 1200);
    return () => window.clearTimeout(timer);
  }, [go]);
  return (
    <main className="screen state-screen">
      <div className="verify-animation"><div className="pulse p1" /><div className="pulse p2" /><span><Icon name="location" size={34} /></span></div>
      <div className="section-kicker">CHECKING GPS SIGNAL</div><h1>Verifying your location...</h1><p>Making sure you’re inside the Mensa checkpoint area.</p>
      <div className="signal-row"><span /><span /><span /><span /></div>
      <button className="text-link" onClick={() => go("verifyFail")}>Preview failure state</button>
    </main>
  );
}

function VerifyFail({ go }: { go: (screen: Screen) => void }) {
  return <StateMessage icon="compass" tone="warning" kicker="42 M OUTSIDE THE ZONE" title="You’re not in the zone yet" body="Walk a little closer to the Mensa entrance, then try again." primary="Retry location check" onPrimary={() => go("verifying")} secondary="Back to checkpoint" onSecondary={() => go("detail")} />;
}

function Quiz({ go, questionIndex, setQuestionIndex, setCorrect }: { go: (screen: Screen) => void; questionIndex: number; setQuestionIndex: (n: number) => void; setCorrect: (v: boolean) => void }) {
  const [seconds, setSeconds] = useState(300);
  const [selected, setSelected] = useState<number | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((s) => {
      if (s <= 1) { window.clearInterval(timer); go("expired"); return 0; }
      return s - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [go]);
  useEffect(() => setSelected(null), [questionIndex]);
  const q = questions[questionIndex];
  const timerTone = seconds < 30 ? "danger" : seconds < 60 ? "warning" : "";
  const time = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  return (
    <main className="screen quiz-screen">
      <PageHeader title="Mensa quiz" onBack={() => go("detail")} action={<span className="question-count">{questionIndex + 1}/3</span>} />
      <section className="quiz-content">
        <div className={`quiz-timer ${timerTone}`}><Icon name="clock" size={25} /><div><small>TIME REMAINING</small><strong>{time}</strong></div></div>
        <div className="verified-badge"><Icon name="shield" size={16} /> Location verified · Mensa</div>
        <div className="question-progress">{questions.map((_, i) => <span key={i} className={i <= questionIndex ? "filled" : ""} />)}</div>
        <div className="question-card">
          <div className="section-kicker">QUESTION {questionIndex + 1}</div>
          <h1>{q.question}</h1>
          <div className="answers">
            {q.options.map((answer, i) => <button key={answer} className={selected === i ? "answer selected" : "answer"} onClick={() => setSelected(i)}><span>{String.fromCharCode(65 + i)}</span>{answer}<i /></button>)}
          </div>
        </div>
        <Button disabled={selected === null} onClick={() => { setCorrect(selected === q.answer); go("feedback"); }}>Submit answer</Button>
        <div className="prototype-links"><span>Preview anti-cheat states:</span><button onClick={() => go("leftZone")}>Left zone</button><button onClick={() => go("mismatch")}>Location mismatch</button><button onClick={() => go("expired")}>Time’s up</button></div>
      </section>
    </main>
  );
}

function Feedback({ go, questionIndex, setQuestionIndex, correct }: { go: (screen: Screen) => void; questionIndex: number; setQuestionIndex: (n: number) => void; correct: boolean }) {
  const q = questions[questionIndex];
  const next = () => {
    if (questionIndex === questions.length - 1) go("complete");
    else { setQuestionIndex(questionIndex + 1); go("quiz"); }
  };
  return (
    <main className={`screen feedback-screen ${correct ? "is-correct" : "is-wrong"}`}>
      <button className="icon-btn feedback-close" onClick={() => go("home")} aria-label="Exit quiz and return to the map">
        <Icon name="back" />
      </button>
      {correct && <div className="confetti" aria-hidden="true">{Array.from({ length: 18 }).map((_, i) => <i key={i} />)}</div>}
      <div className="feedback-icon"><Icon name={correct ? "check" : "refresh"} size={39} /></div>
      <div className="section-kicker">{correct ? "NICE WORK" : "NOT QUITE"}</div>
      <h1>{correct ? "That’s correct!" : "Good try, Alex"}</h1>
      <p>{correct ? "You’re getting to know campus like a local." : "The right answer is:"}</p>
      {!correct && <div className="correct-answer">{q.options[q.answer]}</div>}
      <div className="points-burst">{correct ? "+100" : "+0"} <span>points</span></div>
      <div className="explanation"><Icon name="sparkles" /><p>{q.explanation}</p></div>
      <Button onClick={next}>{questionIndex === 2 ? "See checkpoint results" : "Next question"} <Icon name="arrow" /></Button>
      <Button variant="ghost" onClick={() => go("home")}>Exit quiz and return to map</Button>
    </main>
  );
}

function StateMessage({ icon, tone, kicker, title, body, primary, onPrimary, secondary, onSecondary }: { icon: IconName; tone: string; kicker: string; title: string; body: string; primary: string; onPrimary: () => void; secondary?: string; onSecondary?: () => void }) {
  return (
    <main className={`screen state-screen ${tone}`}>
      <div className="state-icon"><Icon name={icon} size={40} /></div><div className="section-kicker">{kicker}</div><h1>{title}</h1><p>{body}</p>
      <div className="state-actions"><Button onClick={onPrimary}>{primary}</Button>{secondary && <Button variant="secondary" onClick={onSecondary}>{secondary}</Button>}</div>
    </main>
  );
}

function Complete({ go }: { go: (screen: Screen) => void }) {
  return (
    <main className="screen complete-screen">
      <div className="celebration-rays" />
      <div className="earned-badge"><Icon name="badge" size={58} /><span>Mensa Maven</span></div>
      <div className="section-kicker">CHECKPOINT COMPLETE</div><h1>You mastered the Mensa!</h1><p>One more campus story added to your journey.</p>
      <div className="score-summary"><div><span>Quiz score</span><strong>300<small>/300</small></strong></div><div><span>Time bonus</span><strong>+50</strong></div><div className="score-total"><span>Total earned</span><strong>350 pts</strong></div></div>
      <div className="completion-progress"><div><span>Campus progress</span><strong>4 of 5</strong></div><div><i style={{ width: "80%" }} /></div></div>
      <Button onClick={() => go("leaderboard")}>View leaderboard <Icon name="leaderboard" /></Button>
      <Button variant="secondary" onClick={() => go("home")}>Next checkpoint</Button>
      <button className="text-link" onClick={() => go("final")}>Preview all 5 complete</button>
    </main>
  );
}

function Final({ go }: { go: (screen: Screen) => void }) {
  return (
    <main className="screen final-screen">
      <div className="confetti" aria-hidden="true">{Array.from({ length: 24 }).map((_, i) => <i key={i} />)}</div>
      <div className="final-badge"><Icon name="compass" size={72} /><span>CAMPUS<br />EXPLORER</span></div>
      <div className="section-kicker">QUEST COMPLETE</div><h1>All 5 checkpoints complete!</h1><p>You came, you explored, and now campus feels a little more like home.</p>
      <div className="final-stat"><span>Final score</span><strong>1,530 pts</strong><small>Top 5% of explorers</small></div>
      <Button onClick={() => go("leaderboard")}>See final ranking</Button><Button variant="secondary" onClick={() => go("profile")}>View my badges</Button>
    </main>
  );
}

function Leaderboard({ go }: { go: (screen: Screen) => void }) {
  const [tab, setTab] = useState("Individual");
  const displayLeaders = useMemo(() => tab === "Individual" ? leaders : tab === "Duo"
    ? [["Mina + Aya", "Japan", "🇯🇵", 2760], ["Noah + Lina", "Germany", "🇩🇪", 2640], ["Alex + Sam", "Spain", "🇪🇸", 2210], ...leaders.slice(3)]
    : [["Germany", "Germany", "🇩🇪", 8240], ["Spain", "Spain", "🇪🇸", 7910], ["India", "India", "🇮🇳", 7650], ...leaders.slice(3)] as typeof leaders, [tab]);
  return (
    <main className="screen app-screen leaderboard-screen">
      <PageHeader title="Leaderboard" action={<button className="icon-btn" aria-label="Leaderboard information"><Icon name="sparkles" /></button>} />
      <section className="leader-content">
        <div className="tabs">{["Individual", "Duo", "Nationality"].map((item) => <button className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)}>{item}</button>)}</div>
        <div className="update-note"><i /><span>Updates after every correct answer</span></div>
        <div className="podium">
          {[1, 0, 2].map((idx, order) => {
            const person = displayLeaders[idx] as readonly [string, string, string, number];
            return <div className={`podium-place place-${idx + 1}`} key={person[0]}><div className="podium-avatar">{person[0].charAt(0)}<span>{idx + 1}</span></div><strong>{person[0]}</strong><small>{person[2]} {person[3].toLocaleString()} pts</small><div className="podium-block">{idx + 1}</div></div>;
          })}
        </div>
        <div className="rank-list">
          {displayLeaders.slice(3).map((person, i) => <div className={`rank-row ${person[0].includes("Alex") ? "current" : ""}`} key={person[0]}><span className="rank-num">{i + 4}</span><span className="small-avatar">{person[0].charAt(0)}</span><span className="rank-name"><strong>{person[0]}</strong><small>{person[2]} {person[1]}</small></span><strong>{person[3].toLocaleString()} <small>pts</small></strong></div>)}
        </div>
      </section>
      <div className="pinned-user"><span>#8</span><span className="small-avatar">A</span><div><strong>You</strong><small>🇪🇸 Spain</small></div><strong>830 pts</strong></div>
      <BottomNav screen="leaderboard" go={go} />
    </main>
  );
}

function Profile({ go }: { go: (screen: Screen) => void }) {
  return (
    <main className="screen app-screen profile-screen">
      <PageHeader title="Your profile" />
      <section className="profile-content">
        <div className="profile-card"><div className="profile-avatar">A<span><Icon name="check" size={13} /></span></div><h1>Alex</h1><p>🇪🇸 Spain · Explorer since Welcome Week</p><button>Edit profile</button></div>
        <div className="profile-stats"><div><strong>830</strong><span>Total points</span></div><div><strong>3/5</strong><span>Completed</span></div><div><strong>#8</strong><span>Rank</span></div></div>
        <div className="section-row"><h2>Badges collected</h2><span>3 of 6</span></div>
        <div className="badge-grid">
          {["Early Explorer", "Book Finder", "Garden Guide"].map((badge, i) => <div className="badge-card" key={badge}><span><Icon name={i === 0 ? "compass" : i === 1 ? "badge" : "sparkles"} /></span><strong>{badge}</strong></div>)}
          <div className="badge-card locked"><span><Icon name="lock" /></span><strong>Mensa Maven</strong></div>
        </div>
        <div className="settings-list"><button><span><Icon name="users" /></span><div><strong>Duo partner</strong><small>Sam · GO-TEAM-24</small></div><Icon name="chevron" /></button><button><span><Icon name="shield" /></span><div><strong>Privacy & permissions</strong><small>Manage location access</small></div><Icon name="chevron" /></button><button onClick={() => go("welcome")}><span><Icon name="back" /></span><div><strong>Log out</strong><small>Sign out of campusGO</small></div><Icon name="chevron" /></button></div>
        <div className="question-bank-note">Prototype includes 3 questions for each checkpoint: {Object.entries(spotQuestions).map(([spot]) => spot).join(", ")} and Mensa.</div>
      </section>
      <BottomNav screen="profile" go={go} />
    </main>
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("welcome");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [correct, setCorrect] = useState(true);
  const go = (next: Screen) => {
    if (next === "quiz" && screen !== "feedback") setQuestionIndex(0);
    setScreen(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const props = { go };
  return (
    <div className="app-shell">
      <BrowserChrome />
      {screen === "welcome" && <Welcome {...props} />}
      {screen === "register" && <Register {...props} />}
      {screen === "permission" && <Permission {...props} />}
      {screen === "home" && <Home {...props} />}
      {screen === "detail" && <Detail {...props} />}
      {screen === "verifying" && <Verifying {...props} />}
      {screen === "verifyFail" && <VerifyFail {...props} />}
      {screen === "quiz" && <Quiz {...props} questionIndex={questionIndex} setQuestionIndex={setQuestionIndex} setCorrect={setCorrect} />}
      {screen === "feedback" && <Feedback {...props} questionIndex={questionIndex} setQuestionIndex={setQuestionIndex} correct={correct} />}
      {screen === "complete" && <Complete {...props} />}
      {screen === "final" && <Final {...props} />}
      {screen === "leaderboard" && <Leaderboard {...props} />}
      {screen === "profile" && <Profile {...props} />}
      {screen === "expired" && <StateMessage icon="clock" tone="danger" kicker="TIMER EXPIRED" title="Time’s up" body="This quiz is now locked. You can try again during a new visit to the checkpoint." primary="Back to checkpoint" onPrimary={() => go("detail")} secondary="View dashboard" onSecondary={() => go("home")} />}
      {screen === "leftZone" && <StateMessage icon="location" tone="warning" kicker="LOCATION PAUSED" title="You moved out of the checkpoint area" body="Return to the Mensa zone to continue. Your current answers are saved for now." primary="I’m back — verify again" onPrimary={() => go("verifying")} secondary="Exit quiz" onSecondary={() => go("home")} />}
      {screen === "mismatch" && <StateMessage icon="shield" tone="danger" kicker="VERIFICATION FAILED" title="We couldn’t verify your location" body="Answers only count on site. Check your browser permission and make sure precise location is on." primary="Try verification again" onPrimary={() => go("verifying")} secondary="Location help" onSecondary={() => go("permission")} />}
    </div>
  );
}
