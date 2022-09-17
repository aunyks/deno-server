import * as Eta from 'eta';
import { Router } from '/router.ts';
import { GlobalState } from '/server.ts';
import { serveStatic } from '/lib/misc.ts';
import { htmlContentType } from '/lib/headers.ts';

export default function registerBasicHandlers(router: Router) {
	router.get(
		'/hi/:name',
		async (
			_req: Request,
			params: Record<string, string>,
			{ statsdClient }: GlobalState,
		) => {
			const viewDetails = { name: params.name };
			const headers = new Headers({
				'Content-Type': htmlContentType(),
			});
			statsdClient.count('greeting');
			return new Response(
				await Eta.renderFile('/hi', viewDetails) as BodyInit,
				{
					headers,
				},
			);
		},
	);

	router.get(
		'/*',
		(
			req: Request,
			_params: Record<string, string>,
			{ workingDir }: GlobalState,
		) => {
			return serveStatic(req, {
				workingDir,
			});
		},
	);
}
