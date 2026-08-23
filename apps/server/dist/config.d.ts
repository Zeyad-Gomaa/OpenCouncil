export type AppConfig = {
    host: string;
    port: number;
    databasePath: string;
    dataDir: string;
    /** True when a durable master key was provided via env (keys survive restart). */
    hasDurableSecret: boolean;
    secretKey: string;
    seedDemoCouncil: boolean;
    logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
};
export declare function loadConfig(env?: NodeJS.ProcessEnv): AppConfig;
