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
import { marked } from "marked";
import { connect } from "./actioncable.js";
import EventEmitter from "node:events";
import {
  Page,
  RootBody,
  Room,
  EditNoteForm,
  WhoIsInTheHub,
  Login,
  Personalization,
  escapeHtml,
  RoomList,
} from "./html.js";
import expressWebsockets from "express-ws";
import ical from "node-ical";
import fs from "node:fs";
import { formatDistanceToNow } from "date-fns";

// Prepare Markdown renderer to force links to always target="_blank"
const renderer = {
  link({ tokens, href, title }) {
    const text = this.parser.parseInline(tokens);
    const titleAttribute = title
      ? ` title="${title.replaceAll(/"/g, "&quot;")}"`
      : "";
    return `<a target="_blank" rel="nofollow" href="${href}"${titleAttribute}>${text}</a>`;
  },
};

marked.use({
  // See https://marked.js.org/using_advanced#options
  async: false,
  // Original markdown.pl, which I think RCTogether conforms to
  pedantic: true,
  renderer,
});

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
// TODO: Update this to true meaning, "RCTogether App ID/Secret", not just Action Cable but Rest API too
const actionCableAppId = process.env.ACTION_CABLE_APP_ID;
const actionCableAppSecret = process.env.ACTION_CABLE_APP_SECRET;

// Special auth token (primarily for RCTV)
const secretAuthToken = process.env.SPECIAL_SECRET_AUTH_TOKEN_DONT_SHARE;

// Mixpanel
const mixpanelToken = process.env.MIXPANEL_TOKEN;

// Recurse.com Calendar
const recurseCalendarToken = process.env.RECURSE_CALENDAR_TOKEN;

let inTheHubParticipantNames = [];
let roomNameToParticipantNames = {};
let participantNameToEntity = {};

const sql = new pg.Pool({
  connectionString: postgresConnection,
});

// TODO: If connection doesn't work, should either restart the server or
//       loop and not proceed until it works.
const zoomRoomsResult = await sql.query(
  "select room_name, location, note_block_rctogether_id, visibility from zoom_rooms",
  [],
);

const zoomRooms = [];

// Zoom Rooms that are reported but that we purposely don't track
const silentZoomRooms = [];

zoomRoomsResult.rows.forEach(
  ({ room_name, location, visibility, note_block_rctogether_id }) => {
    if (visibility == "visible") {
      zoomRooms.push({
        roomName: room_name,
        location,
        noteBlockRCTogetherId: note_block_rctogether_id,
      });
    } else {
      silentZoomRooms.push(room_name);
    }
  },
);

const zoomRoomNames = zoomRooms.map(({ roomName }) => roomName);
const zoomRoomsByName = {};
zoomRooms.forEach(({ roomName, ...rest }) => {
  zoomRoomsByName[roomName] = { roomName, ...rest };
});
const zoomRoomsByLocation = {};
zoomRooms.forEach(({ location, ...rest }) => {
  zoomRoomsByLocation[location] = { location, ...rest };
});

// TODO
//  The action cable API sometimes updates with a zoom room participant count,
//  and we observed once that virtual RC showed one person who was definitely in
//  a zoom room did not appear in virtual RC (or this app) as in that zoom room.
//  Question: Does that participant count also reflect that person NOT in the room?
//     I'm guessing it will not show the person in the room, because we also observed
//     the little bubble in Virutal RC didn't show that person as in the room
emitter.on("participant-room-data-reset", async () => {
  inTheHubParticipantNames = [];
  roomNameToParticipantNames = {};
  participantNameToEntity = {};
});
emitter.on("participant-room-data", async (entity) => {
  let { roomName, participantName, faceMarkerImagePath, inTheHub, lastBatch } =
    entity;

  if (roomName !== null && !zoomRoomNames.includes(roomName)) {
    if (!silentZoomRooms.includes(roomName)) {
      console.error(`Surprising zoom room name '${roomName}'`);
    }
    return;
  }

  if (!participantNameToEntity[participantName]) {
    participantNameToEntity[participantName] = {};
  }

  // Always want to have the latest of these
  participantNameToEntity[participantName] = {
    ...participantNameToEntity[participantName],
    faceMarkerImagePath,
    lastBatch,
  };

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
    // console.log(`${participantName} ${hubStatusVerb} the hub`);
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

    // Remove them from their previous room
    if (previousRoomName) {
      roomNameToParticipantNames[previousRoomName] = roomNameToParticipantNames[
        previousRoomName
      ].filter((name) => name !== participantName);
    }

    if (!roomNameToParticipantNames[roomName]) {
      roomNameToParticipantNames[roomName] = [];
    }

    roomNameToParticipantNames[roomName].push(participantName);

    participantNameToEntity[participantName] = {
      ...participantNameToEntity[participantName],
      roomName,
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
    };

    verb = "departed";
    roomName = previousRoomName;
  }

  // console.log(`${participantName} ${verb} ${roomName}`);
  emitter.emit("room-change", participantName, verb, roomName);
});
emitter.on("room-note-data", async (entity) => {
  let { id, content, updatedTimestamp } = entity;

  const room = zoomRooms.find(
    ({ noteBlockRCTogetherId }) => id === noteBlockRCTogetherId,
  );

  if (!room?.roomName) return;

  roomNameToNote[room.roomName] = {
    content: content ?? "",
    date: new Date(updatedTimestamp),
  };

  emitter.emit("room-change", "RCTogether", "updated", room.roomName);
});

