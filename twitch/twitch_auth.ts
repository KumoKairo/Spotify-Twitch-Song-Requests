// This file contains all of the authentication for Twitch

import { Config, parseConfig } from "../utils/config";
import { Express, Request, Response } from 'express';
import open from "open";


// Constants


// do not change these unless you know what you are doing
// CoreByte's app settings - used for implicit authorization flow
const CLIENT_ID_CHAT: string = "0mfa0l9csi6xed5540crxfl6qmnl4g";
const PORT = parseConfig("./spotipack_config.yaml").express_port;
const REDIRECT_URI_CHAT: string = `http://localhost:${PORT}/twitch_chat_callback.html`


export class TwitchAuthChat {
  private config: Config;
  private app: Express;
  private token: string = "";

  constructor(config: Config, app: Express) {
    this.config = config;
    this.app = app;

    // Internal callback from frontend.ts to get token

    // Evil hack to get token
    // TODO: save token to avoid relogging every time
    this.app.post('/internal/chat_callback', (req: Request, res: Response) => {
      this.token = req.body['data'].slice(14,44);
      console.log("Received post request. Token set to:");
      console.log(this.token);
      res.sendStatus(200);
    });
  }

  public authenticateUser() {
    // TODO: use url search params
    open(`https://id.twitch.tv/oauth2/authorize?response_type=token&client_id=${CLIENT_ID_CHAT}&redirect_uri=${REDIRECT_URI_CHAT}&scope=chat%3Aread+chat%3Aedit`);
  }

  public getToken() {
    if (this.token === "") {
      this.authenticateUser();
    }
    return this.token;
  }
}
