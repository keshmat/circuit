// lib/inspect-tournament.js
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const chalk = require('chalk');
const fs = require('fs');

/**
 * Inspect raw data for a specific tournament
 * @param {string} tournamentNameOrId - Tournament name or ID to inspect
 * @param {Object} options - Inspection options
 * @param {boolean} options.details - Show detailed player performance data
 * @param {boolean} options.games - Show game-by-game data
 */
async function inspectTournament(tournamentNameOrId, options = {}) {
  // Check if database exists
  if (!fs.existsSync('keshmat_chess_circuit.db')) {
    throw new Error('Database file not found: keshmat_chess_circuit.db. Please run the process command first.');
  }

  // Open the SQLite database
  const db = await open({
    filename: 'keshmat_chess_circuit.db',
    driver: sqlite3.Database
  });

  try {
    // Find the tournament by name or ID
    let tournament;
    if (isNaN(tournamentNameOrId)) {
      // Search by name
      tournament = await db.get(`
        SELECT id, name, date, location, time_control, rounds
        FROM tournaments
        WHERE name LIKE ?
        ORDER BY date DESC
        LIMIT 1
      `, [`%${tournamentNameOrId}%`]);
    } else {
      // Search by ID
      tournament = await db.get(`
        SELECT id, name, date, location, time_control, rounds
        FROM tournaments
        WHERE id = ?
      `, [tournamentNameOrId]);
    }

    if (!tournament) {
      throw new Error(`Tournament not found: ${tournamentNameOrId}`);
    }

    // Display tournament info
    console.log(chalk.cyan('\n===== TOURNAMENT INFORMATION ====='));
    console.log(chalk.yellow(`Name: ${tournament.name}`));
    console.log(`Date: ${tournament.date}`);
    console.log(`Location: ${tournament.location || 'N/A'}`);
    console.log(`Time Control: ${tournament.time_control || 'N/A'}`);
    console.log(`Rounds: ${tournament.rounds || 'N/A'}`);

    // Get tournament results
    const results = await db.all(`
      SELECT 
        p.name,
        tr.rating,
        tr.rank,
        tr.points,
        tr.title
      FROM tournament_results tr
      JOIN players p ON tr.player_id = p.id
      WHERE tr.tournament_id = ?
      ORDER BY tr.rank
    `, [tournament.id]);

    console.log(chalk.cyan('\n===== TOURNAMENT RESULTS ====='));
    console.log(chalk.gray('Rank | Name                      | Rating | Points | Title'));
    console.log(chalk.gray('-----|---------------------------|--------|--------|------'));

    for (const result of results) {
      console.log(
        `${result.rank.toString().padEnd(5)}| ` +
        `${result.name.padEnd(27)}| ` +
        `${(result.rating || 'Unr').toString().padEnd(8)}| ` +
        `${result.points.toString().padEnd(8)}| ` +
        `${result.title || ''}`
      );
    }

    // Get performance ratings if requested
    if (options.details) {
      const performanceRatings = await db.all(`
        SELECT 
          p.name,
          pr.games_played,
          pr.total_score,
          pr.score_percentage,
          pr.avg_opponent_rating,
          pr.performance_rating
        FROM performance_ratings pr
        JOIN players p ON pr.player_id = p.id
        WHERE pr.tournament_id = ?
        ORDER BY pr.performance_rating DESC
      `, [tournament.id]);

      console.log(chalk.cyan('\n===== PERFORMANCE RATINGS ====='));
      console.log(chalk.gray('Name                      | Games | Score | Score % | Avg Opp | Perf Rating'));
      console.log(chalk.gray('---------------------------|-------|-------|---------|---------|-------------'));

      for (const rating of performanceRatings) {
        console.log(
          `${rating.name.padEnd(27)}| ` +
          `${rating.games_played.toString().padEnd(7)}| ` +
          `${rating.total_score.toString().padEnd(7)}| ` +
          `${rating.score_percentage.toFixed(1).padEnd(9)}| ` +
          `${Math.round(rating.avg_opponent_rating).toString().padEnd(9)}| ` +
          `${rating.performance_rating}`
        );
      }
    }

    // Get game-by-game data if requested
    if (options.games) {
      const games = await db.all(`
        SELECT 
          g.round,
          p1.name as white_player,
          p2.name as black_player,
          g.result,
          g.white_rating,
          g.black_rating
        FROM games g
        JOIN players p1 ON g.white_player_id = p1.id
        JOIN players p2 ON g.black_player_id = p2.id
        WHERE g.tournament_id = ?
        ORDER BY g.round, g.id
      `, [tournament.id]);

      console.log(chalk.cyan('\n===== GAME-BY-GAME DATA ====='));
      console.log(chalk.gray('Round | White Player             | Black Player             | Result | White Rating | Black Rating'));
      console.log(chalk.gray('------|--------------------------|--------------------------|--------|--------------|--------------'));

      for (const game of games) {
        console.log(
          `${game.round.toString().padEnd(6)}| ` +
          `${game.white_player.padEnd(26)}| ` +
          `${game.black_player.padEnd(26)}| ` +
          `${game.result.toString().padEnd(8)}| ` +
          `${(game.white_rating || 'Unr').toString().padEnd(14)}| ` +
          `${game.black_rating || 'Unr'}`
        );
      }
    }

    // Get raw player performance data
    const playerPerformance = await db.all(`
      SELECT 
        p.name,
        pp.player_rating,
        pp.opponent_rating,
        pp.score,
        pp.color
      FROM player_performance pp
      JOIN players p ON pp.player_id = p.id
      WHERE pp.tournament_id = ?
      ORDER BY p.name, pp.round
    `, [tournament.id]);

    console.log(chalk.cyan('\n===== RAW PLAYER PERFORMANCE DATA ====='));
    console.log(chalk.gray('Player                      | Color | Player Rating | Opponent Rating | Score'));
    console.log(chalk.gray('----------------------------|-------|---------------|-----------------|-------'));

    for (const perf of playerPerformance) {
      console.log(
        `${perf.name.padEnd(30)}| ` +
        `${perf.color.padEnd(7)}| ` +
        `${(perf.player_rating || 'Unr').toString().padEnd(15)}| ` +
        `${(perf.opponent_rating || 'N/A').toString().padEnd(17)}| ` +
        `${perf.score}`
      );
    }

  } finally {
    // Close the database connection
    await db.close();
  }
}

module.exports = { inspectTournament }; 