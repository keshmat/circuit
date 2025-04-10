# Circuit CLI Tool

The Circuit CLI tool is a command-line interface for processing the circuit tournament crosstables. It provides various commands to process tournament data, generate reports, and analyze player performance.

## Commands

### `process`

Process tournament files and generate all reports in one command.

```bash
circuit process [directory] [-f, --force]
```

- Processes tournament files from the specified directory (default: `./tournament_files`)
- Generates circuit leaderboard
- Creates rating eligibility report
- Generates performance ratings
- Saves all reports to the database
- Use `--force` to reprocess all files

### `import`

Import tournament files and update the database.

```bash
circuit import [directory] [-f, --force]
```

- Imports tournament files from the specified directory
- Creates or updates the database with tournament data
- Use `--force` to reprocess all files

### `leaderboard`

Generate the circuit leaderboard.

```bash
circuit leaderboard [-t, --top <number>] [-c, --csv <filename>]
```

- Generates a leaderboard of players in the circuit
- Optionally show only top N players with `--top`
- Save to CSV file with `--csv` (default: `keshmat_leaderboard.csv`)

### `rating-progress`

Generate report on players who meet FIDE criteria for first rating.

```bash
circuit rating-progress [-c, --csv <filename>]
```

- Tracks unrated to rated players
- Identifies players who meet FIDE criteria for first rating
- Save to CSV file with `--csv` (default: `rating_eligibility_report.csv`)

### `performance`

Generate performance rating report.

```bash
circuit performance [-c, --csv <filename>] [-t, --tournaments]
```

- Generates performance ratings for players
- Includes tournament-by-tournament analysis by default
- Save to CSV file with `--csv` (default: `performance_ratings.csv`)

### `inspect`

Inspect raw data for a specific tournament.

```bash
circuit inspect <tournament> [-d, --details] [-g, --games]
```

- Shows raw data for a specific tournament
- Use `--details` to show detailed player performance data
- Use `--games` to show game-by-game data

## Output Files

The tool generates several output files:

1. `keshmat_leaderboard.csv` - Circuit leaderboard showing player rankings
2. `rating_eligibility_report.csv` - Report on players eligible for FIDE rating
3. `performance_ratings.csv` - Performance ratings analysis

## Requirements

- Node.js environment
- Tournament files in Excel format
- Database connection (configured in the application)

## Usage Examples

```bash
# Process all tournament files and generate reports
circuit process ./my_tournament_files

# Import new tournament files
circuit import ./new_tournaments

# Generate leaderboard showing top 10 players
circuit leaderboard --top 10

# Generate rating eligibility report
circuit rating-progress

# Generate performance ratings with tournament analysis
circuit performance --tournaments

# Inspect a specific tournament with detailed data
circuit inspect "Tournament Name" --details
```
