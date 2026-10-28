import { getLang } from "./i18n";
export const SCHOOL_RE = /^[^\s@]+@heilbronn\.dhbw\.de$/i;

export type Q = { q: string; o: string[]; a: number };
export type CP = {
  id: string;
  name: string;
  x: number;
  y: number;
  dist: number;
  count: 5 | 3;
  pass: number;
  facts: string[];
  qs: Q[];
  hard?: Q;
};
export type AvatarT = { kind: "preset"; i: number } | { kind: "img"; url: string };
export type Prog = { attempts: number; cleared: boolean; bestScore: number; awarded: number; bestCorrect: number };

const q = (text: string, o: string[], a: number): Q => ({ q: text, o, a });

export const CPS: CP[] = [
  {
    id: "mensa",
    name: "Mensa",
    x: 26,
    y: 58,
    dist: 38,
    count: 5,
    pass: 4,
    facts: [
      "Lunch is served from 11:30 to 14:00 on weekdays.",
      "Pay with your student ID card. Top it up at the terminal by the entrance.",
      "A vegetarian and a vegan main course are on the menu every day.",
    ],
    qs: [
      q("When does lunch service start?", ["10:00", "11:30", "12:30", "13:00"], 1),
      q("How do you pay at the Mensa?", ["Cash only", "Meal vouchers", "Student ID card", "Crypto"], 2),
      q("Which main courses are offered every day?", ["Only salad", "Fish only", "None", "Vegetarian and vegan"], 3),
      q("Where do you top up your card?", ["Library desk", "Terminal by the entrance", "Cafeteria", "Online only"], 1),
      q("What do you do with your tray when you finish?", ["Take it home", "Leave it on the table", "Return it at the belt", "Hand it to a guard"], 2),
    ],
    hard: q("You top up 20 EUR, then buy a 4.30 EUR main and a 1.20 EUR drink. What is left?", ["14.50 EUR", "15.50 EUR", "13.80 EUR", "12.50 EUR"], 0),
  },
  {
    id: "library",
    name: "Library",
    x: 66,
    y: 32,
    dist: 180,
    count: 5,
    pass: 4,
    facts: [
      "Open Monday to Friday, 8:00 to 20:00. The first floor is a quiet zone.",
      "Loans last 4 weeks and can be renewed online twice.",
      "Group study rooms can be booked at the front desk.",
    ],
    qs: [
      q("Which floor is the quiet zone?", ["Ground", "First", "Basement", "Roof"], 1),
      q("How long is a standard loan?", ["1 week", "2 weeks", "4 weeks", "6 months"], 2),
      q("How often can you renew online?", ["Never", "Once", "Twice", "Unlimited"], 2),
      q("Where do you book a group room?", ["Front desk", "Mensa", "Care.box", "Containers"], 0),
      q("When does the library close on weekdays?", ["16:00", "18:00", "20:00", "22:00"], 2),
    ],
    hard: q("A book is borrowed and renewed twice. How many weeks can you keep it in total?", ["8", "10", "12", "16"], 2),
  },
  {
    id: "cafe",
    name: "CAS Cafe",
    x: 44,
    y: 44,
    dist: 45,
    count: 5,
    pass: 4,
    facts: [
      "Coffee, snacks and sandwiches from 7:30.",
      "Bring a reusable cup and get 30 cents off.",
      "A free water refill station stands next to the counter.",
    ],
    qs: [
      q("When does the cafe open?", ["6:00", "7:30", "9:00", "11:00"], 1),
      q("How much do reusable cups save you?", ["10 cents", "30 cents", "1 euro", "Nothing"], 1),
      q("What is free next to the counter?", ["Water refill", "Phone charger", "Printer", "Umbrellas"], 0),
      q("What can you get at CAS Cafe?", ["Textbooks", "Bike repair", "Coffee and sandwiches", "Haircuts"], 2),
      q("What is the smart way to save money here?", ["Pay in coins", "Bring a reusable cup", "Arrive late", "Skip lunch"], 1),
    ],
    hard: q("A coffee costs 2.40 EUR. With a reusable cup, what do 5 coffees cost?", ["12.00 EUR", "9.00 EUR", "10.50 EUR", "10.00 EUR"], 2),
  },
  {
    id: "garden",
    name: "Campus Garden",
    x: 22,
    y: 76,
    dist: 240,
    count: 5,
    pass: 4,
    facts: [
      "The herb beds are tended by student volunteers.",
      "Picnic tables are free to use. No glass bottles, please.",
      "The garden is a quiet zone after 20:00.",
    ],
    qs: [
      q("Who tends the herb beds?", ["Robots", "Student volunteers", "The city council", "Nobody"], 1),
      q("What is not allowed in the garden?", ["Laptops", "Books", "Glass bottles", "Bikes"], 2),
      q("What do the picnic tables cost?", ["5 EUR per hour", "1 EUR per hour", "Reservation only", "Free"], 3),
      q("What happens in the garden after 20:00?", ["Concert", "Quiet zone", "Market", "It closes forever"], 1),
      q("What grows in the beds?", ["Herbs", "Palm trees", "Cacti", "Bananas"], 0),
    ],
    hard: q("You start a 2 hour study session at 18:45. How does it relate to quiet hours?", ["Ends before them", "Ends exactly at 20:00", "Ends 45 min into them", "Ends at midnight"], 2),
  },
  {
    id: "care",
    name: "Care.box and Shop.box",
    x: 70,
    y: 58,
    dist: 260,
    count: 5,
    pass: 4,
    facts: [
      "Care.box offers free hygiene and first-aid basics.",
      "Shop.box is a card-only cabinet with stationery and snacks.",
      "Both boxes are open 24/7 with your student ID.",
    ],
    qs: [
      q("What does Care.box offer?", ["Hygiene and first-aid basics", "Furniture", "Pizza", "Bike rental"], 0),
      q("How do you pay at Shop.box?", ["Coins only", "Card only", "Invoice", "Barter"], 1),
      q("When are the boxes open?", ["Weekdays only", "Lunch only", "24/7", "Closed Sundays"], 2),
      q("What opens the boxes?", ["Fingerprint", "Password", "Postcard", "Student ID"], 3),
      q("What does Shop.box sell?", ["Cars", "Furniture", "Stationery and snacks", "Houses"], 2),
    ],
    hard: q("A box is open 24/7. How many hours is that per week?", ["120", "144", "168", "192"], 2),
  },
  {
    id: "bb",
    name: "Building B",
    x: 26,
    y: 34,
    dist: 210,
    count: 3,
    pass: 2,
    facts: ["Building B hosts lecture halls B1 to B4.", "Printers are on the ground floor.", "Elevators are marked with a red sign."],
    qs: [
      q("Which halls are in Building B?", ["A1 to A4", "B1 to B4", "C1 to C4", "D1 to D4"], 1),
      q("Where are the printers?", ["Ground floor", "Roof", "Basement", "Garden"], 0),
      q("How are elevators marked?", ["Blue star", "Green door", "Red sign", "Yellow line"], 2),
    ],
  },
  {
    id: "bc",
    name: "Building C",
    x: 52,
    y: 66,
    dist: 120,
    count: 3,
    pass: 2,
    facts: ["Building C holds the IT labs.", "Labs need your student login.", "Open until 21:00 on weekdays."],
    qs: [
      q("What does Building C hold?", ["IT labs", "Swimming pool", "Cinema", "Hotel"], 0),
      q("What do the labs need?", ["Passport", "Student login", "Cash", "Key card from town"], 1),
      q("Until when is Building C open on weekdays?", ["17:00", "19:00", "21:00", "23:00"], 2),
    ],
  },
  {
    id: "containers",
    name: "Sensoricum",
    x: 76,
    y: 76,
    dist: 310,
    count: 3,
    pass: 2,
    facts: ["The containers host project teams and workshops.", "Book a container through the student portal.", "Maximum 6 people per container."],
    qs: [
      q("Who uses the containers?", ["Project teams and workshops", "Only staff", "Delivery drivers", "Nobody"], 0),
      q("How do you book one?", ["Phone call", "Student portal", "Letter", "At the Mensa"], 1),
      q("How many people fit in one container?", ["2", "4", "6", "20"], 2),
    ],
  },
];

