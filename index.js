import { Lucia, verifyRequestOrigin, TimeSpan } from "lucia";
import { OAuth2Client, generateState } from "oslo/oauth2";
import { OAuth2RequestError } from "oslo/oauth2";
import { Cookie } from "oslo/cookie";
import express from "express";
import pg from "pg";
import { NodePostgresAdapter } from "@lucia-auth/adapter-postgresql";
import { neon } from "@neondatabase/serverless";
import { connect } from "./actioncable.js";
import EventEmitter from "node:events";

const emitter = new EventEmitter();

const app = express();
app.use(express.urlencoded({ extended: true }));

const port = process.env.PORT || 3001;

const zoomRooms = [
	{
		href: "https://recurse.com/zoom/aegis",
		name: "Aegis",
	},
	{
		href: "https://recurse.com/zoom/arca",
		name: "Arca",
	},
	{
		href: "https://recurse.com/zoom/edos",
		name: "Edos",
	},
	{
		href: "https://recurse.com/zoom/genera",
		name: "Genera",
	},
	{
		href: "https://recurse.com/zoom/midori",
		name: "Midori",
	},
	{
		href: "https://recurse.com/zoom/verve",
		name: "Verve",
	},
	{
		href: "https://recurse.com/zoom/couches",
		name: "Couches",
	},
	{
		href: "https://recurse.com/zoom/kitchen",
		name: "Kitchen",
	},
	{
		href: "https://recurse.com/zoom/pairing_station_1",
		name: "Pairing Station 1",
	},
	{
		href: "https://recurse.com/zoom/pairing_station_2",
		name: "Pairing Station 2",
	},
	{
		href: "https://recurse.com/zoom/pairing_station_3",
		name: "Pairing Station 3",
	},
	{
		href: "https://recurse.com/zoom/pairing_station_4",
		name: "Pairing Station 4",
	},
	{
		href: "https://recurse.com/zoom/pairing_station_5",
		name: "Pairing Station 5",
	},
	{
		href: "https://recurse.rctogether.com/zoom_meetings/35980/join",
		name: "Pairing Station 6",
	},
	{
		href: "https://recurse.rctogether.com/zoom_meetings/35983/join",
		name: "Pairing Station 7",
	},
	{
		href: "https://recurse.com/zoom/pomodoro_room",
		name: "Pomodoro room",
	},
	{
		href: "https://recurse.com/zoom/presentation_space",
		name: "Presentation space",
	},
	{
		href: "https://recurse.com/zoom/faculty_area",
		name: "Faculty Area",
	},
	{
		href: "https://recurse.com/zoom/faculty_lounge",
		name: "Faculty Lounge",
	},
];

const zoomRoomNames = zoomRooms.map(({ name }) => name);
const zoomRoomsByName = {};
zoomRooms.forEach(({ name, ...rest }) => {
	zoomRoomsByName[name] = { name, ...rest };
});

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

// From https://www.recurse.com/settings/apps
const clientId = process.env.OAUTH_CLIENT_ID;
const clientSecret = process.env.OAUTH_CLIENT_SECRET;
const postgresConnection = process.env.POSTGRES_CONNECTION;
const actionCableAppId = process.env.ACTION_CABLE_APP_ID;
const actionCableAppSecret = process.env.ACTION_CABLE_APP_SECRET;

const roomNameToParticipantPersonNames = {};
const roomMessages = {};
const participantPersonNamesToEntity = {};

