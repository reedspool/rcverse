import { Lucia, verifyRequestOrigin, TimeSpan } from "lucia";
import { OAuth2Client, generateState } from "oslo/oauth2";
import { OAuth2RequestError } from "oslo/oauth2";
import { Cookie } from "oslo/cookie";
import express from "express";

const app = express();
const port = process.env.PORT || 3001;
const authorizeEndpoint = "https://recurse.com/oauth/authorize";
// TODO P.B. found this required `www` though authorize doesn't.
const tokenEndpoint = "https://www.recurse.com/oauth/token";

// DO NOT COMMIT
// From https://www.recurse.com/settings/apps
const clientId = process.env.OAUTH_CLIENT_ID;
const clientSecret = process.env.OAUTH_CLIENT_SECRET;

const client = new OAuth2Client(clientId, authorizeEndpoint, tokenEndpoint, {
	redirectURI: `http://localhost:${port}/myOauth2RedirectUri`,
});

// Ad-hoc in-memory adapter (no database) for Lucia

function Adapter() {
	this.sessions = {};
}

Adapter.prototype.deleteExpiredSessions = async function () {
	const now = Date.now();
	Object.entries(this.sessions).forEach(([id, session]) => {
		if (session.expiresAtMillis > now) {
			this.deleteSession(id);
		}
	});
};

Adapter.prototype.deleteSession = async function (sessionId) {
	this.sessions[sessionId] = null;
};
Adapter.prototype.deleteUserSessions = async function (userId) {
	this.getUserSessions(userId).forEach((session) => {
		this.deleteSession(session.id);
	});
};

Adapter.prototype.getSessionAndUser = async function (sessionId) {
	const session = this.sessions[sessionId];
	return [session, { userId: session?.userId }];
};
Adapter.prototype.getUserSessions = async function (userId) {
	return Object.values(this.sessions).filter(
		(session) => session.userId === userId,
	);
};

Adapter.prototype.setSession = async function (session) {
	this.sessions[session.id] = session;
};
Adapter.prototype.updateSessionExpiration = async function (
	sessionId,
	expiresAtDate,
) {
	this.sessions[sessionId].expiresAtMillis = expiresAtDate.getTime();
};

const lucia = new Lucia(new Adapter(), {
	sessionExpiresIn: new TimeSpan(2, "w"),
	sessionCookie: {
		name: "lucia-auth-example",
		attributes: {
			// set to `true` when using HTTPS
			secure: process.env.NODE_ENV === "production",
			sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
			// TODO real domain required
			// https://stackoverflow.com/a/1188145
			domain: process.env.NODE_ENV === "production" ? "example.com" : "",
		},
	},
});

let nextUserId = 0;

const page = ({ body, title }) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="shortcut icon" type="image/png" href="favicon.png" />
  </head>
  <body>
    ${body}
  </body>
