/** Called once at app bootstrap with the configured master secret. */
export declare function initVault(secret: string): void;
/** Test seam: prime the key directly. */
export declare function setVaultKeyForTests(secret: string): void;
export declare function encryptSecret(plain: string): string;
export declare function decryptSecret(payload: string): string;
