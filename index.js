import { OAuth2Client, generateState } from "oslo/oauth2";
import { OAuth2RequestError } from "oslo/oauth2";
import express from "express";

const app = express();
const port = process.env.PORT || 3001;

const redirectURL =
	process.env.NODE_ENV === "production"
		? process.env.REDIRECT_URL
		: "http://localhost";

const authorizeEndpoint = "https://recurse.com/oauth/authorize";
// TODO P.B. found this required `www` though authorize doesn't.
const tokenEndpoint = "https://www.recurse.com/oauth/token";

// DO NOT COMMIT
// From https://www.recurse.com/settings/apps
const clientId = process.env.OAUTH_CLIENT_ID;
const clientSecret = process.env.OAUTH_CLIENT_SECRET;

console.log(clientId, clientSecret);

const client = new OAuth2Client(clientId, authorizeEndpoint, tokenEndpoint, {
	redirectURI: `${redirectURL}:${port}/myOauth2RedirectUri`,
});

// TODO: Use Lucia to put this in user's session
const newUserSession = () => ({
	state: null,
	refresh_token: null,
	access_token: null,
});

let userSession = newUserSession();

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

app.get("/", async (req, res) => {
	let authenticated = false;
	if (userSession.refresh_token) {
		try {
			// Again the oslo docs are wrong, or at least inspecific.
			// Source don't lie, though! https://github.com/pilcrowOnPaper/oslo/blob/main/src/oauth2/index.ts#L76
			const { access_token, refresh_token } = await client.refreshAccessToken(
				userSession.refresh_token,
				{
					credentials: clientSecret,
					authenticateWith: "request_body",
				},
			);

			userSession.access_token = access_token;
			userSession.refresh_token = refresh_token;

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
	userSession = newUserSession();

	res.redirect("/");
});

app.get("/getAuthorizationUrl", async (req, res) => {
	userSession.state = generateState();
	const url = await client.createAuthorizationURL({
		state: userSession.state,
		scope: ["user:email"],
	});
	res.redirect(url);
});

app.get("/myOauth2RedirectUri", async (req, res) => {
	const { state, code } = req.query;

	if (!userSession.state || !state || userSession.state !== state) {
		// TODO: Don't crash the server!
		throw new Error("State didn't match");
	}

	try {
		// NOTE: This is different from the Oslo OAuth2 docs, they use camel case
		const { access_token, refresh_token } =
			await client.validateAuthorizationCode(code, {
				credentials: clientSecret,
				authenticateWith: "request_body",
			});

		userSession.access_token = access_token;
		userSession.refresh_token = refresh_token;

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
