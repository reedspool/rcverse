# RCVerse Oauth

Following [Lucia Getting Started in Express tutorial](https://lucia-auth.com/getting-started/express)

Node >=20 required (or see notes about Oslo installation for Node <20 [here](https://oslo.js.org))

```sh
npm install;
```

Get your Client ID and Client Secret by going to <https://recurse.com/settings/apps>, and click 'Create OAuth Application'. Use `http://localhost:3001/myOauth2RedirectUri` as the Redirect URI.

```sh
node --env-file=config.env index.js
```

## Fly.io Deployment

`OAUTH_CLIENT_ID` & `OAUTH_CLIENT_SECRET` are set as Secrets inside the Fly App.

Everytime those are changed on the web dashboard, please run `fly deploy` in order to use the updated secret values.
