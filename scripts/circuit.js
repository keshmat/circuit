#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { Command } = require('commander');
const chalk = require('chalk');
const { processChessTournaments } = require('./lib/chess-db');
const { generateLeaderboard } = require('./lib/generate-leaderboard');
const { generateRatingProgressReport } = require('./lib/generate-rating-report');
const { generatePerformanceReport } = require('./lib/generate-performance-report');
const { inspectTournament } = require('./lib/inspect-tournament');

// Create CLI program
const program = new Command();

program
  .name('circuit')
  .description('Chess tournament circuit management CLI')
  .version('1.0.0');

// Process command - Run all reports and save to database
program
  .command('process')
  .description('Process tournament files and generate all reports')
  .argument('[directory]', 'Directory containing tournament Excel files', './tournament_files')
  .option('-f, --force', 'Force reprocessing of all files')
  .action(async (directory, options) => {
    console.log(chalk.blue('🚀 Processing tournament files and generating reports...'));

    if (!fs.existsSync(directory)) {
      console.error(chalk.red('❌ Error:'), `Directory not found: ${directory}`);
      process.exit(1);
    }

    try {
      // Step 1: Process tournament files
      console.log(chalk.blue('\n📁 Processing tournament files...'));
      await processChessTournaments(directory, options.force);

      // Step 2: Generate leaderboard
      console.log(chalk.blue('\n📊 Generating circuit leaderboard...'));
      await generateLeaderboard({ saveToDb: true });

      // Step 3: Generate rating progress report
      console.log(chalk.blue('\n📈 Generating rating eligibility report...'));
      await generateRatingProgressReport({ saveToDb: true });

      // Step 4: Generate performance ratings
      console.log(chalk.blue('\n⚡ Generating performance ratings...'));
      await generatePerformanceReport({ saveToDb: true });

      console.log(chalk.green('\n✓ All reports generated and saved to database!'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Import command - Import tournament files and seed database
program
  .command('import')
  .description('Import tournament files and create/update the database')
  .argument('[directory]', 'Directory containing tournament Excel files', './tournament_files')
  .option('-f, --force', 'Force reprocessing of all files')
  .action(async (directory, options) => {
    console.log(chalk.blue('🏆 Importing tournament files from:'), directory);

    if (!fs.existsSync(directory)) {
      console.error(chalk.red('❌ Error:'), `Directory not found: ${directory}`);
      process.exit(1);
    }

    try {
      await processChessTournaments(directory, options.force);
      console.log(chalk.green('✓ Import complete!'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Leaderboard command - Generate circuit leaderboard
program
  .command('leaderboard')
  .description('Generate the circuit leaderboard')
  .option('-t, --top <number>', 'Show only top N players', parseInt)
  .option('-c, --csv <filename>', 'Save to CSV file', 'keshmat_leaderboard.csv')
  .action(async (options) => {
    console.log(chalk.blue('📊 Generating circuit leaderboard...'));

    try {
      await generateLeaderboard(options);
      console.log(chalk.green('✓ Leaderboard generation complete!'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Rating progress command - Track unrated to rated players
program
  .command('rating-progress')
  .description('Generate report on players who meet FIDE criteria for first rating (single or combined tournaments)')
  .option('-c, --csv <filename>', 'Save to CSV file', 'rating_eligibility_report.csv')
  .action(async (options) => {
    console.log(chalk.blue('📈 Generating rating eligibility report...'));

    try {
      await generateRatingProgressReport(options);
      console.log(chalk.green('✓ Rating eligibility report complete!'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Performance command - Generate performance ratings
program
  .command('performance')
  .description('Generate performance rating report')
  .option('-c, --csv <filename>', 'Save to CSV file', 'performance_ratings.csv')
  .option('-t, --tournaments', 'Include tournament-by-tournament analysis', true)
  .action(async (options) => {
    console.log(chalk.blue('⚡ Generating performance ratings...'));

    try {
      await generatePerformanceReport(options);
      console.log(chalk.green('✓ Performance report complete!'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Inspect command - Inspect raw data for a specific tournament
program
  .command('inspect')
  .description('Inspect raw data for a specific tournament')
  .argument('<tournament>', 'Tournament name or ID to inspect')
  .option('-d, --details', 'Show detailed player performance data', false)
  .option('-g, --games', 'Show game-by-game data', false)
  .action(async (tournament, options) => {
    console.log(chalk.blue(`🔍 Inspecting tournament: ${tournament}`));

    try {
      await inspectTournament(tournament, options);
      console.log(chalk.green('✓ Inspection complete!'));
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      process.exit(1);
    }
  });

// Default command if none specified
program
  .addHelpText('after', `
Examples:
  $ circuit process ./my_tournament_files    Process files and generate all reports
  $ circuit import ./my_tournament_files     Import tournament files
  $ circuit leaderboard                      Generate circuit leaderboard
  $ circuit rating-progress                  Show unrated to rated player progress
  $ circuit performance                      Generate performance ratings
  $ circuit inspect "Tournament Name"        Inspect raw data for a specific tournament
  $ circuit inspect "Tournament Name" -d     Show detailed player performance data`);

// Parse command line arguments
program.parse(process.argv);

// If no args, show help
if (!process.argv.slice(2).length) {
  program.help();
}