import * as Eta from 'eta';
import { Router } from '/router.ts';
import { htmlContentType } from '/lib/headers.ts';
import { toBase64 } from '/lib/argon2.ts';
import {
	getLoginCookie,
	removeLoginCookie,
	setLoginCookie,
} from '/lib/cookie.ts';
import type { GlobalState } from '/server.ts';

const EMAIL_REGEX =
	/^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;

const POST_LOGIN_ROUTE = '/dashboard';

function validatePassword(
	password: string,
): { valid: boolean; invalidReason: string } {
	if (password.length < 8) {
		return {
			valid: false,
			invalidReason: 'Password must be at least 8 characters long',
		};
	}
	return { valid: true, invalidReason: '' };
}

function createLoginToken(): string {
	return toBase64(
		crypto.getRandomValues(new Uint8Array(32)),
	);
}

function createAccountRecoveryLoginToken(): string {
	return toBase64(
		crypto.getRandomValues(new Uint8Array(32)),
	);
}

function createEmailConfirmationToken(): string {
	return toBase64(
		crypto.getRandomValues(new Uint8Array(32)),
	);
}

async function signupPage(status: number, headers: Headers): Promise<Response> {
	return new Response(
		await Eta.renderFile('/pages/signup.eta', { values: {} }) as BodyInit,
		{ headers, status: status },
	);
}

async function signupError(
	status: number,
	message: string,
	headers: Headers,
	formValues?: Record<string, unknown>,
): Promise<Response> {
	return new Response(
		await Eta.renderFile('/pages/signup.eta', {
			errorMessage: message,
			values: formValues || {},
		}) as BodyInit,
		{ headers, status: status },
	);
}

async function loginPage(status: number, headers: Headers): Promise<Response> {
	return new Response(
		await Eta.renderFile('/pages/login.eta', { values: {} }) as BodyInit,
		{ headers, status: status },
	);
}

async function loginError(
	status: number,
	message: string,
	headers: Headers,
	formValues?: Record<string, unknown>,
): Promise<Response> {
	return new Response(
		await Eta.renderFile('/pages/login.eta', {
			errorMessage: message,
			values: formValues || {},
		}) as BodyInit,
		{ headers, status: status },
	);
}

async function forgotPasswordPage(
	status: number,
	headers: Headers,
	successMessage?: string,
): Promise<Response> {
	return new Response(
		await Eta.renderFile('/pages/forgot-password.eta', {
			values: {},
			successMessage: successMessage,
		}) as BodyInit,
		{ headers, status: status },
	);
}

async function forgotPasswordError(
	status: number,
	message: string,
	headers: Headers,
	formValues?: Record<string, unknown>,
): Promise<Response> {
	return new Response(
		await Eta.renderFile('/pages/forgot-password.eta', {
			errorMessage: message,
			values: formValues || {},
		}) as BodyInit,
		{ headers, status: status },
	);
}

async function changePasswordPage(
	status: number,
	headers: Headers,
	successMessage?: string,
): Promise<Response> {
	return new Response(
		await Eta.renderFile('/pages/change-password.eta', {
			values: {},
			successMessage: successMessage,
		}) as BodyInit,
		{ headers, status: status },
	);
}

async function changePasswordError(
	status: number,
	message: string,
	headers: Headers,
): Promise<Response> {
	return new Response(
		await Eta.renderFile('/pages/change-password.eta', {
			errorMessage: message,
		}) as BodyInit,
		{ headers, status: status },
	);
}

function forgotPasswordEmailText(
	recoveryToken: string,
	thisOrigin: string,
): string {
	return `To change your password, visit ${thisOrigin}/change-password/${
		encodeURIComponent(recoveryToken)
	}.\n
If you did not make this request, please ignore the link above.`;
}

function forgotPasswordEmailHtml(
	recoveryToken: string,
	thisOrigin: string,
): string {
	const recoveryUrl = `${thisOrigin}/change-password/${
		encodeURIComponent(recoveryToken)
	}`;
	return `<p>
    To change your password, visit <a href="${recoveryUrl}">${recoveryUrl}</a>.
    </p>
    <p>
    If you did not make this request, please ignore the link above.
    </p>`;
}

