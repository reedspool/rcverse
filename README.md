# RCVerse

Forked from [Recurse OAuth example](https://github.com/reedspool/recurse-oauth-example-node-express)

[RC Wiki page](https://github.com/recursecenter/wiki/wiki/RCVerse)

[Uses the RC API](https://github.com/recursecenter/wiki/wiki/Recurse-Center-API)

[Doesn't do calendar stuff like RSVP Bot](https://github.com/recursecenter/RSVPBot?tab=readme-ov-file#developing-without-api-access)

## Setup Your Local Development Environment

Node >=20 required (or see notes about Oslo installation for Node <20 [here](https://oslo.js.org))

```sh
npm install;
```

To get your Client ID and Client Secret, go to <https://recurse.com/settings/apps>, and click 'Create OAuth Application'. Use `http://localhost:3001/myOauth2RedirectUri` as the Redirect URI.

Then make a copy of `config.env.template` named `config.env` and fill in the secrets there. For PostgreSQL, see the Neon section below.

Once you've done the above steps, you can start your local dev environment.

## Run Local Development Environment

Once you've got all your local configuration done, including setting up and running a database, you should be able to run the development server with:

```sh
npm start
```

## Fly.io Deployment

`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` and `POSTGRES_CONNECTION` are set as Secrets inside the Fly App.

When you update those values, you'll need to run `fly deploy` to use the new versions.

## Neon deployment/PostgreSQL dev environment system

RCVerse production uses [Neon](https://neon.tech/) to host a PostgreSQL database. You don't need to use Neon, any PostgreSQL server should work.

If you want to use Neon, you'll need to sign up for a new account. Make a new database. Save the PostgreSQL connection string into the `config.env` variable `POSTGRES_CONNECTION` as well as in the Secrets section of your Fly App.

Create some tables. Run these queries separately in the Neon "SQL Editor":

```sql
CREATE TABLE auth_user (
    id TEXT PRIMARY KEY
)
```

and this one. Note it's different from the Lucia tutorial [here](https://lucia-auth.com/database/postgresql) in that it includes a `refresh_token` field:

```sql
CREATE TABLE user_session (
    id TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL,
    user_id TEXT NOT NULL REFERENCES auth_user(id),
    refresh_token TEXT
)
```


Then create a table and fill it with all the standard RC room information. This table should be write-only most of the time, since RC rooms rarely change. You can locate the values of the `note_block_rctogether_id` field by watching the websocket messages in RCTogether when you save an edit to a note block.

```sql
CREATE TABLE zoom_rooms (
    id serial PRIMARY KEY,
    room_name TEXT,
    location TEXT, /* Usually URL */
    note_block_rctogether_id TEXT, /* Associated note block ID in VirtualRC */
    visibility TEXT /* if not "visible", shouldn't appear in UI */
);

INSERT INTO zoom_rooms (room_name, location, note_block_rctogether_id, visibility)
VALUES
('Aegis','https://www.recurse.com/zoom/aegis', NULL, 'visible'),
('Arca','https://www.recurse.com/zoom/arca', NULL, 'visible'),
('Edos','https://www.recurse.com/zoom/edos', NULL, 'visible'),
('Genera','https://www.recurse.com/zoom/genera', NULL, 'visible'),
('Midori','https://www.recurse.com/zoom/midori', NULL, 'visible'),
('Verve','https://www.recurse.com/zoom/verve', NULL, 'visible'),
('Couches','https://www.recurse.com/zoom/couches', '81750', 'visible'),
('Kitchen','https://www.recurse.com/zoom/kitchen', NULL, 'visible'),
('Pairing Station 1','https://www.recurse.com/zoom/pairing_station_1', '152190', 'visible'),
('Pairing Station 2','https://www.recurse.com/zoom/pairing_station_2', '152189', 'visible'),
('Pairing Station 3','https://www.recurse.com/zoom/pairing_station_3', '152193', 'visible'),
('Pairing Station 4','https://www.recurse.com/zoom/pairing_station_4', '152191', 'visible'),
('Pairing Station 5','https://www.recurse.com/zoom/pairing_station_5', '140538', 'visible'),
('Pairing Station 6','https://recurse.rctogether.com/zoom_meetings/35980/join', '152198', 'visible'),
('Pairing Station 7','https://recurse.rctogether.com/zoom_meetings/35983/join', '152192', 'visible'),
('Pomodoro Room','https://www.recurse.com/zoom/pomodoro_room', NULL, 'visible'),
('Presentation Space','https://www.recurse.com/zoom/presentation_space', NULL, 'visible'),
('Faculty Area','https://www.recurse.com/zoom/faculty_area', NULL, 'visible'),
('Faculty Lounge','https://www.recurse.com/zoom/faculty_lounge', NULL, 'visible');
```

Above are all the visible rooms, but some rooms are "invisible" to RCVerse, like personal rooms of RC faculty. To add an invisible room, insert a new invisible row. The difference between simply leaving a room out and adding the invisible row to the database is that if there is no associated "invisible" row in the database, a log message will appear warning there's a "surprising" zoom room that's not tracked. You can ignore this though.

To edit the rooms on production RCVerse, please ask Reed. But here's an example addition of an invisible room:

```sql
INSERT INTO zoom_rooms (room_name, location, visibility)
VALUES
('Reed\'s Roomba Collection','https://www.recurse.com/zoom/reeds-roombas,'invisible');
```

## RCTogether API (ActionCable)

[The documentation for RCTogether's APIs lives here.](https://docs.rctogether.com/#introduction)

Go to https://recurse.rctogether.com/apps and make a new application, then plug in your App ID and App secret into `ACTION_CABLE_APP_ID` and `ACTION_CABLE_APP_SECRET` in your `config.env`.

## Recurse.com Calendar

The calendar integration downloads the iCalendar export (`.ics`) from the Recurse.com calendar application. Go to [recurse.com/settings/calendar](https://www.recurse.com/settings/calendar). In the `Subscription URL` field, you'll find a URL. That URL will have a query parameter called `token`. Paste the value of that token (everything _after_ `token=`, not including those characters) into the `RECURSE_CALENDAR_TOKEN` value in your `config.env`.

## Super Secret Auth Bypass Token

In `config.env.template` you will see `SPECIAL_SECRET_AUTH_TOKEN_DONT_SHARE`. This is used to bypass authentication for the special case where a kiosk like RCTV needs a hard-coded authentication instead of RC OAuth. This should only be used for local testing or in the case of a kiosk, it should never be stored in plain text or be visible to anyone in plain text. RCTV will hide this specific URL to hide this token. `crypto.randomUUID()` is a good way to make a new UUID for this purpose. Maybe prepend a signifier like `rctv-` to the UUID produced, so if it gets leaked you have some inkling where its from.

## Mixpanel

For web stats tracking, we're using Mixpanel. You'll need to get an application token for it and set the `MIXPANEL_TOKEN` env variable. I suggest not setting this token correctly in your local `config.env` file, and only setting it properly in the deployment, so you don't confuse local development tracking data with production data.
