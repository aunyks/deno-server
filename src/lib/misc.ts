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
		showDirListing: false,
		showDotfiles: false,
		enableCors: false,
		quiet: true,
	});
}

export { serveStatic };
export type { StaticFileServeOptions };
