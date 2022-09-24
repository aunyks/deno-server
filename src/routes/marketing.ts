import * as Eta from 'eta';
import { Router } from '/router.ts';
import { htmlContentType } from '/lib/headers.ts';

export default function registerMarketingHandlers(router: Router) {
	router.get(
		'/',
		async () => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
			});
			return new Response(
				await Eta.renderFile('/pages/index.eta', {}) as BodyInit,
				{
					headers,
				},
			);
		},
	);
}