connect(actionCableAppId, actionCableAppSecret, emitter);

const oauthClient = new OAuth2Client(
  clientId,
  authorizeEndpoint,
  tokenEndpoint,
  {
    redirectURI: `${baseURL}/myOauth2RedirectUri`,
  },
);

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

  req.locals.authenticated = false;
  if (!req.locals.session?.refresh_token) return next();

  try {
    // Again the oslo docs are wrong, or at least inspecific.
    // Source don't lie, though! https://github.com/pilcrowOnPaper/oslo/blob/main/src/oauth2/index.ts#L76
    const { access_token, refresh_token } =
      await oauthClient.refreshAccessToken(req.locals.session?.refresh_token, {
        credentials: clientSecret,
        authenticateWith: "request_body",
      });

    await sql.query(
      "update user_session set refresh_token = $1 where id = $2",
      [refresh_token, req.locals.session?.id],
    );

    req.locals.authenticated = true;
    req.locals.access_token = access_token;
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

  try {
    const json = await fetchResponse.json();
    req.locals.rcPersonName = json.name;
    req.locals.rcUserId = String(json.id);
  } catch (error) {
    console.error(
      "Error getting RC user profile. Error (followed by response):",
    );
    console.error(error);
    console.error("Response:");
    console.error(await fetchResponse.text());
  }

  return next();
};

const redirectToLoginIfNotAuthenticated = async (req, res, next) => {
  if (req.locals?.authenticated) return next();

  res.redirect("/login");
};

