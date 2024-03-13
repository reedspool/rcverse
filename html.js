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
    <style type="text/css" media="screen">
      p {
        max-width: 60ch;
      }

      button { cursor: pointer; }

      .participants {
        display: flex;
        flex-direction: row-reverse;
        flex-wrap: wrap;
        justify-content: flex-end;
        align-items: center;
      }

      .participants__participant {
        width: 2em;
        position: relative;
        aspect-ratio: 1;
        border-radius: 99999px;
        border: 4px solid forestgreen;
      }

      .participants__participant:not(:first-child) {
        margin-right: -0.8em;
      }

      .empty-room-memo {
        font-size: 0.8em;
        font-style: italic;
      }

      .room-list {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(65ch, 1fr));
        padding: 4rem 2rem;

        gap: 0.4em;
      }

      .room {
        min-height: 10em;
        padding: 0.4em;
      }

      .room:hover {
        background-color: rgba(0,0,0,0.1);
      }

      .room__title {
        font-size: 1.4em;
      }

      .room__details {
        padding-top: 0.6em;
      }

      .display-contents {
        display: contents;
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

export const RootBody = ({
  authenticated,
  zoomRooms,
  roomNameToParticipantPersonNames,
  participantPersonNamesToEntity,
  roomMessages,
}) => {
  let body = `<h1>RCVerse</h1>`;
  body += `
<h2>Whatever you make it</h2>
  `;

  if (authenticated) {
    body += `
<style>
summary {
  cursor: pointer;
}
</style>
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
          ${zoomRooms
            .map(
              ({ name, ...rest }) =>
                `<div sse-swap="room-update-${name}" class="display-contents">${Room(
                  {
                    name,
                    isEmpty: roomNameToParticipantPersonNames[name]?.length > 0,

                    Participants:
                      roomNameToParticipantPersonNames[name]?.length > 0
                        ? Participants({
                            participants: roomNameToParticipantPersonNames[
                              name
                            ].map((name) => ({
                              name,
                              src: participantPersonNamesToEntity[name]
                                .image_path,
                            })),
                          })
                        : ``,
                    notes: Notes({
                      name: name,
                      message: roomMessages[name] ?? "",
                    }),
                    ...rest,
                  },
                )}</div>`,
            )
            .join("")}
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
  href,
  name,
  isEmpty,
  Participants = "",
  notes = "",
}) => `
        <div class="room ${isEmpty ? "room--non-empty" : ""}">
          <dt>
            <span class="room__title">${name}</span> <a
                  href="${href}"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Join</a
                >
          </dt>
          <dd class="room__details">
            ${Participants}
            ${notes}
          </dd>
        </div>
    `;

export const Notes = ({ name, message }) => `
      <form method="POST" action="/note" hx-post="/note">
          <input type="hidden" name="room" value="${name}">
          <label>Notes
              <textarea name="notes" class="room__notes">${message}</textarea>
          </label>
          <button type="submit">Update</button>
       </form>
`;
export const Participants = ({ participants }) =>
  `<div class="participants">${participants
    .map((p) => Participant(p))
    .join("")}</div>`;

export const Participant = ({ name, src }) =>
  `
  <img
      class="participants__participant"
      src=${src}
      title="${name}">
  `;
