// lib/chess-db.js
const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

// Main function to process Excel files and store in SQLite
async function processChessTournaments(excelFilesDir, forceReprocess = false) {
  // Create or open SQLite database
  const db = await open({
    filename: 'keshmat_chess_circuit.db',
    driver: sqlite3.Database
  });

  // Create necessary tables if they don't exist
  await createTables(db);

  // Get all Excel files in the directory
  const files = fs.readdirSync(excelFilesDir)
    .filter(file => file.endsWith('.xlsx') || file.endsWith('.xls'));

  console.log(`Found ${files.length} Excel files to process`);

  // Process each file
  for (const file of files) {
    const filePath = path.join(excelFilesDir, file);
    console.log(`Processing file: ${file}`);

    // Check if this file has already been processed
    if (!forceReprocess) {
      const existingTournament = await db.get(
        'SELECT id FROM tournaments WHERE file_name = ?',
        [file]
      );

      if (existingTournament) {
        console.log(`Skipping already processed file: ${file} (use --force to reprocess)`);
        continue;
      }
    }

    try {
      await processTournamentFile(db, filePath);
      console.log(`Successfully processed ${file}`);
    } catch (error) {
      console.error(`Error processing ${file}: ${error.message}`);
    }
  }

  console.log('All files processed');

  // Close the database
  await db.close();
  console.log('Database closed');
}

