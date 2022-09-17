import { Router } from '/router.ts';
import { GlobalState } from '/server.ts';
import { serveStatic } from '/lib/misc.ts';

export default function registerStaticHandlers(router: Router) {
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
