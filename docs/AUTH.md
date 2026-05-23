# Google OAuth setup (syncle-services)

Error **401: invalid_client** / **OAuth client was not found** means `GOOGLE_CLIENT_ID` in `.env` is wrong or still the example placeholder.

## Fix in 5 minutes

### 1. Google Cloud Console

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Pick a project (or create one)
3. **Create credentials** → **OAuth client ID**
4. Application type: **Web application** (not Chrome extension)
5. **Authorized redirect URIs** — add exactly:
   ```
   http://localhost:3001/auth/google/callback
   ```
6. Create → copy **Client ID** and **Client secret**

### 2. Update `syncle-services/.env`

Replace the example values (do not keep `your-client-id`):

```env
GOOGLE_CLIENT_ID=123456789-abcdefg.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxxxxxx
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3001/auth/google/callback
JWT_SECRET=any-long-random-string-you-make-up
```

Client ID must end with `.apps.googleusercontent.com`.

### 3. Restart the server

```bash
# free port if needed
kill $(lsof -t -i :3001) 2>/dev/null
cd syncle-services && npm run dev
```

Check:

```bash
curl http://localhost:3001/auth/status
# {"googleSignIn":true,"browserOAuth":true}
```

### 4. Reload the extension popup

`chrome://extensions` → Reload Syncle → open popup → **Sign in with Google**

## Common mistakes

| Mistake | Result |
|---------|--------|
| Left `your-client-id.apps.googleusercontent.com` in `.env` | invalid_client |
| Used **Chrome extension** client instead of **Web application** | invalid_client or redirect errors |
| Redirect URI mismatch | redirect_uri_mismatch |
| Forgot to restart server after editing `.env` | old empty config |
