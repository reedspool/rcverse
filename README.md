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

## Neon deployment

Technically you can use any PostgreSQL database, not just Neon, but this project is using Neon.

Sign up for a new account with Neon. Make a new database. Save the PostgreSQL connection string into the `config.env` variable `POSTGRES_CONNECTION` as well as in the Secrets section of your Fly App.

Create two tables. Run these two queries separately in the Neon "SQL Editor":

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

## RCTogether API (ActionCable)

Go to https://recurse.rctogether.com/apps and make a new application, then plug in your App ID and App secret into `ACTION_CABLE_APP_ID` and `ACTION_CABLE_APP_SECRET` in your `config.env`.

## Recurse.com Calendar

The calendar integration downloads the iCalendar export (`.ics`) from the Recurse.com calendar application. Go to [recurse.com/settings/calendar](https://www.recurse.com/settings/calendar). In the `Subscription URL` field, you'll find a URL. That URL will have a query parameter called `token`. Paste the value of that token (everything _after_ `token=`, not including those characters) into the `RECURSE_CALENDAR_TOKEN` value in your `config.env`.

## Super Secret Auth Bypass Token

In `config.env.template` you will see `SPECIAL_SECRET_AUTH_TOKEN_DONT_SHARE`. This is used to bypass authentication for the special case where a kiosk like RCTV needs a hard-coded authentication instead of RC OAuth. This should only be used for local testing or in the case of a kiosk, it should never be stored in plain text or be visible to anyone in plain text. RCTV will hide this specific URL to hide this token. `crypto.randomUUID()` is a good way to make a new UUID for this purpose. Maybe prepend a signifier like `rctv-` to the UUID produced, so if it gets leaked you have some inkling where its from.

## Mixpanel

For web stats tracking, we're using Mixpanel. You'll need to get an application token for it and set the `MIXPANEL_TOKEN` env variable. I suggest not setting this token correctly in your local `config.env` file, and only setting it properly in the deployment, so you don't confuse local development tracking data with production data.
