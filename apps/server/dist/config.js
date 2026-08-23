/** Environment configuration — parsed once, validated with zod. */
import { randomBytes } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
const envSchema = z.object({
    HOST: z.string().default('127.0.0.1'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4311),
    DATABASE_PATH: z.string().default('./data/opencouncil.db'),
    OPEN_COUNCIL_SECRET_KEY: z.string().min(8).optional(),
    SEED_DEMO_COUNCIL: z
        .string()
        .default('true')
        .transform((v) => v !== 'false' && v !== '0'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});
export function loadConfig(env = process.env) {
    const parsed = envSchema.parse(env);
    // Resolve DB path relative to the server package dir for predictable dev behavior.
    const isAbsolute = parsed.DATABASE_PATH.startsWith('/');
    let databasePath = parsed.DATABASE_PATH;
    if (!isAbsolute && !parsed.DATABASE_PATH.includes(process.cwd())) {
        databasePath = path.join(process.cwd(), parsed.DATABASE_PATH);
    }
    const dataDir = path.dirname(databasePath);
    mkdirSync(dataDir, { recursive: true });
    const secretKey = parsed.OPEN_COUNCIL_SECRET_KEY ?? randomBytes(32).toString('hex');
    return {
        host: parsed.HOST,
        port: parsed.PORT,
        databasePath,
        dataDir,
        hasDurableSecret: parsed.OPEN_COUNCIL_SECRET_KEY !== undefined,
        secretKey,
        seedDemoCouncil: parsed.SEED_DEMO_COUNCIL,
        logLevel: parsed.LOG_LEVEL,
    };
}
//# sourceMappingURL=config.js.map