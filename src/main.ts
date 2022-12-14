import { serve } from 'std/http/server.ts';
import { parse } from 'std/flags/mod.ts';
import * as postgres from 'postgres';
import { StatsDClient } from 'statsd';
import * as Eta from 'eta';
import { SMTPClient } from 'denomailer';
import { Server } from '/server.ts';
import { ConsoleLogger } from '/lib/logger.ts';
import { Argon2 } from '/lib/argon2.ts';

const serverArgs = parse(Deno.args, {
	string: ['port', 'host', 'workingDir'],
	boolean: ['help'],
	default: {
		host: '0.0.0.0',
		port: '8000',
		workingDir: Deno.cwd(),
	},
	alias: {
		p: 'port',
		h: 'help',
		d: 'workingDir',
		wd: 'workingDir',
	},
});

function printHelp() {
	console.log(`deno-server
  A web server of prehistoric might.

USAGE:
  server --host 0.0.0.0 --port 8000

OPTIONS:
  -h, --help          Prints help information
  -p, --port <PORT>   Set port (default is 8000)
  --host     <HOST>   Hostname (default is 0.0.0.0)`);
}

async function main() {
	if (serverArgs.help) {
		printHelp();
		Deno.exit(0);
	}

	const {
		DATABASE_URL,
		SMTP_HOST,
		SMTP_PORT,
		SMTP_TLS_MODE,
		SMTP_USERNAME,
		SMTP_PASSWORD,
		STATSD_URL,
		STATSD_MTU,
	} = Deno.env.toObject();

	const dbConnectionUrl = DATABASE_URL;
	if (!dbConnectionUrl) {
		console.error('No database URL was provided!');
		Deno.exit(1);
	}

	const pool = new postgres.Pool(dbConnectionUrl, 3, true);

	const connection = await pool.connect();
	try {
		// Create tables
		await connection.queryObject`
		CREATE TABLE IF NOT EXISTS Users (
		  id BIGSERIAL PRIMARY KEY,
		  username VARCHAR(20) NOT NULL UNIQUE,
		  email VARCHAR(75) NOT NULL UNIQUE,
		  email_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
		  password TEXT NOT NULL,
		  salt VARCHAR(32) NOT NULL,
		  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
		  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
		)
	  `;

		await connection.queryObject`
		CREATE TABLE IF NOT EXISTS Logins (
		  user_id BIGSERIAL REFERENCES Users(id),
		  login_token VARCHAR(50) UNIQUE,
		  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
		)
	  `;

		await connection.queryObject`
		CREATE TABLE IF NOT EXISTS AccountRecoveries (
		  user_id BIGSERIAL REFERENCES Users(id),
		  recovery_token VARCHAR(50) UNIQUE,
		  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
		)
	  `;

		// TODO:
		await connection.queryObject`
		CREATE TABLE IF NOT EXISTS PendingEmailConfirmations (
		  user_id BIGSERIAL REFERENCES Users(id),
		  new_email VARCHAR(75) NOT NULL UNIQUE,
		  confirmation_token VARCHAR(50) UNIQUE,
		  created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
		)
	  `;
	} catch (e) {
		console.error(`Error while setting up tables: ${e.message}`);
	} finally {
		connection.release();
	}

	const mailClient = new SMTPClient({
		debug: {
			allowUnsecure: !['tls', 'starttls'].includes(SMTP_TLS_MODE),
		},
		connection: {
			hostname: SMTP_HOST,
			port: Number(SMTP_PORT),
			tls: SMTP_TLS_MODE === 'tls',
			auth: {
				username: SMTP_USERNAME,
				password: SMTP_PASSWORD,
			},
		},
	});

	const statsdUrl = new URL(STATSD_URL);
	const statsdClient = new StatsDClient({
		server: {
			// @ts-ignore: We're trusting that
			//             this will always either
			//             be 'tcp' or 'udp' at runtime
			proto: statsdUrl.protocol.slice(0, -1),
			host: statsdUrl.hostname,
			port: parseInt(statsdUrl.port),
			mtu: parseInt(STATSD_MTU ?? 512),
		},
	});

	const CWD = serverArgs.workingDir;

	const viewsPath = `${CWD}/src/views/`;
	Eta.configure({
		cache: true,
		views: viewsPath,
	});

	const argon2Hasher = await Argon2.initialize({
		saltLength: 16,
		outputLength: 32,
	});

	const server = new Server({
		sqlConnPool: pool,
		mailClient: mailClient,
		workingDir: CWD,
		log: new ConsoleLogger().withFilter((_level, message) => {
			return !message.includes('Gerald');
		}),
		statsdClient: statsdClient,
		passwordHasher: argon2Hasher,
	});

	addEventListener('unload', async () => {
		await server.destroy();
	});

	const socketDetails = {
		port: Number(serverArgs.port),
		hostname: serverArgs.host,
	};
	serve(
		(req: Request) => server.handleRequest(req),
		socketDetails,
	);
}

if (import.meta.main) {
	await main();
}
