/** SQLite connection + embedded migrations. */
import Database from 'better-sqlite3';
import type { AppConfig } from '../config.js';
export type DB = Database.Database;
export declare function openDatabase(config: AppConfig): DB;
export declare function migrate(db: DB): void;
