// The pilot question bank from the "Main Project Document" (pages 7 to 14, questions written and checked on site by
// the team), with the team's photos (frontend/public/places/CampusGO_Photos). The seed puts it into the database once (BR11,
// seed.js: seedQuestionBank); after that admins edit the questions in the admin area. Change texts here only for
// new databases.
//
// Each question: difficulty, text, four options, the positions (0 to 3) of the right options and optional photos.
// Two right options make a multi-select question (MULTI, BR50); it is drawn only when the quest's question type
// allows multi-select. Photos: `shown: 'question'` appears with the question because it is needed to answer;
// `shown: 'answer'` appears only after answering, because it would give the answer away.

export const QUESTION_PHOTO_CREDIT = 'DHBW campusGO team';

const N = 'NORMAL';
const H = 'HARD';

/** One question. `right` holds the positions (0 to 3) of the right options. */
const q = (difficulty, text, options, right, photos = []) => ({
  difficulty,
  text,
  options,
  right,
  type: right.length > 1 ? 'MULTI' : 'MCQ',
  photos,
});

/** A photo of a question. `file` is relative to frontend/public. */
const photo = (file, alt, shown = 'answer') => ({ url: `/${file}`, alt, shown });

const BUILDING_B_Q04_PHOTOS = [
  photo(
    'places/CampusGO_Photos/Building_B/Q04/Building_B_Q04_NYP-FEN-wall-position_1.jpg',
    'Wall with the logos of the international partner universities',
  ),
  photo(
    'places/CampusGO_Photos/Building_B/Q04/Building_B_Q04_NYP-FEN-wall-position_2.jpg',
    'Sign "Semester im Ausland?" above the partner university logos',
  ),
];

const BUILDING_B_Q05_PHOTOS = [
  photo(
    'places/CampusGO_Photos/Building_B/Q05/Building_B_Q05_overseas-partners-count_1.jpg',
    'Wall with the logos of the international partner universities',
  ),
  photo(
    'places/CampusGO_Photos/Building_B/Q05/Building_B_Q05_overseas-partners-count_2.jpg',
    'Wall with the logos of the international partner universities',
  ),
];

const CAS_PRICES = [1, 2, 3, 4, 5, 6].map((n) =>
  photo(
    `places/CampusGO_Photos/CAS_Cafe/Q02/CAS_Cafe_Q02_price-difference_${n}.jpg`,
    'Muffin price tags at the CAS Cafe showing two prices',
  ),
);