export const CITY = [
  { id: "rewe", name: "Rewe", x: 30, y: 40 },
  { id: "lidl", name: "Lidl", x: 68, y: 34 },
  { id: "bahnhof", name: "Bahnhof", x: 24, y: 64 },
  { id: "markt", name: "Marktplatz", x: 66, y: 60 },
];

export const initialProg = (): Record<string, Prog> => {
  const p: Record<string, Prog> = {};
  CPS.forEach((c) => (p[c.id] = { attempts: 0, cleared: false, bestScore: 0, awarded: 0, bestCorrect: 0 }));
  p.library = { attempts: 1, cleared: true, bestScore: 4620, awarded: 4620, bestCorrect: 5 };
  p.cafe = { attempts: 1, cleared: false, bestScore: 0, awarded: 0, bestCorrect: 2 };
  return p;
};

export const totalPoints = (p: Record<string, Prog>) => Object.values(p).reduce((s, x) => s + x.awarded, 0);

export type Row = { name: string; pts: number; at: number; you?: boolean; members?: number };

export const SOLO: Row[] = [
  { name: "Mira K.", pts: 9420, at: 3 },
  { name: "Jonas W.", pts: 8910, at: 1 },
  { name: "Aiko T.", pts: 8910, at: 2 },
  { name: "Diego R.", pts: 7340, at: 4 },
  { name: "Priya S.", pts: 6120, at: 5 },
  { name: "Lena B.", pts: 5480, at: 6 },
  { name: "Omar H.", pts: 4980, at: 7 },
  { name: "Chloe D.", pts: 4100, at: 8 },
  { name: "Tomas V.", pts: 3250, at: 9 },
  { name: "Nina P.", pts: 2100, at: 10 },
];

export const TEAMS: Row[] = [
  { name: "Night Owls", pts: 14200, at: 1, members: 4 },
  { name: "Stack Overflowers", pts: 12850, at: 2, members: 5 },
  { name: "Late Lectures", pts: 9300, at: 3, members: 3 },
  { name: "Coffee Addicts", pts: 7600, at: 4, members: 2 },
  { name: "Lone Wolf", pts: 3100, at: 5, members: 1 },
];

export function ranked(rows: Row[]) {
  const sorted = [...rows].sort((a, b) => b.pts - a.pts || a.at - b.at);
  return sorted.map((r) => ({ ...r, rank: sorted.findIndex((x) => x.pts === r.pts) + 1 }));
}

export const youRank = (pts: number) => ranked([...SOLO, { name: "You", pts, at: 99, you: true }]).find((r) => r.you)!.rank;

export const fmt = (n: number) => n.toLocaleString(getLang() === "de" ? "de-DE" : "en-US");
export const mmss = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, s) % 60).padStart(2, "0")}`;
export const ATTEMPT_MULT = [1, 0.85, 0.7, 0.55, 0.4];