export async function userIdFromLoginToken(
	loginToken: string,
	sqlConnPool: GlobalState['sqlConnPool'],
): Promise<string> {
	let userId = '';
	const authCheckConnection = await sqlConnPool.connect();
	try {
		const authCheckResult = await authCheckConnection
			.queryObject<{ user_id: string }>(
				'SELECT user_id FROM Logins WHERE login_token = $1',
				[
					loginToken,
				],
			);
		if (authCheckResult.rows.length === 0) {
			authCheckConnection.release();
			return '';
		}
		userId = authCheckResult.rows[0].user_id;
	} catch (e) {
		throw e;
	} finally {
		authCheckConnection.release();
	}
	return userId;
}

function confirmEmailText(
	confToken: string,
	thisOrigin: string,
): string {
	return `To confirm your Deno Server email, visit ${thisOrigin}/confirm-email/${
		encodeURIComponent(confToken)
	}.\n
If you did not make this request, ignore the link above.`;
}

function confirmEmailHtml(
	confToken: string,
	thisOrigin: string,
): string {
	const recoveryUrl = `${thisOrigin}/confirm-email/${
		encodeURIComponent(confToken)
	}`;
	return `<p>
    To confirm your Deno Server email, visit <a href="${recoveryUrl}">${recoveryUrl}</a>.
    </p>
    <p>
    If you did not make this request, ignore the link above.
    </p>`;
}

async function askConfirmEmail(
	email: string,
	userId: string,
	serverOrigin: string,
	mailClient: GlobalState['mailClient'],
	sqlConnPool: GlobalState['sqlConnPool'],
) {
	const confToken = createEmailConfirmationToken();

	try {
		await mailClient.send({
			to: email,
			from: `Deno Server Account Confirmation <noreply@deno-server.com>`,
			subject: 'Confirm Account Email',
			content: confirmEmailText(confToken, serverOrigin),
			html: confirmEmailHtml(confToken, serverOrigin),
			priority: 'high',
		});
	} catch (e) {
		throw new Error(
			`Error while sending an email confirmation message: ${e.stack}`,
		);
	}

	const createConfirmationConnection = await sqlConnPool.connect();
	try {
		await createConfirmationConnection
			.queryObject(
				`INSERT INTO PendingEmailConfirmations (user_id, new_email, confirmation_token) VALUES ($1, $2, $3)`,
				[
					userId,
					email,
					confToken,
				],
			);
	} catch (e) {
		throw new Error(
			`Error while creating new pending email confirmation: ${e.stack}`,
		);
	} finally {
		createConfirmationConnection.release();
	}
}

async function confirmEmail(
	confirmationToken: string,
	sqlConnPool: GlobalState['sqlConnPool'],
) {
	// Search token in emailconfirmations
	const checkConfirmationConnection = await sqlConnPool.connect();
	let userId = '';
	let email = '';
	try {
		const checkConfResult = await checkConfirmationConnection
			.queryObject<{ user_id: string; new_email: string }>(
				`SELECT user_id, new_email FROM PendingEmailConfirmations WHERE confirmation_token = $1`,
				[
					confirmationToken,
				],
			);
		if (checkConfResult.rows.length === 0) {
			checkConfirmationConnection.release();
			return;
		}
		userId = checkConfResult.rows[0].user_id;
		email = checkConfResult.rows[0].new_email;
	} catch (e) {
		throw new Error(
			`Error while creating new pending email confirmation: ${e.stack}`,
		);
	} finally {
		checkConfirmationConnection.release();
	}

	// Update email_confirmed for user
	const updateConfirmationConnection = await sqlConnPool.connect();
	try {
		await updateConfirmationConnection
			.queryObject(
				`UPDATE Users SET email_confirmed = TRUE, email = $1, last_updated_at = $2 WHERE id = $3`,
				[
					email,
					(new Date()).toISOString(),
					userId,
				],
			);
	} catch (e) {
		throw new Error(
			`Error updating new user email confirmation status: ${e.stack}`,
		);
	} finally {
		updateConfirmationConnection.release();
	}

	// delete from emailconfirmations
	const deletePendingConfConnection = await sqlConnPool.connect();
	try {
		await deletePendingConfConnection
			.queryObject(
				`DELETE FROM PendingEmailConfirmations WHERE confirmation_token = $1`,
				[
					confirmationToken,
				],
			);
	} catch (e) {
		throw new Error(
			`Error deleting pending email confirmation: ${e.stack}`,
		);
	} finally {
		deletePendingConfConnection.release();
	}
}

