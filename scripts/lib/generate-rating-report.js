// lib/generate-rating-report.js
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const chalk = require('chalk');

// Main function to generate the rating progress report
async function generateRatingProgressReport(options = {}) {
  const csvFilename = options.csv || 'rating_eligibility_report.csv';

  // Check if database exists
  if (!fs.existsSync('keshmat_chess_circuit.db')) {
    throw new Error('Database file not found: keshmat_chess_circuit.db. Please run the process command first.');
  }

  // Open the SQLite database
  const db = await open({
    filename: 'keshmat_chess_circuit.db',
    driver: sqlite3.Database
  });

  console.log('\n===== RATING ELIGIBILITY REPORT (FIDE CRITERIA) =====');

  // First analyze tournament-by-tournament eligibility
  console.log(chalk.cyan('\nSingle Tournament Eligibility:'));

  // Find tournaments in the database
  const tournaments = await db.all(`
    SELECT id, name, date FROM tournaments ORDER BY date
  `);

  if (tournaments.length === 0) {
    console.log("No tournaments found in the database. Please process tournament files first.");
    await db.close();
    return;
  }

  // Prepare results array for CSV
  const reportResults = [];

  // For each tournament, find unrated players and evaluate if they meet FIDE criteria
  for (const tournament of tournaments) {
    console.log(`\n${chalk.yellow(tournament.name)} (${tournament.date}):`);

    // Get unrated players in this tournament
    const unratedPlayers = await db.all(`
      SELECT 
        p.id as player_id, 
        p.name, 
        p.federation,
        tr.points
      FROM tournament_results tr
      JOIN players p ON tr.player_id = p.id
      WHERE tr.tournament_id = ?
      AND (tr.rating IS NULL OR tr.rating = 0)
    `, [tournament.id]);

    if (unratedPlayers.length === 0) {
      console.log("  No unrated players in this tournament.");
      continue;
    }

    console.log(chalk.cyan('  Player Name                | Fed | Games vs Rated | Score vs Rated | Meets Criteria | Estimated Rating'));
    console.log(chalk.gray('  ---------------------------|-----|----------------|----------------|----------------|------------------'));

    // For each unrated player, check games against rated opponents
    for (const player of unratedPlayers) {
      // Get all games where this player faced a rated opponent in this tournament
      const games = await db.all(`
        SELECT 
          CASE 
            WHEN g.white_player_id = ? THEN g.black_player_id
            ELSE g.white_player_id
          END as opponent_id,
          CASE 
            WHEN g.white_player_id = ? THEN g.black_rating
            ELSE g.white_rating
          END as opponent_rating,
          CASE
            WHEN g.white_player_id = ? AND g.result = '1-0' THEN 1
            WHEN g.black_player_id = ? AND g.result = '0-1' THEN 1
            WHEN g.result = '1/2-1/2' THEN 0.5
            WHEN g.white_player_id = ? AND g.result = '1-0+' THEN 1
            WHEN g.black_player_id = ? AND g.result = '0-1+' THEN 1
            ELSE 0
          END as score
        FROM games g
        WHERE g.tournament_id = ?
        AND (
          (g.white_player_id = ? AND g.black_rating IS NOT NULL AND g.black_rating > 0) OR
          (g.black_player_id = ? AND g.white_rating IS NOT NULL AND g.white_rating > 0)
        )
      `, [player.player_id, player.player_id, player.player_id, player.player_id, player.player_id, player.player_id, tournament.id, player.player_id, player.player_id]);

      // Apply FIDE criteria for obtaining a first rating
      const gamesVsRated = games.length;
      const scoreVsRated = games.reduce((sum, game) => sum + game.score, 0);

      // FIDE criteria: At least 5 games against rated opponents
      const meetsFideCriteria = gamesVsRated >= 5;

      // Calculate estimated rating if criteria are met
      let estimatedRating = null;
      if (meetsFideCriteria && gamesVsRated > 0) {
        // Calculate average rating of opponents
        const avgOpponentRating = games.reduce((sum, game) => sum + game.opponent_rating, 0) / gamesVsRated;

        // Calculate performance rating based on score percentage
        const scorePercentage = (scoreVsRated / gamesVsRated) * 100;

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
        estimatedRating = Math.round(avgOpponentRating + performanceDiff);

        // FIDE floor for initial ratings
        if (estimatedRating < 1000) estimatedRating = 1000;
      }

      // Display results
      console.log(
        `  ${player.name.padEnd(27)}| ` +
        `${(player.federation || '').padEnd(5)}| ` +
        `${gamesVsRated.toString().padEnd(16)}| ` +
        `${scoreVsRated.toFixed(1).padEnd(15)}| ` +
        `${meetsFideCriteria ? chalk.green('Yes') : chalk.red('No ')}${' '.repeat(15)}| ` +
        `${estimatedRating ? chalk.yellow(estimatedRating.toString()) : 'N/A'}`
      );

      // Add to results for CSV
      if (meetsFideCriteria) {
        reportResults.push({
          tournament_name: tournament.name,
          tournament_date: tournament.date,
          tournament_id: tournament.id,
          player_id: player.player_id,
          player_name: player.name,
          player_federation: player.federation,
          games_vs_rated: gamesVsRated,
          score_vs_rated: scoreVsRated,
          estimated_rating: estimatedRating,
          total_tournament_points: player.points,
          combined_tournaments: false,
          combined_with: null
        });

        // Store in database
        await db.run(`
          INSERT OR REPLACE INTO rating_eligibility (
            player_id,
            tournament_id,
            games_vs_rated,
            score_vs_rated,
            estimated_rating,
            total_tournament_points,
            combined_tournaments
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          player.player_id,
          tournament.id,
          gamesVsRated,
          scoreVsRated,
          estimatedRating,
          player.points,
          false
        ]);
      }
    }
  }

  // Now analyze players who may qualify by combining tournaments
  console.log(chalk.cyan('\nCombined Tournaments Eligibility:'));
  console.log(chalk.italic('Analyzing unrated players who didn\'t qualify in a single tournament but might qualify by combining tournaments...'));

  // Get all unrated player IDs and their tournament appearances
  const unratedPlayerAppearances = await db.all(`
    SELECT 
      p.id as player_id,
      p.name,
      p.federation,
      t.id as tournament_id,
      t.name as tournament_name,
      t.date as tournament_date,
      tr.rating
    FROM tournament_results tr
    JOIN players p ON tr.player_id = p.id
    JOIN tournaments t ON tr.tournament_id = t.id
    WHERE tr.rating IS NULL OR tr.rating = 0
    ORDER BY p.id, t.date
  `);

  // Group appearances by player
  const playerAppearances = {};
  unratedPlayerAppearances.forEach(appearance => {
    if (!playerAppearances[appearance.player_id]) {
      playerAppearances[appearance.player_id] = {
        player_id: appearance.player_id,
        name: appearance.name,
        federation: appearance.federation,
        tournaments: []
      };
    }
    playerAppearances[appearance.player_id].tournaments.push({
      tournament_id: appearance.tournament_id,
      tournament_name: appearance.tournament_name,
      tournament_date: appearance.tournament_date
    });
  });

  // For each player with multiple tournament appearances, check if they qualify when combining tournaments
  const combinedResults = [];

  for (const playerID in playerAppearances) {
    const player = playerAppearances[playerID];

    // Skip players who already qualified in a single tournament
    if (reportResults.some(r => r.player_id === parseInt(playerID))) {
      continue;
    }

    // Skip players with only one tournament (already checked above)
    if (player.tournaments.length < 2) {
      continue;
    }

    // Get all games against rated opponents for this player across all tournaments
    const combinedGames = await db.all(`
      SELECT 
        g.tournament_id,
        t.name as tournament_name,
        t.date as tournament_date,
        CASE 
          WHEN g.white_player_id = ? THEN g.black_player_id
          ELSE g.white_player_id
        END as opponent_id,
        CASE 
          WHEN g.white_player_id = ? THEN g.black_rating
          ELSE g.white_rating
        END as opponent_rating,
        CASE
          WHEN g.white_player_id = ? AND g.result = '1-0' THEN 1
          WHEN g.black_player_id = ? AND g.result = '0-1' THEN 1
          WHEN g.result = '1/2-1/2' THEN 0.5
          WHEN g.white_player_id = ? AND g.result = '1-0+' THEN 1
          WHEN g.black_player_id = ? AND g.result = '0-1+' THEN 1
          ELSE 0
        END as score
      FROM games g
      JOIN tournaments t ON g.tournament_id = t.id
      WHERE (
        (g.white_player_id = ? AND g.black_rating IS NOT NULL AND g.black_rating > 0) OR
        (g.black_player_id = ? AND g.white_rating IS NOT NULL AND g.white_rating > 0)
      )
      ORDER BY t.date
    `, [playerID, playerID, playerID, playerID, playerID, playerID, playerID, playerID]);

    // FIDE criteria: At least 5 games against rated opponents across all tournaments
    const totalGamesVsRated = combinedGames.length;
    const totalScoreVsRated = combinedGames.reduce((sum, game) => sum + game.score, 0);

    if (totalGamesVsRated >= 5) {
      // Group games by tournament
      const gamesByTournament = {};
      combinedGames.forEach(game => {
        if (!gamesByTournament[game.tournament_id]) {
          gamesByTournament[game.tournament_id] = {
            tournament_id: game.tournament_id,
            tournament_name: game.tournament_name,
            tournament_date: game.tournament_date,
            games: []
          };
        }
        gamesByTournament[game.tournament_id].games.push(game);
      });

      // Calculate estimated rating
      const avgOpponentRating = combinedGames.reduce((sum, game) => sum + game.opponent_rating, 0) / totalGamesVsRated;
      const scorePercentage = (totalScoreVsRated / totalGamesVsRated) * 100;

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
      let estimatedRating = Math.round(avgOpponentRating + performanceDiff);

      // FIDE floor for initial ratings
      if (estimatedRating < 1000) estimatedRating = 1000;

      // Format tournament list for display
      const tournamentDetails = Object.values(gamesByTournament).map(t => ({
        name: t.tournament_name,
        date: t.tournament_date,
        games: t.games.length,
        score: t.games.reduce((sum, g) => sum + g.score, 0).toFixed(1)
      }));

      // Display results
      console.log(`\n${chalk.yellow(player.name)} (${player.federation || 'Unknown'}):`);
      console.log(`  Total: ${totalGamesVsRated} games vs rated opponents, Score: ${totalScoreVsRated.toFixed(1)}, Estimated Rating: ${chalk.yellow(estimatedRating)}`);
      console.log('  Tournaments contributing to eligibility:');
      tournamentDetails.forEach(t => {
        console.log(`    - ${t.date}: ${t.name} (${t.games} games, ${t.score} points)`);
      });

      // Add to combined results for CSV
      const tournamentIds = Object.keys(gamesByTournament).map(id => parseInt(id));
      const tournamentNames = Object.values(gamesByTournament).map(t => t.tournament_name);
      const tournamentDates = Object.values(gamesByTournament).map(t => t.tournament_date);

      combinedResults.push({
        player_id: parseInt(playerID),
        player_name: player.name,
        player_federation: player.federation,
        games_vs_rated: totalGamesVsRated,
        score_vs_rated: totalScoreVsRated,
        estimated_rating: estimatedRating,
        combined_tournaments: true,
        tournament_ids: tournamentIds,
        tournament_names: tournamentNames,
        tournament_dates: tournamentDates
      });

      // Store combined results in database
      await db.run(`
        INSERT OR REPLACE INTO rating_eligibility (
          player_id,
          games_vs_rated,
          score_vs_rated,
          estimated_rating,
          combined_tournaments,
          combined_tournament_ids,
          combined_tournament_names,
          combined_tournament_dates
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        parseInt(playerID),
        totalGamesVsRated,
        totalScoreVsRated,
        estimatedRating,
        true,
        JSON.stringify(tournamentIds),
        JSON.stringify(tournamentNames),
        JSON.stringify(tournamentDates)
      ]);

      // Add to main results for CSV export
      reportResults.push({
        tournament_name: tournamentDetails.map(t => t.name).join(' + '),
        tournament_date: tournamentDetails[tournamentDetails.length - 1].date, // Use latest tournament date
        tournament_id: null,
        player_id: parseInt(playerID),
        player_name: player.name,
        player_federation: player.federation,
        games_vs_rated: totalGamesVsRated,
        score_vs_rated: totalScoreVsRated,
        estimated_rating: estimatedRating,
        total_tournament_points: null,
        combined_tournaments: true,
        combined_with: tournamentDetails.map(t => `${t.date}: ${t.name} (${t.games} games)`).join('; ')
      });
    }
  }

  if (combinedResults.length === 0) {
    console.log('  No additional players qualifying by combining tournaments.');
  }

  // Save the report to a CSV file
  if (reportResults.length > 0) {
    const reportCSV = [
      'Player Name,Federation,Tournament(s),Tournament Date,Games vs Rated,Score vs Rated,Estimated Rating,Combined Tournaments,Combined Details',
      ...reportResults.map(r =>
        `"${r.player_name}",` +
        `${r.player_federation || ''},` +
        `"${r.tournament_name}",` +
        `${r.tournament_date},` +
        `${r.games_vs_rated},` +
        `${r.score_vs_rated.toFixed(1)},` +
        `${r.estimated_rating},` +
        `${r.combined_tournaments ? 'Yes' : 'No'},` +
        `"${r.combined_tournaments ? r.combined_with : ''}"`
      )
    ].join('\n');

    fs.writeFileSync(csvFilename, reportCSV);
    console.log(`\nRating eligibility report saved to ${csvFilename}`);

    // Generate summary statistics
    console.log('\n===== SUMMARY STATISTICS =====');
    const singleTournamentCount = reportResults.filter(r => !r.combined_tournaments).length;
    const combinedTournamentCount = reportResults.filter(r => r.combined_tournaments).length;

    console.log(`Total eligible players: ${chalk.yellow(reportResults.length)}`);
    console.log(`  - Through single tournament: ${chalk.yellow(singleTournamentCount)}`);
    console.log(`  - Through combined tournaments: ${chalk.yellow(combinedTournamentCount)}`);
    console.log(`Average estimated rating: ${chalk.yellow(Math.round(reportResults.reduce((sum, r) => sum + r.estimated_rating, 0) / reportResults.length))}`);
  } else {
    console.log("\nNo players found who meet FIDE criteria for first rating.");
  }

  // Close the database connection
  await db.close();
}

module.exports = { generateRatingProgressReport };