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
  CheckIntoHubForm,
  Login,
  Personalization,
  escapeHtml,
} from "./html.js";
import expressWebsockets from "express-ws";
import ical from "node-ical";
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
    location: "https://www.recurse.com/zoom/aegis",
    roomName: "Aegis",
  },
  {
    location: "https://www.recurse.com/zoom/arca",
    roomName: "Arca",
  },
  {
    location: "https://www.recurse.com/zoom/edos",
    roomName: "Edos",
  },
  {
    location: "https://www.recurse.com/zoom/genera",
    roomName: "Genera",
  },
  {
    location: "https://www.recurse.com/zoom/midori",
    roomName: "Midori",
  },
  {
    location: "https://www.recurse.com/zoom/verve",
    roomName: "Verve",
  },
  {
    location: "https://www.recurse.com/zoom/couches",
    roomName: "Couches",
  },
  {
    location: "https://www.recurse.com/zoom/kitchen",
    roomName: "Kitchen",
  },
  {
    location: "https://www.recurse.com/zoom/pairing_station_1",
    roomName: "Pairing Station 1",
  },
  {
    location: "https://www.recurse.com/zoom/pairing_station_2",
    roomName: "Pairing Station 2",
  },
  {
    location: "https://www.recurse.com/zoom/pairing_station_3",
    roomName: "Pairing Station 3",
  },
  {
    location: "https://www.recurse.com/zoom/pairing_station_4",
    roomName: "Pairing Station 4",
  },
  {
    location: "https://www.recurse.com/zoom/pairing_station_5",
    roomName: "Pairing Station 5",
  },
  {
    location: "https://recurse.rctogether.com/zoom_meetings/35980/join",
    roomName: "Pairing Station 6",
  },
  {
    location: "https://recurse.rctogether.com/zoom_meetings/35983/join",
    roomName: "Pairing Station 7",
  },
  {
    location: "https://www.recurse.com/zoom/pomodoro_room",
    roomName: "Pomodoro Room",
  },
  {
    location: "https://www.recurse.com/zoom/presentation_space",
    roomName: "Presentation Space",
  },
  {
    location: "https://www.recurse.com/zoom/faculty_area",
    roomName: "Faculty Area",
  },
  {
    location: "https://www.recurse.com/zoom/faculty_lounge",
    roomName: "Faculty Lounge",
  },
];

const zoomRoomNames = zoomRooms.map(({ roomName }) => roomName);
const zoomRoomsByName = {};
zoomRooms.forEach(({ roomName, ...rest }) => {
  zoomRoomsByName[roomName] = { roomName, ...rest };
});
const zoomRoomsByLocation = {};
zoomRooms.forEach(({ location, ...rest }) => {
  zoomRoomsByLocation[location] = { location, ...rest };
});

// Zoom Rooms that are reported but that we purposely don't track
const silentZoomRooms = [
  "Sonali's Studio",
  "Sydney, Australia",
  "Nick's Nook",
  "Laura’s Office",
  "Cat Viewing Portal",
  "Adventure Time With Finn",
];

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

