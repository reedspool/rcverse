/**
 * HTML component system with raw string templates.
 */
import { readFileSync } from "node:fs";

// A tagged template function to invoke Prettier's built-in formatting
// See https://prettier.io/blog/2020/08/24/2.1.0.html
const html = (...args) => String.raw(...args);

const snippets = {};

const useSnippet = (path) => {
  let content = snippets[path];
  if (!content) {
    content = readFileSync(path);
    snippets[path] = content;
  }
  return content;
};

// Generic complete HTML page
export const Page = ({ body, title, mixpanelToken, myRcUserId }) => html`
  <!doctype html>
  <html lang="en">
    <head>
      <title>${title}</title>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <link rel="shortcut icon" type="image/png" href="favicon.ico" />
      <link rel="stylesheet" type="text/css" href="recurse-com.css" />
      ${
        ""
        /* Mixpanel insert from https://docs.mixpanel.com/docs/quickstart/connect-your-data?sdk=javascript */
        /* NOTE: Had to double escape forward slashes, i.e. replace "\/" with "\\/" */
      }
      ${useSnippet("./html/mixpanel.snippet.html")}
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
      ${useSnippet("./html/escape-html-htmx-extension.snippet.html")}
      <script src="https://unpkg.com/htmx.org@1.9.11/dist/ext/ws.js"></script>

      ${body}
    </body>
  </html>
`;

export const RootBody = ({ rooms, whoIsInTheHub, personalizations }) => {
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
  let body = "";
  body += useSnippet("./html/font-awesome.snippet.html");
  // TODO Clean up - entire recurse-com header can be a self-contained personalization
  body += useSnippet("./html/recurse-com-other-css.snippet.html");
  body += useSnippet("./html/recurse-com-header.snippet.html");
  body += `<main hx-ext="ws" ws-connect="/websocket">`;
  body += html`<h1>RCVerse</h1>`;
  body += useSnippet("./html/about.snippet.html");
  body += `<details>`;
  body += html`<summary>Personalizations</summary>`;

  body += html`<p>
    <a href="/personalization">Edit your personalizations here</a>
  </p>`;
  body += html`<p>
    Each personalization is applied and then repeated as escaped HTML in text
    form so you can see exactly what's going on.
  </p>`;
  body += `<ul>`;
  body += personalizations
    .map((url) => {
      const include = url.endsWith(".css")
        ? CSSInclude({ url })
        : url.endsWith(".html")
          ? HTMLInclude({ url })
          : url.endsWith(".js")
            ? JSInclude({ url })
            : "";

      return html`<li>
        <div>${escapeHtml(include)}</div>
        <div>${include}</div>

        <details>
          <summary>Code</summary>
          <pre class="personalization__code-preformatted"><code
            hx-get="${url}"
            hx-trigger="load"
            hx-swap="outerHTML"
            hx-ext="escape-html"
            class="display-contents"
            ></code></pre>
        </details>
      </li>`;
    })
    .join("\n");
  body += `</ul>`;
  // Send current list of personalizations to service worker to cache
  body += html`<script>
    top: {
      if (!("serviceWorker" in navigator)) {
        console.warning("Couldn't use serviceWorker");
        break top;
      }
      const payload = [
        "${personalizations.map(encodeURIComponent).join('","')}",
      ];
      navigator.serviceWorker.controller.postMessage({
        type: "update_personalizations",
        payload,
      });
      navigator.serviceWorker.onmessage = (event) => {
        console.log("Received onmessageEvent from service worker:", event);
      };
    }
  </script>`;
  body += `</details>`;
  body += html`
    <dl class="room-list">
      ${WhoIsInTheHub(whoIsInTheHub)} ${rooms.map(Room).join("\n")}
    </dl>

    <hl />
    <p>You're logged in! - <a href="/logout">logout</a></p>
  `;

  body += html`</main>`;

  return body;
};

export const JSInclude = ({ url }) => html`<script src="${url}"></script>`;
export const CSSInclude = ({ url }) =>
  html`<link rel="stylesheet" type="text/css" href="${url}" />`;
export const HTMLInclude = ({ url }) => html`
  <div hx-get="${url}" hx-trigger="load" class="display-contents"></div>
`;

