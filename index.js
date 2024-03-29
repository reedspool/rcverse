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
import {
	Page,
	RootBody,
	Room,
	EditNoteForm,
	EditCustomizationCodeForm,
	Customization,
	PauseCustomizationConfirmationButton,
	WhoIsInTheHub,
	escapeHtml,
} from "./html.js";
import expressWebsockets from "express-ws";

import fs from "node:fs";

// Catch and snuff all uncaught exceptions and uncaught promise rejections.
// We can manually restart the server if it gets into a bad state, but we want
// to preserve the weirdness for as long as possible.
process.on("uncaughtException", function (err) {
	console.error("Top-level uncaught exception: " + err, err);
});
process.on("unhandledRejection", function (err, promise) {
	console.error(
		"Top level unhandled rejection (promise: ",
		promise,
		", reason: ",
		err,
		").",
		err,
	);
});

// Create an event emitter to handle cross-cutting communications
const emitter = new EventEmitter();

// Only be warned if the number of listeners for a specific event goes above
// this number. The warning will come in logs (MaxListenersExceededWarning)
emitter.setMaxListeners(100);

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

// Currently unused self-signed SSL certs. Use `npm run generate-cert` to create
// these files
const sslConfig =
	process.env.NODE_ENV === "production"
		? {}
		: {
				key: fs.readFileSync(`./cert/server.key`),
				cert: fs.readFileSync(`./cert/server.cert`),
		  };

const authorizeEndpoint = "https://recurse.com/oauth/authorize";
// TODO P.B. found this required `www` though authorize doesn't.
const tokenEndpoint = "https://www.recurse.com/oauth/token";

// From https://www.recurse.com/settings/apps
const clientId = process.env.OAUTH_CLIENT_ID;
const clientSecret = process.env.OAUTH_CLIENT_SECRET;

const postgresConnection = process.env.POSTGRES_CONNECTION;

// From https://recurse.rctogether.com/apps
const actionCableAppId = process.env.ACTION_CABLE_APP_ID;
const actionCableAppSecret = process.env.ACTION_CABLE_APP_SECRET;

// Special auth token (primarily for RCTV)
const secretAuthToken = process.env.SPECIAL_SECRET_AUTH_TOKEN_DONT_SHARE;

// Mixpanel
const mixpanelToken = process.env.MIXPANEL_TOKEN;

let inTheHubParticipantNames = [];
let roomNameToParticipantNames = {};
let participantNameToEntity = {};

// TODO
//  The action cable API sometimes updates with a zoom room participant count,
//  and we observed once that virtual RC showed one person who was definitely in
//  a zoom room did not appear in virtual RC (or this app) as in that zoom room.
//  Question: Does that participant count also reflect that person NOT in the room?
//     I'm guessing it will not show the person in the room, because we also observed
//     the little bubble in Virutal RC didn't show that person as in the room
connect(actionCableAppId, actionCableAppSecret, emitter);
emitter.on("participant-room-data-reset", async () => {
	inTheHubParticipantNames = [];
	roomNameToParticipantNames = {};
	participantNameToEntity = {};
});
emitter.on("participant-room-data", async (entity) => {
	let { roomName, participantName, faceMarkerImagePath, inTheHub } = entity;

	if (roomName !== null && !zoomRoomNames.includes(roomName)) {
		// TODO don't kill the server but be loud about this confusion in the future
		console.error(`Surprising zoom room name '${roomName}'`);
		return;
	}

	if (!participantNameToEntity[participantName]) {
		participantNameToEntity[participantName] = { faceMarkerImagePath };
	}

	let hubStatusVerb = "";
	if (inTheHub && !participantNameToEntity[participantName]?.inTheHub) {
		hubStatusVerb = "enterred";
		inTheHubParticipantNames.push(participantName);
	} else if (!inTheHub && participantNameToEntity[participantName]?.inTheHub) {
		hubStatusVerb = "left";
		inTheHubParticipantNames = inTheHubParticipantNames.filter(
			(name) => name !== participantName,
		);
	}

	if (hubStatusVerb) {
		console.log(`${participantName} ${hubStatusVerb} the hub`);
		participantNameToEntity[participantName] = {
			...participantNameToEntity[participantName],
			inTheHub,
		};
		emitter.emit("in-the-hub-change");
	}

	// zoom_room is a string means we're adding a person to that room
	const previousRoomName = participantNameToEntity[participantName]?.roomName;
	let verb;
	if (roomName) {
		if (previousRoomName === roomName) {
			// Ignore, we already have this person in the right zoom room
			return;
		}
		if (!roomNameToParticipantNames[roomName]) {
			roomNameToParticipantNames[roomName] = [];
		}

		roomNameToParticipantNames[roomName].push(participantName);

		participantNameToEntity[participantName] = {
			...participantNameToEntity[participantName],
			roomName,
			faceMarkerImagePath,
		};

		verb = "enterred";
	} else {
		if (typeof previousRoomName === "undefined" || !previousRoomName) {
			// Ignore, nothing to update, they're still not in a zoom room
			return;
		}

		// Remove them from their previous room
		if (previousRoomName) {
			roomNameToParticipantNames[previousRoomName] = roomNameToParticipantNames[
				previousRoomName
			].filter((name) => name !== participantName);
		}

		participantNameToEntity[participantName] = {
			...participantNameToEntity[participantName],
			roomName,
			faceMarkerImagePath,
		};

		verb = "departed";
		roomName = previousRoomName;
	}

	console.log(`${participantName} ${verb} ${roomName}`);
	emitter.emit("room-change", participantName, verb, roomName);
});