const hxBlockIfNotAuthenticated = async (req, res, next) => {
  if (req.locals?.authenticated && req.locals.access_token) return next();

  res.appendHeader("HX-Redirect", "/login?reason=deauthenticated");
  return res.status(401).send(
    Page({
      title: "RCVerse",
      body: Login({}),
      mixpanelToken,
      myRcUserId: req.locals.rcUserId,
    }),
  );
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

const updateWhoIsAtTheHubMiddleware = async (req, res, next) => {
  if (!req.locals?.authenticated || !req.locals.access_token) return next();
  if (!needToUpdateWhosAtTheHub) return next();

  const date = getTodayDateForHubVisitsAPI();
  const fetchResponse = await fetch(
    `https://www.recurse.com/api/v1/hub_visits?per_page=200&date=${date}`,
    {
      headers: {
        Authorization: `Bearer ${req.locals.access_token}`,
      },
    },
  );

  const json = await fetchResponse.json();
  Object.keys(participantNameToEntity).forEach((participantName) => {
    participantNameToEntity[participantName].inTheHub = false;
  });
  const profilesToGet = [];
  json.forEach(({ person }) => {
    profilesToGet.push(person);
    if (!participantNameToEntity[person.name]) {
      participantNameToEntity[person.name] = {};
    }
    participantNameToEntity[person.name] = {
      ...participantNameToEntity[person.name],
      inTheHub: true,
    };
  });

  await Promise.all(
    profilesToGet.map(async ({ id, name }) => {
      const fetchResponse = await fetch(
        `https://www.recurse.com/api/v1/profiles/${id}`,
        {
          headers: {
            Authorization: `Bearer ${req.locals.access_token}`,
          },
        },
      );
      const { image_path, stints } = await fetchResponse.json();
      if (!participantNameToEntity[name]) {
        participantNameToEntity[name] = {};
      }

      const lastBatch = stints?.[0]?.batch?.short_name ?? "";

      participantNameToEntity[name] = {
        ...participantNameToEntity[name],
        faceMarkerImagePath: image_path,
        lastBatch,
      };
    }),
  );

  inTheHubParticipantNames = profilesToGet.map(({ name }) => name);
  emitter.emit("in-the-hub-change");
  needToUpdateWhosAtTheHub = false;
  scheduleNeedToUpdateWhosAtTheHub();
  return next();
};
const personalizationsCookieName = "rcverse-personalizations";
// TODO: Must find a different strategy than relying on long term cookies alone
//       as cookies can't have a max age beyond 400 days. See
//       https://developer.chrome.com/blog/cookie-max-age-expires/
const personalizationsCookieMaxAge = Math.pow(2, 31) - 1;
// TODO I don't know where to write this
// Client could lose Websocket connection for a long time, like if they close their laptop
// HTMX is going to try to reconnect immediately, but it doesn't do anything
// to refresh the whole page to get a real understanding of the current world,
//  instead it will just start updating from the next stream evenst, and it could
// be completley wrong about where everyone is currenlty
app.get(
  "/",
  isSessionAuthenticatedMiddleware,
  redirectToLoginIfNotAuthenticated,
  getRcUserMiddleware,
  updateWhoIsAtTheHubMiddleware,
  async (req, res) => {
    let { sort, personalize } = req.query;

    // If `personalize` appears once in query string, it's a string. If it
    // appears multiple times, it's an array of strings. Coerce to one shape
    if (Array.isArray(personalize)) {
      personalize = personalize.map((url) => ({ url, cache: false }));
    } else {
      const url = personalize;
      personalize = [];
      if (url) personalize.push({ url, cache: false });
    }

    // `?sort=none` uses the default ordering instead of sort by count
    const sortRooms = sort !== "none";

    // `?reset` temporarily disables all saved personalizations
    const reset = req.query.hasOwnProperty("reset");

    // TODO: If any includes are in the URL, then we redirect to a page
    //       to manage and accept your new URLs with disclaimers and such.
    //       Then, if the user accepts the disclaimers, we add that include to
    //       their cookie so they can simply use the page rcverse.recurse.com
    //       and it will load the exact same things.
    //       But if we're making a separate page anyways, why not allow all
    //       management on that page, isntead of starting with this fancy
    //       and confusing query string thing.
    //       So let's do that.

    // TODO: Add query parameters js+, css+, etc so that people can share links
    //       to RCVerse that automatically add the scripts they like. "Share links"
    // TODO: Also add a button to copy these share links to the customization page.
    // TODO: Add a Share All button to customization page
    /**
     *  <p>
     *    To include custom snippets via URL, add the query parameter
     *    <code>?include=&lt;URL&gt;</code>. You can add this query parameter any
     *    number of times, e.g.
     *    <code>?include=&lt;URL_1&gt;&include=&lt;URL_2&gt;</code>.
     *  </p>
     */

    const personalizations = [];

    if (!reset) {
      personalizations.push(...getPersonalizationsFromReqCookies(req));
    }

    personalizations.push(...personalize);

    // TODO: Always set the personalizations cookie to update maxAge to
    //       today + max maxAge since cookies have a max time of a year. So
    //       this cookie should not expire until (max maxAge + last time you
    //       loaded the page). BUT shouldn't set any cookie if you didn't have
    //       any cookie set already

    res.send(
      Page({
        title: "RCVerse",
        body: RootBody(
          mungeRootBody({
            roomListContent: RoomList(
              mungeRoomList({
                zoomRooms,
                roomNameToParticipantNames,
                participantNameToEntity,
                roomNameToNote,
                myParticipantName: req.locals.rcPersonName,
                inTheHubParticipantNames,
                sortRooms,
                locationToNowAndNextEvents,
              }),
            ),
            personalizations,
          }),
        ),
        mixpanelToken,
        myRcUserId: req.locals.rcUserId,
      }),
    );
  },
);

const mungeLogin = ({ reason }) => {
  return { reason };
};
app.get("/login", async (req, res) => {
  const { reason } = req.query;
  res.send(
    Page({
      title: "RCVerse",
      body: Login(mungeLogin({ reason })),
      mixpanelToken,
      myRcUserId: req.locals.rcUserId,
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

  await getRcUserMiddleware(req, { appendHeader: () => {} }, () => {});

  let { sort } = req.query;

  // `?sort=none` uses the default ordering instead of sort by count
  // TODO: This logic is repeated from above, move into munge
  const sortRooms = sort !== "none";

  // TODO: Somehow distinguish between the first connection on page load and
  //       a reconnection, and don't send this on the first connection
  // TODO: Somehow distinguish if any messages were actually missed on reconnection
  //       and only do this if any missed messages
  // TODO: Add more complicated solution which replays chunks of missed messages
  //       instead of refreshing so much of the page
  ws.send(
    RoomList(
      mungeRoomList({
        zoomRooms,
        roomNameToParticipantNames,
        participantNameToEntity,
        roomNameToNote,
        myParticipantName: req.locals.rcPersonName,
        inTheHubParticipantNames,
        sortRooms,
        locationToNowAndNextEvents,
      }),
    ),
  );

  // NOTE: Only use async listeners, so that each listener doesn't block.
  const roomListener = async (participantName, action, roomName) => {
    ws.send(
      Room(
        mungeRoom({
          roomName,
          roomLocation: zoomRoomsByName[roomName].location,
          roomNameToNote,
          roomNameToParticipantNames,
          participantNameToEntity,
          locationToNowAndNextEvents,
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
          myParticipantName: req.locals.rcPersonName,
        }),
      ),
    );
  };
  const keepWsAliveListener = () => {
    // TODO: How to send an empty message that doesn't conflict with HTMX?
    ws.send("<div data-reason='empty-message-to-keepalive-websocket'></div>");
  };

  emitter.on("room-change", roomListener);
  emitter.on("in-the-hub-change", inTheHubListener);
  emitter.on("keep-ws-alive", keepWsAliveListener);

  // If client closes connection, stop sending events
  ws.on("close", () => {
    emitter.off("room-change", roomListener);
    emitter.off("in-the-hub-change", inTheHubListener);
    emitter.off("keep-ws-alive", keepWsAliveListener);
  });
});

// After seeing reference to another service with a 60 second idle timeout for
// websocket connections (https://stackoverflow.com/a/48764819), I thought I
// might try the same solution and see if that fixed the issue despite this
// being on a different stack.
// TODO: Test and see if the websocket still closes after 55 seconds
setInterval(() => {
  emitter.emit("keep-ws-alive");
}, 1000 * 30);

const roomNameToNote = {};
app.post(
  "/note",
  isSessionAuthenticatedMiddleware,
  hxBlockIfNotAuthenticated,
  async function (req, res) {
    const { room, content } = req.body;

    const zoomRoom = zoomRooms.find(({ roomName }) => room === roomName);

    if (!zoomRoom) {
      console.error(
        `Delete this message, but failed to find zoom room for name '${room}'`,
      );
    }

    const { noteBlockRCTogetherId } = zoomRoom;

    // TODO: Now we need coordinates for a free square next to a note block
    //       Just going to hard code these for the moment, because there's no pathfinding available.
    const noteBlockRCTogetherIdToAdjacentFreeSpacePositions = {
      152190: { x: 68, y: 58 }, // Pairing station 1
      152189: { x: 68, y: 51 }, // Pairing station 2
      152193: { x: 64, y: 48 }, // Pairing station 3
      152191: { x: 65, y: 43 }, // Pairing station 4
      140538: { x: 70, y: 43 }, // Pairing station 5
      152198: { x: 74, y: 43 }, // Pairing station 6
      152192: { x: 77, y: 43 }, // Pairing station 7
      81750: { x: 85, y: 56 }, //  Couches
    };

    const coords =
      noteBlockRCTogetherIdToAdjacentFreeSpacePositions[noteBlockRCTogetherId];

    if (!noteBlockRCTogetherId || !coords) {
      // There is no VirtualRC block associated with this room, so just update
      // local data. This is totally normal for non-pairing station rooms
      if (!content) {
        delete roomNameToNote[room];
      } else {
        roomNameToNote[room] = {
          content: escapeHtml(content) ?? "",
          date: new Date(),
        };
      }
      emitter.emit("room-change", "someone", "updated the note for", room);
      return;
    }

    const baseUrl = `https://recurse.rctogether.com/api`;
    const botEndpoint = `${baseUrl}/bots/`;
    const noteEndpoint = `${baseUrl}/notes/`;
    const authParams = `app_id=${actionCableAppId}&app_secret=${actionCableAppSecret}`;
    const headers = {
      "Content-Type": "application/json",
    };

    // TODO: Remove this - it's a testing utility because if something goes
    //       wrong in this flow, my bot would not be properly deleted and I'd
    //       have to delete it on the next experiment
    await fetch(botEndpoint + "155487" + "?" + authParams, {
      method: "DELETE",
      headers,
    });
    let botId;
    try {
      let apiResult = await fetch(botEndpoint + "?" + authParams, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: "RCVerse",
          x: coords.x,
          y: coords.y,
          emoji: "✏️",
        }),
      });

      const botCreated = await apiResult.json();
      // console.log("Bot created with ID #" + botCreated.id);
      if (!botCreated.id) {
        console.log("Bot creation failed somehow");
        console.log(apiResult.status);
        console.log(apiResult.statusText);
        console.log(botCreated);
      }
      botId = String(botCreated.id);

      // Even if there's a problem with writing the note, we still want to
      // catch and cleanup the bot
      try {
        // Update the note
        apiResult = await fetch(
          noteEndpoint + noteBlockRCTogetherId + "?" + authParams,
          {
            method: "PATCH",
            headers,
            body: JSON.stringify({
              bot_id: botCreated.id,
              note: {
                note_text: content,
              },
            }),
          },
        );
      } catch (errorNote) {
        console.error("Error with editing the note in VirtualRC", error);
      }

      // Delete the bot
      await fetch(botEndpoint + botId + "?" + authParams, {
        method: "DELETE",
        headers,
      });
    } catch (error) {
      console.error("Error with VirtualRC note-writing bot", error);
      res.status(500).end();
      return;
    }
    // console.log(`Room '${room}' note changed to ${content} (pre-escape)`);

    // Only if the update in RCTogether was ostensibly successful do we
    // optimistically update our own version.
    // TODO: Disabling optimistic update, just waiting for ActionCable round trip instead
    // TODO: When I re-enable, be mindful of the duplicated logic that does real markdown work - probably extract to function
    // if (!content) {
    //   delete roomNameToNote[room];
    // } else {
    //   roomNameToNote[room] = {
    //     content: escapeHtml(content) ?? "",
    //     date: new Date(),
    //   };
    // }
    // emitter.emit("room-change", "someone", "updated the note for", room);

    res.status(200).end();
  },
);

const mungeEditNoteForm = ({ roomName, roomNameToNote, zoomRooms }) => ({
  roomName,
  noteContent: roomNameToNote[roomName]?.content ?? "",
  hasVirtualRCConnectedBlock: Boolean(
    zoomRooms.find(({ roomName: zoomRoomName }) => zoomRoomName === roomName)
      ?.noteBlockRCTogetherId,
  ),
});

app.get("/note.html", isSessionAuthenticatedMiddleware, function (req, res) {
  const { roomName } = req.query;

  res.send(
    EditNoteForm(mungeEditNoteForm({ roomName, roomNameToNote, zoomRooms })),
  );
});

// Every hour, clean up any notes which haven't been updated for 4 hours
function cleanNotes() {
  const millisNow = Date.now();
  Object.keys(roomNameToNote).forEach((roomName) => {
    if (!roomNameToNote[roomName]) return;
    const content = roomNameToNote[roomName]?.content;
    if (typeof content === "string" && !content.match(/\S/)) {
      roomNameToNote[roomName] = null;
    }
    const date = roomNameToNote[roomName]?.date;
    if (!date) return;
    const millisThen = date.getTime();
    const difference = millisNow - millisThen;
    if (difference < 1000 * 60 * 60 * 4) return; // 4 hours
    roomNameToNote[roomName] = null;
  });

  setTimeout(cleanNotes, 1000 * 60 * 60); // 1 hour
}
// TODO: Disabled the note cleaning function (we never start it) after connecting
//       the RCTogether room notes to the RCverse notes. The norm on RCTogether
//       has been to reset the note to be non-empty
//       (kinda like a form "Pairing on: Open invite: ?") We could do that, and
//       we could store the default note (because it's different for pairing
//       stations than for couches) in the SQL table next to the note ID
// TODO: In order to re-enable cleaning notes, must use the bot process for
//       updating the notes. Probably want to use one bot to clean multiple
//       notes?
// cleanNotes();

// We only need to update from the remote rarely, since the calendar doesn't
// change quickly very often (people rarely cancel things last minute)
// But we want to update the "starts in 5 minutes" quotes very often throughout
// the day, so make two separate loops, one for refreshing from remote, and one
// for refreshing from the current information
// TODO: Could make a button from the front-end to trigger a refresh manually
let locationToNowAndNextEvents = {};
let iCalendar = {};
async function updateCalendarFromRemote() {
  try {
    iCalendar = await ical.async.fromURL(
      `https://www.recurse.com/calendar/events.ics?token=${recurseCalendarToken}&omit_cancelled_events=1&scope=all`,
    );
  } catch (error) {
    console.error("Failed to fetch calendar ICS, will try again. Error:");
    console.error(error);
  }
  clearTimeout(timeoutIdForUpdateRoomsAsCalendarEventsChangeOverTime);
  updateRoomsAsCalendarEventsChangeOverTime();

  setTimeout(updateCalendarFromRemote, 1000 * 60 * 30);
}
updateCalendarFromRemote();

let timeoutIdForUpdateRoomsAsCalendarEventsChangeOverTime;
const calendarUpdateDelay = 1000 * 60 * 5;
function updateRoomsAsCalendarEventsChangeOverTime() {
  const now = new Date();
  const nowPlusCalendarDelay = new Date();
  nowPlusCalendarDelay.setTime(
    nowPlusCalendarDelay.getTime() + calendarUpdateDelay,
  );
  const tomorrow = new Date();
  tomorrow.setTime(tomorrow.getTime() + 1000 * 60 * 60 * 24);
  const yesterday = new Date();
  yesterday.setTime(yesterday.getTime() - 1000 * 60 * 60 * 24);
  const soonish = new Date();
  soonish.setTime(soonish.getTime() + 1000 * 60 * 80); // 80 minutes
  const locationToEvents = {};
  Object.entries(iCalendar).forEach(([_, event]) => {
    const { start, end } = event;
    const zoomLocation = event?.conference?.val;

    let keep = true;
    keep &&= event.type === "VEVENT";
    keep &&= zoomLocation && zoomLocation in zoomRoomsByLocation;
    keep &&= start >= yesterday; // Started less than 24 hours ago
    keep &&= end <= tomorrow; // Ends less than 24 hours from now
    keep &&= now <= end; // Hasn't ended yet
    if (!keep) return;

    if (!locationToEvents[zoomLocation]) {
      locationToEvents[zoomLocation] = [];
    }
    locationToEvents[zoomLocation].push(event);
  });

  // Before we drop the old events object, record which rooms had an event
  const roomNamesWithEvents = new Set();
  Object.entries(locationToNowAndNextEvents).forEach(
    ([location, { now, next }]) => {
      if (now.length === 0 && next.length === 0) return;
      roomNamesWithEvents.add(zoomRoomsByLocation[location].roomName);
    },
  );

  locationToNowAndNextEvents = {};
  Object.entries(locationToEvents).forEach(([location, events]) => {
    events.sort((a, b) => a.start - b.start);

    locationToNowAndNextEvents[location] = {
      now: [],
      next: [],
    };

    events.forEach((event) => {
      const { start } = event;

      if (start <= nowPlusCalendarDelay) {
        locationToNowAndNextEvents[location].now.push(event);
        roomNamesWithEvents.add(zoomRoomsByLocation[location].roomName);
      } else if (start <= soonish) {
        locationToNowAndNextEvents[location].next.push(event);
        roomNamesWithEvents.add(zoomRoomsByLocation[location].roomName);
      }
    });
  });

  roomNamesWithEvents.forEach((roomName) => {
    emitter.emit("room-change", "events", "changed for", roomName);
  });

  // This isn't necessary right now, but possible source of a confusing bug
  clearTimeout(timeoutIdForUpdateRoomsAsCalendarEventsChangeOverTime);
  timeoutIdForUpdateRoomsAsCalendarEventsChangeOverTime = setTimeout(
    updateRoomsAsCalendarEventsChangeOverTime,
    calendarUpdateDelay,
  );
}

app.post(
  `/checkIntoHub`,
  isSessionAuthenticatedMiddleware,
  hxBlockIfNotAuthenticated,
  getRcUserMiddleware,
  async (req, res) => {
    const { note } = req.body;
    const date = getTodayDateForHubVisitsAPI();
    await fetch(
      `https://www.recurse.com/api/v1/hub_visits/${req.locals.rcUserId}/${date}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${req.locals.access_token}`,
        },
        body: {
          notes: note,
        },
      },
    );
    res.sendStatus(200);
  },
);

