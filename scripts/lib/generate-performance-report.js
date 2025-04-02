// lib/generate-performance-report.js
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const chalk = require('chalk');

// Main function to generate the performance rating report
async function generatePerformanceReport(options = {}) {
  const csvFilename = options.csv || 'performance_ratings.csv';
  const showTournaments = options.tournaments !== false;

  // Check if database exists
  if (!fs.existsSync('keshmat_chess_circuit.db')) {
    throw new Error('Database file not found: keshmat_chess_circuit.db. Please run the process command first.');
  }

  // Open the SQLite database
  const db = await open({
    filename: 'keshmat_chess_circuit.db',
    driver: sqlite3.Database
  });

  console.log('\n===== PLAYER PERFORMANCE RATING REPORT =====');

  // Calculate performance ratings for all players
  const players = await db.all(`
    SELECT 
      p.id, 
      p.name, 
      p.federation, 
      MAX(tr.title) as title,
      AVG(tr.rating) as avg_rating
    FROM players p
    JOIN tournament_results tr ON p.id = tr.player_id
    GROUP BY p.id, p.name, p.federation
    HAVING COUNT(DISTINCT tr.tournament_id) >= 1
    ORDER BY avg_rating DESC
  `);

  if (players.length === 0) {
    console.log("No players found in the database. Please process tournament files first.");
    await db.close();
    return;
  }

  // Display performance rating for each player
  console.log(chalk.cyan('Name                      | Title | Fed | Rating | Perf Rating | Games | Score | Score % | Exp Score % | Diff'));
  console.log(chalk.gray('--------------------------|-------|-----|--------|-------------|-------|-------|---------|------------|------'));

  // Prepare for CSV export
  const reportRows = [
    'Name,Title,Federation,Rating,Performance Rating,Games Played,Total Score,Score %,Expected Score %,Difference'
  ];

  for (const player of players) {
    // Get player's games
    const games = await db.all(`
      SELECT 
        player_rating,
        opponent_rating,
        score
      FROM player_performance
      WHERE player_id = ?
      AND opponent_rating IS NOT NULL 
      AND opponent_rating > 0
    `, [player.id]);

    if (games.length === 0) continue;

    const totalGames = games.length;
    const totalScore = games.reduce((sum, game) => sum + game.score, 0);
    const scorePercentage = (totalScore / totalGames) * 100;

    // Calculate expected score based on FIDE formula
    const expectedScore = games.reduce((sum, game) => {
      const ratingDiff = game.player_rating - game.opponent_rating;
      // FIDE expected score formula (approximation)
      const expectedGameScore = 1 / (1 + Math.pow(10, -ratingDiff / 400));
      return sum + expectedGameScore;
    }, 0);

    const expectedScorePercentage = (expectedScore / totalGames) * 100;

    // Calculate performance rating
    // Simple formula: Opponent Avg + Rating Diff based on score percentage
    const avgOpponentRating = games.reduce((sum, game) => sum + game.opponent_rating, 0) / totalGames;

    // FIDE rating difference table approximation
    const getPerformanceDiff = (scorePercentage) => {
      if (scorePercentage >= 100) return 800;
      if (scorePercentage >= 99) return 677;
      if (scorePercentage >= 90) return 366;
      if (scorePercentage >= 80) return 240;
      if (scorePercentage >= 75) return 188;
      if (scorePercentage >= 70) return 141;
      if (scorePercentage >= 65) return 98;
      if (scorePercentage >= 60) return 57;
      if (scorePercentage >= 55) return 17;
      if (scorePercentage >= 50) return 0;
      if (scorePercentage >= 45) return -17;
      if (scorePercentage >= 40) return -57;
      if (scorePercentage >= 35) return -98;
      if (scorePercentage >= 30) return -141;
      if (scorePercentage >= 25) return -188;
      if (scorePercentage >= 20) return -240;
      if (scorePercentage >= 10) return -366;
      if (scorePercentage >= 1) return -677;
      return -800;
    };

    const performanceDiff = getPerformanceDiff(scorePercentage);
    const performanceRating = Math.round(avgOpponentRating + performanceDiff);

    // Performance vs expected
    const diffFromExpected = scorePercentage - expectedScorePercentage;
    const diffColor = diffFromExpected >= 0 ? chalk.green : chalk.red;

    // Store performance rating in database
    await db.run(`
      INSERT OR REPLACE INTO performance_ratings (
        player_id,
        games_played,
        total_score,
        score_percentage,
        expected_score_percentage,
        avg_opponent_rating,
        performance_rating
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      player.id,
      totalGames,
      totalScore,
      scorePercentage,
      expectedScorePercentage,
      avgOpponentRating,
      performanceRating
    ]);

    // Display result
    console.log(
      `${player.name.padEnd(26)}| ` +
      `${(player.title || '').padEnd(7)}| ` +
      `${(player.federation || '').padEnd(5)}| ` +
      `${Math.round(player.avg_rating || 0).toString().padEnd(8)}| ` +
      `${chalk.yellow(performanceRating.toString().padEnd(13))}| ` +
      `${totalGames.toString().padEnd(7)}| ` +
      `${totalScore.toFixed(1).padEnd(7)}| ` +
      `${scorePercentage.toFixed(1).padEnd(9)}| ` +
      `${expectedScorePercentage.toFixed(1).padEnd(12)}| ` +
      `${diffColor((diffFromExpected >= 0 ? '+' : '') + diffFromExpected.toFixed(1))}`
    );

    // Add to CSV data
    reportRows.push(
      `"${player.name}",` +
      `${player.title || ''},` +
      `${player.federation || ''},` +
      `${Math.round(player.avg_rating || 0)},` +
      `${performanceRating},` +
      `${totalGames},` +
      `${totalScore.toFixed(1)},` +
      `${scorePercentage.toFixed(1)},` +
      `${expectedScorePercentage.toFixed(1)},` +
      `${diffFromExpected.toFixed(1)}`
    );
  }

  // Save to CSV
  fs.writeFileSync(csvFilename, reportRows.join('\n'));
  console.log(`\nPerformance ratings saved to ${csvFilename}`);

  // Generate tournament-by-tournament performance for top players
  if (showTournaments) {
    console.log('\n===== TOP PERFORMERS BY TOURNAMENT =====');

    const tournaments = await db.all(`
      SELECT id, name, date 
      FROM tournaments 
      ORDER BY date DESC
    `);

    for (const tournament of tournaments) {
      console.log(`\n${chalk.yellow(tournament.name)} (${tournament.date}):`);

      // Get top 5 performers in this tournament
      const topPerformers = await db.all(`
        WITH player_games AS (
          SELECT 
            pp.player_id,
            p.name,
            COUNT(*) as games_played,
            SUM(pp.score) as total_score,
            AVG(pp.opponent_rating) as avg_opponent_rating
          FROM player_performance pp
          JOIN players p ON pp.player_id = p.id
          WHERE pp.tournament_id = ?
          AND pp.opponent_rating IS NOT NULL 
          AND pp.opponent_rating > 0
          GROUP BY pp.player_id, p.name
          HAVING games_played >= 3
        )
        SELECT 
          pg.player_id,
          pg.name,
          pg.games_played,
          pg.total_score,
          (pg.total_score / pg.games_played * 100) as score_percentage,
          tr.rating as player_rating,
          pg.avg_opponent_rating,
          (pg.avg_opponent_rating + CASE
            WHEN (pg.total_score / pg.games_played * 100) >= 90 THEN 366
            WHEN (pg.total_score / pg.games_played * 100) >= 80 THEN 240
            WHEN (pg.total_score / pg.games_played * 100) >= 70 THEN 141
            WHEN (pg.total_score / pg.games_played * 100) >= 60 THEN 57
            WHEN (pg.total_score / pg.games_played * 100) >= 50 THEN 0
            WHEN (pg.total_score / pg.games_played * 100) >= 40 THEN -57
            WHEN (pg.total_score / pg.games_played * 100) >= 30 THEN -141
            WHEN (pg.total_score / pg.games_played * 100) >= 20 THEN -240
            ELSE -366
          END) as performance_rating
        FROM player_games pg
        JOIN tournament_results tr ON pg.player_id = tr.player_id AND tr.tournament_id = ?
        ORDER BY performance_rating DESC
        LIMIT 5
      `, [tournament.id, tournament.id]);

      if (topPerformers.length > 0) {
        console.log(chalk.cyan('Player                   | Rating | Perf Rating | Games | Score | Score %'));
        console.log(chalk.gray('-------------------------|--------|-------------|-------|-------|--------'));

        for (const performer of topPerformers) {
          console.log(
            `${performer.name.padEnd(25)}| ` +
            `${(performer.player_rating || 'Unr').toString().padEnd(8)}| ` +
            `${chalk.yellow(Math.round(performer.performance_rating).toString().padEnd(13))}| ` +
            `${performer.games_played.toString().padEnd(7)}| ` +
            `${performer.total_score.toFixed(1).padEnd(7)}| ` +
            `${performer.score_percentage.toFixed(1)}`
          );

          // Store tournament-specific performance rating
          await db.run(`
            INSERT OR REPLACE INTO performance_ratings (
              player_id,
              tournament_id,
              games_played,
              total_score,
              score_percentage,
              expected_score_percentage,
              avg_opponent_rating,
              performance_rating
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            performer.player_id,
            tournament.id,
            performer.games_played,
            performer.total_score,
            performer.score_percentage,
            performer.score_percentage, // For tournament-specific, we don't calculate expected score
            performer.avg_opponent_rating,
            performer.performance_rating
          ]);
        }
      } else {
        console.log('No performance data available for this tournament.');
      }
    }
  }

  // Close the database connection
  await db.close();
}

module.exports = { generatePerformanceReport };