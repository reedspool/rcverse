/**
 * HTML component system with raw string templates.
 */
import { readFileSync } from "node:fs";

// A tagged template function to invoke Prettier's built-in formatting
// See https://prettier.io/blog/2020/08/24/2.1.0.html
const html = (...args) => String.raw(...args);

const snippets = {};
[
  "./html/mixpanel.snippet.html",
  "./html/recurse-com-header.snippet.html",
  "./html/about.snippet.html",
].forEach((path) => (snippets[path] = readFileSync(path)));

// Generic complete HTML page
export const Page = ({ body, title, mixpanelToken, myRcUserId }) => html`
  <!doctype html>
  <html lang="en">
    <head>
      <title>${title}</title>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="shortcut icon" type="image/png" href="favicon.ico" />
      <link rel="stylesheet" type="text/css" href="site.css" />
      <link rel="stylesheet" type="text/css" href="recurse-com.css" />
      ${
        ""
        /* Mixpanel insert from https://docs.mixpanel.com/docs/quickstart/connect-your-data?sdk=javascript */
        /* NOTE: Had to double escape forward slashes, i.e. replace "\/" with "\\/" */
      }
      ${snippets["./html/mixpanel.snippet.html"]}
      <script type="module">
        // import mixpanel from 'mixpanel-browser'; // This is a global from mixpanel script snippet
        mixpanel.init("${mixpanelToken}", {
          debug: true,
          track_pageview: true,
          persistence: "localStorage",
        });
        // Set this to a unique identifier for the user performing the event.
        const userId = "${myRcUserId || ""}";
        if (document.referrer.match("rctv.recurse.com")) {
          mixpanel.identify("rctv");
        } else if (userId) {
          mixpanel.identify(userId);
        } else {
          mixpanel.reset();
        }
      </script>
    </head>
    <body>
      <script
        src="https://unpkg.com/htmx.org@1.9.10"
        integrity="sha384-D1Kt99CQMDuVetoL1lrYwg5t+9QdHe7NLX/SoJYkXDFfX37iInKRy5xLSi8nO7UC"
        crossorigin="anonymous"
      ></script>
      <script src="https://unpkg.com/htmx.org@1.9.11/dist/ext/ws.js"></script>

      ${body}
    </body>
  </html>
`;

export const RootBody = ({
  rooms,
  myCustomization,
  otherCustomizations,
  noCustomizations,
  whoIsInTheHub,
}) => {
  // NOTE: This chunk is copied from the source of https://www.recurse.com/calendar
  //       Ostensibly that doesn't change very often, but you might want to check
  //       when it was last changed somehow.
  //       After copying, replaced all root relative links with absolute URLs
  //       via `s/href=\"\//href="https:\/\/www.recurse.com\//g`
  //       Also removed a few things in the menu specific to my user,
  //       which makes this more than a simple copy and paste job.
  // TODO: Next time I update this, I want to instead put it in
  //       a separate HTML file, then include it here verbatim and
  //       then filter and edit the content in JavaScript instead of
  //       manually. It will make future updates much simpler.
  let body = snippets["./html/recurse-com-header.snippet.html"];
  body += `<main hx-ext="ws" ws-connect="/websocket">`;
  body += html`<h1>RCVerse</h1>`;
  body += snippets["./html/about.snippet.html"];
  body += html`
    <dl class="room-list">
      ${WhoIsInTheHub(whoIsInTheHub)} ${rooms.map(Room).join("\n")}
    </dl>

    <hl>
      <h2>Custom HTML</h2>

      ${noCustomizations
        ? html`<p>
            Customizations disabled because of <code>?basic</code> query
            parameter
          </p>`
        : html`
            <p>
              Only you can edit your customization. Your code will immediately
              run for everyone, so <strong>be nice</strong>.
            </p>

            <p>
              Anyone can <strong>Pause</strong> anyone's customization.
              Customizations will be unpaused when they're updated.
            </p>

            <p>
              To view this page without any customizations active, add the query
              parameter <code>?basic</code> or <a href="/?basic">click here</a>.
            </p>

            <dl class="customization-list">
              ${myCustomization
                ? Customization(myCustomization)
                : html`
                    <div>
                      <button
                        hx-get="/editCustomization.html"
                        hx-swap="outerHTML"
                        hx-target="closest div"
                      >
                        Add your customization
                      </button>
                    </div>
                    <p style="border: 1px solid red; padding: 0.4em;">
                      <strong>Note</strong> After you hit Update you'll need to
                      refresh the page, just this first time (and hopefully I'll
                      fix this bug first)
                    </p>
                  `}
              ${otherCustomizations.length === 0
                ? ""
                : otherCustomizations.map(Customization).join("\n")}
            </dl>
          `}
      <hl>
        <p>You're logged in! - <a href="/logout">logout</a></p>
      </hl></hl
    >
  `;
  body += html`</main>`;

  return body;
};