const oauthClient = new OAuth2Client(
	clientId,
	authorizeEndpoint,
	tokenEndpoint,
	{
		redirectURI: `${baseURL}/myOauth2RedirectUri`,
	},
);

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
	const { token } = req.query;
	if (!req.locals.session && !token) return next();

	if (token === secretAuthToken) {
		req.locals.authenticated = true;
		return next();
	}

	// NOTE: If you're confused about why you're never logged in
	//       It's probably this line and there's probably an error above.
	req.locals.authenticated = false;
	if (req.locals.session?.refresh_token) {
		try {
			// Again the oslo docs are wrong, or at least inspecific.
			// Source don't lie, though! https://github.com/pilcrowOnPaper/oslo/blob/main/src/oauth2/index.ts#L76
			const { access_token, refresh_token } =
				await oauthClient.refreshAccessToken(
					req.locals.session?.refresh_token,
					{
						credentials: clientSecret,
						authenticateWith: "request_body",
					},
				);

			await sql.query(
				"update user_session set refresh_token = $1 where id = $2",
				[refresh_token, req.locals.session?.id],
			);

			req.locals.authenticated = true;
			req.locals.access_token = access_token;
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

const getRcUserMiddleware = async (req, res, next) => {
	if (!req.locals?.authenticated || !req.locals.access_token) return next();

	const fetchResponse = await fetch(
		"https://www.recurse.com/api/v1/profiles/me",
		{
			headers: {
				Authorization: `Bearer ${req.locals.access_token}`,
			},
		},
	);

	const json = await fetchResponse.json();
	req.locals.rcPersonName = json.name;
	req.locals.rcUserId = String(json.id);
	return next();
};

// We track who is at the hub in two different ways. We get immediate updates
// through the action cable stream, but that doesn't help us understand who
// came into the hub before the server started. So we sometimes also get the
// info directly from the API which is conclusive
let needToUpdateWhosAtTheHub = true;
let timeoutScheduleNeedToUpdateWhosAtTheHub;
const scheduleNeedToUpdateWhosAtTheHub = async () => {
	clearTimeout(timeoutScheduleNeedToUpdateWhosAtTheHub);
	await new Promise(
		(resolve) =>
			(timeoutScheduleNeedToUpdateWhosAtTheHub = setTimeout(
				resolve,
				1000 * 60 * 30, // 30 min
			)),
	);
	needToUpdateWhosAtTheHub = true;
};

// TODO I don't know where to write this
// Client could lose Websocket connection for a long time, like if they close their laptop
// HTMX is going to try to reconnect immediately, but it doesn't do anything
// to refresh the whole page to get a real understanding of the current world,
//  instead it will just start updating from the next stream evenst, and it could
// be completley wrong about where everyone is currenlty
app.get(
	"/",
	isSessionAuthenticatedMiddleware,
	getRcUserMiddleware,
	async (req, res) => {
		let { basic } = req.query;

		// `?basic` means the value of this would be empty string,
		// but that should trigger the effect
		const noCustomizations = typeof basic !== "undefined";

		if (needToUpdateWhosAtTheHub) {
			let date = new Date();
			date = date.toISOString();
			// Format date as `yyyy-mm-dd`
			date = date.slice(0, date.indexOf("T"));
			const fetchResponse = await fetch(
				`https://www.recurse.com/api/v1/hub_visits?per_page=200&date=${date}`,
				{
					headers: {
						Authorization: `Bearer ${req.locals.access_token}`,
					},
				},
			);

			const json = await fetchResponse.json();
			inTheHubParticipantNames = [];
			const peopleFacesToGet = [];
			json.forEach(({ person }) => {
				inTheHubParticipantNames.push(person.name);
				if (!participantNameToEntity[person.name]?.faceMarkerImagePath) {
					peopleFacesToGet.push(person);
				}
			});

			await Promise.all(
				peopleFacesToGet.map(async ({ id, name }) => {
					const fetchResponse = await fetch(
						`https://www.recurse.com/api/v1/profiles/${id}`,
						{
							headers: {
								Authorization: `Bearer ${req.locals.access_token}`,
							},
						},
					);

					const { image_path } = await fetchResponse.json();
					if (!participantNameToEntity[name]) {
						participantNameToEntity[name] = {};
					}

					participantNameToEntity[name] = {
						...participantNameToEntity[name],
						faceMarkerImagePath: image_path,
					};
				}),
			);

			emitter.emit("in-the-hub-change");
			needToUpdateWhosAtTheHub = false;
			scheduleNeedToUpdateWhosAtTheHub();
		}

		res.send(
			// TODO: Cache an authenticated version and an unauthenticated version
			//       and only invalidate that cache when a zoom room update occurs
			// ACTUALLY we can cache each room too! And only invalidate them when a room change occurs
			Page({
				title: "RCVerse",
				body: RootBody(
					mungeRootBody({
						authenticated: req.locals.authenticated,
						zoomRooms,
						roomNameToParticipantNames,
						participantNameToEntity,
						roomNameToNote,
						rcUserIdToCustomization,
						myRcUserId: req.locals.rcUserId,
						noCustomizations,
						inTheHubParticipantNames,
					}),
				),
				mixpanelToken,
				myRcUserId: req.locals.rcUserId,
			}),
		);
	},
);

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

	await getRcUserMiddleware(req, { appendHeader: () => {} }, () => {});

	// NOTE: Only use async listeners, so that each listener doesn't block.
	const roomListener = async (participantName, action, roomName) => {
		ws.send(
			Room(
				mungeRoom({
					roomName,
					roomHref: zoomRoomsByName[roomName].href,
					roomNameToNote,
					roomNameToParticipantNames,
					participantNameToEntity,
				}),
			),
		);
	};

	const customizationListener = async (rcUserId, action, isNew) => {
		ws.send(
			Customization(
				mungeCustomization({
					rcUserIdToCustomization,
					rcUserId,
					myRcUserId: req.locals.rcUserId,
					isNew,
				}),
			),
		);
	};

	const inTheHubListener = async () => {
		ws.send(
			WhoIsInTheHub(
				mungeWhoIsInTheHub({
					inTheHubParticipantNames,
					participantNameToEntity,
				}),
			),
		);
	};

	emitter.on("room-change", roomListener);
	emitter.on("in-the-hub-change", inTheHubListener);
	emitter.on("customization-change", customizationListener);

	// If client closes connection, stop sending events
	ws.on("close", () => {
		emitter.off("room-change", roomListener);
		emitter.off("in-the-hub-change", inTheHubListener);
		emitter.off("customization-change", customizationListener);
	});
});

