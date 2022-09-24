import { getCookies, setCookie } from 'std/http/cookie.ts';

function getLoginCookie(headers: Headers): string {
	return getCookies(headers)['login_token'];
}

function setLoginCookie(headers: Headers, value: string) {
	setCookie(headers, {
		name: 'login_token',
		value: value,
		secure: true,
		httpOnly: true,
	});
}

function removeLoginCookie(headers: Headers) {
	setCookie(headers, {
		name: 'login_token',
		value: '',
		secure: true,
		httpOnly: true,
		maxAge: 0,
	});
}

export { getLoginCookie, removeLoginCookie, setLoginCookie };
