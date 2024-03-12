/**
 * HTML component system with raw string templates.
 */

// Generic complete HTML page
export const Page = ({ body, title }) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="shortcut icon" type="image/png" href="favicon.png" />
    <style type="text/css" media="screen">
      .face-marker {
        width: 2em;
        aspect-ratio: 1;
        border-radius: 99999px;
        border: 4px solid forestgreen;
        margin-left: -1.4em;
      }

      .empty-room-memo {
        font-size: 0.8em;
        font-style: italic;
      }

      .room-list {
        display: flex;
        flex-direction: column;
        gap: 0.4em;
      }

      .room:hover {
        background-color: rgba(0,0,0,0.1);
      }

      .room__participants {
        padding-top: 0.6em;
      }

      .room {
        padding: 0.4em;
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
}) => {
  let body = `<h1>RCVerse</h1>`;
  body += `<h2>Whatever you make it</h2>`;

  if (authenticated) {
    body += `
        <dl class="room-list" hx-ext="sse" sse-connect="/sse">
          ${zoomRooms
            .map(
              ({ name, ...rest }) =>
                `<div sse-swap="room-update-${name}">${Room({
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
                  ...rest,
                })}</div>`,
            )
            .join("")}

          <dt><a href="https://recurse.rctogether.com">Virtual RC</a></dt>
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

export const Room = ({ href, name, isEmpty, Participants = "" }) => `
        <div class="room ${isEmpty ? "room--non-empty" : ""}">
          <dt>
            ${name} - <a
                  href="${href}"
                  target="_blank"
                  rel="noopener noreferrer"
                  >Join</a
                >
          </dt>
          ${Participants}
        </div>
    `;

export const Participants = ({ participants }) =>
  `<dd class="room__participants">
     ${participants.map((p) => Participant(p)).join("&nbsp;")}
   </dd>`;

export const Participant = ({ name, src }) =>
  `
  <img
      class="face-marker"
      src=${src}
      title="${name}">
  `;