// TODO
//  The action cable API sometimes updates with a zoom room participant count,
//  and we observed once that virtual RC showed one person who was definitely in
//  a zoom room did not appear in virtual RC (or this app) as in that zoom room.
//  Question: Does that participant count also reflect that person NOT in the room?
//     I'm guessing it will not show the person in the room, because we also observed
//     the little bubble in Virutal RC didn't show that person as in the room
connect(actionCableAppId, actionCableAppSecret, (entity) => {
	const { zoom_room_name, person_name, image_path } = entity;
	if (zoom_room_name !== null && !zoomRoomNames.includes(zoom_room_name)) {
		// TODO don't kill the server but be loud about this confusion in the future
		console.error(`Surprising zoom room name '${zoom_room_name}'`);
		return;
	}

	// zoom_room is a string means we're adding a person to that room
	if (zoom_room_name) {
		if (
			participantPersonNamesToEntity[person_name]?.zoom_room_name ===
			zoom_room_name
		) {
			// Ignore, we already have this person in the right zoom room
			return;
		}
		if (!roomNameToParticipantPersonNames[zoom_room_name]) {
			roomNameToParticipantPersonNames[zoom_room_name] = [];
		}

		roomNameToParticipantPersonNames[zoom_room_name].push(person_name);
		participantPersonNamesToEntity[person_name] = {
			zoom_room_name,
			image_path,
		};
		console.log(`${person_name} enterred ${zoom_room_name}`);
		emitter.emit("room-change", person_name, "enterred", zoom_room_name);
	} else {
		if (!participantPersonNamesToEntity[person_name]?.zoom_room_name) {
			// Ignore, nothing to update, they're still not in a zoom room
			return;
		}
		const { zoom_room_name: previous } =
			participantPersonNamesToEntity[person_name];

		participantPersonNamesToEntity[person_name] = {
			zoom_room_name,
			image_path,
		};
		roomNameToParticipantPersonNames[previous] =
			roomNameToParticipantPersonNames[previous].filter(
				(name) => name !== person_name,
			);

		console.log(`${person_name} departed ${previous}`);
		emitter.emit("room-change", person_name, "departed", previous);
	}
});

const client = new OAuth2Client(clientId, authorizeEndpoint, tokenEndpoint, {
	redirectURI: `${baseURL}/myOauth2RedirectUri`,
});

// const sql = (postgresConnection);
const sql = new pg.Pool({
	host: 'localhost',
	user: 'pb',
	database: 'rcverse',
});

const adapter = new NodePostgresAdapter(sql, {
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

const page = ({ body, title }) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="shortcut icon" type="image/png" href="favicon.png" />
	<style type="text/css" media="screen">
  	  .face-marker {
        width: 2em;
        aspect-ratio: 1;
        border-radius: 99999px;
        border: 4px solid forestgreen;
      }

      .empty-room-memo {
        font-size: 0.8em;
        font-style: italic;
      }

      .room-list {
        display: flex;
        flex-direction: column;
        gap: 0.4em;
      }

      .room:hover {
        background-color: rgba(0,0,0,0.1);
      }

      .room__participants {
        padding-top: 0.6em;
      }

      .room {
        padding: 0.4em;
      }
	</style>
  </head>
  <body>
    ${body}

	<script src="https://unpkg.com/htmx.org@1.9.10" integrity="sha384-D1Kt99CQMDuVetoL1lrYwg5t+9QdHe7NLX/SoJYkXDFfX37iInKRy5xLSi8nO7UC" crossorigin="anonymous"></script>
	<script src="https://unpkg.com/htmx.org/dist/ext/sse.js"></script>

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
	return next();
});

