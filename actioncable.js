import ActionCable from "actioncable-nodejs/src/actioncable.js";

// TODO: I'm going to crash the server if I ever get a second world message
//       at this early stage of development because I really want tok now if that
//       ever happens. This can be a console log later
let hasSeenWorldData = false;
export function connect(APP_ID, APP_SECRET, zoomRoomUpdateCallback) {
  const uri = `wss://recurse.rctogether.com/cable?app_id=${APP_ID}&app_secret=${APP_SECRET}`;

  let cable = new ActionCable(uri, {
    origin: "https://example.rctogether.com",
  });

  return cable.subscribe("ApiChannel", {
    connected() {
      console.log("Connected to ActionCable RC Together Streaming API");
    },

    disconnected() {
      // TODO Implement reconnection and simply let the user know the data's out of date
      throw new Error("ActionCable RC Together API stream disconnected");
    },

    rejected() {
      throw new Error("ActionCable RC Together API stream unable to connect");
    },

    received({ type, payload }) {
      if (type === "world") {
        // Parse the initial dump of world data
        // console.log(JSON.stringify(payload, null, 2));
        if (hasSeenWorldData) throw new Error("Saw world data twice");
        hasSeenWorldData = true;
        payload.entities.forEach((entity) => {
          const {
            type,
            zoom_user_display_name,
            person_name,
            image_path,
            last_seen_at,
          } = entity;
          if (type === "Avatar" && zoom_user_display_name !== null) {
            const lastSeenMillis = new Date(last_seen_at).getTime();
            const millisSinceLastSeen = Date.now() - lastSeenMillis;
            const hourInMillis = 1000 * 60 * 60;
            // If we haven't been seen in one hour and 15 minutes
            // TODO: Contact James Porter to attempt to fix the bug where people
            //       remain in the zoom room forever
            // NOTE: For groups like Music Consumption Group, that hang in Zoom
            //       for many many hours, we DO want the long "since last seen"
            //       but for the bug where people stay in the channel forever, we don't
            //       Tricky tricky.
            if (millisSinceLastSeen > 5 * hourInMillis) return;

            zoomRoomUpdateCallback({
              participantName: person_name,
              roomName: zoom_user_display_name,
              faceMarkerImagePath: image_path,
            });
          }
        });
      } else if (type === "entity") {
        const { type, person_name, zoom_user_display_name, image_path } =
          payload;
        if (type !== "Avatar") return;

        zoomRoomUpdateCallback({
          participantName: person_name,
          roomName: zoom_user_display_name,
          faceMarkerImagePath: image_path,
        });
      }
    },
  });
}
