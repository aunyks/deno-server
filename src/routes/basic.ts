import * as Eta from 'eta';
import { Router } from '/router.ts';
import { GlobalState } from '/server.ts';
import { serveDir } from '/file_server.ts';

export default function registerBasicHandlers(router: Router) {
	router.get(
		'/hi/:name',
		async (_req: Request, params: Record<string, string>) => {
			const viewDetails = { name: params.name };
			const headers = new Headers({
				'Content-Type': 'text/html;charset=UTF-8'
			})
			return new Response(
				await Eta.renderFile('/hi', viewDetails) as BodyInit,
				{
					headers
				}
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
			return serveDir(req, {
				fsRoot: `${workingDir}/static`,
				showDirListing: true,
				showDotfiles: false,
				enableCors: true,
				quiet: true,
			});
		},
	);
}
