import * as postgres from 'postgres';
import { SMTPClient } from 'denomailer';
import { StatsDClient } from 'statsd';
import * as Eta from 'eta';
import { Logger } from 'src/logger.ts';
import { Server } from 'src/server.ts';

type CustomServerArgs = {
	logger?: Logger;
};

export async function initTestServer(
	customArgs?: CustomServerArgs,
): Promise<Server> {
	const {
		DATABASE_URL,
		SMTP_HOST,
		SMTP_PORT,
		SMTP_USERNAME,
		SMTP_PASSWORD,
	} = Deno.env.toObject();
	const pool = new postgres.Pool(
		DATABASE_URL,
		1,
		false,
	);

	const connection = await pool.connect();
	try {
		// Create the table
		await connection.queryObject`
  	CREATE TABLE IF NOT EXISTS todos (
  	  id SERIAL PRIMARY KEY,
  	  title TEXT NOT NULL
  	)
    `;
	} finally {
		await connection.end();
	}

	const mailClient = new SMTPClient({
		debug: {
			allowUnsecure: true,
		},
		connection: {
			hostname: SMTP_HOST,
			port: Number(SMTP_PORT),
			tls: false,
			auth: {
				username: SMTP_USERNAME,
				password: SMTP_PASSWORD,
			},
		},
		pool: {
			size: 1,
		},
	});

	const statsdClient = new StatsDClient({
		// @ts-ignore: TS incorrectly lints this property
		logger: customArgs?.logger || new Logger(),
	});

	const cwd = Deno.cwd();
	const viewsPath = `${cwd}/views/`;
	Eta.configure({
		cache: true,
		views: viewsPath,
	});

	return new Server({
		sqlConnPool: pool,
		mailClient: mailClient,
		workingDir: cwd,
		log: customArgs?.logger || new Logger(),
		statsdClient: statsdClient,
	});
}
