import { serveDir } from '/file_server.ts';

interface StaticFileServeOptions {
	workingDir: string;
}
function serveStatic(
	req: Request,
	opts: StaticFileServeOptions,
): Promise<Response> {
	return serveDir(req, {
		fsRoot: `${opts.workingDir}/src/static`,
		showDirListing: true,
		showDotfiles: false,
		enableCors: true,
		quiet: true,
	});
}

function htmlContentType(): string {
	return 'text/html;charset=UTF-8';
}

export { htmlContentType, serveStatic };
export type { StaticFileServeOptions };
