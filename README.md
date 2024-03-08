# RCVerse Oauth

Forked from [Recurse OAuth example](https://github.com/reedspool/recurse-oauth-example-node-express)

Node >=20 required (or see notes about Oslo installation for Node <20 [here](https://oslo.js.org))

```sh
npm install;
```

To get your Client ID and Client Secret, go to <https://recurse.com/settings/apps>, and click 'Create OAuth Application'. Use `http://localhost:3001/myOauth2RedirectUri` as the Redirect URI.

Then make a copy of `config.env.template` named `config.env` and fill in the secrets there. For PostgreSQL, see the Neon section below.

```sh
node --env-file=config.env index.js
```

## Fly.io Deployment

`OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET` and `POSTGRES_CONNECTION` are set as Secrets inside the Fly App.

When you update those values, you'll need to run `fly deploy` to use the new versions.

## Neon deployment

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
