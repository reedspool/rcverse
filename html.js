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
    <script src="https://unpkg.com/htmx.org/dist/ext/sse.js"></script>
  </body>
</html>
`;

export const RootBody = ({ authenticated, rooms }) => {
  let body = `<h1>RCVerse</h1>`;
  body += `
<h2>Whatever you make it</h2>
  `;

  if (authenticated) {
    body += `
<details>
<summary>About</summary>

<p>RCVerse is a tool for all Recursers, in-batch and alum, remote and in-hub.</p>

<p>
We want to connect. We want tools to help connect us. We know how to build them. Let's do it!
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
To throw your idea at the project, slap it on the shared
<a href="https://docs.google.com/document/d/1tLA_BjwM5k93WsMvNKT58kDb4Ksa9S6TFvGMAuK6Ldk/edit#heading=h.8rrvaio0w6r3">google doc</a>,
or message the
<a href="https://recurse.zulipchat.com/#narrow/stream/18926-help/topic/Reed's.20Impossible.20Day.3A.20Virtual.20RC.20meets.20MySpace">Zulip thread</a>,
or message Reed Spool (W2'24) directly.
</p>

<p>
Please message Reed Spool (W2'24) with your GitHub username to gain access to the
<a href="https://github.com/reedspool/rc-verse">source code repository</a>.
Do not hesitate, even if you don't want to contribute <em>now</em>,
<strong>request now anyways</strong>.
The repo is currently private out of fear for leaking Recurser information.
Eventually we hope to make it open to everyone in the RC GitHub community.
</p>

</details>
        <dl class="room-list" hx-ext="sse" sse-connect="/sse">
          ${rooms.map(Room).join("\n")}
        </dl>

        <p>You\'re logged in! - <a href="/logout">logout</a></p>
    `;
  } else {
    body += `
      <p><a href="/getAuthorizationUrl">Login</a></p>
        `;
  }

  return body;
};

export const Room = ({
  roomHref,
  roomName,
  isEmpty,
  participants,
  note = "",
}) => `
    <div sse-swap="room-update-${roomName}" hx-swap="outerHTML" class="display-contents">
        <div class="room ${isEmpty ? "room--non-empty" : ""}">
          <dt>
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

export const Note = ({ roomName, note }) => NoteDisplay({ roomName, note });

export const NoteDisplay = ({ roomName, note }) =>
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
      <form method="POST" action="/note" hx-post="/note" hx-swap="none">
          <input type="hidden" name="room" value="${roomName}">
          <label>Note
              <textarea name="note" class="room__edit-note">${note}</textarea>
          </label>
          <button type="submit">Update</button>
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