app.get(
  "/personalization",
  isSessionAuthenticatedMiddleware,
  hxBlockIfNotAuthenticated,
  function (req, res) {
    const personalizations = getPersonalizationsFromReqCookies(req);

    res.send(
      Page({
        title: "RCVerse Personalizations",
        body: Personalization(
          mungePersonalization({
            personalizations,
            defaultPersonalizations: DEFAULT_PERSONALIZATIONS,
          }),
        ),
        mixpanelToken,
        myRcUserId: req.locals.rcUserId,
      }),
    );
  },
);

app.post(
  "/personalization",
  isSessionAuthenticatedMiddleware,
  hxBlockIfNotAuthenticated,
  function (req, res) {
    const {
      addUrl,
      removeUrl,
      url,
      index: indexString,
      moveItemUp,
      moveItemDown,
      reset,
      reallyReset,
      cache,
    } = req.body;
    let personalizations = getPersonalizationsFromReqCookies(req);
    const index = parseInt(indexString);

    if (Number.isInteger(index)) {
      personalizations[index].cache = cache === "on";
    }

    if (addUrl) {
      personalizations.push({ url: addUrl.trim(), cache: true });
    }

    if (removeUrl) {
      personalizations = personalizations.filter((p) => p.url !== url.trim());
    }

    if (moveItemUp) {
      const tmp = personalizations[index - 1];
      personalizations[index - 1] = personalizations[index];
      personalizations[index] = tmp;
    }

    if (moveItemDown) {
      const tmp = personalizations[index + 1];
      personalizations[index + 1] = personalizations[index];
      personalizations[index] = tmp;
    }

    if (reset && reallyReset === "confirm") {
      // Null isn't an array, resets to current defaults
      personalizations = null;
    }

    res.appendHeader(
      "Set-Cookie",
      new Cookie(personalizationsCookieName, JSON.stringify(personalizations), {
        maxAge: personalizationsCookieMaxAge,
      }).serialize(),
    );

    // Redirect instead of rendering the page again, Post-Redirect-Get
    // See https://en.wikipedia.org/wiki/Post/Redirect/Get
    res.redirect("/personalization");
  },
);

