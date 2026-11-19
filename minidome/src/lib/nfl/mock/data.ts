/**
 * SAMPLE DATA for development and testing only. Real teams and player names are used so the app
 * feels real, but every schedule, result and statistic produced from this file is invented.
 */
export interface MockTeam { abbr: string; city: string; name: string; conf: "AFC" | "NFC"; seed: number; primary: string; secondary: string; roster: string[]; mobileQb?: boolean }

// roster: QB, RB1, RB2, WR1, WR2, WR3, TE, K
export const MOCK_TEAMS: MockTeam[] = [
  { abbr: "KC", city: "Kansas City", name: "Chiefs", conf: "AFC", seed: 1, primary: "#E31837", secondary: "#FFB81C", roster: ["Patrick Mahomes", "Isiah Pacheco", "Kareem Hunt", "Rashee Rice", "Xavier Worthy", "Hollywood Brown", "Travis Kelce", "Harrison Butker"] },
  { abbr: "BUF", city: "Buffalo", name: "Bills", conf: "AFC", seed: 2, primary: "#00338D", secondary: "#C60C30", roster: ["Josh Allen", "James Cook", "Ray Davis", "Khalil Shakir", "Keon Coleman", "Curtis Samuel", "Dalton Kincaid", "Tyler Bass"], mobileQb: true },
  { abbr: "BAL", city: "Baltimore", name: "Ravens", conf: "AFC", seed: 3, primary: "#241773", secondary: "#9E7C0C", roster: ["Lamar Jackson", "Derrick Henry", "Justice Hill", "Zay Flowers", "Rashod Bateman", "Nelson Agholor", "Mark Andrews", "Justin Tucker"], mobileQb: true },
  { abbr: "HOU", city: "Houston", name: "Texans", conf: "AFC", seed: 4, primary: "#03202F", secondary: "#A71930", roster: ["C.J. Stroud", "Joe Mixon", "Dameon Pierce", "Nico Collins", "Tank Dell", "John Metchie III", "Dalton Schultz", "Ka'imi Fairbairn"] },
  { abbr: "PIT", city: "Pittsburgh", name: "Steelers", conf: "AFC", seed: 5, primary: "#101820", secondary: "#FFB612", roster: ["Russell Wilson", "Najee Harris", "Jaylen Warren", "George Pickens", "Calvin Austin III", "Van Jefferson", "Pat Freiermuth", "Chris Boswell"] },
  { abbr: "LAC", city: "Los Angeles", name: "Chargers", conf: "AFC", seed: 6, primary: "#0080C6", secondary: "#FFC20E", roster: ["Justin Herbert", "J.K. Dobbins", "Gus Edwards", "Ladd McConkey", "Quentin Johnston", "Joshua Palmer", "Will Dissly", "Cameron Dicker"] },
  { abbr: "DEN", city: "Denver", name: "Broncos", conf: "AFC", seed: 7, primary: "#FB4F14", secondary: "#002244", roster: ["Bo Nix", "Javonte Williams", "Jaleel McLaughlin", "Courtland Sutton", "Marvin Mims Jr.", "Devaughn Vele", "Adam Trautman", "Wil Lutz"], mobileQb: true },
  { abbr: "DET", city: "Detroit", name: "Lions", conf: "NFC", seed: 1, primary: "#0076B6", secondary: "#B0B7BC", roster: ["Jared Goff", "Jahmyr Gibbs", "David Montgomery", "Amon-Ra St. Brown", "Jameson Williams", "Tim Patrick", "Sam LaPorta", "Jake Bates"] },
  { abbr: "PHI", city: "Philadelphia", name: "Eagles", conf: "NFC", seed: 2, primary: "#004C54", secondary: "#A5ACAF", roster: ["Jalen Hurts", "Saquon Barkley", "Kenneth Gainwell", "A.J. Brown", "DeVonta Smith", "Jahan Dotson", "Dallas Goedert", "Jake Elliott"], mobileQb: true },
  { abbr: "SF", city: "San Francisco", name: "49ers", conf: "NFC", seed: 3, primary: "#AA0000", secondary: "#B3995D", roster: ["Brock Purdy", "Christian McCaffrey", "Jordan Mason", "Deebo Samuel", "Brandon Aiyuk", "Jauan Jennings", "George Kittle", "Jake Moody"] },
  { abbr: "TB", city: "Tampa Bay", name: "Buccaneers", conf: "NFC", seed: 4, primary: "#D50A0A", secondary: "#FF7900", roster: ["Baker Mayfield", "Bucky Irving", "Rachaad White", "Mike Evans", "Chris Godwin", "Jalen McMillan", "Cade Otton", "Chase McLaughlin"] },
  { abbr: "MIN", city: "Minnesota", name: "Vikings", conf: "NFC", seed: 5, primary: "#4F2683", secondary: "#FFC62F", roster: ["Sam Darnold", "Aaron Jones", "Cam Akers", "Justin Jefferson", "Jordan Addison", "Jalen Nailor", "T.J. Hockenson", "Will Reichard"] },
  { abbr: "GB", city: "Green Bay", name: "Packers", conf: "NFC", seed: 6, primary: "#203731", secondary: "#FFB612", roster: ["Jordan Love", "Josh Jacobs", "Emanuel Wilson", "Jayden Reed", "Romeo Doubs", "Christian Watson", "Tucker Kraft", "Brandon McManus"] },
  { abbr: "WAS", city: "Washington", name: "Commanders", conf: "NFC", seed: 7, primary: "#5A1414", secondary: "#FFB612", roster: ["Jayden Daniels", "Brian Robinson Jr.", "Austin Ekeler", "Terry McLaurin", "Olamide Zaccheaus", "Dyami Brown", "Zach Ertz", "Zane Gonzalez"], mobileQb: true },
];

export const ROSTER_POSITIONS = ["QB", "RB", "RB", "WR", "WR", "WR", "TE", "K"] as const;

/** Sample injury designations, so every availability state can be seen. */
export const MOCK_INJURIES: Record<string, { status: string; note: string }> = {
  "Tank Dell": { status: "IR", note: "Knee" },
  "Christian McCaffrey": { status: "Questionable", note: "Achilles" },
  "Mark Andrews": { status: "Doubtful", note: "Ankle" },
};

/** Kickoff offsets (hours) from the start of each round's weekend. */
export const ROUND_KICKOFFS: Record<number, { dayOffset: number; hours: number[] }> = {
  1: { dayOffset: 0, hours: [0, 3.75, 20.5, 24, 27.75, 51.75] },
  2: { dayOffset: 7, hours: [0, 3.75, 20.5, 24] },
  3: { dayOffset: 15, hours: [-1.5, 2] },
  4: { dayOffset: 29, hours: [2.5] },
};

/** A game lasts this long in the simulation (kickoff to final). */
export const GAME_MINUTES = 195;
