import sqlite3 from "sqlite3";
import { open } from "sqlite";
import { Database } from "sqlite";

let db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (!db) {
    db = await open({
      filename: "scripts/keshmat_chess_circuit.db",
      driver: sqlite3.Database,
    });
  }
  return db;
}

export interface Player {
  name: string;
  points: string;
  tournaments_played: string;
  tournaments_counted: string;
}

export interface TournamentResult {
  name: string;
  points: string;
  games_played: string;
  wins: string;
  losses: string;
  draws: string;
  performance: string | null;
}

export interface PerformanceRating {
  name: string;
  rating: string;
  games_played: string;
  tournaments: string;
  performance: string | null;
}

export interface EligibilityRecord {
  name: string;
  eligible: string;
  games_played: string;
  tournaments: string;
  rating: string;
}
