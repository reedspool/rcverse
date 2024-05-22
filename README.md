# RCVerse Oauth

Forked from [Recurse OAuth example](https://github.com/reedspool/recurse-oauth-example-node-express)

Node >=20 required (or see notes about Oslo installation for Node <20 [here](https://oslo.js.org))

```sh
npm install;
```

To get your Client ID and Client Secret, go to <https://recurse.com/settings/apps>, and click 'Create OAuth Application'. Use `http://localhost:3001/myOauth2RedirectUri` as the Redirect URI.

Then make a copy of `config.env.template` named `config.env` and fill in the secrets there. For PostgreSQL, see the Neon section below.

Once you've done the above steps run the server locally with `npm start`.

## Fly.io Deployment

`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` and `POSTGRES_CONNECTION` are set as Secrets inside the Fly App.

When you update those values, you'll need to run `fly deploy` to use the new versions.

## Neon deployment/PostGreSQL dev environment system

Technically you can use any PostgreSQL database, not just Neon, but this project is using Neon.

Sign up for a new account with Neon. Make a new database. Save the PostgreSQL connection string into the `config.env` variable `POSTGRES_CONNECTION` as well as in the Secrets section of your Fly App.

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

Then create a table and fill it with all the standard RC room information.

```sql
CREATE TABLE zoom_rooms (
    id serial PRIMARY KEY,
    room_name TEXT,
    location TEXT, /* Usually URL */
    visibility TEXT /* if not "visible", shouldn't appear in UI */
);

INSERT INTO zoom_rooms (room_name, location, visibility)
VALUES
('Aegis','https://www.recurse.com/zoom/aegis','visible'),
('Arca','https://www.recurse.com/zoom/arca','visible'),
('Edos','https://www.recurse.com/zoom/edos','visible'),
('Genera','https://www.recurse.com/zoom/genera','visible'),
('Midori','https://www.recurse.com/zoom/midori','visible'),
('Verve','https://www.recurse.com/zoom/verve','visible'),
('Couches','https://www.recurse.com/zoom/couches','visible'),
('Kitchen','https://www.recurse.com/zoom/kitchen','visible'),
('Pairing Station 1','https://www.recurse.com/zoom/pairing_station_1','visible'),
('Pairing Station 2','https://www.recurse.com/zoom/pairing_station_2','visible'),
('Pairing Station 3','https://www.recurse.com/zoom/pairing_station_3','visible'),
('Pairing Station 4','https://www.recurse.com/zoom/pairing_station_4','visible'),
('Pairing Station 5','https://www.recurse.com/zoom/pairing_station_5','visible'),
('Pairing Station 6','https://recurse.rctogether.com/zoom_meetings/35980/join','visible'),
('Pairing Station 7','https://recurse.rctogether.com/zoom_meetings/35983/join','visible'),
('Pomodoro Room','https://www.recurse.com/zoom/pomodoro_room','visible'),
('Presentation Space','https://www.recurse.com/zoom/presentation_space','visible'),
('Faculty Area','https://www.recurse.com/zoom/faculty_area','visible'),
('Faculty Lounge','https://www.recurse.com/zoom/faculty_lounge','visible');
```

This table is meant mostly to be write-only mostly, but RC does change the rooms sometimes. To fill this table, please ask Reed. Mostly, it's not kept in this table since it may have personally identifying information in it.

To add an invisible room (because maybe the name has PIID), insert a new invisible row. The only effect right now of invisible rooms is to squash a log message that "a surprising room showed up":

```sql
INSERT INTO zoom_rooms (room_name, location, visibility)
VALUES
('Reed\'s Roomba Collection','https://www.recurse.com/zoom/reeds-roombas,'invisible');
```

## RCTogether API (ActionCable)

Go to https://recurse.rctogether.com/apps and make a new application, then plug in your App ID and App secret into `ACTION_CABLE_APP_ID` and `ACTION_CABLE_APP_SECRET` in your `config.env`.

## Recurse.com Calendar

The calendar integration downloads the iCalendar export (`.ics`) from the Recurse.com calendar application. Go to [recurse.com/settings/calendar](https://www.recurse.com/settings/calendar). In the `Subscription URL` field, you'll find a URL. That URL will have a query parameter called `token`. Paste the value of that token (everything _after_ `token=`, not including those characters) into the `RECURSE_CALENDAR_TOKEN` value in your `config.env`.

## Super Secret Auth Bypass Token

In `config.env.template` you will see `SPECIAL_SECRET_AUTH_TOKEN_DONT_SHARE`. This is used to bypass authentication for the special case where a kiosk like RCTV needs a hard-coded authentication instead of RC OAuth. This should only be used for local testing or in the case of a kiosk, it should never be stored in plain text or be visible to anyone in plain text. RCTV will hide this specific URL to hide this token. `crypto.randomUUID()` is a good way to make a new UUID for this purpose. Maybe prepend a signifier like `rctv-` to the UUID produced, so if it gets leaked you have some inkling where its from.

## Mixpanel

For web stats tracking, we're using Mixpanel. You'll need to get an application token for it and set the `MIXPANEL_TOKEN` env variable. I suggest not setting this token correctly in your local `config.env` file, and only setting it properly in the deployment, so you don't confuse local development tracking data with production data.