export const Login = ({ reason } = { reason: "" }) => html`
  <main>
    <h1>RCVerse</h1>
    <h2>Whatever you make it</h2>
    ${reason === "deauthenticated"
      ? html`<p>
          RC Auth said you're not logged in. This might be temporary, so you
          might try to refresh and be logged in. Please let Reed know if this
          happens frequently.
        </p>`
      : ""}
    <p><a href="/getAuthorizationUrl">Login</a></p>
  </main>
`;

export const Room = ({
  roomLocation,
  roomName,
  isEmpty,
  participants,
  hasNote = false,
  noteContent,
  noteDateTime,
  noteHowManyMinutesAgo,
  countPhrase,
  hasNowEvent,
  nowEventName,
  nowEventStartedHowManyMinutesAgo,
  nowEventCalendarUrl,
  nowEventDateTime,
  hasNextEvent,
  nextEventName,
  nextEventStartsInHowLong,
  nextEventCalendarUrl,
  nextEventDateTime,
}) => html`
  <div
    id="room-update-${roomName.replaceAll(" ", "-")}"
    class="display-contents"
  >
    <div class="room ${isEmpty ? "room--non-empty" : ""}">
      <dt class="room__header">
        <span class="room__header-title">
          <span class="room__title">${roomName}</span>
          <a
            class="room__join"
            href="${roomLocation}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join
          </a>
        </span>
        <span class="room__count">${countPhrase}</span>
      </dt>
      <dd class="room__details">
        ${Participants({ participants })}
        ${hasNowEvent
          ? html`
              <div class="room__event-now">
                <a href="${nowEventCalendarUrl}" target="_blank"
                  >${nowEventName}</a
                >
                started
                <time
                  datetime="${nowEventDateTime}"
                  title="${nowEventDateTime} UTC"
                >
                  ${nowEventStartedHowManyMinutesAgo}
                </time>
              </div>
            `
          : ""}
        ${hasNextEvent
          ? html`
              <div class="room__event-next">
                <a href="${nextEventCalendarUrl}" target="_blank"
                  >${nextEventName}</a
                >
                starts
                <time
                  datetime="${nextEventDateTime}"
                  title="${nextEventDateTime} UTC"
                >
                  ${nextEventStartsInHowLong}
                </time>
              </div>
            `
          : ""}
        ${Note({
          roomName,
          hasNote,
          noteContent,
          noteDateTime,
          noteHowManyMinutesAgo,
        })}
      </dd>
    </div>
  </div>
`;

export const Note = ({
  roomName,
  hasNote,
  noteContent,
  noteDateTime,
  noteHowManyMinutesAgo,
}) => html`
  <div class="display-contents">
    <div class="room__note">${noteContent}</div>
    <span class="room__note-updates">
      <button
        class="room__note-edit-button"
        hx-get="/note.html?roomName=${roomName}"
        hx-swap="outerHTML"
        hx-target="closest div"
      >
        ${hasNote ? "Edit note" : "Add note"}
      </button>
      ${hasNote
        ? html`<span class="room__note-update-time" title="${noteDateTime} UTC">
            Updated
            <time datetime="${noteDateTime}"> ${noteHowManyMinutesAgo} </time>
          </span>`
        : ""}
    </span>
  </div>
`;

