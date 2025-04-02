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
      // Use 1500 as provisional rating for unrated players
      const playerRating = game.player_rating || 1500;
      // Cap rating difference at 400 points (FIDE standard)
      const ratingDiff = Math.min(Math.max(playerRating - game.opponent_rating, -400), 400);
      // FIDE expected score formula (approximation)
      const expectedGameScore = 1 / (1 + Math.pow(10, -ratingDiff / 400));
      return sum + expectedGameScore;
    }, 0);

    const expectedScorePercentage = (expectedScore / totalGames) * 100;

    // Calculate performance rating using the linear TPR formula
    const avgOpponentRating = games.reduce((sum, game) => sum + game.opponent_rating, 0) / totalGames;
    const isUnrated = !games.some(game => game.player_rating);

    // Linear TPR formula: TPR = Average Opponent Rating + (Score Percentage - 50) * 10
    // For unrated players, we still use a more conservative approach
    const performanceRating = isUnrated
      ? Math.round(avgOpponentRating + (scorePercentage - 50) * 8) // Slightly reduced multiplier for unrated players
      : Math.round(avgOpponentRating + (scorePercentage - 50) * 10);

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

      // Get all players in this tournament with their performance data
      const tournamentPlayers = await db.all(`
        WITH player_games AS (
          SELECT 
            pp.player_id,
            p.name,
            COUNT(*) as games_played,
            SUM(pp.score) as total_score,
            AVG(pp.opponent_rating) as avg_opponent_rating,
            GROUP_CONCAT(pp.player_rating) as player_ratings
          FROM player_performance pp
          JOIN players p ON pp.player_id = p.id
          WHERE pp.tournament_id = ?
          AND pp.opponent_rating IS NOT NULL 
          AND pp.opponent_rating > 0
          GROUP BY pp.player_id, p.name
          HAVING games_played >= 1 -- Lower minimum games requirement
        )
        SELECT 
          pg.player_id,
          pg.name,
          pg.games_played,
          pg.total_score,
          CASE 
            WHEN pg.games_played > 0 THEN (pg.total_score / pg.games_played * 100)
            ELSE 0
          END as score_percentage,
          tr.rating as player_rating,
          pg.avg_opponent_rating,
          pg.player_ratings
        FROM player_games pg
        JOIN tournament_results tr ON pg.player_id = tr.player_id AND tr.tournament_id = ?
      `, [tournament.id, tournament.id]);

      console.log(`Found ${tournamentPlayers.length} players with performance data for ${tournament.name}`);

      // Calculate performance ratings for all players in the tournament
      for (const player of tournamentPlayers) {
        try {
          // Validate data
          if (!player.avg_opponent_rating || isNaN(player.avg_opponent_rating)) {
            console.log(`Warning: Invalid opponent rating for player ${player.name} in ${tournament.name}`);
            continue;
          }

          // Ensure score percentage is valid
          let scorePercentage = player.score_percentage;

          // Debug the raw values
          console.log(`Raw data for ${player.name}: games_played=${player.games_played}, total_score=${player.total_score}, score_percentage=${player.score_percentage}`);

          // Recalculate score percentage to ensure accuracy
          if (player.games_played > 0) {
            scorePercentage = (player.total_score / player.games_played) * 100;
            console.log(`Recalculated score percentage for ${player.name}: ${scorePercentage.toFixed(1)}% (${player.total_score}/${player.games_played})`);
          } else {
            scorePercentage = 0;
            console.log(`No games played for ${player.name}, setting score percentage to 0%`);
          }

          // Check if player is unrated
          const playerRatings = player.player_ratings ? player.player_ratings.split(',') : [];
          const isUnrated = playerRatings.length === 0 || playerRatings.every(rating => !rating || rating === 'null');

          // Calculate performance rating using the linear TPR formula
          const performanceRating = isUnrated
            ? Math.round(player.avg_opponent_rating + (scorePercentage - 50) * 8)
            : Math.round(player.avg_opponent_rating + (scorePercentage - 50) * 10);

          // Log the calculation details for debugging
          console.log(`Player: ${player.name}, Games: ${player.games_played}, Score: ${player.total_score}, Score%: ${scorePercentage.toFixed(1)}, Avg Opp: ${Math.round(player.avg_opponent_rating)}, Unrated: ${isUnrated}, TPR: ${performanceRating}`);

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
            player.player_id,
            tournament.id,
            player.games_played,
            player.total_score,
            scorePercentage,
            scorePercentage, // For tournament-specific, we don't calculate expected score
            player.avg_opponent_rating,
            performanceRating
          ]);
        } catch (error) {
          console.error(`Error calculating performance rating for player ${player.name} in ${tournament.name}:`, error);
        }
      }

      // Get top 5 performers for display only
      const topPerformers = await db.all(`
        SELECT 
          p.name,
          tr.rating as player_rating,
          pr.performance_rating,
          pr.games_played,
          pr.total_score,
          pr.score_percentage
        FROM performance_ratings pr
        JOIN players p ON pr.player_id = p.id
        JOIN tournament_results tr ON p.id = tr.player_id AND tr.tournament_id = pr.tournament_id
        WHERE pr.tournament_id = ?
        ORDER BY pr.performance_rating DESC
        LIMIT 5
      `, [tournament.id]);

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