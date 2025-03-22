# Keshmat Chess Circuit Database

A command-line tool for processing chess tournament crosstables and analyzing player performance across multiple tournaments in the Keshmat chess circuit.

## Features

- Process Excel-based tournament crosstables
- Generate circuit leaderboard and statistics
- Track player rating progression
- Calculate performance ratings using FIDE methodology
- Identify top performers in each tournament
- Export reports to CSV files

## Installation

1. Make sure you have Node.js v22 installed (use the included `.nvmrc` file with nvm if available)
   ```bash
   # If using nvm
   nvm use
   ```
2. Install dependencies using Yarn:

   ```bash
   yarn install
   # or simply
   yarn
   ```

3. Make the CLI executable (optional):
   ```bash
   chmod +x circuit.js
   ```

## Command-Line Interface

The tool provides a comprehensive CLI with multiple commands:

```
Usage: circuit [options] [command]

Chess tournament circuit management CLI

Options:
  -V, --version              output the version number
  -h, --help                 display help for command

Commands:
  process [options] [dir]    Process tournament files and create/update the database
  leaderboard [options]      Generate the circuit leaderboard
  rating-progress [options]  Generate report on players who went from unrated to rated
  performance [options]      Generate performance rating report
  help [command]             display help for command
```

## Commands

### Process Tournament Files

```bash
circuit process [directory]
```

Processes Excel files containing chess tournament crosstables and populates the SQLite database.

Options:

- `-f, --force` - Force reprocessing of all files (even previously processed ones)

### Generate Circuit Leaderboard

```bash
circuit leaderboard
```

Generates a comprehensive leaderboard of all players in the circuit.

Options:

- `-t, --top <number>` - Show only the top N players
- `-c, --csv <filename>` - Specify custom CSV filename (default: keshmat_leaderboard.csv)

### Track Rating Eligibility

```bash
circuit rating-progress
```

Identifies unrated players who meet FIDE criteria for obtaining a first rating (5 or more games against rated opponents) in either:

- A single tournament, or
- By combining games across multiple tournaments within the rating period

Options:

- `-c, --csv <filename>` - Specify custom CSV filename (default: rating_eligibility_report.csv)

### Calculate Performance Ratings

```bash
circuit performance
```

Generates performance ratings for all players and identifies top performers in each tournament.

Options:

- `-c, --csv <filename>` - Specify custom CSV filename (default: performance_ratings.csv)
- `--no-tournaments` - Skip tournament-by-tournament analysis

## Project Structure

```
keshmat-chess-circuit/
├── circuit.js              # Main CLI entry point
├── lib/                    # Library modules
│   ├── chess-db.js         # Database creation and file processing
│   ├── generate-leaderboard.js   # Leaderboard generation
│   ├── generate-rating-report.js # Rating progress tracking
│   └── generate-performance-report.js # Performance ratings
├── tournament_files/       # Default directory for Excel files
├── package.json            # Project configuration and dependencies
└── README.md               # Documentation
```

## Using Yarn Scripts

For convenience, you can also use the predefined Yarn scripts:

```bash
# Process tournament files
yarn process

# Generate circuit leaderboard
yarn leaderboard

# Generate rating eligibility report
yarn rating-eligibility

# Generate performance ratings
yarn performance
```

## Performance Rating Methodology

The performance rating calculations follow these rules:

1. **Unrated Players Excluded**

   - Games against unrated opponents are excluded from performance calculations
   - This avoids skewing results with arbitrary or meaningless values

2. **FIDE Formula Basis**

   - Performance ratings are calculated using a formula similar to FIDE's method
   - The formula: Average Opponent Rating + Rating Difference based on Score Percentage

3. **Minimum Game Threshold**

   - Tournament performance calculations require at least 3 games against rated opponents
   - This ensures statistical significance of the performance rating

4. **Expected vs. Actual Score**
   - The system calculates the expected score based on rating differences
   - Compares actual results to expected results to identify over/underperformance

## Key Features for Rating Analysis

The database stores comprehensive rating information:

1. **Player Ratings at Tournament Time**

   - Each player's rating is recorded for every tournament they participate in

2. **Game-Specific Ratings**

   - Both players' ratings are stored with each individual game record
   - This allows for accurate performance rating calculations without reprocessing files
   - Supports FIDE-style expected score and performance rating calculations

3. **Rating Progression Tracking**
   - Track how a player's rating evolves throughout the circuit
   - Identify which tournaments had the biggest impact on rating changes

## License

This tool is provided as-is under the MIT License.
