import * as postgres from 'postgres';
import { SMTPClient } from 'denomailer';
import { StatsDClient } from 'statsd';
import { Router } from '/router.ts';
import { Logger } from '/logger.ts';
import registerBasicHandlers from '/routes/basic.ts';

type GlobalState = {
	readonly sqlConnPool: postgres.Pool;
	readonly mailClient: SMTPClient;
	readonly workingDir: string;
	readonly log: Logger;
	readonly statsdClient: StatsDClient;
};

const router = new Router();

registerBasicHandlers(router);

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
