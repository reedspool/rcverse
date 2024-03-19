/**
 * Welcome to RCVerse's JavaScript server!
 *
 * Code comments are sparse, but you're welcome to add them as you learn about
 * the system and make a PR!
 */
import { Lucia, verifyRequestOrigin, TimeSpan } from "lucia";
import { OAuth2Client, generateState } from "oslo/oauth2";
import { OAuth2RequestError } from "oslo/oauth2";
import { Cookie, parseCookies } from "oslo/cookie";
import express from "express";
import pg from "pg";
import { NodePostgresAdapter } from "@lucia-auth/adapter-postgresql";
import { connect } from "./actioncable.js";
import EventEmitter from "node:events";
import { Page, RootBody, Room, EditNoteForm } from "./html.js";
import expressWebsockets from "express-ws";

import fs from "node:fs";
const emitter = new EventEmitter();
const CERT_DIR = `./cert`;

const app = express();
const port = process.env.PORT || 3001;

expressWebsockets(app);

const zoomRooms = [
	{
		href: "https://recurse.com/zoom/aegis",
		roomName: "Aegis",
	},
	{
		href: "https://recurse.com/zoom/arca",
		roomName: "Arca",
	},
	{
		href: "https://recurse.com/zoom/edos",
		roomName: "Edos",
	},
	{
		href: "https://recurse.com/zoom/genera",
		roomName: "Genera",
	},
	{
		href: "https://recurse.com/zoom/midori",
		roomName: "Midori",
	},
	{
		href: "https://recurse.com/zoom/verve",
		roomName: "Verve",
	},
	{
		href: "https://recurse.com/zoom/couches",
		roomName: "Couches",
	},
	{
		href: "https://recurse.com/zoom/kitchen",
		roomName: "Kitchen",
	},
	{
		href: "https://recurse.com/zoom/pairing_station_1",
		roomName: "Pairing Station 1",
	},
	{
		href: "https://recurse.com/zoom/pairing_station_2",
		roomName: "Pairing Station 2",
	},
	{
		href: "https://recurse.com/zoom/pairing_station_3",
		roomName: "Pairing Station 3",
	},
	{
		href: "https://recurse.com/zoom/pairing_station_4",
		roomName: "Pairing Station 4",
	},
	{
		href: "https://recurse.com/zoom/pairing_station_5",
		roomName: "Pairing Station 5",
	},
	{
		href: "https://recurse.rctogether.com/zoom_meetings/35980/join",
		roomName: "Pairing Station 6",
	},
	{
		href: "https://recurse.rctogether.com/zoom_meetings/35983/join",
		roomName: "Pairing Station 7",
	},
	{
		href: "https://recurse.com/zoom/pomodoro_room",
		roomName: "Pomodoro Room",
	},
	{
		href: "https://recurse.com/zoom/presentation_space",
		roomName: "Presentation Space",
	},
	{
		href: "https://recurse.com/zoom/faculty_area",
		roomName: "Faculty Area",
	},
	{
		href: "https://recurse.com/zoom/faculty_lounge",
		roomName: "Faculty Lounge",
	},
];

const zoomRoomNames = zoomRooms.map(({ roomName }) => roomName);
const zoomRoomsByName = {};
zoomRooms.forEach(({ roomName, ...rest }) => {
	zoomRoomsByName[roomName] = { roomName, ...rest };
});

// NOTE: To test on the original host instead of the `recurse.com` proxy,
//       change the production base domain to the domain of the host.
//       You'll also need to change the OAuth Client ID and Client Secret to
//       credentials which have the original host as the redirect URL.
const baseDomain =
	process.env.NODE_ENV === "production"
		? `rcverse.recurse.com`
		: `localhost:${port}`;
const baseURL =
	process.env.NODE_ENV === "production"
		? `https://${baseDomain}`
		: `http://${baseDomain}`;
const sslConfig =
	process.env.NODE_ENV === "production"
		? {}
		: {
				key: fs.readFileSync(`${CERT_DIR}/server.key`),
				cert: fs.readFileSync(`${CERT_DIR}/server.cert`),
		  };

