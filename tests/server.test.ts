import * as postgres from 'postgres';
import { SMTPClient } from 'denomailer';
import * as Eta from 'eta';

import { Server } from '/server.ts';
import { assertEquals } from 'std/testing/asserts.ts';
import { afterAll, beforeAll, it } from 'std/testing/bdd.ts';

let server: Server | null = null;

beforeAll(async () => {
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

	const cwd = Deno.cwd();
	const viewsPath = `${cwd}/views/`;
	Eta.configure({
		cache: true,
		views: viewsPath,
	});

	server = new Server({
		sqlConnPool: pool,
		mailClient: mailClient,
		workingDir: cwd,
	});
});

afterAll(async () => {
	await server?.destroy();
});

it('/hi returns hi', async () => {
	const req = new Request('proto://hostname.tld/hi/gerald');
	const res = await server?.handleRequest(req);
	const body = await res?.text();
	assertEquals(res?.status, 200);
	assertEquals(body, 'hi gerald');
});

// Deno.test('sent email', async () => {
// 	// https://github.com/mailhog/MailHog/tree/master/docs/APIv2
// 	const req = new Request(
// 		'http://localhost:8025/api/v2/search?limit=1&kind=from&query=me@example.com',
// 	);
// 	const res = await fetch(req);
// 	const body = await res.json();
// 	const message = body.items[0];
// 	const sendingAddress = message.Raw.From;
// 	const receivingAddress = message.Raw.To[0];
// 	const subject = message.Content.Headers.Subject[0];
// 	const plainBody = message.MIME.Parts[0].MIME.Parts[0].Body;
// 	const htmlBody = message.MIME.Parts[0].MIME.Parts[1].Body;

// 	assertEquals(res.status, 200);
// 	// // Make sure we only sent 1 message with these query details
// 	// assertEquals(body.total, 1)
// 	assertEquals(sendingAddress, 'me@example.com');
// 	assertEquals(receivingAddress, 'you@example.com');
// 	assertEquals(subject, ' example');
// 	// WARNING / TODO: There may be a base64 encoding discrepancy
// 	// between denomailer and mailhog! Why else would these spaces
// 	// and missing characters be here?
// 	assertEquals(plainBody, '.. ');
// 	assertEquals(htmlBody, '<p>...</p> ');
// });