</html>
`;

app.use((req, res, next) => {
	if (req.method === "GET") {
		return next();
	}
	const originHeader = req.headers.origin ?? null;
	// NOTE: You may need to use `X-Forwarded-Host` instead
	const hostHeader = req.headers.host ?? null;
	if (
		!originHeader ||
		!hostHeader ||
		!verifyRequestOrigin(originHeader, [hostHeader])
	) {
		return res.status(403).end();
	}
});

app.use(async (req, res, next) => {
	const sessionId = lucia.readSessionCookie(req.headers.cookie ?? "");
	console.log("req.headers.cookie", req.headers.cookie);
	if (!sessionId) {
		res.locals.user = null;
		res.locals.session = null;
		return next();
	}

	const { session, user } = await lucia.validateSession(sessionId);
	if (session && session.fresh) {
		res.appendHeader(
			"Set-Cookie",
			lucia.createSessionCookie(session.id).serialize(),
		);
	}
	if (!session) {
		res.appendHeader(
			"Set-Cookie",
			lucia.createBlankSessionCookie().serialize(),
		);
	}
	res.locals.user = user;
	res.locals.session = session;
	return next();
});

app.get("/", async (req, res) => {
	console.log("Session", res.locals.session);
	let authenticated = false;
	if (res.locals.session?.refresh_token) {
		try {
			// Again the oslo docs are wrong, or at least inspecific.
			// Source don't lie, though! https://github.com/pilcrowOnPaper/oslo/blob/main/src/oauth2/index.ts#L76
			const { access_token, refresh_token } = await client.refreshAccessToken(
				res.locals.session?.refresh_token,
				{
					credentials: clientSecret,
					authenticateWith: "request_body",
				},
			);

			res.locals.session.refresh_token = refresh_token;

			authenticated = true;
		} catch (e) {
			if (e instanceof OAuth2RequestError) {
				// see https://www.rfc-editor.org/rfc/rfc6749#section-5.2
				const { request, message, description } = e;

				throw e;
			}
			// unknown error
			throw e;
		}
	}
	const body = `
	<h1>Recurse OAuth Example with Oslo</h1>
	<p>${
		authenticated
			? 'You\'re logged in already - <a href="/logout">logout</a>'
			: '<a href="/getAuthorizationUrl">Authorize</a>'
	}
    </p>
	`;
	res.send(
		page({
			title: "Homepage",
			body,
		}),
	);
});

app.get("/logout", async (req, res) => {
	lucia.invalidateSession(res.locals.session?.id);

	res.redirect("/");
});

app.get("/getAuthorizationUrl", async (req, res) => {
	const state = generateState();
	res.appendHeader(
		"Set-Cookie",
		new Cookie("lucia-example-oauth-state", state).serialize(),
	);

	const url = await client.createAuthorizationURL({
		state,
		scope: ["user:email"],
	});
	res.redirect(url);
});

app.get("/myOauth2RedirectUri", async (req, res) => {
	const { state, code } = req.query;

	const cookieState = req.headers.cookie.match(
		/lucia-example-oauth-state=(.*)&?/,
	)?.[1];
	console.log("cookie", req.headers.cookie, cookieState);

	if (!cookieState || !state || cookieState !== state) {
		// TODO: Don't crash the server!
		console.error("State didn't match\n", cookieState, "\n", state);
		throw new Error("State didn't match");
	}

	try {
		// NOTE: This is different from the Oslo OAuth2 docs, they use camel case
		const { access_token, refresh_token } =
			await client.validateAuthorizationCode(code, {
				credentials: clientSecret,
				authenticateWith: "request_body",
			});

		// This doesn't work! Don't store random stuff on sessions I guess!
		const session = await lucia.createSession(nextUserId++, {
			someArbitraryInfo: true,
		});

		// TODO: This doesn't work! Don't store random stuff on sessions, I guess!
		// Or see "Define Session Attributes" here https://lucia-auth.com/basics/sessions
		session.refresh_token = refresh_token;

		console.log(
			"New cookie",
			lucia.createSessionCookie(session.id).serialize(),
		);
		res.appendHeader(
			"Set-Cookie",
			lucia.createSessionCookie(session.id).serialize(),
		);

		res.redirect("/");
		return;
	} catch (e) {
		if (e instanceof OAuth2RequestError) {
			// see https://www.rfc-editor.org/rfc/rfc6749#section-5.2
			const { request, message, description } = e;

			throw e;
		}
		// unknown error
		throw e;
	}
});

//
// Final 404/5XX handlers
//
app.use(function (err, req, res, next) {
	console.error("5XX", err, req, next);
	res.status(err?.status || 500);

	res.send("5XX");
});

app.use(function (req, res) {
	res.status(404);
	res.send("4XX");
});
const listener = app.listen(port, () => {
	console.log(`Server is available at http://localhost:${port}`);
});

// So I can kill from local terminal with Ctrl-c
// From https://github.com/strongloop/node-foreman/issues/118#issuecomment-475902308
process.on("SIGINT", () => {
	listener.close(() => {
		process.exit(0);
	});
});
// Typescript recommendation from https://lucia-auth.com/getting-started/
// declare module "lucia" {
// 	interface Register {
// 		Lucia: typeof lucia;
// 	}
// }
