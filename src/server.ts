import * as postgres from 'postgres';
import { SMTPClient } from 'denomailer';
import { Router } from '/router.ts';
import { Logger } from '/logger.ts'; 
import registerBasicHandlers from '/routes/basic.ts';

type GlobalState = {
	sqlConnPool: postgres.Pool;
	mailClient: SMTPClient;
	workingDir: string;
	log: Logger;
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
	}
}

export type { GlobalState };
export { Server };