const roomNameToNote = {};
app.post("/note", isSessionAuthenticatedMiddleware, function (req, res) {
	const { room, note } = req.body;
	roomNameToNote[room] = escapeHtml(note) ?? "";

	console.log(`Room '${room}' note changed to ${note} (pre-escape)`);

	emitter.emit("room-change", "someone", "updated the note for", room);

	res.status(200).end();
});

app.get("/note.html", isSessionAuthenticatedMiddleware, function (req, res) {
	const { roomName } = req.query;
	const note = roomNameToNote[roomName] ?? "";

	res.send(EditNoteForm({ roomName, note: note }));
});

const rcUserIdToCustomization = {};
app.post(
	"/customization",
	isSessionAuthenticatedMiddleware,
	getRcUserMiddleware,
	function (req, res) {
		const { code } = req.body;
		const isNew = !rcUserIdToCustomization[req.locals.rcUserId];
		rcUserIdToCustomization[req.locals.rcUserId] = {
			code: code ?? "",
			rcPersonName: req.locals.rcPersonName,
		};

		console.log(
			`User ${req.locals.rcUserId} (${req.locals.rcPersonName}) ${
				isNew ? "added a new" : "updated their"
			} customization: \`${code}\``,
		);

		emitter.emit(
			"customization-change",
			req.locals.rcUserId,
			`${isNew ? "added a new" : "updated their"} customization`,
			isNew,
		);

		res.status(200).end();
	},
);