const authorizeEndpoint = "https://recurse.com/oauth/authorize";
// TODO P.B. found this required `www` though authorize doesn't.
const tokenEndpoint = "https://www.recurse.com/oauth/token";

// DO NOT COMMIT
// From https://www.recurse.com/settings/apps
const clientId = process.env.OAUTH_CLIENT_ID;
const clientSecret = process.env.OAUTH_CLIENT_SECRET;
const postgresConnection = process.env.POSTGRES_CONNECTION;
const actionCableAppId = process.env.ACTION_CABLE_APP_ID;
const actionCableAppSecret = process.env.ACTION_CABLE_APP_SECRET;

const roomNameToParticipantNames = {};
const participantNameToEntity = {};

// TODO
//  The action cable API sometimes updates with a zoom room participant count,
//  and we observed once that virtual RC showed one person who was definitely in
//  a zoom room did not appear in virtual RC (or this app) as in that zoom room.
//  Question: Does that participant count also reflect that person NOT in the room?
//     I'm guessing it will not show the person in the room, because we also observed
//     the little bubble in Virutal RC didn't show that person as in the room
connect(actionCableAppId, actionCableAppSecret, (entity) => {
	const { roomName, participantName, faceMarkerImagePath } = entity;

	if (roomName !== null && !zoomRoomNames.includes(roomName)) {
		// TODO don't kill the server but be loud about this confusion in the future
		console.error(`Surprising zoom room name '${roomName}'`);
		return;
	}

	// zoom_room is a string means we're adding a person to that room
	if (roomName) {
		if (participantNameToEntity[participantName]?.roomName === roomName) {
			// Ignore, we already have this person in the right zoom room
			return;
		}
		if (!roomNameToParticipantNames[roomName]) {
			roomNameToParticipantNames[roomName] = [];
		}

		roomNameToParticipantNames[roomName].push(participantName);
		participantNameToEntity[participantName] = {
			roomName,
			faceMarkerImagePath,
		};
		console.log(`${participantName} enterred ${roomName}`);
		emitter.emit("room-change", participantName, "enterred", roomName);
	} else {
		if (!participantNameToEntity[participantName]?.roomName) {
			// Ignore, nothing to update, they're still not in a zoom room
			return;
		}
		const { roomName: previous } = participantNameToEntity[participantName];

		participantNameToEntity[participantName] = {
			roomName,
			faceMarkerImagePath,
		};
		roomNameToParticipantNames[previous] = roomNameToParticipantNames[
			previous
		].filter((name) => name !== participantName);

		console.log(`${participantName} departed ${previous}`);
		emitter.emit("room-change", participantName, "departed", previous);
	}
});

const client = new OAuth2Client(clientId, authorizeEndpoint, tokenEndpoint, {
	redirectURI: `${baseURL}/myOauth2RedirectUri`,
});

const sql = new pg.Pool({
	connectionString: postgresConnection,
});

const adapter = new NodePostgresAdapter(sql, {
	user: "auth_user",
	session: "user_session",
});

