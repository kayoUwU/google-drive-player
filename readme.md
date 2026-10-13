This project allow user to play their audio from Google Drive to browser by folder or playlist. The user can create custom playlist in browser and save to drive.

## [setup Google API](https://developers.google.com/workspace/drive/api/quickstart/nodejs)
This project rely on Google API to pick files

1. [Create a Google Cloud project](https://developers.google.com/workspace/guides/create-project)
2. [enable the Google Drive API and Google Picker API](https://developers.google.com/workspace/guides/enable-apis)
3. [configure the OAuth consent screen with information about your application auth/branding](https://developers.google.com/workspace/guides/configure-oauth-consent), create group for support email [groups.google.com](groups.google.com)
4. [client ID](https://developers.google.com/workspace/drive/api/quickstart/nodejs#authorize_credentials_for_a_desktop_application) and save the json file
- Authorized JavaScript origins,  Authorized redirect URIs: host address
5. Create an API key: In the Google Cloud console, go to Menu menu > APIs & Services > Credentials. Click Create credentials > API key.
- Application restrictions: website
- Website restrictions: host address

[api scope](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)

sample code
- [drive api](https://github.com/googleapis/google-api-nodejs-client/tree/main/samples/drive)
- [picker api](https://developers.google.com/workspace/drive/picker/guides/web-picker-sample)

## generate config.js
- setup API_KEY,CLIENT_ID,APP_ID to github secret

host/config.js
```js
const CONFIG = {
// Replace with your client ID and API key from https://console.cloud.google.com/.
API_KEY:"${{ secrets.API_KEY }}",
CLIENT_ID: "${{ secrets.CLIENT_ID }}",
// Replace with your project number from https://console.cloud.google.com/.
APP_ID:"${{ secrets.APP_ID }}",
};
```
