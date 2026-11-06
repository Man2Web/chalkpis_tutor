/**
 * The 7 class-type pages (/for/<slug>), one per kind of class in the app's sign-up list (decision: the app's 7).
 * Field names, batch examples and poster titles are the app's own (app/src/i18n/en.json → categories), so every page
 * describes what the app really shows for that kind of class. Student names and numbers are illustrations.
 */
export interface ClassKind {
  slug: string;
  /** Short name for links: "dance and music classes". */
  label: string;
  /** Footer and nav label: "Dance and music". */
  short: string;
  title: string;
  description: string;
  askers: string;
  centre: string;
  /** The hero question; the second part is shown in blue. */
  heroQ: [string, string];
  /** The question above the batches row. */
  batchQ: string;
  lead: string;
  batch: string;
  count: string;
  /** [name, absent?] */
  students: [string, boolean][];
  absentFull: string;
  fitTitle: string;
  batchTitle: string;
  levelLabel: string;
  batchBody: string;
  batches: [string, string, string][];
  fees: [string, string, boolean][];
  paid: string;
  posterTitle: string;
  winnersHeadline: string;
  winnersSubline: string;
  winners: [string, string][];
  faq: { q: string; a: string };
}

export const CLASSES: ClassKind[] = [
  {
    slug: 'tuition-classes', label: 'tuition classes', short: 'Tuition classes',
    title: 'App for tuition classes: attendance, fees and marks · ChalkPis Tutor',
    description: 'Run your tuition centre from your phone: attendance by class and subject, fee reminders with your own UPI QR, test marks and report cards, and WhatsApp updates to parents. Free for 7 days.',
    askers: 'tuition teachers', centre: 'Vidya Tuition Centre',
    heroQ: ['Still collecting tuition fees ', 'one parent at a time?'], batchQ: 'Batches for every class and subject getting mixed up?',
    lead: 'Take attendance for Class 10 Maths in seconds, remind parents about fees with your own UPI QR, and keep every test mark in one place.',
    batch: 'Class 10 Maths', count: '23 present · 1 absent',
    students: [['Ananya R.', false], ['Riya S.', true], ['Sai K.', false], ['Meera P.', false]], absentFull: 'Riya Shah',
    fitTitle: 'Set up the way your tuition centre already works',
    batchTitle: 'Batches by class and subject', levelLabel: 'Class',
    batchBody: 'Every batch has a subject, like Maths, and a class, like Class 10. Students carry their class too, and it shows in reports and on report cards.',
    batches: [['Class 10 Maths', 'Class 10', '24 students'], ['Class 9 Science', 'Class 9', '18 students'], ['Class 12 Physics', 'Class 12', '12 students']],
    fees: [['Riya Shah', '₹1,500', false], ['Sai Kumar', '₹1,500', true], ['Meera Pillai', '₹1,500', true]], paid: '54 of 64 paid',
    posterTitle: 'Show off your toppers', winnersHeadline: 'Our toppers', winnersSubline: 'Congratulations on your excellent results!',
    winners: [['Ananya Rao', '98% • Class 10'], ['Sai Kumar', '96% • Class 10']],
    faq: { q: 'Can I keep test marks and report cards?', a: 'Yes. Add a test for a batch and enter the marks. Each student gets a report card with their class and results.' },
  },
  {
    slug: 'coaching-institutes', label: 'coaching institutes', short: 'Coaching institutes',
    title: 'App for coaching institutes: JEE, NEET and board batches · ChalkPis Tutor',
    description: 'Attendance for every JEE, NEET and boards batch, fee reminders with your own UPI QR, yearly fees in parts, test marks and WhatsApp updates to parents. Free for 7 days.',
    askers: 'coaching institutes', centre: 'Pinnacle Coaching',
    heroQ: ['Still running JEE and NEET batches ', 'from registers?'], batchQ: 'Juggling batches for every course and exam?',
    lead: 'Attendance for every JEE and NEET batch, fee reminders with your own UPI QR, and test marks for each student, all from your phone.',
    batch: 'JEE 2027 evening', count: '31 present · 1 absent',
    students: [['Arjun M.', false], ['Kavya N.', true], ['Rohit V.', false], ['Sneha D.', false]], absentFull: 'Kavya Nair',
    fitTitle: 'Set up the way your institute already works',
    batchTitle: 'Batches by course and exam', levelLabel: 'Class or exam',
    batchBody: 'Every batch has a course, like JEE Physics, and a class or exam, like JEE 2027. Students, attendance and reports all follow it.',
    batches: [['JEE 2027 evening', 'JEE 2027', '32 students'], ['NEET 2027 morning', 'NEET 2027', '28 students'], ['Class 12 boards', 'Class 12', '20 students']],
    fees: [['Kavya Nair', '₹4,000', false], ['Arjun Mehta', '₹4,000', true], ['Sneha Das', '₹4,000', true]], paid: '71 of 80 paid',
    posterTitle: 'Announce your selections', winnersHeadline: 'Our toppers', winnersSubline: 'Congratulations on your selection!',
    winners: [['Arjun Mehta', 'AIR 1520 • JEE Main'], ['Sneha Das', 'NEET 2026']],
    faq: { q: 'Can parents pay large fees in parts?', a: 'Yes. A yearly fee can be split into up to four parts, and each part gets its own reminder and receipt.' },
  },
  {
    slug: 'abacus-classes', label: 'abacus classes', short: 'Abacus classes',
    title: 'App for abacus classes: levels, fees and attendance · ChalkPis Tutor',
    description: 'Group children by abacus level, take attendance in seconds, and let fee reminders and absent alerts reach parents on WhatsApp. Free for 7 days.',
    askers: 'abacus teachers', centre: 'Bright Minds Abacus',
    heroQ: ['Still keeping abacus levels and fees ', 'in a notebook?'], batchQ: 'Losing track of which child is on which level?',
    lead: 'Group children by level, take attendance in seconds, and let fee reminders and absent alerts reach parents on WhatsApp.',
    batch: 'Level 3 weekend', count: '15 present · 1 absent',
    students: [['Aditi K.', false], ['Ishaan P.', true], ['Tara M.', false], ['Vivaan R.', false]], absentFull: 'Ishaan Patil',
    fitTitle: 'Set up the way your abacus classes already work',
    batchTitle: 'Batches and students by level', levelLabel: 'Level',
    batchBody: 'Every student and batch has a level, like Level 3. It shows on their profile, in reports and on report cards.',
    batches: [['Level 3 weekend', 'Level 3', '16 students'], ['Level 1 kids', 'Level 1', '12 students'], ['Level 5 advanced', 'Level 5', '8 students']],
    fees: [['Ishaan Patil', '₹1,200', false], ['Aditi Kulkarni', '₹1,200', true], ['Tara Menon', '₹1,200', true]], paid: '33 of 36 paid',
    posterTitle: 'Celebrate your champions', winnersHeadline: 'Our abacus champions', winnersSubline: 'Congratulations on your competition results!',
    winners: [['Aditi Kulkarni', 'Level 5 • State champion'], ['Tara Menon', 'Level 4']],
    faq: { q: 'Can I see each child’s level?', a: 'Yes. Every student and batch has a level, and it shows on their profile, in reports and on report cards.' },
  },
  {
    slug: 'karate-classes', label: 'karate and martial arts', short: 'Karate and martial arts',
    title: 'App for karate and martial arts classes: belts, fees, attendance · ChalkPis Tutor',
    description: 'Group students by belt, take attendance in seconds, and let fee reminders and absent alerts reach parents on WhatsApp. Posters for new belts and medals. Free for 7 days.',
    askers: 'martial arts coaches', centre: 'Shoto Karate Academy',
    heroQ: ['Still tracking belts and fees ', 'on paper?'], batchQ: 'Losing track of who is on which belt?',
    lead: 'Group students by belt, take attendance in seconds, and let fee reminders and absent alerts reach parents on WhatsApp.',
    batch: 'Kids beginners', count: '19 present · 1 absent',
    students: [['Aarav S.', false], ['Diya K.', true], ['Kabir M.', false], ['Nisha T.', false]], absentFull: 'Diya Kumar',
    fitTitle: 'Set up the way your dojo already works',
    batchTitle: 'Batches and students by belt', levelLabel: 'Belt',
    batchBody: 'Every student has a belt, like Yellow belt, and batches can be set up by belt. It shows on their profile, in reports and on report cards.',
    batches: [['Kids beginners', 'Yellow belt', '20 students'], ['Juniors', 'Green belt', '14 students'], ['Seniors', 'Brown belt', '9 students']],
    fees: [['Diya Kumar', '₹1,000', false], ['Aarav Shetty', '₹1,000', true], ['Nisha Thomas', '₹1,000', true]], paid: '39 of 43 paid',
    posterTitle: 'Celebrate new belts and medals', winnersHeadline: 'Our champions', winnersSubline: 'Congratulations on your medals and new belts!',
    winners: [['Kabir Menon', 'Black belt • Gold medal'], ['Nisha Thomas', 'Green belt']],
    faq: { q: 'Can I keep track of belts?', a: 'Yes. Every student has a belt, and batches can be set up by belt. It shows on their profile, in reports and on report cards.' },
  },
  {
    slug: 'dance-classes', label: 'dance and music classes', short: 'Dance and music',
    title: 'App for dance and music classes: batches, fees and attendance · ChalkPis Tutor',
    description: 'Take attendance for each dance batch in seconds, remind parents about fees with your own UPI QR, and share your students’ wins on WhatsApp. Free for 7 days.',
    askers: 'dance teachers', centre: 'Nritya Dance Academy',
    heroQ: ['Still chasing dance class fees ', 'every month?'], batchQ: 'Batches for every style and level getting mixed up?',
    lead: 'Take attendance for each batch in seconds, remind parents about fees with your own UPI QR, and share your students’ wins on WhatsApp.',
    batch: 'Kids Bharatanatyam', count: '17 present · 1 absent',
    students: [['Aarohi K.', true], ['Kabir M.', false], ['Diya S.', false], ['Meera P.', false]], absentFull: 'Aarohi Kulkarni',
    fitTitle: 'Set up the way your dance school already works',
    batchTitle: 'Batches by style and level', levelLabel: 'Level',
    batchBody: 'Every batch has a dance style, like Bharatanatyam, and a level, like Beginners. Students carry their level too.',
    batches: [['Kids Bharatanatyam', 'Beginners', '18 students'], ['Bharatanatyam seniors', 'Advanced', '11 students'], ['Western kids', 'Beginners', '15 students']],
    fees: [['Aarohi Kulkarni', '₹1,200', false], ['Diya Sharma', '₹1,200', true], ['Meera Pillai', '₹1,200', true]], paid: '40 of 44 paid',
    posterTitle: 'Share your dance stars', winnersHeadline: 'Our dance stars', winnersSubline: 'Congratulations on a wonderful performance!',
    winners: [['Diya Sharma', '1st prize • State fest'], ['Meera Pillai', '2nd prize • Inter-school fest']],
    faq: { q: 'Can I run batches by style and level?', a: 'Yes. Each batch has a dance style and a level, and you can add as many batches as your plan allows.' },
  },
  {
    slug: 'yoga-classes', label: 'yoga and fitness classes', short: 'Yoga and fitness',
    title: 'App for yoga and fitness classes: batches, fees and receipts · ChalkPis Tutor',
    description: 'Mark who came to each morning and evening yoga batch, remind members about fees with your own UPI QR, and send receipts on WhatsApp. Free for 7 days.',
    askers: 'yoga teachers', centre: 'Prana Yoga Studio',
    heroQ: ['Still collecting yoga fees ', 'batch by batch?'], batchQ: 'Morning, evening and weekend batches to keep straight?',
    lead: 'Mark who came to each batch, remind members about fees with your own UPI QR, and send receipts on WhatsApp without typing them.',
    batch: 'Morning batch', count: '21 present · 1 absent',
    students: [['Lakshmi R.', false], ['Vikram J.', true], ['Anjali S.', false], ['Farah A.', false]], absentFull: 'Vikram Joshi',
    fitTitle: 'Set up the way your studio already works',
    batchTitle: 'Batches by timing and level', levelLabel: 'Level',
    batchBody: 'Every batch has a yoga style, like Hatha yoga, and a level, like Beginners. Your timetable shows which batch runs when.',
    batches: [['Morning batch', 'Beginners', '22 students'], ['Evening batch', 'Intermediate', '16 students'], ['Weekend batch', 'All levels', '10 students']],
    fees: [['Vikram Joshi', '₹1,500', false], ['Lakshmi Rao', '₹1,500', true], ['Farah Ali', '₹1,500', true]], paid: '43 of 48 paid',
    posterTitle: 'Celebrate your achievers', winnersHeadline: 'Our achievers', winnersSubline: 'Congratulations on your achievement!',
    winners: [['Anjali Sen', 'Gold medal • State yoga meet'], ['Lakshmi Rao', 'Silver medal • District meet']],
    faq: { q: 'Do adult members get the messages themselves?', a: 'Messages go to the WhatsApp number you save for each student, so an adult member can get their own reminders and receipts.' },
  },
  {
    slug: 'sports-academies', label: 'sports academies', short: 'Sports academies',
    title: 'App for sports academies: players, fees and attendance · ChalkPis Tutor',
    description: 'Group players by sport and age, mark attendance at the ground in seconds, and let fee reminders and absent alerts reach parents on WhatsApp. Free for 7 days.',
    askers: 'coaches', centre: 'Champions Cricket Academy',
    heroQ: ['Still chasing academy fees ', 'after every session?'], batchQ: 'Players across sports and age groups to keep straight?',
    lead: 'Group players by age, mark attendance at the ground in seconds, and let fee reminders and absent alerts reach parents on WhatsApp.',
    batch: 'Under-14 cricket', count: '23 present · 1 absent',
    students: [['Rahul D.', false], ['Yash P.', true], ['Aman G.', false], ['Joel F.', false]], absentFull: 'Yash Pandey',
    fitTitle: 'Set up the way your academy already works',
    batchTitle: 'Batches by sport and age group', levelLabel: 'Age group',
    batchBody: 'Every batch has a sport, like Cricket, and an age group, like Under-14. Players carry their age group too, and it shows in reports.',
    batches: [['Under-14 cricket', 'Under-14', '24 students'], ['Under-10 cricket', 'Under-10', '18 students'], ['Football juniors', 'Under-12', '20 students']],
    fees: [['Yash Pandey', '₹2,000', false], ['Rahul Desai', '₹2,000', true], ['Joel Fernandes', '₹2,000', true]], paid: '55 of 62 paid',
    posterTitle: 'Celebrate your wins', winnersHeadline: 'Our champions', winnersSubline: 'Congratulations on your win!',
    winners: [['Rahul Desai', 'Under-14 • Player of the match'], ['Aman Gupta', 'District team']],
    faq: { q: 'Can I mark attendance at the ground?', a: 'Yes. Attendance works on your phone: tap only the players who didn’t come, then save. Late marks and holidays are there too.' },
  },
];

/** Questions every class page ends with, after its own. */
export const CLASS_FAQ = [
  { q: 'Do parents need to install anything?', a: 'No. Parents get updates on WhatsApp and a private web page for their child. Only you and your helpers use the app.' },
  { q: 'Are WhatsApp messages charged extra?', a: 'No. Absent alerts, fee reminders, receipts and the parent page link are included in every plan.' },
];

export const classUrl = (c: ClassKind) => `/for/${c.slug}`;
export const initials = (name: string) => name.split(' ').map((w) => w[0]).join('');
