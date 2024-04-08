/**
 * HTML component system with raw string templates.
 */

// Generic complete HTML page
export const Page = ({ body, title, mixpanelToken, myRcUserId }) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="shortcut icon" type="image/png" href="favicon.ico" />
    <link rel="stylesheet" type="text/css" href="site.css" />
    ${
      ""
      /* Mixpanel insert from https://docs.mixpanel.com/docs/quickstart/connect-your-data?sdk=javascript */
      /* NOTE: Had to double escape forward slashes, i.e. replace "\/" with "\\/" */
    }
    <script type="text/javascript">
      (function (f, b) { if (!b.__SV) { var e, g, i, h; window.mixpanel = b; b._i = []; b.init = function (e, f, c) { function g(a, d) { var b = d.split("."); 2 == b.length && ((a = a[b[0]]), (d = b[1])); a[d] = function () { a.push([d].concat(Array.prototype.slice.call(arguments, 0))); }; } var a = b; "undefined" !== typeof c ? (a = b[c] = []) : (c = "mixpanel"); a.people = a.people || []; a.toString = function (a) { var d = "mixpanel"; "mixpanel" !== c && (d += "." + c); a || (d += " (stub)"); return d; }; a.people.toString = function () { return a.toString(1) + ".people (stub)"; }; i = "disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split( " "); for (h = 0; h < i.length; h++) g(a, i[h]); var j = "set set_once union unset remove delete".split(" "); a.get_group = function () { function b(c) { d[c] = function () { call2_args = arguments; call2 = [c].concat(Array.prototype.slice.call(call2_args, 0)); a.push([e, call2]); }; } for ( var d = {}, e = ["get_group"].concat( Array.prototype.slice.call(arguments, 0)), c = 0; c < j.length; c++) b(j[c]); return d; }; b._i.push([e, f, c]); }; b.__SV = 1.2; e = f.createElement("script"); e.type = "text/javascript"; e.async = !0; e.src = "undefined" !== typeof MIXPANEL_CUSTOM_LIB_URL ? MIXPANEL_CUSTOM_LIB_URL : "file:" === f.location.protocol && "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js".match(/^\\/\\//) ? "https://cdn.mxpnl.com/libs/mixpanel-2-latest.min.js" : "//cdn.mxpnl.com/libs/mixpanel-2-latest.min.js"; g = f.getElementsByTagName("script")[0]; g.parentNode.insertBefore(e, g); } })(document, window.mixpanel || []);
    </script>
    <script type="module">
      // import mixpanel from 'mixpanel-browser'; // This is a global from mixpanel script snippet
      mixpanel.init('${mixpanelToken}', {debug: true, track_pageview: true, persistence: 'localStorage'});
      // Set this to a unique identifier for the user performing the event.
      const userId = '${myRcUserId || ""}';
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
    <script src="https://unpkg.com/htmx.org@1.9.10" integrity="sha384-D1Kt99CQMDuVetoL1lrYwg5t+9QdHe7NLX/SoJYkXDFfX37iInKRy5xLSi8nO7UC" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/htmx.org@1.9.11/dist/ext/ws.js"></script>

    ${body}
  </body>
</html>
`;

export const RootBody = ({
  authenticated,
  rooms,
  myCustomization,
  otherCustomizations,
  noCustomizations,
  whoIsInTheHub,
}) => {
  let body = `<main  hx-ext="ws" ws-connect="/websocket">`;
  body += `<h1>RCVerse</h1>`;
  body += `<h2>Whatever you make it</h2>
  `;

  if (authenticated) {
    body += `
<details>
<summary>About</summary>

<p>RCVerse is a tool for all Recursers, in-batch and alum, remote and in-hub.</p>

<p>
We want to connect. We want tools to help connect us. We know how to build them. Let's build them!
</p>

<p>
The lofty, long term goal of RCVerse is to be open source, to be a website, to be a canvas
for the creativity of RCers, to be a practice ground for creative web development,
to be a space for trying out novel collaborative tools.
</p>

<p>
The more practical short-term goal for this site is to be the first place RCers
look when they sign on in the morning, to see what's going on, both virtually and
physically. To do this, we'll have to keep making it more useful over time, and
removing any friction which keeps it being as useful as it can be.
</p>

<p>
To throw your idea at the project, make a PR to
<a href="https://github.com/reedspool/rc-verse">the source code repository</a>.
Or you could slap your thoughts on the shared
 <a href="https://docs.google.com/document/d/1tLA_BjwM5k93WsMvNKT58kDb4Ksa9S6TFvGMAuK6Ldk/edit#heading=h.8rrvaio0w6r3">google doc</a>,
or message the
<a href="https://recurse.zulipchat.com/#narrow/stream/18926-help/topic/Reed's.20Impossible.20Day.3A.20Virtual.20RC.20meets.20MySpace">Zulip thread</a>,
or message Reed Spool (W2'24) directly.
</p>

<p>
The site is now open source! Check it out on <a href="https://github.com/reedspool/rc-verse">GitHub</a>.
</p>

</details>
<details>
<summary>Usage</summary>

<p>To view this page without any customizations active, add the query parameter
<code>?basic</code> or <a href="/?basic">click here</a>.</p>

<p>Normally, the rooms on the page are sorted in order of most participants to least.
To disable sorting and use a roughly alphebetical, stable room order, add the query parameter
<code>?sort=none</code> or <a href="/?sort=none">click here</a>.</p>

<p>To combine URL parameters, combine them in any order with a <code>&</code>
(ampersand) between them, and only one <code>?</code> (question mark) at the start.
E.g. <code>?basic&sort=none</code></p>
</details>
<details>
<summary>⚠ XSS vulnerability <strong>moved south</strong> for greener pastures!</summary>

<p>There's a new section in town, "Custom Code", at the bototm of the page.
All room notes are now properly HTML escaped.</p>

<p>This site has a XSS vulnerability. That means you can inject code which will
be run when other people load the page in their browser. Don't know what that
means? See if you can figure it out. Google's your friend. Ask other recursers.
Poke around.</p>

<p>You can inject CSS with a <code>style</code> tag or JavaScript with a
<code>script</code> tag.</p>

<p>Please be kind. Do not use blocking JS (like <code>alert</code>) or CSS which
makes the page (totally) unreadable. If you're writing a loop, maybe test that
out on a test HTML page first so that you don't crash this page for others.</p>

<p>Currently <a
href="https://recurse.zulipchat.com/#narrow/stream/18926-help/topic/Reed's.20Impossible.20Day.3A.20Virtual.20RC.20meets.20MySpace/near/426768844">
custom code is ephemeral</a>. Changes are likely to disappear any time. So if you make a
change you like, take a screenshot and post your code in the zulip thread! Later,
you or someone else can reapply the change.</p>

<p>Made something you think should be permanent? <a
href="https://github.com/reedspool/rc-verse">Make a PR!</a></p>
</details>

<dl class="room-list">
${WhoIsInTheHub(whoIsInTheHub)}
${rooms.map(Room).join("\n")}
</dl>

<hl>

<h2>Custom HTML</h2>

${
  noCustomizations
    ? `<p>Customizations disabled because of <code>?basic</code> query parameter</p>`
    : `
  <p>Only you can edit your customization. Your code will immediately run for everyone, so <strong>be nice</strong>.</p>

<p>Anyone can <strong>Pause</strong> anyone's customization. Customizations will be unpaused when they're updated.</p>

<p>To view this page without any customizations active, add the query parameter <code>?basic</code> or <a href="/?basic">click here</a>.</p>

<dl class="customization-list">
${
  myCustomization
    ? Customization(myCustomization)
    : `
    <div>
              <button
                hx-get="/editCustomization.html"
                hx-swap="outerHTML"
                hx-target="closest div"
              >Add your customization</button>
</div>
      <p style="border: 1px solid red; padding: 0.4em;">
      <strong>Note</strong> After you hit Update you'll need to
      refresh the page, just this first time (and hopefully I'll fix this bug first)
      </strong></p>
    `
}
${
  otherCustomizations.length === 0
    ? ""
    : otherCustomizations.map(Customization).join("\n")
}
</dl>
  `
}
<hl>

        <p>You\'re logged in! - <a href="/logout">logout</a></p>
    `;
  } else {
    body += `
      <p><a href="/getAuthorizationUrl">Login</a></p>
        `;
  }

  body += `</main>`;

  return body;
};

export const Room = ({
  roomHref,
  roomName,
  isEmpty,
  participants,
  note = "",
  count,
}) => `
      <div id="room-update-${roomName.replaceAll(
        " ",
        "-",
      )}" class="display-contents">
        <div class="room ${isEmpty ? "room--non-empty" : ""}">
          <dt class="room__header">
            <span class="room__title">${roomName}</span>
            <a
              href="${roomHref}"
              target="_blank"
              rel="noopener noreferrer"
              >
              Join
            </a>
            <span>(${isEmpty ? "empty" : `${count}`})</span>
          </dt>
          <dd class="room__details">
            ${Participants({ participants })}
            ${Note({ roomName, note })}
          </dd>
        </div>
      </div>
    `;

export const Note = ({ roomName, note }) =>
  `
<div class="display-contents">
  <div class="room__note">${note}</div>
  <button hx-get="/note.html?roomName=${roomName}" hx-swap="outerHTML" hx-target="closest div">${
    note ? "Edit note" : "Add note"
  }</button>
</div>
`;

export const EditNoteForm = ({ roomName, note }) =>
  `
      <form method="POST" action="/note" hx-post="/note" hx-swap="none" class="note-editor">
          <input type="hidden" name="room" value="${roomName}">
          <label class="note-editor__form-item">
              Note
              <textarea name="note" class="note-editor__text-input" cols="33" rows="5">${note}</textarea>
          </label>
          <button type="submit">Update note</button>
       </form>
`;

export const Participants = ({ participants }) =>
  `<div class="participants">${participants
    .map((p) => Participant(p))
    .join("")}</div>`;

export const Participant = ({ participantName, faceMarkerImagePath }) =>
  `
  <img
      class="participants__participant"
      src=${faceMarkerImagePath}
      title="${participantName}">
  `;

export const Customization = ({
  rcUserId,
  rcPersonName,
  code,
  isMine,
  isEmpty,
  isNew,
  isPaused,
}) => `
      <div id="customization-update-${String(rcUserId).replaceAll(
        " ",
        "-",
      )}" class="display-contents" hx-swap-oob="${
        isNew ? "afterbegin" : "true"
      }">
        <div class="customization ${isEmpty ? "customization--non-empty" : ""}">
          <dt class="customization__header">
            <span class="customization__title">${
              isMine
                ? `<strong>My Code (${rcPersonName})</strong>`
                : `${rcPersonName}'s Code`
            }</span>
          </dt>
          <dd class="customization__code">
            <div>
              ${
                isPaused
                  ? `<strong>Paused</strong>`
                  : `<button class="customization__pause-button" hx-post="/pauseCustomizationConfirmation.html?rcUserId=${rcUserId}" hx-swap="outerHTML">Pause ${rcPersonName}'s customization</button>`
              }
            </div>
            <div class="display-contents">
              <pre class="customization__code-preformatted"><code>${code}</code></pre>
              ${
                isMine
                  ? `<button
                       hx-get="/editCustomization.html"
                       hx-swap="outerHTML"
                       hx-target="closest div"
                     >Edit code</button>`
                  : ``
              }
            </div>
          </dd>
        </div>
      </div>
    `;

export const PauseCustomizationConfirmationButton = ({ rcUserId }) =>
  `
    <button class="customization__pause-button customization__pause-button--confirmation" hx-post="/pauseCustomization?rcUserId=${rcUserId}" hx-swap="none"><em>Really</em> pause it for <strong>everyone</strong>!?</button>
  `;

export const EditCustomizationCodeForm = ({ code }) =>
  `
      <form method="POST" action="/customization" hx-post="/customization" hx-swap="none" class="customization-editor">
          <label class="customization-editor__form-item">
              Code
              <textarea name="code" class="customization-editor__text-input" cols="60" rows="20">${code}</textarea>
          </label>
          <button type="submit">Update</button>
       </form>
`;

export const WhoIsInTheHub = ({ isEmpty, participants, iAmCheckedIn }) =>
  `
    <div id="in-the-hub-update" class="display-contents">
      <div class="room ${isEmpty ? "room--non-empty" : ""}">
        <dt class="room__header">
          <span class="room__title">Who is in the hub?</span>

          ${
            iAmCheckedIn
              ? "(you are!)"
              : `<button hx-post="/checkIntoHub" hx-swap="none">
                   Check in
                 </button>`
          }
        </dt>
        <dd class="room__details">
          ${Participants({ participants })}
        </dd>
      </div>
    </div>
  `;

export const CheckIntoHubForm = () =>
  `
    <form method="POST" action="/checkIntoHub" hx-post="/checkIntoHub" hx-swap="none" class="customization-editor">
        <label class="customization-editor__form-item">
            Note
            <textarea name="code" class="customization-editor__text-input" cols="60" rows="20"></textarea>
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