export const QUESTION_BANK = {
  Mensa: [
    q(
      N,
      'How is the price of food calculated?',
      [
        'All meals cost the same',
        'Based on the weight of the food',
        'Each meal has a fixed price',
        'Based on the time of day',
      ],
      [1],
    ),
    q(
      N,
      'Which payment method is available at Mensa?',
      ['Cash only', 'Bank transfer only', 'Campus Card or guest card', 'All of the above'],
      [2],
    ),
    q(
      N,
      'When is Mensa usually open on weekdays?',
      [
        'From 7:30 a.m. to 3:00 p.m.',
        'From 9:00 a.m. to 5:00 p.m.',
        'From 8:00 a.m. to 8:00 p.m.',
        'It is open 24 hours a day',
      ],
      [0],
    ),
    q(
      N,
      'Is Mensa open on Saturdays?',
      [
        'No, it is always closed',
        'Yes, from 11:00 a.m. to 2:00 p.m.',
        'Yes, from 7:30 a.m. to 3:00 p.m.',
        'Only during exam weeks',
      ],
      [1],
    ),
    q(N, 'Where is Mensa located?', ['Building 5', 'Building 6', 'Building 7', 'Building 8'], [3]),
    q(
      N,
      'Where can you get a guest card to pay at Mensa?',
      [
        'At the university library',
        'At the secretary office',
        'On site at Mensa',
        'At vending machines',
      ],
      [2],
    ),
    q(
      N,
      'Where are the trays returned after eating?',
      ['At the entrance', 'At any empty table', 'At the cashier', 'At a designated return station'],
      [3],
    ),
    q(
      N,
      'Where are the restrooms located in Mensa?',
      [
        'On the same floor where you can top up your Campus Card',
        'On the same floor as the dining area',
        'There are no restrooms in Mensa',
        'In the middle of Mensa',
      ],
      [1],
    ),
    q(
      H,
      'How many steps are there on the Mensa staircase?',
      ['27', '28', '29', '30'],
      [1],
      [
        photo(
          'places/CampusGO_Photos/Mensa/Mensa_Q09_staircase-steps.jpg',
          'Hall with the staircase up to the Mensa',
        ),
      ],
    ),
    q(
      H,
      'How many tray stations are in Mensa?',
      ['15', '18', '20', '22'],
      [2],
      [
        photo(
          'places/CampusGO_Photos/Mensa/Mensa_Q10_tray-stations.jpg',
          'Stacks of trays and cutlery at a tray station',
        ),
      ],
    ),
    q(
      H,
      'How many trash bins are in the tray return area?',
      ['1', '2', '3', '4'],
      [2],
      [
        photo(
          'places/CampusGO_Photos/Mensa/Mensa_Q11_trash-bins.jpg',
          'Tray return counter with openings for waste',
        ),
      ],
    ),
  ],

  'Building B': [
    q(N, 'How many floors can you access in Building B?', ['1', '2', '3', '4'], [3]),
    q(
      N,
      'What is the building number of Building B on the Bildungscampus?',
      ['Building 3', 'Building 4', 'Building 5', 'Building 8'],
      [1],
      [
        photo(
          'places/CampusGO_Photos/Building_B/Q02/Building_B_Q02_building-number_1.jpg',
          'Entrance of Building B with its building number',
        ),
        photo(
          'places/CampusGO_Photos/Building_B/Q02/Building_B_Q02_building-number_2.jpg',
          'Glass doors of Building B with the number beside them',
        ),
      ],
    ),
    q(
      N,
      'Can you top up your Campus Card in this building?',
      [
        'Yes, on the first floor.',
        'Yes, on the second floor.',
        'Yes, on the third floor.',
        'No, there is no top-up machine in this building.',
      ],
      [0],
    ),
    q(
      N,
      'What position is NYP and FEN UChile located on the wall?',
      ['11 and 21', '10 and 20', '10 and 21', '11 and 20'],
      [2],
      BUILDING_B_Q04_PHOTOS,
    ),
    q(
      N,
      'How many overseas university partners are on the wall?',
      ['20', '21', '22', '23'],
      [1],
      BUILDING_B_Q05_PHOTOS,
    ),
    q(
      N,
      'Where are the IT support rooms located?',
      ['B.0.07', 'B.0.08', 'B.0.09', 'B.0.10'],
      [2, 3],
    ),
    q(
      N,
      'If you are looking for room B.1.06, which floor should you go to?',
      ['Floor B', 'Floor 08', 'Floor 1', 'Building B'],
      [2],
    ),
    q(
      N,
      'What time does Building B close?',
      ['4:00 p.m.', '5:00 p.m.', '6:00 p.m.', 'Building B does not close'],
      [1],
    ),
    q(
      H,
      'What is the room number of the Besprechung room (meeting room)?',
      ['B.2.15', 'B.3.30', 'B.3.25', 'B.1.12'],
      [1],
    ),
    q(H, 'How many classrooms are in Building B?', ['24-27', '28-30', '31-33', '34-37'], [0]),
    q(H, 'How many steps are in Building B?', ['57-60', '61-64', '65-68', '69-72'], [2]),
  ],

  'Building C': [
    q(
      N,
      'If you are looking for room C.1.14, which floor should you go to?',
      ['First floor', 'C floor', 'Fourteenth floor', 'Building C'],
      [0],
    ),
    q(N, 'How many floors can you access in Building C?', ['1', '2', '3', '4'], [2]),
    q(
      N,
      'Can you top up your Campus Card in this building?',
      [
        'Yes, on the first floor',
        'Yes, on the second floor',
        'Yes, on the third floor',
        'No, there is no top-up machine in this building',
      ],
      [3],
    ),
    q(
      N,
      "What is the room number of the women's restroom on the second floor of the building?",
      ['R.2.13', 'R.2.14', 'R.3.14', 'R.4.16'],
      [1],
    ),
    q(
      N,
      'What is the building number of Building C on the Bildungscampus?',
      ['Building 3', 'Building 4', 'Building 5', 'Building 8'],
      [2],
    ),
    q(
      N,
      'What is the room number of Prof. Dr. Aliona von der Trenck in Building C?',
      ['C.0.01', 'C.0.02', 'C.0.03', 'C.0.04'],
      [1],
    ),
    q(
      N,
      'On which floor is the bridge from Building B to Building C?',
      ['Floor 0', 'Floor 1', 'Floor 2', 'There is no bridge'],
      [2],
    ),
    q(
      N,
      'How many study tables are there on the second floor of Building C?',
      ['1', '2', '3', '4'],
      [2],
    ),
    q(
      H,
      'Where is the Kopierraum (copy room) located in Building C?',
      ['C.0.05', 'C.1.05', 'C.2.05', 'C.2.06'],
      [1],
    ),
    q(H, 'How many steps are in Building C?', ['40-45', '46-50', '51-56', '57-61'], [0]),
    q(
      H,
      'How many offices are there on the ground floor of Building C?',
      ['9', '10', '11', '12'],
      [2],
    ),
  ],

  Library: [
    q(
      N,
      'What does the first number, "3", on the bookshelf shown in the picture represent?',
      ['The floor number', 'The shelf number', 'The book category', 'The section number'],
      [0],
      [
        photo(
          'places/CampusGO_Photos/Library/Library_Q01_shelf-number.jpg',
          'Library shelf with the label "3 11 2 3" under the books',
          'question',
        ),
      ],
    ),
    q(
      N,
      'How many rows are there on one bookshelf?',
      ['4', '5', '6', '7'],
      [2],
      [
        photo(
          'places/CampusGO_Photos/Library/Library_Q02_shelf-rows.jpg',
          'A full library bookshelf seen from the aisle',
        ),
      ],
    ),
    q(
      N,
      'On which floor can you find the category "Product and Management"?',
      ['2', '3', '4', '5'],
      [2],
      [1, 2, 3].map((n) =>
        photo(
          `places/CampusGO_Photos/Library/Q03/Library_Q03_category-floor_${n}.jpg`,
          'Shelf sign of the LIV library naming the floor and the categories',
        ),
      ),
    ),
    q(
      N,
      'How long can you borrow a book without renewing it?',
      ['20 days', '21 days', '22 days', 'You can keep it for as long as you want'],
      [1],
    ),
    q(
      N,
      "If you are reading a book in the library but haven't borrowed it, where should you return it when you are finished?",
      [
        'Throw it out the window',
        'Bring it home with you',
        'Place it on a book return trolley',
        'Give it to your friend',
      ],
      [2],
      [1, 2].map((n) =>
        photo(
          `places/CampusGO_Photos/Library/Q05/Library_Q05_book-return-trolley_${n}.jpg`,
          'Library floor with a book return trolley beside the shelves',
        ),
      ),
    ),
    q(
      N,
      'Which floors are the quiet floors?',
      ['Floor 2', 'Floor 3', 'Floor 4', 'Floor 5'],
      [2, 3],
    ),
    q(
      N,
      'What can you do on the third floor of the library?',
      [
        'Study and work in a quiet environment',
        "Sleep overnight like it's a hotel",
        'Practice a presentation out loud',
        'Organize your own music festival',
      ],
      [0],
    ),
    q(
      N,
      'Where is the water refill station located?',
      ['Next to the book return', 'Outside the library', 'On the top floor', 'Beside the lift'],
      [0],
    ),
    q(
      H,
      'On which of these bookshelves can you find the book "SAP ERP"?',
      ['5 13 10 3', '5 10 13 3', '4 13 10 3', '4 10 13 5'],
      [0],
      [
        photo(
          'places/CampusGO_Photos/Library/Q09/Library_Q09_SAP-ERP-shelf_1.jpg',
          'SAP ERP books on a shelf labelled "5 13 10 3"',
        ),
        photo(
          'places/CampusGO_Photos/Library/Q09/Library_Q09_SAP-ERP-shelf_2.jpg',
          'Shelf sign for row 13 on the fifth floor',
        ),
      ],
    ),
    q(
      H,
      'How many restrooms (including accessible toilets) are in the LIV?',
      ['12', '13', '14', '15'],
      [2],
    ),
    q(
      H,
      'What does the R in R.1.40 stand for?',
      ['Meeting room', 'Restroom', 'Bookshelf', 'Computer room'],
      [1],
      [
        photo(
          'places/CampusGO_Photos/Library/Library_Q11_R-restroom-sign.jpg',
          'Restroom doors with R room number signs',
        ),
      ],
    ),
  ],

  Sensoricum: [
    q(
      N,
      'How many of these lights are there on the first floor?',
      ['8', '9', '10', '11'],
      [2],
      [1, 2].map((n) =>
        photo(
          `places/CampusGO_Photos/Sensoricum/Q01/Sensoricum_Q01_lights_${n}.jpg`,
          'Ceiling lights below the glass roof of the Sensoricum',
          'question',
        ),
      ),
    ),
    q(
      N,
      'What is the room number of the Kulinarik Lab (culinary lab)?',
      ['CO.0.10', 'CO.0.11', 'CO.1.10', 'CO.1.11'],
      [0],
    ),
    q(N, 'How many Toiletten (restrooms) are there in the building?', ['1', '2', '3', '4'], [1]),
    q(
      N,
      'What is the main focus of the Sensoricum building?',
      [
        'Food, sensory perception and health research',
        'Medical diagnosis and surgery',
        'Digital technology and software development',
        'Environmental protection and climate research',
      ],
      [0],
    ),
    q(
      N,
      'What is the room number of the Sensoricum Büro Labore office?',
      ['CO.1.12', 'CO.1.13', 'CO.1.14', 'CO.1.15'],
      [2],
    ),
    q(
      N,
      'How many windows are there in the hallway on the first floor?',
      ['1', '2', '3', '4'],
      [3],
    ),
    q(
      N,
      'Which of the following activities can you perform in the Hygiene and Health Lab?',
      [
        'Analyze microorganisms and conduct hygiene tests',
        'Prepare meals and develop new recipes',
        'Test the taste and smell of different foods',
        'Repair computers and electronic devices',
      ],
      [0],
    ),
  ],

  'CAS Cafe': [
    q(
      N,
      'How many of these lights are there in the CAS?',
      ['5', '6', '7', '8'],
      [2],
      [
        photo(
          'places/CampusGO_Photos/CAS_Cafe/CAS_Cafe_Q01_lights.jpg',
          'Orange pendant light hanging from the ceiling of the CAS Cafe',
          'question',
        ),
      ],
    ),
    q(
      N,
      'What is the price difference between paying with a Campus Card and paying normally?',
      ['€0.30', '€0.40', '€0.50', '€0.60'],
      [1],
      CAS_PRICES,
    ),
    q(
      N,
      'When is the CAS usually closed on weekdays?',
      [
        'From 7:30 a.m. to 5:00 p.m.',
        'From 9:00 a.m. to 5:00 p.m.',
        'From 5:00 p.m. to 7:30 a.m.',
        'It is open 24 hours a day',
      ],
      [2],
    ),
    q(
      N,
      'Where is the CAS Cafe located?',
      ['Building 13', 'Building 12', 'Building 11', "There's no number"],
      [0],
      [
        photo(
          'places/CampusGO_Photos/CAS_Cafe/CAS_Cafe_Q04_location.jpg',
          'CAS letters in front of the CAS Cafe building',
        ),
      ],
    ),
    q(N, 'How many types of tea are available at the cafeteria?', ['9', '10', '11', '12'], [3]),
    q(
      N,
      'Which of the following payment methods is available at the CAS Cafe?',
      ['Credit card', 'Debit card', 'Cash', 'None of the above'],
      [2],
    ),
  ],

  'Care.box and Shop.box': [
    q(
      N,
      'When can you use the shop.box?',
      [
        'Only during Mensa opening hours',
        '24 hours a day, 7 days a week',
        'Only on weekdays',
        'Only during exam periods',
      ],
      [1],
    ),
    q(
      N,
      'What do you need to do before shopping at the shop.box?',
      [
        'Register in the shop.box app',
        'Get a Campus Card',
        'Ask a staff member for permission',
        'Show your student ID',
      ],
      [0],
    ),
    q(
      N,
      'Which payment methods are accepted at the shop.box?',
      ['Cash and Campus Card', 'Bank transfer and PayPal', 'Credit card and Klarna', 'Only cash'],
      [2],
    ),
    q(
      N,
      'In which languages are digital medical consultations available at the care.box?',
      ['German and French', 'English and Spanish', 'German and English', 'English only'],
      [2],
    ),
    q(
      N,
      'How early should you arrive at the care.box before your appointment?',
      ['5 minutes', '10 minutes', '15 minutes', '30 minutes'],
      [2],
    ),
    q(
      N,
      'Where is the care.box located?',
      [
        'Next to Mensa',
        'Next to the shop.box',
        'Inside the LIV library',
        'Next to the main entrance of Building C',
      ],
      [1],
      [1, 2, 3].map((n) =>
        photo(
          `places/CampusGO_Photos/Care.box_and_Shop.box/Q06/Care.box_and_Shop.box_Q06_care.box-location_${n}.jpg`,
          'The care.box and the shop.box side by side on the campus square',
        ),
      ),
    ),
  ],

  'Campus Garden': [
    q(
      N,
      'In which building can you find the Campus Garden?',
      ['Building 1', 'Building 4', 'Building 8', 'Building C'],
      [0],
    ),
    q(
      N,
      'What kind of meals does the Campus Garden offer?',
      [
        'Only breakfast and lunch',
        'Breakfast, snacks, lunch and à la carte dinner',
        'Only snacks and drinks',
        'Only lunch and dinner',
      ],
      [1],
    ),
    q(
      N,
      'How are starters, snacks and lunch served during the day?',
      ['À la carte', 'By reservation only', 'Self-service', 'Only through vending machines'],
      [2],
    ),
    q(
      N,
      'Which payment methods can you use during the day?',
      ['Only Campus Card', 'Cash or card', 'Only cash', 'Cash or Campus Card'],
      [1],
    ),
    q(
      N,
      'What do students and Bildungscampus employees need to show to receive discounted prices?',
      ['Their student ID', 'Their passport', 'Their Campus Card', 'Their university registration'],
      [2],
    ),
    q(
      N,
      'How is the à la carte dinner served?',
      ['Self-service', 'Through vending machines', 'It is served by staff', 'Only as takeaway'],
      [2],
    ),
  ],
};

