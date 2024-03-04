Following [Lucia Getting Started in Express tutorial](https://lucia-auth.com/getting-started/express)

Node >=20 required (or see notes about Oslo installation for Node <20 [here](https://oslo.js.org))

```sh
npm install;
```

Get your Client ID and Client Secret by going to https://recurse.com/settings/apps, and click 'Create OAuth Application'. Use `http://localhost:3001/myOauth2RedirectUri` as the Redirect URI.

```sh
node --env-file=config.env index.js
```