export const EditNoteForm = ({ roomName, noteContent }) => html`
  <form
    method="POST"
    action="/note"
    hx-post="/note"
    hx-swap="none"
    class="note-editor"
  >
    <input type="hidden" name="room" value="${roomName}" />
    <label class="note-editor__form-item">
      Note
      <textarea
        name="content"
        class="note-editor__text-input"
        cols="33"
        rows="5"
      >
${noteContent}</textarea
      >
    </label>
    <button type="submit">Update note</button>
  </form>
`;

export const Participants = ({ participants }) =>
  html`<div class="participants">
    ${participants.map((p) => Participant(p)).join("")}
  </div>`;

export const Participant = ({
  participantName,
  faceMarkerImagePath,
  lastBatch,
}) => html`
  <img
    class="participants__participant"
    src=${faceMarkerImagePath}
    title="${participantName} ${lastBatch}"
  />
`;

export const Customization = ({
  rcUserId,
  rcPersonName,
  code,
  isMine,
  isEmpty,
  isNew,
  isPaused,
}) => html`
  <div
    id="customization-update-${String(rcUserId)}"
    class="display-contents"
    hx-swap-oob="${isNew ? "afterbegin" : "true"}"
  >
    <div class="customization ${isEmpty ? "customization--non-empty" : ""}">
      <dt class="customization__header">
        <span class="customization__title"
          >${isMine
            ? html`<strong>My Code (${rcPersonName})</strong>`
            : html`${rcPersonName}'s Code`}</span
        >
      </dt>
      <dd class="customization__code">
        <div>
          ${isPaused
            ? html`<strong>Paused</strong>`
            : html`<button
                class="customization__pause-button"
                hx-post="/pauseCustomizationConfirmation.html?rcUserId=${rcUserId}"
                hx-swap="outerHTML"
              >
                Pause ${rcPersonName}'s customization
              </button>`}
        </div>
        <div class="display-contents">
          <pre
            class="customization__code-preformatted"
          ><code>${code}</code></pre>
          ${isMine
            ? html`<button
                hx-get="/editCustomization.html"
                hx-swap="outerHTML"
                hx-target="closest div"
              >
                Edit code
              </button>`
            : html``}
        </div>
      </dd>
    </div>
  </div>
`;

export const PauseCustomizationConfirmationButton = ({ rcUserId }) => html`
  <button
    class="customization__pause-button customization__pause-button--confirmation"
    hx-post="/pauseCustomization?rcUserId=${rcUserId}"
    hx-swap="none"
  >
    <em>Really</em> pause it for <strong>everyone</strong>!?
  </button>
`;

export const EditCustomizationCodeForm = ({ code }) => html`
  <form
    method="POST"
    action="/customization"
    hx-post="/customization"
    hx-swap="none"
    class="customization-editor"
  >
    <label class="customization-editor__form-item">
      Code
      <textarea
        name="code"
        class="customization-editor__text-input"
        cols="60"
        rows="20"
      >
${code}</textarea
      >
    </label>
    <button type="submit">Update</button>
  </form>
`;

export const WhoIsInTheHub = ({ isEmpty, participants, iAmCheckedIn }) => html`
  <div id="in-the-hub-update" class="display-contents">
    <div class="room ${isEmpty ? "room--non-empty" : ""}">
      <dt class="room__header">
        <span class="room__title">Who is in the hub?</span>

        ${iAmCheckedIn
          ? "(you are!)"
          : html`<button
              class="room__title-button"
              hx-post="/checkIntoHub"
              hx-swap="none"
            >
              Check in
            </button>`}
      </dt>
      <dd class="room__details">${Participants({ participants })}</dd>
    </div>
  </div>
`;

export const CheckIntoHubForm = () => html`
  <form
    method="POST"
    action="/checkIntoHub"
    hx-post="/checkIntoHub"
    hx-swap="none"
    class="customization-editor"
  >
    <label class="customization-editor__form-item">
      Note
      <textarea
        name="code"
        class="customization-editor__text-input"
        cols="60"
        rows="20"
      ></textarea>
    </label>
    <button type="submit">Check in</button>
  </form>
`;

// Stolen from NakedJSX https://github.com/NakedJSX/core
// Appears to be adapted from this SO answer https://stackoverflow.com/a/77873486
export const escapeHtml = (text) => {
  const htmlEscapeMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };

  return text.replace(/[&<>"']/g, (m) => htmlEscapeMap[m] ?? "");
};