// Create database tables
async function createTables(db) {
  // Tournaments table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      location TEXT,
      time_control TEXT,
      rounds INTEGER,
      file_name TEXT,
      processed_date TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Players table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      fide_id TEXT,
      federation TEXT,
      UNIQUE(name, federation)
    )
  `);

  // Tournament results table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      player_id INTEGER NOT NULL,
      rank INTEGER,
      points REAL NOT NULL,
      title TEXT,
      rating INTEGER,
      tb1 REAL,
      tb2 REAL,
      tb3 REAL,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (player_id) REFERENCES players(id),
      UNIQUE(tournament_id, player_id)
    )
  `);

  // Games table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      round INTEGER NOT NULL,
      white_player_id INTEGER NOT NULL,
      black_player_id INTEGER NOT NULL,
      white_rating INTEGER,
      black_rating INTEGER,
      result TEXT NOT NULL, -- "1-0", "0-1", "1/2-1/2", "1-0+" (forfeit)
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (white_player_id) REFERENCES players(id),
      FOREIGN KEY (black_player_id) REFERENCES players(id)
    )
  `);

  // Performance rating view
  await db.exec(`
    CREATE VIEW IF NOT EXISTS player_performance AS
    SELECT 
      g.tournament_id,
      t.name as tournament_name,
      t.date as tournament_date,
      CASE 
        WHEN g.white_player_id = p.id THEN 'white'
        ELSE 'black'
      END as color,
      CASE 
        WHEN g.white_player_id = p.id THEN g.white_rating
        ELSE g.black_rating
      END as player_rating,
      CASE 
        WHEN g.white_player_id = p.id THEN g.black_rating
        ELSE g.white_rating
      END as opponent_rating,
      CASE
        WHEN g.white_player_id = p.id AND g.result = '1-0' THEN 1
        WHEN g.black_player_id = p.id AND g.result = '0-1' THEN 1
        WHEN g.result = '1/2-1/2' THEN 0.5
        WHEN g.white_player_id = p.id AND g.result = '1-0+' THEN 1
        WHEN g.black_player_id = p.id AND g.result = '0-1+' THEN 1
        ELSE 0
      END as score,
      g.round,
      p.id as player_id
    FROM games g
    JOIN players p ON (g.white_player_id = p.id OR g.black_player_id = p.id)
    JOIN tournaments t ON g.tournament_id = t.id
  `);

  // Circuit leaderboard view
  await db.exec(`
    CREATE VIEW IF NOT EXISTS circuit_leaderboard AS
    SELECT 
      p.id as player_id,
      p.name,
      p.federation,
      COUNT(DISTINCT tr.tournament_id) as tournaments_played,
      SUM(tr.points) as total_points,
      AVG(tr.points) as avg_points_per_tournament,
      MAX(tr.title) as title, -- Gets the most recent title
      AVG(tr.rating) as avg_rating,
      (SELECT AVG(opponent_rating) FROM player_performance 
       WHERE player_id = p.id AND opponent_rating IS NOT NULL AND opponent_rating > 0) as avg_opponent_rating,
      (SELECT SUM(score) FROM player_performance WHERE player_id = p.id) as total_game_points,
      (SELECT COUNT(*) FROM player_performance WHERE player_id = p.id) as total_games_played
    FROM players p
    JOIN tournament_results tr ON p.id = tr.player_id
    GROUP BY p.id, p.name, p.federation
    ORDER BY total_points DESC, avg_points_per_tournament DESC
  `);

  console.log('Database tables created');
}

// Process a single tournament file
async function processTournamentFile(db, filePath) {
  // Read the Excel file
  const workbook = xlsx.readFile(filePath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const data = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: null });

  // Find where the crosstable starts by looking for "Rk."
  let crosstableStartRow = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] && data[i][0] === 'Rk.') {
      crosstableStartRow = i;
      break;
    }
  }

  if (crosstableStartRow === -1) {
    throw new Error('Could not find the start of the crosstable (Rk. header)');
  }

  // Get column headers
  const headers = data[crosstableStartRow];

  // Find round columns
  const roundCols = [];
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] && headers[i].toString().includes('.Rd')) {
      roundCols.push(i);
    }
  }

  // Update tournament info with the accurate number of rounds
  const tournamentInfo = extractTournamentInfo(data, path.basename(filePath));

  // Ensure rounds is set correctly based on actual round columns
  if (tournamentInfo.rounds === null || tournamentInfo.rounds === 0) {
    tournamentInfo.rounds = roundCols.length;
  }

  // Insert tournament into database
  const tournamentId = await insertTournament(db, tournamentInfo);

  const nameColIndex = headers.indexOf('Name');
  const ratingColIndex = headers.findIndex(h => h === 'Rtg');
  const fedColIndex = headers.findIndex(h => h === 'FED');
  const pointsColIndex = headers.findIndex(h => h && h.toString().includes('Pts'));

  // Find tiebreak columns
  const tbCols = [];
  for (let i = 0; i < headers.length; i++) {
    if (headers[i] && headers[i].toString().includes('TB')) {
      tbCols.push(i);
    }
  }

  // Process player results and games
  const playerMap = new Map(); // Maps player rank to player ID
  const playerRatingMap = new Map(); // Maps player rank to their rating in this tournament

  for (let i = crosstableStartRow + 1; i < data.length; i++) {
    const row = data[i];
    if (!row || !row[0] || isNaN(parseInt(row[0]))) continue; // Skip if not a player row

    const rank = parseInt(row[0]);
    const title = row[1] || null;
    const name = row[nameColIndex].trim();
    const rating = ratingColIndex >= 0 ? (row[ratingColIndex] || null) : null;
    const federation = fedColIndex >= 0 ? (row[fedColIndex] || null) : null;
    const points = row[pointsColIndex];

    // Store player rating for use in game records
    playerRatingMap.set(rank, rating);

    // Get tiebreak values
    const tb1 = tbCols.length > 0 ? (row[tbCols[0]] || null) : null;
    const tb2 = tbCols.length > 1 ? (row[tbCols[1]] || null) : null;
    const tb3 = tbCols.length > 2 ? (row[tbCols[2]] || null) : null;

    // Insert or get player ID
    const playerId = await getOrInsertPlayer(db, name, federation);
    playerMap.set(rank, playerId);

    // Insert tournament result
    await insertTournamentResult(db, tournamentId, playerId, rank, points, title, rating, tb1, tb2, tb3);

    // Process games in each round
    for (let r = 0; r < roundCols.length; r++) {
      const roundCol = roundCols[r];
      const roundData = row[roundCol];

      if (roundData) {
        await processGameResult(db, tournamentId, r + 1, rank, roundData, playerMap, playerRatingMap);
      }
    }
  }
}

// Extract tournament information from the file
function extractTournamentInfo(data, fileName) {
  let name = null;
  let date = new Date().toISOString().split('T')[0]; // Default to today
  let location = null;
  let timeControl = null;
  let rounds = null;

  // Try to extract tournament info from header rows
  for (let i = 0; i < Math.min(20, data.length); i++) {
    if (!data[i] || !data[i][0]) continue;

    const row = data[i][0].toString();

    // Look specifically for the tournament name in row 1 (second row)
    if (i === 1 && row.trim().length > 0) {
      name = row.trim();
    }

    // Look for date info
    const dateMatch = row.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b/);
    if (dateMatch) {
      const dateStr = dateMatch[0];
      // Convert month name to number
      const months = {
        'January': '01', 'February': '02', 'March': '03', 'April': '04',
        'May': '05', 'June': '06', 'July': '07', 'August': '08',
        'September': '09', 'October': '10', 'November': '11', 'December': '12'
      };
      const month = months[dateMatch[1]];
      const year = dateStr.match(/\d{4}/)[0];
      date = `${year}-${month}-01`; // Default to first day of month
    }

    if (row.includes('Location')) {
      location = row.split(':')[1]?.trim() || location;
    }

    if (row.includes('Time control')) {
      timeControl = row.split(':')[1]?.trim() || timeControl;
    }
  }

  // If we still don't have a name, try to extract from filename
  if (!name) {
    // Remove extension and try to parse a meaningful name
    name = fileName.replace(/\.[^/.]+$/, "").replace(/_/g, ' ');
  }

  // Look for the crosstable to determine number of rounds
  let crosstableStartRow = -1;
  for (let i = 0; i < data.length; i++) {
    if (data[i] && data[i][0] === 'Rk.') {
      crosstableStartRow = i;
      break;
    }
  }

  if (crosstableStartRow !== -1) {
    // Count the round columns
    const headers = data[crosstableStartRow];
    rounds = 0;
    for (let i = 0; i < headers.length; i++) {
      if (headers[i] && typeof headers[i] === 'string' && headers[i].includes('.Rd')) {
        rounds++;
      }
    }

    if (rounds === 0) {
      // Alternative approach: look for columns that might be round columns
      for (let i = 5; i < 15; i++) { // Typical range for round columns
        if (headers[i] && !isNaN(parseInt(headers[i].toString()))) {
          rounds++;
        }
      }
    }
  }

  return { name, date, location, timeControl, rounds, fileName };
}

// Insert tournament into database
async function insertTournament(db, tournamentInfo) {
  const { name, date, location, timeControl, rounds, fileName } = tournamentInfo;

  const result = await db.run(`
    INSERT INTO tournaments (name, date, location, time_control, rounds, file_name)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [name, date, location, timeControl, rounds, fileName]);

  return result.lastID;
}