const lucia = new Lucia(adapter, {
	sessionExpiresIn: new TimeSpan(2, "w"),
	sessionCookie: {
		name: "rcverse-session",
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
app.use(express.urlencoded({ extended: true }));
const corsMiddleware = (req, res, next) => {
	if (req.method === "GET") {
		return next();
	}
	const originHeader = req.headers.origin ?? null;
	// NOTE: You may need to use `X-Forwarded-Host` instead
	const hostHeader = req.headers.host ?? null;
	if (
		!originHeader ||
		!hostHeader ||
		// TODO: Adding the `baseDomain` into this list, but is that secure?
		//       Without this, error arose when we switched from fly.dev to
		//       recurse.com - likely because the Recurse.com proxy is rewriting
		//       the hostHeader to fly.dev.
		//       I wish it added a header like `X-Forwarded-Host` as it did that,
		//       as suggested by the NOTE from the Lucia docs I copy&pasted above
		!verifyRequestOrigin(originHeader, [hostHeader, baseDomain])
	) {
		return res.status(403).end();
	}

	return next();
};
app.use(corsMiddleware);

const getSessionFromCookieMiddleware = async (req, res, next) => {
	const sessionId = lucia.readSessionCookie(req.headers.cookie ?? "");
	req.locals = {};
	if (!sessionId) {
		req.locals.user = null;
		req.locals.session = null;
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
	req.locals.user = user;
	req.locals.session = session;
	return next();
};
app.use(getSessionFromCookieMiddleware);

const isSessionAuthenticatedMiddleware = async (req, res, next) => {
	if (!req.locals.session) return next();

	// NOTE: If you're confused about why you're never logged in
	//       It's probably this line and there's probably an error above.
	req.locals.authenticated = false;
	if (req.locals.session?.refresh_token) {
		try {
			// Again the oslo docs are wrong, or at least inspecific.
			// Source don't lie, though! https://github.com/pilcrowOnPaper/oslo/blob/main/src/oauth2/index.ts#L76
			const { access_token, refresh_token } = await client.refreshAccessToken(
				req.locals.session?.refresh_token,
				{
					credentials: clientSecret,
					authenticateWith: "request_body",
				},
			);

			// const a = await fetch("https://www.recurse.com/api/v1/profiles");

			// console.log(await a.json());

			await sql.query(
				"update user_session set refresh_token = $1 where id = $2",
				[refresh_token, req.locals.session?.id],
			);

			req.locals.authenticated = true;
			return next();
		} catch (e) {
			if (e instanceof OAuth2RequestError) {
				// see https://www.rfc-editor.org/rfc/rfc6749#section-5.2
				const { request, message, description } = e;

				if (message === "invalid_grant") {
					console.log(
						"A user's authentication was rejected due to an invalid grant.",
					);
					return next();
				}
			}

			console.error("Invalidating old session due to error", e);
			await lucia.invalidateSession(req.locals.session?.id);
			res.appendHeader(
				"Set-Cookie",
				lucia.createBlankSessionCookie().serialize(),
			);
			return next();
		}
	}

	return next();
};

// TODO I don't know where to write this
// Client could lose Websocket connection for a long time, like if they close their laptop
// HTMX is going to try to reconnect immediately, but it doesn't do anything
// to refresh the whole page to get a real understanding of the current world,
//  instead it will just start updating from the next stream evenst, and it could
// be completley wrong about where everyone is currenlty

app.get("/", isSessionAuthenticatedMiddleware, async (req, res) => {
	res.send(
		// TODO: Cache an authenticated version and an unauthenticated version
		//       and only invalidate that cache when a zoom room update occurs
		// ACTUALLY we can cache each room too! And only invalidate them when a room change occurs
		Page({
			title: "RCVerse",
			body: RootBody(
				transformInternalsToWhatTheRootBodyHtmlRendererNeeds({
					authenticated: req.locals.authenticated,
					zoomRooms,
					roomNameToParticipantNames,
					participantNameToEntity,
					roomNameToNote,
				}),
			),
		}),
	);
});

app.ws("/websocket", async function (ws, req) {
	// TODO: Split up authentication mechanism instead of calling it with these
	//       fake res and next
	await isSessionAuthenticatedMiddleware(
		req,
		{ appendHeader: () => {} },
		() => {},
	);
	if (!req.locals.authenticated) {
		ws.send("I'm afraid I can't do that Hal");
		ws.close();
		return;
	}
	// NOTE: Only use async listeners, so that each listener doesn't block.
	const listener = async (participantName, action, roomName) => {
		const roomId = `room-update-${roomName}`;
		const roomContent = Room(
			transformInternalsToWhatTheSingleRoomHtmlRendererNeeds({
				roomName,
				roomHref: zoomRoomsByName[roomName].href,
				roomNameToNote,
				roomNameToParticipantNames,
				participantNameToEntity,
			}),
		);
		ws.send(`<div id="${roomId}">${roomContent}</div>`);
	};

	emitter.on("room-change", listener);

	// If client closes connection, stop sending events
	ws.on("close", () => {
		emitter.off("room-change", listener);
	});
});

const roomNameToNote = {};
app.post("/note", isSessionAuthenticatedMiddleware, function (req, res) {
	const { room, note } = req.body;
	roomNameToNote[room] = note ?? "";

	console.log(`Room '${room}' note changed to ${note}`);

	emitter.emit("room-change", "someone", "updated the note for", room);

	res.status(200).end();
});

app.get("/note.html", isSessionAuthenticatedMiddleware, function (req, res) {
	const { roomName } = req.query;
	const note = roomNameToNote[roomName] ?? "";

	res.send(EditNoteForm({ roomName, note: note }));
});

const transformInternalsToWhatTheRootBodyHtmlRendererNeeds = ({
	authenticated,
	zoomRooms,
	roomNameToParticipantNames,
	participantNameToEntity,
	roomNameToNote,
}) => {
	const rooms = [];

	zoomRooms.forEach(({ roomName }) => {
		rooms.push(
			transformInternalsToWhatTheSingleRoomHtmlRendererNeeds({
				roomName,
				roomHref: zoomRoomsByName[roomName].href,
				roomNameToNote,
				roomNameToParticipantNames,
				participantNameToEntity,
			}),
		);
	});

	return { authenticated, rooms };
};

const transformInternalsToWhatTheSingleRoomHtmlRendererNeeds = ({
	roomName,
	roomHref,
	roomNameToNote,
	roomNameToParticipantNames,
	participantNameToEntity,
}) => {
	return {
		roomName,
		roomHref,
		note: roomNameToNote[roomName] ?? "",
		isEmpty: roomNameToParticipantNames[roomName]?.length > 0,
		participants:
			roomNameToParticipantNames[roomName]?.map((participantName) => ({
				participantName,
				faceMarkerImagePath:
					participantNameToEntity[participantName].faceMarkerImagePath,
			})) ?? [],
	};
};

app.get("/logout", async (req, res) => {
	lucia.invalidateSession(req.locals.session?.id);

	res.redirect("/");
});

const oauthStateCookieName = "rc-verse-login-oauth-state";
app.get("/getAuthorizationUrl", async (req, res) => {
	const state = generateState();
	res.appendHeader(
		"Set-Cookie",
		new Cookie(oauthStateCookieName, state).serialize(),
	);

	const url = await client.createAuthorizationURL({
		state,
		scope: ["user:email"],
	});
	res.redirect(url);
});

app.get("/myOauth2RedirectUri", async (req, res) => {
	const { state, code } = req.query;

	const cookies = parseCookies(req.headers.cookie);
	const cookieState = cookies.get(oauthStateCookieName);

	if (!cookieState || !state || cookieState !== state) {
		// TODO: Don't crash the server!
		console.error("State didn't match", { cookieState, state });
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
		req.locals.session = session;
		res.redirect("/");
		return;
	} catch (e) {
		if (e instanceof OAuth2RequestError) {
			// see https://www.rfc-editor.org/rfc/rfc6749#section-5.2
			const { request, message, description } = e;
		}
		// unknown error
		console.error("Invalidating new session due to error", e);
		await lucia.invalidateSession(req.locals.session?.id);
		res.appendHeader(
			"Set-Cookie",
			lucia.createBlankSessionCookie().serialize(),
		);
		res.redirect("/");
	}
});

app.use(express.static("public"));

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
	res.send("404");
});

const listener = app.listen(port, () => {
	console.log(`Server is available at ${baseURL}`);
});

// So I can kill from local terminal with Ctrl-c
// From https://github.com/strongloop/node-foreman/issues/118#issuecomment-475902308
process.on("SIGINT", () => {
	listener.close(() => {});
	// Just wait some amount of time before exiting. Ideally the listener would
	// close successfully, but it seems to hang for some reason.
	setTimeout(() => process.exit(0), 150);
});
// Typescript recommendation from https://lucia-auth.com/getting-started/
// declare module "lucia" {
// 	interface Register {
// 		Lucia: typeof lucia;
// 	}
// }
