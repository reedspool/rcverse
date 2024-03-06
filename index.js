import { Lucia, verifyRequestOrigin, TimeSpan } from "lucia";
import { OAuth2Client, generateState } from "oslo/oauth2";
import { OAuth2RequestError } from "oslo/oauth2";
import { Cookie } from "oslo/cookie";
import express from "express";
import { NeonHTTPAdapter } from "@lucia-auth/adapter-postgresql";
import { neon } from "@neondatabase/serverless";

const app = express();
const port = process.env.PORT || 3001;

const baseDomain =
	process.env.NODE_ENV === "production"
		? `${process.env.FLY_APP_NAME}.fly.dev`
		: `localhost:${port}`;
const baseURL =
	process.env.NODE_ENV === "production"
		? `https://${baseDomain}`
		: `http://${baseDomain}`;

const authorizeEndpoint = "https://recurse.com/oauth/authorize";
// TODO P.B. found this required `www` though authorize doesn't.
const tokenEndpoint = "https://www.recurse.com/oauth/token";

// DO NOT COMMIT
// From https://www.recurse.com/settings/apps
const clientId = process.env.OAUTH_CLIENT_ID;
const clientSecret = process.env.OAUTH_CLIENT_SECRET;
const postgresConnection = process.env.POSTGRES_CONNECTION;

const client = new OAuth2Client(clientId, authorizeEndpoint, tokenEndpoint, {
	redirectURI: `${baseURL}/myOauth2RedirectUri`,
});

const sql = neon(postgresConnection);

const adapter = new NeonHTTPAdapter(sql, {
	user: "auth_user",
	session: "user_session",
});

const lucia = new Lucia(adapter, {
	sessionExpiresIn: new TimeSpan(2, "w"),
	sessionCookie: {
		name: "lucia-auth-example",
		attributes: {
			// set to `true` when using HTTPS
			secure: process.env.NODE_ENV === "production",
			sameSite: process.env.NODE_ENV === "production" ? "lax" : "lax",
			// https://stackoverflow.com/a/1188145
			domain: process.env.NODE_ENV === "production" ? baseDomain : "",
		},
	},
	getSessionAttributes: (attributes) => {
		return { refresh_token: attributes.refresh_token };
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
	console.log("All sessions", adapter.sessions);
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

			await sql("update user_session set refresh_token = $1 where id = $2", [
				refresh_token,
				res.locals.session?.id,
			]);

			authenticated = true;
		} catch (e) {
			if (e instanceof OAuth2RequestError) {
				// see https://www.rfc-editor.org/rfc/rfc6749#section-5.2
				const { request, message, description } = e;

				if (message === "invalid_grant") {
					console.log("The following error is a totally normal invalid grant");
				}
			}

			console.error("Invalidating old session due to error", e);
			await lucia.invalidateSession(res.locals.session?.id);
			res.appendHeader(
				"Set-Cookie",
				lucia.createBlankSessionCookie().serialize(),
			);
		}
	}
	const body = `
	<h1>Recurse OAuth Example with Oslo</h1>
	<p>${authenticated
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

		// TODO Why do we even have a user table for this app? We want to use Recurse API's
		//      idea of a user. But we can't get that user ID until after a successful login
		//      so instead every time we create a new session we're just going to create a new
		//      user? There's no cleanup even. We should also be deleting every user when a
		//      session expires, but we're not yet. But even if we attempted to delete every
		//      user with no session, then we'd still probably have leaks. So instead we want a
		//      cleanup cron job
		const userId = `${Date.now()}.${Math.floor(Math.random() * 10000)}`;
		await sql(`insert into auth_user values ($1)`, [userId]);
		const session = await lucia.createSession(userId, {
			// Note: This has to be returned in "getSessionAttributes" in new Lucia(...)
			// TODO: We can set these things once, but can we ever set them again?
			refresh_token,
		});

		res.appendHeader(
			"Set-Cookie",
			lucia.createSessionCookie(session.id).serialize(),
		);

		// Also update the local copy of the session since the middleware might not run?
		// TODO Try removing this and see if it still works
		res.locals.session = session;
		res.redirect("/");
		return;
	} catch (e) {
		if (e instanceof OAuth2RequestError) {
			// see https://www.rfc-editor.org/rfc/rfc6749#section-5.2
			const { request, message, description } = e;
		}
		// unknown error
		console.error("Invalidating new session due to error", e);
		await lucia.invalidateSession(res.locals.session?.id);
		res.appendHeader(
			"Set-Cookie",
			lucia.createBlankSessionCookie().serialize(),
		);
		res.redirect("/");
	}
});

//
// Final 404/5XX handlers
//
app.use(function(err, req, res, next) {
	console.error("5XX", err, req, next);
	res.status(err?.status || 500);

	res.send("5XX");
});

app.use(function(req, res) {
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
