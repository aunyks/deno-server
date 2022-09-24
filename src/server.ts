import * as postgres from 'postgres';
import { SMTPClient } from 'denomailer';
import { StatsDClient } from 'statsd';
import { Router } from '/router.ts';
import { Logger } from '/lib/logger.ts';
import registerStaticHandlers from '/routes/static-files.ts';
import registerMarketingHandlers from '/routes/marketing.ts';
import registerAuthHandlers from '/routes/auth.ts';

interface PasswordHasher {
	hash(password: string, saltB64?: string): [string, string];
	verify(
		password: string,
		existingB64Digest: string,
		saltB64?: string,
	): boolean;
}

type GlobalState = {
	readonly sqlConnPool: postgres.Pool;
	readonly mailClient: SMTPClient;
	readonly workingDir: string;
	readonly log: Logger;
	readonly statsdClient: StatsDClient;
	readonly passwordHasher: PasswordHasher;
};

const router = new Router();

// Register handlers in order of priority.
// This means wildcard / catch-all handlers
// like the static file handlers must register last
registerMarketingHandlers(router);
registerAuthHandlers(router);
registerStaticHandlers(router);

class Server {
	globalState: GlobalState;

	constructor(globalState: GlobalState) {
		this.globalState = globalState;
	}

	handleRequest(incomingRequest: Request): Promise<Response> {
		return router.route(incomingRequest, this.globalState);
	}

	async destroy(): Promise<void> {
		await this.globalState.sqlConnPool.end();
		await this.globalState.mailClient.close();
		await this.globalState.statsdClient.close();
	}
}

export type { GlobalState };
export { Server };