app.use(async (req, res, next) => {
	const sessionId = lucia.readSessionCookie(req.headers.cookie ?? "");
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

const Room = ({ href, name }) => `
		<div class="room ${roomNameToParticipantPersonNames[name]?.length > 0
		? "room--non-empty"
		: ""
	}">
          <dt>
            ${name} - <a
                  href="${href}"
				  target="_blank"
                  rel="noopener noreferrer"
                  >Join</a
                >
          </dt>
		 <dd>
			<form method="POST" action="/note">
			<input type="hidden" name="room" value="${name}">
			<label>notes<textarea name="notes" class="room__notes">${roomMessages[name] ?? ''}</textarea></label><button type="submit">Update</button></form>
	<div class="room__participants">
	 ${roomNameToParticipantPersonNames[name]?.length > 0 ? roomNameToParticipantPersonNames[
		name
	]
		.map(
			(name) =>
				`
									<img
										class="face-marker"
										src=${participantPersonNamesToEntity[name].image_path}
										title="${name}">
								`,
		)
		.join("&nbsp;") : ''}</div></dd>
	
		</div>
    `;



app.post("/note", function(req, res) {
	const { room, notes } = req.body;
	roomMessages[room] = notes ?? '';

	// res.send({});
	res.redirect("/");
});

// TODO I don't know where to write this
// Client could lose SSE connection for a long time, like if they close their laptop
// HTMX is going to try to reconnect immediately, but it doesn't do anything
// to refresh the whole page to get a real understanding of the current world,
//  instead it will just start updating from the next stream evenst, and it could
// be completley wrong about where everyone is currenlty

app.get("/", async (req, res) => {
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

			await sql.query("update user_session set refresh_token = $1 where id = $2", [
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
	let body = `<h1>RCVerse</h1>`;
	body += `<h2>Whatever you make it</h2>`;

	if (authenticated) {
		body += `

	<dl class="room-list" hx-ext="sse" sse-connect="/sse">
      ${zoomRooms
				.map(
					({ name, ...rest }) =>
						`<div sse-swap="room-update-${name}">${Room({
							name,
							...rest,
						})}</div>`,
				)
				.join("")}

      <dt><a href="https://recurse.rctogether.com">Virtual RC</a></dt>
	</dl>

	<p>You\'re logged in! - <a href="/logout">logout</a></p>
		`;
	} else {
		body += `
			<p><a href="/getAuthorizationUrl">Login</a></p>
		`;
	}

	res.send(
		// TODO: Cache an authenticated version and an unauthenticated version
		//       and only invalidate that cache when a zoom room update occurs
		// ACTUALLY we can cache each room too! And only invalidate them when a room change occurs
		page({
			title: "RCVerse",
			body,
		}),
	);
});

app.get("/sse", async function(req, res) {
	console.log("Got /sse");
	res.set({
		"Cache-Control": "no-cache",
		"Content-Type": "text/event-stream",
		Connection: "keep-alive",
	});
	res.flushHeaders();

	// Tell the client to retry every 10 seconds if connectivity is lost
	res.write("retry: 10000\n\n");

	const listener = (person_name, action, zoom_room_name) => {
		console.log("Sending ", person_name, action, zoom_room_name);
		res.write(`event:room-update-${zoom_room_name}\n`);
		res.write(
			`data: ${Room(zoomRoomsByName[zoom_room_name]).replaceAll("\n", "")}\n\n`,
		);
	};
	// TODO: For some reason this code stops the server from exiting clearly on Control-C (Signal Interrupt)
	//       Maybe we can listen for the event of SIG INT and manually call res.end on every res that still has an event emitter?

	emitter.on("room-change", listener);
	// If client closes connection, stop sending events
	res.on("close", () => {
		emitter.off("room-change", listener);
		res.end();
	});
	emitter.on("kill-all", () => { res.end() });
});

app.get("/logout", async (req, res) => {
	lucia.invalidateSession(res.locals.session?.id);

	res.redirect("/");
});

app.get("/getAuthorizationUrl", async (req, res) => {
	const state = generateState();
	res.appendHeader(
		"Set-Cookie",
		new Cookie("rc-verse-login-oauth-state", state).serialize(),
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
		/rc-verse-login-oauth-state=(.*)&?/,
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
		await sql.query(`insert into auth_user values ($1)`, [userId]);
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
	res.send("404");
});
const listener = app.listen(port, () => {
	console.log(`Server is available at http://localhost:${port}`);
});

// So I can kill from local terminal with Ctrl-c
// From https://github.com/strongloop/node-foreman/issues/118#issuecomment-475902308
process.on("SIGINT", () => {
	listener.close(() => {
		emitter.emit("kill-all");
		// TODO didn't test the need for setTimeout
		setTimeout(() => {
			process.exit(0);
		}, 0)
	});
});
// Typescript recommendation from https://lucia-auth.com/getting-started/
// declare module "lucia" {
// 	interface Register {
// 		Lucia: typeof lucia;
// 	}
// }
