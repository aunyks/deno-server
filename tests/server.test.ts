import { Server } from 'src/server.ts';
import { assertEquals } from 'std/testing/asserts.ts';
import { afterAll, beforeAll, it } from 'std/testing/bdd.ts';
import { initTestServer } from 'tests/helpers/mod.ts';
import { DOMParser } from 'deno-dom';

let server: Server | null = null;

beforeAll(async () => {
	server = await initTestServer();
});

afterAll(async () => {
	await server?.destroy();
});

it('/hi returns hi', async () => {
	const req = new Request('proto://hostname.tld/hi/gerald');
	const res = await server?.handleRequest(req);
	const body = await res?.text();
	assertEquals(res?.status, 200);
	const doc = new DOMParser().parseFromString(body as string, 'text/html');
	const bodyText = doc?.getElementById('msg')?.innerText;
	assertEquals(bodyText, 'hi gerald');
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
