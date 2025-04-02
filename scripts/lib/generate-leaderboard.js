// lib/generate-leaderboard.js
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const chalk = require('chalk');

// Main function to generate the circuit leaderboard
async function generateLeaderboard(options = {}) {
  const topCount = options.top || null;
  const csvFilename = options.csv || 'keshmat_leaderboard.csv';

  // Check if database exists
  if (!fs.existsSync('keshmat_chess_circuit.db')) {
    throw new Error('Database file not found: keshmat_chess_circuit.db. Please run the process command first.');
  }

  // Open the SQLite database
  const db = await open({
    filename: 'keshmat_chess_circuit.db',
    driver: sqlite3.Database
  });

  console.log('\n===== KESHMAT CHESS CIRCUIT LEADERBOARD =====');

  // Get the leaderboard data
  const leaderboard = await db.all(`
    SELECT 
      name, 
      federation, 
      title,
      tournaments_played, 
      total_points, 
      avg_points_per_tournament,
      avg_rating,
      avg_opponent_rating,
      total_game_points,
      total_games_played,
      player_id
    FROM circuit_leaderboard
    ORDER BY total_points DESC, avg_points_per_tournament DESC
    ${topCount ? `LIMIT ${topCount}` : ''}
  `);

  if (leaderboard.length === 0) {
    console.log("No players found in the database. Please process tournament files first.");
    await db.close();
    return;
  }

  // Store leaderboard data in database
  for (const [index, player] of leaderboard.entries()) {
    const winPercentage = player.total_games_played ?
      (player.total_game_points / player.total_games_played) * 100 : 0;

    await db.run(`
      INSERT OR REPLACE INTO leaderboard (
        player_id,
        rank,
        tournaments_played,
        total_points,
        avg_points_per_tournament,
        avg_rating,
        avg_opponent_rating,
        total_game_points,
        total_games_played,
        win_percentage
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      player.player_id,
      index + 1,
      player.tournaments_played,
      player.total_points,
      player.avg_points_per_tournament,
      player.avg_rating || 0,
      player.avg_opponent_rating || 0,
      player.total_game_points || 0,
      player.total_games_played || 0,
      winPercentage
    ]);
  }

  // Display the leaderboard header
  console.log(chalk.cyan('Rank | Name                      | Title | Fed | Tournaments | Total Pts | Avg Pts | Avg Rating | Avg Opp Rating | Win %'));
  console.log(chalk.gray('-----|---------------------------|-------|-----|-------------|-----------|---------|------------|----------------|------'));

  // Display each player in the leaderboard
  leaderboard.forEach((player, index) => {
    // Calculate win percentage
    const winPercentage = player.total_games_played ?
      ((player.total_game_points / player.total_games_played) * 100).toFixed(1) : 'N/A';

    console.log(
      `${chalk.yellow((index + 1).toString().padEnd(5))}| ` +
      `${player.name.padEnd(27)}| ` +
      `${(player.title || '').padEnd(7)}| ` +
      `${(player.federation || '').padEnd(5)}| ` +
      `${player.tournaments_played.toString().padEnd(13)}| ` +
      `${chalk.green(player.total_points.toFixed(1).padEnd(11))}| ` +
      `${player.avg_points_per_tournament.toFixed(2).padEnd(9)}| ` +
      `${Math.round(player.avg_rating || 0).toString().padEnd(12)}| ` +
      `${Math.round(player.avg_opponent_rating || 0).toString().padEnd(16)}| ` +
      `${winPercentage}%`
    );
  });

  // Save the leaderboard to a CSV file
  const leaderboardCSV = [
    'Rank,Name,Title,Federation,Tournaments Played,Total Points,Avg Points,Avg Rating,Avg Opponent Rating,Win Percentage',
    ...leaderboard.map((player, index) => {
      const winPercentage = player.total_games_played ?
        ((player.total_game_points / player.total_games_played) * 100).toFixed(1) : '';

      return `${index + 1},` +
        `"${player.name}",` +
        `${player.title || ''},` +
        `${player.federation || ''},` +
        `${player.tournaments_played},` +
        `${player.total_points.toFixed(1)},` +
        `${player.avg_points_per_tournament.toFixed(2)},` +
        `${Math.round(player.avg_rating || 0)},` +
        `${Math.round(player.avg_opponent_rating || 0)},` +
        `${winPercentage}`;
    })
  ].join('\n');

  fs.writeFileSync(csvFilename, leaderboardCSV);
  console.log(`\nLeaderboard saved to ${csvFilename}`);

  // Generate tournament summary
  const tournaments = await db.all(`
    SELECT id, name, date, location, time_control, rounds,
           (SELECT COUNT(*) FROM tournament_results WHERE tournament_id = t.id) as players
    FROM tournaments t
    ORDER BY date DESC
  `);

  console.log('\n===== TOURNAMENTS SUMMARY =====');
  tournaments.forEach(t => {
    console.log(`${t.name} (${t.date}) - ${t.players} players, ${t.rounds || 'unknown'} rounds`);
  });

  // Generate category statistics
  console.log('\n===== CATEGORY STATISTICS =====');

  // Count players by title
  const titleStats = await db.all(`
    SELECT 
      title, 
      COUNT(*) as count,
      AVG(total_points) as avg_points
    FROM circuit_leaderboard
    WHERE title IS NOT NULL
    GROUP BY title
    ORDER BY count DESC
  `);

  console.log(chalk.cyan('Player distribution by title:'));
  titleStats.forEach(stat => {
    console.log(`${(stat.title || 'Untitled').padEnd(6)}: ${stat.count.toString().padEnd(3)} players, Avg points: ${stat.avg_points.toFixed(2)}`);
  });

  // Count players by federation
  const fedStats = await db.all(`
    SELECT 
      federation, 
      COUNT(*) as count,
      AVG(total_points) as avg_points
    FROM circuit_leaderboard
    WHERE federation IS NOT NULL
    GROUP BY federation
    ORDER BY count DESC
  `);

  console.log('\n' + chalk.cyan('Player distribution by federation:'));
  fedStats.forEach(stat => {
    console.log(`${(stat.federation || 'Unknown').padEnd(6)}: ${stat.count.toString().padEnd(3)} players, Avg points: ${stat.avg_points.toFixed(2)}`);
  });

  // Top performers by rating category
  console.log('\n' + chalk.cyan('Top performers by rating category:'));

  const ratingCategories = [
    { name: 'Under 1400', min: 0, max: 1399 },
    { name: '1400-1599', min: 1400, max: 1599 },
    { name: '1600-1799', min: 1600, max: 1799 },
    { name: '1800-1999', min: 1800, max: 1999 },
    { name: '2000-2199', min: 2000, max: 2199 },
    { name: '2200+', min: 2200, max: 9999 }
  ];

  for (const category of ratingCategories) {
    const topPlayers = await db.all(`
      SELECT name, federation, avg_rating, total_points
      FROM circuit_leaderboard
      WHERE avg_rating >= ? AND avg_rating <= ?
      ORDER BY total_points DESC, avg_points_per_tournament DESC
      LIMIT 3
    `, [category.min, category.max]);

    if (topPlayers.length > 0) {
      console.log(`\n${chalk.yellow(category.name)}:`);
      topPlayers.forEach((player, idx) => {
        console.log(`  ${idx + 1}. ${player.name} (${player.federation || '?'}) - ${player.total_points.toFixed(1)} points, Rating: ${Math.round(player.avg_rating || 0)}`);
      });
    }
  }

  // Close the database connection
  await db.close();
}

module.exports = { generateLeaderboard };