// Data mungers take the craziness of the internal data structures
// and make them peaceful and clean for the HTML generator
const mungeRootBody = ({ roomListContent, personalizations }) => {
  return {
    roomListContent,
    personalizations,
  };
};

const mungeRoomList = ({
  zoomRooms,
  roomNameToParticipantNames,
  participantNameToEntity,
  roomNameToNote,
  myParticipantName,
  inTheHubParticipantNames,
  sortRooms,
  locationToNowAndNextEvents,
}) => {
  const whoIsInTheHub = mungeWhoIsInTheHub({
    inTheHubParticipantNames,
    participantNameToEntity,
    myParticipantName,
  });
  const rooms = zoomRooms.map(({ roomName }) =>
    mungeRoom({
      roomName,
      roomLocation: zoomRoomsByName[roomName].location,
      roomNameToNote,
      roomNameToParticipantNames,
      participantNameToEntity,
      locationToNowAndNextEvents,
    }),
  );

  if (sortRooms) {
    const inAYear = new Date();
    inAYear.setTime(inAYear.getTime() + 1000 * 60 * 60 * 24 * 365);
    rooms.sort((a, b) => {
      // Primary sort by current or upcoming events
      // earlier events with smaller "start" value -> appears first
      // (note that this is the reverse of the above sort order)
      const aNowEventStart =
        locationToNowAndNextEvents[a.roomLocation]?.now?.[0]?.start;
      const aNextEventStart =
        locationToNowAndNextEvents[a.roomLocation]?.next?.[0]?.start;
      const bNowEventStart =
        locationToNowAndNextEvents[b.roomLocation]?.now?.[0]?.start;
      const bNextEventStart =
        locationToNowAndNextEvents[b.roomLocation]?.next?.[0]?.start;

      const comparison =
        (aNowEventStart ?? aNextEventStart ?? inAYear) -
        (bNowEventStart ?? bNextEventStart ?? inAYear);

      if (comparison !== 0) return comparison;

      // Secondary sort by participant count (more people -> appears first)
      return b.count - a.count;
    });
  }

  return {
    whoIsInTheHub,
    rooms,
  };
};