app.post(
	"/pauseCustomizationConfirmation.html",
	isSessionAuthenticatedMiddleware,
	function (req, res) {
		const { rcUserId } = req.query;

		res.send(PauseCustomizationConfirmationButton({ rcUserId }));
	},
);

app.post(
	"/pauseCustomization",
	isSessionAuthenticatedMiddleware,
	getRcUserMiddleware,
	function (req, res) {
		const { rcUserId: pauseCustomizationRcUserId } = req.query;

		if (!rcUserIdToCustomization[pauseCustomizationRcUserId]) {
			res.status(200).end();
			return;
		}

		rcUserIdToCustomization[pauseCustomizationRcUserId].paused = true;

		const { rcPersonName } =
			rcUserIdToCustomization[pauseCustomizationRcUserId];

		console.log(
			`User ${req.locals.rcUserId} (${req.locals.rcPersonName}) paused user ${rcPersonName}'s (${pauseCustomizationRcUserId}) customization`,
		);

		emitter.emit(
			"customization-change",
			pauseCustomizationRcUserId,
			`customization was paused`,
		);

		res.status(200).end();
	},
);

app.get(
	"/editCustomization.html",
	isSessionAuthenticatedMiddleware,
	getRcUserMiddleware,
	function (req, res) {
		const { code } = rcUserIdToCustomization[req.locals.rcUserId] ?? {
			code: "",
		};

		res.send(EditCustomizationCodeForm({ code }));
	},
);

// Data mungers take the craziness of the internal data structures
// and make them peaceful and clean for the HTML generator
const mungeRootBody = ({
	authenticated,
	zoomRooms,
	roomNameToParticipantNames,
	participantNameToEntity,
	roomNameToNote,
	rcUserIdToCustomization,
	myRcUserId,
	noCustomizations,
	inTheHubParticipantNames,
}) => {
	const whoIsInTheHub = mungeWhoIsInTheHub({
		inTheHubParticipantNames,
		participantNameToEntity,
	});
	const rooms = zoomRooms.map(({ roomName }) =>
		mungeRoom({
			roomName,
			roomHref: zoomRoomsByName[roomName].href,
			roomNameToNote,
			roomNameToParticipantNames,
			participantNameToEntity,
		}),
	);

	const myCustomization =
		!noCustomizations &&
		rcUserIdToCustomization[myRcUserId] &&
		mungeCustomization({
			rcUserId: myRcUserId,
			rcUserIdToCustomization,
			myRcUserId,
		});
	const otherCustomizations =
		!noCustomizations &&
		Object.keys(rcUserIdToCustomization)
			.filter((id) => id !== myRcUserId)
			.map((rcUserId) =>
				mungeCustomization({
					rcUserId,
					rcUserIdToCustomization,
					myRcUserId,
				}),
			);

	return {
		authenticated,
		whoIsInTheHub,
		rooms,
		otherCustomizations,
		myCustomization,
		noCustomizations,
	};
};

const mungeCustomization = ({
	rcUserId,
	rcUserIdToCustomization,
	myRcUserId,
	isNew,
}) => {
	let code = rcUserIdToCustomization[rcUserId].code ?? "";
	const isPaused = rcUserIdToCustomization[rcUserId].paused;

	if (isPaused) code = escapeHtml(code);
	return {
		rcUserId,
		isPaused,
		code,
		isEmpty: rcUserIdToCustomization[rcUserId].code,
		rcPersonName: rcUserIdToCustomization[rcUserId].rcPersonName,
		isMine: myRcUserId === rcUserId,
		isNew,
	};
};

const mungeRoom = ({
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
					participantNameToEntity[participantName]?.faceMarkerImagePath ??
					"recurse-community-bot.png",
			})) ?? [],
	};
};

const mungeWhoIsInTheHub = ({
	inTheHubParticipantNames,
	participantNameToEntity,
}) => {
	return {
		isEmpty: inTheHubParticipantNames.length > 0,
		participants: inTheHubParticipantNames.map((participantName) => ({
			participantName,
			faceMarkerImagePath:
				participantNameToEntity[participantName]?.faceMarkerImagePath ??
				"recurse-community-bot.png",
		})),
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

	const url = await oauthClient.createAuthorizationURL({
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
		console.error("State didn't match", { cookieState, state });
		await lucia.invalidateSession(req.locals.session?.id);
		res.appendHeader(
			"Set-Cookie",
			lucia.createBlankSessionCookie().serialize(),
		);
		res.redirect("/");
		return;
	}

	try {
		// NOTE: This is different from the Oslo OAuth2 docs, they use camel case
		const { access_token, refresh_token } =
			await oauthClient.validateAuthorizationCode(code, {
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
