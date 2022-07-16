import tmi from 'tmi.js';
import { Spotify } from '../spotify/spotify';
import { Config } from '../utils/config';

// TODO: implement the actual logic (call spotify)

export class TwitchChat {

  // For all Spotify API calls
  private spotify: Spotify;
  private client: tmi.Client;

  constructor(spotify: Spotify, appConfig: Config, token: string) {
    this.spotify = spotify;
    this.client = new tmi.Client({
      connection: {
        secure: true,
        reconnect: true
      },
      identity: {
        username: appConfig.user_name,
        password: token
      },
      channels: [appConfig.channel_name]
    });


  }
}