const mungeRoom = ({
  roomName,
  roomLocation,
  roomNameToNote,
  roomNameToParticipantNames,
  participantNameToEntity,
  locationToNowAndNextEvents,
}) => {
  return {
    roomName,
    roomLocation,
    hasNote: Boolean(roomNameToNote[roomName]),
    noteContent: roomNameToNote[roomName]?.content
      ? marked.parse(escapeHtml(roomNameToNote[roomName]?.content ?? ""))
      : "",
    noteDateTime: roomNameToNote[roomName]?.date?.toISOString() ?? null,
    noteHowManyMinutesAgo: howManyMinutesAgo(roomNameToNote[roomName]?.date),
    isEmpty: (roomNameToParticipantNames[roomName]?.length ?? 0) == 0,
    count: roomNameToParticipantNames[roomName]?.length || 0,
    countPhrase: countPhrase(roomNameToParticipantNames[roomName]?.length || 0),
    participants: mungeParticipants({
      participantNames: roomNameToParticipantNames[roomName] ?? [],
      participantNameToEntity,
    }),
    hasNowEvent: locationToNowAndNextEvents[roomLocation]?.now?.[0],
    nowEventName: locationToNowAndNextEvents[roomLocation]?.now?.[0]?.summary,
    nowEventStartedHowManyMinutesAgo: howManyMinutesAgo(
      locationToNowAndNextEvents[roomLocation]?.now?.[0]?.start,
    ),
    nowEventDateTime:
      locationToNowAndNextEvents[
        roomLocation
      ]?.now?.[0]?.start?.toISOString() ?? null,
    nowEventCalendarUrl:
      locationToNowAndNextEvents[roomLocation]?.now?.[0]?.url,
    hasNextEvent: locationToNowAndNextEvents[roomLocation]?.next?.[0],
    nextEventName: locationToNowAndNextEvents[roomLocation]?.next?.[0]?.summary,
    nextEventStartsInHowLong: howLongInTheFuture(
      locationToNowAndNextEvents[roomLocation]?.next?.[0]?.start,
    ),
    nextEventDateTime:
      locationToNowAndNextEvents[
        roomLocation
      ]?.next?.[0]?.start?.toISOString() ?? null,
    nextEventCalendarUrl:
      locationToNowAndNextEvents[roomLocation]?.next?.[0]?.url,
  };
};