// Recurse.com Calendar
const recurseCalendarToken = process.env.RECURSE_CALENDAR_TOKEN;

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
  let { roomName, participantName, faceMarkerImagePath, inTheHub, lastBatch } =
    entity;

  if (roomName !== null && !zoomRoomNames.includes(roomName)) {
    if (!silentZoomRooms.includes(roomName)) {
      console.error(`Surprising zoom room name '${roomName}'`);
    }
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
    // console.log(`${participantName} ${hubStatusVerb} the hub`);
    participantNameToEntity[participantName] = {
      ...participantNameToEntity[participantName],
      inTheHub,
      lastBatch,
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
      lastBatch,
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
      lastBatch,
    };

    verb = "departed";
    roomName = previousRoomName;
  }

  // console.log(`${participantName} ${verb} ${roomName}`);
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

  const json = await fetchResponse.json();
  req.locals.rcPersonName = json.name;
  req.locals.rcUserId = String(json.id);
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
    let { basic, sort } = req.query;

    // `?basic` means the value of this would be empty string,
    // but that should trigger the effect
    const noCustomizations = typeof basic !== "undefined";

    // `?sort=none` uses the default ordering instead of sort by count
    const sortRooms = sort !== "none";

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

    const personalizations = getPersonalizationsFromReqCookies(req);

    res.send(
      Page({
        title: "RCVerse",
        body: RootBody(
          mungeRootBody({
            zoomRooms,
            roomNameToParticipantNames,
            participantNameToEntity,
            roomNameToNote,
            rcUserIdToCustomization,
            myRcUserId: req.locals.rcUserId,
            myParticipantName: req.locals.rcPersonName,
            noCustomizations,
            inTheHubParticipantNames,
            sortRooms,
            locationToNowAndNextEvents,
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
          myParticipantName: req.locals.rcPersonName,
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
app.post(
  "/note",
  isSessionAuthenticatedMiddleware,
  hxBlockIfNotAuthenticated,
  function (req, res) {
    const { room, content } = req.body;
    if (!content) {
      delete roomNameToNote[room];
    } else {
      roomNameToNote[room] = {
        content: escapeHtml(content) ?? "",
        date: new Date(),
      };
    }

    // console.log(`Room '${room}' note changed to ${content} (pre-escape)`);

    emitter.emit("room-change", "someone", "updated the note for", room);

    res.status(200).end();
  },
);

const mungeEditNoteForm = ({ roomName, roomNameToNote }) => ({
  roomName,
  noteContent: roomNameToNote[roomName]?.content ?? "",
});

app.get("/note.html", isSessionAuthenticatedMiddleware, function (req, res) {
  const { roomName } = req.query;

  res.send(EditNoteForm(mungeEditNoteForm({ roomName, roomNameToNote })));
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
cleanNotes();

// We only need to update from the remote rarely, since the calendar doesn't
// change quickly very often (people rarely cancel things last minute)
// But we want to update the "starts in 5 minutes" quotes very often throughout
// the day, so make two separate loops, one for refreshing from remote, and one
// for refreshing from the current information
// TODO: Could make a button from the front-end to trigger a refresh manually
let locationToNowAndNextEvents = {};
let iCalendar = {};
async function updateCalendarFromRemote() {
  iCalendar = await ical.async.fromURL(
    `https://www.recurse.com/calendar/events.ics?token=${recurseCalendarToken}&omit_cancelled_events=1&scope=all`,
  );
  updateRoomsAsCalendarEventsChangeOverTime();

  clearTimeout(timeoutIdForUpdateRoomsAsCalendarEventsChangeOverTime);
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
    const { location, start, end } = event;
    let keep = true;
    keep &&= event.type === "VEVENT";
    keep &&= location in zoomRoomsByLocation;
    keep &&= start >= yesterday; // Started less than 24 hours ago
    keep &&= end <= tomorrow; // Ends less than 24 hours from now
    keep &&= now <= end; // Hasn't ended yet
    if (!keep) return;

    if (!locationToEvents[location]) {
      locationToEvents[location] = [];
    }
    locationToEvents[location].push(event);
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

  timeoutIdForUpdateRoomsAsCalendarEventsChangeOverTime = setTimeout(
    updateRoomsAsCalendarEventsChangeOverTime,
    calendarUpdateDelay,
  );
}

// Currently unused, adds a text field to submit a note when you check in
app.get(
  "/checkIntoHub.html",
  isSessionAuthenticatedMiddleware,
  hxBlockIfNotAuthenticated,
  function (req, res) {
    res.send(CheckIntoHubForm());
  },
);

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

const rcUserIdToCustomization = {};
app.post(
  "/customization",
  isSessionAuthenticatedMiddleware,
  hxBlockIfNotAuthenticated,
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
  hxBlockIfNotAuthenticated,
  function (req, res) {
    const { rcUserId } = req.query;

    res.send(PauseCustomizationConfirmationButton({ rcUserId }));
  },
);

app.post(
  "/pauseCustomization",
  isSessionAuthenticatedMiddleware,
  hxBlockIfNotAuthenticated,
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
  hxBlockIfNotAuthenticated,
  getRcUserMiddleware,
  function (req, res) {
    const { code } = rcUserIdToCustomization[req.locals.rcUserId] ?? {
      code: "",
    };

    res.send(EditCustomizationCodeForm({ code }));
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
    const { addUrl, removeUrl, moveItemUp, moveItemDown, reset, reallyReset } =
      req.body;
    let personalizations = getPersonalizationsFromReqCookies(req);

    if (reset && reallyReset === "confirm") {
      personalizations = [...DEFAULT_PERSONALIZATIONS];
    }

    if (addUrl) {
      personalizations.push(addUrl.trim());
    }

    if (removeUrl) {
      personalizations = personalizations.filter(
        (currentUrl) => currentUrl !== removeUrl.trim(),
      );
    }

    if (moveItemUp) {
      const index = parseInt(moveItemUp);
      const tmp = personalizations[index - 1];
      personalizations[index - 1] = personalizations[index];
      personalizations[index] = tmp;
    }

    if (moveItemDown) {
      const index = parseInt(moveItemDown);
      const tmp = personalizations[index + 1];
      personalizations[index + 1] = personalizations[index];
      personalizations[index] = tmp;
    }

    res.appendHeader(
      "Set-Cookie",
      new Cookie(
        personalizationsCookieName,
        JSON.stringify(personalizations),
      ).serialize(),
    );

    // Redirect instead of rendering the page again, Post-Redirect-Get
    // See https://en.wikipedia.org/wiki/Post/Redirect/Get
    res.redirect("/personalization");
  },
);

// Data mungers take the craziness of the internal data structures
// and make them peaceful and clean for the HTML generator
const mungeRootBody = ({
  zoomRooms,
  roomNameToParticipantNames,
  participantNameToEntity,
  roomNameToNote,
  rcUserIdToCustomization,
  myRcUserId,
  myParticipantName,
  noCustomizations,
  inTheHubParticipantNames,
  sortRooms,
  locationToNowAndNextEvents,
  personalizations,
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
    whoIsInTheHub,
    rooms,
    otherCustomizations,
    myCustomization,
    noCustomizations,
    myRcUserId,
    personalizations,
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
    noteContent: roomNameToNote[roomName]?.content ?? "",
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
//   interface Register {
//     Lucia: typeof lucia;
//   }
// }

const getTodayDateForHubVisitsAPI = () => {
  let date = new Date();
  date = date.toISOString();
  // Format date as `yyyy-mm-dd`
  return date.slice(0, date.indexOf("T"));
};

// Minutes in milliseconds
const MIN = 1000 * 60;
const howManyMinutesAgo = (date) => {
  if (!date) return null;
  const millisNow = Date.now();
  const millisThen = date.getTime();
  const difference = millisNow - millisThen;
  return difference < 0
    ? "in the future?" // ???
    : difference < 2 * MIN
      ? "just now"
      : difference < 5 * MIN
        ? "a few minutes ago"
        : difference < 10 * MIN
          ? "five-ish minutes ago"
          : difference < 20 * MIN
            ? "15 minutes ago"
            : difference < 30 * MIN
              ? "recently"
              : difference < 45 * MIN
                ? "a half hour ago"
                : difference < 60 * MIN
                  ? "45 min ago"
                  : difference < 80 * MIN
                    ? "over an hour ago"
                    : "a while ago";
};

const howLongInTheFuture = (date) => {
  if (!date) return null;
  const millisNow = Date.now();
  const millisThen = date.getTime();
  const difference = millisThen - millisNow;
  return difference < 0
    ? "in the past?" // ???
    : difference < 2 * MIN
      ? "now"
      : difference < 5 * MIN
        ? "in a few minutes"
        : difference < 10 * MIN
          ? "in five-ish minutes"
          : difference < 20 * MIN
            ? "in 15 minutes"
            : difference < 30 * MIN
              ? "in 20 minutes"
              : difference < 45 * MIN
                ? "in a half hour"
                : difference < 60 * MIN
                  ? "in 45 min"
                  : difference < 80 * MIN
                    ? "in just over an hour"
                    : "in quite a while";
};

const countPhrase = (count) => {
  return count === 0 ? "" : count === 1 ? "1 person" : `${count} people`;
};

const DEFAULT_PERSONALIZATIONS = [
  "/personalizations/rcverse-base-style.css",
  "/personalizations/rainbow-gradient-animated.css",
  "/personalizations/rainbowify-participant-borders.js",
  "/personalizations/confetti-once.html",
  "/personalizations/register-service-worker.js",
];
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
  return parsed;
};
