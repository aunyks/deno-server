import * as postgres from 'postgres';
import * as Eta from 'eta';
import { SMTPClient } from 'denomailer';
import { serveDir } from '/file_server.ts';
import { Router } from '/router.ts';

const router = new Router();

router.get('/hi/:name', async (_req, params) => {
	const viewDetails = { name: params.name };
	return new Response(
		await Eta.renderFile('/hi', viewDetails) as BodyInit,
	);
});

router.get('/*', (req, _params, { workingDir }) => {
	return serveDir(req, {
		fsRoot: `${workingDir}/static`,
		showDirListing: true,
		showDotfiles: false,
		enableCors: true,
		quiet: true,
	});
});

type GlobalState = {
	sqlConnPool: postgres.Pool;
	mailClient: SMTPClient;
	workingDir: string;
};

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