const mungePersonalization = ({
  personalizations,
  defaultPersonalizations,
}) => ({
  personalizations,
  defaultPersonalizations,
});

const mungeParticipants = ({ participantNames, participantNameToEntity }) => {
  return (
    participantNames.map((participantName) => ({
      participantName,
      faceMarkerImagePath:
        participantNameToEntity[participantName]?.faceMarkerImagePath ??
        "recurse-community-bot.png",
      lastBatch: participantNameToEntity[participantName]?.lastBatch ?? "",
    })) ?? []
  );
};

const mungeWhoIsInTheHub = ({
  inTheHubParticipantNames,
  participantNameToEntity,
  myParticipantName,
}) => {
  return {
    isEmpty: inTheHubParticipantNames.length > 0,
    participants: mungeParticipants({
      participantNames: inTheHubParticipantNames,
      participantNameToEntity,
    }),
    iAmCheckedIn: participantNameToEntity[myParticipantName]?.inTheHub,
    countPhrase: countPhrase(inTheHubParticipantNames.length || 0),
  };
};

app.get("/logout", async (req, res) => {
  lucia.invalidateSession(req.locals.session?.id);

  res.redirect("/login");
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

  res.send("500");
});

app.use(function (req, res) {
  res.status(404);
  res.send("404");
});