// What students read before a quiz (info page and map sheet): one short description and up to five facts per quest
// (BR09, R-62). Taken only from the questions above (the team's document, checked on site): every normal question
// can be answered from them. Hard questions (2,000 points) are about what you see on the spot (steps, shelves,
// rooms), so their fact says where to look, not the number. The seed puts these in once; after that admins edit
// them in the admin area (Quests).
export const QUEST_INFO = {
  Mensa: {
    description: 'The Mensa is the campus canteen of the Bildungscampus, in Building 8.',
    facts: [
      'Opening hours: Monday to Friday from 7:30 a.m. to 3:00 p.m., Saturday from 11:00 a.m. to 2:00 p.m.',
      "Your meal's price is based on its weight. Pay with your Campus Card or a guest card; you can get a guest card on site at the Mensa.",
      'After eating, bring your tray to the designated tray return station. The restrooms are on the same floor as the dining area.',
      'Hard questions (2,000 points) are about what you can see here: count the steps of the Mensa staircase, the tray stations and the trash bins in the tray return area.',
    ],
  },
  'Building B': {
    description:
      'Building B is Building 4 of the Bildungscampus, a DHBW building with classrooms, offices and the IT support.',
    facts: [
      'Building B is Building 4 on the Bildungscampus. You can use 4 floors, and the building closes at 5:00 p.m.',
      'Room numbers read building.floor.room: B.1.06 is in Building B on floor 1. The IT support is in rooms B.0.09 and B.0.10.',
      'You can top up your Campus Card on the first floor.',
      'The wall "Semester im Ausland?" shows the logos of the 21 overseas partner universities. On it, NYP is in position 10 and FEN UChile in position 21.',
      'Hard questions (2,000 points): find the meeting room (Besprechung), and count the classrooms and the steps as you walk through the building.',
    ],
  },
  'Building C': {
    description:
      'Building C is Building 5 of the Bildungscampus, a DHBW building with offices and study tables, linked to Building B by a bridge.',
    facts: [
      'Building C is Building 5 on the Bildungscampus. You can use 3 floors; the bridge from Building B is on floor 2.',
      "Room numbers read building.floor.room: C.1.14 is on the first floor. Prof. Dr. Aliona von der Trenck's office is C.0.02. Restroom numbers start with R: the women's restroom on the second floor is R.2.14.",
      'There is no Campus Card top-up machine in this building (Building B has one on the first floor). The second floor has 3 study tables.',
      'Hard questions (2,000 points): find the copy room (Kopierraum), count the steps, and count the offices on the ground floor.',
    ],
  },
  Library: {
    description:
      'The LIV is the library of the Bildungscampus: borrow books, study on the quiet floors and find shelves sorted by floor and category.',
    facts: [
      "Shelf labels start with the floor number: a label beginning with 3 is on floor 3. Each bookshelf has 6 rows. The category 'Product and Management' is on floor 4.",
      'You can borrow a book for 21 days without renewing it. If you read a book here without borrowing it, place it on a book return trolley when you are done.',
      'Floors 4 and 5 are the quiet floors. The third floor is also for studying and working in a quiet environment.',
      'The water refill station is next to the book return.',
      "Hard questions (2,000 points): find the shelf with the book 'SAP ERP', count the restrooms in the LIV (accessible toilets included), and find out what the R in room numbers such as R.1.40 stands for.",
    ],
  },
  Sensoricum: {
    description:
      'The DHBW Sensoricum, the grey building beside the Bildungscampus car park next to Building C, is a research building for food, sensory perception and health.',
    facts: [
      "The Sensoricum's main focus is food, sensory perception and health research. In the Hygiene and Health Lab you analyze microorganisms and conduct hygiene tests.",
      'Room numbers start with CO: the Kulinarik Lab (culinary lab) is CO.0.10 and the Sensoricum Büro Labore office is CO.1.14.',
      'The building has 2 restrooms (Toiletten). On the first floor there are 10 of the lights shown in the quiz photo, and the hallway there has 4 windows.',
    ],
  },
  'CAS Cafe': {
    description: 'The CAS Cafe is the cafeteria in Building 13 of the Bildungscampus.',
    facts: [
      'The CAS Cafe is in Building 13. On weekdays it is open from 7:30 a.m. to 5:00 p.m. and closed from 5:00 p.m. to 7:30 a.m.',
      'Paying with a Campus Card costs €0.40 less than the normal price; the price tags show both prices. You can also pay in cash.',
      'There are 12 types of tea, and 7 of the lights shown in the quiz photo hang in the CAS.',
    ],
  },
  'Care.box and Shop.box': {
    description:
      'The shop.box is a self-service shop and the care.box a place for digital medical consultations. They stand next to each other on the Bildungscampus.',
    facts: [
      'The shop.box is open 24 hours a day, 7 days a week. Before shopping, register in the shop.box app. You pay with credit card or Klarna.',
      'The care.box is next to the shop.box. It offers digital medical consultations in German and English; arrive 15 minutes before your appointment.',
    ],
  },
  'Campus Garden': {
    description:
      'The Campus Garden is the restaurant in Building 1 of the Bildungscampus, open from breakfast to dinner.',
    facts: [
      'The Campus Garden is in Building 1. It offers breakfast, snacks, lunch and an à la carte dinner.',
      'During the day, starters, snacks and lunch are self-service, and you pay with cash or card. In the evening the à la carte dinner is served by staff.',
      'Students and Bildungscampus employees get discounted prices when they show their Campus Card.',
    ],
  },
};