export default function registerAuthHandlers(router: Router) {
	router.get(
		'/signup',
		() => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
			});
			return signupPage(200, headers);
		},
	);

	router.post(
		'/signup',
		async (req, _, { passwordHasher, mailClient, sqlConnPool, log }) => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
			});

			if (
				req.headers.get('content-type') !==
					'application/x-www-form-urlencoded'
			) {
				return signupError(400, 'Invalid encoding provided', headers);
			}
			const formData = await req.formData();
			// This block is needed because we assume each of these
			// values exist below
			if (
				['username', 'email', 'password', 'confirmPassword'].some(
					(expectedFormParam) => !formData.has(expectedFormParam),
				)
			) {
				return signupError(400, 'Missing input', headers);
			}

			const formValues = {
				username: (formData.get('username') as string),
				email: formData.get('email') as string,
				password: formData.get('password') as string,
				confirmPassword: formData.get('confirmPassword') as string,
			};
			if ((formValues.username).length < 1) {
				// @ts-ignore We assert this value exists above
				delete formValues.username;
				return signupError(
					400,
					'Username must be at least once character long',
					headers,
				);
			}

			if (!EMAIL_REGEX.test(formValues.email)) {
				// @ts-ignore We assert this value exists above
				delete formValues.email;
				return signupError(400, 'Invalid email provided', headers);
			}

			let numUsernameRows = 0;
			const usernameDupCheckConnection = await sqlConnPool.connect();
			try {
				const usernameDupCheckResult = await usernameDupCheckConnection
					.queryObject(
						'SELECT username FROM Users WHERE username = $1',
						[
							formValues.username,
						],
					);
				numUsernameRows = usernameDupCheckResult.rows.length;
			} catch (e) {
				log.error(
					`SQL error checking duplicate username: ${e.message}`,
				);
				return signupError(500, 'Unknown error occurred', headers);
			} finally {
				usernameDupCheckConnection.release();
			}
			if (numUsernameRows > 0) {
				// @ts-ignore We assert this value exists above
				delete formValues.username;
				// @ts-ignore We assert this value exists above
				delete formValues.password;
				// @ts-ignore We assert this value exists above
				delete formValues.confirmPassword;
				return signupError(
					500,
					'Username already in use',
					headers,
					formValues,
				);
			}

			let numEmailRows = 0;
			const emailDupCheckConnection = await sqlConnPool.connect();
			try {
				const emailDupCheckResult = await emailDupCheckConnection
					.queryObject(
						'SELECT username FROM Users WHERE email = $1',
						[
							formValues.email,
						],
					);
				numEmailRows = emailDupCheckResult.rows.length;
			} catch (e) {
				log.error(
					`SQL error checking duplicate email: ${e.message}`,
				);
				return signupError(500, 'Unknown error occurred', headers);
			} finally {
				emailDupCheckConnection.release();
			}
			if (numEmailRows > 0) {
				// @ts-ignore We assert this value exists above
				delete formValues.email;
				// @ts-ignore We assert this value exists above
				delete formValues.password;
				// @ts-ignore We assert this value exists above
				delete formValues.confirmPassword;
				return signupError(
					500,
					'Email already in use',
					headers,
					formValues,
				);
			}

			if (formValues.password !== formValues.confirmPassword) {
				// @ts-ignore We assert this value exists above
				delete formValues.password;
				// @ts-ignore We assert this value exists above
				delete formValues.confirmPassword;
				return signupError(
					400,
					'Password and confirm password must match',
					headers,
				);
			}

			const passValidationResults = validatePassword(formValues.password);
			if (!passValidationResults.valid) {
				// @ts-ignore We assert this value exists above
				delete formValues.password;
				// @ts-ignore We assert this value exists above
				delete formValues.confirmPassword;
				return signupError(
					400,
					passValidationResults.invalidReason,
					headers,
					formValues,
				);
			}

			const [hashedPasswordBase64, saltBase64] = passwordHasher.hash(
				formValues.password,
			);

			let userId = null;
			const userCreationConnection = await sqlConnPool.connect();
			try {
				const userCreationResult = await userCreationConnection
					.queryObject<{ id: string }>(
						'INSERT INTO Users (username, email, password, salt) VALUES ($1, $2, $3, $4) RETURNING id',
						[
							formValues.username,
							formValues.email,
							hashedPasswordBase64,
							saltBase64,
						],
					);
				userId = userCreationResult.rows[0].id;
			} catch (e) {
				log.error(`SQL error while creating new user: ${e.message}`);
				return signupError(500, 'Unknown error occurred', headers);
			} finally {
				userCreationConnection.release();
			}

			const reqUrl = new URL(req.url);
			try {
				await askConfirmEmail(
					formValues.email,
					userId,
					reqUrl.origin,
					mailClient,
					sqlConnPool,
				);
			} catch (e) {
				log.error('Error sending confirmation email');
			}

			const loginToken = createLoginToken();
			const sessionCreationConnection = await sqlConnPool.connect();
			try {
				await sessionCreationConnection.queryArray(
					'INSERT INTO Logins (user_id, login_token) VALUES ($1, $2)',
					[
						userId,
						loginToken,
					],
				);
			} catch (e) {
				log.error(`SQL error while creating new login: ${e.message}`);
				// Since the account was created the user can log in normally.
				// If they try signing up from /signup again, a duplicate account error
				// will occur
				headers.set('Location', '/login');
				return signupError(
					302,
					'Account created but error occurred during login. Please log in again',
					headers,
				);
			} finally {
				sessionCreationConnection.release();
			}

			setLoginCookie(headers, loginToken);
			headers.set('Location', POST_LOGIN_ROUTE);

			return signupPage(302, headers);
		},
	);

	router.get(
		'/login',
		() => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
			});
			return loginPage(200, headers);
		},
	);

	router.post(
		'/login',
		async (req, _, { passwordHasher, sqlConnPool, log }) => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
			});

			if (
				req.headers.get('content-type') !==
					'application/x-www-form-urlencoded'
			) {
				return loginError(400, 'Invalid encoding provided', headers);
			}
			const formData = await req.formData();
			// This block is needed because we assume each of these
			// values exist below
			if (
				['usernameOrEmail', 'password'].some((expectedFormParam) =>
					!formData.has(expectedFormParam)
				)
			) {
				return loginError(400, 'Missing input', headers);
			}

			const usernameOrEmail = formData.get('usernameOrEmail') as string;
			const isEmail = EMAIL_REGEX.test(usernameOrEmail);
			const password = formData.get('password') as string;

			let userId = 0;
			let existingPassword = '';
			let existingSalt = '';
			const userCredFetchConnection = await sqlConnPool.connect();
			try {
				const userCredFetchResult = await userCredFetchConnection
					.queryObject<
						{ id: number; password: string; salt: string }
					>(
						`SELECT id, password, salt FROM Users WHERE ${
							isEmail ? 'email' : 'username'
						} = $1`,
						[
							usernameOrEmail,
						],
					);
				if (userCredFetchResult.rows.length !== 1) {
					userCredFetchConnection.release();
					return loginError(400, 'User not found', headers, {
						usernameOrEmail: usernameOrEmail,
					});
				}
				userId = userCredFetchResult.rows[0].id;
				existingPassword = userCredFetchResult.rows[0].password;
				existingSalt = userCredFetchResult.rows[0].salt;
			} catch (e) {
				log.error(
					`SQL error getting login credentials: ${e.message}`,
				);
				return loginError(500, 'Unknown error occurred', headers, {
					usernameOrEmail: usernameOrEmail,
				});
			} finally {
				userCredFetchConnection.release();
			}

			if (
				!passwordHasher.verify(
					password,
					existingSalt,
					existingPassword,
				)
			) {
				return loginError(
					400,
					'Incorrect credentials provided',
					headers,
					{ usernameOrEmail: usernameOrEmail },
				);
			}

			const loginToken = createLoginToken();
			const sessionCreationConnection = await sqlConnPool.connect();
			try {
				await sessionCreationConnection.queryArray(
					'INSERT INTO Logins (user_id, login_token) VALUES ($1, $2)',
					[
						userId,
						loginToken,
					],
				);
			} catch (e) {
				log.error(`SQL error while creating new login: ${e.message}`);
				return loginError(
					500,
					'Error occurred during login. Please log in again',
					headers,
				);
			} finally {
				sessionCreationConnection.release();
			}

			setLoginCookie(headers, loginToken);
			headers.set('Location', POST_LOGIN_ROUTE);
			return loginPage(302, headers);
		},
	);

	router.get(
		'/forgot-password',
		() => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
			});
			return forgotPasswordPage(200, headers);
		},
	);

	router.post(
		'/forgot-password',
		async (req, _, { sqlConnPool, log, mailClient }) => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
			});

			if (
				req.headers.get('content-type') !==
					'application/x-www-form-urlencoded'
			) {
				return forgotPasswordError(
					400,
					'Invalid encoding provided',
					headers,
				);
			}
			const formData = await req.formData();
			// This block is needed because we assume each of these
			// values exist below
			if (
				['usernameOrEmail'].some((expectedFormParam) =>
					!formData.has(expectedFormParam)
				)
			) {
				return forgotPasswordError(400, 'Missing input', headers);
			}

			const usernameOrEmail = formData.get('usernameOrEmail') as string;
			const isEmail = EMAIL_REGEX.test(usernameOrEmail);

			let userEmail = '';
			let userId = '';
			const userEmailFetchConnection = await sqlConnPool.connect();
			try {
				const userEmailFetchResult = await userEmailFetchConnection
					.queryObject<
						{ id: string; email: string }
					>(
						`SELECT id, email FROM Users WHERE ${
							isEmail ? 'email' : 'username'
						} = $1`,
						[
							usernameOrEmail,
						],
					);
				if (userEmailFetchResult.rows.length !== 1) {
					userEmailFetchConnection.release();
					return forgotPasswordPage(
						200,
						headers,
						'Account recovery email sent if account exists',
					);
				}
				userEmail = userEmailFetchResult.rows[0].email;
				userId = userEmailFetchResult.rows[0].id;
			} catch (e) {
				log.error(
					`SQL error getting forgot password credentials: ${e.message}`,
				);
				return forgotPasswordError(
					500,
					'Unknown error occurred',
					headers,
					{
						usernameOrEmail: usernameOrEmail,
					},
				);
			} finally {
				userEmailFetchConnection.release();
			}

			const recoveryToken = createAccountRecoveryLoginToken();
			const accountRecoveryConnection = await sqlConnPool.connect();
			try {
				await accountRecoveryConnection.queryArray(
					'INSERT INTO AccountRecoveries (user_id, recovery_token) VALUES ($1, $2)',
					[
						userId,
						recoveryToken,
					],
				);
			} catch (e) {
				log.error(
					`SQL error while creating new account recovery: ${e.message}`,
				);
				return forgotPasswordError(
					500,
					'An error occurred. Please try again',
					headers,
				);
			} finally {
				accountRecoveryConnection.release();
			}

			const reqUrl = new URL(req.url);
			try {
				await mailClient.send({
					to: userEmail,
					from:
						`Deno Server Account Recovery <noreply@deno-server.com>`,
					subject: 'Change Deno Server Password',
					content: forgotPasswordEmailText(
						recoveryToken,
						reqUrl.origin,
					),
					html: forgotPasswordEmailHtml(recoveryToken, reqUrl.origin),
					priority: 'high',
				});
			} catch (e) {
				throw new Error(
					`Error while sending password change email: ${e.stack}`,
				);
			}

			return forgotPasswordPage(
				200,
				headers,
				'Account recovery email sent if account exists',
			);
		},
	);

	router.get(
		'/change-password/:encodedRecoveryToken',
		async (_, params, { sqlConnPool, log }) => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
			});

			const recoveryToken = decodeURIComponent(
				params['encodedRecoveryToken'],
			);

			const recoveryValidationConnection = await sqlConnPool.connect();
			try {
				const recoveryValidationResult =
					await recoveryValidationConnection
						.queryObject<
							{ id: string }
						>(
							`SELECT user_id FROM AccountRecoveries WHERE recovery_token = $1`,
							[
								recoveryToken,
							],
						);
				if (recoveryValidationResult.rows.length === 0) {
					recoveryValidationConnection.release();
					return changePasswordError(
						404,
						'Invalid recovery. Please try again',
						headers,
					);
				}
			} catch (e) {
				log.error(
					`SQL error fetching account recovery: ${e.message}`,
				);
				return changePasswordError(
					500,
					'Unknown error occurred',
					headers,
				);
			} finally {
				recoveryValidationConnection.release();
			}

			return changePasswordPage(200, headers);
		},
	);

	router.post(
		'/change-password/:encodedRecoveryToken',
		async (req, params, { sqlConnPool, log, passwordHasher }) => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
			});

			const recoveryToken = decodeURIComponent(
				params['encodedRecoveryToken'],
			);

			let userId = '';
			const recoveryValidationConnection = await sqlConnPool.connect();
			try {
				const recoveryValidationResult =
					await recoveryValidationConnection
						.queryObject<
							{ user_id: string }
						>(
							`SELECT user_id FROM AccountRecoveries WHERE recovery_token = $1`,
							[
								recoveryToken,
							],
						);
				if (recoveryValidationResult.rows.length === 0) {
					recoveryValidationConnection.release();
					return changePasswordError(
						404,
						'Invalid recovery. Please try again',
						headers,
					);
				}
				userId = recoveryValidationResult.rows[0].user_id;
			} catch (e) {
				log.error(
					`SQL error fetching account recovery: ${e.message}`,
				);
				return changePasswordError(
					500,
					'Unknown error occurred',
					headers,
				);
			} finally {
				recoveryValidationConnection.release();
			}

			// Get form data
			const formData = await req.formData();

			if (
				['newPassword', 'confirmNewPassword'].some(
					(expectedFormParam) => !formData.has(expectedFormParam),
				)
			) {
				return changePasswordError(400, 'Missing input', headers);
			}
			const newPassword = formData.get('newPassword') as string;
			const confirmNewPassword = formData.get(
				'confirmNewPassword',
			) as string;

			if (newPassword !== confirmNewPassword) {
				return changePasswordError(
					400,
					'Passwords must match',
					headers,
				);
			}

			const passValidationResults = validatePassword(newPassword);
			if (!passValidationResults.valid) {
				return changePasswordError(
					200,
					passValidationResults.invalidReason,
					headers,
				);
			}

			const [hashedPasswordBase64, saltBase64] = passwordHasher.hash(
				newPassword,
			);

			const updatePasswordConnection = await sqlConnPool.connect();
			try {
				await updatePasswordConnection
					.queryObject(
						`UPDATE Users SET password = $1, salt = $2, last_updated_at = $3 WHERE id = $4`,
						[
							hashedPasswordBase64,
							saltBase64,
							(new Date()).toISOString(),
							userId,
						],
					);
			} catch (e) {
				log.error(
					`SQL error updating account password: ${e.message}`,
				);
				return changePasswordError(
					500,
					'Unknown error occurred',
					headers,
				);
			} finally {
				updatePasswordConnection.release();
			}

			const deleteRecoveryConnection = await sqlConnPool.connect();
			try {
				await deleteRecoveryConnection
					.queryObject(
						`DELETE FROM AccountRecoveries WHERE user_id = $1`,
						[
							userId,
						],
					);
			} catch (e) {
				log.error(
					`SQL error deleting account recovery: ${e.message}`,
				);
				return changePasswordError(
					500,
					'Unknown error occurred',
					headers,
				);
			} finally {
				deleteRecoveryConnection.release();
			}

			headers.set('Location', '/login');
			return changePasswordPage(302, headers);
		},
	);

	router.get(
		'/logout',
		async (req, _, { sqlConnPool, log }) => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
				'Location': '/',
			});

			const reqHeaders = req.headers;

			const loginToken = getLoginCookie(reqHeaders);
			const isAuthenticated =
				!!(await userIdFromLoginToken(loginToken, sqlConnPool));
			if (isAuthenticated) {
				const deleteLoginConnection = await sqlConnPool.connect();
				try {
					await deleteLoginConnection
						.queryObject(
							`DELETE FROM Logins WHERE login_token = $1`,
							[
								loginToken,
							],
						);
				} catch (e) {
					log.error(
						`SQL error deleting login: ${e.message}`,
					);
					return loginError(
						500,
						'Unknown error occurred',
						headers,
					);
				} finally {
					deleteLoginConnection.release();
				}
			}
			removeLoginCookie(headers);
			return await new Response('', { headers, status: 302 });
		},
	);

	router.get(
		'/confirm-email/:encodedConfToken',
		async (_, params, { sqlConnPool, log }) => {
			const headers = new Headers({
				'Content-Type': htmlContentType(),
				'Location': '/',
			});

			const confToken = decodeURIComponent(
				params['encodedConfToken'],
			);

			try {
				await confirmEmail(confToken, sqlConnPool);
			} catch (e) {
				log.error(`Error confirming user email ${e.stack}`)
				return await new Response('', { headers, status: 500 });
			}

			headers.set('Location', POST_LOGIN_ROUTE);
			return await new Response('', { headers, status: 302 });
		},
	);
}

// TODO: Confirm account after signup (send email, update users table, etc)
//       /send-email-confirmation -> email -> /confirm-email
//       /change-email -> /send-email-confirmation -> email -> /confirm-email
// TODO: Dashboard