const listener = app.listen(port, "::", () => {
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
//   interface Register {
//     Lucia: typeof lucia;
//   }
// }

const getTodayDateForHubVisitsAPI = () => {
  let date = new Date();
  date = date.toISOString();
  // Format date as `yyyy-mm-dd`
  const formatted = date.slice(0, date.indexOf("T"));

  console.log(
    `Hitting Hub Visits API with date ${date} formatted as ${formatted}`,
  );
  return formatted;
};

// Minutes in milliseconds
const MIN = 1000 * 60;
const howManyMinutesAgo = (date) => {
  if (!date) return null;
  return formatDistanceToNow(date, { addSuffix: true });
};

const howLongInTheFuture = (date) => {
  if (!date) return null;
  return formatDistanceToNow(date, { addSuffix: true });
};

const countPhrase = (count) => {
  return count === 0 ? "" : count === 1 ? "1 person" : `${count} people`;
};

const DEFAULT_PERSONALIZATIONS = [
  "/personalizations/hide-fouc.css",
  "/personalizations/recurse-com__font-awesome.css",
  "/personalizations/recurse-com__cherry-picked.css",
  "/personalizations/recurse-com__header.html",
  "/personalizations/icons.css",
  "/personalizations/rcverse-base-style.css",
  "/personalizations/register-service-worker.js",
  "/personalizations/confetti-once.html",
  "/personalizations/hannahs-colorful-rooms.css",
  "/personalizations/show-fouc.css",
].map((url) => {
  return { url, cache: true };
});

const getPersonalizationsFromReqCookies = (req) => {
  let parsed;
  try {
    const cookies = parseCookies(req.headers.cookie);
    const personalizationsCookie = cookies.get(personalizationsCookieName);
    parsed = JSON.parse(personalizationsCookie);
  } catch (error) {
    /* Do nothing - it's either an array set intentionally or we'll reset it */
  }
  if (!Array.isArray(parsed)) parsed = [...DEFAULT_PERSONALIZATIONS];

  // TODO: Temporarily transform from the old shape, an array of string URLs,
  //       into an array of objects. Can delete in some future time?
  return parsed.map((personalization) =>
    typeof personalization === "string"
      ? { url: personalization, cache: true }
      : personalization,
  );
};
