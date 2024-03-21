/**
 * HTML component system with raw string templates.
 */

// Generic complete HTML page
export const Page = ({ body, title }) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="shortcut icon" type="image/png" href="favicon.ico" />
    <link rel="stylesheet" type="text/css" href="site.css" />
  </head>
  <body>
    ${body}

    <script src="https://unpkg.com/htmx.org@1.9.10" integrity="sha384-D1Kt99CQMDuVetoL1lrYwg5t+9QdHe7NLX/SoJYkXDFfX37iInKRy5xLSi8nO7UC" crossorigin="anonymous"></script>
    <script src="https://unpkg.com/htmx.org@1.9.11/dist/ext/ws.js"></script>
  </body>
</html>
`;

export const RootBody = ({
  authenticated,
  rooms,
  myCustomization,
  otherCustomizations,
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
${rooms.map(Room).join("\n")}
</dl>

<hl>

<h2>Custom code</h2>

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
}) => `
      <div id="room-update-${roomName.replaceAll(
        " ",
        "-",
      )}" class="display-contents">
        <div class="room ${isEmpty ? "room--non-empty" : ""}">
          <dt class="room__header">
            <span class="room__title">${roomName}</span> <a
                  href="${roomHref}"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Join</a
                >
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
}) => `
      <div id="customization-update-${String(rcUserId).replaceAll(
        " ",
        "-",
      )}" class="display-contents">
        <div class="customization ${isEmpty ? "customization--non-empty" : ""}">
          <dt class="customization__header">
            <span class="customization__title">${
              isMine
                ? `<strong>My Code (${rcPersonName})</strong>`
                : `${rcPersonName}'s Code`
            }</span>
          </dt>
          <dd class="customization__code">
            <div class="display-contents">
              <pre class="customization__code-preformatted">
                <code>${code}</code>
              </pre>
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
