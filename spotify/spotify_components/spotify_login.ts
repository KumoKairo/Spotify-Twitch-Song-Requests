import axios from 'axios';
import express, { Express, Request, response, Response } from 'express';
import { parseConfig } from '../../utils/config';


// Constants

const SPOTIFY_AUTH_URL: string = 'https://accounts.spotify.com/authorize?';
const SPOTIFY_TOKEN_URL: string = 'https://accounts.spotify.com/api/token';

// TODO: make the config a global?
const PORT: number = parseConfig("./spotipack_config.yaml").express_port;

const SCOPES: string = 'user-modify-playback-state user-read-currently-playing';
const SPOTIFY_CLIENT_ID: string = process.env.SPOTIFY_CLIENT_ID!;
const SPOTIFY_CLIENT_SECRET: string = process.env.SPOTIFY_CLIENT_SECRET!;
const SPOTIFY_CALLBACK: string = '/spotify/spotify_callback';
const SPOTIFY_CALLBACK_URL: string = `http://localhost:${PORT}${SPOTIFY_CALLBACK}`



function authParams(): URLSearchParams {
  const authParams = new URLSearchParams();
  authParams.append('response_type', 'code');
  authParams.append('client_id', SPOTIFY_CLIENT_ID);
  authParams.append('redirect_uri', SPOTIFY_CALLBACK_URL);
  authParams.append('scope', SCOPES);
  return authParams;
}

function tokenParams(auth_code: string): FormData {
  const tokenParams = new FormData();
  // This is enforced by the Spotify API
  tokenParams.append('grant_type', 'authorization_code');
  tokenParams.append('code', auth_code);
  tokenParams.append('redirect_uri', SPOTIFY_CALLBACK_URL);
  return tokenParams;
}

function tokenHeaders(): {} {
  return {
    'Authorization': `Basic ${encodedSecret()}`,
    'Content-Type': 'application/x-www-form-urlencoded'
  };
}

function encodedSecret(): string {
  return Buffer.from(SPOTIFY_CLIENT_ID + ':' + SPOTIFY_CLIENT_SECRET).toString('base64');
}

export class SpotifyLogin {
  public app: Express;
  public spotify_access_token: string = '';
  public spotify_refresh_token: string = '';

  constructor(app: Express) {
    this.app = app;
    this.app.get(SPOTIFY_CALLBACK_URL, (req: Request, res: Response) => {
      const url = new URL(req.url, req.headers.host);
      let auth_code = url.searchParams.get('code');

      // TODO: Handle failure to authenticate
      if (auth_code === null) {
        console.log("Failed to authenticate with Spotify.");
        return;
      }

      // Get token
      // TODO: Save refresh and access tokens to file to avoid opening browser on startup.
      axios.post(SPOTIFY_TOKEN_URL, tokenParams(auth_code), tokenHeaders()).then(
        (response) => {
          this.spotify_access_token = response.data.access_token;
          this.spotify_refresh_token = response.data.refresh_token;
        }
      )

    });
  }

  private authorize() {
    open(SPOTIFY_AUTH_URL + authParams);
  }

  private getTokenFromAuthCode(auth_code: string) {

  }
}