// TODO: Could have an iframe preview of the homepage which htmx triggers to
//       refresh on every change, but for now can test by refreshing another tab
// TODO: Make a wiki page and link it here as a repository of nice
//       personalizations. Probably everything can be on the wiki and can just link to
//       the personalization page and the wiki page on the home page and get rid of the
//       other words therein
export const Personalization = ({
  personalizations,
  defaultPersonalizations,
}) => {
  return html`<main class="personalization">
    <link rel="stylesheet" type="text/css" href="personalizations.css" />
    <h1>RCVerse Personaliztions</h1>

    <p>
      Your personalizations are listed below. Personalizations aren't applied on
      this page so hopefully this page doesn't break. To test your changes, I
      recommend opening the
      <a href="/" target="_blank">homepage in another tab</a> and refreshing it
      after each change.
    </p>

    <a href="/">Back to RCVerse Home</a>

    <ol>
      ${personalizations
        .map((url, index) =>
          PersonalizationListItem({
            url,
            index,
            total: personalizations.length,
          }),
        )
        .join("\n")}
    </ol>

    <h2>Add personalization</h2>

    <p>
      You can find
      <a
        href="https://github.com/recursecenter/wiki/wiki/RCVerse#share-your-personalizations-here"
        target="_blank"
        >URLs of community-made personalizations in the wiki</a
      >.
    </p>

    <p>
      There's a lot more information about how the Personalization system works
      and how to make your own on
      <a
        href="https://github.com/recursecenter/wiki/wiki/RCVerse#personalizations"
        target="_blank"
        >the wiki page</a
      >.
    </p>

    <form method="POST" action="/personalization">
      <label>
        URL
        <input name="addUrl" value="" placeholder="https://..." />
      </label>
      <button type="submit">Add</button>

      <p>
        Security note: Make sure you trust this URL. Check out the contents
        yourself and ensure you believe it won't change.
      </p>
    </form>

    <h3>Reset</h3>

    <p>
      This will reset your personalizations to the current defaults. The current
      defaults are listed below so you could manually add what you're missing
      yourself instead of wiping everything out.
    </p>

    <ol>
      ${defaultPersonalizations.map((url) => html`<li>${url}</li>`).join("\n")}
    </ol>

    <p>
      To confirm and reset your personalizations, please type "confirm" in the
      text box. Then hit the button.
    </p>
    <form method="POST" action="/personalization">
      <input type="hidden" name="reset" value="true" />
      <input type="text" name="reallyReset" value="" placeholder="Really?" />
      <button type="submit">Reset all my personalizations</button>
    </form>
  </main> `;
};
export const PersonalizationListItem = ({ url, index, total }) => {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  return html`<li>
    ${url} - <a target="_blank" href="${url}">Visit</a>
    <form method="POST" action="/personalization">
      <input type="hidden" name="removeUrl" value="${url}" />
      <button type="submit">Remove</button>
    </form>
    ${isFirst
      ? ""
      : html`<form method="POST" action="/personalization">
          <input type="hidden" name="moveItemUp" value="${index}" />
          <button type="submit">Move up</button>
        </form>`}
    ${isLast
      ? ""
      : html`<form method="POST" action="/personalization">
          <input type="hidden" name="moveItemDown" value="${index}" />
          <button type="submit">Move down</button>
        </form>`}
  </li>`;
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
    <p><a hx-boost="false" href="/getAuthorizationUrl">Login</a></p>
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
  <section
    id="room-update-${roomName.replaceAll(" ", "-")}"
    class="display-contents"
  >
    <div class="room ${isEmpty ? "room--non-empty" : ""}">
      <dt class="room__header">
        <span class="room__header-title">
          <h2 class="room__title">${roomName}</h2>
        </span>
      </dt>
      <dd class="room__details">
        ${Participants({ participants, countPhrase })}

        <p>
          <a
            class="room__join"
            href="${roomLocation}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Join ${roomName}
          </a>
        </p>

        ${hasNowEvent
          ? html`
              <p class="room__event-now">
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
              </p>
            `
          : ""}
        ${hasNextEvent
          ? html`
              <p class="room__event-next">
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
              </p>
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
  </section>
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
    <fieldset>
      <legend>Note</legend>
      <textarea
        id="note-editor__text-input-${roomName}"
        name="content"
        class="note-editor__text-input"
        cols="33"
        rows="5"
      >
${noteContent}</textarea
      >
      <div>
        <button type="submit">Update note</button>
      </div>
    </fieldset>
  </form>
`;

export const Participants = ({ participants, countPhrase }) =>
  html`<div class="participants">
    <span class="participants__faces"
      >${participants.map((p) => Participant(p)).join("")}</span
    >
    ${countPhrase ? html`<span class="room__count">${countPhrase}</span>` : ""}
  </div>`;

export const Participant = ({
  participantName,
  faceMarkerImagePath,
  lastBatch,
}) => html`
  <img
    class="participants__face"
    src=${faceMarkerImagePath}
    title="${participantName} ${lastBatch}"
    style="width: 2em;"
  />
`;

export const WhoIsInTheHub = ({
  isEmpty,
  participants,
  iAmCheckedIn,
  countPhrase,
}) => html`
  <section id="in-the-hub-update" class="display-contents">
    <div class="room ${isEmpty ? "room--non-empty" : ""}">
      <dt class="room__header">
        <h2 class="room__title">Who is in the hub?</h2>
      </dt>
      <dd class="room__details">
        ${Participants({ participants, countPhrase })}
        <p>
          ${iAmCheckedIn
            ? "You are checked in"
            : html`<button
                class="room__title-button"
                hx-post="/checkIntoHub"
                hx-swap="none"
              >
                Check in
              </button>`}
        </p>
      </dd>
    </div>
  </section>
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