// Get existing player or insert new one
async function getOrInsertPlayer(db, name, federation) {
  // First try to find the player
  const player = await db.get(`
    SELECT id FROM players 
    WHERE name = ? AND (federation = ? OR (federation IS NULL AND ? IS NULL))
  `, [name, federation, federation]);

  if (player) {
    return player.id;
  }

  // Insert new player
  const result = await db.run(`
    INSERT INTO players (name, federation)
    VALUES (?, ?)
  `, [name, federation]);

  return result.lastID;
}

// Insert tournament result
async function insertTournamentResult(db, tournamentId, playerId, rank, points, title, rating, tb1, tb2, tb3) {
  try {
    await db.run(`
      INSERT INTO tournament_results 
      (tournament_id, player_id, rank, points, title, rating, tb1, tb2, tb3)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [tournamentId, playerId, rank, points, title, rating, tb1, tb2, tb3]);
  } catch (error) {
    // Handle unique constraint violation (player already has result for this tournament)
    if (error.message.includes('UNIQUE constraint failed')) {
      await db.run(`
        UPDATE tournament_results 
        SET rank = ?, points = ?, title = ?, rating = ?, tb1 = ?, tb2 = ?, tb3 = ?
        WHERE tournament_id = ? AND player_id = ?
      `, [rank, points, title, rating, tb1, tb2, tb3, tournamentId, playerId]);
    } else {
      throw error;
    }
  }
}

// Process game result from crosstable
async function processGameResult(db, tournamentId, round, playerRank, resultData, playerMap, playerRatingMap) {
  // Skip invalid data
  if (!resultData || typeof resultData !== 'string') return;

  const resultStr = resultData.toString().trim();

  // Parse result format [opponent number][color][result]
  // Examples: "41b1", "65w1", "12b½"
  const resultRegex = /\s*(\d+)([bw])([01½+])/;
  const match = resultStr.match(resultRegex);

  if (!match) return;

  const opponentRank = parseInt(match[1]);
  const color = match[2]; // 'b' or 'w'
  const result = match[3]; // '1', '0', '½', or '+'

  // Get player IDs
  const playerId = playerMap.get(playerRank);
  const opponentId = playerMap.get(opponentRank);

  if (!playerId || !opponentId) {
    // If we don't have the opponent ID yet, we'll catch this game when processing the opponent's row
    return;
  }

  // Get player ratings for this tournament
  const playerRating = playerRatingMap.get(playerRank);
  const opponentRating = playerRatingMap.get(opponentRank);

  // Determine white and black players and game result
  let whiteId, blackId, whiteRating, blackRating, gameResult;

  if (color === 'w') {
    // Current player played white
    whiteId = playerId;
    blackId = opponentId;
    whiteRating = playerRating;
    blackRating = opponentRating;

    if (result === '1') gameResult = '1-0';
    else if (result === '0') gameResult = '0-1';
    else if (result === '½') gameResult = '1/2-1/2';
    else if (result === '+') gameResult = '1-0+'; // forfeit win
  } else {
    // Current player played black
    whiteId = opponentId;
    blackId = playerId;
    whiteRating = opponentRating;
    blackRating = playerRating;

    if (result === '1') gameResult = '0-1';
    else if (result === '0') gameResult = '1-0';
    else if (result === '½') gameResult = '1/2-1/2';
    else if (result === '+') gameResult = '0-1+'; // forfeit win
  }

  // Check if this game has already been recorded (from the opponent's side)
  const existingGame = await db.get(`
    SELECT id FROM games
    WHERE tournament_id = ? AND round = ? AND 
          ((white_player_id = ? AND black_player_id = ?) OR 
           (white_player_id = ? AND black_player_id = ?))
  `, [tournamentId, round, whiteId, blackId, blackId, whiteId]);

  if (!existingGame) {
    // Insert game
    await db.run(`
      INSERT INTO games (tournament_id, round, white_player_id, black_player_id, white_rating, black_rating, result)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [tournamentId, round, whiteId, blackId, whiteRating, blackRating, gameResult]);
  }
}

module.exports = { processChessTournaments };